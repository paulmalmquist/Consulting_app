"""Finance v1 API surface for deterministic financial execution."""

from __future__ import annotations

from datetime import date
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query

from app.schemas.finance import (
    BudgetCreateRequest,
    BudgetVersionCreateRequest,
    CapitalCallCreateRequest,
    CapitalRollforwardRunRequest,
    CapitalRollforwardTriggerRequest,
    ChangeOrderCreateRequest,
    ClaimCreateRequest,
    ClinicCreateRequest,
    ContributionCreateRequest,
    CommitmentCreateRequest,
    ConstructionForecastRunRequest,
    ContingencyRunRequest,
    ContingencyRunTriggerRequest,
    DistributionEventCreateRequest,
    AssetInvestmentCreateRequest,
    EnsureConstructionProjectRequest,
    FinRunOut,
    FinRunResponse,
    FinRunResultRef,
    FinanceRunRequest,
    ForecastRunTriggerRequest,
    FundCreateRequest,
    MsoCreateRequest,
    MatterCreateRequest,
    ProviderCompPlanCreateRequest,
    ProviderCompRunRequest,
    ProviderCompRunTriggerRequest,
    ProviderCreateRequest,
    ParticipantCreateRequest,
    SimulationCreateRequest,
    SnapshotCreateRequest,
    TrustTransactionCreateRequest,
    WaterfallRunRequest,
    WaterfallRunTriggerRequest,
)
from app.services import (
    finance_construction,
    finance_healthcare,
    finance_legal,
    finance_repe,
    finance_runtime,
    finance_scenarios,
    materialization,
)

router = APIRouter(prefix="/api/fin/v1")


def _to_http_error(exc: Exception) -> HTTPException:
    if isinstance(exc, LookupError):
        return HTTPException(status_code=404, detail=str(exc))
    if isinstance(exc, ValueError):
        return HTTPException(status_code=400, detail=str(exc))
    return HTTPException(status_code=500, detail=str(exc))


@router.post("/runs", response_model=FinRunResponse)
def submit_run(req: FinanceRunRequest):
    try:
        payload = {}
        if isinstance(req, WaterfallRunRequest):
            payload = {
                "fund_id": str(req.fund_id),
                "distribution_event_id": str(req.distribution_event_id),
                "input_ref_table": "fin_distribution_event",
                "input_ref_id": str(req.distribution_event_id),
            }
        elif isinstance(req, CapitalRollforwardRunRequest):
            payload = {
                "fund_id": str(req.fund_id),
                "input_ref_table": "fin_fund",
                "input_ref_id": str(req.fund_id),
            }
        elif isinstance(req, ContingencyRunRequest):
            payload = {
                "matter_id": str(req.matter_id),
                "settlement_amount": req.settlement_amount,
                "expense_amount": req.expense_amount,
                "input_ref_table": "fin_matter",
                "input_ref_id": str(req.matter_id),
            }
        elif isinstance(req, ProviderCompRunRequest):
            payload = {
                "provider_id": str(req.provider_id),
                "provider_comp_plan_id": str(req.provider_comp_plan_id) if req.provider_comp_plan_id else None,
                "gross_collections": req.gross_collections,
                "net_collections": req.net_collections,
                "input_ref_table": "fin_provider",
                "input_ref_id": str(req.provider_id),
            }
        elif isinstance(req, ConstructionForecastRunRequest):
            payload = {
                "project_id": str(req.project_id),
                "input_ref_table": "fin_construction_project",
                "input_ref_id": str(req.project_id),
            }

        run_row = finance_runtime.submit_run(
            business_id=req.business_id,
            partition_id=req.partition_id,
            engine_kind=req.engine_kind,
            as_of_date=req.as_of_date,
            idempotency_key=req.idempotency_key,
            payload=payload,
            dataset_version_id=req.dataset_version_id,
            fin_rule_version_id=req.fin_rule_version_id,
        )
        refs = finance_runtime.get_run_results(run_id=run_row["fin_run_id"])
        return FinRunResponse(
            run=FinRunOut(**run_row),
            result_refs=[FinRunResultRef(**r) for r in refs],
        )
    except Exception as exc:
        raise _to_http_error(exc)


@router.get("/runs/{run_id}", response_model=FinRunOut)
def get_run(run_id: UUID):
    run_row = finance_runtime.get_run(run_id=run_id)
    if not run_row:
        raise HTTPException(status_code=404, detail="Run not found")
    return FinRunOut(**run_row)


