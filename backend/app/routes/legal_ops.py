from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Query, Request

from app.routes.domain_common import classify_domain_error, domain_error_response
from app.schemas.legal_ops import (
    LegalApprovalCreateRequest,
    LegalApprovalRuleCreateRequest,
    LegalApprovalRuleOut,
    LegalApproverCreateRequest,
    LegalApproverOut,
    LegalClauseCreateRequest,
    LegalClauseOut,
    LegalContractCreateRequest,
    LegalContractOut,
    LegalDeadlineCreateRequest,
    LegalFirmCreateRequest,
    LegalFirmOut,
    LegalGovernanceItemOut,
    LegalLitigationCaseOut,
    LegalMatterCreateRequest,
    LegalMatterOut,
    LegalOpsContextOut,
    LegalPlaybookCreateRequest,
    LegalPlaybookOut,
    LegalPlaybookPositionCreateRequest,
    LegalPlaybookPositionOut,
    LegalPolicySourceCreateRequest,
    LegalPolicySourceOut,
    LegalPriorDecisionCreateRequest,
    LegalPriorDecisionOut,
    LegalRegulatoryItemOut,
    LegalSpendEntryCreateRequest,
    LegalSpendEntryOut,
)
from app.services import env_context
from app.services import legal_ops as legal_ops_svc

router = APIRouter(prefix="/api/legalops/v1", tags=["legal-ops"])


def _resolve_context(request: Request, env_id: str | None, business_id: UUID | None):
    ctx = env_context.resolve_env_business_context(
        request=request,
        env_id=env_id,
        business_id=str(business_id) if business_id else None,
        allow_create=True,
        create_slug_prefix="legal",
    )
    return UUID(ctx.env_id), UUID(ctx.business_id), ctx


@router.get("/context", response_model=LegalOpsContextOut)
def get_context(request: Request, env_id: str = Query(...), business_id: UUID | None = Query(default=None)):
    try:
        resolved_env_id, resolved_business_id, ctx = _resolve_context(request, env_id, business_id)
        return LegalOpsContextOut(
            env_id=str(resolved_env_id),
            business_id=resolved_business_id,
            created=ctx.created,
            source=ctx.source,
            diagnostics=ctx.diagnostics,
        )
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="legalops.context.failed")


@router.get("/matters", response_model=list[LegalMatterOut])
def list_matters(request: Request, env_id: str = Query(...), business_id: UUID | None = Query(default=None)):
    try:
        resolved_env_id, resolved_business_id, _ctx = _resolve_context(request, env_id, business_id)
        return [LegalMatterOut(**row) for row in legal_ops_svc.list_matters(env_id=resolved_env_id, business_id=resolved_business_id)]
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="legalops.matters.list_failed")


@router.post("/matters", response_model=LegalMatterOut)
def create_matter(req: LegalMatterCreateRequest, request: Request):
    try:
        resolved_env_id, resolved_business_id, _ctx = _resolve_context(request, req.env_id, req.business_id)
        row = legal_ops_svc.create_matter(
            env_id=resolved_env_id,
            business_id=resolved_business_id,
            payload=req.model_dump(exclude={"env_id", "business_id"}),
        )
        return LegalMatterOut(**row)
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="legalops.matters.create_failed")


@router.get("/matters/{matter_id}", response_model=LegalMatterOut)
def get_matter(matter_id: UUID, request: Request, env_id: str = Query(...), business_id: UUID | None = Query(default=None)):
    try:
        resolved_env_id, resolved_business_id, _ctx = _resolve_context(request, env_id, business_id)
        return LegalMatterOut(**legal_ops_svc.get_matter(env_id=resolved_env_id, business_id=resolved_business_id, matter_id=matter_id))
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="legalops.matters.get_failed")


@router.post("/matters/{matter_id}/contracts")
def create_contract(matter_id: UUID, req: LegalContractCreateRequest, request: Request, env_id: str = Query(...), business_id: UUID | None = Query(default=None)):
    try:
        resolved_env_id, resolved_business_id, _ctx = _resolve_context(request, env_id, business_id)
        return legal_ops_svc.create_contract(
            env_id=resolved_env_id,
            business_id=resolved_business_id,
            matter_id=matter_id,
            payload=req.model_dump(),
        )
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="legalops.contract.create_failed")


@router.post("/matters/{matter_id}/deadlines")
def create_deadline(matter_id: UUID, req: LegalDeadlineCreateRequest, request: Request, env_id: str = Query(...), business_id: UUID | None = Query(default=None)):
    try:
        resolved_env_id, resolved_business_id, _ctx = _resolve_context(request, env_id, business_id)
        return legal_ops_svc.create_deadline(
            env_id=resolved_env_id,
            business_id=resolved_business_id,
            matter_id=matter_id,
            payload=req.model_dump(),
        )
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="legalops.deadline.create_failed")


