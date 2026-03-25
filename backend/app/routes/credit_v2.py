from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Query, Request

from app.routes.domain_common import classify_domain_error, domain_error_response
from app.schemas.credit_v2 import (
    BorrowerCreateRequest,
    CorpusDocumentCreateRequest,
    CreditSeedRequest,
    CreditV2ContextInitRequest,
    EvaluateLoanRequest,
    ExceptionResolveRequest,
    LoanCreateRequest,
    LoanEventCreateRequest,
    PolicyCreateRequest,
    PortfolioCreateRequest,
    PortfolioUpdateRequest,
    ScenarioCreateRequest,
)
from app.services import credit_decisioning as cd
from app.services import env_context

router = APIRouter(prefix="/api/credit/v2", tags=["credit_v2"])


def _resolve_context(request: Request, env_id: str | None, business_id: UUID | None):
    ctx = env_context.resolve_env_business_context(
        request=request,
        env_id=env_id,
        business_id=str(business_id) if business_id else None,
        allow_create=True,
        create_slug_prefix="credit",
    )
    return UUID(ctx.env_id), UUID(ctx.business_id), ctx


# ── Context ───────────────────────────────────────────────────────

@router.get("/context")
def get_context(request: Request, env_id: str = Query(...), business_id: UUID | None = Query(default=None)):
    try:
        eid, bid, ctx = _resolve_context(request, env_id, business_id)
        return cd.resolve_credit_context(env_id=eid, business_id=bid)
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="credit_v2.context.failed")


@router.post("/context/init")
def init_context(req: CreditV2ContextInitRequest, request: Request):
    try:
        eid, bid, _ctx = _resolve_context(request, req.env_id, req.business_id)
        return cd.init_credit_context(env_id=eid, business_id=bid)
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="credit_v2.context.init_failed")


# ── Portfolios ────────────────────────────────────────────────────

@router.get("/portfolios")
def list_portfolios(request: Request, env_id: str = Query(...), business_id: UUID | None = Query(default=None)):
    try:
        eid, bid, _ctx = _resolve_context(request, env_id, business_id)
        return cd.list_portfolios(env_id=eid, business_id=bid)
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="credit_v2.portfolios.list_failed")


@router.post("/portfolios")
def create_portfolio(req: PortfolioCreateRequest, request: Request):
    try:
        eid, bid, _ctx = _resolve_context(request, req.env_id, req.business_id)
        return cd.create_portfolio(env_id=eid, business_id=bid, payload=req.model_dump(exclude={"env_id", "business_id"}))
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="credit_v2.portfolios.create_failed")


@router.get("/portfolios/{portfolio_id}")
def get_portfolio(portfolio_id: UUID, request: Request, env_id: str = Query(...), business_id: UUID | None = Query(default=None)):
    try:
        eid, bid, _ctx = _resolve_context(request, env_id, business_id)
        return cd.get_portfolio(env_id=eid, business_id=bid, portfolio_id=portfolio_id)
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="credit_v2.portfolios.get_failed")


@router.patch("/portfolios/{portfolio_id}")
def update_portfolio(portfolio_id: UUID, req: PortfolioUpdateRequest, request: Request, env_id: str = Query(...), business_id: UUID | None = Query(default=None)):
    try:
        eid, bid, _ctx = _resolve_context(request, env_id, business_id)
        return cd.update_portfolio(env_id=eid, business_id=bid, portfolio_id=portfolio_id, payload=req.model_dump(exclude_none=True))
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="credit_v2.portfolios.update_failed")


# ── Borrowers ─────────────────────────────────────────────────────

@router.get("/borrowers")
def list_borrowers(request: Request, env_id: str = Query(...), business_id: UUID | None = Query(default=None)):
    try:
        eid, bid, _ctx = _resolve_context(request, env_id, business_id)
        return cd.list_borrowers(env_id=eid, business_id=bid)
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="credit_v2.borrowers.list_failed")


