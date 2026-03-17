import { describe, expect, it } from "vitest";
import { computeFundBaseScenario, computeXirr } from "./reBaseScenario";

type MockQueryResult = { rows: Record<string, unknown>[] };

function buildMockPool(includeScenarioAssumption = false) {
  return {
    async query(sql: string): Promise<MockQueryResult> {
      if (sql.includes("FROM repe_fund_term")) {
        return {
          rows: [
            {
              preferred_return_rate: 0.08,
              carry_rate: 0.2,
              management_fee_rate: 0.015,
              management_fee_basis: "committed",
              waterfall_style: "european",
              catch_up_style: "full",
            },
          ],
        };
      }

      if (sql.includes("FROM repe_fund")) {
        return {
          rows: [
            {
              fund_id: "fund-1",
              fund_name: "Meridian Fund I",
              target_size: 100,
              inception_date: "2024-01-01",
            },
          ],
        };
      }

      if (sql.includes("FROM re_waterfall_definition")) {
        return { rows: [] };
      }

      if (sql.includes("FROM re_waterfall_tier")) {
        return { rows: [] };
      }

      if (sql.includes("FROM repe_asset a") && sql.includes("LEFT JOIN latest_qs lqs")) {
        return {
          rows: [
            {
              asset_id: "asset-active",
              asset_name: "Aurora Logistics Park",
              asset_status: "active",
              investment_id: "deal-active",
              investment_name: "Aurora Logistics Park",
              investment_stage: "operating",
              committed_capital: 60,
              invested_capital: 60,
              realized_distributions: 0,
              cost_basis: 60,
              property_type: "industrial",
              market: "Dallas",
              ownership_percent: 0.8,
              noi: 8,
              net_cash_flow: 5,
              asset_value: 150,
              nav: 90,
              debt_balance: 60,
              cash_balance: 0,
              occupancy: 0.95,
              valuation_method: "cap_rate",
            },
            {
              asset_id: "asset-exit",
              asset_name: "Legacy Retail Center",
              asset_status: "exited",
              investment_id: "deal-exit",
              investment_name: "Legacy Retail Center",
              investment_stage: "exited",
              committed_capital: 40,
              invested_capital: 40,
              realized_distributions: 36,
              cost_basis: 40,
              property_type: "retail",
              market: "Atlanta",
              ownership_percent: 1,
              noi: 0,
              net_cash_flow: 0,
              asset_value: 0,
              nav: 0,
              debt_balance: 0,
              cash_balance: 0,
              occupancy: 0,
              valuation_method: "sale",
            },
          ],
        };
      }

      if (sql.includes("FROM re_asset_realization")) {
        return {
          rows: [
            {
              asset_id: "asset-exit",
              sale_date: "2025-11-15",
              gross_sale_price: 50,
              sale_costs: 2,
              debt_payoff: 12,
              net_sale_proceeds: 36,
              attributable_proceeds: 36,
              source: "seed",
              notes: "Historical seeded exit",
            },
          ],
        };
      }

      if (sql.includes("FROM re_sale_assumption")) {
        return includeScenarioAssumption
          ? {
              rows: [
                {
                  id: 11,
                  deal_id: "deal-active",
                  asset_id: "asset-active",
                  sale_price: 170,
                  sale_date: "2026-06-30",
                  buyer_costs: 3,
                  disposition_fee_pct: 0.02,
                },
              ],
            }
          : { rows: [] };
      }

      if (sql.includes("FROM re_partner p") && sql.includes("re_partner_commitment")) {
        return {
          rows: [
            {
              partner_id: "lp-1",
              name: "State Pension Fund",
              partner_type: "lp",
              committed: 80,
              contributed: 80,
              distributed: 8,
            },
            {
              partner_id: "gp-1",
              name: "Winston Capital",
              partner_type: "gp",
              committed: 20,
              contributed: 20,
              distributed: 2,
            },
          ],
        };
      }

      if (sql.includes("FROM re_capital_ledger_entry") && sql.includes("effective_date::text")) {
        return {
          rows: [
            {
              partner_id: "lp-1",
              entry_type: "contribution",
              amount: 80,
              effective_date: "2024-01-15",
            },
            {
              partner_id: "gp-1",
              entry_type: "contribution",
              amount: 20,
              effective_date: "2024-01-15",
            },
            {
              partner_id: "lp-1",
              entry_type: "distribution",
              amount: 8,
              effective_date: "2025-01-15",
            },
            {
              partner_id: "gp-1",
              entry_type: "distribution",
              amount: 2,
              effective_date: "2025-01-15",
            },
          ],
        };
      }

      if (sql.includes("FROM re_fee_accrual_qtr") || sql.includes("FROM re_fund_expense_qtr")) {
        return { rows: [{ total: 0 }] };
      }

      throw new Error(`Unhandled query in test: ${sql}`);
    },
  };
}

describe("reBaseScenario", () => {
  it("computes xirr for a simple contribution and payoff stream", () => {
    const irr = computeXirr([
      { amount: -100, date: new Date("2024-01-01T00:00:00.000Z") },
      { amount: 125, date: new Date("2025-01-01T00:00:00.000Z") },
    ]);

    expect(irr).not.toBeNull();
    expect(irr as number).toBeGreaterThan(0.24);
    expect(irr as number).toBeLessThan(0.26);
  });

  it("bridges realized exits, active marks, and hypothetical sale assumptions into fund returns", async () => {
    const baseScenario = await computeFundBaseScenario({
      pool: buildMockPool(false) as unknown as import("pg").Pool,
      fundId: "fund-1",
      quarter: "2026Q1",
      liquidationMode: "current_state",
    });
    const saleScenario = await computeFundBaseScenario({
      pool: buildMockPool(true) as unknown as import("pg").Pool,
      fundId: "fund-1",
      quarter: "2026Q1",
      scenarioId: "scenario-1",
      liquidationMode: "hypothetical_sale",
    });

    expect(baseScenario.summary.realized_proceeds).toBe(36);
    expect(baseScenario.summary.attributable_nav).toBe(72);
    expect(baseScenario.summary.remaining_value).toBe(98);
    expect(baseScenario.summary.paid_in_capital).toBe(100);
    expect(baseScenario.summary.distributed_capital).toBe(10);
    expect(baseScenario.summary.dpi).toBe(0.1);
    expect(baseScenario.summary.rvpi).toBe(0.98);
    expect(baseScenario.summary.tvpi).toBe(1.08);
    expect(baseScenario.waterfall.tiers.length).toBeGreaterThan(0);

    expect(saleScenario.summary.remaining_value).toBeGreaterThan(baseScenario.summary.remaining_value);
    expect(saleScenario.summary.tvpi!).toBeGreaterThan(baseScenario.summary.tvpi!);
    expect(
      saleScenario.assets.find((asset) => asset.asset_id === "asset-active")?.attributable_hypothetical_proceeds
    ).toBe(82.88);
  });
});