@router.get("/runs/{run_id}/results", response_model=list[FinRunResultRef])
def get_run_results(run_id: UUID):
    rows = finance_runtime.get_run_results(run_id=run_id)
    return [FinRunResultRef(**r) for r in rows]


@router.post("/funds")
def create_fund(req: FundCreateRequest):
    try:
        return finance_repe.create_fund(
            business_id=req.business_id,
            partition_id=req.partition_id,
            fund_code=req.fund_code,
            name=req.name,
            strategy=req.strategy,
            vintage_date=req.vintage_date,
            term_years=req.term_years,
            pref_rate=req.pref_rate,
            pref_is_compound=req.pref_is_compound,
            catchup_rate=req.catchup_rate,
            carry_rate=req.carry_rate,
            waterfall_style=req.waterfall_style,
        )
    except Exception as exc:
        raise _to_http_error(exc)


@router.get("/funds")
def list_funds(
    business_id: UUID = Query(...),
    partition_id: UUID = Query(...),
):
    try:
        return finance_repe.list_funds(business_id=business_id, partition_id=partition_id)
    except Exception as exc:
        raise _to_http_error(exc)


@router.post("/participants")
def create_participant(req: ParticipantCreateRequest):
    try:
        return finance_repe.create_participant(
            business_id=req.business_id,
            name=req.name,
            participant_type=req.participant_type,
            external_key=req.external_key,
        )
    except Exception as exc:
        raise _to_http_error(exc)


@router.get("/participants")
def list_participants(
    business_id: UUID = Query(...),
    participant_type: str | None = Query(None),
):
    try:
        return finance_repe.list_participants(
            business_id=business_id,
            participant_type=participant_type,
        )
    except Exception as exc:
        raise _to_http_error(exc)


@router.post("/funds/{fund_id}/commitments")
def create_commitment(fund_id: UUID, req: CommitmentCreateRequest):
    try:
        row = finance_repe.create_commitment(
            fund_id=fund_id,
            fin_participant_id=req.fin_participant_id,
            commitment_role=req.commitment_role,
            commitment_date=req.commitment_date,
            committed_amount=req.committed_amount,
            fin_entity_id=req.fin_entity_id,
        )
        materialization.enqueue_materialization_job(
            business_id=row["business_id"],
            event_type="fin.commitment.created",
            event_payload={"fin_commitment_id": str(row["fin_commitment_id"])},
            idempotency_key=f"fin_commitment_{row['fin_commitment_id']}",
        )
        materialization.materialize_business_snapshot(business_id=row["business_id"])
        return row
    except Exception as exc:
        raise _to_http_error(exc)


@router.get("/funds/{fund_id}/commitments")
def list_commitments(fund_id: UUID):
    try:
        return finance_repe.list_commitments(fund_id=fund_id)
    except Exception as exc:
        raise _to_http_error(exc)


@router.post("/funds/{fund_id}/capital-calls")
def create_capital_call(fund_id: UUID, req: CapitalCallCreateRequest):
    try:
        row = finance_repe.create_capital_call(
            fund_id=fund_id,
            call_date=req.call_date,
            due_date=req.due_date,
            amount_requested=req.amount_requested,
            purpose=req.purpose,
        )
        materialization.enqueue_materialization_job(
            business_id=row["business_id"],
            event_type="fin.capital_call.created",
            event_payload={"fin_capital_call_id": str(row["fin_capital_call_id"])},
            idempotency_key=f"fin_capital_call_{row['fin_capital_call_id']}",
        )
        materialization.materialize_business_snapshot(business_id=row["business_id"])
        return row
    except Exception as exc:
        raise _to_http_error(exc)


@router.get("/funds/{fund_id}/capital-calls")
def list_capital_calls(fund_id: UUID):
    try:
        return finance_repe.list_capital_calls(fund_id=fund_id)
    except Exception as exc:
        raise _to_http_error(exc)


@router.post("/funds/{fund_id}/assets")
def create_asset_investment(fund_id: UUID, req: AssetInvestmentCreateRequest):
    try:
        row = finance_repe.create_asset_investment(
            fund_id=fund_id,
            asset_name=req.asset_name,
            acquisition_date=req.acquisition_date,
            cost_basis=req.cost_basis,
            current_valuation=req.current_valuation,
        )
        materialization.enqueue_materialization_job(
            business_id=row["business_id"],
            event_type="fin.asset.created",
            event_payload={"fin_asset_investment_id": str(row["fin_asset_investment_id"])},
            idempotency_key=f"fin_asset_{row['fin_asset_investment_id']}",
        )
        materialization.materialize_business_snapshot(business_id=row["business_id"])
        return row
    except Exception as exc:
        raise _to_http_error(exc)


