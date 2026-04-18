import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { ReviewCycleAnalyzer } from "./ReviewCycleAnalyzer";

vi.mock("@/components/domain/DomainEnvProvider", () => ({
  useDomainEnv: () => ({ envId: "env-hb", businessId: "biz-hb" }),
}));

vi.mock("@/lib/bos-api", () => ({
  getOperatorReviewCycles: vi.fn(),
}));

import { getOperatorReviewCycles } from "@/lib/bos-api";

const MOCK = {
  themes: [
    {
      theme: "panel_sizing",
      total_comments: 3,
      blocking_count: 3,
      unresolved_count: 2,
      affected_project_count: 1,
      avg_resolution_days: 20,
    },
    {
      theme: "utility_capacity",
      total_comments: 2,
      blocking_count: 0,
      unresolved_count: 1,
      affected_project_count: 1,
      avg_resolution_days: 9,
    },
  ],
  repeat_offenders: [
    {
      reviewer_name: "Dallas — J. Herrera",
      reviewer_role: "Electrical Plans Examiner",
      theme: "panel_sizing",
      cycle_count: 3,
      affected_project_count: 1,
      unresolved: 2,
    },
  ],
  cycle_churn: [
    {
      project_id: "airport-expansion",
      project_name: "Airport Expansion",
      max_cycle: 3,
      total_comments: 5,
      unresolved_count: 2,
      blocking_count: 4,
      href: "/lab/env/env-hb/operator/projects/airport-expansion",
    },
  ],
  totals: {
    comment_count: 12,
    unresolved_count: 5,
    blocking_count: 5,
    theme_count: 2,
    repeat_offender_count: 1,
    max_cycle_observed: 3,
  },
};

describe("ReviewCycleAnalyzer", () => {
  beforeEach(() => {
    (getOperatorReviewCycles as ReturnType<typeof vi.fn>).mockReset();
  });

  it("headline names the top theme and repeat offender", async () => {
    (getOperatorReviewCycles as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK);
    render(<ReviewCycleAnalyzer />);
    await waitFor(() => {
      const headline = screen.getByTestId("review-churn-headline");
      expect(headline.textContent).toMatch(/panel sizing/i);
      expect(headline.textContent).toMatch(/Dallas — J\. Herrera/);
      expect(headline.textContent).toMatch(/3×/);
    });
  });

  it("renders theme rows with blocking pill when blocking_count > 0", async () => {
    (getOperatorReviewCycles as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK);
    render(<ReviewCycleAnalyzer />);
    await waitFor(() => {
      const row = screen.getByTestId("review-theme-panel_sizing");
      expect(row.textContent).toMatch(/3 blocking/);
    });
  });

  it("shows repeat offender row", async () => {
    (getOperatorReviewCycles as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK);
    render(<ReviewCycleAnalyzer />);
    await waitFor(() => {
      expect(screen.getByTestId("review-offender-0").textContent).toMatch(/Dallas — J\. Herrera/);
    });
  });

  it("colors max_cycle ≥3 red for airport expansion", async () => {
    (getOperatorReviewCycles as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK);
    render(<ReviewCycleAnalyzer />);
    await waitFor(() => {
      const row = screen.getByTestId("review-churn-airport-expansion");
      const cycleCell = row.querySelector("td:nth-child(2)");
      expect(cycleCell?.className).toContain("red");
      expect(cycleCell?.textContent).toMatch(/Cycle 3/);
    });
  });
});
