import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import type { PromotionCandidate } from "@/lib/historyrhymes/promotions";

import { EvidenceGatePanel } from "./EvidenceGatePanel";
import { NoLookaheadAuditPanel } from "./NoLookaheadAuditPanel";
import { NonEventCoveragePanel } from "./NonEventCoveragePanel";
import { PromotionActionBar } from "./PromotionActionBar";
import { PromotionCandidateQueue } from "./PromotionCandidateQueue";
import { ReceiptHistoryPanel } from "./ReceiptHistoryPanel";

function candidate(over: Partial<PromotionCandidate> = {}): PromotionCandidate {
  return {
    candidate_id: "c1", approval_status: "needs_review", observation_id: "obs-1",
    candidate_type: "non_event_anchor", candidate_label: "non_event",
    calibration_evidence_json: { brier_score: 0.18 },
    no_lookahead_audit_json: { passed: true, violations: [] },
    non_event_context_json: { crisis_anchor_count: 2, non_event_count: 6, non_event_to_event_ratio: 3, coverage_status: "pass" },
    features_snapshot: { vix: 0.7 }, lineage_json: { inputs: ["fred:VIXCLS"] },
    narrative_summary: "x", proposed_episode_name: "n", proposed_asset_class: "macro",
    allowed_actions: ["approved", "rejected", "needs_evidence"],
    ...over,
  };
}

describe("EvidenceGatePanel", () => {
  it("shows exact blocked reason strings, not a generic banner", () => {
    render(<EvidenceGatePanel candidate={candidate({
      calibration_evidence_json: {}, lineage_json: {},
      blocked_reasons: ["missing_calibration_evidence", "missing_lineage"],
    })} />);
    expect(screen.getByTestId("gate-reason-calibration").textContent).toBe("missing_calibration_evidence");
    expect(screen.getByTestId("gate-reason-lineage").textContent).toBe("missing_lineage");
    const blob = screen.getByTestId("gate-blocked-reasons").textContent ?? "";
    expect(blob).toContain("missing_calibration_evidence");
    expect(blob).not.toContain("validation failed");
  });
});

describe("NonEventCoveragePanel", () => {
  it("warns + flags override when ratio below target", () => {
    render(<NonEventCoveragePanel candidate={candidate({
      non_event_context_json: { crisis_anchor_count: 4, non_event_count: 2, non_event_to_event_ratio: 0.5, coverage_status: "below_target", override_required: true },
    })} />);
    expect(screen.getByTestId("coverage-override-warning").textContent).toContain("audited override reason");
  });

  it("no warning when coverage passes", () => {
    render(<NonEventCoveragePanel candidate={candidate()} />);
    expect(screen.queryByTestId("coverage-override-warning")).toBeNull();
  });
});

describe("NoLookaheadAuditPanel", () => {
  it("renders a failed audit as non-overridable", () => {
    render(<NoLookaheadAuditPanel candidate={candidate({
      no_lookahead_audit_json: { passed: false, violations: ["feature:forward_return_30d"] },
    })} />);
    expect(screen.getByTestId("lookahead-result").textContent).toBe("fail");
    expect(screen.getByTestId("lookahead-non-overridable").textContent).toContain("cannot be approved");
  });
});

describe("PromotionActionBar", () => {
  const handlers = {
    needsEvidence: vi.fn(async () => ({ kind: "ok" } as const)),
    needsReview: vi.fn(async () => ({ kind: "ok" } as const)),
    approve: vi.fn(async () => ({ kind: "ok" } as const)),
    reject: vi.fn(async () => ({ kind: "ok" } as const)),
    supersede: vi.fn(async () => ({ kind: "ok" } as const)),
    linkEpisode: vi.fn(async () => ({ kind: "ok" } as const)),
    refresh: vi.fn(),
  };

  it("only enables actions in allowed_actions", () => {
    render(<PromotionActionBar candidate={candidate({ allowed_actions: ["approved", "rejected"] })} handlers={handlers as never} />);
    expect(screen.getByTestId("action-approve")).not.toBeDisabled();
    // needs_review not in allowed_actions → disabled
    expect(screen.getByTestId("action-needs-review")).toBeDisabled();
    // link target (promoted) not allowed → disabled
    expect(screen.getByTestId("action-link")).toBeDisabled();
  });

  it("disables approve when no-lookahead failed even if status allows it", () => {
    render(<PromotionActionBar candidate={candidate({
      allowed_actions: ["approved"], no_lookahead_audit_json: { passed: false, violations: [] },
    })} handlers={handlers as never} />);
    expect(screen.getByTestId("action-approve")).toBeDisabled();
  });

  it("approve posts via the approve handler", async () => {
    const h = { ...handlers, approve: vi.fn(async () => ({ kind: "ok" } as const)) };
    render(<PromotionActionBar candidate={candidate({ allowed_actions: ["approved"] })} handlers={h as never} />);
    fireEvent.click(screen.getByTestId("action-approve"));
    expect(h.approve).toHaveBeenCalled();
  });

  it("reject requires a reason before enabling", () => {
    render(<PromotionActionBar candidate={candidate({ allowed_actions: ["rejected"] })} handlers={handlers as never} />);
    expect(screen.getByTestId("action-reject")).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Rejection reason"), { target: { value: "no" } });
    expect(screen.getByTestId("action-reject")).not.toBeDisabled();
  });

  it("supersede requires a replacement id before enabling", () => {
    render(<PromotionActionBar candidate={candidate({ allowed_actions: ["superseded"] })} handlers={handlers as never} />);
    expect(screen.getByTestId("action-supersede")).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Superseded by candidate id"), { target: { value: "c2" } });
    expect(screen.getByTestId("action-supersede")).not.toBeDisabled();
  });

  it("link copy says it does not create episodes or embeddings", () => {
    render(<PromotionActionBar candidate={candidate({ allowed_actions: ["promoted"] })} handlers={handlers as never} />);
    expect(screen.getByText(/does not create an episode or write embeddings/i)).toBeTruthy();
  });
});

describe("ReceiptHistoryPanel", () => {
  it("renders prior receipt versions", () => {
    render(<ReceiptHistoryPanel candidate={candidate({
      promotion_receipt_json: { version: 2, approval_actor: "paul", receipt_history: [{ approval_status: "approved" }] },
    })} />);
    expect(screen.getByTestId("receipt-version").textContent).toBe("2");
    expect(screen.getByTestId("receipt-history-count").textContent).toContain("1 prior receipt");
  });
});

describe("PromotionCandidateQueue", () => {
  it("renders the empty-state explaining observations are not episodes", () => {
    render(<PromotionCandidateQueue candidates={[]} onSelect={() => {}} />);
    expect(screen.getByTestId("hr-queue-empty").textContent).toContain("separate from historical episodes");
  });

  it("renders rows with status + leakage badge and selects on click", () => {
    const onSelect = vi.fn();
    render(<PromotionCandidateQueue
      candidates={[candidate({ candidate_id: "cx", no_lookahead_audit_json: { passed: false, violations: [] } })]}
      onSelect={onSelect} />);
    expect(screen.getByTestId("badge-leakage-cx")).toBeTruthy();
    fireEvent.click(screen.getByTestId("queue-row-cx"));
    expect(onSelect).toHaveBeenCalledWith("cx");
  });
});
