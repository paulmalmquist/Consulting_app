from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from uuid import UUID

import psycopg
from fastapi import APIRouter, HTTPException, Query, Request

from app.db import get_cursor
from app.observability.logger import emit_log
from app.schemas.re_institutional import (
    ReAssumptionOverrideInput,
    ReAssumptionOverrideOut,
    ReAssumptionSetCreateRequest,
    ReAssumptionSetOut,
    ReAssumptionValueInput,
    ReAssetQuarterStateOut,
    ReCapitalLedgerEntryCreateRequest,
    ReCapitalLedgerEntryOut,
    ReCashflowEntryCreateRequest,
    ReCashflowEntryOut,
    ReEnvironmentPortfolioKpisOut,
    ReFundQuarterMetricsOut,
    ReFundQuarterStateOut,
    ReInvestmentCreateRequest,
    ReInvestmentOut,
    ReInvestmentQuarterStateOut,
    ReJvCreateRequest,
    ReJvOut,
    ReJvPartnerShareCreateRequest,
    ReJvPartnerShareOut,
    ReJvQuarterStateOut,
    RePartnerCommitmentCreateRequest,
    RePartnerCommitmentOut,
    RePartnerCreateRequest,
    RePartnerOut,
    RePartnerQuarterMetricsOut,
    ReQuarterCloseOut,
    ReQuarterCloseRequest,
    ReRunProvenanceOut,
    ReScenarioCreateRequest,
    ReScenarioOut,
    ReModelCreateRequest,
    ReModelPatchRequest,
    ReModelOut,
    ReModelScopeInput,
    ReModelScopeOut,
    ReModelOverrideInput,
    ReModelOverrideOut,
    ReModelMcRunRequest,
    ReModelMcRunOut,
    ReScenarioVersionCreateRequest,
    ReScenarioVersionOut,
    ReWaterfallRunOut,
    ReWaterfallRunRequest,
    ReModelScenarioCreateRequest,
    ReModelScenarioOut,
    ReScenarioCloneRequest,
    ReScenarioAssetInput,
    ReScenarioAssetOut,
    ReAvailableAssetOut,
    ReScenarioOverrideInput,
    ReScenarioOverrideOut,
    ReScenarioRunOut,
    ReModelRunDetailOut,
    ReScenarioCompareRequest,
    ReScenarioCompareOut,
    ReScenarioRunV2Out,
    ReAssetCashflowOut,
    ReFundCashflowOut,
    ReReturnMetricsOut,
    ReWaterfallResultOut,
    ReAssetPreviewOut,
    ReScenarioCompareV2Out,
)
from app.services import (
    re_investment,
    re_jv,
    re_partner,
    re_capital_ledger,
    re_cashflow_ledger,
    re_env_portfolio,
    re_scenario,
    re_model,
    re_model_scenario,
    re_provenance,
    re_quarter_close,
    re_integrity,
    re_lineage,
    re_waterfall_runtime,
    repe_context,
)

router = APIRouter(prefix="/api/re/v2", tags=["re-v2"])


def _to_http(exc: Exception) -> HTTPException:
    if isinstance(exc, psycopg.errors.UndefinedTable):
        return HTTPException(
            503,
            {"error_code": "SCHEMA_NOT_MIGRATED", "message": "RE schema not migrated.", "detail": "Run migration 270."},
        )
    if isinstance(exc, LookupError):
        return HTTPException(
            404,
            {"error_code": "NOT_FOUND", "message": str(exc), "detail": None},
        )
    if isinstance(exc, ValueError):
        return HTTPException(
            400,
            {"error_code": "VALIDATION_ERROR", "message": str(exc), "detail": None},
        )
    return HTTPException(
        500,
        {"error_code": "INTERNAL_ERROR", "message": "An unexpected error occurred.", "detail": str(exc)},
    )


def _log(action: str, msg: str, **ctx):
    emit_log(level="info", service="backend", action=action, message=msg, context=ctx)


def _assert_model_unlocked(model_id: UUID) -> None:
    """Raise 409 Conflict if model is locked (official_base_case or archived)."""
    if re_model.is_model_locked(model_id=model_id):
        raise HTTPException(
            409,
            {"error_code": "MODEL_LOCKED", "message": "Model is locked. Return to Draft before making changes."},
        )


# ── Health Check ──────────────────────────────────────────────────────────────


@router.get("/health/schema")
def check_schema_health():
    """Quick check whether core RE tables exist."""
    try:
        with get_cursor() as cur:
            cur.execute("SELECT 1 FROM re_model LIMIT 0")
        return {"ready": True}
    except psycopg.errors.UndefinedTable:
        return {"ready": False, "error_code": "SCHEMA_NOT_MIGRATED", "message": "Run migration 270 to initialize."}
    except Exception:
        return {"ready": False, "error_code": "UNKNOWN", "message": "Unexpected error checking schema."}


# ── Environment Portfolio KPIs ────────────────────────────────────────────────

@router.get(
    "/environments/{env_id}/portfolio-kpis",
    response_model=ReEnvironmentPortfolioKpisOut,
)
def get_environment_portfolio_kpis(
    env_id: UUID,
    request: Request,
    quarter: str = Query(...),
    scenario_id: UUID | None = Query(None),
):
    try:
        resolved = repe_context.resolve_repe_business_context(
            request=request,
            env_id=str(env_id),
            allow_create=True,
        )
        return re_env_portfolio.get_portfolio_kpis(
            env_id=env_id,
            business_id=resolved.business_id,
            quarter=quarter,
            scenario_id=scenario_id,
        )
    except Exception as exc:
        raise _to_http(exc)


@router.get("/environments/{env_id}/portfolio-readiness")
def get_environment_portfolio_readiness(
    env_id: UUID,
    request: Request,
    quarter: str = Query(...),
    scenario_id: UUID | None = Query(None),
):
    """
    Returns data-completeness counts for all active assets in the environment.
    Used to populate the readiness panel on the portfolio page instead of
    showing silent blanks for unvalued / ungeooded assets.
    """
    try:
        resolved = repe_context.resolve_repe_business_context(
            request=request,
            env_id=str(env_id),
            allow_create=True,
        )
        return re_env_portfolio.get_portfolio_readiness(
            env_id=env_id,
            business_id=resolved.business_id,
            quarter=quarter,
            scenario_id=scenario_id,
        )
    except Exception as exc:
        raise _to_http(exc)


# ── Investments ───────────────────────────────────────────────────────────────

@router.get("/funds/{fund_id}/investments", response_model=list[ReInvestmentOut])
def list_investments(fund_id: UUID):
    try:
        return re_investment.list_investments(fund_id=fund_id)
    except Exception as exc:
        raise _to_http(exc)


@router.post("/funds/{fund_id}/investments", response_model=ReInvestmentOut, status_code=201)
def create_investment_endpoint(fund_id: UUID, body: ReInvestmentCreateRequest):
    try:
        row = re_investment.create_investment(fund_id=fund_id, payload=body.model_dump())
        _log("re.investment.created", f"Investment created in fund {fund_id}")
        return row
    except Exception as exc:
        raise _to_http(exc)


@router.get("/investments/{investment_id}", response_model=ReInvestmentOut)
def get_investment(investment_id: UUID):
    try:
        return re_investment.get_investment(investment_id=investment_id)
    except Exception as exc:
        raise _to_http(exc)


# ── JVs ───────────────────────────────────────────────────────────────────────

@router.get("/investments/{investment_id}/jvs", response_model=list[ReJvOut])
def list_jvs(investment_id: UUID):
    try:
        return re_jv.list_jvs(investment_id=investment_id)
    except Exception as exc:
        raise _to_http(exc)


@router.post("/investments/{investment_id}/jvs", response_model=ReJvOut, status_code=201)
def create_jv_endpoint(investment_id: UUID, body: ReJvCreateRequest):
    try:
        row = re_jv.create_jv(investment_id=investment_id, payload=body.model_dump())
        _log("re.jv.created", f"JV created under investment {investment_id}")
        return row
    except Exception as exc:
        raise _to_http(exc)


