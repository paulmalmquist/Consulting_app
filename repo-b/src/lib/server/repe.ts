import crypto from "node:crypto";
import type { PoolClient, QueryResultRow } from "pg";
import {
  DEFAULT_UNDERWRITING_ASSUMPTIONS,
  type AssetUnderwritingInput,
  type FundUnderwritingOutput,
  type UnderwritingAssumptions,
  projectFundUnderwriting,
} from "@/lib/repe/underwriting";
import {
  type WaterfallTier,
  type WaterfallPartner,
  runWaterfall,
} from "@/lib/repe/waterfall";
import { composeIcMemo } from "@/lib/repe/icMemo";
import {
  parseDate,
  parseNumber,
  requireString,
  withClient,
  withTransaction,
} from "@/lib/server/db";

type Json = Record<string, unknown>;

export type RepeWorkspaceFund = {
  fundId: string;
  businessId: string;
  name: string;
  strategy: string | null;
  status: string | null;
  vintageYear: number | null;
  targetSize: number | null;
};

export type RepeQuarterState = {
  fundId: string;
  quarter: string;
  portfolioNav: number | null;
  totalCommitted: number | null;
  totalCalled: number | null;
  totalDistributed: number | null;
  dpi: number | null;
  tvpi: number | null;
  grossIrr: number | null;
  netIrr: number | null;
  weightedLtv: number | null;
  weightedDscr: number | null;
  runId: string | null;
};

export type RepePipelineDeal = {
  dealId: string;
  dealName: string;
  status: string;
  source: string | null;
  strategy: string | null;
  propertyType: string | null;
  headlinePrice: number | null;
  targetIrr: number | null;
  targetMoic: number | null;
  targetCloseDate: string | null;
  notes: string | null;
};

export type RepeDocument = {
  docId: string;
  fileName: string;
  documentType: string | null;
  classification: string;
  extractionStatus: string;
  parserStatus: string | null;
  confidence: number | null;
  errorMessage: string | null;
  extractedFields: Record<string, unknown>;
  evidence: string[];
  assetName: string | null;
  market: string | null;
  location: string | null;
  yearBuilt: number | null;
};

export type RepeModelResult = {
  metric: string;
  baseValue: number | null;
  modelValue: number | null;
  variance: number | null;
};

export type RepeModel = {
  modelId: string;
  name: string;
  status: string | null;
  modelType: string | null;
  strategyType: string | null;
  updatedAt: string | null;
  latestRunId: string | null;
  latestRunStatus: string | null;
  latestRunStartedAt: string | null;
  latestRunCompletedAt: string | null;
  latestRunResults: RepeModelResult[];
};

export type RepeScenario = {
  scenarioId: string;
  name: string;
  scenarioType: string | null;
  isBase: boolean;
  status: string | null;
  versionId: string | null;
  versionNumber: number | null;
  label: string | null;
  grossIrr: number | null;
  netIrr: number | null;
  grossTvpi: number | null;
  netTvpi: number | null;
  dpi: number | null;
  rvpi: number | null;
  portfolioNav: number | null;
  carryEstimate: number | null;
  quarter: string | null;
  waterfallRunId: string | null;
};

export type RepeWaterfallRun = {
  runId: string;
  quarter: string | null;
  scenarioId: string | null;
  runType: string | null;
  totalDistributable: number | null;
  status: string | null;
  createdAt: string | null;
};

export type RepeWaterfallResult = {
  resultId: string;
  runId: string;
  partnerId: string;
  partnerName: string | null;
  tierCode: string;
  payoutType: string | null;
  amount: number | null;
};

export type RepeVarianceRow = {
  assetName: string;
  quarter: string;
  lineCode: string;
  actualAmount: number | null;
  planAmount: number | null;
  varianceAmount: number | null;
  variancePct: number | null;
};

export type RepeLoan = {
  id: string;
  loanName: string;
  upb: number | null;
  rateType: string | null;
  rate: number | null;
  maturity: string | null;
  amortType: string | null;
  paymentFrequency: string | null;
};

export type RepeEntityGraph = {
  nodes: Array<{ id: string; label: string; nodeType: string }>;
  edges: Array<{ id: string; source: string; target: string; edgeType: string; percent?: number | null }>;
};

export type RepeIcMemo = {
  id: string;
  quarter: string;
  status: string | null;
  title: string;
  markdown: string;
  narrativeText: string | null;
  updatedAt: string | null;
};

export type RepeWorkspaceData = {
  envId: string;
  businessId: string;
  selectedFundId: string;
  quarter: string;
  funds: RepeWorkspaceFund[];
  selectedFund: RepeWorkspaceFund;
  quarterState: RepeQuarterState | null;
  pipelineDeals: RepePipelineDeal[];
  documents: RepeDocument[];
  models: RepeModel[];
  scenarios: RepeScenario[];
  waterfallRuns: RepeWaterfallRun[];
  latestWaterfallResults: RepeWaterfallResult[];
  capitalTimeline: Array<{
    quarter: string;
    totalCalled: number;
    totalDistributed: number;
  }>;
  uwVsActual: RepeVarianceRow[];
  loans: RepeLoan[];
  entityGraph: RepeEntityGraph;
  latestIcMemo: RepeIcMemo | null;
};

type ScenarioOverrides = Partial<UnderwritingAssumptions>;

function mapFund(row: QueryResultRow): RepeWorkspaceFund {
  return {
    fundId: row.fund_id,
    businessId: row.business_id,
    name: row.name,
    strategy: row.strategy ?? null,
    status: row.status ?? null,
    vintageYear: parseNumber(row.vintage_year),
    targetSize: parseNumber(row.target_size),
  };
}

function normalizeScenarioName(overrides: ScenarioOverrides): string {
  const rent = overrides.rentGrowthPct ?? DEFAULT_UNDERWRITING_ASSUMPTIONS.rentGrowthPct;
  const expense =
    overrides.expenseRatio ?? DEFAULT_UNDERWRITING_ASSUMPTIONS.expenseRatio;
  const exit = overrides.exitCapRate ?? DEFAULT_UNDERWRITING_ASSUMPTIONS.exitCapRate;
  return `Scenario ${Math.round(rent * 100)}g / ${Math.round(expense * 100)}e / ${Math.round(
    exit * 10000
  )}bps`;
}

async function resolveBusinessId(
  client: PoolClient,
  envId: string,
  businessId?: string | null
): Promise<string> {
  if (businessId) {
    return businessId;
  }

  const binding = await client.query<{ business_id: string }>(
    `
      SELECT business_id::text
      FROM app.env_business_bindings
      WHERE env_id = $1::uuid
      LIMIT 1
    `,
    [envId]
  );
  const resolved = binding.rows[0]?.business_id;
  if (!resolved) {
    throw new Error(`No business binding found for env_id=${envId}`);
  }
  return resolved;
}

