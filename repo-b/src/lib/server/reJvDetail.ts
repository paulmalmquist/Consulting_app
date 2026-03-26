import type { Pool } from "pg";

type Queryable = Pick<Pool, "query">;

export type JvAssetSummary = {
  asset_id: string;
  asset_name: string;
  property_type: string | null;
  nav: number | null;
  noi: number | null;
  ownership_percent: number | null;
};

export type JvPartnerShare = {
  partner_id: string;
  partner_name: string;
  partner_type: string;
  ownership_percent: number;
  share_class: string;
  effective_from: string | null;
  effective_to: string | null;
};

export type JvWaterfallTier = {
  tier_order: number;
  tier_type: string;
  hurdle_rate: number | null;
  split_gp: number | null;
  split_lp: number | null;
  catch_up_percent: number | null;
};

export type JvDetailItem = {
  jv_id: string;
  legal_name: string;
  investment_id: string;
  investment_name: string;
  status: string;
  ownership_percent: number;
  gp_percent: number | null;
  lp_percent: number | null;
  promote_structure_id: string | null;
  nav: number | null;
  noi: number | null;
  debt_balance: number | null;
  cash_balance: number | null;
  asset_count: number;
  assets: JvAssetSummary[];
  partner_shares: JvPartnerShare[];
  waterfall_tiers: JvWaterfallTier[];
};

export type JvDetailResult = {
  fund_id: string;
  quarter: string;
  jvs: JvDetailItem[];
};

