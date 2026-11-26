export type QuickTextColorId = "black" | "blue" | "red" | "green" | "gray";

export interface QuickTextColorOption {
  id: QuickTextColorId;
  cssVar: string;
  rgb: readonly [number, number, number];
}

export const QUICK_TEXT_COLORS: readonly QuickTextColorOption[] = [
  { id: "black", cssVar: "var(--c-text-on-light)", rgb: [0, 0, 0] },
  {
    id: "blue",
    cssVar: "var(--c-accent-solid)",
    rgb: [37 / 255, 99 / 255, 235 / 255],
  },
  {
    id: "red",
    cssVar: "var(--c-danger-solid)",
    rgb: [185 / 255, 28 / 255, 28 / 255],
  },
  {
    id: "green",
    cssVar: "var(--c-success-solid)",
    rgb: [21 / 255, 128 / 255, 61 / 255],
  },
  {
    id: "gray",
    cssVar: "var(--c-neutral-solid)",
    rgb: [75 / 255, 85 / 255, 99 / 255],
  },
] as const;

export const MIN_FONT_SIZE_PT = 6;
export const MAX_FONT_SIZE_PT = 72;
export const DEFAULT_FONT_SIZE_PT = 14;
export const FONT_SIZE_STEP_PT = 2;

export interface QuickTextBox {
  id: string;
  pageIndex: number;
  /** Horizontal offset from the left edge of the page, normalized to [0, 1]. */
  xRatio: number;
  /** Vertical offset from the top edge of the page, normalized to [0, 1]. */
  yRatio: number;
  text: string;
  fontSizePt: number;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  color: QuickTextColorId;
}

export interface PageDimensionsPt {
  width: number;
  height: number;
  /** Page /Rotate angle in degrees (0, 90, 180, 270). */
  rotation?: number;
}

export interface QuickTextDefaults {
  fontSizePt: number;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  color: QuickTextColorId;
}

export function getQuickTextColorOption(
  color: QuickTextColorId,
): QuickTextColorOption {
  return (
    QUICK_TEXT_COLORS.find((option) => option.id === color) ??
    QUICK_TEXT_COLORS[0]
  );
}
