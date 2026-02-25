from __future__ import annotations

from uuid import UUID

import psycopg
from fastapi import APIRouter, HTTPException, Query

from app.observability.logger import emit_log
from app.schemas.re_institutional import (
    ReAssumptionOverrideInput,
    ReAssumptionOverrideOut,
    ReAssumptionSetCreateRequest,
    ReAssumptionSetOut,
    ReAssumptionValueInput,
    ReCapitalLedgerEntryCreateRequest,
    ReCapitalLedgerEntryOut,
    ReCashflowEntryCreateRequest,
    ReCashflowEntryOut,
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
    ReLoanDetailCreateRequest,
    ReLoanDetailOut,
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
    ReWaterfallDefinitionCreateRequest,
    ReWaterfallDefinitionOut,
    ReWaterfallRunOut,
    ReWaterfallRunRequest,
)
from app.services import (
    re_investment,
    re_jv,
    re_partner,
    re_capital_ledger,
    re_cashflow_ledger,
    re_scenario,
    re_provenance,
    re_quarter_close,
    re_waterfall_runtime,
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
def list_jv_assets(jv_id: UUID):
    try:
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
