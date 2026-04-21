import { getPool, resolveBusinessId } from "@/lib/server/db";

export const runtime = "nodejs";

type AssetPoint = {
  asset_id: string;
  name: string;
  status: "owned" | "pipeline" | "disposed";
  lifecycle: "stabilized" | "development" | "distressed";
  property_type: string | null;
  market: string | null;
  market_key: string;
  city: string | null;
  state: string | null;
  lat: number;
  lon: number;
  cost_basis: number | null;
  asset_value: number | null;
  noi: number | null;
  occupancy: number | null;
  dscr: number | null;
  ltv: number | null;
  valuation_quarter: string | null;
  trust_status: string | null;
  dscr_trust_state: string | null;
  dscr_reason: string | null;
  integrity_reason: string | null;
};

type AssetHistoryPoint = {
  asset_id: string;
  quarter: string;
  asset_value: number | null;
  noi: number | null;
  occupancy: number | null;
  dscr: number | null;
  ltv: number | null;
};

type MarketSeriesAccumulator = {
  quarter: string;
  total_nav: number;
  total_noi: number;
  avg_occupancy: number | null;
  avg_dscr: number | null;
  _occupancy_values: number[];
  _dscr_values: number[];
};

const EMPTY_RESPONSE = {
  summary: {
    total_nav: 0,
    owned_assets: 0,
    pipeline_assets: 0,
    disposed_assets: 0,
    markets: 0,
    geography_allocation: [],
    top_markets: [],
    performance_by_market: [],
    signals: [],
  },
  selection_defaults: { mode: "portfolio" },
  asset_points: [],
  market_rollups: [],
  asset_series: {},
  market_series: {},
};

const REGION_BY_STATE: Record<string, string> = {
  CT: "Northeast", ME: "Northeast", MA: "Northeast", NH: "Northeast", RI: "Northeast", VT: "Northeast",
  NJ: "Northeast", NY: "Northeast", PA: "Northeast",
  IL: "Midwest", IN: "Midwest", MI: "Midwest", OH: "Midwest", WI: "Midwest",
  IA: "Midwest", KS: "Midwest", MN: "Midwest", MO: "Midwest", NE: "Midwest", ND: "Midwest", SD: "Midwest",
  DE: "South", FL: "South", GA: "South", MD: "South", NC: "South", SC: "South", VA: "South", DC: "South",
  WV: "South", AL: "South", KY: "South", MS: "South", TN: "South", AR: "South", LA: "South", OK: "South", TX: "South",
  AZ: "West", CO: "West", ID: "West", MT: "West", NV: "West", NM: "West", UT: "West", WY: "West",
  AK: "West", CA: "West", HI: "West", OR: "West", WA: "West",
};

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function average(values: Array<number | null | undefined>): number | null {
  const valid = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (!valid.length) return null;
  return valid.reduce((sum, value) => sum + value, 0) / valid.length;
}

function deriveLifecycle(status: string, dealStage: string | null, assetStatus: string | null): AssetPoint["lifecycle"] {
  const assetStatusKey = (assetStatus ?? "").toLowerCase();
  const dealStageKey = (dealStage ?? "").toLowerCase();
  if (assetStatusKey.includes("distress") || assetStatusKey.includes("watch")) return "distressed";
  if (status === "pipeline" || ["sourcing", "underwriting", "ic", "closing", "development"].includes(dealStageKey)) {
    return "development";
  }
  return "stabilized";
}

function marketPerformanceState(avgOccupancy: number | null, avgDscr: number | null): "outperforming" | "neutral" | "underperforming" {
  if ((avgOccupancy != null && avgOccupancy < 0.88) || (avgDscr != null && avgDscr < 1.1)) return "underperforming";
  if ((avgOccupancy != null && avgOccupancy >= 0.94) || (avgDscr != null && avgDscr >= 1.35)) return "outperforming";
  return "neutral";
}

function marketLabel(point: Pick<AssetPoint, "market" | "city" | "state">): string {
  return point.market || [point.city, point.state].filter(Boolean).join(", ") || point.state || "Unknown market";
}

function buildSignals(points: AssetPoint[], topMarkets: Array<{ market_key: string; market_label: string; total_nav: number; share_of_nav: number; avg_occupancy: number | null; avg_dscr: number | null; integrity_issues: number; }>) {
  const signals: string[] = [];
  const leadingMarket = topMarkets[0];
  if (leadingMarket && leadingMarket.share_of_nav >= 0.25) {
    signals.push(`Overexposed market: ${leadingMarket.market_label} (${Math.round(leadingMarket.share_of_nav * 100)}% NAV)`);
  }
  const weakMarket = topMarkets.find((market) => marketPerformanceState(market.avg_occupancy, market.avg_dscr) === "underperforming");
  if (weakMarket) {
    signals.push(`Weak performance cluster: ${weakMarket.market_label}`);
  }
  const integrityCount = points.filter((point) => point.integrity_reason || point.dscr_trust_state === "missing_inputs").length;
  if (integrityCount > 0) {
    signals.push(`Integrity watch: ${integrityCount} assets have missing released metrics or debt coverage inputs`);
  }
  return signals;
}