async function listFunds(
  client: PoolClient,
  businessId: string
): Promise<RepeWorkspaceFund[]> {
  const result = await client.query(
    `
      SELECT
        fund_id::text,
        business_id::text,
        name,
        strategy,
        status,
        vintage_year,
        target_size
      FROM repe_fund
      WHERE business_id = $1::uuid
      ORDER BY vintage_year DESC NULLS LAST, created_at DESC
    `,
    [businessId]
  );
  return result.rows.map(mapFund);
}

async function getQuarterState(
  client: PoolClient,
  fundId: string,
  quarter?: string | null
): Promise<RepeQuarterState | null> {
  const result = await client.query(
    `
      SELECT
        fund_id::text,
        quarter,
        portfolio_nav,
        total_committed,
        total_called,
        total_distributed,
        dpi,
        tvpi,
        gross_irr,
        net_irr,
        weighted_ltv,
        weighted_dscr,
        run_id::text
      FROM re_fund_quarter_state
      WHERE fund_id = $1::uuid
        AND ($2::text IS NULL OR quarter = $2::text)
      ORDER BY quarter DESC, created_at DESC
      LIMIT 1
    `,
    [fundId, quarter ?? null]
  );

  const row = result.rows[0];
  if (!row) return null;
  return {
    fundId: row.fund_id,
    quarter: row.quarter,
    portfolioNav: parseNumber(row.portfolio_nav),
    totalCommitted: parseNumber(row.total_committed),
    totalCalled: parseNumber(row.total_called),
    totalDistributed: parseNumber(row.total_distributed),
    dpi: parseNumber(row.dpi),
    tvpi: parseNumber(row.tvpi),
    grossIrr: parseNumber(row.gross_irr),
    netIrr: parseNumber(row.net_irr),
    weightedLtv: parseNumber(row.weighted_ltv),
    weightedDscr: parseNumber(row.weighted_dscr),
    runId: row.run_id ?? null,
  };
}

async function listPipelineDeals(
  client: PoolClient,
  envId: string
): Promise<RepePipelineDeal[]> {
  const result = await client.query(
    `
      SELECT
        deal_id::text,
        deal_name,
        status,
        source,
        strategy,
        property_type,
        headline_price,
        target_irr,
        target_moic,
        target_close_date,
        notes
      FROM re_pipeline_deal
      WHERE env_id = $1::uuid
      ORDER BY COALESCE(target_close_date, CURRENT_DATE + INTERVAL '365 days'), updated_at DESC
    `,
    [envId]
  );

  return result.rows.map((row) => ({
    dealId: row.deal_id,
    dealName: row.deal_name,
    status: row.status,
    source: row.source ?? null,
    strategy: row.strategy ?? null,
    propertyType: row.property_type ?? null,
    headlinePrice: parseNumber(row.headline_price),
    targetIrr: parseNumber(row.target_irr),
    targetMoic: parseNumber(row.target_moic),
    targetCloseDate: parseDate(row.target_close_date),
    notes: row.notes ?? null,
  }));
}

async function listDocuments(
  client: PoolClient,
  businessId: string,
  fundId: string
): Promise<RepeDocument[]> {
  const result = await client.query(
    `
      SELECT
        d.doc_id::text,
        d.doc_type,
        d.file_name,
        d.parser_status,
        d.confidence,
        d.extracted_data,
        d.notes,
        l.base_rent_psf,
        l.status AS lease_status,
        a.name AS asset_name,
        p.market,
        p.city,
        p.state,
        p.year_built,
        p.units,
        p.avg_rent_per_unit,
        p.current_noi,
        p.occupancy
      FROM re_lease_document d
      JOIN re_lease l ON l.lease_id = d.lease_id
      JOIN repe_asset a ON a.asset_id = l.asset_id
      JOIN repe_deal deal ON deal.deal_id = a.deal_id
      JOIN repe_fund fund ON fund.fund_id = deal.fund_id
      LEFT JOIN repe_property_asset p ON p.asset_id = a.asset_id
      WHERE fund.business_id = $1::uuid
        AND fund.fund_id = $2::uuid
      ORDER BY d.uploaded_at DESC
    `,
    [businessId, fundId]
  );

  return result.rows.map((row) => {
    const extracted = (row.extracted_data as Json | null) ?? {};
    const classification = row.doc_type?.includes("rent")
      ? "rent_roll"
      : row.doc_type?.includes("lease")
        ? "lease"
        : row.doc_type?.includes("amendment")
          ? "lease_amendment"
          : "om";
    const location = [row.city, row.state].filter(Boolean).join(", ") || row.market;
    const extractedFields = {
      unit_count: extracted.unit_count ?? parseNumber(row.units),
      rent_range:
        extracted.rent_range ??
        (row.base_rent_psf ? `$${Number(row.base_rent_psf).toFixed(2)}/sf` : null),
      location: extracted.location ?? (location || null),
      year_built: extracted.year_built ?? parseNumber(row.year_built),
      financial_metrics:
        extracted.financial_metrics ??
        {
          current_noi: parseNumber(row.current_noi),
          occupancy: parseNumber(row.occupancy),
          avg_rent_per_unit: parseNumber(row.avg_rent_per_unit),
        },
    };

    return {
      docId: row.doc_id,
      fileName: row.file_name,
      documentType: row.doc_type ?? null,
      classification,
      extractionStatus: extracted && Object.keys(extracted).length > 0 ? "extracted" : "context_enriched",
      parserStatus: row.parser_status ?? null,
      confidence: parseNumber(row.confidence),
      errorMessage: row.parser_status === "failed" ? row.notes ?? "Parser failed" : null,
      extractedFields,
      evidence: [
        row.parser_status ? `parser_status:${row.parser_status}` : "",
        row.asset_name ? `asset:${row.asset_name}` : "",
        location ? `location:${location}` : "",
      ].filter(Boolean),
      assetName: row.asset_name ?? null,
      market: row.market ?? null,
      location: location || null,
      yearBuilt: parseNumber(row.year_built),
    };
  });
}

