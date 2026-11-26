import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MantineProvider } from "@mantine/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  SidebarProvider,
  useSidebarContext,
} from "@editor/contexts/SidebarContext";
import { WorkbenchSidebarControls } from "@editor/components/shared/WorkbenchSidebarControls";
import type { ToolRegistryEntry } from "@editor/data/toolsTaxonomy";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string, opts?: Record<string, string>) => {
      let text = fallback ?? key;
      if (opts) {
        for (const [k, v] of Object.entries(opts)) {
          text = text.replace(`{{${k}}}`, v);
        }
      }
      return text;
    },
  }),
}));

const MOCK_TOOL = {
  icon: <span data-testid="mock-tool-icon">M</span>,
  name: "Merge",
  component: null,
  description: "Merge PDFs",
  categoryId: "standardTools",
  subcategoryId: "organize",
  maxFiles: -1,
  endpoints: [],
  automationSettings: null,
} as unknown as ToolRegistryEntry;

function Harness({
  showLeftExpand = true,
  showRightExpand = true,
  selectedTool = null,
}: {
  showLeftExpand?: boolean;
  showRightExpand?: boolean;
  selectedTool?: ToolRegistryEntry | null;
}) {
  const { sidebarState, toggleLeftSidebar, toggleRightSidebar } =
    useSidebarContext();
  return (
    <div>
      <button type="button" onClick={toggleLeftSidebar}>
        toggle-left
      </button>
      <button type="button" onClick={toggleRightSidebar}>
        toggle-right
      </button>
      <span data-testid="left-state">
        {String(sidebarState.leftSidebarCollapsed)}
      </span>
      <span data-testid="right-state">
        {String(sidebarState.rightSidebarCollapsed)}
      </span>
      <WorkbenchSidebarControls
        showLeftExpand={showLeftExpand}
        showRightExpand={showRightExpand}
        selectedTool={selectedTool}
      />
    </div>
  );
}

function renderHarness(props: Parameters<typeof Harness>[0] = {}) {
  return render(
    <MantineProvider env="test">
      <SidebarProvider>
        <Harness {...props} />
      </SidebarProvider>
    </MantineProvider>,
  );
}

describe("WorkbenchSidebarControls & SidebarContext collapse", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("renders nothing when both sidebars are expanded", () => {
    renderHarness();
    expect(screen.queryByTestId("left-sidebar-expand")).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("selected-tool-bubble"),
    ).not.toBeInTheDocument();
  });

  it("collapses and expands the left sidebar and persists state", async () => {
    const user = userEvent.setup();
    renderHarness();

    await user.click(screen.getByRole("button", { name: "toggle-left" }));
    expect(screen.getByTestId("left-state")).toHaveTextContent("true");
    expect(window.localStorage.getItem("stirling.leftSidebarCollapsed")).toBe(
      "true",
    );

    const expandBtn = screen.getByTestId("left-sidebar-expand");
    expect(expandBtn).toBeVisible();
    await user.click(expandBtn);

    expect(screen.getByTestId("left-state")).toHaveTextContent("false");
    expect(window.localStorage.getItem("stirling.leftSidebarCollapsed")).toBe(
      "false",
    );
    expect(screen.queryByTestId("left-sidebar-expand")).not.toBeInTheDocument();
  });

  it("shows the selected tool bubble when the right sidebar is collapsed and expands on click", async () => {
    const user = userEvent.setup();
    renderHarness({ selectedTool: MOCK_TOOL });

    await user.click(screen.getByRole("button", { name: "toggle-right" }));
    expect(screen.getByTestId("right-state")).toHaveTextContent("true");
    expect(window.localStorage.getItem("stirling.rightSidebarCollapsed")).toBe(
      "true",
    );

    const bubble = screen.getByTestId("selected-tool-bubble");
    expect(bubble).toBeVisible();
    expect(bubble).toHaveAttribute("data-has-tool", "true");
    expect(bubble).toHaveAccessibleName("Expand tool panel (Merge)");
    expect(screen.getByTestId("mock-tool-icon")).toBeInTheDocument();
    expect(bubble).toHaveTextContent("Merge");

    await user.click(bubble);
    expect(screen.getByTestId("right-state")).toHaveTextContent("false");
    expect(
      screen.queryByTestId("selected-tool-bubble"),
    ).not.toBeInTheDocument();
  });

  it("shows a fallback PDF Tools bubble when collapsed without a selected tool", async () => {
    const user = userEvent.setup();
    renderHarness({ selectedTool: null });

    await user.click(screen.getByRole("button", { name: "toggle-right" }));
    const bubble = screen.getByTestId("selected-tool-bubble");
    expect(bubble).toHaveAttribute("data-has-tool", "false");
    expect(bubble).toHaveAccessibleName("Expand tool panel");
    expect(bubble).toHaveTextContent("PDF Tools");
  });

  it("restores persisted collapsed states from localStorage on mount", () => {
    window.localStorage.setItem("stirling.leftSidebarCollapsed", "true");
    window.localStorage.setItem("stirling.rightSidebarCollapsed", "true");

    renderHarness({ selectedTool: MOCK_TOOL });

    expect(screen.getByTestId("left-sidebar-expand")).toBeVisible();
    expect(screen.getByTestId("selected-tool-bubble")).toBeVisible();
  });

  it("hides expand controls when showLeftExpand or showRightExpand is false", () => {
    window.localStorage.setItem("stirling.leftSidebarCollapsed", "true");
    window.localStorage.setItem("stirling.rightSidebarCollapsed", "true");

    renderHarness({
      showLeftExpand: false,
      showRightExpand: false,
      selectedTool: MOCK_TOOL,
    });

    expect(screen.queryByTestId("left-sidebar-expand")).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("selected-tool-bubble"),
    ).not.toBeInTheDocument();
  });
});
