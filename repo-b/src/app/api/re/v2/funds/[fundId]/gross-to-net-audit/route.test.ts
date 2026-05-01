/**
 * Tests for GET /api/re/v2/funds/{fundId}/gross-to-net-audit
 *
 * Covers:
 *   1. Happy path: snapshot + bridge rows returned correctly
 *   2. Fail-closed: unavailable values carry null_reason, no fake zeros
 *   3. Bridge table: 5 rows, amounts correct sign, memo rows separated
 *   4. Promotion gate: fail/warn/pass derived from null_reasons
 *   5. Snapshot not found: 404 response
 *   6. Missing quarter param: 400 response
 *   7. Draft_audit snapshots: promoted = false, banner shows blocking reasons
 *   8. promotable=true when all gates pass and no null_reasons
 */

import { vi, describe, test, expect, beforeEach } from "vitest";

// ── Fixtures ─────────────────────────────────────────────────────────────────
const FUND_ID = "a1b2c3d4-0003-0030-0001-000000000001";
const AUDIT_RUN_ID = "00000000-0000-0000-0000-000000000099";
const SNAPSHOT_VERSION = "test-v1";

function makeSnapRow(overrides: Record<string, unknown> = {}) {
  return {
    fund_id: FUND_ID,
    audit_run_id: AUDIT_RUN_ID,
    snapshot_version: SNAPSHOT_VERSION,
    promotion_state: "draft_audit",
    trust_status: "untrusted",
    breakpoint_layer: "waterfall",
    quarter: "2025Q4",
    period_start: "2025-10-01",
    period_end: "2025-12-31",
    canonical_metrics: {
      bottom_up: {
        gross_irr_bottom_up: 0.18,
        gross_tvpi: 1.62,
        dpi: 0.41,
        investment_count: 2,
        asset_count: 4,
        scope: { scope_completeness: "complete" },
        trust_status: "trusted",
      },
      fund_expenses: {
        total_management_fees: 1842500,
        total_other_expenses: 412300,
        expense_drag_bps: 187,
        expense_by_type: { management_fee: 1842500, fund_admin: 200000, legal: 100000, audit: 112300 },
        expected_types: ["management_fee", "fund_admin", "legal", "audit"],
        actual_types: ["management_fee", "fund_admin", "legal", "audit"],
        trust_status: "trusted",
      },
      waterfall: {
        waterfall_status: "computed",
        net_irr: 0.143,
        net_tvpi: 1.52,
        dpi: 0.38,
        carry: 892100,
        lp_share: 8923400,
        gross_net_spread_bps: 370,
        pref_rate: 0.08,
        carry_rate: 0.20,
        hurdle_status: "in_carry",
        trust_status: "trusted",
      },
    },
    null_reasons: {},
    formulas: {},
    provenance: [],
    created_at: "2026-04-30T00:00:00Z",
    ...overrides,
  };
}

function makeBridgeRow(overrides: Record<string, unknown> = {}) {
  return {
    gross_return_amount: "50000000",
    management_fees: "1842500",
    fund_expenses: "412300",
    net_return_amount: "8923400",
    bridge_items: [
      {
        label: "Gross asset value (asset rollup + ending NAV)",
        item_type: "starting",
        amount: 50000000,
        null_reason: null,
        formula_key: "gross = sum(fund_gross_cf) + ending_nav",
        source_table: "re_asset_cf_series_mat",
        provenance: { sum_fund_gross_cf: 40000000, ending_nav: 10000000 },
      },
      {
        label: "Less management fees",
        item_type: "subtraction",
        amount: 1842500,
        null_reason: null,
        formula_key: "mgmt_fees = sum(re_fund_term.basis * rate / 4)",
        source_table: "repe_fund_term",
        provenance: { in_term_lines: 8 },
      },
      {
        label: "Less other fund expenses",
        item_type: "subtraction",
        amount: 412300,
        null_reason: null,
        formula_key: "other = sum(re_fund_expense_qtr.amount where expense_type != 'management_fee')",
        source_table: "re_fund_expense_qtr",
        provenance: {},
      },
      {
        label: "Less carry / promote",
        item_type: "subtraction",
        amount: 892100,
        null_reason: null,
        formula_key: "carry = tier_4_carry_split_gp allocation",
        source_table: "re_waterfall_definition",
        provenance: { waterfall_status: "computed", carry_rate: 0.2 },
      },
      {
        label: "Net LP return",
        item_type: "ending",
        amount: 8923400,
        null_reason: null,
        formula_key: "net_lp = lp_distributions + lp_ending_nav − lp_called",
        source_table: "fund_waterfall_layer.FundWaterfallResult",
        provenance: { lp_called: 9000000, lp_distributions: 4000000 },
      },
      {
        label: "Memo: gross-to-LP residual",
        item_type: "memo",
        amount: 38930200,
        null_reason: null,
        formula_key: "residual = (gross − fees − expenses − carry) − net_lp",
        source_table: null,
        provenance: { interpretation: "leverage + GP-side return" },
      },
    ],
    bridge_null_reasons: {},
    bridge_provenance: [],
    ...overrides,
  };
}