export async function OPTIONS() {
  return new Response(null, { status: 200, headers: { Allow: "GET, OPTIONS" } });
}

export async function GET(
  request: Request,
  { params }: { params: { fundId: string } },
) {
  const pool = getPool();
  if (!pool) return Response.json(EMPTY_RESPONSE);

  const { searchParams } = new URL(request.url);
  const envId = searchParams.get("env_id");
  const quarter = searchParams.get("quarter");
  const statusFilter = searchParams.get("status") || "all";

  if (!envId || !quarter) {
    return Response.json(EMPTY_RESPONSE, { status: 400 });
  }

  try {
    const businessId = await resolveBusinessId(pool, envId, searchParams.get("business_id"));
    if (!businessId) return Response.json(EMPTY_RESPONSE);

    const assetRes = await pool.query(
      `
      SELECT
        a.asset_id::text AS asset_id,
        a.name,
        CASE
          WHEN a.asset_status IN ('exited', 'written_off', 'disposed', 'realized') THEN 'disposed'
          WHEN a.asset_status = 'pipeline' THEN 'pipeline'
          WHEN d.stage IN ('sourcing','underwriting','ic','closing') THEN 'pipeline'
          ELSE 'owned'
        END AS status,
        a.asset_status,
        d.stage AS deal_stage,
        pa.property_type,
        pa.market,
        COALESCE(NULLIF(pa.market, ''), CONCAT_WS(', ', pa.city, pa.state), pa.state, 'Unknown market') AS market_label,
        COALESCE(NULLIF(pa.market, ''), CONCAT_WS('|', COALESCE(pa.city, 'unknown-city'), COALESCE(pa.state, 'unknown-state'))) AS market_key,
        pa.city,
        pa.state,
        pa.latitude::float8 AS lat,
        pa.longitude::float8 AS lon,
        a.cost_basis::float8 AS cost_basis,
        auth.quarter AS valuation_quarter,
        auth.trust_status,
        NULLIF(auth.canonical_metrics->>'asset_value', '')::float8 AS asset_value,
        NULLIF(auth.canonical_metrics->>'noi', '')::float8 AS noi,
        NULLIF(auth.canonical_metrics->>'occupancy', '')::float8 AS occupancy,
        NULLIF(auth.canonical_metrics->>'dscr', '')::float8 AS dscr,
        NULLIF(auth.canonical_metrics->>'ltv', '')::float8 AS ltv,
        COALESCE(
          NULLIF(auth.canonical_metrics->>'dscr_trust_state', ''),
          CASE
            WHEN NULLIF(auth.canonical_metrics->>'dscr', '') IS NOT NULL THEN 'verified'
            ELSE 'missing_inputs'
          END
        ) AS dscr_trust_state,
        COALESCE(
          NULLIF(auth.canonical_metrics->>'dscr_reason', ''),
          auth.null_reasons->>'dscr',
          auth.null_reasons->>'state'
        ) AS dscr_reason,
        CASE
          WHEN auth.asset_id IS NULL THEN 'no_released_snapshot'
          WHEN auth.trust_status <> 'trusted' THEN COALESCE(auth.null_reasons->>'state', 'snapshot_untrusted')
          ELSE NULL
        END AS integrity_reason
      FROM repe_asset a
      JOIN repe_deal d
        ON d.deal_id = a.deal_id
      JOIN repe_fund f
        ON f.fund_id = d.fund_id
      JOIN repe_property_asset pa
        ON pa.asset_id = a.asset_id
      LEFT JOIN LATERAL (
        SELECT
          s.asset_id,
          s.quarter,
          s.trust_status,
          s.canonical_metrics,
          s.null_reasons
        FROM re_authoritative_asset_state_qtr s
        WHERE s.asset_id = a.asset_id
          AND s.env_id = $3
          AND s.business_id = $1::uuid
          AND s.promotion_state = 'released'
          AND s.quarter = $4
        ORDER BY s.created_at DESC
        LIMIT 1
      ) auth ON true
      WHERE f.business_id = $1::uuid
        AND f.fund_id = $2::uuid
        AND pa.latitude IS NOT NULL
        AND pa.longitude IS NOT NULL
      ORDER BY a.name
      `,
      [businessId, params.fundId, envId, quarter],
    );

    const historyRes = await pool.query(
      `
      WITH ranked AS (
        SELECT
          s.asset_id::text AS asset_id,
          s.quarter,
          NULLIF(s.canonical_metrics->>'asset_value', '')::float8 AS asset_value,
          NULLIF(s.canonical_metrics->>'noi', '')::float8 AS noi,
          NULLIF(s.canonical_metrics->>'occupancy', '')::float8 AS occupancy,
          NULLIF(s.canonical_metrics->>'dscr', '')::float8 AS dscr,
          NULLIF(s.canonical_metrics->>'ltv', '')::float8 AS ltv,
          ROW_NUMBER() OVER (
            PARTITION BY s.asset_id, s.quarter
            ORDER BY s.created_at DESC
          ) AS row_rank,
          ROW_NUMBER() OVER (
            PARTITION BY s.asset_id
            ORDER BY s.quarter DESC, s.created_at DESC
          ) AS seq_rank
        FROM re_authoritative_asset_state_qtr s
        WHERE s.business_id = $1::uuid
          AND s.fund_id = $2::uuid
          AND s.env_id = $3
          AND s.promotion_state = 'released'
          AND s.quarter <= $4
      )
      SELECT
        asset_id,
        quarter,
        asset_value,
        noi,
        occupancy,
        dscr,
        ltv
      FROM ranked
      WHERE row_rank = 1
        AND seq_rank <= 8
      ORDER BY asset_id, quarter
      `,
      [businessId, params.fundId, envId, quarter],
    );

    const fundStateRes = await pool.query(
      `
      SELECT
        canonical_metrics
      FROM re_authoritative_fund_state_qtr
      WHERE business_id = $1::uuid
        AND fund_id = $2::uuid
        AND env_id = $3
        AND promotion_state = 'released'
        AND quarter = $4
      ORDER BY created_at DESC
      LIMIT 1
      `,
      [businessId, params.fundId, envId, quarter],
    );

    const points: AssetPoint[] = assetRes.rows
      .map((row) => {
        const status = String(row.status) as AssetPoint["status"];
        return {
          asset_id: row.asset_id,
          name: row.name,
          status,
          lifecycle: deriveLifecycle(status, row.deal_stage, row.asset_status),
          property_type: row.property_type,
          market: row.market_label,
          market_key: row.market_key,
          city: row.city,
          state: row.state,
          lat: Number(row.lat),
          lon: Number(row.lon),
          cost_basis: toNumber(row.cost_basis),
          asset_value: toNumber(row.asset_value),
          noi: toNumber(row.noi),
          occupancy: toNumber(row.occupancy),
          dscr: toNumber(row.dscr),
          ltv: toNumber(row.ltv),
          valuation_quarter: row.valuation_quarter,
          trust_status: row.trust_status,
          dscr_trust_state: row.dscr_trust_state,
          dscr_reason: row.dscr_reason,
          integrity_reason: row.integrity_reason,
        };
      })
      .filter((row) => statusFilter === "all" || row.status === statusFilter);

    const assetSeries = historyRes.rows.reduce<Record<string, AssetHistoryPoint[]>>((acc, row) => {
      const entry: AssetHistoryPoint = {
        asset_id: row.asset_id,
        quarter: row.quarter,
        asset_value: toNumber(row.asset_value),
        noi: toNumber(row.noi),
        occupancy: toNumber(row.occupancy),
        dscr: toNumber(row.dscr),
        ltv: toNumber(row.ltv),
      };
      acc[row.asset_id] = acc[row.asset_id] ?? [];
      acc[row.asset_id].push(entry);
      return acc;
    }, {});

    const marketBuckets = new Map<string, AssetPoint[]>();
    for (const point of points) {
      const bucket = marketBuckets.get(point.market_key) ?? [];
      bucket.push(point);
      marketBuckets.set(point.market_key, bucket);
    }

    const marketSeries = new Map<string, Array<{ quarter: string; total_nav: number | null; total_noi: number | null; avg_occupancy: number | null; avg_dscr: number | null }>>();
    for (const [assetId, history] of Object.entries(assetSeries)) {
      const point = points.find((candidate) => candidate.asset_id === assetId);
      if (!point) continue;
      const byQuarter = new Map<string, MarketSeriesAccumulator>();
      for (const entry of marketSeries.get(point.market_key) ?? []) {
        byQuarter.set(entry.quarter, {
          quarter: entry.quarter,
          total_nav: entry.total_nav ?? 0,
          total_noi: entry.total_noi ?? 0,
          avg_occupancy: entry.avg_occupancy ?? null,
          avg_dscr: entry.avg_dscr ?? null,
          _occupancy_values: entry.avg_occupancy != null ? [entry.avg_occupancy] : [],
          _dscr_values: entry.avg_dscr != null ? [entry.avg_dscr] : [],
        });
      }
      for (const item of history) {
        const existing: MarketSeriesAccumulator = byQuarter.get(item.quarter) ?? {
          quarter: item.quarter,
          total_nav: 0,
          total_noi: 0,
          avg_occupancy: null,
          avg_dscr: null,
          _occupancy_values: [],
          _dscr_values: [],
        };
        existing.total_nav += item.asset_value ?? 0;
        existing.total_noi += item.noi ?? 0;
        if (item.occupancy != null) existing._occupancy_values.push(item.occupancy);
        if (item.dscr != null) existing._dscr_values.push(item.dscr);
        byQuarter.set(item.quarter, existing);
      }
      marketSeries.set(point.market_key, Array.from(byQuarter.values()).map((entry) => ({
        quarter: entry.quarter,
        total_nav: entry.total_nav ?? null,
        total_noi: entry.total_noi ?? null,
        avg_occupancy: average(entry._occupancy_values),
        avg_dscr: average(entry._dscr_values),
      })).sort((left, right) => left.quarter.localeCompare(right.quarter)));
    }

    const marketRollups = Array.from(marketBuckets.entries())
      .map(([marketKey, marketPoints]) => {
        const totalNav = marketPoints.reduce((sum, point) => sum + (point.asset_value ?? point.cost_basis ?? 0), 0);
        const avgOccupancy = average(marketPoints.map((point) => point.occupancy));
        const avgDscr = average(marketPoints.map((point) => point.dscr));
        return {
          market_key: marketKey,
          market_label: marketLabel(marketPoints[0]),
          state: marketPoints[0]?.state ?? null,
          lat: average(marketPoints.map((point) => point.lat)) ?? 0,
          lon: average(marketPoints.map((point) => point.lon)) ?? 0,
          asset_count: marketPoints.length,
          total_nav: totalNav,
          avg_occupancy: avgOccupancy,
          avg_dscr: avgDscr,
          avg_irr: null,
          integrity_issues: marketPoints.filter((point) => point.integrity_reason || point.dscr_trust_state === "missing_inputs").length,
          status_breakdown: {
            owned: marketPoints.filter((point) => point.status === "owned").length,
            pipeline: marketPoints.filter((point) => point.status === "pipeline").length,
            disposed: marketPoints.filter((point) => point.status === "disposed").length,
          },
          performance_state: marketPerformanceState(avgOccupancy, avgDscr),
          lead_asset_ids: marketPoints.map((point) => point.asset_id),
        };
      })
      .sort((left, right) => right.total_nav - left.total_nav);

    const totalNav =
      toNumber(fundStateRes.rows[0]?.canonical_metrics?.ending_nav) ??
      points.reduce((sum, point) => sum + (point.asset_value ?? point.cost_basis ?? 0), 0);

    const geographyTotals = new Map<string, { total_nav: number; asset_count: number }>();
    for (const point of points) {
      const region = REGION_BY_STATE[point.state ?? ""] ?? "Other";
      const current = geographyTotals.get(region) ?? { total_nav: 0, asset_count: 0 };
      current.total_nav += point.asset_value ?? point.cost_basis ?? 0;
      current.asset_count += 1;
      geographyTotals.set(region, current);
    }

    const geographyAllocation = Array.from(geographyTotals.entries())
      .map(([region, totals]) => ({
        region,
        total_nav: totals.total_nav,
        asset_count: totals.asset_count,
        share_of_nav: totalNav > 0 ? totals.total_nav / totalNav : 0,
      }))
      .sort((left, right) => right.total_nav - left.total_nav);

    const topMarkets = marketRollups.slice(0, 5).map((market) => ({
      market_key: market.market_key,
      market_label: market.market_label,
      total_nav: market.total_nav,
      share_of_nav: totalNav > 0 ? market.total_nav / totalNav : 0,
      avg_occupancy: market.avg_occupancy,
      avg_dscr: market.avg_dscr,
      integrity_issues: market.integrity_issues,
      performance_state: market.performance_state,
    }));

    return Response.json({
      summary: {
        total_nav: totalNav,
        owned_assets: points.filter((point) => point.status === "owned").length,
        pipeline_assets: points.filter((point) => point.status === "pipeline").length,
        disposed_assets: points.filter((point) => point.status === "disposed").length,
        markets: marketRollups.length,
        geography_allocation: geographyAllocation,
        top_markets: topMarkets,
        performance_by_market: marketRollups.slice(0, 6),
        signals: buildSignals(points, topMarkets),
      },
      selection_defaults: { mode: "portfolio" },
      asset_points: points,
      market_rollups: marketRollups,
      asset_series: assetSeries,
      market_series: Object.fromEntries(marketSeries.entries()),
    });
  } catch (error) {
    console.error("[re/v2/funds/[fundId]/footprint-analytics] DB error", error);
    return Response.json(EMPTY_RESPONSE);
  }
}