@router.get("/jvs/{jv_id}", response_model=ReJvOut)
def get_jv(jv_id: UUID):
    try:
        return re_jv.get_jv(jv_id=jv_id)
    except Exception as exc:
        raise _to_http(exc)


@router.get("/jvs/{jv_id}/assets")
def list_jv_assets(
    jv_id: UUID,
    quarter: str | None = Query(None),
    scenario_id: UUID | None = Query(None),
):
    try:
        if quarter:
            return re_lineage.list_jv_assets(jv_id=jv_id, quarter=quarter, scenario_id=scenario_id)
        return re_jv.list_jv_assets(jv_id=jv_id)
    except Exception as exc:
        raise _to_http(exc)


@router.post("/jvs/{jv_id}/partner-shares", response_model=ReJvPartnerShareOut, status_code=201)
def add_jv_partner_share(jv_id: UUID, body: ReJvPartnerShareCreateRequest):
    try:
        row = re_jv.add_partner_share(jv_id=jv_id, payload=body.model_dump())
        _log("re.jv.partner_share.added", f"Partner share added to JV {jv_id}")
        return row
    except Exception as exc:
        raise _to_http(exc)


@router.get("/jvs/{jv_id}/partner-shares", response_model=list[ReJvPartnerShareOut])
def list_jv_partner_shares(jv_id: UUID):
    try:
        return re_jv.list_partner_shares(jv_id=jv_id)
    except Exception as exc:
        raise _to_http(exc)


# ── Partners ──────────────────────────────────────────────────────────────────

@router.get("/partners", response_model=list[RePartnerOut])
def list_partners(business_id: UUID = Query(...)):
    try:
        return re_partner.list_partners(business_id=business_id)
    except Exception as exc:
        raise _to_http(exc)


@router.post("/partners", response_model=RePartnerOut, status_code=201)
def create_partner_endpoint(business_id: UUID = Query(...), body: RePartnerCreateRequest = ...):
    try:
        row = re_partner.create_partner(business_id=business_id, payload=body.model_dump())
        _log("re.partner.created", f"Partner created: {body.name}")
        return row
    except Exception as exc:
        raise _to_http(exc)


@router.get("/funds/{fund_id}/partners", response_model=list[RePartnerOut])
def list_fund_partners(fund_id: UUID):
    try:
        return re_partner.list_fund_partners(fund_id=fund_id)
    except Exception as exc:
        raise _to_http(exc)


@router.post(
    "/funds/{fund_id}/partners/{partner_id}/commitments",
    response_model=RePartnerCommitmentOut,
    status_code=201,
)
def create_commitment(fund_id: UUID, partner_id: UUID, body: RePartnerCommitmentCreateRequest):
    try:
        row = re_partner.create_commitment(
            partner_id=partner_id, fund_id=fund_id, payload=body.model_dump()
        )
        _log("re.commitment.created", f"Commitment for partner {partner_id} in fund {fund_id}")
        return row
    except Exception as exc:
        raise _to_http(exc)


@router.get("/funds/{fund_id}/commitments", response_model=list[RePartnerCommitmentOut])
def list_commitments(fund_id: UUID):
    try:
        return re_partner.list_commitments(fund_id=fund_id)
    except Exception as exc:
        raise _to_http(exc)


# ── Capital Ledger ────────────────────────────────────────────────────────────

@router.post(
    "/funds/{fund_id}/capital-ledger",
    response_model=ReCapitalLedgerEntryOut,
    status_code=201,
)
def record_capital_entry(fund_id: UUID, body: ReCapitalLedgerEntryCreateRequest):
    try:
        row = re_capital_ledger.record_entry(
            fund_id=fund_id,
            partner_id=body.partner_id,
            entry_type=body.entry_type,
            amount=body.amount,
            effective_date=body.effective_date,
            quarter=body.quarter,
            investment_id=body.investment_id,
            jv_id=body.jv_id,
            currency=body.currency,
            fx_rate_to_base=body.fx_rate_to_base,
            memo=body.memo,
            source=body.source,
            source_ref=body.source_ref,
        )
        _log("re.capital_ledger.entry", f"Ledger entry recorded for fund {fund_id}")
        return row
    except Exception as exc:
        raise _to_http(exc)


@router.get("/funds/{fund_id}/capital-ledger", response_model=list[ReCapitalLedgerEntryOut])
def get_capital_ledger(
    fund_id: UUID,
    quarter: str | None = Query(None),
    partner_id: UUID | None = Query(None),
):
    try:
        return re_capital_ledger.get_ledger(
            fund_id=fund_id, quarter=quarter, partner_id=partner_id
        )
    except Exception as exc:
        raise _to_http(exc)


@router.post(
    "/capital-ledger/{entry_id}/reverse",
    response_model=ReCapitalLedgerEntryOut,
    status_code=201,
)
def reverse_capital_entry(entry_id: UUID, memo: str | None = Query(None)):
    try:
        return re_capital_ledger.record_reversal(original_entry_id=entry_id, memo=memo)
    except Exception as exc:
        raise _to_http(exc)


# ── Cashflow Ledger ───────────────────────────────────────────────────────────

@router.post(
    "/funds/{fund_id}/cashflow-ledger",
    response_model=ReCashflowEntryOut,
    status_code=201,
)
def record_cashflow(fund_id: UUID, body: ReCashflowEntryCreateRequest):
    try:
        row = re_cashflow_ledger.record_cashflow(
            fund_id=fund_id,
            cashflow_type=body.cashflow_type,
            amount_base=body.amount_base,
            effective_date=body.effective_date,
            quarter=body.quarter,
            jv_id=body.jv_id,
            asset_id=body.asset_id,
            memo=body.memo,
        )
        _log("re.cashflow_ledger.entry", f"Cashflow recorded for fund {fund_id}")
        return row
    except Exception as exc:
        raise _to_http(exc)


@router.get("/funds/{fund_id}/cashflow-ledger", response_model=list[ReCashflowEntryOut])
def get_cashflows(
    fund_id: UUID,
    quarter: str | None = Query(None),
    asset_id: UUID | None = Query(None),
):
    try:
        return re_cashflow_ledger.get_cashflows(
            fund_id=fund_id, quarter=quarter, asset_id=asset_id
        )
    except Exception as exc:
        raise _to_http(exc)


# ── Quarter State (read-only) ─────────────────────────────────────────────────

@router.get("/funds/{fund_id}/quarter-state/{quarter}", response_model=ReFundQuarterStateOut)
def get_fund_quarter_state(
    fund_id: UUID,
    quarter: str,
    scenario_id: UUID | None = Query(None),
):
    try:
        from app.db import get_cursor
        with get_cursor() as cur:
            clause = "scenario_id = %s" if scenario_id else "scenario_id IS NULL"
            params = [str(fund_id), quarter]
            if scenario_id:
                params.append(str(scenario_id))
            cur.execute(
                f"""
                SELECT * FROM re_fund_quarter_state
                WHERE fund_id = %s AND quarter = %s AND {clause}
                ORDER BY created_at DESC LIMIT 1
                """,
                params,
            )
            row = cur.fetchone()
            if not row:
                raise LookupError(f"No fund state for {fund_id} quarter {quarter}")
            return row
    except Exception as exc:
        raise _to_http(exc)