async function listModels(
  client: PoolClient,
  fundId: string,
  envId: string
): Promise<RepeModel[]> {
  const result = await client.query(
    `
      SELECT
        m.model_id::text,
        m.name,
        m.status,
        m.model_type,
        m.strategy_type,
        m.updated_at,
        latest.id::text AS latest_run_id,
        latest.status AS latest_run_status,
        latest.started_at AS latest_run_started_at,
        latest.completed_at AS latest_run_completed_at,
        COALESCE(
          json_agg(
            json_build_object(
              'metric', rr.metric,
              'base_value', rr.base_value,
              'model_value', rr.model_value,
              'variance', rr.variance
            )
            ORDER BY rr.metric
          ) FILTER (WHERE rr.id IS NOT NULL),
          '[]'::json
        ) AS latest_run_results
      FROM re_model m
      LEFT JOIN LATERAL (
        SELECT *
        FROM re_model_run mr
        WHERE mr.model_id = m.model_id
        ORDER BY COALESCE(mr.completed_at, mr.started_at, mr.created_at) DESC
        LIMIT 1
      ) latest ON true
      LEFT JOIN re_model_run_result rr ON rr.run_id = latest.id
      WHERE m.primary_fund_id = $1::uuid
         OR (m.env_id IS NOT NULL AND m.env_id = $2::uuid)
      GROUP BY
        m.model_id,
        m.name,
        m.status,
        m.model_type,
        m.strategy_type,
        m.updated_at,
        latest.id,
        latest.status,
        latest.started_at,
        latest.completed_at
      ORDER BY m.updated_at DESC NULLS LAST, m.created_at DESC
    `,
    [fundId, envId]
  );

  return result.rows.map((row) => ({
    modelId: row.model_id,
    name: row.name,
    status: row.status ?? null,
    modelType: row.model_type ?? null,
    strategyType: row.strategy_type ?? null,
    updatedAt: parseDate(row.updated_at),
    latestRunId: row.latest_run_id ?? null,
    latestRunStatus: row.latest_run_status ?? null,
    latestRunStartedAt: parseDate(row.latest_run_started_at),
    latestRunCompletedAt: parseDate(row.latest_run_completed_at),
    latestRunResults: ((row.latest_run_results as Array<Record<string, unknown>>) || []).map(
      (metric) => ({
        metric: String(metric.metric ?? ""),
        baseValue: parseNumber(metric.base_value),
        modelValue: parseNumber(metric.model_value),
        variance: parseNumber(metric.variance),
      })
    ),
  }));
}

async function getModelRun(
  client: PoolClient,
  runId: string
): Promise<{ run: QueryResultRow | null; results: RepeModelResult[] }> {
  const runResult = await client.query(
    `
      SELECT
        id::text,
        model_id::text,
        status,
        started_at,
        completed_at,
        triggered_by,
        error_message,
        result_summary,
        created_at
      FROM re_model_run
      WHERE id = $1::uuid
      LIMIT 1
    `,
    [runId]
  );
  const metricsResult = await client.query(
    `
      SELECT
        metric,
        base_value,
        model_value,
        variance
      FROM re_model_run_result
      WHERE run_id = $1::uuid
      ORDER BY metric
    `,
    [runId]
  );

  return {
    run: runResult.rows[0] ?? null,
    results: metricsResult.rows.map((row) => ({
      metric: row.metric,
      baseValue: parseNumber(row.base_value),
      modelValue: parseNumber(row.model_value),
      variance: parseNumber(row.variance),
    })),
  };
}

async function listScenarios(
  client: PoolClient,
  fundId: string,
  quarter?: string | null
): Promise<RepeScenario[]> {
  const result = await client.query(
    `
      SELECT
        s.scenario_id::text,
        s.name,
        s.scenario_type,
        s.is_base,
        s.status,
        version.version_id::text,
        version.version_number,
        version.label,
        snapshot.gross_irr,
        snapshot.net_irr,
        snapshot.gross_tvpi,
        snapshot.net_tvpi,
        snapshot.dpi,
        snapshot.rvpi,
        snapshot.portfolio_nav,
        snapshot.carry_estimate,
        snapshot.quarter,
        snapshot.waterfall_run_id::text
      FROM re_scenario s
      LEFT JOIN LATERAL (
        SELECT *
        FROM re_scenario_version version
        WHERE version.scenario_id = s.scenario_id
        ORDER BY version.version_number DESC
        LIMIT 1
      ) version ON true
      LEFT JOIN LATERAL (
        SELECT *
        FROM re_scenario_metrics_snapshot snapshot
        WHERE snapshot.scenario_id = s.scenario_id
          AND ($2::text IS NULL OR snapshot.quarter = $2::text)
        ORDER BY snapshot.computed_at DESC
        LIMIT 1
      ) snapshot ON true
      WHERE s.fund_id = $1::uuid
      ORDER BY s.is_base DESC, s.created_at DESC
    `,
    [fundId, quarter ?? null]
  );

  return result.rows.map((row) => ({
    scenarioId: row.scenario_id,
    name: row.name,
    scenarioType: row.scenario_type ?? null,
    isBase: Boolean(row.is_base),
    status: row.status ?? null,
    versionId: row.version_id ?? null,
    versionNumber: parseNumber(row.version_number),
    label: row.label ?? null,
    grossIrr: parseNumber(row.gross_irr),
    netIrr: parseNumber(row.net_irr),
    grossTvpi: parseNumber(row.gross_tvpi),
    netTvpi: parseNumber(row.net_tvpi),
    dpi: parseNumber(row.dpi),
    rvpi: parseNumber(row.rvpi),
    portfolioNav: parseNumber(row.portfolio_nav),
    carryEstimate: parseNumber(row.carry_estimate),
    quarter: row.quarter ?? null,
    waterfallRunId: row.waterfall_run_id ?? null,
  }));
}

async function listWaterfallRuns(
  client: PoolClient,
  fundId: string
): Promise<RepeWaterfallRun[]> {
  const result = await client.query(
    `
      SELECT
        run_id::text,
        quarter,
        scenario_id::text,
        run_type,
        total_distributable,
        status,
        created_at
      FROM re_waterfall_run
      WHERE fund_id = $1::uuid
      ORDER BY created_at DESC
    `,
    [fundId]
  );

  return result.rows.map((row) => ({
    runId: row.run_id,
    quarter: row.quarter ?? null,
    scenarioId: row.scenario_id ?? null,
    runType: row.run_type ?? null,
    totalDistributable: parseNumber(row.total_distributable),
    status: row.status ?? null,
    createdAt: parseDate(row.created_at),
  }));
}

async function listWaterfallResults(
  client: PoolClient,
  runId: string | null
): Promise<RepeWaterfallResult[]> {
  if (!runId) return [];
  const result = await client.query(
    `
      SELECT
        result.result_id::text,
        result.run_id::text,
        result.partner_id::text,
        partner.name AS partner_name,
        result.tier_code,
        result.payout_type,
        result.amount
      FROM re_waterfall_run_result result
      LEFT JOIN re_partner partner ON partner.partner_id = result.partner_id
      WHERE result.run_id = $1::uuid
      ORDER BY result.created_at DESC, result.amount DESC
    `,
    [runId]
  );

  return result.rows.map((row) => ({
    resultId: row.result_id,
    runId: row.run_id,
    partnerId: row.partner_id,
    partnerName: row.partner_name ?? null,
    tierCode: row.tier_code,
    payoutType: row.payout_type ?? null,
    amount: parseNumber(row.amount),
  }));
}

