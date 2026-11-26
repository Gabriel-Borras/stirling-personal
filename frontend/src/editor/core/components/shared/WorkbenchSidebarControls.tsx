import { useTranslation } from "react-i18next";
import { useOptionalSidebarContext } from "@editor/contexts/SidebarContext";
import { SidebarToggleIcon } from "@editor/components/shared/SidebarToggleIcon";
import { ToolIcon } from "@editor/components/shared/ToolIcon";
import { Icon } from "@editor/ui/Icon";
import type { ToolRegistryEntry } from "@editor/data/toolsTaxonomy";
import styles from "@editor/components/shared/WorkbenchSidebarControls.module.css";

export interface WorkbenchSidebarControlsProps {
  /** Whether the left file sidebar can exist in the current view. */
  showLeftExpand: boolean;
  /** Whether the right tool sidebar can exist in the current view. */
  showRightExpand: boolean;
  /** Currently selected tool, displayed in the floating bubble when the right sidebar is collapsed. */
  selectedTool: ToolRegistryEntry | null;
}

/**
 * Floating expand triggers anchored inside the workbench edges when either
 * desktop sidebar is collapsed. The trailing trigger doubles as a compact
 * pill showing the currently selected tool.
 */
export function WorkbenchSidebarControls({
  showLeftExpand,
  showRightExpand,
  selectedTool,
}: WorkbenchSidebarControlsProps) {
  const { t } = useTranslation();
  const sidebarContext = useOptionalSidebarContext();

  if (!sidebarContext) return null;

  const { sidebarState, setLeftSidebarCollapsed, setRightSidebarCollapsed } =
    sidebarContext;

  const renderLeft = showLeftExpand && sidebarState.leftSidebarCollapsed;
  const renderRight = showRightExpand && sidebarState.rightSidebarCollapsed;

  if (!renderLeft && !renderRight) return null;

  const expandLeftLabel = t("fileSidebar.expand", "Expand sidebar");
  const expandRightLabel = selectedTool
    ? t("toolPanel.expandWithTool", "Expand tool panel ({{toolName}})", {
        toolName: selectedTool.name,
      })
    : t("toolPanel.expand", "Expand tool panel");

  return (
    <>
      {renderLeft && (
        <button
          type="button"
          className={styles.leftExpandBtn}
          onClick={() => setLeftSidebarCollapsed(false)}
          aria-label={expandLeftLabel}
          title={expandLeftLabel}
          data-testid="left-sidebar-expand"
        >
          <SidebarToggleIcon size={16} />
        </button>
      )}
      {renderRight && (
        <button
          type="button"
          className={styles.toolBubble}
          onClick={() => setRightSidebarCollapsed(false)}
          aria-label={expandRightLabel}
          title={expandRightLabel}
          data-testid="selected-tool-bubble"
          data-has-tool={selectedTool ? "true" : "false"}
        >
          <span
            className={`${styles.toolBubbleIcon} ${selectedTool ? styles.toolBubbleIconActive : ""}`}
            aria-hidden="true"
          >
            {selectedTool ? (
              <ToolIcon
                icon={selectedTool.icon}
                marginRight="0"
                color="currentColor"
              />
            ) : (
              <Icon name="layout-grid" size={14} />
            )}
          </span>
          <span className={styles.toolBubbleLabel}>
            {selectedTool
              ? selectedTool.name
              : t("toolPanel.toolsHeader", "PDF Tools")}
          </span>
          <span className={styles.toolBubbleToggle} aria-hidden="true">
            <SidebarToggleIcon size={15} mirrored />
          </span>
        </button>
      )}
    </>
  );
}
