import { getPool } from "@/lib/server/db";

export const runtime = "nodejs";

/**
 * GET /api/re/v2/funds/{fundId}/gross-to-net-audit?quarter=YYYY-QN
 *
 * Returns the full audit payload for the REPE Gross-to-Net Audit surface.
 * Reads the latest snapshot for any promotion_state (not released-only)
 * so the audit page works on draft_audit, verified, and released rows.
 *
 * Response shape:
 *   snapshot:       { fund_id, quarter, promotion_state, trust_status,
 *                     breakpoint_layer, audit_run_id, snapshot_version,
 *                     promotable, blocking_reasons, null_reasons }
 *   bridge:         BridgeItem[]  (from bridge_items jsonb)
 *   metric_blocks:  { bottom_up, fund_expenses, waterfall }  (from canonical_metrics)
 *   gate:           GateResult[]  (derived from null_reasons + canonical_metrics)
 *   drilldowns:     { assets, expenses, waterfall_events }
 */

interface BridgeItem {
  label: string;
  item_type: string;
  amount: number | null;
  null_reason: string | null;
  formula_key: string;
  source_table: string | null;
  provenance: Record<string, unknown>;
}

interface GateResult {
  gate: string;
  label: string;
  status: "pass" | "fail" | "warn" | "skip";
  detail: string | null;
}

function derivePromotionGates(
  nullReasons: Record<string, string>,
  canonicalMetrics: Record<string, unknown>,
): GateResult[] {
  const gates: GateResult[] = [];

  // Gate 1: scope completeness
  const scopeReason = nullReasons["scope"];
  gates.push({
    gate: "scope",
    label: "Asset & investment scope complete",
    status: scopeReason ? "fail" : "pass",
    detail: scopeReason ?? null,
  });

  // Gate 2: bottom-up CF
  const buReason = nullReasons["bottom_up_irr"];
  gates.push({
    gate: "bottom_up_irr",
    label: "Asset → investment → fund rollup identity",
    status: buReason === "rollup_identity_violation" || buReason === "nav_identity_violation"
      ? "fail"
      : buReason === "partial_cf_above_threshold"
        ? "warn"
        : buReason
          ? "fail"
          : "pass",
    detail: buReason ?? null,
  });

  // Gate 3: fund expense layer
  const expReason = nullReasons["fund_expense_layer"];
  gates.push({
    gate: "fund_expense_layer",
    label: "Fund expense layer complete",
    status: expReason ? "fail" : "pass",
    detail: expReason ?? null,
  });

  // Gate 4: waterfall
  const wfReason = nullReasons["waterfall"];
  gates.push({
    gate: "waterfall",
    label: "Waterfall contract + participants resolved",
    status: wfReason === "conservation_violation" || wfReason === "waterfall_sign_violation"
      ? "fail"
      : wfReason === "out_of_scope_requires_waterfall" || wfReason === "missing_contract" || wfReason === "missing_partner_commitments"
        ? "warn"
        : wfReason
          ? "fail"
          : "pass",
    detail: wfReason ?? null,
  });

  // Gate 5: net IRR available
  const netIrrReason = nullReasons["net_irr"];
  gates.push({
    gate: "net_irr",
    label: "Net IRR computed",
    status: netIrrReason ? "warn" : "pass",
    detail: netIrrReason ?? null,
  });

  // Gate 6: gross-to-net bridge identity
  const wf = (canonicalMetrics["waterfall"] ?? {}) as Record<string, unknown>;
  const bu = (canonicalMetrics["bottom_up"] ?? {}) as Record<string, unknown>;
  const bridgeStatus = nullReasons["carry"] || nullReasons["gross_return_amount"] || nullReasons["net_return_amount"]
    ? "warn"
    : "pass";
  gates.push({
    gate: "bridge_identity",
    label: "Gross-to-net bridge identity holds",
    status: bridgeStatus,
    detail: bridgeStatus === "warn"
      ? [nullReasons["carry"], nullReasons["gross_return_amount"], nullReasons["net_return_amount"]].filter(Boolean).join("; ") || null
      : null,
  });

  // Gate 7: double-count check
  const doubleCount = nullReasons["double_count"];
  gates.push({
    gate: "no_double_count",
    label: "No expense double-count in asset CFs",
    status: doubleCount ? "fail" : "pass",
    detail: doubleCount ?? null,
  });

  // Gate 8: net bridge monotonicity
  const grossIrr = typeof bu["gross_irr_bottom_up"] === "number" ? bu["gross_irr_bottom_up"] : null;
  const netIrr = typeof wf["net_irr"] === "string" ? parseFloat(wf["net_irr"] as string) : typeof wf["net_irr"] === "number" ? wf["net_irr"] as number : null;
  let monotonicStatus: "pass" | "warn" | "skip" = "skip";
  let monotonicDetail: string | null = null;
  if (grossIrr !== null && netIrr !== null) {
    if (grossIrr < netIrr) {
      monotonicStatus = "warn";
      monotonicDetail = `gross_irr (${(grossIrr * 100).toFixed(1)}%) < net_irr (${(netIrr * 100).toFixed(1)}%) — unusual; may indicate timing artifact`;
    } else {
      monotonicStatus = "pass";
    }
  }
  gates.push({
    gate: "net_bridge_monotonicity",
    label: "Gross IRR ≥ net IRR (monotonicity)",
    status: monotonicStatus,
    detail: monotonicDetail,
  });

  return gates;
}