async function getCapitalTimeline(
  client: PoolClient,
  fundId: string
): Promise<Array<{ quarter: string; totalCalled: number; totalDistributed: number }>> {
  const result = await client.query(
    `
      WITH quarter_activity AS (
        SELECT
          quarter,
          COALESCE(
            SUM(CASE WHEN entry_type = 'contribution' THEN amount_base ELSE 0 END),
            0
          ) AS quarter_called,
          COALESCE(
            SUM(CASE WHEN entry_type IN ('distribution', 'recallable_dist') THEN amount_base ELSE 0 END),
            0
          ) AS quarter_distributed
        FROM re_capital_ledger_entry
        WHERE fund_id = $1::uuid
        GROUP BY quarter
      )
      SELECT
        quarter,
        SUM(quarter_called) OVER (ORDER BY quarter) AS total_called,
        SUM(quarter_distributed) OVER (ORDER BY quarter) AS total_distributed
      FROM quarter_activity
      ORDER BY quarter
    `,
    [fundId]
  );

  return result.rows.map((row) => ({
    quarter: row.quarter,
    totalCalled: parseNumber(row.total_called) ?? 0,
    totalDistributed: parseNumber(row.total_distributed) ?? 0,
  }));
}

async function getUwVsActual(
  client: PoolClient,
  fundId: string,
  quarter?: string | null
): Promise<RepeVarianceRow[]> {
  const result = await client.query(
    `
      SELECT
        COALESCE(asset.name, variance.asset_id::text) AS asset_name,
        variance.quarter,
        variance.line_code,
        variance.actual_amount,
        variance.plan_amount,
        variance.variance_amount,
        variance.variance_pct
      FROM re_asset_variance_qtr variance
      LEFT JOIN repe_asset asset ON asset.asset_id = variance.asset_id
      WHERE variance.fund_id = $1::uuid
        AND ($2::text IS NULL OR variance.quarter = $2::text)
      ORDER BY ABS(COALESCE(variance.variance_amount, 0)) DESC
      LIMIT 20
    `,
    [fundId, quarter ?? null]
  );

  return result.rows.map((row) => ({
    assetName: row.asset_name,
    quarter: row.quarter,
    lineCode: row.line_code,
    actualAmount: parseNumber(row.actual_amount),
    planAmount: parseNumber(row.plan_amount),
    varianceAmount: parseNumber(row.variance_amount),
    variancePct: parseNumber(row.variance_pct),
  }));
}

async function listLoans(
  client: PoolClient,
  fundId: string
): Promise<RepeLoan[]> {
  const result = await client.query(
    `
      SELECT
        id::text,
        loan_name,
        upb,
        rate_type,
        rate,
        maturity,
        amort_type,
        payment_frequency
      FROM re_loan
      WHERE fund_id = $1::uuid
      ORDER BY maturity ASC NULLS LAST, created_at DESC
    `,
    [fundId]
  );

  return result.rows.map((row) => ({
    id: row.id,
    loanName: row.loan_name,
    upb: parseNumber(row.upb),
    rateType: row.rate_type ?? null,
    rate: parseNumber(row.rate),
    maturity: parseDate(row.maturity),
    amortType: row.amort_type ?? null,
    paymentFrequency: row.payment_frequency ?? null,
  }));
}

async function getEntityGraph(
  client: PoolClient,
  businessId: string,
  fundId: string
): Promise<RepeEntityGraph> {
  const nodes: RepeEntityGraph["nodes"] = [];
  const edges: RepeEntityGraph["edges"] = [];

  const entityResult = await client.query(
    `
      SELECT entity_id::text, name, entity_type
      FROM repe_entity
      WHERE business_id = $1::uuid
      ORDER BY created_at ASC
    `,
    [businessId]
  );
  for (const row of entityResult.rows) {
    nodes.push({
      id: row.entity_id,
      label: row.name,
      nodeType: row.entity_type,
    });
  }

  const edgeResult = await client.query(
    `
      SELECT
        ownership_edge_id::text,
        from_entity_id::text,
        to_entity_id::text,
        percent
      FROM repe_ownership_edge
      ORDER BY created_at ASC
    `
  );
  for (const row of edgeResult.rows) {
    edges.push({
      id: row.ownership_edge_id,
      source: row.from_entity_id,
      target: row.to_entity_id,
      edgeType: "ownership",
      percent: parseNumber(row.percent),
    });
  }

  const fundDealAssetResult = await client.query(
    `
      SELECT
        fund.fund_id::text,
        fund.name AS fund_name,
        deal.deal_id::text,
        deal.name AS deal_name,
        asset.asset_id::text,
        asset.name AS asset_name
      FROM repe_fund fund
      LEFT JOIN repe_deal deal ON deal.fund_id = fund.fund_id
      LEFT JOIN repe_asset asset ON asset.deal_id = deal.deal_id
      WHERE fund.fund_id = $1::uuid
    `,
    [fundId]
  );

  for (const row of fundDealAssetResult.rows) {
    if (!nodes.some((node) => node.id === row.fund_id)) {
      nodes.push({ id: row.fund_id, label: row.fund_name, nodeType: "fund" });
    }
    if (row.deal_id && !nodes.some((node) => node.id === row.deal_id)) {
      nodes.push({ id: row.deal_id, label: row.deal_name, nodeType: "deal" });
      edges.push({
        id: `fund-deal-${row.deal_id}`,
        source: row.fund_id,
        target: row.deal_id,
        edgeType: "owns_deal",
      });
    }
    if (row.asset_id && !nodes.some((node) => node.id === row.asset_id)) {
      nodes.push({ id: row.asset_id, label: row.asset_name, nodeType: "asset" });
      if (row.deal_id) {
        edges.push({
          id: `deal-asset-${row.asset_id}`,
          source: row.deal_id,
          target: row.asset_id,
          edgeType: "holds_asset",
        });
      }
    }
  }

  const loanResult = await client.query(
    `
      SELECT id::text, loan_name, asset_id::text
      FROM re_loan
      WHERE fund_id = $1::uuid
    `,
    [fundId]
  );
  for (const row of loanResult.rows) {
    nodes.push({ id: row.id, label: row.loan_name, nodeType: "loan" });
    if (row.asset_id) {
      edges.push({
        id: `asset-loan-${row.id}`,
        source: row.asset_id,
        target: row.id,
        edgeType: "secured_by",
      });
    }
  }

  return { nodes, edges };
}

