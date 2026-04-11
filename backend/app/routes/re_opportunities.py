"""
REPE Opportunity Layer — REST endpoints.

Prefix: /api/re/v2/opportunities
Tags:   re-opportunities

Stage model: signal → hypothesis → underwriting → modeled → ic_ready
             → approved → live → archived

Rollup isolation: opportunities in stages signal..approved are EXCLUDED from
all official fund rollups. Only stage='live' enters official reporting.
"""
from __future__ import annotations

from datetime import date
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from app.observability.logger import emit_log
from app.services import re_signals as svc_signals
from app.services import re_opportunities as svc_opp
from app.services import re_opportunity_model as svc_model

router = APIRouter(prefix="/api/re/v2/opportunities", tags=["re-opportunities"])


def _to_http(exc: Exception) -> HTTPException:
    if isinstance(exc, LookupError):
        return HTTPException(status_code=404, detail=str(exc))
    if isinstance(exc, ValueError):
        return HTTPException(status_code=400, detail=str(exc))
    return HTTPException(status_code=500, detail=str(exc))


def _log(action: str, msg: str, **ctx):
    emit_log(level="info", service="backend", action=f"re.opp.{action}", message=msg, context=ctx)


# ── Pydantic request/response models ─────────────────────────────────────────

class ReSignalCreateRequest(BaseModel):
    source_id: UUID | None = None
    signal_type: str = "custom"
    market: str | None = None
    submarket: str | None = None
    property_type: str | None = None
    signal_date: date | None = None
    raw_value: float | None = None
    direction: str = "neutral"
    signal_headline: str
    signal_body: str | None = None
    ai_generated: bool = False
    ai_model_version: str | None = None
    metadata_json: dict = {}
    strength: float | None = None


class ReSignalPatchRequest(BaseModel):
    signal_type: str | None = None
    market: str | None = None
    signal_date: date | None = None
    raw_value: float | None = None
    direction: str | None = None
    signal_headline: str | None = None
    signal_body: str | None = None
    strength: float | None = None


class ReBulkSignalRequest(BaseModel):
    signals: list[dict]


class ReOpportunityCreateRequest(BaseModel):
    name: str
    thesis: str | None = None
    fund_id: UUID | None = None
    property_type: str | None = None
    market: str | None = None
    submarket: str | None = None
    lat: float | None = None
    lon: float | None = None
    strategy: str | None = None
    stage: str = "signal"
    priority: str = "medium"
    target_equity_check: float | None = None
    target_ltv: float | None = None
    score_return_estimated: float | None = None
    score_source: str = "estimated"
    score_fund_fit: float | None = None
    score_signal: float | None = None
    score_execution: float | None = None
    score_risk_penalty: float | None = None
    ai_generated: bool = False
    ai_model_version: str | None = None
    created_by: str | None = None


class ReOpportunityPatchRequest(BaseModel):
    name: str | None = None
    thesis: str | None = None
    fund_id: UUID | None = None
    property_type: str | None = None
    market: str | None = None
    submarket: str | None = None
    strategy: str | None = None
    priority: str | None = None
    target_equity_check: float | None = None
    target_ltv: float | None = None
    score_return_estimated: float | None = None
    score_execution: float | None = None
    score_risk_penalty: float | None = None


class ReAdvanceStageRequest(BaseModel):
    stage: str


class ReClusterRequest(BaseModel):
    env_id: str
    signal_ids: list[str]
    name: str
    thesis: str | None = None


class ReSignalLinkRequest(BaseModel):
    signal_id: UUID
    weight: float = 1.0
    attribution_note: str | None = None