// ── DB mock ──────────────────────────────────────────────────────────────────
type MockQueryFn = (sql: string, values?: unknown[]) => Promise<{ rows: unknown[] }>;

const mockQuery: { fn: MockQueryFn } = {
  fn: async () => ({ rows: [] }),
};

vi.mock("@/lib/server/db", () => ({
  getPool: () => ({
    query: (...args: Parameters<MockQueryFn>) => mockQuery.fn(...args),
  }),
}));

// ── Helpers ──────────────────────────────────────────────────────────────────
function makeRequest(quarter?: string): Request {
  const url = quarter
    ? `http://test/api/re/v2/funds/${FUND_ID}/gross-to-net-audit?quarter=${quarter}`
    : `http://test/api/re/v2/funds/${FUND_ID}/gross-to-net-audit`;
  return new Request(url);
}

function makeParams() {
  return { params: { fundId: FUND_ID } };
}

async function callRoute(quarter?: string) {
  const { GET } = await import("./route");
  return GET(makeRequest(quarter), makeParams());
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("gross-to-net-audit route — missing params", () => {
  test("returns 400 when quarter is missing", async () => {
    const res = await callRoute(undefined);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error_code).toBe("MISSING_QUARTER");
  });
});

describe("gross-to-net-audit route — snapshot not found", () => {
  beforeEach(() => {
    // First query (snapshot) returns empty; never reaches bridge query
    mockQuery.fn = async () => ({ rows: [] });
  });

  test("returns 404 when no snapshot exists for fund/quarter", async () => {
    const res = await callRoute("2025Q4");
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error_code).toBe("SNAPSHOT_NOT_FOUND");
  });
});

describe("gross-to-net-audit route — happy path (computed waterfall)", () => {
  let body: Record<string, unknown>;
  const snapRow = makeSnapRow();
  const bridgeRow = makeBridgeRow();

  beforeEach(async () => {
    let callCount = 0;
    mockQuery.fn = async () => {
      callCount++;
      if (callCount === 1) return { rows: [snapRow] };
      if (callCount === 2) return { rows: [bridgeRow] };
      return { rows: [] };
    };
    const res = await callRoute("2025Q4");
    expect(res.status).toBe(200);
    body = await res.json() as Record<string, unknown>;
  });

  test("snapshot block has correct fund_id and quarter", () => {
    const snap = body.snapshot as Record<string, unknown>;
    expect(snap.fund_id).toBe(FUND_ID);
    expect(snap.quarter).toBe("2025Q4");
    expect(snap.promotion_state).toBe("draft_audit");
  });

  test("bridge has 6 rows including memo", () => {
    const bridge = body.bridge as Record<string, unknown>;
    expect(bridge.available).toBe(true);
    const rows = bridge.rows as unknown[];
    expect(rows).toHaveLength(6);
  });

  test("bridge starting row has positive amount", () => {
    const bridge = body.bridge as Record<string, unknown>;
    const rows = bridge.rows as Array<Record<string, unknown>>;
    const starting = rows.find(r => r.item_type === "starting");
    expect(starting).toBeDefined();
    expect(typeof starting!.amount).toBe("number");
    expect(starting!.amount as number).toBeGreaterThan(0);
  });

  test("metric_blocks.waterfall has net_irr", () => {
    const blocks = body.metric_blocks as Record<string, unknown>;
    const wf = blocks.waterfall as Record<string, unknown>;
    expect(wf.net_irr).toBe(0.143);
  });

  test("metric_blocks.bottom_up has gross_irr_bottom_up", () => {
    const blocks = body.metric_blocks as Record<string, unknown>;
    const bu = blocks.bottom_up as Record<string, unknown>;
    expect(bu.gross_irr_bottom_up).toBe(0.18);
  });

  test("all gates pass when null_reasons is empty", () => {
    const gates = body.gate as Array<Record<string, unknown>>;
    const failGates = gates.filter(g => g.status === "fail");
    expect(failGates).toHaveLength(0);
  });

  test("promotable is true when no hard gate failures", () => {
    const snap = body.snapshot as Record<string, unknown>;
    // null_reasons is empty, no gate failures → promotable
    expect(snap.promotable).toBe(true);
    expect((snap.blocking_reasons as unknown[]).length).toBe(0);
  });
});

