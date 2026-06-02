import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { EnhancementCandidateCard } from "./EnhancementCandidateCard";
import type { EnhancementCandidate } from "@/lib/historyrhymes/client";

const base: EnhancementCandidate = {
  candidate_id: "c1",
  brief_id: "b1",
  title: "Add MVRV-Z divergence signal",
  category: "signal",
  what: "Add an MVRV-Z divergence feature",
  why: "90%+ historical hit rate",
  effort_days: 3,
  expected_impact: "High",
  dependencies: ["FRED loader"],
  priority: "high",
  confidence: null,
  adversarial_verdict: "PASS",
  status: "new",
};

describe("EnhancementCandidateCard", () => {
  it("renders candidate fields, verdict and dependencies", () => {
    render(
      <EnhancementCandidateCard
        candidate={base}
        onPromote={vi.fn()}
        onDiscard={vi.fn()}
        onViewPlan={vi.fn()}
      />,
    );
    expect(screen.getByText("Add MVRV-Z divergence signal")).toBeTruthy();
    expect(screen.getByText("PASS")).toBeTruthy();
    expect(screen.getByText("FRED loader")).toBeTruthy();
    expect(screen.getByText("3d")).toBeTruthy();
  });

  it("invokes the action callbacks", () => {
    const onPromote = vi.fn();
    const onDiscard = vi.fn();
    const onViewPlan = vi.fn();
    render(
      <EnhancementCandidateCard
        candidate={base}
        onPromote={onPromote}
        onDiscard={onDiscard}
        onViewPlan={onViewPlan}
      />,
    );
    fireEvent.click(screen.getByText("Promote"));
    fireEvent.click(screen.getByText("Discard"));
    fireEvent.click(screen.getByText("View plan"));
    expect(onPromote).toHaveBeenCalledWith("c1");
    expect(onDiscard).toHaveBeenCalledWith("c1");
    expect(onViewPlan).toHaveBeenCalledWith("c1");
  });

  it("disables Promote when already promoted", () => {
    render(
      <EnhancementCandidateCard
        candidate={{ ...base, status: "promoted" }}
        onPromote={vi.fn()}
        onDiscard={vi.fn()}
        onViewPlan={vi.fn()}
      />,
    );
    const btn = screen.getByText("Promote") as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });
});
