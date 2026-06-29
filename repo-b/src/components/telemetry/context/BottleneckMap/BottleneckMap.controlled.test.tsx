import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// Stub the recharts MapPanel so node selection is deterministic — this suite asserts the controlled
// selection contract (selectedId / onSelectNode / resetSignal) the Overview page relies on, without the
// chart. The chart's own rendering is covered in BottleneckMap.test.
vi.mock("./MapPanel", () => ({
  default: ({ selectedId, onSelect }: { selectedId: string | null; onSelect: (id: string) => void }) => (
    <div data-testid="map-panel" data-selected={selectedId ?? ""}>
      <button type="button" onClick={() => onSelect("sputnik")}>pick sputnik</button>
      <button type="button" onClick={() => onSelect("vostok")}>pick vostok</button>
    </div>
  ),
}));

import BottleneckMap from "./BottleneckMap";

describe("BottleneckMap — controlled selection", () => {
  it("respects controlled selectedId=null with no terran1 fallback and surfaces null", () => {
    const onSelectedEventChange = vi.fn();
    const onSelectNode = vi.fn();
    render(<BottleneckMap envId="env-x" selectedId={null} onSelectNode={onSelectNode} onSelectedEventChange={onSelectedEventChange} />);
    expect(onSelectedEventChange).toHaveBeenCalledWith(null);
    expect(screen.queryByText(/Selected:/)).not.toBeInTheDocument();
    expect(screen.queryByText("Terran 1: Good Luck, Have Fun")).not.toBeInTheDocument();
  });

  it("reports a clicked node up through onSelectNode", () => {
    const onSelectNode = vi.fn();
    render(<BottleneckMap envId="env-x" selectedId={null} onSelectNode={onSelectNode} onSelectedEventChange={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "pick sputnik" }));
    expect(onSelectNode).toHaveBeenCalledWith("sputnik");
  });

  it("surfaces the resolved event up on a controlled selection (no in-map orientation strip)", () => {
    const onSelectedEventChange = vi.fn();
    const onSelectNode = vi.fn();
    const { rerender } = render(<BottleneckMap envId="env-x" selectedId={null} onSelectNode={onSelectNode} onSelectedEventChange={onSelectedEventChange} />);
    rerender(<BottleneckMap envId="env-x" selectedId="sputnik" onSelectNode={onSelectNode} onSelectedEventChange={onSelectedEventChange} />);
    expect(onSelectedEventChange).toHaveBeenLastCalledWith(expect.objectContaining({ id: "sputnik", name: "Sputnik 1" }));
    // The selected-node story moved to the page hero — the map renders no in-chart orientation strip.
    expect(screen.queryByText(/Selected:/)).not.toBeInTheDocument();
  });

  it("toggles off when the selected node is clicked again", () => {
    const onSelectNode = vi.fn();
    render(<BottleneckMap envId="env-x" selectedId="sputnik" onSelectNode={onSelectNode} onSelectedEventChange={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "pick sputnik" }));
    expect(onSelectNode).toHaveBeenCalledWith(null);
  });

  it("clears the selection on Escape", () => {
    const onSelectNode = vi.fn();
    render(<BottleneckMap envId="env-x" selectedId="sputnik" onSelectNode={onSelectNode} onSelectedEventChange={() => {}} />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onSelectNode).toHaveBeenCalledWith(null);
  });

  it("fully resets (stops presenter + clears) when resetSignal changes", () => {
    const onSelectNode = vi.fn();
    const { rerender } = render(<BottleneckMap envId="env-x" selectedId="sputnik" resetSignal={0} onSelectNode={onSelectNode} onSelectedEventChange={() => {}} />);
    onSelectNode.mockClear();
    rerender(<BottleneckMap envId="env-x" selectedId="sputnik" resetSignal={1} onSelectNode={onSelectNode} onSelectedEventChange={() => {}} />);
    expect(onSelectNode).toHaveBeenCalledWith(null);
  });
});
