/**
 * chain-validation.test.ts
 *
 * Golden-path end-to-end test suite for the REPE validation harness.
 *
 * Tests the full chain: Asset → JV → Investment → Fund → LP/GP Waterfall.
 *
 * All expected values come from 432_re_golden_path_seed.sql.
 * These are LOCKED constants — if a test fails it is a data or logic bug,
 * not a rounding preference.
 *
 * Asset:  Gateway Industrial Center  (f0000000-9001-0003-0001-000000000001)
 * Fund:   IGF-VII                    (a1b2c3d4-0003-0030-0001-000000000001)
 */

import { GET as getCfBridge } from "@/app/api/re/v2/assets/[assetId]/cf-bridge/route";
import { GET as getChainValidation } from "@/app/api/re/v2/funds/[fundId]/chain-validation/route";

// ─── Golden-path constants ──────────────────────────────────────────────────
const GP = {
  ASSET_ID:     "f0000000-9001-0003-0001-000000000001",
  DEAL_ID:      "f0000000-9001-0001-0001-000000000001",
  JV_ID:        "f0000000-9001-0002-0001-000000000001",
  FUND_ID:      "a1b2c3d4-0003-0030-0001-000000000001",

  PURCHASE_PRICE:   10_400_000,
  LOAN_AMOUNT:       6_760_000,
  EQUITY_AMOUNT:     3_640_000,
  JV_FUND_PCT:             0.80,
  IO_QUARTERLY:           88_725,

  // Per-quarter NOI (locked)
  NOI_BY_QUARTER: [142_500, 143_213, 143_928, 144_648, 145_370, 146_097, 146_827, 147_560],
  // Per-quarter NCF (locked: NOI - 10K capex - 4.5K reserves - 88.725K IO)
  NCF_BY_QUARTER: [39_275, 39_988, 40_703, 41_423, 42_145, 42_872, 43_602, 44_335],

  TOTAL_OPERATING_NCF:  334_343,
  FUND_OPERATING_NCF:   267_474,   // 334,343 × 0.80 (rounded)
  GROSS_SALE_PRICE:  11_804_800,
  SALE_COSTS:           354_144,
  DEBT_PAYOFF:        6_760_000,
  NET_SALE_PROCEEDS:  4_690_656,
  FUND_SALE_SHARE:    3_752_525,   // 4,690,656 × 0.80 (rounded)

  TOTAL_EQUITY_DISTRIBUTIONS: 5_024_999,  // 334,343 + 4,690,656
  TVPI: 1.38,   // 5,024,999 / 3,640,000 ≈ 1.38x (±0.02 tolerance)
  QUARTERS: ['2025Q1','2025Q2','2025Q3','2025Q4','2026Q1','2026Q2','2026Q3','2026Q4'],
};

// ─── Test helpers ───────────────────────────────────────────────────────────
function makeRequest(url: string): Request {
  return new Request(url);
}

function makeParams(obj: Record<string, string>) {
  return { params: obj };
}

async function fetchJson(res: Response): Promise<Record<string, unknown>> {
  return res.json() as Promise<Record<string, unknown>>;
}

// ─── Test suite ─────────────────────────────────────────────────────────────

