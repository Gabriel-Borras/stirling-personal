import { useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@editor/ui/Button";
import { Icon } from "@editor/ui/Icon";
import { getQuickTextSession } from "@editor/tools/quickText/QuickTextStore";
import "@editor/tools/quickText/QuickText.css";

/**
 * Top action bar docked above the PDF viewer pages while Quick Text is active.
 */
export function QuickTextToolbar() {
  const { t } = useTranslation();
  const { store, actions } = getQuickTextSession();
  const snapshot = useSyncExternalStore(
    store ? store.subscribe : () => () => {},
    store ? store.getSnapshot : () => null,
  );

  if (!store || !snapshot) return null;

  const nonEmptyCount = snapshot.boxes.filter(
    (b) => b.text.trim().length > 0,
  ).length;

  return (
    <div className="quick-text-top-bar" data-testid="quick-text-top-bar">
      <div className="quick-text-top-bar-group">
        <span className="quick-text-top-bar-hint">
          {t(
            "quickText.topBar.hint",
            "Click anywhere on the page to type directly",
          )}
        </span>
        {nonEmptyCount > 0 && (
          <span className="quick-text-top-bar-count">
            {t("quickText.topBar.count", "{{count}} text box(es)", {
              count: nonEmptyCount,
            })}
          </span>
        )}
      </div>

      <div className="quick-text-top-bar-group">
        <Button
          size="sm"
          variant="tertiary"
          accent="neutral"
          disabled={!snapshot.canUndo || snapshot.saving}
          onClick={() => store.undo()}
          title={t("quickText.actions.undo", "Undo")}
          aria-label={t("quickText.actions.undo", "Undo")}
        >
          <Icon name="undo-2" size={14} />
        </Button>

        <Button
          size="sm"
          variant="tertiary"
          accent="neutral"
          disabled={!snapshot.canRedo || snapshot.saving}
          onClick={() => store.redo()}
          title={t("quickText.actions.redo", "Redo")}
          aria-label={t("quickText.actions.redo", "Redo")}
        >
          <Icon name="redo-2" size={14} />
        </Button>

        {snapshot.boxes.length > 0 && (
          <Button
            size="sm"
            variant="tertiary"
            accent="neutral"
            disabled={snapshot.saving}
            onClick={() => store.clearAll()}
          >
            {t("quickText.actions.clearAll", "Clear")}
          </Button>
        )}

        <Button
          size="sm"
          variant="secondary"
          disabled={!snapshot.dirty || snapshot.saving}
          onClick={() => void actions?.save(false)}
          data-testid="quick-text-save-btn"
        >
          <Icon name="save" size={14} />
          {snapshot.saving
            ? t("quickText.actions.saving", "Saving...")
            : t("quickText.actions.apply", "Apply to PDF")}
        </Button>

        <Button
          size="sm"
          variant="primary"
          disabled={!snapshot.dirty || snapshot.saving}
          onClick={() => void actions?.save(true)}
          data-testid="quick-text-download-btn"
        >
          <Icon name="download" size={14} />
          {t("quickText.actions.saveAndDownload", "Save & Download")}
        </Button>
      </div>
    </div>
  );
}
