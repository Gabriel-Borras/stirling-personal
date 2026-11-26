import { useSyncExternalStore } from "react";
import { generateId } from "@editor/utils/generateId";
import {
  DEFAULT_FONT_SIZE_PT,
  FONT_SIZE_STEP_PT,
  MAX_FONT_SIZE_PT,
  MIN_FONT_SIZE_PT,
  type PageDimensionsPt,
  type QuickTextBox,
  type QuickTextColorId,
  type QuickTextDefaults,
} from "@editor/tools/quickText/types";

export interface QuickTextSnapshot {
  boxes: readonly QuickTextBox[];
  activeBoxId: string | null;
  defaults: QuickTextDefaults;
  pageSizes: readonly PageDimensionsPt[];
  canUndo: boolean;
  canRedo: boolean;
  dirty: boolean;
  saving: boolean;
  error: string | null;
}

type Listener = () => void;

const MAX_HISTORY = 50;
const TEXT_UNDO_COALESCE_MS = 600;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function cloneBoxes(boxes: readonly QuickTextBox[]): QuickTextBox[] {
  return boxes.map((box) => ({ ...box }));
}

function boxesEqual(
  a: readonly QuickTextBox[],
  b: readonly QuickTextBox[],
): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    const x = a[i];
    const y = b[i];
    if (
      x.id !== y.id ||
      x.pageIndex !== y.pageIndex ||
      x.xRatio !== y.xRatio ||
      x.yRatio !== y.yRatio ||
      x.text !== y.text ||
      x.fontSizePt !== y.fontSizePt ||
      x.bold !== y.bold ||
      x.italic !== y.italic ||
      x.underline !== y.underline ||
      x.color !== y.color
    ) {
      return false;
    }
  }
  return true;
}

/**
 * Reactive store for inline Quick Text boxes, formatting defaults, undo/redo
 * history, and save state. Consumed by both the tool panel and the viewer
 * page overlay via `useSyncExternalStore`.
 */
export class QuickTextStore {
  private boxes: QuickTextBox[] = [];
  private activeBoxId: string | null = null;
  private defaults: QuickTextDefaults = {
    fontSizePt: DEFAULT_FONT_SIZE_PT,
    bold: false,
    italic: false,
    underline: false,
    color: "black",
  };
  private pageSizes: PageDimensionsPt[] = [];
  private undoStack: QuickTextBox[][] = [];
  private redoStack: QuickTextBox[][] = [];
  private lastEditKey: string | null = null;
  private lastEditAt = 0;
  private saving = false;
  private error: string | null = null;
  private listeners = new Set<Listener>();
  private snapshot: QuickTextSnapshot;