async function getLatestIcMemo(
  client: PoolClient,
  fundId: string,
  quarter?: string | null
): Promise<RepeIcMemo | null> {
  const result = await client.query(
    `
      SELECT
        id::text,
        quarter,
        status,
        content_json,
        narrative_text,
        updated_at
      FROM re_ir_drafts
      WHERE fund_id = $1::uuid
        AND draft_type = 'ic_memo'
        AND ($2::text IS NULL OR quarter = $2::text)
      ORDER BY updated_at DESC, created_at DESC
      LIMIT 1
    `,
    [fundId, quarter ?? null]
  );
  const row = result.rows[0];
  if (!row) return null;
  const content = (row.content_json as Json | null) ?? {};

  return {
    id: row.id,
    quarter: row.quarter,
    status: row.status ?? null,
    title: String(content.title ?? `IC Memo ${row.quarter}`),
    markdown: String(content.markdown ?? row.narrative_text ?? ""),
    narrativeText: row.narrative_text ?? null,
    updatedAt: parseDate(row.updated_at),
  };
}

async function getAssetInputsForFund(
  client: PoolClient,
  fundId: string
): Promise<AssetUnderwritingInput[]> {
  const result = await client.query(
    `
      SELECT
        asset.asset_id::text,
        asset.name AS asset_name,
        asset.asset_type,
        property.current_noi,
        property.occupancy,
        property.units,
        property.leasable_sf,
        property.avg_rent_per_unit,
        op.revenue AS latest_revenue,
        op.other_income AS latest_other_income,
        op.opex AS latest_opex,
        op.capex AS latest_capex,
        op.debt_service AS latest_debt_service,
        op.leasing_costs AS latest_leasing_costs,
        op.tenant_improvements AS latest_tenant_improvements
      FROM repe_asset asset
      JOIN repe_deal deal ON deal.deal_id = asset.deal_id
      LEFT JOIN repe_property_asset property ON property.asset_id = asset.asset_id
      LEFT JOIN LATERAL (
        SELECT *
        FROM re_asset_operating_qtr op
        WHERE op.asset_id = asset.asset_id
        ORDER BY op.quarter DESC, op.created_at DESC
        LIMIT 1
      ) op ON true
      WHERE deal.fund_id = $1::uuid
      ORDER BY asset.created_at ASC
    `,
    [fundId]
  );

  return result.rows.map((row) => ({
    assetId: row.asset_id,
    assetName: row.asset_name,
    assetType: row.asset_type ?? null,
    currentNoi: parseNumber(row.current_noi),
    occupancy: parseNumber(row.occupancy),
    units: parseNumber(row.units),
    leasableSf: parseNumber(row.leasable_sf),
    avgRentPerUnit: parseNumber(row.avg_rent_per_unit),
    latestRevenue: parseNumber(row.latest_revenue),
    latestOtherIncome: parseNumber(row.latest_other_income),
    latestOpex: parseNumber(row.latest_opex),
    latestCapex: parseNumber(row.latest_capex),
    latestDebtService: parseNumber(row.latest_debt_service),
    latestLeasingCosts: parseNumber(row.latest_leasing_costs),
    latestTenantImprovements: parseNumber(row.latest_tenant_improvements),
  }));
}

async function previewFundUnderwriting(
  client: PoolClient,
  fundId: string,
  assumptions?: ScenarioOverrides
): Promise<FundUnderwritingOutput> {
  const inputs = await getAssetInputsForFund(client, fundId);
  if (inputs.length === 0) {
    throw new Error("No fund assets are available for underwriting.");
  }
  return projectFundUnderwriting(inputs, assumptions);
}

function scenarioMetricsFromOutputs(args: {
  baseQuarterState: RepeQuarterState | null;
  output: FundUnderwritingOutput;
  overrides: ScenarioOverrides;
}): {
  grossIrr: number;
  netIrr: number;
  grossTvpi: number;
  netTvpi: number;
  dpi: number;
  rvpi: number;
  totalDistributed: number;
  portfolioNav: number;
  carryEstimate: number;
} {
  const base = args.baseQuarterState;
  const modeledNoi = args.output.totals.modeled.noi;
  const baseNoi = args.output.totals.base.noi || 1;
  const noiDeltaPct = (modeledNoi - baseNoi) / baseNoi;
  const expenseDelta =
    (args.overrides.expenseRatio ?? DEFAULT_UNDERWRITING_ASSUMPTIONS.expenseRatio) -
    DEFAULT_UNDERWRITING_ASSUMPTIONS.expenseRatio;
  const exitDelta =
    (args.overrides.exitCapRate ?? DEFAULT_UNDERWRITING_ASSUMPTIONS.exitCapRate) -
    DEFAULT_UNDERWRITING_ASSUMPTIONS.exitCapRate;

  const baseNav = base?.portfolioNav ?? args.output.totals.modeled.exitValue;
  const navImpactFactor = noiDeltaPct * 0.7 - exitDelta * 6 - expenseDelta * 1.2;
  const portfolioNav = baseNav * (1 + navImpactFactor);
  const grossIrr = (base?.grossIrr ?? 0.12) + noiDeltaPct * 0.45 - exitDelta * 3;
  const netIrr = (base?.netIrr ?? 0.1) + noiDeltaPct * 0.35 - exitDelta * 2.4;
  const grossTvpi = (base?.tvpi ?? 1.2) * (1 + noiDeltaPct * 0.4 - exitDelta * 1.2);
  const netTvpi = grossTvpi * 0.92;
  const dpi = Math.max(0.2, (base?.dpi ?? 0.4) + noiDeltaPct * 0.12);
  const rvpi = Math.max(0.1, grossTvpi - dpi);
  const totalDistributed = (base?.totalDistributed ?? 0) + args.output.totals.modeled.cashFlow;
  const carryEstimate = Math.max(0, (grossTvpi - 1) * 0.2 * 100_000_000);

  return {
    grossIrr: Number(grossIrr.toFixed(6)),
    netIrr: Number(netIrr.toFixed(6)),
    grossTvpi: Number(grossTvpi.toFixed(6)),
    netTvpi: Number(netTvpi.toFixed(6)),
    dpi: Number(dpi.toFixed(6)),
    rvpi: Number(rvpi.toFixed(6)),
    totalDistributed: Number(totalDistributed.toFixed(2)),
    portfolioNav: Number(portfolioNav.toFixed(2)),
    carryEstimate: Number(carryEstimate.toFixed(2)),
  };
}

