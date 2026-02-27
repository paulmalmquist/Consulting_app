"""Financial Intelligence API routes.

NOI variance, return metrics, debt surveillance, accounting ingestion,
budget management, and run engine endpoints.
"""
from __future__ import annotations

from uuid import UUID

import psycopg
from fastapi import APIRouter, HTTPException, Query

from app.observability.logger import emit_log
from fastapi.responses import StreamingResponse

from app.schemas.re_financial_intelligence import (
    AccountingImportRequest,
    AccountingImportResult,
    AmortizationScheduleRow,
    CapitalAccountSnapshotOut,
    CapitalSnapshotComputeRequest,
    CovenantDefinitionOut,
    LoanOut,
    LpSummaryResult,
    NoiBudgetMonthlyRequest,
    PropertyCompLoadRequest,
    PropertyCompOut,
    RunCovenantTestRequest,
    RunCovenantTestResult,
    RunOut,
    RunQuarterCloseRequest,
    RunQuarterCloseResult,
    RunWaterfallShadowRequest,
    SaleAssumptionCreate,
    SaleAssumptionOut,
    ScenarioComputeRequest,
    ScenarioComputeResult,
    UwVersionCreateRequest,
    UwVersionOut,
    WatchlistEventOut,
    WaterfallBreakdownResult,
)
from app.services import (
    re_accounting,
    re_amortization,
    re_budget,
    re_capital_snapshot,
    re_debt_surveillance,
    re_excel_export,
    re_fi_seed,
    re_fi_seed_v2,
    re_fund_metrics,
    re_property_comps,
    re_run_engine,
    re_sale_scenario,
    re_variance,
)

router = APIRouter(prefix="/api/re/v2", tags=["re-v2-financial-intelligence"])


def _to_http(exc: Exception) -> HTTPException:
    if isinstance(exc, psycopg.errors.UndefinedTable):
        return HTTPException(
            503,
            {"error_code": "SCHEMA_NOT_MIGRATED", "message": "Financial intelligence schema not migrated.", "detail": "Run migration 278."},
        )
    if isinstance(exc, LookupError):
        return HTTPException(404, {"error_code": "NOT_FOUND", "message": str(exc)})
    if isinstance(exc, ValueError):
        return HTTPException(400, {"error_code": "VALIDATION_ERROR", "message": str(exc)})
    return HTTPException(500, {"error_code": "INTERNAL_ERROR", "message": str(exc)})


def _log(action: str, msg: str, **ctx):
    emit_log(level="info", service="backend", action=action, message=msg, context=ctx)


# ── Accounting Ingestion ─────────────────────────────────────────────────────

@router.post("/accounting/import", response_model=AccountingImportResult)
def import_accounting(body: AccountingImportRequest):
    try:
        result = re_accounting.import_accounting(
            env_id=body.env_id,
            business_id=body.business_id,
            source_name=body.source_name,
            payload=[item.model_dump() for item in body.payload],
        )
        _log("re.accounting.imported", f"Accounting imported: {result['rows_loaded']} rows")
        return result
    except Exception as exc:
        raise _to_http(exc)


# ── Budget / Underwriting ────────────────────────────────────────────────────

@router.post("/budget/uw_version", response_model=UwVersionOut, status_code=201)
def create_uw_version(body: UwVersionCreateRequest):
    try:
        return re_budget.create_uw_version(
            env_id=body.env_id,
            business_id=body.business_id,
            name=body.name,
            scenario_id=body.scenario_id,
            effective_from=body.effective_from,
        )
    except Exception as exc:
        raise _to_http(exc)


@router.post("/budget/noi_monthly")
def create_noi_budget_monthly(body: NoiBudgetMonthlyRequest):
    try:
        return re_budget.create_noi_budget_monthly(
            env_id=body.env_id,
            business_id=body.business_id,
            items=[item.model_dump() for item in body.items],
        )
    except Exception as exc:
        raise _to_http(exc)