@router.get("/funds/{fund_id}/base-scenario")
def get_fund_base_scenario(
    fund_id: UUID,
    quarter: str = Query(...),
    scenario_id: UUID | None = Query(None),
):
    """
    Returns per-asset status classification for a fund at the given quarter.
    Asset status_category is derived from explicit asset_status and re_asset_realization
    records — never inferred from missing valuation data.
    Used by the fund detail page to correctly count active/disposed/pipeline assets
    and attribute returns to the right cohort.
    """
    try:
        with get_cursor() as cur:
            scenario_clause = "aqs.scenario_id = %s" if scenario_id else "aqs.scenario_id IS NULL"
            cur.execute(
                f"""
                SELECT
                  a.asset_id,
                  a.name AS asset_name,
                  a.asset_status,
                  -- Explicit status category — NEVER inferred from missing valuation
                  CASE
                    WHEN a.asset_status = 'pipeline'                               THEN 'pipeline'
                    WHEN a.asset_status IN ('disposed','realized','written_off')    THEN 'disposed'
                    WHEN rlz.asset_id IS NOT NULL                                   THEN 'disposed'
                    ELSE 'active'
                  END AS status_category,
                  aqs.nav,
                  aqs.asset_value,
                  aqs.noi,
                  aqs.occupancy,
                  aqs.debt_balance,
                  aqs.ltv,
                  aqs.dscr,
                  aqs.value_source,
                  -- Null-reason codes so the UI can show why a metric is missing
                  CASE
                    WHEN aqs.asset_value IS NULL THEN 'no_valuation_available'
                    WHEN aqs.value_source = 'cost_basis_fallback' THEN 'cost_basis_fallback'
                    WHEN aqs.value_source = 'prior_period_value' THEN 'prior_period_value'
                    ELSE NULL
                  END AS value_reason,
                  CASE
                    WHEN aqs.occupancy IS NULL AND a.asset_status NOT IN ('disposed','pipeline') THEN 'no_operating_data'
                    ELSE NULL
                  END AS occupancy_reason,
                  CASE
                    WHEN aqs.debt_balance IS NULL AND aqs.ltv IS NULL THEN 'no_debt_data'
                    ELSE NULL
                  END AS debt_reason,
                  rlz.sale_date,
                  rlz.gross_sale_price,
                  rlz.attributable_proceeds,
                  d.invested_capital AS cost_basis
                FROM repe_asset a
                JOIN repe_deal d ON d.deal_id = a.deal_id
                LEFT JOIN LATERAL (
                  SELECT asset_id, nav, asset_value, noi, occupancy,
                    debt_balance, ltv, dscr, value_source
                  FROM re_asset_quarter_state
                  WHERE asset_id = a.asset_id AND quarter = %s AND {scenario_clause}
                  ORDER BY created_at DESC LIMIT 1
                ) aqs ON true
                LEFT JOIN re_asset_realization rlz ON rlz.asset_id = a.asset_id
                WHERE d.fund_id = %s
                ORDER BY a.name
                """,
                [quarter] + ([str(scenario_id)] if scenario_id else []) + [str(fund_id)],
            )
            rows = cur.fetchall()
        return {
            "fund_id": str(fund_id),
            "quarter": quarter,
            "scenario_id": str(scenario_id) if scenario_id else None,
            "assets": [dict(r) for r in rows],
            "summary": {
                "total": len(rows),
                "active": sum(1 for r in rows if r.get("status_category") == "active"),
                "disposed": sum(1 for r in rows if r.get("status_category") == "disposed"),
                "pipeline": sum(1 for r in rows if r.get("status_category") == "pipeline"),
                "valued": sum(1 for r in rows if r.get("asset_value") is not None),
                "missing_valuation": sum(1 for r in rows if r.get("asset_value") is None),
            },
        }
    except Exception as exc:
        raise _to_http(exc)


@router.get(
    "/investments/{investment_id}/quarter-state/{quarter}",
    response_model=ReInvestmentQuarterStateOut,
)
def get_investment_quarter_state(
    investment_id: UUID,
    quarter: str,
    scenario_id: UUID | None = Query(None),
):
    try:
        from app.db import get_cursor
        with get_cursor() as cur:
            clause = "scenario_id = %s" if scenario_id else "scenario_id IS NULL"
            params = [str(investment_id), quarter]
            if scenario_id:
                params.append(str(scenario_id))
            cur.execute(
                f"""
                SELECT * FROM re_investment_quarter_state
                WHERE investment_id = %s AND quarter = %s AND {clause}
                ORDER BY created_at DESC LIMIT 1
                """,
                params,
            )
            row = cur.fetchone()
            if not row:
                raise LookupError(f"No investment state for {investment_id} quarter {quarter}")
            return row
    except Exception as exc:
        raise _to_http(exc)


@router.get("/jvs/{jv_id}/quarter-state/{quarter}", response_model=ReJvQuarterStateOut)
def get_jv_quarter_state(
    jv_id: UUID,
    quarter: str,
    scenario_id: UUID | None = Query(None),
):
    try:
        from app.db import get_cursor
        with get_cursor() as cur:
            clause = "scenario_id = %s" if scenario_id else "scenario_id IS NULL"
            params = [str(jv_id), quarter]
            if scenario_id:
                params.append(str(scenario_id))
            cur.execute(
                f"""
                SELECT * FROM re_jv_quarter_state
                WHERE jv_id = %s AND quarter = %s AND {clause}
                ORDER BY created_at DESC LIMIT 1
                """,
                params,
            )
            row = cur.fetchone()
            if not row:
                raise LookupError(f"No JV state for {jv_id} quarter {quarter}")
            return row
    except Exception as exc:
        raise _to_http(exc)


@router.get("/assets/{asset_id}/quarter-state/{quarter}", response_model=ReAssetQuarterStateOut)
def get_asset_quarter_state(
    asset_id: UUID,
    quarter: str,
    scenario_id: UUID | None = Query(None),
):
    try:
        return re_lineage.get_asset_quarter_state(
            asset_id=asset_id,
            quarter=quarter,
            scenario_id=scenario_id,
        )
    except Exception as exc:
        raise _to_http(exc)


@router.get("/funds/{fund_id}/investment-rollup/{quarter}")
def get_fund_investment_rollup(
    fund_id: UUID,
    quarter: str,
    scenario_id: UUID | None = Query(None),
):
    try:
        return re_lineage.list_fund_investment_rollup(
            fund_id=fund_id,
            quarter=quarter,
            scenario_id=scenario_id,
        )
    except Exception as exc:
        raise _to_http(exc)


@router.get("/investments/{investment_id}/assets/{quarter}")
def get_investment_assets(
    investment_id: UUID,
    quarter: str,
    scenario_id: UUID | None = Query(None),
):
    try:
        return re_lineage.list_investment_assets(
            investment_id=investment_id,
            quarter=quarter,
            scenario_id=scenario_id,
        )
    except Exception as exc:
        raise _to_http(exc)


# ── Metrics ───────────────────────────────────────────────────────────────────

@router.get("/funds/{fund_id}/metrics/{quarter}", response_model=ReFundQuarterMetricsOut)
def get_fund_metrics(
    fund_id: UUID,
    quarter: str,
    scenario_id: UUID | None = Query(None),
):
    try:
        from app.db import get_cursor
        with get_cursor() as cur:
            clause = "scenario_id = %s" if scenario_id else "scenario_id IS NULL"
            params = [str(fund_id), quarter]
            if scenario_id:
                params.append(str(scenario_id))
            cur.execute(
                f"""
                SELECT * FROM re_fund_quarter_metrics
                WHERE fund_id = %s AND quarter = %s AND {clause}
                ORDER BY created_at DESC LIMIT 1
                """,
                params,
            )
            row = cur.fetchone()
            if not row:
                raise LookupError(f"No fund metrics for {fund_id} quarter {quarter}")
            return row
    except Exception as exc:
        raise _to_http(exc)


@router.get(
    "/funds/{fund_id}/partner-metrics/{quarter}",
    response_model=list[RePartnerQuarterMetricsOut],
)
def get_partner_metrics(
    fund_id: UUID,
    quarter: str,
    scenario_id: UUID | None = Query(None),
):
    try:
        from app.db import get_cursor
        with get_cursor() as cur:
            clause = "scenario_id = %s" if scenario_id else "scenario_id IS NULL"
            params = [str(fund_id), quarter]
            if scenario_id:
                params.append(str(scenario_id))
            cur.execute(
                f"""
                SELECT * FROM re_partner_quarter_metrics
                WHERE fund_id = %s AND quarter = %s AND {clause}
                ORDER BY created_at DESC
                """,
                params,
            )
            return cur.fetchall()
    except Exception as exc:
        raise _to_http(exc)