class ReAssumptionVersionCreateRequest(BaseModel):
    label: str | None = None
    purchase_price: float | None = None
    equity_check: float | None = None
    loan_amount: float | None = None
    ltv: float | None = None
    interest_rate_pct: float | None = None
    io_period_months: int | None = None
    amort_years: int | None = None
    loan_term_years: int | None = None
    base_noi: float | None = None
    rent_growth_pct: float | None = None
    vacancy_pct: float | None = None
    expense_growth_pct: float | None = None
    mgmt_fee_pct: float | None = None
    exit_cap_rate_pct: float | None = None
    exit_year: int = 5
    disposition_cost_pct: float = 0.02
    discount_rate_pct: float | None = None
    hold_years: int = 5
    capex_reserve_pct: float | None = None
    fee_load_pct: float = 0.015
    operating_json: dict = {}
    lease_json: dict = {}
    capex_json: dict = {}
    debt_json: dict = {}
    exit_json: dict = {}
    notes: str | None = None
    created_by: str | None = None


class ReModelRunTriggerRequest(BaseModel):
    assumption_version_id: UUID
    triggered_by: str = "api"


class ReFundImpactComputeRequest(BaseModel):
    fund_id: UUID
    model_run_id: UUID


class ReApproveRequest(BaseModel):
    ic_memo_text: str | None = None
    approved_by: str | None = None


class ReConvertRequest(BaseModel):
    fund_id: UUID
    promoted_by: str | None = None


# ── Signal Sources ────────────────────────────────────────────────────────────

@router.get("/signal-sources")
def list_signal_sources():
    try:
        return svc_signals.list_signal_sources()
    except Exception as exc:
        raise _to_http(exc) from exc


# ── Signals ───────────────────────────────────────────────────────────────────

@router.get("/signals")
def list_signals(
    env_id: str = Query(...),
    signal_type: str | None = Query(None),
    market: str | None = Query(None),
    direction: str | None = Query(None),
    min_strength: float | None = Query(None),
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
):
    try:
        return svc_signals.list_signals(
            env_id=env_id,
            signal_type=signal_type,
            market=market,
            direction=direction,
            min_strength=min_strength,
            date_from=date_from,
            date_to=date_to,
        )
    except Exception as exc:
        raise _to_http(exc) from exc


@router.post("/signals", status_code=201)
def create_signal(env_id: str = Query(...), body: ReSignalCreateRequest = ...):
    try:
        return svc_signals.create_signal(env_id, body.model_dump(exclude_none=True))
    except Exception as exc:
        raise _to_http(exc) from exc


@router.post("/signals/bulk")
def bulk_insert_signals(env_id: str = Query(...), body: ReBulkSignalRequest = ...):
    try:
        return svc_signals.bulk_insert_signals(env_id, body.signals)
    except Exception as exc:
        raise _to_http(exc) from exc


@router.get("/signals/{signal_id}")
def get_signal(signal_id: UUID):
    try:
        return svc_signals.get_signal(signal_id)
    except Exception as exc:
        raise _to_http(exc) from exc


@router.patch("/signals/{signal_id}")
def patch_signal(signal_id: UUID, body: ReSignalPatchRequest):
    try:
        return svc_signals.update_signal(signal_id, body.model_dump(exclude_none=True))
    except Exception as exc:
        raise _to_http(exc) from exc


@router.delete("/signals/{signal_id}", status_code=204)
def delete_signal(signal_id: UUID):
    try:
        svc_signals.delete_signal(signal_id)
    except Exception as exc:
        raise _to_http(exc) from exc


# ── Opportunities ─────────────────────────────────────────────────────────────

@router.get("/")
def list_opportunities(
    env_id: str = Query(...),
    stage: str | None = Query(None),
    fund_id: UUID | None = Query(None),
    strategy: str | None = Query(None),
    min_score: float | None = Query(None),
    market: str | None = Query(None),
):
    try:
        return svc_opp.list_opportunities(
            env_id=env_id,
            stage=stage,
            fund_id=fund_id,
            strategy=strategy,
            min_score=min_score,
            market=market,
        )
    except Exception as exc:
        raise _to_http(exc) from exc


@router.post("/", status_code=201)
def create_opportunity(env_id: str = Query(...), body: ReOpportunityCreateRequest = ...):
    try:
        return svc_opp.create_opportunity(env_id, body.model_dump(exclude_none=True))
    except Exception as exc:
        raise _to_http(exc) from exc