@router.get("/budget/noi_monthly")
def get_noi_budget_monthly(
    env_id: str = Query(...),
    business_id: UUID = Query(...),
    asset_id: UUID | None = Query(None),
    uw_version_id: UUID | None = Query(None),
):
    try:
        return re_budget.get_noi_budget_monthly(
            env_id=env_id,
            business_id=business_id,
            asset_id=asset_id,
            uw_version_id=uw_version_id,
        )
    except Exception as exc:
        raise _to_http(exc)


# ── Variance ─────────────────────────────────────────────────────────────────

@router.get("/variance/noi")
def get_noi_variance(
    env_id: str = Query(...),
    business_id: UUID = Query(...),
    fund_id: UUID = Query(...),
    quarter: str = Query(...),
):
    try:
        return re_variance.get_variance(
            env_id=env_id,
            business_id=business_id,
            fund_id=fund_id,
            quarter=quarter,
        )
    except Exception as exc:
        raise _to_http(exc)


# ── Fund Metrics ─────────────────────────────────────────────────────────────

@router.get("/funds/{fund_id}/metrics-detail")
def get_fund_metrics_detail(
    fund_id: UUID,
    env_id: str = Query(...),
    business_id: UUID = Query(...),
    quarter: str = Query(...),
):
    try:
        result = re_fund_metrics.get_fund_metrics(
            env_id=env_id,
            business_id=business_id,
            fund_id=fund_id,
            quarter=quarter,
        )
        if not result:
            raise LookupError(f"No metrics for fund {fund_id} quarter {quarter}")
        return result
    except Exception as exc:
        raise _to_http(exc)


# ── Run Center ───────────────────────────────────────────────────────────────

@router.post("/runs/quarter_close", response_model=RunQuarterCloseResult)
def run_quarter_close(body: RunQuarterCloseRequest):
    try:
        result = re_run_engine.run_quarter_close(
            env_id=body.env_id,
            business_id=body.business_id,
            fund_id=body.fund_id,
            quarter=body.quarter,
            scenario_id=body.scenario_id,
            uw_version_id=body.uw_version_id,
            accounting_source_hash=body.accounting_source_hash,
            created_by="api",
        )
        return result
    except Exception as exc:
        raise _to_http(exc)


@router.post("/runs/waterfall_shadow")
def run_waterfall_shadow(body: RunWaterfallShadowRequest):
    try:
        return re_run_engine.run_waterfall_shadow(
            env_id=body.env_id,
            business_id=body.business_id,
            fund_id=body.fund_id,
            quarter=body.quarter,
            created_by="api",
        )
    except Exception as exc:
        raise _to_http(exc)


@router.post("/runs/covenant_tests", response_model=RunCovenantTestResult)
def run_covenant_tests(body: RunCovenantTestRequest):
    try:
        return re_run_engine.run_covenant_tests(
            env_id=body.env_id,
            business_id=body.business_id,
            fund_id=body.fund_id,
            quarter=body.quarter,
            created_by="api",
        )
    except Exception as exc:
        raise _to_http(exc)


@router.get("/fi/runs", response_model=list[RunOut])
def list_fi_runs(
    env_id: str = Query(...),
    business_id: UUID = Query(...),
    fund_id: UUID = Query(...),
    quarter: str | None = Query(None),
):
    try:
        return re_run_engine.list_runs(
            env_id=env_id,
            business_id=business_id,
            fund_id=fund_id,
            quarter=quarter,
        )
    except Exception as exc:
        raise _to_http(exc)


# ── Debt Surveillance ────────────────────────────────────────────────────────

@router.get("/funds/{fund_id}/loans", response_model=list[LoanOut])
def list_fund_loans(
    fund_id: UUID,
    env_id: str = Query(...),
    business_id: UUID = Query(...),
):
    try:
        return re_debt_surveillance.list_loans(
            env_id=env_id,
            business_id=business_id,
            fund_id=fund_id,
        )
    except Exception as exc:
        raise _to_http(exc)