# ── Quarter Close ─────────────────────────────────────────────────────────────

@router.post("/funds/{fund_id}/quarter-close", response_model=ReQuarterCloseOut)
def run_quarter_close(fund_id: UUID, body: ReQuarterCloseRequest):
    try:
        result = re_quarter_close.run_quarter_close(
            fund_id=fund_id,
            quarter=body.quarter,
            scenario_id=body.scenario_id,
            accounting_basis=body.accounting_basis,
            valuation_method=body.valuation_method,
            run_waterfall=body.run_waterfall,
            triggered_by="api",
        )
        _log("re.quarter_close.completed", f"Quarter close for fund {fund_id} quarter {body.quarter}")
        return result
    except Exception as exc:
        raise _to_http(exc)


# ── Waterfall ─────────────────────────────────────────────────────────────────

@router.post("/funds/{fund_id}/waterfall/run", response_model=ReWaterfallRunOut)
def run_waterfall_endpoint(fund_id: UUID, body: ReWaterfallRunRequest):
    try:
        result = re_waterfall_runtime.run_waterfall(
            fund_id=fund_id,
            quarter=body.quarter,
            scenario_id=body.scenario_id,
            run_type=body.run_type,
            definition_id=body.definition_id,
        )
        _log("re.waterfall.run", f"Waterfall run for fund {fund_id} quarter {body.quarter}")
        return result
    except Exception as exc:
        raise _to_http(exc)


@router.get("/funds/{fund_id}/waterfall/runs")
def list_waterfall_runs(fund_id: UUID, quarter: str | None = Query(None)):
    try:
        from app.db import get_cursor
        with get_cursor() as cur:
            conditions = ["fund_id = %s"]
            params: list = [str(fund_id)]
            if quarter:
                conditions.append("quarter = %s")
                params.append(quarter)
            cur.execute(
                f"""
                SELECT * FROM re_waterfall_run
                WHERE {' AND '.join(conditions)}
                ORDER BY created_at DESC
                """,
                params,
            )
            return cur.fetchall()
    except Exception as exc:
        raise _to_http(exc)


# ── Scenarios ─────────────────────────────────────────────────────────────────

@router.get("/funds/{fund_id}/scenarios", response_model=list[ReScenarioOut])
def list_scenarios(fund_id: UUID):
    try:
        return re_scenario.list_scenarios(fund_id=fund_id)
    except Exception as exc:
        raise _to_http(exc)


@router.post("/funds/{fund_id}/scenarios", response_model=ReScenarioOut, status_code=201)
def create_scenario(fund_id: UUID, body: ReScenarioCreateRequest):
    try:
        row = re_scenario.create_scenario(fund_id=fund_id, payload=body.model_dump())
        _log("re.scenario.created", f"Scenario '{body.name}' created for fund {fund_id}")
        return row
    except Exception as exc:
        raise _to_http(exc)


@router.post(
    "/scenarios/{scenario_id}/overrides",
    response_model=ReAssumptionOverrideOut,
    status_code=201,
)
def set_override(scenario_id: UUID, body: ReAssumptionOverrideInput):
    try:
        row = re_scenario.set_override(scenario_id=scenario_id, payload=body.model_dump())
        _log("re.scenario.override", f"Override set for scenario {scenario_id}")
        return row
    except Exception as exc:
        raise _to_http(exc)


@router.get("/scenarios/{scenario_id}/overrides", response_model=list[ReAssumptionOverrideOut])
def list_overrides(scenario_id: UUID):
    try:
        return re_scenario.list_overrides(scenario_id=scenario_id)
    except Exception as exc:
        raise _to_http(exc)


# ── Models ────────────────────────────────────────────────────────────────────

@router.get("/funds/{fund_id}/models", response_model=list[ReModelOut])
def list_models(fund_id: UUID):
    try:
        return re_model.list_models(fund_id=fund_id)
    except Exception as exc:
        raise _to_http(exc)


@router.post("/funds/{fund_id}/models", response_model=ReModelOut, status_code=201)
def create_model_for_fund(fund_id: UUID, body: ReModelCreateRequest):
    try:
        row = re_model.create_model(
            fund_id=fund_id,
            name=body.name,
            description=body.description,
            strategy_type=body.strategy_type,
        )
        _log("re.model.created", f"Model '{body.name}' created for fund {fund_id}")
        return row
    except Exception as exc:
        raise _to_http(exc)


@router.get("/models", response_model=list[ReModelOut])
def list_all_models(env_id: UUID | None = Query(None)):
    try:
        return re_model.list_models(env_id=env_id)
    except Exception as exc:
        raise _to_http(exc)


@router.post("/models", response_model=ReModelOut, status_code=201)
def create_model_cross_fund(body: ReModelCreateRequest):
    try:
        row = re_model.create_model(
            fund_id=body.primary_fund_id,
            env_id=body.env_id,
            name=body.name,
            description=body.description,
            strategy_type=body.strategy_type,
            model_type=body.model_type,
        )
        _log("re.model.created", f"Model '{body.name}' created (cross-fund)")
        return row
    except Exception as exc:
        raise _to_http(exc)


@router.get("/models/{model_id}", response_model=ReModelOut)
def get_model(model_id: UUID):
    try:
        return re_model.get_model(model_id=model_id)
    except Exception as exc:
        raise _to_http(exc)


@router.patch("/models/{model_id}", response_model=ReModelOut)
def patch_model(model_id: UUID, body: ReModelPatchRequest):
    try:
        if body.status in ("approved", "official_base_case"):
            row = re_model.set_official_base_case(model_id=model_id)
            _log("re.model.official_base_case", f"Model {model_id} set as Official Base Case")
        elif body.status == "draft":
            row = re_model.unset_official_base_case(model_id=model_id)
            _log("re.model.draft", f"Model {model_id} returned to Draft")
        elif body.status == "archived":
            row = re_model.archive_model(model_id=model_id)
            _log("re.model.archived", f"Model {model_id} archived")
        elif body.name or body.description or body.strategy_type:
            row = re_model.update_model(model_id=model_id, payload=body.model_dump(exclude_none=True))
            _log("re.model.updated", f"Model {model_id} updated")
        else:
            raise ValueError(f"Invalid patch: {body.model_dump()}")
        return row
    except Exception as exc:
        raise _to_http(exc)


# ── Model Scope ──────────────────────────────────────────────────────────────

@router.get("/models/{model_id}/scope", response_model=list[ReModelScopeOut])
def list_model_scope(model_id: UUID):
    try:
        return re_model.list_model_scope(model_id=model_id)
    except Exception as exc:
        raise _to_http(exc)


@router.post("/models/{model_id}/scope", response_model=ReModelScopeOut, status_code=201)
def add_model_scope(model_id: UUID, body: ReModelScopeInput):
    _assert_model_unlocked(model_id)
    try:
        row = re_model.add_model_scope(
            model_id=model_id,
            scope_type=body.scope_type,
            scope_node_id=body.scope_node_id,
        )
        _log("re.model.scope.added", f"Scope added to model {model_id}")
        return row
    except Exception as exc:
        raise _to_http(exc)


@router.delete("/models/{model_id}/scope/{scope_type}/{scope_node_id}", status_code=204)
def remove_model_scope(model_id: UUID, scope_type: str, scope_node_id: UUID):
    _assert_model_unlocked(model_id)
    try:
        re_model.remove_model_scope(
            model_id=model_id,
            scope_type=scope_type,
            scope_node_id=scope_node_id,
        )
    except Exception as exc:
        raise _to_http(exc)