@router.post("/borrowers")
def create_borrower(req: BorrowerCreateRequest, request: Request):
    try:
        eid, bid, _ctx = _resolve_context(request, req.env_id, req.business_id)
        return cd.create_borrower(env_id=eid, business_id=bid, payload=req.model_dump(exclude={"env_id", "business_id"}))
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="credit_v2.borrowers.create_failed")


@router.get("/borrowers/{borrower_id}")
def get_borrower(borrower_id: UUID, request: Request, env_id: str = Query(...), business_id: UUID | None = Query(default=None)):
    try:
        eid, bid, _ctx = _resolve_context(request, env_id, business_id)
        return cd.get_borrower(env_id=eid, business_id=bid, borrower_id=borrower_id)
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="credit_v2.borrowers.get_failed")


# ── Loans ─────────────────────────────────────────────────────────

@router.get("/portfolios/{portfolio_id}/loans")
def list_loans(portfolio_id: UUID, request: Request, env_id: str = Query(...), business_id: UUID | None = Query(default=None), status: str | None = Query(default=None)):
    try:
        eid, bid, _ctx = _resolve_context(request, env_id, business_id)
        return cd.list_loans(env_id=eid, business_id=bid, portfolio_id=portfolio_id, status=status)
    except Exception as exc:
        st, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=st, code=code, detail=str(exc), action="credit_v2.loans.list_failed")


@router.post("/loans")
def create_loan(req: LoanCreateRequest, request: Request):
    try:
        eid, bid, _ctx = _resolve_context(request, req.env_id, req.business_id)
        return cd.create_loan(env_id=eid, business_id=bid, payload=req.model_dump(exclude={"env_id", "business_id"}))
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="credit_v2.loans.create_failed")


@router.get("/loans/{loan_id}")
def get_loan(loan_id: UUID, request: Request, env_id: str = Query(...), business_id: UUID | None = Query(default=None)):
    try:
        eid, bid, _ctx = _resolve_context(request, env_id, business_id)
        return cd.get_loan(env_id=eid, business_id=bid, loan_id=loan_id)
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="credit_v2.loans.get_failed")


@router.get("/loans/{loan_id}/events")
def list_loan_events(loan_id: UUID, request: Request, env_id: str = Query(...)):
    try:
        eid = UUID(env_id)
        return cd.list_loan_events(env_id=eid, loan_id=loan_id)
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="credit_v2.events.list_failed")


@router.post("/loans/{loan_id}/events")
def create_loan_event(loan_id: UUID, req: LoanEventCreateRequest, request: Request):
    try:
        eid = UUID(req.env_id) if req.env_id else UUID(request.query_params.get("env_id", ""))
        payload = req.model_dump(exclude={"env_id", "loan_id"})
        return cd.create_loan_event(env_id=eid, loan_id=loan_id, payload=payload)
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="credit_v2.events.create_failed")


# ── Policies ──────────────────────────────────────────────────────

@router.get("/policies")
def list_policies(request: Request, env_id: str = Query(...), business_id: UUID | None = Query(default=None), portfolio_id: UUID | None = Query(default=None)):
    try:
        eid, bid, _ctx = _resolve_context(request, env_id, business_id)
        return cd.list_policies(env_id=eid, business_id=bid, portfolio_id=portfolio_id)
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="credit_v2.policies.list_failed")


@router.post("/policies")
def create_policy(req: PolicyCreateRequest, request: Request):
    try:
        eid, bid, _ctx = _resolve_context(request, req.env_id, req.business_id)
        return cd.create_policy(env_id=eid, business_id=bid, payload=req.model_dump(exclude={"env_id", "business_id"}))
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="credit_v2.policies.create_failed")


@router.get("/policies/{policy_id}")
def get_policy(policy_id: UUID, request: Request, env_id: str = Query(...), business_id: UUID | None = Query(default=None)):
    try:
        eid, bid, _ctx = _resolve_context(request, env_id, business_id)
        return cd.get_policy(env_id=eid, business_id=bid, policy_id=policy_id)
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="credit_v2.policies.get_failed")