@router.get("/loans/{loan_id}/covenants", response_model=list[CovenantDefinitionOut])
def get_loan_covenants(loan_id: UUID):
    try:
        return re_debt_surveillance.list_covenants(loan_id=loan_id)
    except Exception as exc:
        raise _to_http(exc)


@router.get("/loans/{loan_id}/covenant_results")
def get_covenant_results(
    loan_id: UUID,
    quarter: str | None = Query(None),
):
    try:
        return re_debt_surveillance.get_covenant_results(
            loan_id=loan_id,
            quarter=quarter,
        )
    except Exception as exc:
        raise _to_http(exc)


@router.get("/funds/{fund_id}/watchlist", response_model=list[WatchlistEventOut])
def get_watchlist(
    fund_id: UUID,
    env_id: str = Query(...),
    business_id: UUID = Query(...),
    quarter: str | None = Query(None),
):
    try:
        return re_debt_surveillance.get_watchlist(
            env_id=env_id,
            business_id=business_id,
            fund_id=fund_id,
            quarter=quarter,
        )
    except Exception as exc:
        raise _to_http(exc)


# ── Seed ─────────────────────────────────────────────────────────────────────

@router.post("/fi/seed")
def seed_fi_data(
    env_id: str = Query(...),
    business_id: UUID = Query(...),
    fund_id: UUID = Query(...),
    debt_fund_id: UUID | None = Query(None),
):
    """Seed financial intelligence test data (accounting, budgets, fees, loans)."""
    try:
        # Get asset IDs for this fund
        from app.db import get_cursor as _gc
        with _gc() as cur:
            cur.execute(
                """
                SELECT a.asset_id FROM repe_asset a
                JOIN repe_deal d ON d.deal_id = a.deal_id
                WHERE d.fund_id = %s
                """,
                (str(fund_id),),
            )
            asset_ids = [UUID(str(r["asset_id"])) for r in cur.fetchall()]

        result = re_fi_seed.seed_fi_data(
            env_id=env_id,
            business_id=business_id,
            fund_id=fund_id,
            asset_ids=asset_ids,
            debt_fund_id=debt_fund_id,
        )
        return result
    except Exception as exc:
        raise _to_http(exc)


@router.post("/fi/seed-institutional")
def seed_institutional_fund(
    env_id: str = Query(...),
    business_id: UUID = Query(...),
    fund_id: UUID = Query(...),
):
    """Seed Institutional Growth Fund VII with 12 investments, 4 partners, waterfall."""
    try:
        result = re_fi_seed.seed_institutional_fund(
            env_id=env_id,
            business_id=business_id,
            fund_id=fund_id,
        )
        return result
    except Exception as exc:
        raise _to_http(exc)


@router.post("/fi/seed-institutional-v2-patch")
def seed_institutional_v2_patch(
    env_id: str = Query(...),
    business_id: UUID = Query(...),
    fund_id: UUID = Query(...),
):
    """V2 seed patch: fills gaps with per-asset debt, accounting, valuations, property metadata."""
    try:
        result = re_fi_seed_v2.seed_institutional_v2_patch(
            env_id=env_id,
            business_id=business_id,
            fund_id=fund_id,
        )
        return result
    except Exception as exc:
        raise _to_http(exc)


@router.get("/fi/validate-institutional-seed")
def validate_institutional_seed(
    env_id: str = Query(...),
    business_id: UUID = Query(...),
    fund_id: UUID = Query(...),
):
    """Validate that the institutional seed meets all structural requirements."""
    try:
        return re_fi_seed_v2.validate_institutional_seed(
            env_id=env_id,
            business_id=business_id,
            fund_id=fund_id,
        )
    except Exception as exc:
        raise _to_http(exc)


# ── Budget UW Versions List ──────────────────────────────────────────────────

@router.get("/budget/uw_versions")
def list_uw_versions(
    env_id: str = Query(...),
    business_id: UUID = Query(...),
):
    try:
        return re_budget.list_uw_versions(env_id=env_id, business_id=business_id)
    except Exception as exc:
        raise _to_http(exc)