  constructor() {
    this.snapshot = this.buildSnapshot();
  }

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): QuickTextSnapshot => this.snapshot;

  setPageSizes(sizes: PageDimensionsPt[]): void {
    this.pageSizes = sizes;
    this.emit();
  }

  setSaving(saving: boolean): void {
    if (this.saving === saving) return;
    this.saving = saving;
    this.emit();
  }

  setError(error: string | null): void {
    if (this.error === error) return;
    this.error = error;
    this.emit();
  }

  addBox(pageIndex: number, xRatio: number, yRatio: number): QuickTextBox {
    this.pruneEmptyBoxes();
    this.pushUndo();
    const box: QuickTextBox = {
      id: generateId(),
      pageIndex,
      xRatio: clamp(xRatio, 0, 0.96),
      yRatio: clamp(yRatio, 0, 0.96),
      text: "",
      fontSizePt: this.defaults.fontSizePt,
      bold: this.defaults.bold,
      italic: this.defaults.italic,
      underline: this.defaults.underline,
      color: this.defaults.color,
    };
    this.boxes = [...this.boxes, box];
    this.activeBoxId = box.id;
    // Coalesce initial typing right after box creation into the same undo step.
    this.lastEditKey = `text:${box.id}`;
    this.lastEditAt = Date.now();
    this.error = null;
    this.emit();
    return box;
  }

  selectBox(id: string | null): void {
    const pruned = id !== this.activeBoxId ? this.pruneEmptyBoxes(id) : false;
    if (this.activeBoxId === id && !pruned) return;
    this.lastEditKey = null;
    this.activeBoxId = id && this.boxes.some((b) => b.id === id) ? id : null;
    this.emit();
  }

  updateText(id: string, text: string): void {
    const idx = this.boxes.findIndex((b) => b.id === id);
    if (idx === -1 || this.boxes[idx].text === text) return;
    const now = Date.now();
    const editKey = `text:${id}`;
    if (
      this.lastEditKey !== editKey ||
      now - this.lastEditAt > TEXT_UNDO_COALESCE_MS
    ) {
      this.pushUndo();
    }
    this.lastEditKey = editKey;
    this.lastEditAt = now;
    const next = [...this.boxes];
    next[idx] = { ...next[idx], text };
    this.boxes = next;
    this.emit();
  }

  moveBox(
    id: string,
    xRatio: number,
    yRatio: number,
    recordHistory = false,
  ): void {
    const idx = this.boxes.findIndex((b) => b.id === id);
    if (idx === -1) return;
    const clampedX = clamp(xRatio, 0, 0.98);
    const clampedY = clamp(yRatio, 0, 0.98);
    if (
      this.boxes[idx].xRatio === clampedX &&
      this.boxes[idx].yRatio === clampedY
    ) {
      return;
    }
    if (recordHistory) this.pushUndo();
    const next = [...this.boxes];
    next[idx] = { ...next[idx], xRatio: clampedX, yRatio: clampedY };
    this.boxes = next;
    this.emit();
  }

  recordMoveSnapshot(): void {
    this.pushUndo();
  }

  adjustFontSize(id: string, delta: number): void {
    const idx = this.boxes.findIndex((b) => b.id === id);
    if (idx === -1) return;
    const nextSize = clamp(
      this.boxes[idx].fontSizePt + delta,
      MIN_FONT_SIZE_PT,
      MAX_FONT_SIZE_PT,
    );
    if (nextSize === this.boxes[idx].fontSizePt) return;
    this.pushUndo();
    const next = [...this.boxes];
    next[idx] = { ...next[idx], fontSizePt: nextSize };
    this.boxes = next;
    this.defaults = { ...this.defaults, fontSizePt: nextSize };
    this.emit();
  }

  increaseFontSize(id: string): void {
    this.adjustFontSize(id, FONT_SIZE_STEP_PT);
  }

  decreaseFontSize(id: string): void {
    this.adjustFontSize(id, -FONT_SIZE_STEP_PT);
  }

  toggleBold(id: string): void {
    const idx = this.boxes.findIndex((b) => b.id === id);
    if (idx === -1) return;
    this.pushUndo();
    const bold = !this.boxes[idx].bold;
    const next = [...this.boxes];
    next[idx] = { ...next[idx], bold };
    this.boxes = next;
    this.defaults = { ...this.defaults, bold };
    this.emit();
  }

  toggleItalic(id: string): void {
    const idx = this.boxes.findIndex((b) => b.id === id);
    if (idx === -1) return;
    this.pushUndo();
    const italic = !this.boxes[idx].italic;
    const next = [...this.boxes];
    next[idx] = { ...next[idx], italic };
    this.boxes = next;
    this.defaults = { ...this.defaults, italic };
    this.emit();
  }

  toggleUnderline(id: string): void {
    const idx = this.boxes.findIndex((b) => b.id === id);
    if (idx === -1) return;
    this.pushUndo();
    const underline = !this.boxes[idx].underline;
    const next = [...this.boxes];
    next[idx] = { ...next[idx], underline };
    this.boxes = next;
    this.defaults = { ...this.defaults, underline };
    this.emit();
  }

  setColor(id: string, color: QuickTextColorId): void {
    const idx = this.boxes.findIndex((b) => b.id === id);
    if (idx === -1 || this.boxes[idx].color === color) return;
    this.pushUndo();
    const next = [...this.boxes];
    next[idx] = { ...next[idx], color };
    this.boxes = next;
    this.defaults = { ...this.defaults, color };
    this.emit();
  }

  setDefaults(patch: Partial<QuickTextDefaults>): void {
    this.defaults = {
      ...this.defaults,
      ...patch,
      fontSizePt: clamp(
        patch.fontSizePt ?? this.defaults.fontSizePt,
        MIN_FONT_SIZE_PT,
        MAX_FONT_SIZE_PT,
      ),
    };
    this.emit();
  }

  deleteBox(id: string): void {
    const target = this.boxes.find((b) => b.id === id);
    if (!target) return;
    const wasEmpty = target.text.trim().length === 0;
    if (!wasEmpty) {
      this.pushUndo();
    } else {
      this.lastEditKey = null;
    }
    this.boxes = this.boxes.filter((b) => b.id !== id);
    if (wasEmpty) {
      this.dropRedundantUndoTop();
    }
    if (this.activeBoxId === id) {
      this.activeBoxId = null;
    }
    this.emit();
  }

  clearAll(): void {
    if (this.boxes.length === 0) return;
    this.pushUndo();
    this.boxes = [];
    this.activeBoxId = null;
    this.emit();
  }

  reset(): void {
    this.boxes = [];
    this.activeBoxId = null;
    this.undoStack = [];
    this.redoStack = [];
    this.lastEditKey = null;
    this.lastEditAt = 0;
    this.error = null;
    this.saving = false;
    this.emit();
  }

  undo(): void {
    const prev = this.undoStack.pop();
    if (!prev) return;
    this.lastEditKey = null;
    this.redoStack.push(cloneBoxes(this.boxes));
    this.boxes = prev;
    if (
      this.activeBoxId &&
      !this.boxes.some((b) => b.id === this.activeBoxId)
    ) {
      this.activeBoxId = null;
    }
    this.emit();
  }

  redo(): void {
    const next = this.redoStack.pop();
    if (!next) return;
    this.lastEditKey = null;
    this.undoStack.push(cloneBoxes(this.boxes));
    this.boxes = next;
    if (
      this.activeBoxId &&
      !this.boxes.some((b) => b.id === this.activeBoxId)
    ) {
      this.activeBoxId = null;
    }
    this.emit();
  }

  getNonEmptyBoxes(): QuickTextBox[] {
    return this.boxes.filter((b) => b.text.trim().length > 0);
  }

  private pruneEmptyBoxes(keepId?: string | null): boolean {
    const remaining = this.boxes.filter(
      (b) => b.id === keepId || b.text.trim().length > 0,
    );
    if (remaining.length === this.boxes.length) return false;
    this.boxes = remaining;
    if (
      this.activeBoxId &&
      !this.boxes.some((b) => b.id === this.activeBoxId)
    ) {
      this.activeBoxId = null;
    }
    this.dropRedundantUndoTop();
    return true;
  }

  private dropRedundantUndoTop(): void {
    while (
      this.undoStack.length > 0 &&
      boxesEqual(this.undoStack[this.undoStack.length - 1], this.boxes)
    ) {
      this.undoStack.pop();
    }
  }

  private pushUndo(): void {
    this.lastEditKey = null;
    this.undoStack.push(cloneBoxes(this.boxes));
    if (this.undoStack.length > MAX_HISTORY) {
      this.undoStack.shift();
    }
    this.redoStack = [];
  }

  private buildSnapshot(): QuickTextSnapshot {
    return {
      boxes: this.boxes,
      activeBoxId: this.activeBoxId,
      defaults: this.defaults,
      pageSizes: this.pageSizes,
      canUndo: this.undoStack.length > 0,
      canRedo: this.redoStack.length > 0,
      dirty: this.boxes.some((b) => b.text.trim().length > 0),
      saving: this.saving,
      error: this.error,
    };
  }

  private emit(): void {
    this.snapshot = this.buildSnapshot();
    for (const listener of this.listeners) {
      listener();
    }
  }
}

export interface QuickTextSessionActions {
  save: (download: boolean) => Promise<void>;
}

export interface QuickTextSession {
  store: QuickTextStore | null;
  actions: QuickTextSessionActions | null;
}

let session: QuickTextSession = {
  store: null,
  actions: null,
};

const sessionListeners = new Set<Listener>();

function subscribeSession(listener: Listener): () => void {
  sessionListeners.add(listener);
  return () => {
    sessionListeners.delete(listener);
  };
}

export function setQuickTextSession(
  store: QuickTextStore | null,
  actions: QuickTextSessionActions | null,
): void {
  session = { store, actions };
  for (const listener of Array.from(sessionListeners)) {
    listener();
  }
}

export function getQuickTextSession(): QuickTextSession {
  return session;
}

export function useQuickTextSession(): QuickTextSession {
  return useSyncExternalStore(
    subscribeSession,
    getQuickTextSession,
    getQuickTextSession,
  );
}