# ── Model Overrides ──────────────────────────────────────────────────────────

@router.get("/models/{model_id}/overrides", response_model=list[ReModelOverrideOut])
def list_model_overrides(model_id: UUID):
    try:
        return re_model.list_model_overrides(model_id=model_id)
    except Exception as exc:
        raise _to_http(exc)


@router.post("/models/{model_id}/overrides", response_model=ReModelOverrideOut, status_code=201)
def set_model_override(model_id: UUID, body: ReModelOverrideInput):
    _assert_model_unlocked(model_id)
    try:
        row = re_model.set_model_override(model_id=model_id, payload=body.model_dump())
        _log("re.model.override.set", f"Override set for model {model_id}: {body.key}")
        return row
    except Exception as exc:
        raise _to_http(exc)


# ── Model Run (quarter close in model context) ──────────────────────────────

@router.post("/models/{model_id}/run")
def run_model(model_id: UUID, body: ReQuarterCloseRequest):
    try:
        from app.services import re_model_run
        result = re_model_run.run_model(
            model_id=model_id,
            quarter=body.quarter,
            run_waterfall=body.run_waterfall,
            triggered_by="model_run",
            model_run_id=body.run_id,
        )
        _log("re.model.run", f"Model {model_id} run for quarter {body.quarter}")
        return result
    except Exception as exc:
        raise _to_http(exc)


# ── Model Monte Carlo ────────────────────────────────────────────────────────

@router.post("/models/{model_id}/montecarlo/run", response_model=ReModelMcRunOut, status_code=201)
def run_model_mc(model_id: UUID, body: ReModelMcRunRequest):
    try:
        from app.services import re_model_monte_carlo
        result = re_model_monte_carlo.start_run(
            model_id=model_id,
            quarter=body.quarter,
            n_sims=body.n_sims,
            seed=body.seed,
            distribution_params=body.distribution_params,
        )
        _log("re.model.mc.started", f"MC started for model {model_id}: {body.n_sims} sims")
        return result
    except Exception as exc:
        raise _to_http(exc)


@router.get("/models/{model_id}/montecarlo/{run_id}")
def get_model_mc_result(model_id: UUID, run_id: UUID):
    try:
        from app.services import re_model_monte_carlo
        return re_model_monte_carlo.get_run(run_id=run_id)
    except Exception as exc:
        raise _to_http(exc)


# ── Scenario Versions ────────────────────────────────────────────────────────

@router.get("/scenarios/{scenario_id}/versions", response_model=list[ReScenarioVersionOut])
def list_versions(scenario_id: UUID):
    try:
        return re_model.list_versions(scenario_id=scenario_id)
    except Exception as exc:
        raise _to_http(exc)


@router.post("/scenarios/{scenario_id}/versions", response_model=ReScenarioVersionOut, status_code=201)
def create_version(scenario_id: UUID, body: ReScenarioVersionCreateRequest):
    try:
        row = re_model.create_version(
            scenario_id=scenario_id,
            model_id=body.model_id,
            label=body.label,
            assumption_set_id=body.assumption_set_id,
        )
        _log("re.version.created", f"Version created for scenario {scenario_id}")
        return row
    except Exception as exc:
        raise _to_http(exc)


@router.post("/scenario-versions/{version_id}/lock", response_model=ReScenarioVersionOut)
def lock_version(version_id: UUID):
    try:
        row = re_model.lock_version(version_id=version_id)
        _log("re.version.locked", f"Version {version_id} locked")
        return row
    except Exception as exc:
        raise _to_http(exc)


# ── Assumption Sets ───────────────────────────────────────────────────────────

@router.post("/assumption-sets", response_model=ReAssumptionSetOut, status_code=201)
def create_assumption_set(
    body: ReAssumptionSetCreateRequest,
    fund_id: UUID | None = Query(None),
):
    try:
        row = re_scenario.create_assumption_set(fund_id=fund_id, payload=body.model_dump())
        _log("re.assumption_set.created", f"Assumption set '{body.name}' created")
        return row
    except Exception as exc:
        raise _to_http(exc)


@router.post("/assumption-sets/{assumption_set_id}/values")
def set_assumption_value(assumption_set_id: UUID, body: ReAssumptionValueInput):
    try:
        row = re_scenario.set_assumption_value(
            assumption_set_id=assumption_set_id, payload=body.model_dump()
        )
        _log("re.assumption.value_set", f"Value set for assumption set {assumption_set_id}")
        return row
    except Exception as exc:
        raise _to_http(exc)


# ── Provenance ────────────────────────────────────────────────────────────────

@router.get("/funds/{fund_id}/runs", response_model=list[ReRunProvenanceOut])
def list_runs(
    fund_id: UUID,
    quarter: str | None = Query(None),
    run_type: str | None = Query(None),
):
    try:
        return re_provenance.list_runs(fund_id=fund_id, quarter=quarter, run_type=run_type)
    except Exception as exc:
        raise _to_http(exc)


@router.get("/runs/{run_id}", response_model=ReRunProvenanceOut)
def get_run(run_id: str):
    try:
        return re_provenance.get_run(run_id=run_id)
    except Exception as exc:
        raise _to_http(exc)