@router.get("/funds/{fund_id}/assets")
def list_assets(fund_id: UUID):
    try:
        return finance_repe.list_assets(fund_id=fund_id)
    except Exception as exc:
        raise _to_http_error(exc)


@router.post("/funds/{fund_id}/contributions")
def create_contribution(fund_id: UUID, req: ContributionCreateRequest):
    try:
        row = finance_repe.create_contribution(
            fund_id=fund_id,
            fin_capital_call_id=req.fin_capital_call_id,
            fin_participant_id=req.fin_participant_id,
            contribution_date=req.contribution_date,
            amount_contributed=req.amount_contributed,
            status=req.status,
        )
        materialization.enqueue_materialization_job(
            business_id=row["business_id"],
            event_type="fin.contribution.created",
            event_payload={"fin_contribution_id": str(row["fin_contribution_id"])},
            idempotency_key=f"fin_contribution_{row['fin_contribution_id']}",
        )
        materialization.materialize_business_snapshot(business_id=row["business_id"])
        return row
    except Exception as exc:
        raise _to_http_error(exc)


@router.post("/funds/{fund_id}/distribution-events")
def create_distribution_event(fund_id: UUID, req: DistributionEventCreateRequest):
    try:
        row = finance_repe.create_distribution_event(
            fund_id=fund_id,
            event_date=req.event_date,
            gross_proceeds=req.gross_proceeds,
            net_distributable=req.net_distributable,
            event_type=req.event_type,
            reference=req.reference,
            fin_asset_investment_id=req.fin_asset_investment_id,
        )
        materialization.enqueue_materialization_job(
            business_id=row["business_id"],
            event_type="fin.distribution_event.created",
            event_payload={"fin_distribution_event_id": str(row["fin_distribution_event_id"])},
            idempotency_key=f"fin_distribution_event_{row['fin_distribution_event_id']}",
        )
        materialization.materialize_business_snapshot(business_id=row["business_id"])
        return row
    except Exception as exc:
        raise _to_http_error(exc)


@router.get("/funds/{fund_id}/distribution-events")
def list_distribution_events(fund_id: UUID):
    try:
        return finance_repe.list_distribution_events(fund_id=fund_id)
    except Exception as exc:
        raise _to_http_error(exc)


@router.get("/funds/{fund_id}/distribution-events/{distribution_event_id}/payouts")
def list_distribution_payouts(fund_id: UUID, distribution_event_id: UUID):
    try:
        return finance_repe.list_distribution_payouts(
            fund_id=fund_id,
            distribution_event_id=distribution_event_id,
        )
    except Exception as exc:
        raise _to_http_error(exc)


@router.post("/funds/{fund_id}/waterfall-runs", response_model=FinRunResponse)
def run_waterfall(fund_id: UUID, req: WaterfallRunTriggerRequest):
    try:
        run_row = finance_runtime.submit_run(
            business_id=req.business_id,
            partition_id=req.partition_id,
            engine_kind="waterfall",
            as_of_date=req.as_of_date,
            idempotency_key=req.idempotency_key,
            payload={
                "fund_id": str(fund_id),
                "distribution_event_id": str(req.distribution_event_id),
                "input_ref_table": "fin_distribution_event",
                "input_ref_id": str(req.distribution_event_id),
            },
        )
        refs = finance_runtime.get_run_results(run_id=run_row["fin_run_id"])
        return FinRunResponse(
            run=FinRunOut(**run_row),
            result_refs=[FinRunResultRef(**r) for r in refs],
        )
    except Exception as exc:
        raise _to_http_error(exc)


@router.get("/funds/{fund_id}/waterfall-runs/{run_id}/allocations")
def list_waterfall_allocations(fund_id: UUID, run_id: UUID):
    try:
        return finance_repe.list_waterfall_allocations(fund_id=fund_id, run_id=run_id)
    except Exception as exc:
        raise _to_http_error(exc)


