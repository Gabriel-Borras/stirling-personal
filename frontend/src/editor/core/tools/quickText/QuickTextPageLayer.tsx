import React, { useEffect, useRef, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import type { ViewerPageLayerProps } from "@editor/contexts/viewer/ViewerPageTool";
import { Icon } from "@editor/ui/Icon";
import { QuickTextFloatingToolbar } from "@editor/tools/quickText/QuickTextFloatingToolbar";
import {
  useQuickTextSession,
  type QuickTextStore,
} from "@editor/tools/quickText/QuickTextStore";
import {
  getQuickTextColorOption,
  type QuickTextBox,
} from "@editor/tools/quickText/types";
import "@editor/tools/quickText/QuickText.css";

const FALLBACK_PAGE_WIDTH_PT = 612;
const FLIP_TOOLBAR_Y_THRESHOLD = 0.09;
const CLICK_DRAG_THRESHOLD_PX = 5;
const EMPTY_SUBSCRIBE = () => () => {};
const NULL_SNAPSHOT = () => null;

function normalizeQuarterTurns(angle: number | undefined): number {
  if (!angle) return 0;
  return ((Math.round(angle / 90) % 4) + 4) % 4;
}

interface InlineTextBoxItemProps {
  box: QuickTextBox;
  isActive: boolean;
  pageWidth: number;
  pageHeight: number;
  scale: number;
  store: QuickTextStore;
}

function InlineTextBoxItem({
  box,
  isActive,
  pageWidth,
  pageHeight,
  scale,
  store,
}: InlineTextBoxItemProps) {
  const { t } = useTranslation();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dragCleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => () => dragCleanupRef.current?.(), []);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (isActive && textarea && document.activeElement !== textarea) {
      textarea.focus();
    }
  }, [isActive]);

  const startDrag = (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    dragCleanupRef.current?.();
    store.selectBox(box.id);

    const startClientX = event.clientX;
    const startClientY = event.clientY;
    const startXRatio = box.xRatio;
    const startYRatio = box.yRatio;
    let recordedSnapshot = false;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const dx = moveEvent.clientX - startClientX;
      const dy = moveEvent.clientY - startClientY;
      if (!recordedSnapshot && Math.hypot(dx, dy) > 2) {
        store.recordMoveSnapshot();
        recordedSnapshot = true;
      }
      if (!recordedSnapshot || pageWidth <= 0 || pageHeight <= 0) return;
      store.moveBox(
        box.id,
        startXRatio + dx / pageWidth,
        startYRatio + dy / pageHeight,
      );
    };

    const cleanup = () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", cleanup);
      dragCleanupRef.current = null;
    };

    dragCleanupRef.current = cleanup;
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", cleanup);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      textareaRef.current?.blur();
      store.selectBox(null);
      return;
    }

    if (
      event.key === "Backspace" &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey &&
      box.text.length === 0
    ) {
      event.preventDefault();
      event.stopPropagation();
      store.deleteBox(box.id);
      return;
    }

    if (event.ctrlKey || event.metaKey) {
      const key = event.key.toLowerCase();
      if (key === "z") {
        event.preventDefault();
        event.stopPropagation();
        if (event.shiftKey) {
          store.redo();
        } else {
          store.undo();
        }
      } else if (key === "y") {
        event.preventDefault();
        event.stopPropagation();
        store.redo();
      } else if (key === "b") {
        event.preventDefault();
        store.toggleBold(box.id);
      } else if (key === "i") {
        event.preventDefault();
        store.toggleItalic(box.id);
      } else if (key === "u") {
        event.preventDefault();
        store.toggleUnderline(box.id);
      }
    }
  };

  const colorOption = getQuickTextColorOption(box.color);
  const fontSizePx = Math.max(4, box.fontSizePt * scale);
  const placeholder = t("quickText.placeholder", "Type text here");

  const textStyle: React.CSSProperties = {
    fontSize: `${fontSizePx}px`,
    fontWeight: box.bold ? 700 : 400,
    fontStyle: box.italic ? "italic" : "normal",
    textDecoration: box.underline ? "underline" : "none",
    color: colorOption.cssVar,
  };

  const mirrorText = `${box.text || placeholder}\u200b`;

  return (
    <div
      className={`quick-text-box${isActive ? " quick-text-box--active" : ""}`}
      style={{
        left: `${box.xRatio * 100}%`,
        top: `${box.yRatio * 100}%`,
      }}
      data-testid="quick-text-box"
      data-quick-text-box-id={box.id}
      onClick={(e) => {
        e.stopPropagation();
        store.selectBox(box.id);
      }}
      onMouseDown={(e) => {
        e.stopPropagation();
        // Drag when grabbing the box frame itself; clicks inside the textarea keep native caret placement.
        if (e.target === e.currentTarget) {
          startDrag(e);
        }
      }}
    >
      {isActive && (
        <QuickTextFloatingToolbar
          box={box}
          placeBelow={box.yRatio < FLIP_TOOLBAR_Y_THRESHOLD}
          onDecreaseSize={() => store.decreaseFontSize(box.id)}
          onIncreaseSize={() => store.increaseFontSize(box.id)}
          onToggleBold={() => store.toggleBold(box.id)}
          onToggleItalic={() => store.toggleItalic(box.id)}
          onToggleUnderline={() => store.toggleUnderline(box.id)}
          onSelectColor={(color) => store.setColor(box.id, color)}
          onDelete={() => store.deleteBox(box.id)}
        />
      )}

      <span
        className="quick-text-drag-handle"
        title={t("quickText.dragToMove", "Drag to move")}
        onMouseDown={startDrag}
        data-testid="quick-text-drag-handle"
      >
        <Icon name="grip-vertical" size={14} />
      </span>

      <div className="quick-text-editor-wrap">
        <span
          className="quick-text-mirror"
          style={textStyle}
          aria-hidden="true"
        >
          {mirrorText}
        </span>
        <textarea
          ref={textareaRef}
          className="quick-text-textarea"
          style={textStyle}
          value={box.text}
          placeholder={placeholder}
          rows={1}
          spellCheck={false}
          aria-label={placeholder}
          data-testid="quick-text-input"
          onFocus={() => store.selectBox(box.id)}
          onChange={(e) => store.updateText(box.id, e.target.value)}
          onKeyDown={handleKeyDown}
        />
      </div>
    </div>
  );
}