async function fetchWaterfallDefinition(
  client: PoolClient,
  fundId: string
): Promise<{
  definitionId: string;
  tiers: WaterfallTier[];
  partners: WaterfallPartner[];
}> {
  const definition = await client.query(
    `
      SELECT definition_id::text
      FROM re_waterfall_definition
      WHERE fund_id = $1::uuid
        AND is_active = true
      ORDER BY version DESC, effective_date DESC
      LIMIT 1
    `,
    [fundId]
  );
  const definitionId = definition.rows[0]?.definition_id;
  if (!definitionId) {
    throw new Error("No active waterfall definition found.");
  }

  const tiersResult = await client.query(
    `
      SELECT
        tier_order,
        tier_type,
        hurdle_rate,
        split_gp,
        split_lp,
        catch_up_percent
      FROM re_waterfall_tier
      WHERE definition_id = $1::uuid
      ORDER BY tier_order ASC
    `,
    [definitionId]
  );
  const partnerResult = await client.query(
    `
      SELECT
        partner.partner_id::text,
        partner.name,
        partner.partner_type,
        commitment.committed_amount
      FROM re_partner_commitment commitment
      JOIN re_partner partner ON partner.partner_id = commitment.partner_id
      WHERE commitment.fund_id = $1::uuid
        AND commitment.status = 'active'
      ORDER BY commitment.committed_amount DESC
    `,
    [fundId]
  );

  return {
    definitionId,
    tiers: tiersResult.rows.map((row) => ({
      tierOrder: parseNumber(row.tier_order) ?? 0,
      tierType: row.tier_type,
      hurdleRate: parseNumber(row.hurdle_rate),
      splitGp: parseNumber(row.split_gp),
      splitLp: parseNumber(row.split_lp),
      catchUpPercent: parseNumber(row.catch_up_percent),
    })),
    partners: partnerResult.rows.map((row) => ({
      partnerId: row.partner_id,
      name: row.name,
      partnerType: row.partner_type,
      committedAmount: parseNumber(row.committed_amount) ?? 0,
    })),
  };
}

export async function getRepeWorkspace(args: {
  envId: string;
  businessId?: string | null;
  fundId?: string | null;
  quarter?: string | null;
}): Promise<RepeWorkspaceData> {
  return withClient(async (client) => {
    const businessId = await resolveBusinessId(client, args.envId, args.businessId);
    const funds = await listFunds(client, businessId);
    if (funds.length === 0) {
      throw new Error("No REPE funds found for this Meridian environment.");
    }

    const selectedFundId =
      args.fundId && funds.some((fund) => fund.fundId === args.fundId)
        ? args.fundId
        : funds[0].fundId;
    const selectedFund = funds.find((fund) => fund.fundId === selectedFundId) || funds[0];
    const quarterState = await getQuarterState(client, selectedFundId, args.quarter);
    const quarter = args.quarter || quarterState?.quarter || "2026Q1";

    const [pipelineDeals, documents, models, scenarios, waterfallRuns, capitalTimeline, uwVsActual, loans, entityGraph, latestIcMemo] =
      await Promise.all([
        listPipelineDeals(client, args.envId),
        listDocuments(client, businessId, selectedFundId),
        listModels(client, selectedFundId, args.envId),
        listScenarios(client, selectedFundId, quarter),
        listWaterfallRuns(client, selectedFundId),
        getCapitalTimeline(client, selectedFundId),
        getUwVsActual(client, selectedFundId, quarter),
        listLoans(client, selectedFundId),
        getEntityGraph(client, businessId, selectedFundId),
        getLatestIcMemo(client, selectedFundId, quarter),
      ]);

    const latestWaterfallRun = waterfallRuns[0] ?? null;
    const latestWaterfallResults = await listWaterfallResults(
      client,
      latestWaterfallRun?.runId ?? null
    );

    return {
      envId: args.envId,
      businessId,
      selectedFundId,
      quarter,
      funds,
      selectedFund,
      quarterState,
      pipelineDeals,
      documents,
      models,
      scenarios,
      waterfallRuns,
      latestWaterfallResults,
      capitalTimeline,
      uwVsActual,
      loans,
      entityGraph,
      latestIcMemo,
    };
  });
}

export async function runModelForFund(args: {
  modelId: string;
  assumptions?: ScenarioOverrides;
  triggeredBy?: string | null;
}): Promise<{
  runId: string;
  modelId: string;
  fundId: string;
  outputs: FundUnderwritingOutput;
}> {
  return withTransaction(async (client) => {
    const model = await client.query(
      `
        SELECT model_id::text, primary_fund_id::text
        FROM re_model
        WHERE model_id = $1::uuid
        LIMIT 1
      `,
      [args.modelId]
    );
    const row = model.rows[0];
    if (!row) {
      throw new Error("Model not found.");
    }

    const fundId = row.primary_fund_id;
    const outputs = await previewFundUnderwriting(client, fundId, args.assumptions);
    const runId = crypto.randomUUID();
    const summary = {
      assumptions: outputs.assumptions,
      totals: outputs.totals,
      calc_trace: outputs.calcTrace,
    };

    await client.query(
      `
        INSERT INTO re_model_run (
          id,
          model_id,
          status,
          started_at,
          completed_at,
          triggered_by,
          error_message,
          result_summary,
          created_at
        ) VALUES (
          $1::uuid,
          $2::uuid,
          'completed',
          NOW(),
          NOW(),
          $3::text,
          NULL,
          $4::jsonb,
          NOW()
        )
      `,
      [runId, args.modelId, args.triggeredBy || "repe_workspace", JSON.stringify(summary)]
    );

    const metricRows = [
      { metric: "revenue", baseValue: outputs.totals.base.revenue, modelValue: outputs.totals.modeled.revenue },
      { metric: "opex", baseValue: outputs.totals.base.opex, modelValue: outputs.totals.modeled.opex },
      { metric: "noi", baseValue: outputs.totals.base.noi, modelValue: outputs.totals.modeled.noi },
      { metric: "cash_flow", baseValue: outputs.totals.base.cashFlow, modelValue: outputs.totals.modeled.cashFlow },
      { metric: "exit_value", baseValue: outputs.totals.base.exitValue, modelValue: outputs.totals.modeled.exitValue },
    ];

    for (const metric of metricRows) {
      await client.query(
        `
          INSERT INTO re_model_run_result (
            id,
            run_id,
            fund_id,
            metric,
            base_value,
            model_value,
            variance,
            created_at
          ) VALUES (
            $1::uuid,
            $2::uuid,
            $3::uuid,
            $4::text,
            $5::numeric,
            $6::numeric,
            $7::numeric,
            NOW()
          )
        `,
        [
          crypto.randomUUID(),
          runId,
          fundId,
          metric.metric,
          metric.baseValue,
          metric.modelValue,
          Number((metric.modelValue - metric.baseValue).toFixed(6)),
        ]
      );
    }

    await client.query(
      `
        UPDATE re_model
        SET updated_at = NOW()
        WHERE model_id = $1::uuid
      `,
      [args.modelId]
    );

    return {
      runId,
      modelId: args.modelId,
      fundId,
      outputs,
    };
  });
}

