import type { PDFFont, StandardFonts } from "@cantoo/pdf-lib";
import {
  getQuickTextColorOption,
  type PageDimensionsPt,
  type QuickTextBox,
} from "@editor/tools/quickText/types";

const LINE_HEIGHT_MULTIPLIER = 1.25;
const UNDERLINE_OFFSET_RATIO = 0.14;
const UNDERLINE_THICKNESS_RATIO = 0.065;
const MIN_UNDERLINE_THICKNESS = 0.75;

type FontVariantKey = "regular" | "bold" | "italic" | "boldItalic";

function getFontVariantKey(
  box: Pick<QuickTextBox, "bold" | "italic">,
): FontVariantKey {
  if (box.bold && box.italic) return "boldItalic";
  if (box.bold) return "bold";
  if (box.italic) return "italic";
  return "regular";
}

function sanitizeForFont(text: string, font: PDFFont): string {
  try {
    font.encodeText(text);
    return text;
  } catch {
    // Standard PDF Helvetica uses WinAnsi; replace unsupported glyphs so save never fails.
    let safe = "";
    for (const char of text) {
      try {
        font.encodeText(char);
        safe += char;
      } catch {
        safe += "?";
      }
    }
    return safe;
  }
}

function normalizeRotationAngle(angle: number): 0 | 90 | 180 | 270 {
  const normalized = (((Math.round(angle / 90) * 90) % 360) + 360) % 360;
  if (normalized === 90 || normalized === 180 || normalized === 270) {
    return normalized;
  }
  return 0;
}

/**
 * Maps a point `(displayX, displayYFromTop)` in upright display points back
 * into raw PDF crop-box coordinates for the page's `/Rotate` angle.
 */
function displayPointToPdf(
  cropBox: { x: number; y: number; width: number; height: number },
  rotation: 0 | 90 | 180 | 270,
  displayX: number,
  displayYFromTop: number,
): { x: number; y: number } {
  switch (rotation) {
    case 90:
      return {
        x: cropBox.x + displayYFromTop,
        y: cropBox.y + displayX,
      };
    case 180:
      return {
        x: cropBox.x + cropBox.width - displayX,
        y: cropBox.y + displayYFromTop,
      };
    case 270:
      return {
        x: cropBox.x + cropBox.width - displayYFromTop,
        y: cropBox.y + cropBox.height - displayX,
      };
    default:
      return {
        x: cropBox.x + displayX,
        y: cropBox.y + cropBox.height - displayYFromTop,
      };
  }
}

/**
 * Reads each page's point dimensions and `/Rotate` angle from a PDF so the
 * inline overlay maps PDF point font sizes and orientation 1:1.
 */
export async function readPdfPageDimensions(
  pdfBytes: Uint8Array,
): Promise<PageDimensionsPt[]> {
  const { PDFDocument } = await import("@cantoo/pdf-lib");
  const doc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  return doc.getPages().map((page) => {
    const box = page.getCropBox();
    return {
      width: box.width,
      height: box.height,
      rotation: normalizeRotationAngle(page.getRotation().angle),
    };
  });
}

/**
 * Draws all non-empty Quick Text boxes into the given PDF bytes, preserving
 * position, font size, bold/italic weight, underline, page rotation, and color.
 */
export async function embedQuickTextIntoPdf(
  pdfBytes: Uint8Array,
  boxes: readonly QuickTextBox[],
): Promise<Uint8Array> {
  const nonEmpty = boxes.filter((b) => b.text.trim().length > 0);
  if (nonEmpty.length === 0) {
    return pdfBytes;
  }

  const {
    PDFDocument,
    StandardFonts: PdfStandardFonts,
    degrees,
    rgb,
  } = await import("@cantoo/pdf-lib");
  const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  const pages = pdfDoc.getPages();

  const fontMap: Record<FontVariantKey, StandardFonts> = {
    regular: PdfStandardFonts.Helvetica,
    bold: PdfStandardFonts.HelveticaBold,
    italic: PdfStandardFonts.HelveticaOblique,
    boldItalic: PdfStandardFonts.HelveticaBoldOblique,
  };
  const embeddedFonts = new Map<FontVariantKey, PDFFont>();

  const getFont = async (key: FontVariantKey): Promise<PDFFont> => {
    const existing = embeddedFonts.get(key);
    if (existing) return existing;
    const embedded = await pdfDoc.embedFont(fontMap[key]);
    embeddedFonts.set(key, embedded);
    return embedded;
  };

  for (const box of nonEmpty) {
    const page = pages[box.pageIndex];
    if (!page) continue;

    const cropBox = page.getCropBox();
    const rotation = normalizeRotationAngle(page.getRotation().angle);
    const sideways = rotation === 90 || rotation === 270;
    const displayWidth = sideways ? cropBox.height : cropBox.width;
    const displayHeight = sideways ? cropBox.width : cropBox.height;

    const font = await getFont(getFontVariantKey(box));
    const colorOption = getQuickTextColorOption(box.color);
    const pdfColor = rgb(
      colorOption.rgb[0],
      colorOption.rgb[1],
      colorOption.rgb[2],
    );

    const fontSize = box.fontSizePt;
    const lineHeight = fontSize * LINE_HEIGHT_MULTIPLIER;
    const lines = box.text.replace(/\r\n/g, "\n").split("\n");

    const displayX = box.xRatio * displayWidth;
    const displayTopY = box.yRatio * displayHeight;
    const ascentOffset = fontSize * 0.85;

    for (let i = 0; i < lines.length; i += 1) {
      const rawLine = lines[i];
      if (!rawLine) continue;
      const line = sanitizeForFont(rawLine, font);
      const baselineFromTop = displayTopY + ascentOffset + i * lineHeight;
      const origin = displayPointToPdf(
        cropBox,
        rotation,
        displayX,
        baselineFromTop,
      );

      page.drawText(line, {
        x: origin.x,
        y: origin.y,
        size: fontSize,
        font,
        color: pdfColor,
        ...(rotation !== 0 ? { rotate: degrees(rotation) } : {}),
      });

      if (box.underline) {
        const lineWidth = font.widthOfTextAtSize(line, fontSize);
        const underlineFromTop =
          baselineFromTop + fontSize * UNDERLINE_OFFSET_RATIO;
        const start = displayPointToPdf(
          cropBox,
          rotation,
          displayX,
          underlineFromTop,
        );
        const end = displayPointToPdf(
          cropBox,
          rotation,
          displayX + lineWidth,
          underlineFromTop,
        );
        page.drawLine({
          start,
          end,
          thickness: Math.max(
            MIN_UNDERLINE_THICKNESS,
            fontSize * UNDERLINE_THICKNESS_RATIO,
          ),
          color: pdfColor,
        });
      }
    }
  }

  return pdfDoc.save();
}
