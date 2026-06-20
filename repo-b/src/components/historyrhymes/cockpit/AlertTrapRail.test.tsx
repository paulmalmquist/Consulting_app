import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { AlertTrapRail } from "./AlertTrapRail";
import { makeMatch } from "@/lib/historyrhymes/rhymesFixtures";
import type { StructuralAlert } from "@/lib/historyrhymes/rhymesClient";
import type { Alert } from "@/lib/historyrhymes/client";

const STRUCTURAL: StructuralAlert = {
  id: "al-1",
  alert_type: "hoyt_convergence",
  severity: "warning",
  hoyt_position: 17.2,
  trigger_signals: { vix_spike: true },
  narrative: "Hoyt cycle position approaching the historical peak window.",
  alert_date: "2026-06-11",
};

const DECISION_ALERT: Alert = {
  type: "crowding",
  message: "Long-duration positioning is crowded.",
  action: "reduce",
};

describe("AlertTrapRail", () => {
  it("distinguishes feed-unreachable (null) from no-alerts (empty)", () => {
    const { rerender } = render(
      <AlertTrapRail structuralAlerts={null} decisionAlerts={[]} trap={null} trapSummary={null} />,
    );
    expect(screen.getByTestId("hr-alerts-unreachable").textContent).toContain("alert feed unreachable");

    rerender(
      <AlertTrapRail structuralAlerts={[]} decisionAlerts={[]} trap={null} trapSummary={null} />,
    );
    expect(screen.getByTestId("hr-alerts-clear").textContent).toContain("no unacknowledged structural alerts");
    // No greenwashing: the empty state must not claim safety.
    expect(screen.getByTestId("hr-alerts-clear").textContent).toContain("not a safety claim");
  });

  it("renders structural and decision alerts with type, severity, and action", () => {
    render(
      <AlertTrapRail structuralAlerts={[STRUCTURAL]} decisionAlerts={[DECISION_ALERT]}
        trap={makeMatch().trap_detector} trapSummary="v1 — not computing" />,
    );
    const structural = screen.getByTestId("hr-structural-alert");
    expect(structural.getAttribute("data-severity")).toBe("warning");
    expect(structural.textContent).toContain("hoyt_convergence");
    expect(structural.textContent).toContain("hoyt position: 17.2");
    const decision = screen.getByTestId("hr-decision-alert");
    expect(decision.textContent).toContain("crowding");
    expect(decision.textContent).toContain("action: reduce");
    expect(screen.getByTestId("hr-trap-panel").textContent).toBe("v1 — not computing");
    expect(screen.getAllByText(/not computed \(v1\)/).length).toBe(3);
  });

  it("acknowledge optimistically removes and stays removed on success", async () => {
    const onAcknowledge = vi.fn().mockResolvedValue(true);
    render(
      <AlertTrapRail structuralAlerts={[STRUCTURAL]} decisionAlerts={[]} trap={null}
        trapSummary={null} onAcknowledge={onAcknowledge} />,
    );
    fireEvent.click(screen.getByTestId("hr-ack-al-1"));
    await waitFor(() => expect(screen.queryByTestId("hr-structural-alert")).toBeNull());
    expect(onAcknowledge).toHaveBeenCalledWith("al-1");
  });

  it("acknowledge failure reverts the removal and surfaces an inline error", async () => {
    const onAcknowledge = vi.fn().mockResolvedValue(false);
    render(
      <AlertTrapRail structuralAlerts={[STRUCTURAL]} decisionAlerts={[]} trap={null}
        trapSummary={null} onAcknowledge={onAcknowledge} />,
    );
    fireEvent.click(screen.getByTestId("hr-ack-al-1"));
    await waitFor(() => expect(screen.getByTestId("hr-ack-error")).toBeTruthy());
    expect(screen.getByTestId("hr-structural-alert")).toBeTruthy();
    expect(screen.getByTestId("hr-ack-error").textContent).toContain("acknowledge failed");
  });

  it("null decision renders 'no decision on record', not an empty list", () => {
    render(<AlertTrapRail structuralAlerts={[]} decisionAlerts={null} trap={null} trapSummary={null} />);
    expect(screen.getByText(/no decision on record/)).toBeTruthy();
  });
});