@router.patch("/policies/{policy_id}/activate")
def activate_policy(policy_id: UUID, request: Request, env_id: str = Query(...), business_id: UUID | None = Query(default=None)):
    try:
        eid, bid, _ctx = _resolve_context(request, env_id, business_id)
        return cd.activate_policy(env_id=eid, business_id=bid, policy_id=policy_id)
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="credit_v2.policies.activate_failed")


# ── Evaluate / Decisions ──────────────────────────────────────────

@router.post("/evaluate")
def evaluate_loan(req: EvaluateLoanRequest, request: Request):
    try:
        eid, bid, _ctx = _resolve_context(request, req.env_id, req.business_id)
        # Load borrower attributes from the loan's borrower
        loan = cd.get_loan(env_id=eid, business_id=bid, loan_id=req.loan_id)
        borrower_attrs = {
            "fico_at_origination": loan.get("fico_at_origination"),
            "dti_at_origination": float(loan["dti_at_origination"]) if loan.get("dti_at_origination") else None,
            "income_verified": loan.get("income_verified"),
            "annual_income": float(loan["annual_income"]) if loan.get("annual_income") else None,
            "ltv_at_origination": float(loan["ltv_at_origination"]) if loan.get("ltv_at_origination") else None,
        }
        # Resolve policy_id: use provided or find active policy for portfolio
        policy_id = req.policy_id
        if not policy_id:
            policies = cd.list_policies(env_id=eid, business_id=bid, portfolio_id=loan["portfolio_id"])
            active = [p for p in policies if p.get("is_active")]
            if not active:
                raise LookupError("No active policy found for this portfolio")
            policy_id = active[0]["policy_id"]
        return cd.evaluate_loan(
            env_id=eid, business_id=bid,
            loan_id=req.loan_id, policy_id=policy_id,
            borrower_attributes=borrower_attrs,
            operator_id=req.operator_id,
        )
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="credit_v2.evaluate.failed")


@router.get("/decisions")
def list_decisions(request: Request, env_id: str = Query(...), business_id: UUID | None = Query(default=None)):
    try:
        eid, bid, _ctx = _resolve_context(request, env_id, business_id)
        return cd.list_decision_logs(env_id=eid, business_id=bid)
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="credit_v2.decisions.list_failed")


@router.get("/decisions/{decision_log_id}")
def get_decision(decision_log_id: UUID, request: Request, env_id: str = Query(...), business_id: UUID | None = Query(default=None)):
    try:
        eid, bid, _ctx = _resolve_context(request, env_id, business_id)
        return cd.get_decision_log(env_id=eid, business_id=bid, decision_log_id=decision_log_id)
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="credit_v2.decisions.get_failed")


# ── Exceptions ────────────────────────────────────────────────────

@router.get("/exceptions")
def list_exceptions(request: Request, env_id: str = Query(...), business_id: UUID | None = Query(default=None), status: str | None = Query(default=None)):
    try:
        eid, bid, _ctx = _resolve_context(request, env_id, business_id)
        return cd.list_exception_queue(env_id=eid, business_id=bid, status=status)
    except Exception as exc:
        st, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=st, code=code, detail=str(exc), action="credit_v2.exceptions.list_failed")


@router.get("/exceptions/{exception_id}")
def get_exception(exception_id: UUID, request: Request, env_id: str = Query(...), business_id: UUID | None = Query(default=None)):
    try:
        eid, bid, _ctx = _resolve_context(request, env_id, business_id)
        return cd.get_exception(env_id=eid, business_id=bid, exception_id=exception_id)
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="credit_v2.exceptions.get_failed")


@router.patch("/exceptions/{exception_id}/resolve")
def resolve_exception(exception_id: UUID, req: ExceptionResolveRequest, request: Request, env_id: str = Query(...), business_id: UUID | None = Query(default=None)):
    try:
        eid, bid, _ctx = _resolve_context(request, env_id, business_id)
        return cd.resolve_exception(
            env_id=eid, business_id=bid, exception_id=exception_id,
            resolution=req.resolution, resolution_note=req.resolution_note,
            assigned_to=req.assigned_to,
            resolution_citation_json=req.resolution_citation_json,
        )
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="credit_v2.exceptions.resolve_failed")


