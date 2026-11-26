import { Logo } from "@editor/ui/Logo";
import { SidebarToggleButton } from "@editor/components/shared/SidebarToggleButton";

export interface SidebarHeaderProps {
  className?: string;
  onToggleCollapse?: () => void;
  collapsed?: boolean;
}

/** The wordmark; the brand mark sits in the rail beside it. */
export function SidebarHeader({
  className,
  onToggleCollapse,
  collapsed = false,
}: SidebarHeaderProps) {
  return (
    <div className={`file-sidebar-header${className ? ` ${className}` : ""}`}>
      <Logo variant="textOnly" textHeight="1.3rem" />
      {onToggleCollapse && (
        <SidebarToggleButton
          collapsed={collapsed}
          onToggle={onToggleCollapse}
        />
      )}
    </div>
  );
}