export async function createScenarioForFund(args: {
  fundId: string;
  name?: string | null;
  description?: string | null;
  scenarioType?: string | null;
  quarter?: string | null;
  modelId?: string | null;
  overrides?: ScenarioOverrides;
  createdBy?: string | null;
}): Promise<{
  scenarioId: string;
  versionId: string;
  quarter: string;
  metrics: ReturnType<typeof scenarioMetricsFromOutputs>;
}> {
  return withTransaction(async (client) => {
    const quarterState = await getQuarterState(client, args.fundId, args.quarter ?? null);
    const quarter = args.quarter || quarterState?.quarter || "2026Q1";
    let modelId = args.modelId ?? null;

    if (!modelId) {
      const modelResult = await client.query(
        `
          SELECT model_id::text
          FROM re_model
          WHERE primary_fund_id = $1::uuid
          ORDER BY updated_at DESC NULLS LAST, created_at DESC
          LIMIT 1
        `,
        [args.fundId]
      );
      modelId = modelResult.rows[0]?.model_id ?? null;
    }
    if (!modelId) {
      throw new Error("No model is available for this fund.");
    }

    const run = await runModelForFund({
      modelId,
      assumptions: args.overrides,
      triggeredBy: args.createdBy || "scenario_builder",
    });

    const scenarioId = crypto.randomUUID();
    const versionId = crypto.randomUUID();
    const metrics = scenarioMetricsFromOutputs({
      baseQuarterState: quarterState,
      output: run.outputs,
      overrides: args.overrides ?? {},
    });
    const name = args.name?.trim() || normalizeScenarioName(args.overrides ?? {});

    await client.query(
      `
        INSERT INTO re_scenario (
          scenario_id,
          fund_id,
          name,
          description,
          scenario_type,
          is_base,
          parent_scenario_id,
          base_assumption_set_id,
          status,
          created_at,
          model_id
        ) VALUES (
          $1::uuid,
          $2::uuid,
          $3::text,
          $4::text,
          $5::text,
          false,
          NULL,
          NULL,
          'active',
          NOW(),
          $6::uuid
        )
      `,
      [
        scenarioId,
        args.fundId,
        name,
        args.description ?? null,
        args.scenarioType || "custom",
        modelId,
      ]
    );

    await client.query(
      `
        INSERT INTO re_scenario_version (
          version_id,
          scenario_id,
          model_id,
          version_number,
          label,
          assumption_set_id,
          is_locked,
          locked_at,
          locked_by,
          notes,
          created_at
        ) VALUES (
          $1::uuid,
          $2::uuid,
          $3::uuid,
          1,
          $4::text,
          NULL,
          false,
          NULL,
          NULL,
          $5::text,
          NOW()
        )
      `,
      [versionId, scenarioId, modelId, "Initial Version", args.description ?? null]
    );

    await client.query(
      `
        INSERT INTO re_scenario_metrics_snapshot (
          fund_id,
          scenario_id,
          quarter,
          run_id,
          gross_irr,
          net_irr,
          gross_tvpi,
          net_tvpi,
          dpi,
          rvpi,
          total_distributed,
          portfolio_nav,
          carry_estimate,
          waterfall_run_id,
          computed_at
        ) VALUES (
          $1::uuid,
          $2::uuid,
          $3::text,
          $4::uuid,
          $5::numeric,
          $6::numeric,
          $7::numeric,
          $8::numeric,
          $9::numeric,
          $10::numeric,
          $11::numeric,
          $12::numeric,
          $13::numeric,
          NULL,
          NOW()
        )
      `,
      [
        args.fundId,
        scenarioId,
        quarter,
        run.runId,
        metrics.grossIrr,
        metrics.netIrr,
        metrics.grossTvpi,
        metrics.netTvpi,
        metrics.dpi,
        metrics.rvpi,
        metrics.totalDistributed,
        metrics.portfolioNav,
        metrics.carryEstimate,
      ]
    );

    return {
      scenarioId,
      versionId,
      quarter,
      metrics,
    };
  });
}

export async function runWaterfallForFund(args: {
  fundId: string;
  quarter?: string | null;
  scenarioId?: string | null;
  totalDistributable?: number | null;
  runType?: string | null;
}): Promise<{
  runId: string;
  fundId: string;
  totalDistributable: number;
  results: ReturnType<typeof runWaterfall>;
}> {
  return withTransaction(async (client) => {
    const { definitionId, tiers, partners } = await fetchWaterfallDefinition(
      client,
      args.fundId
    );
    let totalDistributable = args.totalDistributable ?? null;

    if (!totalDistributable && args.scenarioId) {
      const snapshot = await client.query(
        `
          SELECT portfolio_nav
          FROM re_scenario_metrics_snapshot
          WHERE scenario_id = $1::uuid
          ORDER BY computed_at DESC
          LIMIT 1
        `,
        [args.scenarioId]
      );
      const nav = parseNumber(snapshot.rows[0]?.portfolio_nav);
      if (nav) {
        totalDistributable = nav * 0.08;
      }
    }

    if (!totalDistributable) {
      const quarterState = await getQuarterState(client, args.fundId, args.quarter ?? null);
      totalDistributable = quarterState?.totalDistributed
        ? quarterState.totalDistributed * 0.15
        : 25_000_000;
    }

    const result = runWaterfall({
      totalDistributable,
      partners,
      tiers,
    });

    const runId = crypto.randomUUID();
    await client.query(
      `
        INSERT INTO re_waterfall_run (
          run_id,
          fund_id,
          definition_id,
          quarter,
          scenario_id,
          run_type,
          total_distributable,
          inputs_hash,
          status,
          created_at
        ) VALUES (
          $1::uuid,
          $2::uuid,
          $3::uuid,
          $4::text,
          $5::uuid,
          $6::text,
          $7::numeric,
          $8::text,
          'completed',
          NOW()
        )
      `,
      [
        runId,
        args.fundId,
        definitionId,
        args.quarter ?? null,
        args.scenarioId ?? null,
        args.runType || "api",
        totalDistributable,
        `api:${args.fundId}:${args.scenarioId ?? "base"}`,
      ]
    );

    for (const tier of result.tierResults) {
      for (const allocation of tier.allocations) {
        await client.query(
          `
            INSERT INTO re_waterfall_run_result (
              result_id,
              run_id,
              partner_id,
              tier_code,
              payout_type,
              amount,
              tier_breakdown_json,
              ending_capital_balance,
              created_at
            ) VALUES (
              $1::uuid,
              $2::uuid,
              $3::uuid,
              $4::text,
              $5::text,
              $6::numeric,
              $7::jsonb,
              NULL,
              NOW()
            )
          `,
          [
            crypto.randomUUID(),
            runId,
            allocation.partnerId,
            tier.tierCode,
            tier.tierType,
            allocation.amount,
            JSON.stringify(tier.allocations),
          ]
        );
      }
    }

    if (args.scenarioId) {
      await client.query(
        `
          UPDATE re_scenario_metrics_snapshot
          SET waterfall_run_id = $1::uuid
          WHERE scenario_id = $2::uuid
            AND quarter = COALESCE($3::text, quarter)
        `,
        [runId, args.scenarioId, args.quarter ?? null]
      );
    }

    return {
      runId,
      fundId: args.fundId,
      totalDistributable,
      results: result,
    };
  });
}

