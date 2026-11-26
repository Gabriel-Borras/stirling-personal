import React from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "@editor/ui/Icon";
import {
  MAX_FONT_SIZE_PT,
  MIN_FONT_SIZE_PT,
  QUICK_TEXT_COLORS,
  type QuickTextBox,
  type QuickTextColorId,
} from "@editor/tools/quickText/types";

interface QuickTextFloatingToolbarProps {
  box: QuickTextBox;
  placeBelow: boolean;
  onDecreaseSize: () => void;
  onIncreaseSize: () => void;
  onToggleBold: () => void;
  onToggleItalic: () => void;
  onToggleUnderline: () => void;
  onSelectColor: (color: QuickTextColorId) => void;
  onDelete: () => void;
}

export function QuickTextFloatingToolbar({
  box,
  placeBelow,
  onDecreaseSize,
  onIncreaseSize,
  onToggleBold,
  onToggleItalic,
  onToggleUnderline,
  onSelectColor,
  onDelete,
}: QuickTextFloatingToolbarProps) {
  const { t } = useTranslation();

  // Keep focus inside the inline textarea when clicking toolbar actions.
  const keepFocus = (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
  };

  return (
    <div
      className={`quick-text-floating-toolbar${placeBelow ? " quick-text-floating-toolbar--below" : ""}`}
      role="toolbar"
      aria-label={t("quickText.toolbar.label", "Text formatting")}
      data-testid="quick-text-floating-toolbar"
      onMouseDown={keepFocus}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        className="quick-text-toolbar-btn"
        onClick={onDecreaseSize}
        disabled={box.fontSizePt <= MIN_FONT_SIZE_PT}
        title={t("quickText.toolbar.decreaseSize", "Decrease font size")}
        aria-label={t("quickText.toolbar.decreaseSize", "Decrease font size")}
        data-testid="quick-text-decrease-size"
      >
        <span className="quick-text-toolbar-glyph-sm">A</span>
      </button>

      <button
        type="button"
        className="quick-text-toolbar-btn"
        onClick={onIncreaseSize}
        disabled={box.fontSizePt >= MAX_FONT_SIZE_PT}
        title={t("quickText.toolbar.increaseSize", "Increase font size")}
        aria-label={t("quickText.toolbar.increaseSize", "Increase font size")}
        data-testid="quick-text-increase-size"
      >
        <span className="quick-text-toolbar-glyph-lg">A</span>
      </button>

      <span className="quick-text-toolbar-divider" aria-hidden="true" />

      <button
        type="button"
        className={`quick-text-toolbar-btn${box.bold ? " quick-text-toolbar-btn--active" : ""}`}
        onClick={onToggleBold}
        aria-pressed={box.bold}
        title={t("quickText.toolbar.bold", "Bold (Ctrl+B)")}
        aria-label={t("quickText.toolbar.bold", "Bold")}
        data-testid="quick-text-bold"
      >
        <Icon name="bold" size={14} />
      </button>

      <button
        type="button"
        className={`quick-text-toolbar-btn${box.italic ? " quick-text-toolbar-btn--active" : ""}`}
        onClick={onToggleItalic}
        aria-pressed={box.italic}
        title={t("quickText.toolbar.italic", "Italic (Ctrl+I)")}
        aria-label={t("quickText.toolbar.italic", "Italic")}
        data-testid="quick-text-italic"
      >
        <Icon name="italic" size={14} />
      </button>

      <button
        type="button"
        className={`quick-text-toolbar-btn${box.underline ? " quick-text-toolbar-btn--active" : ""}`}
        onClick={onToggleUnderline}
        aria-pressed={box.underline}
        title={t("quickText.toolbar.underline", "Underline (Ctrl+U)")}
        aria-label={t("quickText.toolbar.underline", "Underline")}
        data-testid="quick-text-underline"
      >
        <Icon name="underline" size={14} />
      </button>

      <span className="quick-text-toolbar-divider" aria-hidden="true" />

      <div
        className="quick-text-color-group"
        role="group"
        aria-label={t("quickText.toolbar.color", "Text color")}
      >
        {QUICK_TEXT_COLORS.map((option) => {
          const isSelected = box.color === option.id;
          const colorLabel = t(
            `quickText.colors.${option.id}`,
            option.id.charAt(0).toUpperCase() + option.id.slice(1),
          );
          return (
            <button
              key={option.id}
              type="button"
              className={`quick-text-color-swatch${isSelected ? " quick-text-color-swatch--active" : ""}`}
              style={{ backgroundColor: option.cssVar }}
              onClick={() => onSelectColor(option.id)}
              aria-label={colorLabel}
              aria-pressed={isSelected}
              title={colorLabel}
              data-testid={`quick-text-color-${option.id}`}
            />
          );
        })}
      </div>

      <span className="quick-text-toolbar-divider" aria-hidden="true" />

      <button
        type="button"
        className="quick-text-toolbar-btn quick-text-toolbar-btn--danger"
        onClick={onDelete}
        title={t("quickText.toolbar.delete", "Delete text box")}
        aria-label={t("quickText.toolbar.delete", "Delete text box")}
        data-testid="quick-text-delete"
      >
        <Icon name="trash" size={15} />
      </button>
    </div>
  );
}