@router.post("/seed")
def seed_re_v2(body: dict):
    try:
        fund_id = UUID(str(body["fund_id"]))
        now = datetime.now(timezone.utc)
        quarter = f"{now.year}Q{((now.month - 1) // 3) + 1}"

        re_integrity.backfill_missing_investment_assets(fund_id=fund_id)

        with get_cursor() as cur:
            cur.execute(
                """
                SELECT scenario_id
                FROM re_scenario
                WHERE fund_id = %s AND is_base = true
                ORDER BY created_at DESC
                LIMIT 1
                """,
                (str(fund_id),),
            )
            base_row = cur.fetchone()
            if base_row:
                base_scenario_id = str(base_row["scenario_id"])
                cur.execute(
                    "UPDATE re_scenario SET status = 'active' WHERE scenario_id = %s",
                    (base_scenario_id,),
                )
            else:
                cur.execute(
                    """
                    INSERT INTO re_scenario (fund_id, name, scenario_type, is_base, status)
                    VALUES (%s, 'Base', 'base', true, 'active')
                    RETURNING scenario_id
                    """,
                    (str(fund_id),),
                )
                base_scenario_id = str(cur.fetchone()["scenario_id"])

            cur.execute(
                """
                INSERT INTO re_scenario (fund_id, name, scenario_type, is_base, status)
                VALUES (%s, 'Downside', 'downside', false, 'active')
                ON CONFLICT (fund_id, name) DO UPDATE
                SET status = 'active'
                RETURNING scenario_id
                """,
                (str(fund_id),),
            )
            downside_scenario_id = str(cur.fetchone()["scenario_id"])

            cur.execute(
                """
                INSERT INTO re_assumption_override (
                    scenario_id, scope_node_type, scope_node_id, key, value_type, value_int, reason
                )
                VALUES (%s, 'fund', %s, 'exit_cap_rate_delta_bps', 'int', 50, 'Auto-seeded downside stress')
                ON CONFLICT (scenario_id, scope_node_type, scope_node_id, key) DO UPDATE
                SET value_type = EXCLUDED.value_type,
                    value_int = EXCLUDED.value_int,
                    reason = EXCLUDED.reason,
                    is_active = true
                """,
                (downside_scenario_id, str(fund_id)),
            )

            cur.execute(
                """
                SELECT a.asset_id, a.asset_type, a.cost_basis, pa.current_noi, pa.occupancy
                FROM repe_asset a
                JOIN repe_deal d ON d.deal_id = a.deal_id
                LEFT JOIN repe_property_asset pa ON pa.asset_id = a.asset_id
                WHERE d.fund_id = %s
                ORDER BY a.created_at
                """,
                (str(fund_id),),
            )
            assets = cur.fetchall()

            for asset in assets:
                cur.execute(
                    """
                    SELECT current_balance, coupon
                    FROM re_loan_detail
                    WHERE asset_id = %s
                    ORDER BY created_at DESC
                    LIMIT 1
                    """,
                    (str(asset["asset_id"]),),
                )
                loan = cur.fetchone()
                current_noi = Decimal(str(asset.get("current_noi") or 0))
                current_balance = Decimal(str(loan["current_balance"] or 0)) if loan else Decimal("0")
                coupon = Decimal(str(loan["coupon"] or 0)) if loan and loan.get("coupon") is not None else Decimal("0")

                if asset["asset_type"] == "property":
                    revenue = current_noi
                    other_income = (revenue * Decimal("0.05")).quantize(Decimal("0.01"))
                    opex = (revenue * Decimal("0.35")).quantize(Decimal("0.01"))
                    capex = (revenue * Decimal("0.05")).quantize(Decimal("0.01"))
                    debt_service = (
                        (current_balance * coupon / Decimal("4")).quantize(Decimal("0.01"))
                        if current_balance > 0 and coupon > 0
                        else (revenue * Decimal("0.10")).quantize(Decimal("0.01"))
                    )
                    leasing_costs = (revenue * Decimal("0.02")).quantize(Decimal("0.01"))
                    tenant_improvements = (revenue * Decimal("0.03")).quantize(Decimal("0.01"))
                    free_rent = (revenue * Decimal("0.01")).quantize(Decimal("0.01"))
                    cash_balance = (Decimal(str(asset.get("cost_basis") or 0)) * Decimal("0.01")).quantize(Decimal("0.01"))
                else:
                    revenue = (
                        (current_balance * coupon / Decimal("4")).quantize(Decimal("0.01"))
                        if current_balance > 0 and coupon > 0
                        else Decimal("0")
                    )
                    other_income = Decimal("0")
                    opex = Decimal("0")
                    capex = Decimal("0")
                    debt_service = Decimal("0")
                    leasing_costs = Decimal("0")
                    tenant_improvements = Decimal("0")
                    free_rent = Decimal("0")
                    cash_balance = Decimal("0")

                inputs_hash = re_quarter_close._compute_hash(
                    {
                        "asset_id": str(asset["asset_id"]),
                        "quarter": quarter,
                        "source_type": "seed",
                        "revenue": str(revenue),
                        "other_income": str(other_income),
                        "opex": str(opex),
                    }
                )

                cur.execute(
                    """
                    INSERT INTO re_asset_operating_qtr (
                        asset_id, quarter, scenario_id, revenue, other_income, opex, capex,
                        debt_service, leasing_costs, tenant_improvements, free_rent,
                        occupancy, cash_balance, source_type, inputs_hash
                    )
                    VALUES (%s, %s, NULL, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 'seed', %s)
                    ON CONFLICT (asset_id, quarter, COALESCE(scenario_id, '00000000-0000-0000-0000-000000000000'::uuid))
                    DO UPDATE SET
                        revenue = EXCLUDED.revenue,
                        other_income = EXCLUDED.other_income,
                        opex = EXCLUDED.opex,
                        capex = EXCLUDED.capex,
                        debt_service = EXCLUDED.debt_service,
                        leasing_costs = EXCLUDED.leasing_costs,
                        tenant_improvements = EXCLUDED.tenant_improvements,
                        free_rent = EXCLUDED.free_rent,
                        occupancy = EXCLUDED.occupancy,
                        cash_balance = EXCLUDED.cash_balance,
                        source_type = EXCLUDED.source_type,
                        inputs_hash = EXCLUDED.inputs_hash,
                        created_at = now()
                    """,
                    (
                        str(asset["asset_id"]),
                        quarter,
                        str(revenue),
                        str(other_income),
                        str(opex),
                        str(capex),
                        str(debt_service),
                        str(leasing_costs),
                        str(tenant_improvements),
                        str(free_rent),
                        str(asset["occupancy"]) if asset.get("occupancy") is not None else None,
                        str(cash_balance),
                        inputs_hash,
                    ),
                )

            cur.execute(
                """
                SELECT definition_id
                FROM re_waterfall_definition
                WHERE fund_id = %s AND is_active = true
                ORDER BY version DESC
                LIMIT 1
                """,
                (str(fund_id),),
            )
            wf = cur.fetchone()
            if not wf:
                cur.execute(
                    """
                    INSERT INTO re_waterfall_definition (
                        fund_id, name, waterfall_type, version, is_active
                    )
                    VALUES (%s, 'Default', 'european', 1, true)
                    RETURNING definition_id
                    """,
                    (str(fund_id),),
                )
                wf = cur.fetchone()

            cur.execute(
                """
                INSERT INTO re_waterfall_tier (
                    definition_id, tier_order, tier_type, hurdle_rate, split_gp, split_lp, catch_up_percent, notes
                )
                VALUES
                    (%s, 1, 'return_of_capital', NULL, NULL, NULL, NULL, 'Auto-seeded'),
                    (%s, 2, 'preferred_return', 0.08, NULL, NULL, NULL, 'Auto-seeded'),
                    (%s, 3, 'promote', NULL, 0.20, 0.80, NULL, 'Auto-seeded')
                ON CONFLICT (definition_id, tier_order) DO NOTHING
                """,
                (str(wf["definition_id"]), str(wf["definition_id"]), str(wf["definition_id"])),
            )

        result = re_quarter_close.run_quarter_close(
            fund_id=fund_id,
            quarter=quarter,
            scenario_id=None,
            run_waterfall=True,
            triggered_by="seed",
        )
        return {
            "status": "success",
            "fund_id": str(fund_id),
            "quarter": quarter,
            "base_scenario_id": base_scenario_id,
            "downside_scenario_id": downside_scenario_id,
            "run_id": result.get("run_id"),
        }
    except Exception as exc:
        raise _to_http(exc)


@router.get("/health/integrity")
def get_integrity_health(fund_id: UUID | None = Query(None), repair: bool = Query(False)):
    try:
        if repair:
            re_integrity.backfill_missing_investment_assets(fund_id=fund_id)
        return re_integrity.inspect_repe_integrity(fund_id=fund_id)
    except Exception as exc:
        raise _to_http(exc)


@router.get("/funds/{fund_id}/lineage/{quarter}")
def get_fund_lineage(
    fund_id: UUID,
    quarter: str,
    scenario_id: UUID | None = Query(None),
):
    try:
        return re_lineage.fund_lineage(fund_id=fund_id, quarter=quarter, scenario_id=scenario_id)
    except Exception as exc:
        raise _to_http(exc)


@router.get("/investments/{investment_id}/lineage/{quarter}")
def get_investment_lineage(
    investment_id: UUID,
    quarter: str,
    scenario_id: UUID | None = Query(None),
):
    try:
        return re_lineage.investment_lineage(
            investment_id=investment_id,
            quarter=quarter,
            scenario_id=scenario_id,
        )
    except Exception as exc:
        raise _to_http(exc)


@router.get("/jvs/{jv_id}/lineage/{quarter}")
def get_jv_lineage(
    jv_id: UUID,
    quarter: str,
    scenario_id: UUID | None = Query(None),
):
    try:
        return re_lineage.jv_lineage(jv_id=jv_id, quarter=quarter, scenario_id=scenario_id)
    except Exception as exc:
        raise _to_http(exc)


@router.get("/assets/{asset_id}/lineage/{quarter}")
def get_asset_lineage(
    asset_id: UUID,
    quarter: str,
    scenario_id: UUID | None = Query(None),
):
    try:
        return re_lineage.asset_lineage(asset_id=asset_id, quarter=quarter, scenario_id=scenario_id)
    except Exception as exc:
        raise _to_http(exc)


# ═══════════════════════════════════════════════════════════════════════════
# Cross-Fund Model Scenarios
# ═══════════════════════════════════════════════════════════════════════════

