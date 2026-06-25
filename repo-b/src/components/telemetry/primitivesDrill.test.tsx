import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { EmptyState, MetricRow, Stat } from "./primitives";
import { MetricInspectorDrawer } from "./drawerPrimitives";

describe("MetricRow drill affordance", () => {
  it("renders a plain row (no button) when onDrill is absent", () => {
    render(<MetricRow label="PICP" value="86%" />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText("86%")).toBeInTheDocument();
  });

  it("renders an inspectable button and fires onDrill", () => {
    const onDrill = vi.fn();
    render(<MetricRow label="PICP" value="86%" onDrill={onDrill} drillLabel="Inspect PICP" />);
    const btn = screen.getByRole("button", { name: "Inspect PICP" });
    fireEvent.click(btn);
    expect(onDrill).toHaveBeenCalledTimes(1);
  });
});

describe("Stat drill affordance", () => {
  it("fires onDrill when set", () => {
    const onDrill = vi.fn();
    render(<Stat label="Coverage" value="0.90" onDrill={onDrill} drillLabel="Inspect coverage" />);
    fireEvent.click(screen.getByRole("button", { name: "Inspect coverage" }));
    expect(onDrill).toHaveBeenCalledTimes(1);
  });

  it("renders no button without onDrill", () => {
    render(<Stat label="Coverage" value="0.90" />);
    expect(screen.queryByRole("button")).toBeNull();
  });
});

describe("EmptyState null reason", () => {
  it("surfaces the specific null_reason when provided", () => {
    render(<EmptyState label="No waterfall" hint="Carry requires the waterfall." nullReason="out_of_scope_requires_waterfall" />);
    expect(screen.getByText(/out_of_scope_requires_waterfall/)).toBeInTheDocument();
    expect(screen.getByText(/reason:/)).toBeInTheDocument();
  });

  it("omits the reason line when null_reason is absent", () => {
    render(<EmptyState label="Nothing yet" hint="Awaiting data." />);
    expect(screen.queryByText(/reason:/)).toBeNull();
  });
});

describe("MetricInspectorDrawer", () => {
  it("renders title and fields when open, fail-closing missing values", () => {
    render(
      <MetricInspectorDrawer
        open
        onClose={() => {}}
        title="PICP inspector"
        description="empirical coverage"
        fields={[
          { label: "value", value: "0.86" },
          { label: "target", value: "0.90" },
          { label: "absent", value: null },
        ]}
      />,
    );
    expect(screen.getByText("PICP inspector")).toBeInTheDocument();
    expect(screen.getByText("0.86")).toBeInTheDocument();
    expect(screen.getByText("0.90")).toBeInTheDocument();
    // missing value fails closed via FieldRow
    expect(screen.getByText("Not available")).toBeInTheDocument();
  });

  it("renders nothing when closed", () => {
    render(
      <MetricInspectorDrawer open={false} onClose={() => {}} title="hidden" fields={[{ label: "x", value: "1" }]} />,
    );
    expect(screen.queryByText("hidden")).toBeNull();
  });
});