@router.post("/matters/{matter_id}/approvals")
def create_approval(matter_id: UUID, req: LegalApprovalCreateRequest, request: Request, env_id: str = Query(...), business_id: UUID | None = Query(default=None)):
    try:
        resolved_env_id, resolved_business_id, _ctx = _resolve_context(request, env_id, business_id)
        return legal_ops_svc.create_approval(
            env_id=resolved_env_id,
            business_id=resolved_business_id,
            matter_id=matter_id,
            payload=req.model_dump(),
        )
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="legalops.approval.create_failed")


@router.post("/matters/{matter_id}/spend")
def create_spend_entry(matter_id: UUID, req: LegalSpendEntryCreateRequest, request: Request, env_id: str = Query(...), business_id: UUID | None = Query(default=None)):
    try:
        resolved_env_id, resolved_business_id, _ctx = _resolve_context(request, env_id, business_id)
        return legal_ops_svc.create_spend_entry(
            env_id=resolved_env_id,
            business_id=resolved_business_id,
            matter_id=matter_id,
            payload=req.model_dump(),
        )
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="legalops.spend.create_failed")


@router.post("/seed")
def seed_workspace(request: Request, env_id: str = Query(...), business_id: UUID | None = Query(default=None)):
    try:
        resolved_env_id, resolved_business_id, _ctx = _resolve_context(request, env_id, business_id)
        return {"ok": True, **legal_ops_svc.seed_demo_workspace(env_id=resolved_env_id, business_id=resolved_business_id)}
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="legalops.seed.failed")


# ── Expansion endpoints ──────────────────────────────────────────────────────

@router.get("/dashboard")
def get_dashboard(request: Request, env_id: str = Query(...), business_id: UUID | None = Query(default=None)):
    try:
        resolved_env_id, resolved_business_id, _ctx = _resolve_context(request, env_id, business_id)
        return legal_ops_svc.get_dashboard_summary(env_id=resolved_env_id, business_id=resolved_business_id)
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="legalops.dashboard.failed")


@router.get("/firms", response_model=list[LegalFirmOut])
def list_firms(request: Request, env_id: str = Query(...), business_id: UUID | None = Query(default=None)):
    try:
        resolved_env_id, resolved_business_id, _ctx = _resolve_context(request, env_id, business_id)
        return [LegalFirmOut(**r) for r in legal_ops_svc.list_firms(env_id=resolved_env_id, business_id=resolved_business_id)]
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="legalops.firms.list_failed")


@router.post("/firms", response_model=LegalFirmOut)
def create_firm(req: LegalFirmCreateRequest, request: Request):
    try:
        resolved_env_id, resolved_business_id, _ctx = _resolve_context(request, req.env_id, req.business_id)
        row = legal_ops_svc.create_firm(
            env_id=resolved_env_id,
            business_id=resolved_business_id,
            payload=req.model_dump(exclude={"env_id", "business_id"}),
        )
        return LegalFirmOut(**row)
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="legalops.firms.create_failed")


@router.get("/contracts", response_model=list[LegalContractOut])
def list_contracts(request: Request, env_id: str = Query(...), business_id: UUID | None = Query(default=None), status: str | None = Query(default=None)):
    try:
        resolved_env_id, resolved_business_id, _ctx = _resolve_context(request, env_id, business_id)
        return [LegalContractOut(**r) for r in legal_ops_svc.list_contracts(env_id=resolved_env_id, business_id=resolved_business_id, status=status)]
    except Exception as exc:
        status_code, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status_code, code=code, detail=str(exc), action="legalops.contracts.list_failed")


@router.get("/regulatory", response_model=list[LegalRegulatoryItemOut])
def list_regulatory(request: Request, env_id: str = Query(...), business_id: UUID | None = Query(default=None)):
    try:
        resolved_env_id, resolved_business_id, _ctx = _resolve_context(request, env_id, business_id)
        return [LegalRegulatoryItemOut(**r) for r in legal_ops_svc.list_regulatory(env_id=resolved_env_id, business_id=resolved_business_id)]
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="legalops.regulatory.list_failed")


@router.get("/governance", response_model=list[LegalGovernanceItemOut])
def list_governance(request: Request, env_id: str = Query(...), business_id: UUID | None = Query(default=None), item_type: str | None = Query(default=None)):
    try:
        resolved_env_id, resolved_business_id, _ctx = _resolve_context(request, env_id, business_id)
        return [LegalGovernanceItemOut(**r) for r in legal_ops_svc.list_governance(env_id=resolved_env_id, business_id=resolved_business_id, item_type=item_type)]
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="legalops.governance.list_failed")