function isPromotable(gates: GateResult[], nullReasons: Record<string, string>): { promotable: boolean; blocking_reasons: string[] } {
  const hard_fail_gates = gates.filter(g => g.status === "fail");
  const missing_trust = Object.keys(nullReasons).length > 0 && Object.keys(nullReasons).some(
    k => !["net_irr", "waterfall", "fund_expense_layer"].includes(k)
  );
  const blocking_reasons = hard_fail_gates.map(g => `${g.gate}: ${g.detail ?? g.label}`);
  if (missing_trust) {
    blocking_reasons.push("null_reasons present on non-optional fields");
  }
  return { promotable: blocking_reasons.length === 0, blocking_reasons };
}

export async function OPTIONS() {
  return new Response(null, { status: 200, headers: { Allow: "GET, OPTIONS" } });
}

export async function GET(
  request: Request,
  { params }: { params: { fundId: string } },
) {
  const { fundId } = params;
  const url = new URL(request.url);
  const quarter = url.searchParams.get("quarter");

  if (!quarter) {
    return Response.json({ error_code: "MISSING_QUARTER", message: "quarter param required (e.g. 2025Q4)" }, { status: 400 });
  }

  const pool = getPool();
  if (!pool) {
    return Response.json({ error_code: "DB_UNAVAILABLE", message: "database not available" }, { status: 503 });
  }

  try {
    // Load latest snapshot for this fund/quarter (any promotion_state — audit surface sees all)
    const snapRes = await pool.query(
      `
      SELECT
        fund_id::text AS fund_id,
        audit_run_id::text AS audit_run_id,
        snapshot_version,
        promotion_state,
        trust_status,
        breakpoint_layer,
        quarter,
        period_start,
        period_end,
        canonical_metrics,
        null_reasons,
        formulas,
        provenance,
        created_at
      FROM re_authoritative_fund_state_qtr
      WHERE fund_id = $1::uuid
        AND quarter = $2
      ORDER BY created_at DESC
      LIMIT 1
      `,
      [fundId, quarter],
    );

    if (!snapRes.rows[0]) {
      return Response.json({
        error_code: "SNAPSHOT_NOT_FOUND",
        message: `No snapshot found for fund ${fundId} quarter ${quarter}`,
      }, { status: 404 });
    }

    const snap = snapRes.rows[0];
    const canonicalMetrics: Record<string, unknown> = snap.canonical_metrics ?? {};
    const nullReasons: Record<string, string> = snap.null_reasons ?? {};

    // Load bridge from re_authoritative_fund_gross_to_net_qtr
    const bridgeRes = await pool.query(
      `
      SELECT
        gross_return_amount::text AS gross_return_amount,
        management_fees::text AS management_fees,
        fund_expenses::text AS fund_expenses,
        net_return_amount::text AS net_return_amount,
        bridge_items,
        null_reasons AS bridge_null_reasons,
        provenance AS bridge_provenance
      FROM re_authoritative_fund_gross_to_net_qtr
      WHERE fund_id = $1::uuid
        AND quarter = $2
        AND audit_run_id = $3::uuid
      ORDER BY created_at DESC
      LIMIT 1
      `,
      [fundId, quarter, snap.audit_run_id],
    );

    const bridgeRow = bridgeRes.rows[0] ?? null;
    const bridgeItems: BridgeItem[] = (bridgeRow?.bridge_items ?? []) as BridgeItem[];

    // Derive promotion gates from null_reasons + canonical_metrics
    const gates = derivePromotionGates(nullReasons, canonicalMetrics);
    const { promotable, blocking_reasons } = isPromotable(gates, nullReasons);

    // Extract metric blocks from canonical_metrics
    const bottomUp = (canonicalMetrics["bottom_up"] ?? null) as Record<string, unknown> | null;
    const fundExpenses = (canonicalMetrics["fund_expenses"] ?? null) as Record<string, unknown> | null;
    const waterfall = (canonicalMetrics["waterfall"] ?? null) as Record<string, unknown> | null;

    // Asset-level drilldown from canonical_metrics.bottom_up.investment_rollup
    const investmentRollup = (bottomUp?.["investment_rollup"] ?? []) as Array<Record<string, unknown>>;
    const assetRows: Array<Record<string, unknown>> = investmentRollup.flatMap((inv) => {
      const assets = (inv["assets"] ?? []) as Array<Record<string, unknown>>;
      return assets.map((a) => ({
        investment_id: inv["investment_id"],
        investment_name: inv["name"],
        asset_id: a["asset_id"],
        asset_name: a["name"],
        ownership_pct: a["ownership_pct"],
        cf_amount: a["cf_amount"],
        gross_irr: a["gross_irr"],
        null_reason: a["null_reason"],
      }));
    });

    // Expense drilldown from canonical_metrics.fund_expenses.expense_by_type
    const expenseByType = (fundExpenses?.["expense_by_type"] ?? {}) as Record<string, unknown>;
    const expenseRows = Object.entries(expenseByType).map(([type, amount]) => ({
      expense_type: type,
      amount,
      null_reason: (fundExpenses?.["null_reasons"] as Record<string, string> | undefined)?.[type] ?? null,
    }));

    // Waterfall event drilldown from canonical_metrics.waterfall.event_logs
    const eventLogs = (waterfall?.["event_logs"] ?? []) as Array<Record<string, unknown>>;
    const waterfallEvents = eventLogs.map((ev) => ({
      quarter: ev["quarter"],
      distribution_amount: ev["distribution_amount"],
      lp_total: ev["lp_total"],
      gp_total: ev["gp_total"],
      conservation_diff: ev["conservation_diff"],
      tier_breakdown: ev["allocations"] ?? [],
    }));

    return Response.json({
      snapshot: {
        fund_id: snap.fund_id,
        quarter: snap.quarter,
        period_start: snap.period_start,
        period_end: snap.period_end,
        promotion_state: snap.promotion_state,
        trust_status: snap.trust_status,
        breakpoint_layer: snap.breakpoint_layer,
        audit_run_id: snap.audit_run_id,
        snapshot_version: snap.snapshot_version,
        created_at: snap.created_at,
        promotable,
        blocking_reasons,
        null_reasons: nullReasons,
      },
      bridge: {
        gross_return_amount: bridgeRow?.gross_return_amount ?? null,
        management_fees: bridgeRow?.management_fees ?? null,
        fund_expenses: bridgeRow?.fund_expenses ?? null,
        net_return_amount: bridgeRow?.net_return_amount ?? null,
        rows: bridgeItems,
        null_reasons: bridgeRow?.bridge_null_reasons ?? {},
        provenance: bridgeRow?.bridge_provenance ?? [],
        available: bridgeRow !== null,
      },
      metric_blocks: {
        bottom_up: bottomUp,
        fund_expenses: fundExpenses,
        waterfall,
      },
      gate: gates,
      drilldowns: {
        assets: assetRows,
        expenses: expenseRows,
        waterfall_events: waterfallEvents,
      },
    });
  } catch (err) {
    console.error("[gross-to-net-audit] DB error", err);
    return Response.json({ error_code: "INTERNAL_ERROR", message: String(err) }, { status: 500 });
  }
}
