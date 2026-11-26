import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  SidebarState,
  SidebarRefs,
  SidebarContextValue,
  SidebarProviderProps,
} from "@editor/types/sidebar";

const LEFT_SIDEBAR_COLLAPSED_KEY = "stirling.leftSidebarCollapsed";
const RIGHT_SIDEBAR_COLLAPSED_KEY = "stirling.rightSidebarCollapsed";

function readCollapsedState(key: string): boolean {
  try {
    return window.localStorage.getItem(key) === "true";
  } catch {
    return false;
  }
}

function writeCollapsedState(key: string, collapsed: boolean): void {
  try {
    window.localStorage.setItem(key, String(collapsed));
  } catch {
    // private mode / quota: ignore
  }
}

const SidebarContext = createContext<SidebarContextValue | undefined>(
  undefined,
);

export function SidebarProvider({ children }: SidebarProviderProps) {
  const quickAccessRef = useRef<HTMLDivElement>(null);
  const toolPanelRef = useRef<HTMLDivElement>(null);

  const [leftPanelView, setLeftPanelView] = useState<
    "toolPicker" | "toolContent"
  >("toolPicker");
  const [readerMode, setReaderMode] = useState(false);
  const [leftSidebarCollapsed, setLeftSidebarCollapsed] = useState(() =>
    readCollapsedState(LEFT_SIDEBAR_COLLAPSED_KEY),
  );
  const [rightSidebarCollapsed, setRightSidebarCollapsed] = useState(() =>
    readCollapsedState(RIGHT_SIDEBAR_COLLAPSED_KEY),
  );

  useEffect(() => {
    writeCollapsedState(LEFT_SIDEBAR_COLLAPSED_KEY, leftSidebarCollapsed);
  }, [leftSidebarCollapsed]);

  useEffect(() => {
    writeCollapsedState(RIGHT_SIDEBAR_COLLAPSED_KEY, rightSidebarCollapsed);
  }, [rightSidebarCollapsed]);

  const toggleLeftSidebar = useCallback(() => {
    setLeftSidebarCollapsed((prev) => !prev);
  }, []);

  const toggleRightSidebar = useCallback(() => {
    setRightSidebarCollapsed((prev) => !prev);
  }, []);

  const sidebarState: SidebarState = useMemo(
    () => ({
      leftPanelView,
      readerMode,
      leftSidebarCollapsed,
      rightSidebarCollapsed,
    }),
    [leftPanelView, readerMode, leftSidebarCollapsed, rightSidebarCollapsed],
  );

  const sidebarRefs: SidebarRefs = useMemo(
    () => ({
      quickAccessRef,
      toolPanelRef,
    }),
    [quickAccessRef, toolPanelRef],
  );

  const contextValue: SidebarContextValue = useMemo(
    () => ({
      sidebarState,
      sidebarRefs,
      setLeftPanelView,
      setReaderMode,
      setLeftSidebarCollapsed,
      setRightSidebarCollapsed,
      toggleLeftSidebar,
      toggleRightSidebar,
    }),
    [
      sidebarState,
      sidebarRefs,
      setLeftPanelView,
      setReaderMode,
      toggleLeftSidebar,
      toggleRightSidebar,
    ],
  );

  return (
    <SidebarContext.Provider value={contextValue}>
      {children}
    </SidebarContext.Provider>
  );
}

/** For components that render outside a SidebarProvider, such as the rail's tooltips. */
export function useOptionalSidebarContext(): SidebarContextValue | undefined {
  return useContext(SidebarContext);
}

export function useSidebarContext(): SidebarContextValue {
  const context = useContext(SidebarContext);
  if (context === undefined) {
    throw new Error("useSidebarContext must be used within a SidebarProvider");
  }
  return context;
}