describe("gross-to-net-audit route — fail-closed: waterfall missing", () => {
  let body: Record<string, unknown>;

  beforeEach(async () => {
    const snapRow = makeSnapRow({
      null_reasons: {
        waterfall: "missing_contract",
        net_irr: "out_of_scope_requires_waterfall",
      },
      canonical_metrics: {
        bottom_up: { gross_irr_bottom_up: 0.18, trust_status: "trusted" },
        fund_expenses: { total_management_fees: 1842500, trust_status: "trusted" },
        waterfall: null,
      },
    });

    let callCount = 0;
    mockQuery.fn = async () => {
      callCount++;
      if (callCount === 1) return { rows: [snapRow] };
      return { rows: [] }; // no bridge row
    };

    const res = await callRoute("2025Q4");
    expect(res.status).toBe(200);
    body = await res.json() as Record<string, unknown>;
  });

  test("waterfall null_reason present in snapshot", () => {
    const snap = body.snapshot as Record<string, unknown>;
    const nullReasons = snap.null_reasons as Record<string, string>;
    expect(nullReasons.waterfall).toBe("missing_contract");
    expect(nullReasons.net_irr).toBe("out_of_scope_requires_waterfall");
  });

  test("bridge.available is false when no bridge row", () => {
    const bridge = body.bridge as Record<string, unknown>;
    expect(bridge.available).toBe(false);
  });

  test("waterfall gate is warn when missing_contract", () => {
    const gates = body.gate as Array<Record<string, unknown>>;
    const wfGate = gates.find(g => g.gate === "waterfall");
    expect(wfGate).toBeDefined();
    expect(wfGate!.status).toBe("warn");
    expect(wfGate!.detail).toBe("missing_contract");
  });

  test("net_irr gate is warn when out_of_scope", () => {
    const gates = body.gate as Array<Record<string, unknown>>;
    const netGate = gates.find(g => g.gate === "net_irr");
    expect(netGate).toBeDefined();
    expect(netGate!.status).toBe("warn");
  });

  test("metric_blocks.waterfall is null (no fake zero)", () => {
    const blocks = body.metric_blocks as Record<string, unknown>;
    // null is correct — there was no waterfall block in canonical_metrics
    expect(blocks.waterfall).toBeNull();
  });
});

describe("gross-to-net-audit route — fail-closed: scope failure is hard fail", () => {
  let body: Record<string, unknown>;

  beforeEach(async () => {
    const snapRow = makeSnapRow({
      null_reasons: {
        scope: "partial_asset_scope",
      },
      trust_status: "untrusted",
      breakpoint_layer: "scope",
    });

    let callCount = 0;
    mockQuery.fn = async () => {
      callCount++;
      if (callCount === 1) return { rows: [snapRow] };
      return { rows: [] };
    };

    const res = await callRoute("2025Q4");
    expect(res.status).toBe(200);
    body = await res.json() as Record<string, unknown>;
  });

  test("scope gate is fail", () => {
    const gates = body.gate as Array<Record<string, unknown>>;
    const scopeGate = gates.find(g => g.gate === "scope");
    expect(scopeGate).toBeDefined();
    expect(scopeGate!.status).toBe("fail");
    expect(scopeGate!.detail).toBe("partial_asset_scope");
  });

  test("promotable is false when scope gate fails", () => {
    const snap = body.snapshot as Record<string, unknown>;
    expect(snap.promotable).toBe(false);
    const reasons = snap.blocking_reasons as string[];
    expect(reasons.some(r => r.includes("scope"))).toBe(true);
  });
});