# ── Sale Scenarios ──────────────────────────────────────────────────────────

@router.post("/funds/{fund_id}/sale-scenarios", response_model=SaleAssumptionOut, status_code=201)
def create_sale_assumption(fund_id: UUID, body: SaleAssumptionCreate):
    """Create or update a hypothetical sale assumption for scenario modeling."""
    try:
        return re_sale_scenario.create_sale_assumption(
            fund_id=fund_id,
            scenario_id=body.scenario_id,
            deal_id=body.deal_id,
            asset_id=body.asset_id,
            sale_price=body.sale_price,
            sale_date=body.sale_date,
            buyer_costs=body.buyer_costs,
            disposition_fee_pct=body.disposition_fee_pct,
            memo=body.memo,
            created_by="api",
        )
    except Exception as exc:
        raise _to_http(exc)


@router.get("/funds/{fund_id}/sale-scenarios", response_model=list[SaleAssumptionOut])
def list_sale_assumptions(
    fund_id: UUID,
    scenario_id: UUID = Query(...),
):
    """List all sale assumptions for a fund+scenario."""
    try:
        return re_sale_scenario.list_sale_assumptions(
            fund_id=fund_id,
            scenario_id=scenario_id,
        )
    except Exception as exc:
        raise _to_http(exc)


@router.delete("/sale-scenarios/{assumption_id}", status_code=204)
def delete_sale_assumption(assumption_id: int):
    """Delete a sale assumption."""
    try:
        re_sale_scenario.delete_sale_assumption(assumption_id=assumption_id)
    except Exception as exc:
        raise _to_http(exc)


@router.post("/funds/{fund_id}/scenario-compute", response_model=ScenarioComputeResult)
def compute_scenario_metrics(fund_id: UUID, body: ScenarioComputeRequest):
    """Compute scenario-specific metrics with sale assumptions applied."""
    try:
        return re_sale_scenario.compute_scenario_metrics(
            env_id=body.env_id,
            business_id=body.business_id,
            fund_id=fund_id,
            scenario_id=body.scenario_id,
            quarter=body.quarter,
        )
    except Exception as exc:
        raise _to_http(exc)


# ── LP Summary ──────────────────────────────────────────────────────────────

@router.get("/funds/{fund_id}/lp_summary", response_model=LpSummaryResult)
def get_lp_summary(
    fund_id: UUID,
    env_id: str = Query(...),
    business_id: UUID = Query(...),
    quarter: str = Query(...),
):
    """Get consolidated LP summary with capital accounts, metrics, and waterfall allocations."""
    try:
        return re_sale_scenario.get_lp_summary(
            env_id=env_id,
            business_id=business_id,
            fund_id=fund_id,
            quarter=quarter,
        )
    except Exception as exc:
        raise _to_http(exc)


# ── Amortization ────────────────────────────────────────────────────────────

@router.get("/loans/{loan_id}/amortization", response_model=list[AmortizationScheduleRow])
def get_amortization_schedule(loan_id: UUID):
    """Return stored amortization schedule for a loan."""
    try:
        return re_amortization.get_schedule(loan_id=loan_id)
    except Exception as exc:
        raise _to_http(exc)


@router.post("/loans/{loan_id}/amortization/generate", response_model=list[AmortizationScheduleRow])
def generate_amortization_schedule(loan_id: UUID):
    """Generate and store amortization schedule for a loan."""
    try:
        result = re_amortization.generate_and_store_schedule(loan_id=loan_id)
        _log("re.amortization.generated", f"Schedule generated: {len(result)} periods", loan_id=str(loan_id))
        return result
    except Exception as exc:
        raise _to_http(exc)


# ── Waterfall Breakdown ─────────────────────────────────────────────────────

