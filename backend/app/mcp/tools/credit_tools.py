"""Credit decisioning MCP tools — exposes portfolio/loan/decisioning queries to the AI Gateway."""
from __future__ import annotations

from uuid import UUID

from app.mcp.auth import McpContext
from app.mcp.registry import AuditPolicy, ToolDef, registry
from app.mcp.schemas.credit_tools import (
    CreateLoanInput,
    CreatePolicyInput,
    CreatePortfolioInput,
    EvaluateLoanInput,
    GetDecisionInput,
    GetEnvironmentSnapshotInput,
    GetExceptionInput,
    GetLoanInput,
    GetPortfolioInput,
    IngestDocumentInput,
    ListAuditRecordsInput,
    ListDecisionsInput,
    ListExceptionsInput,
    ListLoansInput,
    ListPoliciesInput,
    ListPortfoliosInput,
    ResolveExceptionInput,
    SearchCorpusInput,
)
from app.mcp.tools.repe_tools import (
    _confirmation_summary,
    _require_uuid,
    _scope_entity_id,
    _scope_entity_type,
    _scope_value,
    _serialize,
    _uuid_or_none,
)
from app.services import credit_decisioning as cd


# ── Resolvers ─────────────────────────────────────────────────────

def _resolve_business_id(inp, ctx: McpContext) -> UUID:
    return _require_uuid(_scope_value(inp, ctx, "business_id"), "business_id")


def _resolve_environment_id(inp, ctx: McpContext) -> UUID:
    return _require_uuid(_scope_value(inp, ctx, "environment_id"), "environment_id")


def _resolve_portfolio_id(inp, ctx: McpContext) -> UUID:
    pid = _scope_value(inp, ctx, "portfolio_id")
    if pid is not None:
        return _require_uuid(pid, "portfolio_id")
    if _scope_entity_type(inp, ctx) == "portfolio":
        return _require_uuid(_scope_entity_id(inp, ctx), "portfolio_id")
    raise ValueError("portfolio_id is required")


def _resolve_loan_id(inp, ctx: McpContext) -> UUID:
    lid = _scope_value(inp, ctx, "loan_id")
    if lid is not None:
        return _require_uuid(lid, "loan_id")
    if _scope_entity_type(inp, ctx) == "loan":
        return _require_uuid(_scope_entity_id(inp, ctx), "loan_id")
    raise ValueError("loan_id is required")


# ── Read Handlers ─────────────────────────────────────────────────

def _list_portfolios(ctx: McpContext, inp: ListPortfoliosInput) -> dict:
    env_id = _resolve_environment_id(inp, ctx)
    bid = _resolve_business_id(inp, ctx)
    portfolios = cd.list_portfolios(env_id=env_id, business_id=bid)
    return {"portfolios": _serialize(portfolios), "total": len(portfolios)}


def _get_portfolio(ctx: McpContext, inp: GetPortfolioInput) -> dict:
    env_id = _resolve_environment_id(inp, ctx)
    bid = _resolve_business_id(inp, ctx)
    pid = _resolve_portfolio_id(inp, ctx)
    portfolio = cd.get_portfolio(env_id=env_id, business_id=bid, portfolio_id=pid)
    return {"portfolio": _serialize(portfolio)}


def _list_loans(ctx: McpContext, inp: ListLoansInput) -> dict:
    env_id = _resolve_environment_id(inp, ctx)
    bid = _resolve_business_id(inp, ctx)
    pid = _resolve_portfolio_id(inp, ctx)
    loans = cd.list_loans(env_id=env_id, business_id=bid, portfolio_id=pid, status=inp.status)
    return {"loans": _serialize(loans), "total": len(loans)}


def _get_loan(ctx: McpContext, inp: GetLoanInput) -> dict:
    env_id = _resolve_environment_id(inp, ctx)
    bid = _resolve_business_id(inp, ctx)
    lid = _resolve_loan_id(inp, ctx)
    loan = cd.get_loan(env_id=env_id, business_id=bid, loan_id=lid)
    return {"loan": _serialize(loan)}


def _list_decisions(ctx: McpContext, inp: ListDecisionsInput) -> dict:
    env_id = _resolve_environment_id(inp, ctx)
    bid = _resolve_business_id(inp, ctx)
    decisions = cd.list_decision_logs(env_id=env_id, business_id=bid)
    return {"decisions": _serialize(decisions), "total": len(decisions)}


def _get_decision(ctx: McpContext, inp: GetDecisionInput) -> dict:
    env_id = _resolve_environment_id(inp, ctx)
    bid = _resolve_business_id(inp, ctx)
    decision = cd.get_decision_log(env_id=env_id, business_id=bid, decision_log_id=inp.decision_log_id)
    return {"decision": _serialize(decision)}


