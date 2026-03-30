import { describe, it, expect } from "vitest";
import { resolveAssetMetrics } from "../resolve-exit-metrics";
import type { ReV2AssetDetail, ReV2AssetQuarterState } from "../bos-api";

/* ── Helpers ──────────────────────────────────────────────────────── */

function makeDetail(overrides: Partial<{
  status: string;
  acquisition_date: string;
  cost_basis: number;
  occupancy: number;
  current_noi: number;
  realization: ReV2AssetDetail["realization"];
  exit_quarter_state: ReV2AssetDetail["exit_quarter_state"];
}>): ReV2AssetDetail {
  return {
    asset: {
      asset_id: "test-001",
      name: "Test Asset",
      asset_type: "property",
      status: overrides.status ?? "active",
      acquisition_date: overrides.acquisition_date ?? "2023-01-15",
      cost_basis: overrides.cost_basis ?? 10_000_000,
      created_at: "2023-01-15T00:00:00Z",
    },
    property: {
      property_type: "multifamily",
      units: 120,
      market: "Test Market",
      city: "Test City",
      state: "TX",
      occupancy: overrides.occupancy ?? 0.92,
      current_noi: overrides.current_noi ?? 800_000,
    },
    investment: { investment_id: "inv-001", name: "Test Investment" },
    fund: { fund_id: "fund-001", name: "Test Fund" },
    env: { env_id: "env-001", business_id: "biz-001" },
    realization: overrides.realization,
    exit_quarter_state: overrides.exit_quarter_state,
  };
}

function makeQuarterState(overrides: Partial<ReV2AssetQuarterState> = {}): ReV2AssetQuarterState {
  return {
    id: "qs-001",
    asset_id: "test-001",
    quarter: "2026Q1",
    noi: 200_000,
    revenue: 310_000,
    opex: 110_000,
    occupancy: 0.95,
    asset_value: 12_000_000,
    debt_balance: 7_000_000,
    ltv: 0.583,
    dscr: 1.45,
    nav: 5_000_000,
    ...overrides,
  } as ReV2AssetQuarterState;
}

/* ── Tests ────────────────────────────────────────────────────────── */

