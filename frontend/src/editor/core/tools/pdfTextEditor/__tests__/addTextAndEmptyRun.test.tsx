import { MantineProvider } from "@mantine/core";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { InsertTextCommand } from "@editor/tools/pdfTextEditor/commands/InsertTextCommand";
import { DeleteObjectCommand } from "@editor/tools/pdfTextEditor/commands/DeleteObjectCommand";
import { EditorStore } from "@editor/tools/pdfTextEditor/store/EditorStore";
import { Page } from "@editor/tools/pdfTextEditor/model/Page";
import { DisplayTransform } from "@editor/tools/pdfTextEditor/model/DisplayTransform";
import { TextRunOverlay } from "@editor/tools/pdfTextEditor/components/TextRunOverlay";
import { paintLines } from "@editor/tools/pdfTextEditor/util/overlayPainter";
import type { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";
import type { TextRunSnapshot } from "@editor/tools/pdfTextEditor/types";

vi.mock(
  "@editor/tools/pdfTextEditor/util/textMetrics",
  async (importOriginal) => ({
    ...(await importOriginal<object>()),
    measureFontMetrics: () => ({ ascent: 9, descent: 3 }),
    measureMaxLineWidth: (text: string) =>
      Math.max(0, ...text.split(/\r?\n/).map((l) => l.length)) * 6,
    measureAdvancePx: (text: string) => text.length * 6,
    measureLongestTokenWidth: (text: string) =>
      Math.max(0, ...text.split(/\s+/).map((w) => w.length)) * 6,
  }),
);

function fakeDoc(page: Page): EditorDocument {
  return {
    docPtr: 1,
    pageCount: 1,
    page: () => page,
    loadedPages: () => [page],
    onArtifactKinds: () => () => {},
    documentLanguage: () => null,
    languagesInUse: () => [],
    dispose: () => {},
    module: {
      FPDFPage_RemoveObject: vi.fn(),
      FPDFPage_InsertObject: vi.fn(),
    },
  } as unknown as EditorDocument;
}

describe("pdfTextEditor empty add-text and deletion fixes", () => {
  it("InsertTextCommand supports empty text without stamping placeholder glyphs and reverts cleanly", () => {
    const page = new Page({ index: 0, pagePtr: 10, width: 600, height: 800 });
    const doc = fakeDoc(page);

    const cmd = new InsertTextCommand({
      pageIndex: 0,
      x: 100,
      y: 500,
      text: "",
    });
    cmd.apply(doc);

    expect(page.runs).toHaveLength(1);
    expect(page.runs[0].text).toBe("");
    expect(page.runs[0].pdfiumObjPtr).toBe(0);
    expect(page.runs[0].bounds.width).toBeGreaterThanOrEqual(100);

    cmd.revert(doc);
    expect(page.runs).toHaveLength(0);
  });

  it("discardEmptyInsert drops an untouched empty box without leaving undo/redo or dirty state", async () => {
    const page = new Page({ index: 0, pagePtr: 10, width: 600, height: 800 });
    const doc = fakeDoc(page);
    const store = new EditorStore();
    await store.setDocument(doc);

    const cmd = new InsertTextCommand({
      pageIndex: 0,
      x: 100,
      y: 500,
      text: "",
    });
    store.dispatch(cmd);
    const runId = cmd.insertedRunId!;
    store.selection.selectOne(runId);
    expect(page.runs).toHaveLength(1);
    expect(store.getState().dirty).toBe(true);

    expect(store.discardEmptyInsert(0, runId)).toBe(true);
    expect(page.runs).toHaveLength(0);
    expect(store.selection.value.runIds).toEqual([]);
    expect(store.history.canUndo).toBe(false);
    expect(store.history.canRedo).toBe(false);
    expect(store.getState().dirty).toBe(false);
  });

  it("DeleteObjectCommand.revert restores an empty run that has no PDFium objects", () => {
    const page = new Page({ index: 0, pagePtr: 10, width: 600, height: 800 });
    const doc = fakeDoc(page);
    const insert = new InsertTextCommand({
      pageIndex: 0,
      x: 100,
      y: 500,
      text: "",
    });
    insert.apply(doc);
    const runId = insert.insertedRunId!;

    const del = new DeleteObjectCommand({ pageIndex: 0, runId });
    del.apply(doc);
    expect(page.runs).toHaveLength(0);

    del.revert(doc);
    expect(page.runs).toHaveLength(1);
    expect(page.runs[0].id).toBe(runId);
  });

  it("TextRunOverlay renders CSS placeholder for empty run and discards it on blur or Backspace", () => {
    const onDiscardEmpty = vi.fn();
    const emptyRun: TextRunSnapshot = {
      id: "p0-new-0-0",
      pageIndex: 0,
      bounds: { x: 40, y: 700, width: 120, height: 14.4 },
      matrix: { a: 1, b: 0, c: 0, d: 1, e: 40, f: 700 },
      text: "",
      fontId: "base14:Helvetica",
      fontSize: 12,
      fill: { r: 0, g: 0, b: 0, a: 255 },
      fontSubset: false,
    };

    render(
      <MantineProvider env="test">
        <TextRunOverlay
          run={emptyRun}
          pageHeight={792}
          pageWidth={612}
          transform={DisplayTransform.identity(612, 792)}
          scale={1}
          widthMode="wrap"
          selected={true}
          onSelect={() => {}}
          onEdit={() => {}}
          onDiscardEmpty={onDiscardEmpty}
        />
      </MantineProvider>,
    );

    const box = screen.getByTestId("pdf-editor-run-p0-new-0-0");
    expect(box.classList.contains("is-empty")).toBe(true);
    expect(box.dataset.placeholder).toBeTruthy();
    expect(parseFloat(box.style.width)).toBeGreaterThanOrEqual(240);

    fireEvent.focus(box);
    fireEvent.keyDown(box, { key: "Backspace" });
    expect(onDiscardEmpty).toHaveBeenCalledTimes(1);
  });

  it("paintLines keeps zero-advance trailing spaces uncollapsed so the caret stays past the space", () => {
    const el = document.createElement("div");
    paintLines(
      el,
      [
        {
          tokens: [
            { text: "Hola", advancePx: 24 },
            { text: " ", advancePx: 0 },
          ],
          heightPx: 14,
          marginTopPx: 0,
          marginLeftPx: 0,
        },
      ],
      { font: "12px Helvetica", fontSizePx: 12 },
    );

    const spans = el.querySelectorAll<HTMLSpanElement>(
      "[data-pdf-editor-token]",
    );
    expect(spans).toHaveLength(2);
    expect(spans[1].textContent).toBe(" ");
    expect(spans[1].style.marginRight).toBe("");
    expect(spans[1].style.letterSpacing).toBe("");
  });
});