def _list_exceptions(ctx: McpContext, inp: ListExceptionsInput) -> dict:
    env_id = _resolve_environment_id(inp, ctx)
    bid = _resolve_business_id(inp, ctx)
    exceptions = cd.list_exception_queue(env_id=env_id, business_id=bid, status=inp.status)
    return {"exceptions": _serialize(exceptions), "total": len(exceptions)}


def _get_exception(ctx: McpContext, inp: GetExceptionInput) -> dict:
    env_id = _resolve_environment_id(inp, ctx)
    bid = _resolve_business_id(inp, ctx)
    exc = cd.get_exception(env_id=env_id, business_id=bid, exception_id=inp.exception_id)
    return {"exception": _serialize(exc)}


def _list_policies(ctx: McpContext, inp: ListPoliciesInput) -> dict:
    env_id = _resolve_environment_id(inp, ctx)
    bid = _resolve_business_id(inp, ctx)
    pid = _uuid_or_none(getattr(inp, "portfolio_id", None))
    policies = cd.list_policies(env_id=env_id, business_id=bid, portfolio_id=pid)
    return {"policies": _serialize(policies), "total": len(policies)}


def _search_corpus(ctx: McpContext, inp: SearchCorpusInput) -> dict:
    env_id = _resolve_environment_id(inp, ctx)
    bid = _resolve_business_id(inp, ctx)
    results = cd.search_corpus(env_id=env_id, business_id=bid, query=inp.query, document_type=inp.document_type)
    return {"results": _serialize(results), "total": len(results)}


def _list_audit_records(ctx: McpContext, inp: ListAuditRecordsInput) -> dict:
    env_id = _resolve_environment_id(inp, ctx)
    bid = _resolve_business_id(inp, ctx)
    records = cd.list_audit_records(env_id=env_id, business_id=bid)
    return {"records": _serialize(records), "total": len(records)}


def _get_environment_snapshot(ctx: McpContext, inp: GetEnvironmentSnapshotInput) -> dict:
    env_id = _resolve_environment_id(inp, ctx)
    bid = _resolve_business_id(inp, ctx)
    return cd.get_environment_snapshot(env_id=env_id, business_id=bid)


# ── Write Handlers ────────────────────────────────────────────────

def _create_portfolio(ctx: McpContext, inp: CreatePortfolioInput) -> dict:
    provided = {k: v for k, v in {
        "name": inp.name,
        "product_type": inp.product_type,
        "origination_channel": inp.origination_channel,
        "servicer": inp.servicer,
        "vintage_quarter": inp.vintage_quarter,
        "target_fico_min": inp.target_fico_min,
        "target_fico_max": inp.target_fico_max,
        "target_dti_max": inp.target_dti_max,
        "target_ltv_max": inp.target_ltv_max,
    }.items() if v is not None}
    missing = [f for f in ("name",) if provided.get(f) is None]
    if missing and not inp.confirmed:
        return {
            "pending_confirmation": True,
            "needs_input": True,
            "missing_fields": missing,
            "provided": provided,
            "message": "Missing required field: portfolio name.",
        }
    if not inp.confirmed:
        return _confirmation_summary("create portfolio", provided)
    if not inp.name:
        raise ValueError("Portfolio name is required")
    env_id = _resolve_environment_id(inp, ctx)
    bid = _resolve_business_id(inp, ctx)
    portfolio = cd.create_portfolio(env_id=env_id, business_id=bid, payload=provided)
    return {"portfolio": _serialize(portfolio), "created": True}


def _create_loan(ctx: McpContext, inp: CreateLoanInput) -> dict:
    provided = {k: v for k, v in {
        "portfolio_id": str(inp.portfolio_id) if inp.portfolio_id else None,
        "borrower_id": str(inp.borrower_id) if inp.borrower_id else None,
        "loan_ref": inp.loan_ref,
        "original_balance": inp.original_balance,
        "interest_rate": inp.interest_rate,
        "term_months": inp.term_months,
        "collateral_type": inp.collateral_type,
        "collateral_value": inp.collateral_value,
    }.items() if v is not None}
    missing = [f for f in ("portfolio_id", "borrower_id", "loan_ref") if provided.get(f) is None]
    if missing and not inp.confirmed:
        return {
            "pending_confirmation": True,
            "needs_input": True,
            "missing_fields": missing,
            "provided": provided,
            "message": f"Missing required fields: {', '.join(missing)}.",
        }
    if not inp.confirmed:
        return _confirmation_summary("create loan", provided)
    if not inp.loan_ref or not inp.portfolio_id or not inp.borrower_id:
        raise ValueError("portfolio_id, borrower_id, and loan_ref are required")
    env_id = _resolve_environment_id(inp, ctx)
    bid = _resolve_business_id(inp, ctx)
    loan = cd.create_loan(env_id=env_id, business_id=bid, payload={
        "portfolio_id": inp.portfolio_id,
        "borrower_id": inp.borrower_id,
        "loan_ref": inp.loan_ref,
        "original_balance": inp.original_balance or 0,
        "interest_rate": inp.interest_rate,
        "term_months": inp.term_months,
        "collateral_type": inp.collateral_type,
        "collateral_value": inp.collateral_value,
    })
    return {"loan": _serialize(loan), "created": True}