@router.get("/cluster")
def cluster_endpoint():
    raise HTTPException(status_code=405, detail="Use POST /cluster")


@router.post("/cluster", status_code=201)
def cluster_signals(body: ReClusterRequest):
    try:
        return svc_opp.cluster_signals_into_opportunity(
            env_id=body.env_id,
            signal_ids=body.signal_ids,
            name=body.name,
            thesis=body.thesis,
        )
    except Exception as exc:
        raise _to_http(exc) from exc


@router.get("/{opportunity_id}")
def get_opportunity(opportunity_id: UUID):
    try:
        return svc_opp.get_opportunity(opportunity_id)
    except Exception as exc:
        raise _to_http(exc) from exc


@router.patch("/{opportunity_id}")
def patch_opportunity(opportunity_id: UUID, body: ReOpportunityPatchRequest):
    try:
        return svc_opp.update_opportunity(opportunity_id, body.model_dump(exclude_none=True))
    except Exception as exc:
        raise _to_http(exc) from exc


@router.delete("/{opportunity_id}", status_code=204)
def delete_opportunity(opportunity_id: UUID):
    try:
        svc_opp.delete_opportunity(opportunity_id)
    except Exception as exc:
        raise _to_http(exc) from exc


@router.post("/{opportunity_id}/advance-stage")
def advance_stage(opportunity_id: UUID, body: ReAdvanceStageRequest):
    try:
        return svc_opp.advance_stage(opportunity_id, body.stage)
    except Exception as exc:
        raise _to_http(exc) from exc


@router.get("/{opportunity_id}/score-breakdown")
def get_score_breakdown(opportunity_id: UUID):
    try:
        return svc_opp.get_score_breakdown(opportunity_id)
    except Exception as exc:
        raise _to_http(exc) from exc


# ── Signal Links ──────────────────────────────────────────────────────────────

@router.post("/{opportunity_id}/signals", status_code=201)
def link_signal(opportunity_id: UUID, body: ReSignalLinkRequest):
    try:
        return svc_opp.link_signal(
            opportunity_id,
            body.signal_id,
            weight=body.weight,
            attribution_note=body.attribution_note,
        )
    except Exception as exc:
        raise _to_http(exc) from exc


@router.delete("/{opportunity_id}/signals/{signal_id}", status_code=204)
def unlink_signal(opportunity_id: UUID, signal_id: UUID):
    try:
        svc_opp.unlink_signal(opportunity_id, signal_id)
    except Exception as exc:
        raise _to_http(exc) from exc


@router.get("/{opportunity_id}/signals")
def list_signal_links(opportunity_id: UUID):
    try:
        return svc_opp.get_signal_links(opportunity_id)
    except Exception as exc:
        raise _to_http(exc) from exc


# ── Assumption Versions ───────────────────────────────────────────────────────

@router.get("/{opportunity_id}/assumptions")
def list_assumption_versions(opportunity_id: UUID):
    try:
        return svc_model.list_assumption_versions(opportunity_id)
    except Exception as exc:
        raise _to_http(exc) from exc


@router.post("/{opportunity_id}/assumptions", status_code=201)
def create_assumption_version(
    opportunity_id: UUID,
    env_id: str = Query(...),
    body: ReAssumptionVersionCreateRequest = ...,
):
    try:
        return svc_model.create_assumption_version(
            opportunity_id, env_id, body.model_dump()
        )
    except Exception as exc:
        raise _to_http(exc) from exc


@router.get("/{opportunity_id}/assumptions/{assumption_version_id}")
def get_assumption_version(opportunity_id: UUID, assumption_version_id: UUID):
    try:
        return svc_model.get_assumption_version(assumption_version_id)
    except Exception as exc:
        raise _to_http(exc) from exc