describe("gross-to-net-audit route — bridge table integrity", () => {
  let body: Record<string, unknown>;

  beforeEach(async () => {
    const snapRow = makeSnapRow();
    const bridgeRow = makeBridgeRow();

    let callCount = 0;
    mockQuery.fn = async () => {
      callCount++;
      if (callCount === 1) return { rows: [snapRow] };
      if (callCount === 2) return { rows: [bridgeRow] };
      return { rows: [] };
    };

    const res = await callRoute("2025Q4");
    body = await res.json() as Record<string, unknown>;
  });

  test("each non-memo row has a non-null amount or a null_reason", () => {
    const bridge = body.bridge as Record<string, unknown>;
    const rows = bridge.rows as Array<Record<string, unknown>>;
    const nonMemo = rows.filter(r => r.item_type !== "memo");
    for (const row of nonMemo) {
      const hasValue = row.amount !== null && row.amount !== undefined;
      const hasReason = row.null_reason !== null && row.null_reason !== undefined;
      // At least one must be present — no silent nulls
      expect(hasValue || hasReason).toBe(true);
    }
  });

  test("subtraction rows have positive amounts (not pre-negated)", () => {
    const bridge = body.bridge as Record<string, unknown>;
    const rows = bridge.rows as Array<Record<string, unknown>>;
    const subtractions = rows.filter(r => r.item_type === "subtraction");
    for (const row of subtractions) {
      if (row.amount !== null) {
        expect(row.amount as number).toBeGreaterThanOrEqual(0);
      }
    }
  });

  test("bridge has exactly one starting, three subtraction, one ending row", () => {
    const bridge = body.bridge as Record<string, unknown>;
    const rows = bridge.rows as Array<Record<string, unknown>>;
    expect(rows.filter(r => r.item_type === "starting")).toHaveLength(1);
    expect(rows.filter(r => r.item_type === "subtraction")).toHaveLength(3);
    expect(rows.filter(r => r.item_type === "ending")).toHaveLength(1);
    expect(rows.filter(r => r.item_type === "memo")).toHaveLength(1);
  });

  test("starting row has provenance with sum_fund_gross_cf and ending_nav", () => {
    const bridge = body.bridge as Record<string, unknown>;
    const rows = bridge.rows as Array<Record<string, unknown>>;
    const starting = rows.find(r => r.item_type === "starting");
    const prov = starting!.provenance as Record<string, unknown>;
    expect(prov.sum_fund_gross_cf).toBeDefined();
    expect(prov.ending_nav).toBeDefined();
  });
});

describe("gross-to-net-audit route — no fake zeros regression", () => {
  test("null metric blocks remain null in response, not coerced to 0", async () => {
    const snapRow = makeSnapRow({
      null_reasons: { fund_expense_layer: "missing_expense_inputs" },
      canonical_metrics: {
        bottom_up: { gross_irr_bottom_up: 0.15, trust_status: "trusted" },
        fund_expenses: null,
        waterfall: null,
      },
    });

    let callCount = 0;
    mockQuery.fn = async () => {
      callCount++;
      if (callCount === 1) return { rows: [snapRow] };
      return { rows: [] };
    };

    const res = await callRoute("2025Q4");
    const body = await res.json() as Record<string, unknown>;
    const blocks = body.metric_blocks as Record<string, unknown>;

    // Must be null, not 0, not {}, not ""
    expect(blocks.fund_expenses).toBeNull();
    expect(blocks.waterfall).toBeNull();

    // bottom_up should still have real data
    const bu = blocks.bottom_up as Record<string, unknown>;
    expect(bu.gross_irr_bottom_up).toBe(0.15);
  });
});
