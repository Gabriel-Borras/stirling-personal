import { describe, expect, it } from "vitest";
import { QuickTextStore } from "@editor/tools/quickText/QuickTextStore";
import {
  DEFAULT_FONT_SIZE_PT,
  FONT_SIZE_STEP_PT,
  MAX_FONT_SIZE_PT,
  MIN_FONT_SIZE_PT,
} from "@editor/tools/quickText/types";

describe("QuickTextStore", () => {
  it("adds, edits, formats, and deletes boxes with undo/redo", () => {
    const store = new QuickTextStore();
    const box = store.addBox(0, 0.25, 0.4);

    expect(store.getSnapshot().boxes).toHaveLength(1);
    expect(store.getSnapshot().activeBoxId).toBe(box.id);
    expect(store.getSnapshot().dirty).toBe(false);

    store.updateText(box.id, "Hola mundo");
    expect(store.getSnapshot().dirty).toBe(true);

    store.increaseFontSize(box.id);
    expect(store.getSnapshot().boxes[0].fontSizePt).toBe(
      DEFAULT_FONT_SIZE_PT + FONT_SIZE_STEP_PT,
    );

    store.toggleBold(box.id);
    store.toggleItalic(box.id);
    store.toggleUnderline(box.id);
    store.setColor(box.id, "blue");

    const formatted = store.getSnapshot().boxes[0];
    expect(formatted.bold).toBe(true);
    expect(formatted.italic).toBe(true);
    expect(formatted.underline).toBe(true);
    expect(formatted.color).toBe("blue");

    // Newly added boxes inherit the last chosen formatting defaults.
    const second = store.addBox(1, 0.5, 0.5);
    expect(second.fontSizePt).toBe(DEFAULT_FONT_SIZE_PT + FONT_SIZE_STEP_PT);
    expect(second.bold).toBe(true);
    expect(second.italic).toBe(true);
    expect(second.underline).toBe(true);
    expect(second.color).toBe("blue");

    // Deselecting an empty box prunes it automatically.
    store.selectBox(null);
    expect(store.getSnapshot().boxes).toHaveLength(1);

    // Delete + undo restores the box.
    store.deleteBox(box.id);
    expect(store.getSnapshot().boxes).toHaveLength(0);
    expect(store.getSnapshot().canUndo).toBe(true);

    store.undo();
    expect(store.getSnapshot().boxes).toHaveLength(1);
    expect(store.getSnapshot().canRedo).toBe(true);

    store.redo();
    expect(store.getSnapshot().boxes).toHaveLength(0);
  });

  it("clamps font size between min and max bounds", () => {
    const store = new QuickTextStore();
    const box = store.addBox(0, 0.1, 0.1);
    store.updateText(box.id, "Test");

    for (let i = 0; i < 50; i += 1) {
      store.decreaseFontSize(box.id);
    }
    expect(store.getSnapshot().boxes[0].fontSizePt).toBe(MIN_FONT_SIZE_PT);

    for (let i = 0; i < 60; i += 1) {
      store.increaseFontSize(box.id);
    }
    expect(store.getSnapshot().boxes[0].fontSizePt).toBe(MAX_FONT_SIZE_PT);
  });
});
