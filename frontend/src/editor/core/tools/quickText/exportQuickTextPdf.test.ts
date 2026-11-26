import { describe, expect, it } from "vitest";
import { degrees, PDFDocument } from "@cantoo/pdf-lib";
import {
  embedQuickTextIntoPdf,
  readPdfPageDimensions,
} from "@editor/tools/quickText/exportQuickTextPdf";
import type { QuickTextBox } from "@editor/tools/quickText/types";

async function createBlankPdf(pageCount = 2): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pageCount; i += 1) {
    doc.addPage([600, 800]);
  }
  return doc.save();
}

describe("exportQuickTextPdf", () => {
  it("reads page dimensions and rotation accurately", async () => {
    const bytes = await createBlankPdf(2);
    const dims = await readPdfPageDimensions(bytes);
    expect(dims).toEqual([
      { width: 600, height: 800, rotation: 0 },
      { width: 600, height: 800, rotation: 0 },
    ]);
  });

  it("embeds formatted text boxes onto rotated pages", async () => {
    const doc = await PDFDocument.create();
    for (const angle of [90, 180, 270]) {
      const page = doc.addPage([600, 800]);
      page.setRotation(degrees(angle));
    }
    const source = await doc.save();
    const dims = await readPdfPageDimensions(source);
    expect(dims.map((d) => d.rotation)).toEqual([90, 180, 270]);

    const outBytes = await embedQuickTextIntoPdf(source, [
      {
        id: "r90",
        pageIndex: 0,
        xRatio: 0.25,
        yRatio: 0.25,
        text: "Rotated 90",
        fontSizePt: 14,
        bold: false,
        italic: false,
        underline: true,
        color: "black",
      },
      {
        id: "r180",
        pageIndex: 1,
        xRatio: 0.3,
        yRatio: 0.4,
        text: "Rotated 180",
        fontSizePt: 12,
        bold: true,
        italic: false,
        underline: false,
        color: "blue",
      },
      {
        id: "r270",
        pageIndex: 2,
        xRatio: 0.5,
        yRatio: 0.5,
        text: "Rotated 270",
        fontSizePt: 16,
        bold: false,
        italic: true,
        underline: true,
        color: "red",
      },
    ]);
    const parsed = await PDFDocument.load(outBytes);
    expect(parsed.getPageCount()).toBe(3);
    expect(outBytes.byteLength).toBeGreaterThan(source.byteLength);
  });

  it("embeds formatted text boxes across pages into valid PDF bytes", async () => {
    const source = await createBlankPdf(2);
    const boxes: QuickTextBox[] = [
      {
        id: "b1",
        pageIndex: 0,
        xRatio: 0.2,
        yRatio: 0.3,
        text: "Hola, España!\nSegunda línea",
        fontSizePt: 16,
        bold: true,
        italic: false,
        underline: true,
        color: "blue",
      },
      {
        id: "b2",
        pageIndex: 1,
        xRatio: 0.4,
        yRatio: 0.5,
        text: "Italic red note",
        fontSizePt: 12,
        bold: false,
        italic: true,
        underline: false,
        color: "red",
      },
      {
        id: "b3",
        pageIndex: 0,
        xRatio: 0.1,
        yRatio: 0.1,
        text: "   ",
        fontSizePt: 14,
        bold: false,
        italic: false,
        underline: false,
        color: "black",
      },
    ];

    const outBytes = await embedQuickTextIntoPdf(source, boxes);
    expect(outBytes.byteLength).toBeGreaterThan(source.byteLength);

    const parsed = await PDFDocument.load(outBytes);
    expect(parsed.getPageCount()).toBe(2);
  });

  it("returns original bytes when all boxes are empty", async () => {
    const source = await createBlankPdf(1);
    const outBytes = await embedQuickTextIntoPdf(source, [
      {
        id: "empty",
        pageIndex: 0,
        xRatio: 0.1,
        yRatio: 0.1,
        text: "",
        fontSizePt: 14,
        bold: false,
        italic: false,
        underline: false,
        color: "black",
      },
    ]);
    expect(outBytes).toBe(source);
  });
});