@router.patch("/{opportunity_id}/assumptions/{assumption_version_id}")
def patch_assumption_version(
    opportunity_id: UUID,
    assumption_version_id: UUID,
    body: dict,
):
    try:
        return svc_model.update_assumption_version(assumption_version_id, body)
    except Exception as exc:
        raise _to_http(exc) from exc


# ── Model Runs ────────────────────────────────────────────────────────────────

@router.get("/{opportunity_id}/model-runs")
def list_model_runs(opportunity_id: UUID):
    try:
        return svc_model.list_model_runs(opportunity_id)
    except Exception as exc:
        raise _to_http(exc) from exc


@router.post("/{opportunity_id}/model-runs", status_code=201)
def trigger_model_run(opportunity_id: UUID, body: ReModelRunTriggerRequest):
    try:
        _log("trigger_model_run", "Triggering model run", opportunity_id=str(opportunity_id))
        return svc_model.trigger_model_run(
            opportunity_id,
            body.assumption_version_id,
            triggered_by=body.triggered_by,
        )
    except Exception as exc:
        raise _to_http(exc) from exc


@router.get("/{opportunity_id}/model-runs/{model_run_id}")
def get_model_run(opportunity_id: UUID, model_run_id: UUID):
    try:
        return svc_model.get_model_run(model_run_id)
    except Exception as exc:
        raise _to_http(exc) from exc


# ── Fund Impact ───────────────────────────────────────────────────────────────

@router.get("/{opportunity_id}/fund-impact")
def get_fund_impact(opportunity_id: UUID):
    try:
        return svc_model.get_fund_impact(opportunity_id)
    except Exception as exc:
        raise _to_http(exc) from exc


@router.post("/{opportunity_id}/fund-impact/compute")
def compute_fund_impact(opportunity_id: UUID, body: ReFundImpactComputeRequest):
    try:
        return svc_model.compute_fund_impact(
            opportunity_id, body.fund_id, body.model_run_id
        )
    except Exception as exc:
        raise _to_http(exc) from exc


# ── Approval + Conversion ─────────────────────────────────────────────────────

@router.post("/{opportunity_id}/approve")
def approve_opportunity(opportunity_id: UUID, body: ReApproveRequest):
    """
    IC approval action.  Stage → 'approved'.
    Does NOT create a real investment — use /convert-to-investment for that.
    """
    try:
        _log("approve", "Approving opportunity", opportunity_id=str(opportunity_id))
        return svc_model.approve_opportunity(
            opportunity_id,
            ic_memo_text=body.ic_memo_text,
            approved_by=body.approved_by,
        )
    except Exception as exc:
        raise _to_http(exc) from exc


@router.post("/{opportunity_id}/convert-to-investment")
def convert_to_investment(opportunity_id: UUID, body: ReConvertRequest):
    """
    Convert an approved opportunity to a real investment.
    Stage → 'live'.  Creates repe_deal + repe_asset + quarter-state rows.
    """
    try:
        _log(
            "convert",
            "Converting opportunity to investment",
            opportunity_id=str(opportunity_id),
            fund_id=str(body.fund_id),
        )
        return svc_model.convert_to_investment(
            opportunity_id,
            fund_id=body.fund_id,
            promoted_by=body.promoted_by,
        )
    except Exception as exc:
        raise _to_http(exc) from exc


@router.get("/{opportunity_id}/promotion")
def get_promotion(opportunity_id: UUID):
    try:
        result = svc_model.get_promotion(opportunity_id)
        if result is None:
            raise HTTPException(status_code=404, detail="No promotion record found")
        return result
    except HTTPException:
        raise
    except Exception as exc:
        raise _to_http(exc) from exc


# ── Receipts ──────────────────────────────────────────────────────────────────

@router.get("/{opportunity_id}/receipts")
def get_receipts(opportunity_id: UUID):
    """Return a complete JSON proof pack (assumption version + model + provenance)."""
    try:
        return svc_model.get_receipts(opportunity_id)
    except Exception as exc:
        raise _to_http(exc) from exc