function toNumber(v: unknown): number {
  if (v == null || v === "") return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export async function computeJvDetail({
  pool,
  fundId,
  quarter,
  scenarioId,
}: {
  pool: Queryable;
  fundId: string;
  quarter: string;
  scenarioId?: string | null;
}): Promise<JvDetailResult> {
  // 1. Load all JVs for this fund's investments
  const jvRows = await pool.query(
    `SELECT
       j.jv_id::text,
       j.legal_name,
       j.investment_id::text,
       d.name AS investment_name,
       j.status,
       COALESCE(j.ownership_percent, 1)::float8 AS ownership_percent,
       j.gp_percent::float8,
       j.lp_percent::float8,
       j.promote_structure_id::text
     FROM re_jv j
     JOIN repe_deal d ON d.deal_id = j.investment_id
     WHERE d.fund_id = $1::uuid
     ORDER BY d.name, j.legal_name`,
    [fundId]
  );

  if (jvRows.rows.length === 0) {
    return { fund_id: fundId, quarter, jvs: [] };
  }

  const jvIds = jvRows.rows.map((r: Record<string, unknown>) => r.jv_id as string);
  const promoteIds = jvRows.rows
    .map((r: Record<string, unknown>) => r.promote_structure_id as string | null)
    .filter((id): id is string => id != null);

  // 2. Load quarter state for all JVs
  const scenarioClause = scenarioId ? `AND qs.scenario_id = $3::uuid` : "";
  const stateParams: unknown[] = scenarioId ? [jvIds, quarter, scenarioId] : [jvIds, quarter];
  const stateRows = await pool.query(
    `SELECT DISTINCT ON (jv_id)
       jv_id::text,
       nav::float8,
       noi::float8,
       debt_balance::float8,
       cash_balance::float8
     FROM re_jv_quarter_state qs
     WHERE jv_id = ANY($1::uuid[])
       AND quarter = $2
       ${scenarioClause}
     ORDER BY jv_id, created_at DESC`,
    stateParams
  );
  const stateMap = new Map(
    (stateRows.rows as Record<string, unknown>[]).map((r) => [r.jv_id as string, r])
  );

  // 3. Load assets for all JVs
  const assetRows = await pool.query(
    `SELECT
       a.asset_id::text,
       a.name AS asset_name,
       a.jv_id::text,
       pa.property_type,
       qs.nav::float8,
       qs.noi::float8,
       COALESCE(j.ownership_percent, 1)::float8 AS ownership_percent
     FROM repe_asset a
     LEFT JOIN repe_property_asset pa ON pa.asset_id = a.asset_id
     LEFT JOIN re_jv j ON j.jv_id = a.jv_id
     LEFT JOIN LATERAL (
       SELECT nav, noi FROM re_asset_quarter_state
       WHERE asset_id = a.asset_id AND quarter = $2
       ORDER BY created_at DESC LIMIT 1
     ) qs ON true
     WHERE a.jv_id = ANY($1::uuid[])
     ORDER BY a.name`,
    [jvIds, quarter]
  );
  const assetsByJv = new Map<string, JvAssetSummary[]>();
  for (const row of assetRows.rows as Record<string, unknown>[]) {
    const jvId = row.jv_id as string;
    const list = assetsByJv.get(jvId) ?? [];
    list.push({
      asset_id: row.asset_id as string,
      asset_name: row.asset_name as string,
      property_type: (row.property_type as string) ?? null,
      nav: row.nav != null ? toNumber(row.nav) : null,
      noi: row.noi != null ? toNumber(row.noi) : null,
      ownership_percent: row.ownership_percent != null ? toNumber(row.ownership_percent) : null,
    });
    assetsByJv.set(jvId, list);
  }

  // 4. Load partner shares for all JVs
  const partnerRows = await pool.query(
    `SELECT
       ps.jv_id::text,
       ps.partner_id::text,
       p.name AS partner_name,
       p.partner_type,
       ps.ownership_percent::float8,
       ps.share_class,
       ps.effective_from::text,
       ps.effective_to::text
     FROM re_jv_partner_share ps
     JOIN re_partner p ON p.partner_id = ps.partner_id
     WHERE ps.jv_id = ANY($1::uuid[])
     ORDER BY p.partner_type, p.name`,
    [jvIds]
  );
  const partnersByJv = new Map<string, JvPartnerShare[]>();
  for (const row of partnerRows.rows as Record<string, unknown>[]) {
    const jvId = row.jv_id as string;
    const list = partnersByJv.get(jvId) ?? [];
    list.push({
      partner_id: row.partner_id as string,
      partner_name: row.partner_name as string,
      partner_type: row.partner_type as string,
      ownership_percent: toNumber(row.ownership_percent),
      share_class: (row.share_class as string) ?? "common",
      effective_from: (row.effective_from as string) ?? null,
      effective_to: (row.effective_to as string) ?? null,
    });
    partnersByJv.set(jvId, list);
  }

  // 5. Load waterfall tiers for promote structures
  const tiersByDefId = new Map<string, JvWaterfallTier[]>();
  if (promoteIds.length > 0) {
    const tierRows = await pool.query(
      `SELECT
         definition_id::text,
         tier_order,
         tier_type,
         hurdle_rate::float8,
         split_gp::float8,
         split_lp::float8,
         catch_up_percent::float8
       FROM re_waterfall_tier
       WHERE definition_id = ANY($1::uuid[])
       ORDER BY definition_id, tier_order`,
      [promoteIds]
    );
    for (const row of tierRows.rows as Record<string, unknown>[]) {
      const defId = row.definition_id as string;
      const list = tiersByDefId.get(defId) ?? [];
      list.push({
        tier_order: toNumber(row.tier_order),
        tier_type: row.tier_type as string,
        hurdle_rate: row.hurdle_rate != null ? toNumber(row.hurdle_rate) : null,
        split_gp: row.split_gp != null ? toNumber(row.split_gp) : null,
        split_lp: row.split_lp != null ? toNumber(row.split_lp) : null,
        catch_up_percent: row.catch_up_percent != null ? toNumber(row.catch_up_percent) : null,
      });
      tiersByDefId.set(defId, list);
    }
  }

  // 6. Assemble
  const jvs: JvDetailItem[] = (jvRows.rows as Record<string, unknown>[]).map((jv) => {
    const jvId = jv.jv_id as string;
    const state = stateMap.get(jvId);
    const assets = assetsByJv.get(jvId) ?? [];
    const partners = partnersByJv.get(jvId) ?? [];
    const promoteId = jv.promote_structure_id as string | null;
    const tiers = promoteId ? tiersByDefId.get(promoteId) ?? [] : [];

    return {
      jv_id: jvId,
      legal_name: (jv.legal_name as string) ?? jvId,
      investment_id: jv.investment_id as string,
      investment_name: jv.investment_name as string,
      status: (jv.status as string) ?? "active",
      ownership_percent: toNumber(jv.ownership_percent),
      gp_percent: jv.gp_percent != null ? toNumber(jv.gp_percent) : null,
      lp_percent: jv.lp_percent != null ? toNumber(jv.lp_percent) : null,
      promote_structure_id: promoteId,
      nav: state ? toNumber(state.nav) : null,
      noi: state ? toNumber(state.noi) : null,
      debt_balance: state ? toNumber(state.debt_balance) : null,
      cash_balance: state ? toNumber(state.cash_balance) : null,
      asset_count: assets.length,
      assets,
      partner_shares: partners,
      waterfall_tiers: tiers,
    };
  });

  return { fund_id: fundId, quarter, jvs };
}
