import React, { useEffect, useRef, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import type { ViewerPageLayerProps } from "@editor/contexts/viewer/ViewerPageTool";
import { Icon } from "@editor/ui/Icon";
import { QuickTextFloatingToolbar } from "@editor/tools/quickText/QuickTextFloatingToolbar";
import {
  getQuickTextSession,
  type QuickTextStore,
} from "@editor/tools/quickText/QuickTextStore";
import {
  getQuickTextColorOption,
  type QuickTextBox,
} from "@editor/tools/quickText/types";
import "@editor/tools/quickText/QuickText.css";

const FALLBACK_PAGE_WIDTH_PT = 612;
const FLIP_TOOLBAR_Y_THRESHOLD = 0.09;

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

  useEffect(() => {
    if (isActive && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [isActive]);

  const startDrag = (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
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

    const handleMouseUp = () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      store.selectBox(null);
      return;
    }

    if (event.ctrlKey || event.metaKey) {
      const key = event.key.toLowerCase();
      if (key === "b") {
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
  const fontSizePx = Math.max(8, box.fontSizePt * scale);
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
      onClick={(e) => {
        e.stopPropagation();
        store.selectBox(box.id);
      }}
      onMouseDown={(e) => {
        if (!isActive) {
          startDrag(e);
        } else {
          e.stopPropagation();
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

      {isActive && (
        <span
          className="quick-text-drag-handle"
          title={t("quickText.dragToMove", "Drag to move")}
          onMouseDown={startDrag}
          data-testid="quick-text-drag-handle"
        >
          <Icon name="grip-vertical" size={14} />
        </span>
      )}

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
  const { store } = getQuickTextSession();
  const snapshot = useSyncExternalStore(
    store ? store.subscribe : () => () => {},
    store ? store.getSnapshot : () => null,
  );

  if (!store || !snapshot) return null;

  const pageBoxes = snapshot.boxes.filter((b) => b.pageIndex === pageIndex);
  const pdfWidthPt =
    snapshot.pageSizes[pageIndex]?.width ?? FALLBACK_PAGE_WIDTH_PT;
  const scale = pdfWidthPt > 0 ? width / pdfWidthPt : 1;

  const handleLayerClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
    if (width <= 0 || height <= 0) return;

    const rect = event.currentTarget.getBoundingClientRect();
    const clickX = event.clientX - rect.left;
    const clickY = event.clientY - rect.top;

    // Offset slightly upward so the text baseline lands where the user clicked.
    const fontOffsetPx = snapshot.defaults.fontSizePt * scale * 0.6;
    const xRatio = clickX / rect.width;
    const yRatio = Math.max(0, (clickY - fontOffsetPx) / rect.height);

    store.addBox(pageIndex, xRatio, yRatio);
  };

  return (
    <div
      className="quick-text-page-layer"
      data-testid={`quick-text-page-layer-${pageIndex}`}
      onClick={handleLayerClick}
    >
      {pageBoxes.map((box) => (
        <InlineTextBoxItem
          key={box.id}
          box={box}
          isActive={snapshot.activeBoxId === box.id}
          pageWidth={width}
          pageHeight={height}
          scale={scale}
          store={store}
        />
      ))}
    </div>
  );
}