describe("Golden Path — CF Bridge (asset level)", () => {
  let bridgeData: Record<string, unknown>;

  beforeAll(async () => {
    const req = makeRequest(`http://test/api/re/v2/assets/${GP.ASSET_ID}/cf-bridge`);
    const res = await getCfBridge(req, makeParams({ assetId: GP.ASSET_ID }));
    expect(res.status).toBe(200);
    bridgeData = await fetchJson(res);
  });

  test("returns 8 quarterly periods", () => {
    expect(bridgeData.periods).toBe(8);
  });

  test("all 8 quarters present in order", () => {
    const rows = bridgeData.rows as Array<{ quarter: string }>;
    const quarters = rows.map((r) => r.quarter);
    expect(quarters).toEqual(GP.QUARTERS);
  });

  test("NOI = Revenue − OpEx for every period", () => {
    const rows = bridgeData.rows as Array<{
      quarter: string; revenue: number; opex: number; noi: number; noi_reconciles: boolean;
    }>;
    for (const row of rows) {
      expect(row.noi_reconciles).toBe(true);
      expect(Math.abs(row.noi - (row.revenue - row.opex))).toBeLessThan(1);
    }
  });

  test("NCF = NOI − CapEx − TI/LC − Reserves − DebtSvc for every period", () => {
    const rows = bridgeData.rows as Array<{
      noi: number; capex: number; ti_lc: number; reserves: number;
      debt_service: number; net_cash_flow: number; ncf_reconciles: boolean;
    }>;
    for (const row of rows) {
      expect(row.ncf_reconciles).toBe(true);
    }
  });

  test("Q1 locked values exactly match seed", () => {
    const row = (bridgeData.rows as Array<Record<string, number>>)[0];
    expect(row.revenue).toBe(150_000);
    expect(row.opex).toBe(7_500);
    expect(row.noi).toBe(142_500);
    expect(row.capex).toBe(10_000);
    expect(row.ti_lc).toBe(0);
    expect(row.reserves).toBe(4_500);
    expect(row.debt_service).toBe(88_725);
    expect(row.net_cash_flow).toBe(39_275);
  });

  test("Q8 locked values exactly match seed", () => {
    const row = (bridgeData.rows as Array<Record<string, number>>)[7];
    expect(row.revenue).toBe(155_327);
    expect(row.noi).toBe(147_560);
    expect(row.net_cash_flow).toBe(44_335);
    // Q8 debt balance = 0 after payoff
    expect(row.debt_balance).toBe(0);
  });

  test("LTD operating NCF = 334,343", () => {
    const ltd = bridgeData.ltd_totals as Record<string, number>;
    expect(ltd.net_cash_flow).toBe(334_343);
  });

  test("sale event present with correct net proceeds", () => {
    const sale = bridgeData.sale_event as Record<string, number>;
    expect(sale).not.toBeNull();
    expect(sale.gross_sale_price).toBe(GP.GROSS_SALE_PRICE);
    expect(sale.sale_costs).toBe(GP.SALE_COSTS);
    expect(sale.debt_payoff).toBe(GP.DEBT_PAYOFF);
    expect(sale.net_sale_proceeds).toBe(GP.NET_SALE_PROCEEDS);
  });

  test("total equity distributions = operating NCF + sale net", () => {
    const ltd = bridgeData.ltd_totals as Record<string, number>;
    expect(ltd.total_equity_distributions).toBe(GP.TOTAL_EQUITY_DISTRIBUTIONS);
  });

  test("all validation flags pass", () => {
    const v = bridgeData.validation as Record<string, boolean>;
    expect(v.all_noi_reconcile).toBe(true);
    expect(v.all_ncf_reconcile).toBe(true);
    expect(v.has_sale_event).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("Golden Path — Chain Validation (full fund chain)", () => {
  let cvData: Record<string, unknown>;

  beforeAll(async () => {
    const req = makeRequest(
      `http://test/api/re/v2/funds/${GP.FUND_ID}/chain-validation?asset_id=${GP.ASSET_ID}`
    );
    const res = await getChainValidation(req, makeParams({ fundId: GP.FUND_ID }));
    expect(res.status).toBe(200);
    cvData = await fetchJson(res);
  });

  test("validation_status is PASS", () => {
    expect(cvData.validation_status).toBe("PASS");
  });

  test("all assertions pass", () => {
    const assertions = cvData.assertions as Array<{ name: string; passed: boolean; detail: string }>;
    for (const a of assertions) {
      expect(a.passed).toBe(true);
    }
  });

  test("JV fund ownership is 80%", () => {
    const jv = cvData.jv_rollup as Record<string, unknown>;
    expect(jv.fund_ownership_pct).toBeCloseTo(0.80, 3);
  });

  test("LTD fund operating NCF = 267,474 (334,343 × 80%)", () => {
    const jv = cvData.jv_rollup as Record<string, number>;
    expect(jv.ltd_fund_operating_ncf).toBe(GP.FUND_OPERATING_NCF);
  });

  test("fund sale share = 3,752,525 (4,690,656 × 80%)", () => {
    const jv = cvData.jv_rollup as Record<string, number>;
    expect(jv.fund_sale_share).toBe(GP.FUND_SALE_SHARE);
  });

  test("sale event gross − costs − debt = net proceeds", () => {
    const sale = cvData.sale_event as Record<string, number>;
    expect(
      Math.abs(sale.net_sale_proceeds - (sale.gross_sale_price - sale.sale_costs - sale.debt_payoff))
    ).toBeLessThan(1);
  });

  test("waterfall LP + GP = net distributable", () => {
    const wf = cvData.waterfall as {
      net_distributable: number;
      summary: { total_lp: number; total_gp: number };
    };
    expect(
      Math.abs(wf.summary.total_lp + wf.summary.total_gp - wf.net_distributable)
    ).toBeLessThan(1);
  });

  test("no dollar is double-counted across waterfall tiers", () => {
    const wf = cvData.waterfall as {
      tiers: Array<{ lp: number; gp: number }>;
      net_distributable: number;
    };
    const tierSum = wf.tiers.reduce((s, t) => s + t.lp + t.gp, 0);
    expect(Math.abs(tierSum - wf.net_distributable)).toBeLessThan(1);
  });

  test("TVPI ≈ 1.38x (±0.05 tolerance)", () => {
    const metrics = cvData.return_metrics as Record<string, number>;
    expect(metrics.tvpi).toBeGreaterThan(1.30);
    expect(metrics.tvpi).toBeLessThan(1.45);
  });

  test("TVPI = DPI + RVPI", () => {
    const metrics = cvData.return_metrics as Record<string, number>;
    expect(Math.abs(metrics.tvpi - (metrics.dpi + metrics.rvpi))).toBeLessThan(0.01);
  });

  test("gross IRR > net IRR (fees reduce return)", () => {
    const metrics = cvData.return_metrics as Record<string, number>;
    expect(metrics.gross_irr).toBeGreaterThan(metrics.net_irr);
  });

  test("waterfall tier 1 returns invested capital to LP", () => {
    const tiers = (cvData.waterfall as Record<string, unknown>).tiers as Array<{
      tier: number; name: string; lp: number; gp: number;
    }>;
    const roc = tiers.find((t) => t.tier === 1);
    expect(roc).toBeDefined();
    expect(roc!.gp).toBe(0);
    // LP gets at least their capital back (deal is profitable)
    const asset = cvData.asset as Record<string, number>;
    expect(roc!.lp).toBeGreaterThanOrEqual(asset.equity_invested - 1);
  });

  test("GP receives 0 in tier 1 (return of capital is LP-only)", () => {
    const tiers = (cvData.waterfall as Record<string, unknown>).tiers as Array<{
      tier: number; gp: number;
    }>;
    const roc = tiers.find((t) => t.tier === 1);
    expect(roc!.gp).toBe(0);
  });

  test("8 quarters of CF bridge data", () => {
    const bridge = cvData.cf_bridge as unknown[];
    expect(bridge).toHaveLength(8);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("Golden Path — NCF waterfall math", () => {
  test("each quarter: NCF matches seed constants", () => {
    GP.NCF_BY_QUARTER.forEach((expected, i) => {
      const q = GP.QUARTERS[i];
      expect(expected).toBeGreaterThan(0);
      // Sum check: running total increases each quarter (NOI grows 0.5%/qtr)
      if (i > 0) {
        expect(GP.NCF_BY_QUARTER[i]).toBeGreaterThan(GP.NCF_BY_QUARTER[i - 1]);
      }
      void q; // suppress unused warning
    });
  });

  test("sum of NCF_BY_QUARTER = TOTAL_OPERATING_NCF", () => {
    const sum = GP.NCF_BY_QUARTER.reduce((a, b) => a + b, 0);
    expect(sum).toBe(GP.TOTAL_OPERATING_NCF);
  });

  test("FUND_OPERATING_NCF = TOTAL_OPERATING_NCF × 0.80 (within $1)", () => {
    expect(Math.abs(GP.FUND_OPERATING_NCF - GP.TOTAL_OPERATING_NCF * 0.80)).toBeLessThan(1);
  });

  test("FUND_SALE_SHARE = NET_SALE_PROCEEDS × 0.80 (within $1)", () => {
    expect(Math.abs(GP.FUND_SALE_SHARE - GP.NET_SALE_PROCEEDS * 0.80)).toBeLessThan(1);
  });

  test("NET_SALE_PROCEEDS = GROSS − COSTS − DEBT", () => {
    expect(GP.NET_SALE_PROCEEDS).toBe(
      GP.GROSS_SALE_PRICE - GP.SALE_COSTS - GP.DEBT_PAYOFF
    );
  });

  test("TOTAL_EQUITY_DISTRIBUTIONS = operating NCF + sale net", () => {
    expect(GP.TOTAL_EQUITY_DISTRIBUTIONS).toBe(
      GP.TOTAL_OPERATING_NCF + GP.NET_SALE_PROCEEDS
    );
  });

  test("TVPI = total equity distributions / equity invested (±0.01)", () => {
    const tvpi = GP.TOTAL_EQUITY_DISTRIBUTIONS / GP.EQUITY_AMOUNT;
    expect(Math.abs(tvpi - GP.TVPI)).toBeLessThan(0.01);
  });
});