def _evaluate_loan(ctx: McpContext, inp: EvaluateLoanInput) -> dict:
    provided = {
        "loan_id": str(inp.loan_id) if inp.loan_id else None,
        "policy_id": str(inp.policy_id) if inp.policy_id else None,
    }
    if not inp.loan_id and not inp.confirmed:
        return {
            "pending_confirmation": True,
            "needs_input": True,
            "missing_fields": ["loan_id"],
            "message": "loan_id is required to evaluate.",
        }
    if not inp.confirmed:
        return _confirmation_summary("evaluate loan", {k: v for k, v in provided.items() if v})
    if not inp.loan_id:
        raise ValueError("loan_id is required")
    env_id = _resolve_environment_id(inp, ctx)
    bid = _resolve_business_id(inp, ctx)

    # Load borrower attributes from loan
    loan = cd.get_loan(env_id=env_id, business_id=bid, loan_id=inp.loan_id)
    borrower_attrs = {
        "fico_at_origination": loan.get("fico_at_origination"),
        "dti_at_origination": float(loan["dti_at_origination"]) if loan.get("dti_at_origination") else None,
        "income_verified": loan.get("income_verified"),
        "annual_income": float(loan["annual_income"]) if loan.get("annual_income") else None,
        "ltv_at_origination": float(loan["ltv_at_origination"]) if loan.get("ltv_at_origination") else None,
    }

    # Resolve policy
    policy_id = inp.policy_id
    if not policy_id:
        policies = cd.list_policies(env_id=env_id, business_id=bid, portfolio_id=loan["portfolio_id"])
        active = [p for p in policies if p.get("is_active")]
        if not active:
            raise LookupError("No active policy found for this portfolio")
        policy_id = active[0]["policy_id"]

    result = cd.evaluate_loan(
        env_id=env_id, business_id=bid,
        loan_id=inp.loan_id, policy_id=policy_id,
        borrower_attributes=borrower_attrs,
        operator_id=inp.operator_id,
    )
    return _serialize(result)


def _resolve_exception(ctx: McpContext, inp: ResolveExceptionInput) -> dict:
    provided = {
        "exception_id": str(inp.exception_id) if inp.exception_id else None,
        "resolution": inp.resolution,
        "resolution_note": inp.resolution_note,
    }
    missing = [f for f in ("exception_id", "resolution") if not provided.get(f)]
    if missing and not inp.confirmed:
        return {
            "pending_confirmation": True,
            "needs_input": True,
            "missing_fields": missing,
            "message": f"Missing required fields: {', '.join(missing)}.",
        }
    if not inp.confirmed:
        return _confirmation_summary("resolve exception", {k: v for k, v in provided.items() if v})
    if not inp.exception_id or not inp.resolution:
        raise ValueError("exception_id and resolution are required")
    env_id = _resolve_environment_id(inp, ctx)
    bid = _resolve_business_id(inp, ctx)
    result = cd.resolve_exception(
        env_id=env_id, business_id=bid,
        exception_id=inp.exception_id,
        resolution=inp.resolution,
        resolution_note=inp.resolution_note,
        assigned_to=inp.assigned_to,
    )
    return {"exception": _serialize(result), "resolved": True}


def _ingest_document(ctx: McpContext, inp: IngestDocumentInput) -> dict:
    provided = {
        "document_ref": inp.document_ref,
        "title": inp.title,
        "document_type": inp.document_type,
        "passage_count": len(inp.passages),
    }
    missing = [f for f in ("document_ref", "title") if not provided.get(f)]
    if missing and not inp.confirmed:
        return {
            "pending_confirmation": True,
            "needs_input": True,
            "missing_fields": missing,
            "message": f"Missing required fields: {', '.join(missing)}.",
        }
    if not inp.confirmed:
        return _confirmation_summary("ingest document", {k: v for k, v in provided.items() if v})
    if not inp.document_ref or not inp.title:
        raise ValueError("document_ref and title are required")
    env_id = _resolve_environment_id(inp, ctx)
    bid = _resolve_business_id(inp, ctx)
    result = cd.ingest_document(
        env_id=env_id, business_id=bid,
        document_ref=inp.document_ref, title=inp.title,
        document_type=inp.document_type,
        passages=inp.passages,
        effective_from=inp.effective_from,
    )
    return _serialize(result)