describe("resolveAssetMetrics", () => {
  describe("active assets", () => {
    it("uses current quarter state metrics with live labels", () => {
      const detail = makeDetail({ status: "active" });
      const qs = makeQuarterState();
      const m = resolveAssetMetrics(detail, qs);

      expect(m.isExited).toBe(false);
      expect(m.exitBannerText).toBeNull();
      expect(m.saleDate).toBeNull();

      // Labels are live/current
      expect(m.revenue.label).toBe("Revenue (QTD)");
      expect(m.noi.label).toBe("NOI");
      expect(m.occupancy.label).toBe("Occupancy");
      expect(m.assetValue.label).toBe("Asset Value");
      expect(m.debtBalance.label).toBe("Debt Balance");
      expect(m.ltv.label).toBe("LTV");
      expect(m.dscr.label).toBe("DSCR");

      // Values from quarter state
      expect(m.revenue.value).toBe(310_000);
      expect(m.noi.value).toBe(200_000);
      expect(m.occupancy.value).toBe(0.95);
      expect(m.assetValue.value).toBe(12_000_000);

      // No exit-specific metrics
      expect(m.salePrice).toBeNull();
      expect(m.netProceeds).toBeNull();
      expect(m.gainOnSale).toBeNull();
      expect(m.debtPayoff).toBeNull();
    });

    it("falls back to property occupancy when quarter state occupancy is missing", () => {
      const detail = makeDetail({ status: "active", occupancy: 0.88 });
      const qs = makeQuarterState({ occupancy: undefined as unknown as number });
      const m = resolveAssetMetrics(detail, qs);

      expect(m.occupancy.value).toBe(0.88);
    });

    it("shows em-dash (null) when no data at all", () => {
      const detail = makeDetail({ status: "active" });
      // Override property to have no occupancy
      detail.property.occupancy = undefined;
      detail.property.current_noi = undefined;
      const m = resolveAssetMetrics(detail, null);

      expect(m.revenue.value).toBeNull();
      expect(m.noi.value).toBeNull();
      expect(m.occupancy.value).toBeNull();
      expect(m.assetValue.value).toBeNull();
    });
  });

  describe("exited assets with realization + exit quarter state", () => {
    const exitDetail = makeDetail({
      status: "exited",
      acquisition_date: "2023-06-01",
      cost_basis: 39_500_000,
      occupancy: 0.941,
      current_noi: 1_321_024,
      realization: {
        sale_date: "2025-06-30",
        gross_sale_price: 44_793_000,
        sale_costs: 1_119_825,
        debt_payoff: 0,
        net_sale_proceeds: 43_673_175,
        ownership_percent: 1.0,
        realization_type: "historical_sale",
      },
      exit_quarter_state: {
        quarter: "2025Q4",
        occupancy: 0.8737,
        asset_value: 38_230_412.54,
        noi: 548_606.42,
        revenue: 870_664.89,
        opex: 307_205.48,
        debt_balance: 23_483_362.04,
        ltv: 0.6143,
        dscr: 1.287,
        nav: 14_747_050.50,
        debt_service: 426_280.41,
        net_cash_flow: 103_171.38,
        capex: 19_154.63,
      },
    });

    it("resolves as exited with exit labels", () => {
      const m = resolveAssetMetrics(exitDetail, null);

      expect(m.isExited).toBe(true);
      expect(m.saleDate).toBe("2025-06-30");
      expect(m.holdPeriodMonths).toBeGreaterThan(20);
    });

    it("uses exit quarter state occupancy, not zero", () => {
      const m = resolveAssetMetrics(exitDetail, null);

      expect(m.occupancy.value).toBe(0.8737);
      expect(m.occupancy.label).toBe("Occupancy at Exit");
      expect(m.occupancy.isExitSnapshot).toBe(true);
    });

    it("shows sale price as the primary value metric", () => {
      const m = resolveAssetMetrics(exitDetail, null);

      expect(m.assetValue.label).toBe("Sale Price");
      expect(m.assetValue.value).toBe(44_793_000);
    });

    it("computes gain on sale from net proceeds - cost basis", () => {
      const m = resolveAssetMetrics(exitDetail, null);

      expect(m.gainOnSale).not.toBeNull();
      expect(m.gainOnSale!.value).toBe(43_673_175 - 39_500_000);
      expect(m.gainOnSale!.label).toBe("Gain on Sale");
    });

    it("provides net sale proceeds", () => {
      const m = resolveAssetMetrics(exitDetail, null);

      expect(m.netProceeds).not.toBeNull();
      expect(m.netProceeds!.value).toBe(43_673_175);
    });

    it("uses exit quarter debt balance", () => {
      const m = resolveAssetMetrics(exitDetail, null);

      expect(m.debtBalance.value).toBe(23_483_362.04);
      expect(m.debtBalance.label).toBe("Debt at Exit");
    });

    it("uses exit quarter LTV and DSCR with exit labels", () => {
      const m = resolveAssetMetrics(exitDetail, null);

      expect(m.ltv.value).toBe(0.6143);
      expect(m.ltv.label).toBe("LTV at Exit");
      expect(m.dscr.value).toBe(1.287);
      expect(m.dscr.label).toBe("DSCR at Exit");
    });

    it("shows exit banner with date", () => {
      const m = resolveAssetMetrics(exitDetail, null);

      expect(m.exitBannerText).toContain("sold on");
      expect(m.exitBannerText).toContain("Jun");
      expect(m.exitBannerText).toContain("2025");
    });
  });

  describe("exited asset with NO realization data", () => {
    it("falls back to exit quarter state values", () => {
      const detail = makeDetail({
        status: "exited",
        occupancy: 0.90,
        exit_quarter_state: {
          quarter: "2025Q3",
          occupancy: 0.85,
          asset_value: 30_000_000,
          noi: 400_000,
          revenue: 650_000,
          opex: 250_000,
          debt_balance: 18_000_000,
          ltv: 0.60,
          dscr: 1.2,
          nav: 12_000_000,
          debt_service: 333_333,
          net_cash_flow: 66_667,
          capex: 15_000,
        },
      });

      const m = resolveAssetMetrics(detail, null);

      expect(m.isExited).toBe(true);
      expect(m.assetValue.label).toBe("Asset Value at Exit");
      expect(m.assetValue.value).toBe(30_000_000);
      expect(m.occupancy.value).toBe(0.85);
      expect(m.salePrice).toBeNull();
      expect(m.netProceeds).toBeNull();
    });
  });

  describe("exited asset with NO exit quarter state", () => {
    it("falls back to property-level occupancy and NOI", () => {
      const detail = makeDetail({
        status: "exited",
        occupancy: 0.941,
        current_noi: 1_321_024,
      });

      const m = resolveAssetMetrics(detail, null);

      expect(m.isExited).toBe(true);
      expect(m.occupancy.value).toBe(0.941);
      expect(m.noi.value).toBe(1_321_024);
    });
  });

  describe("exited asset with missing occupancy everywhere", () => {
    it("shows null (em-dash) instead of fabricating 0", () => {
      const detail = makeDetail({ status: "exited" });
      // Clear all property-level fallbacks
      detail.property.occupancy = undefined;
      detail.property.current_noi = undefined;

      const m = resolveAssetMetrics(detail, null);

      expect(m.isExited).toBe(true);
      expect(m.occupancy.value).toBeNull();
      expect(m.noi.value).toBeNull();
      expect(m.assetValue.value).toBeNull();
    });
  });

  describe("exited asset where quarter state has zeroes (post-exit)", () => {
    it("treats zero occupancy as null for exited asset", () => {
      const detail = makeDetail({
        status: "exited",
        occupancy: 0.90,
        // No exit_quarter_state provided — simulating case where
        // the API couldn't find a non-zero quarter
      });
      // Quarter state with post-exit zeroes
      const qs = makeQuarterState({
        occupancy: 0,
        asset_value: 0,
        noi: 0,
        revenue: 0,
        debt_balance: 0,
      });

      const m = resolveAssetMetrics(detail, qs);

      // Should NOT show 0.0% — should fall back to property occupancy
      expect(m.occupancy.value).toBe(0.90);
    });
  });

  describe("written_off status", () => {
    it("treats written_off same as exited", () => {
      const detail = makeDetail({ status: "written_off" });
      const m = resolveAssetMetrics(detail, null);

      expect(m.isExited).toBe(true);
    });
  });
});