export async function createIcMemo(args: {
  envId: string;
  fundId: string;
  quarter?: string | null;
  scenarioId?: string | null;
  modelRunId?: string | null;
  generatedBy?: string | null;
}): Promise<RepeIcMemo> {
  return withTransaction(async (client) => {
    const fundResult = await client.query(
      `
        SELECT fund_id::text, business_id::text, name
        FROM repe_fund
        WHERE fund_id = $1::uuid
        LIMIT 1
      `,
      [args.fundId]
    );
    const fund = fundResult.rows[0];
    if (!fund) {
      throw new Error("Fund not found.");
    }

    const quarterState = await getQuarterState(client, args.fundId, args.quarter ?? null);
    const quarter = args.quarter || quarterState?.quarter || "2026Q1";
    const documents = await listDocuments(client, fund.business_id, args.fundId);
    const loans = await listLoans(client, args.fundId);
    const variance = await getUwVsActual(client, args.fundId, quarter);
    const scenarios = await listScenarios(client, args.fundId, quarter);
    const scenario = args.scenarioId
      ? scenarios.find((entry) => entry.scenarioId === args.scenarioId) ?? null
      : scenarios[0] ?? null;
    const modelRun = args.modelRunId ? await getModelRun(client, args.modelRunId) : null;
    const memo = composeIcMemo({
      fundName: fund.name,
      quarter,
      quarterState,
      scenario:
        scenario && scenario.portfolioNav !== null
          ? {
              name: scenario.name,
              grossIrr: scenario.grossIrr,
              portfolioNav: scenario.portfolioNav,
              grossTvpi: scenario.grossTvpi,
            }
          : null,
      modelRun:
        modelRun?.run
          ? {
              runId: String(modelRun.run.id),
              status: String(modelRun.run.status),
              metrics: modelRun.results,
            }
          : null,
      documentCount: documents.length,
      loanCount: loans.length,
      varianceHighlights: variance.slice(0, 5).map((entry) => ({
        assetName: entry.assetName,
        lineCode: entry.lineCode,
        varianceAmount: entry.varianceAmount,
      })),
    });

    const draftId = crypto.randomUUID();
    await client.query(
      `
        INSERT INTO re_ir_drafts (
          id,
          env_id,
          business_id,
          fund_id,
          quarter,
          draft_type,
          status,
          content_json,
          narrative_text,
          generated_by,
          reviewed_by,
          reviewed_at,
          review_notes,
          version,
          report_id,
          created_at,
          updated_at
        ) VALUES (
          $1::uuid,
          $2::text,
          $3::uuid,
          $4::uuid,
          $5::text,
          'ic_memo',
          'draft',
          $6::jsonb,
          $7::text,
          $8::text,
          NULL,
          NULL,
          NULL,
          1,
          NULL,
          NOW(),
          NOW()
        )
      `,
      [
        draftId,
        args.envId,
        fund.business_id,
        args.fundId,
        quarter,
        JSON.stringify({
          title: memo.title,
          markdown: memo.markdown,
          ...memo.contentJson,
        }),
        memo.narrativeText,
        args.generatedBy || "repe_workspace",
      ]
    );

    return {
      id: draftId,
      quarter,
      status: "draft",
      title: memo.title,
      markdown: memo.markdown,
      narrativeText: memo.narrativeText,
      updatedAt: new Date().toISOString(),
    };
  });
}

export async function getModelRunPayload(runId: string): Promise<{
  run: Record<string, unknown> | null;
  results: RepeModelResult[];
}> {
  return withClient(async (client) => {
    const payload = await getModelRun(client, runId);
    return {
      run: payload.run
        ? {
            id: payload.run.id,
            model_id: payload.run.model_id,
            status: payload.run.status,
            started_at: parseDate(payload.run.started_at),
            completed_at: parseDate(payload.run.completed_at),
            triggered_by: payload.run.triggered_by,
            error_message: payload.run.error_message,
            result_summary: payload.run.result_summary ?? null,
            created_at: parseDate(payload.run.created_at),
          }
        : null,
      results: payload.results,
    };
  });
}

export function parseWorkspaceRequestBody(body: unknown): {
  envId?: string | null;
  fundId?: string | null;
  quarter?: string | null;
  scenarioId?: string | null;
  modelId?: string | null;
  modelRunId?: string | null;
  name?: string | null;
  description?: string | null;
  runType?: string | null;
  totalDistributable?: number | null;
  assumptions?: ScenarioOverrides;
} {
  const payload = (body ?? {}) as Record<string, unknown>;
  const assumptionsPayload = (payload.assumptions ?? {}) as Record<string, unknown>;

  return {
    envId: typeof payload.env_id === "string" ? payload.env_id : null,
    fundId: typeof payload.fund_id === "string" ? payload.fund_id : null,
    quarter: typeof payload.quarter === "string" ? payload.quarter : null,
    scenarioId: typeof payload.scenario_id === "string" ? payload.scenario_id : null,
    modelId: typeof payload.model_id === "string" ? payload.model_id : null,
    modelRunId: typeof payload.model_run_id === "string" ? payload.model_run_id : null,
    name: typeof payload.name === "string" ? payload.name : null,
    description: typeof payload.description === "string" ? payload.description : null,
    runType: typeof payload.run_type === "string" ? payload.run_type : null,
    totalDistributable: parseNumber(payload.total_distributable),
    assumptions: {
      rentGrowthPct: parseNumber(assumptionsPayload.rent_growth_pct) ?? undefined,
      expenseRatio: parseNumber(assumptionsPayload.expense_ratio) ?? undefined,
      exitCapRate: parseNumber(assumptionsPayload.exit_cap_rate) ?? undefined,
      otherIncomeGrowthPct:
        parseNumber(assumptionsPayload.other_income_growth_pct) ?? undefined,
      capexReservePct:
        parseNumber(assumptionsPayload.capex_reserve_pct) ?? undefined,
    },
  };
}

export function requireFundId(value: string | null | undefined): string {
  return requireString(value, "fund_id");
}
