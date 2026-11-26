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

/**
 * Reads each page's point dimensions from a PDF so the inline overlay can map
 * PDF point font sizes 1:1 onto zoomed CSS pixels.
 */
export async function readPdfPageDimensions(
  pdfBytes: Uint8Array,
): Promise<PageDimensionsPt[]> {
  const { PDFDocument } = await import("@cantoo/pdf-lib");
  const doc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  return doc.getPages().map((page) => {
    const box = page.getCropBox();
    return { width: box.width, height: box.height };
  });
}

/**
 * Draws all non-empty Quick Text boxes into the given PDF bytes, preserving
 * position, font size, bold/italic weight, underline, and text color.
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

    const x = cropBox.x + box.xRatio * cropBox.width;
    // PDF y=0 is at the bottom of the page; place the first baseline one ascent below the box top.
    const topY = cropBox.y + cropBox.height - box.yRatio * cropBox.height;
    const ascentOffset = fontSize * 0.85;

    for (let i = 0; i < lines.length; i += 1) {
      const rawLine = lines[i];
      if (!rawLine) continue;
      const line = sanitizeForFont(rawLine, font);
      const baselineY = topY - ascentOffset - i * lineHeight;

      page.drawText(line, {
        x,
        y: baselineY,
        size: fontSize,
        font,
        color: pdfColor,
      });

      if (box.underline) {
        const lineWidth = font.widthOfTextAtSize(line, fontSize);
        const underlineY = baselineY - fontSize * UNDERLINE_OFFSET_RATIO;
        page.drawLine({
          start: { x, y: underlineY },
          end: { x: x + lineWidth, y: underlineY },
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
