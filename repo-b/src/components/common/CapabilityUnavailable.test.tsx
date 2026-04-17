import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import CapabilityUnavailable from "./CapabilityUnavailable";
import { CAPABILITY_STATE_META } from "@/lib/lab/capability-state-taxonomy";

describe("CapabilityUnavailable", () => {
  it("defaults to state=not_enabled and renders the taxonomy copy", () => {
    render(<CapabilityUnavailable capabilityKey="repe.waterfall" title="Waterfall Engine" />);
    const root = screen.getByTestId("capability-unavailable");
    expect(root).toHaveAttribute("data-state", "not_enabled");
    expect(screen.getByText("Waterfall Engine")).toBeInTheDocument();
    expect(screen.getByText("repe.waterfall")).toBeInTheDocument();
    // Pill shows the taxonomy label
    expect(screen.getByTestId("capability-state-pill").textContent).toBe(
      CAPABILITY_STATE_META.not_enabled.pillLabel,
    );
  });

  it("exposes capability key as data attribute for telemetry", () => {
    render(<CapabilityUnavailable capabilityKey="credit.portfolio" title="Portfolio" />);
    const el = screen.getByTestId("capability-unavailable");
    expect(el).toHaveAttribute("data-capability-key", "credit.portfolio");
  });

  it("renders optional moduleLabel + note + custom adminHint", () => {
    render(
      <CapabilityUnavailable
        capabilityKey="pds.exec"
        title="Executive Dashboard"
        moduleLabel="PDS Reporting"
        note="Requires the Q2 close to be sealed before metrics populate."
        adminHint="Open a request in #pds-ops."
      />,
    );
    expect(screen.getByText("PDS Reporting")).toBeInTheDocument();
    expect(screen.getByTestId("capability-unavailable-note").textContent).toContain(
      "Q2 close",
    );
    expect(screen.getByText("Open a request in #pds-ops.")).toBeInTheDocument();
  });

  it.each([
    ["preview", CAPABILITY_STATE_META.preview.pillLabel] as const,
    ["temporary_error", CAPABILITY_STATE_META.temporary_error.pillLabel] as const,
    ["experimental_partial", CAPABILITY_STATE_META.experimental_partial.pillLabel] as const,
    ["archived", CAPABILITY_STATE_META.archived.pillLabel] as const,
  ])("renders state=%s with the correct pill copy", (state, expectedPill) => {
    render(
      <CapabilityUnavailable
        state={state as "preview" | "temporary_error" | "experimental_partial" | "archived"}
        capabilityKey="demo.thing"
        title="Demo"
      />,
    );
    const root = screen.getByTestId("capability-unavailable");
    expect(root).toHaveAttribute("data-state", state);
    expect(screen.getByTestId("capability-state-pill").textContent).toBe(expectedPill);
  });

  it("temporary_error renders the passed note (e.g. backend error message)", () => {
    render(
      <CapabilityUnavailable
        state="temporary_error"
        capabilityKey="consulting.loops"
        title="Loop Intelligence"
        note="API returned 503"
      />,
    );
    expect(screen.getByTestId("capability-unavailable-note").textContent).toBe(
      "API returned 503",
    );
  });
});
