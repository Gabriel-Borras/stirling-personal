import { afterEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { QuickTextPageLayer } from "@editor/tools/quickText/QuickTextPageLayer";
import {
  QuickTextStore,
  setQuickTextSession,
} from "@editor/tools/quickText/QuickTextStore";

describe("QuickTextPageLayer", () => {
  afterEach(() => {
    cleanup();
    setQuickTextSession(null, null);
  });

  function renderLayer(store: QuickTextStore) {
    setQuickTextSession(store, { save: vi.fn(async () => {}) });
    const utils = render(
      <QuickTextPageLayer
        pageIndex={0}
        width={600}
        height={800}
        onCovered={() => {}}
      />,
    );
    const layer = screen.getByTestId("quick-text-page-layer-0");
    vi.spyOn(layer, "getBoundingClientRect").mockReturnValue(
      new DOMRect(0, 0, 600, 800),
    );
    return { ...utils, layer };
  }

  it("blurs textarea on Escape and deletes empty box on Backspace", () => {
    const store = new QuickTextStore();
    const { layer } = renderLayer(store);

    fireEvent.mouseDown(layer, { clientX: 100, clientY: 200 });
    fireEvent.click(layer, { clientX: 100, clientY: 200 });

    const input = screen.getByTestId("quick-text-input");
    expect(document.activeElement).toBe(input);

    fireEvent.change(input, { target: { value: "Hola" } });
    fireEvent.keyDown(input, { key: "Escape" });

    expect(store.getSnapshot().activeBoxId).toBeNull();
    expect(document.activeElement).not.toBe(input);

    // New empty box deletes immediately on Backspace.
    fireEvent.mouseDown(layer, { clientX: 250, clientY: 300 });
    fireEvent.click(layer, { clientX: 250, clientY: 300 });
    expect(store.getSnapshot().boxes).toHaveLength(2);
    const inputs = screen.getAllByTestId("quick-text-input");
    fireEvent.keyDown(inputs[1], { key: "Backspace" });
    expect(store.getSnapshot().boxes).toHaveLength(1);
  });

  it("does not spawn a new box when a drag-selection starts inside a box and ends on the layer", () => {
    const store = new QuickTextStore();
    const box = store.addBox(0, 0.2, 0.2);
    store.updateText(box.id, "Select me");
    const { layer } = renderLayer(store);

    const input = screen.getByTestId("quick-text-input");
    fireEvent.mouseDown(input, { clientX: 150, clientY: 165 });
    // Release outside the box fires click on the layer without a preceding layer mousedown.
    fireEvent.click(layer, { clientX: 40, clientY: 165 });

    expect(store.getSnapshot().boxes).toHaveLength(1);
  });

  it("does not preventDefault on mousedown inside an inactive box textarea", () => {
    const store = new QuickTextStore();
    const box = store.addBox(0, 0.2, 0.2);
    store.updateText(box.id, "Click middle");
    store.selectBox(null);
    renderLayer(store);

    const input = screen.getByTestId("quick-text-input");
    const event = new MouseEvent("mousedown", {
      bubbles: true,
      cancelable: true,
      clientX: 140,
      clientY: 165,
    });
    act(() => {
      input.dispatchEvent(event);
    });
    expect(event.defaultPrevented).toBe(false);
  });

  it("handles Ctrl+Z and Ctrl+Y inside the active textarea via store history", () => {
    const store = new QuickTextStore();
    renderLayer(store);

    act(() => {
      const box = store.addBox(0, 0.2, 0.2);
      store.updateText(box.id, "First");
      store.toggleBold(box.id);
      store.updateText(box.id, "Second");
    });

    const input = screen.getByTestId("quick-text-input");
    fireEvent.keyDown(input, { key: "z", ctrlKey: true });
    expect(store.getSnapshot().boxes[0].text).toBe("First");

    fireEvent.keyDown(input, { key: "y", ctrlKey: true });
    expect(store.getSnapshot().boxes[0].text).toBe("Second");
  });
});