@router.post("/funds/{fund_id}/capital-rollforward-runs", response_model=FinRunResponse)
def run_capital_rollforward(fund_id: UUID, req: CapitalRollforwardTriggerRequest):
    try:
        run_row = finance_runtime.submit_run(
            business_id=req.business_id,
            partition_id=req.partition_id,
            engine_kind="capital_rollforward",
            as_of_date=req.as_of_date,
            idempotency_key=req.idempotency_key,
            payload={
                "fund_id": str(fund_id),
                "input_ref_table": "fin_fund",
                "input_ref_id": str(fund_id),
            },
        )
        refs = finance_runtime.get_run_results(run_id=run_row["fin_run_id"])
        return FinRunResponse(
            run=FinRunOut(**run_row),
            result_refs=[FinRunResultRef(**r) for r in refs],
        )
    except Exception as exc:
        raise _to_http_error(exc)


@router.get("/funds/{fund_id}/capital-rollforward")
def get_capital_rollforward(fund_id: UUID, as_of_date: date | None = Query(None)):
    try:
        return finance_repe.list_capital_rollforward(fund_id=fund_id, as_of_date=as_of_date)
    except Exception as exc:
        raise _to_http_error(exc)


@router.post("/matters")
def create_matter(req: MatterCreateRequest):
    try:
        return finance_legal.create_matter(
            business_id=req.business_id,
            partition_id=req.partition_id,
            matter_number=req.matter_number,
            name=req.name,
            opened_at=req.opened_at,
            contingency_fee_rate=req.contingency_fee_rate,
            trust_required=req.trust_required,
            fin_entity_id_client=req.fin_entity_id_client,
            responsible_actor_id=req.responsible_actor_id,
        )
    except Exception as exc:
        raise _to_http_error(exc)


@router.get("/matters")
def list_matters(business_id: UUID = Query(...), partition_id: UUID = Query(...)):
    try:
        return finance_legal.list_matters(business_id=business_id, partition_id=partition_id)
    except Exception as exc:
        raise _to_http_error(exc)


@router.post("/matters/{matter_id}/trust-transactions")
def create_trust_transaction(matter_id: UUID, req: TrustTransactionCreateRequest):
    try:
        return finance_legal.create_trust_transaction(
            matter_id=matter_id,
            txn_date=req.txn_date,
            txn_type=req.txn_type,
            direction=req.direction,
            amount=req.amount,
            memo=req.memo,
        )
    except Exception as exc:
        raise _to_http_error(exc)


@router.get("/matters/{matter_id}/trust-transactions")
def list_trust_transactions(matter_id: UUID):
    try:
        return finance_legal.list_trust_transactions(matter_id=matter_id)
    except Exception as exc:
        raise _to_http_error(exc)


@router.post("/matters/{matter_id}/contingency-runs", response_model=FinRunResponse)
def run_contingency(matter_id: UUID, req: ContingencyRunTriggerRequest):
    try:
        run_row = finance_runtime.submit_run(
            business_id=req.business_id,
            partition_id=req.partition_id,
            engine_kind="contingency",
            as_of_date=req.as_of_date,
            idempotency_key=req.idempotency_key,
            payload={
                "matter_id": str(matter_id),
                "settlement_amount": req.settlement_amount,
                "expense_amount": req.expense_amount,
                "input_ref_table": "fin_matter",
                "input_ref_id": str(matter_id),
            },
        )
        refs = finance_runtime.get_run_results(run_id=run_row["fin_run_id"])
        return FinRunResponse(
            run=FinRunOut(**run_row),
            result_refs=[FinRunResultRef(**r) for r in refs],
        )
    except Exception as exc:
        raise _to_http_error(exc)


@router.get("/matters/{matter_id}/economics")
def get_matter_economics(matter_id: UUID):
    try:
        return finance_legal.get_matter_economics(matter_id=matter_id)
    except Exception as exc:
        raise _to_http_error(exc)


@router.post("/msos")
def create_mso(req: MsoCreateRequest):
    try:
        return finance_healthcare.create_mso(
            business_id=req.business_id,
            partition_id=req.partition_id,
            code=req.code,
            name=req.name,
            fin_entity_id=req.fin_entity_id,
        )
    except Exception as exc:
        raise _to_http_error(exc)


@router.get("/msos")
def list_msos(business_id: UUID = Query(...), partition_id: UUID = Query(...)):
    try:
        return finance_healthcare.list_msos(business_id=business_id, partition_id=partition_id)
    except Exception as exc:
        raise _to_http_error(exc)


@router.post("/clinics")
def create_clinic(req: ClinicCreateRequest):
    try:
        return finance_healthcare.create_clinic(
            business_id=req.business_id,
            partition_id=req.partition_id,
            fin_mso_id=req.fin_mso_id,
            code=req.code,
            name=req.name,
            npi=req.npi,
            fin_entity_id=req.fin_entity_id,
        )
    except Exception as exc:
        raise _to_http_error(exc)