@router.get("/spend-entries", response_model=list[LegalSpendEntryOut])
def list_spend_entries(request: Request, env_id: str = Query(...), business_id: UUID | None = Query(default=None)):
    try:
        resolved_env_id, resolved_business_id, _ctx = _resolve_context(request, env_id, business_id)
        return [LegalSpendEntryOut(**r) for r in legal_ops_svc.list_spend_entries(env_id=resolved_env_id, business_id=resolved_business_id)]
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="legalops.spend.list_failed")


@router.get("/litigation", response_model=list[LegalLitigationCaseOut])
def list_litigation(request: Request, env_id: str = Query(...), business_id: UUID | None = Query(default=None)):
    try:
        resolved_env_id, resolved_business_id, _ctx = _resolve_context(request, env_id, business_id)
        return [LegalLitigationCaseOut(**r) for r in legal_ops_svc.list_litigation_cases(env_id=resolved_env_id, business_id=resolved_business_id)]
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="legalops.litigation.list_failed")


# ── Phase 1: Knowledge Base + Legal Memory ─────────────────────────────────


@router.get("/playbooks", response_model=list[LegalPlaybookOut])
def list_playbooks(request: Request, env_id: str = Query(...), business_id: UUID | None = Query(default=None)):
    try:
        resolved_env_id, resolved_business_id, _ctx = _resolve_context(request, env_id, business_id)
        return [LegalPlaybookOut(**r) for r in legal_ops_svc.list_playbooks(env_id=resolved_env_id, business_id=resolved_business_id)]
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="legalops.playbooks.list_failed")


@router.post("/playbooks", response_model=LegalPlaybookOut)
def create_playbook(req: LegalPlaybookCreateRequest, request: Request):
    try:
        resolved_env_id, resolved_business_id, _ctx = _resolve_context(request, req.env_id, req.business_id)
        row = legal_ops_svc.create_playbook(
            env_id=resolved_env_id,
            business_id=resolved_business_id,
            payload=req.model_dump(exclude={"env_id", "business_id"}),
        )
        return LegalPlaybookOut(**row)
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="legalops.playbooks.create_failed")


@router.get("/playbooks/{playbook_id}/positions", response_model=list[LegalPlaybookPositionOut])
def list_playbook_positions(playbook_id: UUID, request: Request, env_id: str = Query(...), business_id: UUID | None = Query(default=None)):
    try:
        resolved_env_id, resolved_business_id, _ctx = _resolve_context(request, env_id, business_id)
        rows = legal_ops_svc.list_playbook_positions(env_id=resolved_env_id, business_id=resolved_business_id, playbook_id=playbook_id)
        return [LegalPlaybookPositionOut(**r) for r in rows]
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="legalops.playbook_positions.list_failed")


@router.post("/playbooks/{playbook_id}/positions", response_model=LegalPlaybookPositionOut)
def create_playbook_position(playbook_id: UUID, req: LegalPlaybookPositionCreateRequest, request: Request, env_id: str = Query(...), business_id: UUID | None = Query(default=None)):
    try:
        resolved_env_id, resolved_business_id, _ctx = _resolve_context(request, env_id, business_id)
        row = legal_ops_svc.create_playbook_position(
            env_id=resolved_env_id,
            business_id=resolved_business_id,
            playbook_id=playbook_id,
            payload=req.model_dump(),
        )
        return LegalPlaybookPositionOut(**row)
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="legalops.playbook_positions.create_failed")


@router.get("/clauses", response_model=list[LegalClauseOut])
def list_clauses(request: Request, env_id: str = Query(...), business_id: UUID | None = Query(default=None)):
    try:
        resolved_env_id, resolved_business_id, _ctx = _resolve_context(request, env_id, business_id)
        return [LegalClauseOut(**r) for r in legal_ops_svc.list_clauses(env_id=resolved_env_id, business_id=resolved_business_id)]
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="legalops.clauses.list_failed")


@router.post("/clauses", response_model=LegalClauseOut)
def create_clause(req: LegalClauseCreateRequest, request: Request):
    try:
        resolved_env_id, resolved_business_id, _ctx = _resolve_context(request, req.env_id, req.business_id)
        row = legal_ops_svc.create_clause(
            env_id=resolved_env_id,
            business_id=resolved_business_id,
            payload=req.model_dump(exclude={"env_id", "business_id"}),
        )
        return LegalClauseOut(**row)
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="legalops.clauses.create_failed")


@router.get("/approval-rules", response_model=list[LegalApprovalRuleOut])
def list_approval_rules(request: Request, env_id: str = Query(...), business_id: UUID | None = Query(default=None)):
    try:
        resolved_env_id, resolved_business_id, _ctx = _resolve_context(request, env_id, business_id)
        return [LegalApprovalRuleOut(**r) for r in legal_ops_svc.list_approval_rules(env_id=resolved_env_id, business_id=resolved_business_id)]
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="legalops.approval_rules.list_failed")


