import React from "react";
import { render, screen } from "@testing-library/react";
import { WeeklyNarrativeCard } from "@/components/operator/WeeklyNarrativeCard";
import type { OperatorWeeklySummary } from "@/lib/bos-api";

const SUMMARY: OperatorWeeklySummary = {
  week_of: "2026-04-14",
  operating_posture: "defensive",
  critical_path: "Permitting in Dallas and Austin drives 80% of delay risk.",
  headline: "Defensive posture — permitting delays drive $410K of risk.",
  key_shifts: ["Miami-Dade raised parking minimums", "Airport Expansion over median"],
  top_risks: [
    {
      label: "Permit drag",
      impact_usd: 410000,
      impact_days: 24,
      time_to_failure_days: 10,
      confidence: "high",
    },
  ],
  recommended_actions: ["Call Dallas permit office."],
};

describe("WeeklyNarrativeCard", () => {
  test("renders the operating posture pill", () => {
    render(<WeeklyNarrativeCard summary={SUMMARY} />);
    expect(document.body.textContent).toMatch(/defensive\s+posture/i);
  });

  test("renders the critical path callout", () => {
    render(<WeeklyNarrativeCard summary={SUMMARY} />);
    expect(screen.getByText(/critical path/i)).toBeInTheDocument();
    expect(document.body.textContent).toMatch(/drives 80%/i);
  });

  test("renders a time-to-failure urgency pill when ttf <= 14", () => {
    render(<WeeklyNarrativeCard summary={SUMMARY} />);
    expect(screen.getByText(/10d to failure/i)).toBeInTheDocument();
  });

  test("renders recommended actions numbered", () => {
    render(<WeeklyNarrativeCard summary={SUMMARY} />);
    expect(screen.getByText(/Call Dallas permit office\./)).toBeInTheDocument();
  });
});