@router.get("/clinics")
def list_clinics(business_id: UUID = Query(...), partition_id: UUID = Query(...)):
    try:
        return finance_healthcare.list_clinics(business_id=business_id, partition_id=partition_id)
    except Exception as exc:
        raise _to_http_error(exc)


@router.post("/providers")
def create_provider(req: ProviderCreateRequest):
    try:
        return finance_healthcare.create_provider(
            business_id=req.business_id,
            partition_id=req.partition_id,
            fin_clinic_id=req.fin_clinic_id,
            fin_mso_id=req.fin_mso_id,
            fin_participant_id=req.fin_participant_id,
            provider_type=req.provider_type,
            license_number=req.license_number,
            npi=req.npi,
        )
    except Exception as exc:
        raise _to_http_error(exc)


@router.get("/providers")
def list_providers(business_id: UUID = Query(...), partition_id: UUID = Query(...)):
    try:
        return finance_healthcare.list_providers(business_id=business_id, partition_id=partition_id)
    except Exception as exc:
        raise _to_http_error(exc)


@router.post("/providers/{provider_id}/comp-plans")
def create_provider_comp_plan(provider_id: UUID, req: ProviderCompPlanCreateRequest):
    try:
        return finance_healthcare.create_provider_comp_plan(
            provider_id=provider_id,
            plan_name=req.plan_name,
            plan_formula=req.plan_formula,
            base_rate=req.base_rate,
            incentive_rate=req.incentive_rate,
            effective_from=req.effective_from,
            effective_to=req.effective_to,
        )
    except Exception as exc:
        raise _to_http_error(exc)


@router.post("/providers/{provider_id}/comp-runs", response_model=FinRunResponse)
def run_provider_comp(provider_id: UUID, req: ProviderCompRunTriggerRequest):
    try:
        run_row = finance_runtime.submit_run(
            business_id=req.business_id,
            partition_id=req.partition_id,
            engine_kind="provider_comp",
            as_of_date=req.as_of_date,
            idempotency_key=req.idempotency_key,
            payload={
                "provider_id": str(provider_id),
                "provider_comp_plan_id": str(req.provider_comp_plan_id) if req.provider_comp_plan_id else None,
                "gross_collections": req.gross_collections,
                "net_collections": req.net_collections,
                "input_ref_table": "fin_provider",
                "input_ref_id": str(provider_id),
            },
        )
        refs = finance_runtime.get_run_results(run_id=run_row["fin_run_id"])
        return FinRunResponse(
            run=FinRunOut(**run_row),
            result_refs=[FinRunResultRef(**r) for r in refs],
        )
    except Exception as exc:
        raise _to_http_error(exc)


@router.get("/providers/{provider_id}/comp-runs")
def list_provider_comp_runs(provider_id: UUID):
    try:
        return finance_healthcare.list_provider_comp_runs(provider_id=provider_id)
    except Exception as exc:
        raise _to_http_error(exc)


@router.post("/claims")
def create_claim(req: ClaimCreateRequest):
    try:
        return finance_healthcare.create_claim(
            business_id=req.business_id,
            partition_id=req.partition_id,
            claim_number=req.claim_number,
            fin_clinic_id=req.fin_clinic_id,
            fin_provider_id=req.fin_provider_id,
            service_date=req.service_date,
            billed_amount=req.billed_amount,
            allowed_amount=req.allowed_amount,
            paid_amount=req.paid_amount,
            status=req.status,
        )
    except Exception as exc:
        raise _to_http_error(exc)


@router.get("/claims")
def list_claims(business_id: UUID = Query(...), partition_id: UUID = Query(...)):
    try:
        return finance_healthcare.list_claims(business_id=business_id, partition_id=partition_id)
    except Exception as exc:
        raise _to_http_error(exc)


@router.get("/denials-reconciliation")
def list_denials_reconciliation(business_id: UUID = Query(...), partition_id: UUID = Query(...)):
    try:
        return finance_healthcare.list_denials_reconciliation(business_id=business_id, partition_id=partition_id)
    except Exception as exc:
        raise _to_http_error(exc)


@router.post("/projects/ensure")
def ensure_construction_project(req: EnsureConstructionProjectRequest):
    try:
        return finance_construction.ensure_fin_project(
            business_id=req.business_id,
            partition_id=req.partition_id,
            project_id=req.project_id,
            code=req.code,
            name=req.name,
        )
    except Exception as exc:
        raise _to_http_error(exc)