def _create_policy(ctx: McpContext, inp: CreatePolicyInput) -> dict:
    provided = {
        "name": inp.name,
        "portfolio_id": str(inp.portfolio_id) if inp.portfolio_id else None,
        "policy_type": inp.policy_type,
        "rule_count": len(inp.rules_json),
        "is_active": inp.is_active,
    }
    if not inp.name and not inp.confirmed:
        return {
            "pending_confirmation": True,
            "needs_input": True,
            "missing_fields": ["name"],
            "message": "Policy name is required.",
        }
    if not inp.confirmed:
        return _confirmation_summary("create policy", {k: v for k, v in provided.items() if v})
    if not inp.name:
        raise ValueError("Policy name is required")
    env_id = _resolve_environment_id(inp, ctx)
    bid = _resolve_business_id(inp, ctx)
    policy = cd.create_policy(env_id=env_id, business_id=bid, payload={
        "name": inp.name,
        "portfolio_id": inp.portfolio_id,
        "policy_type": inp.policy_type,
        "rules_json": inp.rules_json,
        "is_active": inp.is_active,
        "effective_from": inp.effective_from,
    })
    return {"policy": _serialize(policy), "created": True}


# ── Registration ──────────────────────────────────────────────────

def register_credit_tools() -> None:
    policy = AuditPolicy(redact_keys=[], max_input_bytes_to_log=5000, max_output_bytes_to_log=10000)

    # Read tools
    for name, desc, inp_model, handler in [
        ("credit.list_portfolios", "List portfolios for the current business with loan count and UPB rollups.", ListPortfoliosInput, _list_portfolios),
        ("credit.get_portfolio", "Get portfolio detail with KPI metrics.", GetPortfolioInput, _get_portfolio),
        ("credit.list_loans", "List loans in a portfolio. Filterable by status.", ListLoansInput, _list_loans),
        ("credit.get_loan", "Get loan detail with borrower profile, event timeline, and decision history.", GetLoanInput, _get_loan),
        ("credit.list_decisions", "List decision log entries with policy and borrower details.", ListDecisionsInput, _list_decisions),
        ("credit.get_decision", "Get decision detail with full reasoning chain, citations, and format lock output.", GetDecisionInput, _get_decision),
        ("credit.list_exceptions", "List exception queue items. Filterable by status.", ListExceptionsInput, _list_exceptions),
        ("credit.get_exception", "Get exception detail with failing rules and recommended action.", GetExceptionInput, _get_exception),
        ("credit.list_policies", "List decision policies for a portfolio.", ListPoliciesInput, _list_policies),
        ("credit.search_corpus", "Search the walled garden corpus. Returns passages with document metadata.", SearchCorpusInput, _search_corpus),
        ("credit.list_audit_records", "List audit records with reasoning steps.", ListAuditRecordsInput, _list_audit_records),
        ("credit.get_environment_snapshot", "Get credit environment overview: portfolio count, total UPB, DQ rates, exception queue depth.", GetEnvironmentSnapshotInput, _get_environment_snapshot),
    ]:
        registry.register(ToolDef(
            name=name, description=desc, module="credit",
            permission="read", input_model=inp_model,
            audit_policy=policy, handler=handler,
            tags=frozenset({"credit"}),
        ))

    # Write tools
    for name, desc, inp_model, handler in [
        ("credit.create_portfolio", "Create a credit portfolio. Two-phase (confirmed=false, then confirmed=true).", CreatePortfolioInput, _create_portfolio),
        ("credit.create_loan", "Create a loan in a portfolio. Two-phase.", CreateLoanInput, _create_loan),
        ("credit.evaluate_loan", "Run decisioning engine against active policy. Produces format-locked output.", EvaluateLoanInput, _evaluate_loan),
        ("credit.resolve_exception", "Resolve an exception queue item with citation.", ResolveExceptionInput, _resolve_exception),
        ("credit.ingest_document", "Ingest a document into the walled garden corpus.", IngestDocumentInput, _ingest_document),
        ("credit.create_policy", "Create a decision policy with rules.", CreatePolicyInput, _create_policy),
    ]:
        registry.register(ToolDef(
            name=name, description=desc, module="credit",
            permission="write", input_model=inp_model,
            audit_policy=policy, handler=handler,
            tags=frozenset({"credit", "write"}),
        ))
