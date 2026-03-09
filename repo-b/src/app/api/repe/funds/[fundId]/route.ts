import type { PoolClient } from "pg";
import { getPool } from "@/lib/server/db";

export const runtime = "nodejs";

export async function OPTIONS() {
  return new Response(null, { status: 200, headers: { Allow: "GET, DELETE, OPTIONS" } });
}

function assertSafeRelationName(relation: string): string {
  if (!/^[a-z_][a-z0-9_]*(\.[a-z_][a-z0-9_]*)?$/.test(relation)) {
    throw new Error(`Unsafe relation name: ${relation}`);
  }
  return relation;
}

function assertSafeColumnName(column: string): string {
  if (!/^[a-z_][a-z0-9_]*$/.test(column)) {
    throw new Error(`Unsafe column name: ${column}`);
  }
  return column;
}

async function relationExists(client: PoolClient, relation: string): Promise<boolean> {
  const res = await client.query<{ exists: boolean }>(
    "SELECT to_regclass($1) IS NOT NULL AS exists",
    [relation]
  );
  return Boolean(res.rows[0]?.exists);
}

async function columnExists(
  client: PoolClient,
  schema: string,
  table: string,
  column: string
): Promise<boolean> {
  const res = await client.query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1
       FROM information_schema.columns
       WHERE table_schema = $1
         AND table_name = $2
         AND column_name = $3
     ) AS exists`,
    [schema, table, column]
  );
  return Boolean(res.rows[0]?.exists);
}

async function selectUuidIds(
  client: PoolClient,
  query: string,
  params: unknown[]
): Promise<string[]> {
  const res = await client.query<{ id: string }>(query, params);
  return res.rows.map((row) => row.id);
}

async function deleteByUuidIds(
  client: PoolClient,
  relation: string,
  column: string,
  ids: string[]
): Promise<number> {
  if (ids.length === 0) return 0;
  const table = assertSafeRelationName(relation);
  const field = assertSafeColumnName(column);
  if (!(await relationExists(client, table))) return 0;
  const res = await client.query(`DELETE FROM ${table} WHERE ${field} = ANY($1::uuid[])`, [ids]);
  return res.rowCount ?? 0;
}

async function deleteByFundId(
  client: PoolClient,
  relation: string,
  fundId: string,
  column = "fund_id"
): Promise<number> {
  const table = assertSafeRelationName(relation);
  const field = assertSafeColumnName(column);
  if (!(await relationExists(client, table))) return 0;
  const res = await client.query(`DELETE FROM ${table} WHERE ${field} = $1::uuid`, [fundId]);
  return res.rowCount ?? 0;
}

export async function GET(
  _request: Request,
  { params }: { params: { fundId: string } }
) {
  const pool = getPool();
  if (!pool) {
    return Response.json({ error_code: "DB_UNAVAILABLE", message: "Database not configured" }, { status: 503 });
  }

  try {
    const [fundRes, termsRes] = await Promise.all([
      pool.query(
        `SELECT
           fund_id::text, business_id::text, name, vintage_year,
           fund_type, strategy, sub_strategy, target_size, term_years,
           status, created_at
         FROM repe_fund WHERE fund_id = $1::uuid`,
        [params.fundId]
      ),
      pool.query(
        `SELECT
           fund_term_id::text AS term_id,
           fund_id::text,
           effective_from AS effective_date,
           preferred_return_rate, carry_rate, waterfall_style,
           management_fee_rate, created_at
         FROM repe_fund_term WHERE fund_id = $1::uuid
         ORDER BY effective_from DESC`,
        [params.fundId]
      ).catch(() => ({ rows: [] })),
    ]);

    if (!fundRes.rows[0]) {
      return Response.json({ error_code: "FUND_NOT_FOUND", message: `Fund ${params.fundId} not found` }, { status: 404 });
    }

    return Response.json({ fund: fundRes.rows[0], terms: termsRes.rows });
  } catch (err) {
    console.error("[repe/funds/[fundId]] DB error", err);
    return Response.json({ error_code: "DB_ERROR", message: "Failed to load fund" }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: { fundId: string } }
) {
  const pool = getPool();
  if (!pool) {
    return Response.json(
      { error_code: "DB_UNAVAILABLE", message: "Database not configured" },
      { status: 503 }
    );
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const fundRes = await client.query<{ fund_id: string; name: string }>(
      "SELECT fund_id::text, name FROM repe_fund WHERE fund_id = $1::uuid LIMIT 1",
      [params.fundId]
    );

    if (!fundRes.rows[0]) {
      await client.query("ROLLBACK");
      return Response.json(
        { error_code: "FUND_NOT_FOUND", message: `Fund ${params.fundId} not found` },
        { status: 404 }
      );
    }

    const investmentIds = await selectUuidIds(
      client,
      "SELECT deal_id::text AS id FROM repe_deal WHERE fund_id = $1::uuid",
      [params.fundId]
    );
    const assetIds = investmentIds.length
      ? await selectUuidIds(
          client,
          "SELECT asset_id::text AS id FROM repe_asset WHERE deal_id = ANY($1::uuid[])",
          [investmentIds]
        )
      : [];
    const jvIds = investmentIds.length
      ? await selectUuidIds(
          client,
          "SELECT jv_id::text AS id FROM re_jv WHERE investment_id = ANY($1::uuid[])",
          [investmentIds]
        )
      : [];
    const scenarioIds = await selectUuidIds(
      client,
      "SELECT scenario_id::text AS id FROM re_scenario WHERE fund_id = $1::uuid",
      [params.fundId]
    );

    let modelIds: string[] = [];
    if (await relationExists(client, "re_model")) {
      const modelScopeColumn = (await columnExists(client, "public", "re_model", "primary_fund_id"))
        ? "primary_fund_id"
        : (await columnExists(client, "public", "re_model", "fund_id"))
          ? "fund_id"
          : null;
      if (modelScopeColumn) {
        modelIds = await selectUuidIds(
          client,
          `SELECT model_id::text AS id FROM re_model WHERE ${modelScopeColumn} = $1::uuid`,
          [params.fundId]
        );
      }
    }

    const deleted: Record<string, number> = {
      investments: investmentIds.length,
      assets: assetIds.length,
      jvs: jvIds.length,
      scenarios: scenarioIds.length,
      models: modelIds.length,
    };

    if (await relationExists(client, "re_model_scenario_assets")) {
      const conditions: string[] = [];
      const values: unknown[] = [];
      let index = 1;
      if (assetIds.length > 0) {
        conditions.push(`asset_id = ANY($${index}::uuid[])`);
        values.push(assetIds);
        index += 1;
      }
      conditions.push(`source_fund_id = $${index}::uuid`);
      values.push(params.fundId);
      index += 1;
      if (investmentIds.length > 0) {
        conditions.push(`source_investment_id = ANY($${index}::uuid[])`);
        values.push(investmentIds);
      }
      const res = await client.query(
        `DELETE FROM re_model_scenario_assets WHERE ${conditions.join(" OR ")}`,
        values
      );
      deleted.model_scenario_assets = res.rowCount ?? 0;
    }

    deleted.run_provenance = await deleteByFundId(client, "re_run_provenance", params.fundId);
    deleted.scenario_metrics_snapshot = await deleteByFundId(client, "re_scenario_metrics_snapshot", params.fundId);
    deleted.sale_assumptions = await deleteByFundId(client, "re_sale_assumption", params.fundId);
    deleted.asset_acct_rollups = await deleteByUuidIds(client, "re_asset_acct_quarter_rollup", "asset_id", assetIds);
    deleted.asset_occupancy = await deleteByUuidIds(client, "re_asset_occupancy_quarter", "asset_id", assetIds);
    deleted.gl_balances = await deleteByUuidIds(client, "acct_gl_balance_monthly", "asset_id", assetIds);
    deleted.normalized_noi = await deleteByUuidIds(client, "acct_normalized_noi_monthly", "asset_id", assetIds);
    deleted.normalized_bs = await deleteByUuidIds(client, "acct_normalized_bs_monthly", "asset_id", assetIds);
    deleted.uw_noi_budget = await deleteByUuidIds(client, "uw_noi_budget_monthly", "asset_id", assetIds);
    deleted.cash_events = await deleteByFundId(client, "re_cash_event", params.fundId);
    deleted.fee_policy = await deleteByFundId(client, "re_fee_policy", params.fundId);
    deleted.fee_accrual = await deleteByFundId(client, "re_fee_accrual_qtr", params.fundId);
    deleted.fund_expense = await deleteByFundId(client, "re_fund_expense_qtr", params.fundId);
    deleted.asset_variance = await deleteByFundId(client, "re_asset_variance_qtr", params.fundId);
    deleted.fund_metrics = await deleteByFundId(client, "re_fund_metrics_qtr", params.fundId);
    deleted.gross_net_bridge = await deleteByFundId(client, "re_gross_net_bridge_qtr", params.fundId);
    deleted.loans = await deleteByFundId(client, "re_loan", params.fundId);
    deleted.model_mc_runs = await deleteByFundId(client, "re_model_mc_run", params.fundId);
    deleted.model_run_results = await deleteByFundId(client, "re_model_run_result", params.fundId);
    deleted.property_comps = await deleteByUuidIds(client, "app.re_property_comp", "asset_id", assetIds);
    deleted.capital_account_snapshots = await deleteByFundId(
      client,
      "app.re_capital_account_snapshot",
      params.fundId
    );

    if (await relationExists(client, "re_run")) {
      const runDelete = await client.query(
        "DELETE FROM re_run WHERE fund_id = $1::uuid",
        [params.fundId]
      );
      deleted.runs = runDelete.rowCount ?? 0;
    }

    const fundDelete = await client.query(
      "DELETE FROM repe_fund WHERE fund_id = $1::uuid",
      [params.fundId]
    );
    deleted.fund = fundDelete.rowCount ?? 0;
    deleted.analytics_rows = Object.entries(deleted)
      .filter(([key]) => !["investments", "assets", "jvs", "scenarios", "models", "fund"].includes(key))
      .reduce((sum, [, count]) => sum + count, 0);

    await client.query("COMMIT");

    return Response.json({
      fund_id: params.fundId,
      deleted,
    });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    console.error("[repe/funds/[fundId]] DELETE error", err);
    return Response.json(
      { error_code: "DB_ERROR", message: "Failed to delete fund" },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