# ── Corpus ────────────────────────────────────────────────────────

@router.get("/corpus")
def list_corpus(request: Request, env_id: str = Query(...), business_id: UUID | None = Query(default=None)):
    try:
        eid, bid, _ctx = _resolve_context(request, env_id, business_id)
        return cd.list_corpus_documents(env_id=eid, business_id=bid)
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="credit_v2.corpus.list_failed")


@router.post("/corpus")
def ingest_corpus_document(req: CorpusDocumentCreateRequest, request: Request):
    try:
        eid, bid, _ctx = _resolve_context(request, req.env_id, req.business_id)
        passages = [p.model_dump() for p in req.passages]
        return cd.ingest_document(
            env_id=eid, business_id=bid,
            document_ref=req.document_ref, title=req.title,
            document_type=req.document_type,
            passages=passages,
            effective_from=str(req.effective_from) if req.effective_from else None,
            created_by=req.created_by,
        )
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="credit_v2.corpus.ingest_failed")


@router.get("/corpus/{document_id}/passages")
def list_passages(document_id: UUID, request: Request):
    try:
        return cd.list_corpus_passages(document_id=document_id)
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="credit_v2.corpus.passages_failed")


@router.get("/corpus/search")
def search_corpus(request: Request, query: str = Query(...), env_id: str = Query(...), business_id: UUID | None = Query(default=None), document_type: str | None = Query(default=None)):
    try:
        eid, bid, _ctx = _resolve_context(request, env_id, business_id)
        return cd.search_corpus(env_id=eid, business_id=bid, query=query, document_type=document_type)
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="credit_v2.corpus.search_failed")


# ── Audit ─────────────────────────────────────────────────────────

@router.get("/audit")
def list_audit(request: Request, env_id: str = Query(...), business_id: UUID | None = Query(default=None)):
    try:
        eid, bid, _ctx = _resolve_context(request, env_id, business_id)
        return cd.list_audit_records(env_id=eid, business_id=bid)
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="credit_v2.audit.list_failed")


# ── Scenarios ─────────────────────────────────────────────────────

@router.post("/scenarios")
def create_scenario(req: ScenarioCreateRequest, request: Request):
    try:
        eid, bid, _ctx = _resolve_context(request, req.env_id, req.business_id)
        return cd.create_scenario(env_id=eid, business_id=bid, payload=req.model_dump(exclude={"env_id", "business_id"}))
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="credit_v2.scenarios.create_failed")


@router.get("/portfolios/{portfolio_id}/scenarios")
def list_scenarios(portfolio_id: UUID, request: Request, env_id: str = Query(...), business_id: UUID | None = Query(default=None)):
    try:
        eid, bid, _ctx = _resolve_context(request, env_id, business_id)
        return cd.list_scenarios(env_id=eid, business_id=bid, portfolio_id=portfolio_id)
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="credit_v2.scenarios.list_failed")


# ── Snapshot ──────────────────────────────────────────────────────

@router.get("/snapshot")
def get_snapshot(request: Request, env_id: str = Query(...), business_id: UUID | None = Query(default=None)):
    try:
        eid, bid, _ctx = _resolve_context(request, env_id, business_id)
        return cd.get_environment_snapshot(env_id=eid, business_id=bid)
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="credit_v2.snapshot.failed")


# ── Seed ──────────────────────────────────────────────────────────

@router.post("/seed")
def seed_workspace(req: CreditSeedRequest, request: Request):
    try:
        eid, bid, _ctx = _resolve_context(request, req.env_id, req.business_id)
        return {"ok": True, **cd.seed_credit_demo(env_id=eid, business_id=bid)}
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="credit_v2.seed.failed")