/**
 * Per-page overlay mounted via ViewerPageTool. Clicking empty space on a PDF
 * page creates and focuses an inline editable text box directly on the canvas.
 */
export function QuickTextPageLayer({
  pageIndex,
  width,
  height,
}: ViewerPageLayerProps) {
  const { store } = useQuickTextSession();
  const snapshot = useSyncExternalStore(
    store ? store.subscribe : EMPTY_SUBSCRIBE,
    store ? store.getSnapshot : NULL_SNAPSHOT,
  );
  const pointerDownPosRef = useRef<{ x: number; y: number } | null>(null);

  if (!store || !snapshot) return null;

  const pageMeta = snapshot.pageSizes[pageIndex];
  const quarterTurns = normalizeQuarterTurns(pageMeta?.rotation);
  const sideways = quarterTurns % 2 === 1;
  const displayWidth = sideways ? height : width;
  const displayHeight = sideways ? width : height;
  const pdfDisplayWidthPt = sideways
    ? (pageMeta?.height ?? FALLBACK_PAGE_WIDTH_PT)
    : (pageMeta?.width ?? FALLBACK_PAGE_WIDTH_PT);
  const scale = pdfDisplayWidthPt > 0 ? displayWidth / pdfDisplayWidthPt : 1;

  const pageBoxes = snapshot.boxes.filter((b) => b.pageIndex === pageIndex);

  const handleLayerMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) {
      pointerDownPosRef.current = { x: event.clientX, y: event.clientY };
    } else {
      pointerDownPosRef.current = null;
    }
  };

  const handleLayerClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const downPos = pointerDownPosRef.current;
    pointerDownPosRef.current = null;
    // Ignore clicks resulting from a drag-selection that started inside a box and ended on the layer.
    if (!downPos || event.target !== event.currentTarget) return;
    if (
      Math.hypot(event.clientX - downPos.x, event.clientY - downPos.y) >
      CLICK_DRAG_THRESHOLD_PX
    ) {
      return;
    }
    if (displayWidth <= 0 || displayHeight <= 0) return;

    const rect = event.currentTarget.getBoundingClientRect();
    const clickX = event.clientX - rect.left;
    const clickY = event.clientY - rect.top;

    // Offset upward so the text baseline lands where the user clicked.
    const fontOffsetPx = snapshot.defaults.fontSizePt * scale * 0.6;
    const xRatio = clickX / rect.width;
    const yRatio = Math.max(0, (clickY - fontOffsetPx) / rect.height);

    store.addBox(pageIndex, xRatio, yRatio);
  };

  const layerStyle: React.CSSProperties | undefined = quarterTurns
    ? {
        inset: "auto",
        left: (width - displayWidth) / 2,
        top: (height - displayHeight) / 2,
        width: displayWidth,
        height: displayHeight,
        transform: `rotate(${-90 * quarterTurns}deg)`,
      }
    : undefined;

  return (
    <div
      className="quick-text-page-layer"
      style={layerStyle}
      data-testid={`quick-text-page-layer-${pageIndex}`}
      onMouseDown={handleLayerMouseDown}
      onClick={handleLayerClick}
    >
      {pageBoxes.map((box) => (
        <InlineTextBoxItem
          key={box.id}
          box={box}
          isActive={snapshot.activeBoxId === box.id}
          pageWidth={displayWidth}
          pageHeight={displayHeight}
          scale={scale}
          store={store}
        />
      ))}
    </div>
  );
}
