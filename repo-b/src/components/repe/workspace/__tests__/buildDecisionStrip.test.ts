import { describe, expect, it } from "vitest";
import { buildDecisionStrip } from "@/components/repe/workspace/buildDecisionStrip";
import type {
  FiCovenantResult,
  ReV2FundInvestmentRollupRow,
  ReV2FundQuarterState,
} from "@/lib/bos-api";

function investment(
  overrides: Partial<ReV2FundInvestmentRollupRow> = {}
): ReV2FundInvestmentRollupRow {
  return {
    investment_id: overrides.investment_id ?? "inv-x",
    name: overrides.name ?? "Investment",
    fund_nav_contribution: 100_000_000,
    gross_irr: 0.12,
    computed_dscr: 1.5,
    computed_ltv: 0.55,
    sector_mix: { Office: 1 },
    primary_market: "New York",
    ...overrides,
  };
}

const FUND_STATE: ReV2FundQuarterState = {
  id: "q",
  fund_id: "fund-1",
  quarter: "2025Q4",
  run_id: "run-1",
  portfolio_nav: 1_000_000_000,
  inputs_hash: "hash",
  created_at: "2025-12-31",
};

describe("buildDecisionStrip", () => {
  it("flags sector concentration above threshold", () => {
    const rollup = [
      investment({
        investment_id: "a",
        name: "Office Mega",
        fund_nav_contribution: 600_000_000,
        sector_mix: { Office: 1 },
        primary_market: "New York",
      }),
      investment({
        investment_id: "b",
        name: "Industrial",
        fund_nav_contribution: 400_000_000,
        sector_mix: { Industrial: 1 },
        primary_market: "Dallas",
      }),
    ];
    const out = buildDecisionStrip({ fundState: FUND_STATE, investmentRollup: rollup });
    expect(out.issues.some((issue) => issue.key.startsWith("concentration:sector:Office"))).toBe(true);
  });

  it("lists underperformers with negative IRR in issues", () => {
    const rollup = [
      investment({ investment_id: "u1", name: "Distressed Retail", gross_irr: -0.08 }),
      investment({ investment_id: "ok", name: "Performer", gross_irr: 0.18 }),
    ];
    const out = buildDecisionStrip({ fundState: FUND_STATE, investmentRollup: rollup });
    const underperformer = out.issues.find((issue) => issue.key === "underperformer:u1");
    expect(underperformer).toBeDefined();
    expect(underperformer?.severity).toBe("high");
  });

  it("orders issues with high severity first", () => {
    const rollup = [
      investment({ investment_id: "under", name: "Underperformer", gross_irr: -0.1 }),
      investment({
        investment_id: "leverage",
        name: "Leveraged",
        computed_dscr: 1.1,
        gross_irr: 0.1,
      }),
    ];
    const out = buildDecisionStrip({ fundState: FUND_STATE, investmentRollup: rollup });
    expect(out.issues[0].severity).toBe("high");
  });

  it("surfaces covenant breaches from FiCovenantResult", () => {
    const covenants: FiCovenantResult[] = [
      {
        id: "cov-1",
        run_id: "run",
        fund_id: "f",
        loan_id: "loan",
        quarter: "2025Q4",
        dscr: 0.9,
        ltv: 0.82,
        debt_yield: null,
        pass: false,
        headroom: -0.1,
        breached: true,
        created_at: "2025-12-31",
      },
    ];
    const out = buildDecisionStrip({
      fundState: FUND_STATE,
      investmentRollup: [investment()],
      covenants,
    });
    expect(out.issues.some((issue) => issue.key.startsWith("covenant:"))).toBe(true);
  });

  it("produces top NAV drivers when fund NAV is known", () => {
    const rollup = [
      investment({ investment_id: "d1", name: "Anchor", fund_nav_contribution: 500_000_000 }),
      investment({ investment_id: "d2", name: "Secondary", fund_nav_contribution: 300_000_000 }),
      investment({ investment_id: "d3", name: "Tail", fund_nav_contribution: 50_000_000 }),
    ];
    const out = buildDecisionStrip({ fundState: FUND_STATE, investmentRollup: rollup });
    expect(out.drivers.length).toBeGreaterThan(0);
    expect(out.drivers[0].key).toBe("driver:d1");
    expect(out.drivers[0].headline).toContain("Anchor");
  });

  it("anti-restate rule: recommendation does not echo top issue verbatim", () => {
    const rollup = [
      investment({
        investment_id: "bad",
        name: "Suburban Office Park",
        gross_irr: -0.15,
        fund_nav_contribution: 200_000_000,
      }),
      investment({
        investment_id: "good",
        name: "Industrial Complex",
        fund_nav_contribution: 600_000_000,
      }),
    ];
    const out = buildDecisionStrip({ fundState: FUND_STATE, investmentRollup: rollup });

    expect(out.recommendation).not.toBeNull();
    // If recommendation exists, it must propose an action (exit/recap/rebalance/follow-on) rather than just restate the issue.
    const topIssueHeadline = out.issues[0]?.headline ?? "";
    expect(out.recommendation!.action).not.toBe(topIssueHeadline);
    expect(out.recommendation!.action.toLowerCase()).toMatch(/exit|recap|rebalance|refinanc|follow-on|lender|evaluate|plan|model/);
  });

  it("happy path: diversified fund has no issues and emits a follow-on driver recommendation", () => {
    const sectors = ["Office", "Industrial", "Multifamily", "Retail", "Hotel", "DataCenter"];
    const markets = ["New York", "Dallas", "Austin", "Miami", "Seattle", "Chicago"];
    const rollup = sectors.map((sector, idx) =>
      investment({
        investment_id: `inv-${idx}`,
        name: `Asset ${idx}`,
        gross_irr: 0.1 + idx * 0.01,
        fund_nav_contribution: 100_000_000,
        sector_mix: { [sector]: 1 },
        primary_market: markets[idx],
      })
    );
    const out = buildDecisionStrip({
      fundState: { ...FUND_STATE, portfolio_nav: 600_000_000 },
      investmentRollup: rollup,
    });
    expect(out.issues).toHaveLength(0);
    expect(out.recommendation).not.toBeNull();
    expect(out.recommendation?.severity).toBe("low");
  });

  it("handles empty inputs without throwing and emits no_candidate_available", () => {
    const out = buildDecisionStrip({ fundState: null, investmentRollup: [] });
    expect(out.issues).toHaveLength(0);
    expect(out.drivers).toHaveLength(0);
    expect(out.recommendation).toBeNull();
    expect(out.recommendationRejectionReason).toBe("no_candidate_available");
  });
});