@router.get("/models/{model_id}/scenarios", response_model=list[ReModelScenarioOut])
def list_model_scenarios(model_id: UUID):
    try:
        return re_model_scenario.list_scenarios(model_id=model_id)
    except Exception as exc:
        raise _to_http(exc)


@router.post("/models/{model_id}/scenarios", response_model=ReModelScenarioOut, status_code=201)
def create_model_scenario(model_id: UUID, body: ReModelScenarioCreateRequest):
    try:
        row = re_model_scenario.create_scenario(
            model_id=model_id,
            name=body.name,
            description=body.description,
            is_base=body.is_base,
        )
        _log("re.model_scenario.created", f"Scenario '{body.name}' created for model {model_id}")
        return row
    except Exception as exc:
        raise _to_http(exc)


@router.get("/model-scenarios/{scenario_id}", response_model=ReModelScenarioOut)
def get_model_scenario(scenario_id: UUID):
    try:
        return re_model_scenario.get_scenario(scenario_id=scenario_id)
    except Exception as exc:
        raise _to_http(exc)


@router.post("/model-scenarios/{scenario_id}/clone", response_model=ReModelScenarioOut, status_code=201)
def clone_model_scenario(scenario_id: UUID, body: ReScenarioCloneRequest):
    try:
        row = re_model_scenario.clone_scenario(scenario_id=scenario_id, new_name=body.new_name)
        _log("re.model_scenario.cloned", f"Scenario {scenario_id} cloned as '{body.new_name}'")
        return row
    except Exception as exc:
        raise _to_http(exc)


@router.delete("/model-scenarios/{scenario_id}", status_code=204)
def delete_model_scenario(scenario_id: UUID):
    try:
        re_model_scenario.delete_scenario(scenario_id=scenario_id)
    except Exception as exc:
        raise _to_http(exc)


# ── Scenario Asset Scope ─────────────────────────────────────────────────────

@router.get("/model-scenarios/{scenario_id}/assets", response_model=list[ReScenarioAssetOut])
def list_scenario_assets(scenario_id: UUID):
    try:
        return re_model_scenario.list_scenario_assets(scenario_id=scenario_id)
    except Exception as exc:
        raise _to_http(exc)


@router.post("/model-scenarios/{scenario_id}/assets", response_model=ReScenarioAssetOut, status_code=201)
def add_scenario_asset(scenario_id: UUID, body: ReScenarioAssetInput):
    try:
        row = re_model_scenario.add_scenario_asset(
            scenario_id=scenario_id,
            asset_id=body.asset_id,
            source_fund_id=body.source_fund_id,
            source_investment_id=body.source_investment_id,
        )
        _log("re.model_scenario.asset_added", f"Asset {body.asset_id} added to scenario {scenario_id}")
        return row
    except Exception as exc:
        raise _to_http(exc)


@router.delete("/model-scenarios/{scenario_id}/assets/{asset_id}", status_code=204)
def remove_scenario_asset(scenario_id: UUID, asset_id: UUID):
    try:
        re_model_scenario.remove_scenario_asset(scenario_id=scenario_id, asset_id=asset_id)
    except Exception as exc:
        raise _to_http(exc)


@router.get("/model-scenarios/{scenario_id}/available-assets", response_model=list[ReAvailableAssetOut])
def list_available_assets(scenario_id: UUID, env_id: UUID | None = Query(None)):
    try:
        return re_model_scenario.list_available_assets(env_id=env_id, scenario_id=scenario_id)
    except Exception as exc:
        raise _to_http(exc)


# ── Scenario Overrides ───────────────────────────────────────────────────────

@router.get("/model-scenarios/{scenario_id}/overrides", response_model=list[ReScenarioOverrideOut])
def list_scenario_overrides(scenario_id: UUID):
    try:
        return re_model_scenario.list_scenario_overrides(scenario_id=scenario_id)
    except Exception as exc:
        raise _to_http(exc)


@router.post("/model-scenarios/{scenario_id}/overrides", response_model=ReScenarioOverrideOut, status_code=201)
def set_scenario_override(scenario_id: UUID, body: ReScenarioOverrideInput):
    try:
        row = re_model_scenario.set_scenario_override(
            scenario_id=scenario_id,
            scope_type=body.scope_type,
            scope_id=body.scope_id,
            key=body.key,
            value_json=body.value_json,
        )
        _log("re.model_scenario.override_set", f"Override '{body.key}' set for scenario {scenario_id}")
        return row
    except Exception as exc:
        raise _to_http(exc)


@router.delete("/scenario-overrides/{override_id}", status_code=204)
def delete_scenario_override(override_id: UUID):
    try:
        re_model_scenario.delete_scenario_override(override_id=override_id)
    except Exception as exc:
        raise _to_http(exc)


@router.post("/model-scenarios/{scenario_id}/reset-overrides", status_code=204)
def reset_scenario_overrides(scenario_id: UUID):
    try:
        re_model_scenario.reset_scenario_overrides(scenario_id=scenario_id)
    except Exception as exc:
        raise _to_http(exc)


# ── Scenario Run ─────────────────────────────────────────────────────────────

@router.post("/model-scenarios/{scenario_id}/run", response_model=ReScenarioRunOut)
def run_model_scenario(scenario_id: UUID):
    try:
        from app.services import re_scenario_engine
        result = re_scenario_engine.run_scenario(scenario_id=scenario_id)
        _log("re.model_scenario.run", f"Scenario {scenario_id} run completed")
        return result
    except Exception as exc:
        raise _to_http(exc)


@router.get("/model-runs/{run_id}", response_model=ReModelRunDetailOut)
def get_model_run(run_id: UUID):
    try:
        from app.services import re_scenario_engine
        return re_scenario_engine.get_run(run_id=run_id)
    except Exception as exc:
        raise _to_http(exc)


@router.post("/models/{model_id}/compare", response_model=ReScenarioCompareOut)
def compare_model_scenarios(model_id: UUID, body: ReScenarioCompareRequest):
    try:
        from app.services import re_scenario_engine
        return re_scenario_engine.compare_scenarios(scenario_ids=body.scenario_ids)
    except Exception as exc:
        raise _to_http(exc)


# ─── V2 Scenario Engine Endpoints ─────────────────────────────────────────────


@router.post("/model-scenarios/{scenario_id}/run-v2", response_model=ReScenarioRunV2Out)
def run_scenario_v2(scenario_id: UUID):
    """Execute the v2 deterministic 8-step scenario pipeline."""
    try:
        from app.services import re_scenario_engine_v2
        result = re_scenario_engine_v2.run_scenario(scenario_id=scenario_id)
        _log("re.scenario.run_v2", f"Scenario {scenario_id} v2 run completed")
        return result
    except Exception as exc:
        raise _to_http(exc)


@router.get("/model-runs/{run_id}/asset-cashflows", response_model=list[ReAssetCashflowOut])
def get_run_asset_cashflows(run_id: UUID):
    """Get per-asset period-level cashflows for a completed run."""
    try:
        from app.db import get_cursor
        with get_cursor() as cur:
            cur.execute(
                """SELECT * FROM scenario_asset_cashflows
                   WHERE run_id = %s ORDER BY asset_id, period_date""",
                (str(run_id),),
            )
            return cur.fetchall()
    except Exception as exc:
        raise _to_http(exc)


@router.get("/model-runs/{run_id}/fund-cashflows", response_model=list[ReFundCashflowOut])
def get_run_fund_cashflows(run_id: UUID):
    """Get fund-level period cashflows for a completed run."""
    try:
        from app.db import get_cursor
        with get_cursor() as cur:
            cur.execute(
                """SELECT * FROM scenario_fund_cashflows
                   WHERE run_id = %s ORDER BY fund_id, period_date""",
                (str(run_id),),
            )
            return cur.fetchall()
    except Exception as exc:
        raise _to_http(exc)


