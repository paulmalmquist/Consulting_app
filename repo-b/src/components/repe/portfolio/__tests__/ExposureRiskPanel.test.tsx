import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import ExposureRiskPanel from "@/components/repe/portfolio/ExposureRiskPanel";
import type { ReV2FundInvestmentRollupRow, FiCovenantResult } from "@/lib/bos-api";

function investment(overrides: Partial<ReV2FundInvestmentRollupRow> = {}): ReV2FundInvestmentRollupRow {
  return {
    investment_id: "inv",
    name: "Investment",
    fund_nav_contribution: 100_000_000,
    sector_mix: { Office: 1 },
    primary_market: "New York",
    ...overrides,
  };
}

describe("ExposureRiskPanel", () => {
  it("renders top sector and geography exposures with percentages", () => {
    const rollup = [
      investment({ investment_id: "a", fund_nav_contribution: 600_000_000, sector_mix: { Office: 1 }, primary_market: "New York" }),
      investment({ investment_id: "b", fund_nav_contribution: 400_000_000, sector_mix: { Industrial: 1 }, primary_market: "Dallas" }),
    ];
    render(<ExposureRiskPanel rollup={rollup} />);
    expect(screen.getByText("Office")).toBeInTheDocument();
    expect(screen.getByText("Industrial")).toBeInTheDocument();
    expect(screen.getByText("New York")).toBeInTheDocument();
    expect(screen.getByText("Dallas")).toBeInTheDocument();
    expect(screen.getAllByText("60.0%").length).toBeGreaterThan(0);
    expect(screen.getAllByText("40.0%").length).toBeGreaterThan(0);
  });

  it("highlights a sector that exceeds the 25% concentration threshold via warning tone", () => {
    const rollup = [
      investment({ investment_id: "big", fund_nav_contribution: 800_000_000, sector_mix: { Office: 1 } }),
      investment({ investment_id: "small", fund_nav_contribution: 200_000_000, sector_mix: { Retail: 1 } }),
    ];
    const { container } = render(<ExposureRiskPanel rollup={rollup} />);
    const flagList = container.querySelector('[data-testid="exposure-risk-flags"]');
    expect(flagList?.textContent ?? "").toContain("Sector concentration in Office");
  });

  it("shows DSCR watchlist when any investment is below 1.20x", () => {
    const rollup = [
      investment({ investment_id: "x", name: "Leveraged", computed_dscr: 1.05, fund_nav_contribution: 100 }),
    ];
    const { container } = render(<ExposureRiskPanel rollup={rollup} />);
    const flagList = container.querySelector('[data-testid="exposure-risk-flags"]');
    expect(flagList?.textContent ?? "").toContain("Leveraged DSCR at 1.05x");
  });

  it("surfaces covenant breach from FiCovenantResult[]", () => {
    const covenants: FiCovenantResult[] = [
      {
        id: "cov-1",
        run_id: "r",
        fund_id: "f",
        loan_id: "l",
        quarter: "2025Q4",
        dscr: 0.95,
        ltv: null,
        debt_yield: null,
        pass: false,
        headroom: -0.05,
        breached: true,
        created_at: "2025-12-31",
      },
    ];
    render(<ExposureRiskPanel rollup={[investment()]} covenants={covenants} />);
    expect(screen.getByText(/Loan covenant breach/)).toBeInTheDocument();
  });

  it("renders 'Awaiting sector allocation' (not 'No data') when rollup is empty", () => {
    render(<ExposureRiskPanel rollup={[]} />);
    const matches = screen.getAllByText("Awaiting sector allocation");
    expect(matches.length).toBeGreaterThan(0);
    expect(screen.queryByText(/no data|n\/a|pending/i)).toBeNull();
  });

  it("renders empty-state for flags without engineering placeholder text", () => {
    const rollup = [
      investment({ investment_id: "x", name: "Clean A", fund_nav_contribution: 100, sector_mix: { Office: 1 }, primary_market: "NY" }),
      investment({ investment_id: "y", name: "Clean B", fund_nav_contribution: 100, sector_mix: { Industrial: 1 }, primary_market: "Dallas" }),
      investment({ investment_id: "z", name: "Clean C", fund_nav_contribution: 100, sector_mix: { Retail: 1 }, primary_market: "Miami" }),
      investment({ investment_id: "w", name: "Clean D", fund_nav_contribution: 100, sector_mix: { Hotel: 1 }, primary_market: "Austin" }),
      investment({ investment_id: "v", name: "Clean E", fund_nav_contribution: 100, sector_mix: { Multifamily: 1 }, primary_market: "Seattle" }),
      investment({ investment_id: "u", name: "Clean F", fund_nav_contribution: 100, sector_mix: { DataCenter: 1 }, primary_market: "Chicago" }),
    ];
    render(<ExposureRiskPanel rollup={rollup} />);
    expect(screen.getByText("No risk flags above thresholds")).toBeInTheDocument();
  });

  it("renders snapshot version for audit provenance", () => {
    render(<ExposureRiskPanel rollup={[investment()]} snapshotVersion="v2025.12.31" />);
    expect(screen.getByText("v2025.12.31")).toBeInTheDocument();
  });
});