@router.get("/funds/{fund_id}/waterfall-breakdown", response_model=WaterfallBreakdownResult)
def get_waterfall_breakdown(
    fund_id: UUID,
    quarter: str = Query(...),
):
    """Get tier-by-tier waterfall allocation per partner."""
    try:
        from app.db import get_cursor as _gc
        with _gc() as cur:
            cur.execute(
                """
                SELECT id FROM re_waterfall_run
                WHERE fund_id = %s AND quarter = %s
                ORDER BY created_at DESC LIMIT 1
                """,
                (str(fund_id), quarter),
            )
            run = cur.fetchone()
            if not run:
                return {
                    "fund_id": str(fund_id),
                    "quarter": quarter,
                    "run_id": None,
                    "allocations": [],
                }

            cur.execute(
                """
                SELECT wrr.tier_name, wrr.amount, p.partner_name, p.partner_type
                FROM re_waterfall_run_result wrr
                JOIN re_partner p ON p.id = wrr.partner_id
                WHERE wrr.run_id = %s
                ORDER BY wrr.tier_name, p.partner_type, p.partner_name
                """,
                (str(run["id"]),),
            )
            rows = cur.fetchall()

        return {
            "fund_id": str(fund_id),
            "quarter": quarter,
            "run_id": str(run["id"]),
            "allocations": rows,
        }
    except Exception as exc:
        raise _to_http(exc)


# ── Property Comps ──────────────────────────────────────────────────────────

@router.get("/assets/{asset_id}/comps", response_model=list[PropertyCompOut])
def list_asset_comps(
    asset_id: UUID,
    comp_type: str | None = Query(None),
):
    """List property comps for an asset."""
    try:
        return re_property_comps.list_comps(asset_id=asset_id, comp_type=comp_type)
    except Exception as exc:
        raise _to_http(exc)


@router.post("/assets/{asset_id}/comps", response_model=list[PropertyCompOut], status_code=201)
def load_asset_comps(asset_id: UUID, body: PropertyCompLoadRequest):
    """Import property comps for an asset."""
    try:
        result = re_property_comps.load_comps(
            asset_id=asset_id,
            env_id=body.env_id,
            business_id=body.business_id,
            comp_type=body.comp_type,
            data=[c.model_dump() for c in body.comps],
        )
        _log("re.comps.loaded", f"Loaded {len(result)} comps", asset_id=str(asset_id))
        return result
    except Exception as exc:
        raise _to_http(exc)


# ── Capital Account Snapshots ───────────────────────────────────────────────

@router.get("/funds/{fund_id}/capital-snapshots", response_model=list[CapitalAccountSnapshotOut])
def get_capital_snapshots(
    fund_id: UUID,
    quarter: str = Query(...),
):
    """Get materialized capital account snapshots per partner."""
    try:
        return re_capital_snapshot.get_snapshots(fund_id=fund_id, quarter=quarter)
    except Exception as exc:
        raise _to_http(exc)


@router.post("/funds/{fund_id}/capital-snapshots/compute", response_model=list[CapitalAccountSnapshotOut])
def compute_capital_snapshots(fund_id: UUID, body: CapitalSnapshotComputeRequest):
    """Compute and store capital account snapshots for all partners."""
    try:
        result = re_capital_snapshot.compute_and_store_snapshots(
            fund_id=fund_id,
            quarter=body.quarter,
        )
        _log("re.capital.snapshots", f"Computed {len(result)} snapshots", fund_id=str(fund_id))
        return result
    except Exception as exc:
        raise _to_http(exc)


# ── Excel Export ────────────────────────────────────────────────────────────

@router.get("/funds/{fund_id}/export")
def export_fund_report(
    fund_id: UUID,
    env_id: str = Query(...),
    business_id: UUID = Query(...),
    quarter: str = Query(...),
):
    """Download fund report as .xlsx."""
    try:
        xlsx_bytes = re_excel_export.export_fund_report(
            env_id=env_id,
            business_id=business_id,
            fund_id=fund_id,
            quarter=quarter,
        )
        return StreamingResponse(
            iter([xlsx_bytes]),
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f"attachment; filename=fund_report_{quarter}.xlsx"},
        )
    except Exception as exc:
        raise _to_http(exc)