@router.post("/projects/{project_id}/budgets")
def create_budget(project_id: UUID, req: BudgetCreateRequest):
    try:
        return finance_construction.create_budget(
            fin_project_id=project_id,
            name=req.name,
            base_budget=req.base_budget,
        )
    except Exception as exc:
        raise _to_http_error(exc)


@router.get("/projects/{project_id}/budgets")
def list_budgets(project_id: UUID):
    try:
        return finance_construction.list_budgets(fin_project_id=project_id)
    except Exception as exc:
        raise _to_http_error(exc)


@router.post("/projects/{project_id}/budget-versions")
def create_budget_version(project_id: UUID, req: BudgetVersionCreateRequest):
    _ = project_id
    try:
        lines = [line.model_dump() for line in req.csi_lines] if req.csi_lines else None
        return finance_construction.create_budget_version(
            fin_budget_id=req.fin_budget_id,
            effective_date=req.effective_date,
            notes=req.notes,
            revised_budget=req.revised_budget,
            csi_lines=lines,
        )
    except Exception as exc:
        raise _to_http_error(exc)


@router.get("/projects/{project_id}/budget-versions")
def list_budget_versions(project_id: UUID):
    try:
        return finance_construction.list_budget_versions(fin_project_id=project_id)
    except Exception as exc:
        raise _to_http_error(exc)


@router.post("/projects/{project_id}/change-orders")
def create_change_order(project_id: UUID, req: ChangeOrderCreateRequest):
    try:
        return finance_construction.create_change_order(
            fin_project_id=project_id,
            change_order_ref=req.change_order_ref,
            cost_impact=req.cost_impact,
            schedule_impact_days=req.schedule_impact_days,
            status=req.status,
        )
    except Exception as exc:
        raise _to_http_error(exc)


@router.get("/projects/{project_id}/change-orders")
def list_change_orders(project_id: UUID):
    try:
        return finance_construction.list_change_orders(fin_project_id=project_id)
    except Exception as exc:
        raise _to_http_error(exc)


@router.post("/projects/{project_id}/forecast-runs", response_model=FinRunResponse)
def run_forecast(project_id: UUID, req: ForecastRunTriggerRequest):
    try:
        run_row = finance_runtime.submit_run(
            business_id=req.business_id,
            partition_id=req.partition_id,
            engine_kind="construction_forecast",
            as_of_date=req.as_of_date,
            idempotency_key=req.idempotency_key,
            payload={
                "project_id": str(project_id),
                "input_ref_table": "fin_construction_project",
                "input_ref_id": str(project_id),
            },
        )
        refs = finance_runtime.get_run_results(run_id=run_row["fin_run_id"])
        return FinRunResponse(
            run=FinRunOut(**run_row),
            result_refs=[FinRunResultRef(**r) for r in refs],
        )
    except Exception as exc:
        raise _to_http_error(exc)


@router.get("/projects/{project_id}/forecast-runs")
def list_forecasts(project_id: UUID):
    try:
        return finance_construction.list_forecasts(fin_project_id=project_id)
    except Exception as exc:
        raise _to_http_error(exc)


@router.post("/partitions/{live_partition_id}/snapshot")
def create_snapshot(live_partition_id: UUID, req: SnapshotCreateRequest):
    try:
        return finance_scenarios.snapshot_live_partition(
            business_id=req.business_id,
            live_partition_id=live_partition_id,
            snapshot_as_of=req.snapshot_as_of,
            dataset_version_id=req.dataset_version_id,
            rule_version_id=req.rule_version_id,
        )
    except Exception as exc:
        raise _to_http_error(exc)


@router.get("/partitions")
def list_partitions(business_id: UUID = Query(...)):
    try:
        return finance_scenarios.list_partitions(business_id=business_id)
    except Exception as exc:
        raise _to_http_error(exc)


@router.post("/simulations")
def create_simulation(req: SimulationCreateRequest):
    try:
        return finance_scenarios.create_simulation(
            business_id=req.business_id,
            base_partition_id=req.base_partition_id,
            scenario_key=req.scenario_key,
        )
    except Exception as exc:
        raise _to_http_error(exc)


@router.get("/simulations/{simulation_id}/diff-vs-live")
def diff_vs_live(simulation_id: UUID):
    try:
        return finance_scenarios.diff_vs_live(simulation_id=simulation_id)
    except Exception as exc:
        raise _to_http_error(exc)