@router.post("/approval-rules", response_model=LegalApprovalRuleOut)
def create_approval_rule(req: LegalApprovalRuleCreateRequest, request: Request):
    try:
        resolved_env_id, resolved_business_id, _ctx = _resolve_context(request, req.env_id, req.business_id)
        row = legal_ops_svc.create_approval_rule(
            env_id=resolved_env_id,
            business_id=resolved_business_id,
            payload=req.model_dump(exclude={"env_id", "business_id"}),
        )
        return LegalApprovalRuleOut(**row)
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="legalops.approval_rules.create_failed")


@router.get("/approvers", response_model=list[LegalApproverOut])
def list_approvers(request: Request, env_id: str = Query(...), business_id: UUID | None = Query(default=None)):
    try:
        resolved_env_id, resolved_business_id, _ctx = _resolve_context(request, env_id, business_id)
        return [LegalApproverOut(**r) for r in legal_ops_svc.list_approvers(env_id=resolved_env_id, business_id=resolved_business_id)]
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="legalops.approvers.list_failed")


@router.post("/approvers", response_model=LegalApproverOut)
def create_approver(req: LegalApproverCreateRequest, request: Request):
    try:
        resolved_env_id, resolved_business_id, _ctx = _resolve_context(request, req.env_id, req.business_id)
        row = legal_ops_svc.create_approver(
            env_id=resolved_env_id,
            business_id=resolved_business_id,
            payload=req.model_dump(exclude={"env_id", "business_id"}),
        )
        return LegalApproverOut(**row)
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="legalops.approvers.create_failed")


@router.get("/prior-decisions", response_model=list[LegalPriorDecisionOut])
def list_prior_decisions(
    request: Request,
    env_id: str = Query(...),
    business_id: UUID | None = Query(default=None),
    contract_type: str | None = Query(default=None),
    clause_key: str | None = Query(default=None),
):
    try:
        resolved_env_id, resolved_business_id, _ctx = _resolve_context(request, env_id, business_id)
        rows = legal_ops_svc.list_prior_decisions(
            env_id=resolved_env_id, business_id=resolved_business_id,
            contract_type=contract_type, clause_key=clause_key,
        )
        return [LegalPriorDecisionOut(**r) for r in rows]
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="legalops.prior_decisions.list_failed")


@router.post("/prior-decisions", response_model=LegalPriorDecisionOut)
def create_prior_decision(req: LegalPriorDecisionCreateRequest, request: Request):
    try:
        resolved_env_id, resolved_business_id, _ctx = _resolve_context(request, req.env_id, req.business_id)
        row = legal_ops_svc.create_prior_decision(
            env_id=resolved_env_id,
            business_id=resolved_business_id,
            payload=req.model_dump(exclude={"env_id", "business_id"}),
        )
        return LegalPriorDecisionOut(**row)
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="legalops.prior_decisions.create_failed")


@router.get("/policy-sources", response_model=list[LegalPolicySourceOut])
def list_policy_sources(request: Request, env_id: str = Query(...), business_id: UUID | None = Query(default=None)):
    try:
        resolved_env_id, resolved_business_id, _ctx = _resolve_context(request, env_id, business_id)
        return [LegalPolicySourceOut(**r) for r in legal_ops_svc.list_policy_sources(env_id=resolved_env_id, business_id=resolved_business_id)]
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="legalops.policy_sources.list_failed")


@router.post("/policy-sources", response_model=LegalPolicySourceOut)
def create_policy_source(req: LegalPolicySourceCreateRequest, request: Request):
    try:
        resolved_env_id, resolved_business_id, _ctx = _resolve_context(request, req.env_id, req.business_id)
        row = legal_ops_svc.create_policy_source(
            env_id=resolved_env_id,
            business_id=resolved_business_id,
            payload=req.model_dump(exclude={"env_id", "business_id"}),
        )
        return LegalPolicySourceOut(**row)
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="legalops.policy_sources.create_failed")


@router.post("/seed-kb")
def seed_kb_workspace(request: Request, env_id: str = Query(...), business_id: UUID | None = Query(default=None)):
    """Phase 1: idempotent seed of playbooks, clauses, approval rules,
    approvers, Legal Memory entries, and policy sources for demo."""
    try:
        resolved_env_id, resolved_business_id, _ctx = _resolve_context(request, env_id, business_id)
        return {"ok": True, **legal_ops_svc.seed_kb_demo(env_id=resolved_env_id, business_id=resolved_business_id)}
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="legalops.seed_kb.failed")
