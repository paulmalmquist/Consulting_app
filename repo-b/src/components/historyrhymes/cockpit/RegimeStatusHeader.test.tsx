import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { RegimeStatusHeader } from "./RegimeStatusHeader";
import type { HrState, HrDecision } from "@/lib/historyrhymes/client";

const STATE: HrState = {
  latest_brief_id: "b1",
  latest_brief_at: "2026-06-10T08:00:00Z",
  latest_snapshot_id: "s1",
  latest_snapshot_at: "2026-06-11T08:00:00Z",
  latest_decision_id: "d1",
  latest_decision_at: "2026-06-11T09:00:00Z",
  latest_regime: "late_cycle",
  latest_confidence: 0.62,
  worst_input_age_hours: 26.4,
  freshness_verdict: "fresh",
};

const DECISION = {
  decision_id: "d1",
  prediction_date: "2026-06-11T09:00:00Z",
  regime: "late_cycle",
  confidence: 0.62,
  positions: [],
  risk: { gross_exposure: 0.4, net_exposure: 0.2, max_position_size: 0.15, stop_loss_logic: "x", volatility_adjustment: "y" },
  alerts: [],
  execution_tasks: [],
  source_brief_id: "b1",
  source_snapshot_id: "s1",
  source: "daily_decision_job",
  created_at: "2026-06-11T09:00:00Z",
} as HrDecision;

describe("RegimeStatusHeader", () => {
  it("renders regime, confidence, verdict, and input age from live data", () => {
    render(<RegimeStatusHeader state={STATE} decision={DECISION} />);
    expect(screen.getByTestId("hr-regime-value").textContent).toBe("late cycle");
    expect(screen.getByTestId("hr-confidence").textContent).toContain("0.62");
    expect(screen.getByTestId("hr-input-age").textContent).toBe("26.4h");
    expect(screen.getByText("fresh")).toBeTruthy();
  });

  it("never renders blank: all-null inputs produce explicit fallback strings", () => {
    render(<RegimeStatusHeader state={null} decision={null} />);
    expect(screen.getByTestId("hr-regime-value").textContent).toBe(
      "unknown — no decision or brief on record",
    );
    expect(screen.getByTestId("hr-confidence").textContent).toContain("unavailable");
    expect(screen.getByTestId("hr-input-age").textContent).toBe("unknown — state unavailable");
    expect(screen.getByText("state unavailable")).toBeTruthy();
    expect(screen.getAllByText(/no (brief|snapshot|decision) on record/).length).toBe(3);
  });

  it("renders the 9999-hour sentinel as 'no inputs on record', not a number", () => {
    render(
      <RegimeStatusHeader
        state={{ ...STATE, worst_input_age_hours: 9999.0, freshness_verdict: "no_brief", latest_brief_at: null, latest_brief_id: null }}
        decision={null}
      />,
    );
    expect(screen.getByTestId("hr-input-age").textContent).toBe("no inputs on record");
    expect(screen.queryByText(/9999/)).toBeNull();
  });

  it("shows the trap chip as missing until wired, and the summary once provided", () => {
    const { rerender } = render(<RegimeStatusHeader state={STATE} decision={DECISION} />);
    expect(screen.getByTestId("hr-trap-chip").textContent).toContain("missing");
    rerender(<RegimeStatusHeader state={STATE} decision={DECISION} trapSummary="no trap flagged" />);
    expect(screen.getByTestId("hr-trap-chip").textContent).toBe("no trap flagged");
  });

  it("surfaces a degraded reason verbatim when provided", () => {
    render(<RegimeStatusHeader state={STATE} decision={DECISION} degradedReason="no_state_vector" />);
    expect(screen.getByTestId("hr-degraded-note").textContent).toContain("no_state_vector");
  });
});