@router.get("/model-runs/{run_id}/return-metrics", response_model=list[ReReturnMetricsOut])
def get_run_return_metrics(run_id: UUID):
    """Get return metrics (IRR, MOIC, DPI, RVPI, TVPI) for a completed run."""
    try:
        from app.db import get_cursor
        with get_cursor() as cur:
            cur.execute(
                "SELECT * FROM scenario_return_metrics WHERE run_id = %s",
                (str(run_id),),
            )
            return cur.fetchall()
    except Exception as exc:
        raise _to_http(exc)


@router.get("/model-runs/{run_id}/waterfall-results", response_model=list[ReWaterfallResultOut])
def get_run_waterfall_results(run_id: UUID):
    """Get waterfall distribution breakdown for a completed run."""
    try:
        from app.db import get_cursor
        with get_cursor() as cur:
            cur.execute(
                """SELECT * FROM scenario_waterfall_results
                   WHERE run_id = %s ORDER BY fund_id, period_date""",
                (str(run_id),),
            )
            return cur.fetchall()
    except Exception as exc:
        raise _to_http(exc)


@router.post("/model-scenarios/{scenario_id}/preview-asset/{asset_id}", response_model=ReAssetPreviewOut)
def preview_scenario_asset(scenario_id: UUID, asset_id: UUID):
    """Lightweight single-asset preview for live drawer recalculation."""
    try:
        from app.services import re_scenario_engine_v2
        return re_scenario_engine_v2.preview_asset(
            scenario_id=scenario_id, asset_id=asset_id,
        )
    except Exception as exc:
        raise _to_http(exc)


@router.post("/models/{model_id}/compare-v2", response_model=ReScenarioCompareV2Out)
def compare_scenarios_v2(model_id: UUID, body: ReScenarioCompareRequest):
    """Compare scenarios using structured output tables (v2)."""
    try:
        from app.services import re_scenario_engine_v2
        return re_scenario_engine_v2.compare_scenarios(scenario_ids=body.scenario_ids)
    except Exception as exc:
        raise _to_http(exc)


@router.get("/system/financial-health")
def financial_health_check(
    fund_id: UUID | None = Query(None),
    quarter: str | None = Query(None),
):
    """Diagnostic endpoint: detect missing financial data across the REPE pipeline."""
    if not quarter:
        from datetime import datetime as _dt, timezone as _tz
        now = _dt.now(_tz.utc)
        q = (now.month - 1) // 3 + 1
        quarter = f"{now.year}Q{q}"

    diagnostics: dict = {"quarter": quarter, "checks": {}}
    with get_cursor() as cur:
        fund_filter = "AND d.fund_id = %s" if fund_id else ""
        fund_params: list = [str(fund_id)] if fund_id else []

        # Assets missing operating data (no quarter state)
        cur.execute(
            f"""
            SELECT a.asset_id, a.name
            FROM repe_asset a
            JOIN repe_deal d ON d.deal_id = a.deal_id
            LEFT JOIN re_asset_quarter_state qs
                ON qs.asset_id = a.asset_id AND qs.quarter = %s AND qs.scenario_id IS NULL
            WHERE qs.id IS NULL {fund_filter}
            ORDER BY a.name
            """,
            [quarter, *fund_params],
        )
        missing_state = cur.fetchall()
        diagnostics["checks"]["assets_missing_quarter_state"] = {
            "count": len(missing_state),
            "assets": [{"asset_id": str(r["asset_id"]), "name": r["name"]} for r in missing_state[:20]],
        }

        # Assets with quarter state but zero NOI
        cur.execute(
            f"""
            SELECT a.asset_id, a.name, qs.noi
            FROM repe_asset a
            JOIN repe_deal d ON d.deal_id = a.deal_id
            JOIN re_asset_quarter_state qs
                ON qs.asset_id = a.asset_id AND qs.quarter = %s AND qs.scenario_id IS NULL
            WHERE (qs.noi IS NULL OR qs.noi = 0) {fund_filter}
            ORDER BY a.name
            """,
            [quarter, *fund_params],
        )
        missing_noi = cur.fetchall()
        diagnostics["checks"]["assets_missing_noi"] = {
            "count": len(missing_noi),
            "assets": [{"asset_id": str(r["asset_id"]), "name": r["name"]} for r in missing_noi[:20]],
        }

        # Assets missing valuation
        cur.execute(
            f"""
            SELECT a.asset_id, a.name, qs.asset_value
            FROM repe_asset a
            JOIN repe_deal d ON d.deal_id = a.deal_id
            JOIN re_asset_quarter_state qs
                ON qs.asset_id = a.asset_id AND qs.quarter = %s AND qs.scenario_id IS NULL
            WHERE (qs.asset_value IS NULL OR qs.asset_value = 0) {fund_filter}
            ORDER BY a.name
            """,
            [quarter, *fund_params],
        )
        missing_val = cur.fetchall()
        diagnostics["checks"]["assets_missing_valuation"] = {
            "count": len(missing_val),
            "assets": [{"asset_id": str(r["asset_id"]), "name": r["name"]} for r in missing_val[:20]],
        }

        # Assets missing debt data
        cur.execute(
            f"""
            SELECT a.asset_id, a.name, qs.debt_balance
            FROM repe_asset a
            JOIN repe_deal d ON d.deal_id = a.deal_id
            JOIN re_asset_quarter_state qs
                ON qs.asset_id = a.asset_id AND qs.quarter = %s AND qs.scenario_id IS NULL
            WHERE (qs.debt_balance IS NULL OR qs.debt_balance = 0) {fund_filter}
            ORDER BY a.name
            """,
            [quarter, *fund_params],
        )
        missing_debt = cur.fetchall()
        diagnostics["checks"]["assets_missing_debt"] = {
            "count": len(missing_debt),
            "assets": [{"asset_id": str(r["asset_id"]), "name": r["name"]} for r in missing_debt[:20]],
        }

        # Investments missing quarter state
        cur.execute(
            f"""
            SELECT d.deal_id AS investment_id, d.name
            FROM repe_deal d
            LEFT JOIN re_investment_quarter_state iqs
                ON iqs.investment_id = d.deal_id AND iqs.quarter = %s AND iqs.scenario_id IS NULL
            WHERE iqs.id IS NULL {fund_filter}
            ORDER BY d.name
            """,
            [quarter, *fund_params],
        )
        missing_inv = cur.fetchall()
        diagnostics["checks"]["investments_missing_quarter_state"] = {
            "count": len(missing_inv),
            "investments": [{"investment_id": str(r["investment_id"]), "name": r["name"]} for r in missing_inv[:20]],
        }

        # Funds missing quarter state
        fund_where = "WHERE f.fund_id = %s" if fund_id else ""
        cur.execute(
            f"""
            SELECT f.fund_id, f.name
            FROM repe_fund f
            LEFT JOIN re_fund_quarter_state fqs
                ON fqs.fund_id = f.fund_id AND fqs.quarter = %s AND fqs.scenario_id IS NULL
            {fund_where}
            AND fqs.id IS NULL
            ORDER BY f.name
            """,
            [quarter, *fund_params],
        )
        missing_fund = cur.fetchall()
        diagnostics["checks"]["funds_missing_quarter_state"] = {
            "count": len(missing_fund),
            "funds": [{"fund_id": str(r["fund_id"]), "name": r["name"]} for r in missing_fund[:20]],
        }

        # Scenarios check
        if fund_id:
            cur.execute(
                "SELECT COUNT(*) AS cnt FROM re_scenario WHERE fund_id = %s AND status = 'active'",
                [str(fund_id)],
            )
            sc = cur.fetchone()
            diagnostics["checks"]["active_scenarios"] = sc["cnt"] if sc else 0

    # Overall health
    total_issues = sum(
        v["count"] for v in diagnostics["checks"].values() if isinstance(v, dict) and "count" in v
    )
    diagnostics["status"] = "healthy" if total_issues == 0 else "degraded"
    diagnostics["total_issues"] = total_issues
    return diagnostics
