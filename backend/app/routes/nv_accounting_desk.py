"""Accounting Command Desk — aggregation and write endpoints.

Mounted under the same `/api/nv/accounting` prefix as `nv_receipt_intake`,
but covers the unified queue, transactions, invoices, KPIs, AR aging, and
bottom-band trends.

Read endpoints can be called from the frontend via `bosFetch<T>`; write
endpoints dispatch to the underlying services (receipt_review_queue,
nv_invoices, nv_bank_transactions, nv_expense_draft).
"""
from __future__ import annotations

from datetime import date
from uuid import UUID

from fastapi import APIRouter, Query, Request

from app.routes.domain_common import classify_domain_error, domain_error_response
from app.schemas.nv_accounting_desk import (
    ARAgingOut,
    InvoiceCreateRequest,
    InvoiceRowOut,
    KPIBarOut,
    QueueActionRequest,
    QueueActionResult,
    QueueOut,
    MatchTransactionRequest,
    RemindInvoiceRequest,
    RemindInvoiceResult,
    SplitTransactionRequest,
    SplitTransactionResult,
    TransactionRowOut,
    TrendCashMovementOut,
    TrendExpenseCategoryOut,
)
from app.services import (
    env_context,
    nv_accounting_kpis,
    nv_accounting_queue,
    nv_accounting_trends,
    nv_ar_aging,
    nv_bank_transactions,
    nv_invoices,
    receipt_review_queue,
)


router = APIRouter(prefix="/api/nv/accounting", tags=["nv-accounting-desk"])


def _resolve(request: Request, env_id: str, business_id: UUID | None) -> tuple[str, str]:
    ctx = env_context.resolve_env_business_context(
        request=request,
        env_id=env_id,
        business_id=str(business_id) if business_id else None,
        allow_create=True,
        create_slug_prefix="nv_accounting",
    )
    return ctx.env_id, ctx.business_id


# ── Read ─────────────────────────────────────────────────────────────────────


@router.get("/queue", response_model=QueueOut)
def get_queue(
    request: Request,
    env_id: str = Query(...),
    business_id: UUID | None = Query(default=None),
    unresolved: bool = Query(True),
    kpi_filter: str | None = Query(default=None),
    q: str | None = Query(default=None),
):
    try:
        env, biz = _resolve(request, env_id, business_id)
        # Lazy state sync: promote sent invoices past due to overdue before reading.
        nv_invoices.sync_overdue_state(env_id=env, business_id=biz)
        result = nv_accounting_queue.build_queue(
            env_id=env,
            business_id=biz,
            filters=nv_accounting_queue.QueueFilters(
                unresolved=unresolved, kpi_filter=kpi_filter, q=q
            ),
        )
        return QueueOut(**result)
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(
            request=request, status_code=status, code=code,
            detail=str(exc), action="nv-accounting.queue.failed",
        )


@router.get("/transactions", response_model=list[TransactionRowOut])
def get_transactions(
    request: Request,
    env_id: str = Query(...),
    business_id: UUID | None = Query(default=None),
    state: str | None = Query(default=None),
    q: str | None = Query(default=None),
):
    try:
        env, biz = _resolve(request, env_id, business_id)
        rows = nv_bank_transactions.list_transactions(
            env_id=env, business_id=biz,
            filters=nv_bank_transactions.TxnFilters(state=state, q=q),
        )
        return [TransactionRowOut(**r) for r in rows]
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(
            request=request, status_code=status, code=code,
            detail=str(exc), action="nv-accounting.transactions.list.failed",
        )


@router.get("/invoices", response_model=list[InvoiceRowOut])
def get_invoices(
    request: Request,
    env_id: str = Query(...),
    business_id: UUID | None = Query(default=None),
    state: str | None = Query(default=None),
    q: str | None = Query(default=None),
):
    try:
        env, biz = _resolve(request, env_id, business_id)
        nv_invoices.sync_overdue_state(env_id=env, business_id=biz)
        rows = nv_invoices.list_invoices(
            env_id=env, business_id=biz,
            filters=nv_invoices.InvoiceFilters(state=state, q=q),
        )
        return [InvoiceRowOut(**r) for r in rows]
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(
            request=request, status_code=status, code=code,
            detail=str(exc), action="nv-accounting.invoices.list.failed",
        )


@router.get("/kpis", response_model=KPIBarOut)
def get_kpis(
    request: Request,
    env_id: str = Query(...),
    business_id: UUID | None = Query(default=None),
):
    try:
        env, biz = _resolve(request, env_id, business_id)
        return KPIBarOut(**nv_accounting_kpis.compute_kpis(env_id=env, business_id=biz))
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(
            request=request, status_code=status, code=code,
            detail=str(exc), action="nv-accounting.kpis.failed",
        )


@router.get("/ar-aging", response_model=ARAgingOut)
def get_ar_aging(
    request: Request,
    env_id: str = Query(...),
    business_id: UUID | None = Query(default=None),
):
    try:
        env, biz = _resolve(request, env_id, business_id)
        return ARAgingOut(**nv_ar_aging.compute_ar_aging(env_id=env, business_id=biz))
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(
            request=request, status_code=status, code=code,
            detail=str(exc), action="nv-accounting.ar-aging.failed",
        )


@router.get("/trends/expense-category", response_model=TrendExpenseCategoryOut)
def get_expense_category_trend(
    request: Request,
    env_id: str = Query(...),
    business_id: UUID | None = Query(default=None),
):
    try:
        env, biz = _resolve(request, env_id, business_id)
        return TrendExpenseCategoryOut(
            **nv_accounting_trends.expense_by_category(env_id=env, business_id=biz)
        )
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(
            request=request, status_code=status, code=code,
            detail=str(exc), action="nv-accounting.trends.expense-category.failed",
        )


@router.get("/trends/cash-movement", response_model=TrendCashMovementOut)
def get_cash_movement_trend(
    request: Request,
    env_id: str = Query(...),
    business_id: UUID | None = Query(default=None),
):
    try:
        env, biz = _resolve(request, env_id, business_id)
        return TrendCashMovementOut(
            **nv_accounting_trends.cash_movement_30d(env_id=env, business_id=biz)
        )
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(
            request=request, status_code=status, code=code,
            detail=str(exc), action="nv-accounting.trends.cash-movement.failed",
        )


# ── Write ────────────────────────────────────────────────────────────────────


@router.post("/queue/{item_id}/accept", response_model=QueueActionResult)
def accept_queue_item(
    request: Request,
    item_id: str,
    body: QueueActionRequest,
    env_id: str = Query(...),
    business_id: UUID | None = Query(default=None),
):
    return _dispatch_queue_action(request, item_id, "accept", body, env_id, business_id)


@router.post("/queue/{item_id}/defer", response_model=QueueActionResult)
def defer_queue_item(
    request: Request,
    item_id: str,
    body: QueueActionRequest,
    env_id: str = Query(...),
    business_id: UUID | None = Query(default=None),
):
    return _dispatch_queue_action(request, item_id, "defer", body, env_id, business_id)


@router.post("/queue/{item_id}/reject", response_model=QueueActionResult)
def reject_queue_item(
    request: Request,
    item_id: str,
    body: QueueActionRequest,
    env_id: str = Query(...),
    business_id: UUID | None = Query(default=None),
):
    return _dispatch_queue_action(request, item_id, "reject", body, env_id, business_id)


def _dispatch_queue_action(
    request: Request,
    item_id: str,
    action: str,
    body: QueueActionRequest,
    env_id: str,
    business_id: UUID | None,
):
    try:
        env, biz = _resolve(request, env_id, business_id)
        prefix, _, raw_id = item_id.partition("-")
        if not raw_id:
            raise ValueError(f"malformed queue item id: {item_id}")
        if prefix == "RI":
            # Review item → resolve or defer in receipt_review_queue
            if action == "accept":
                ok = receipt_review_queue.resolve_review_item(
                    env_id=env, business_id=biz, item_id=raw_id, notes=body.note,
                )
                return QueueActionResult(id=item_id, removed=bool(ok), new_state="resolved")
            if action == "defer":
                ok = receipt_review_queue.defer_review_item(
                    env_id=env, business_id=biz, item_id=raw_id,
                )
                return QueueActionResult(id=item_id, removed=bool(ok), new_state="deferred")
            if action == "reject":
                ok = receipt_review_queue.resolve_review_item(
                    env_id=env, business_id=biz, item_id=raw_id,
                    notes=f"rejected: {body.note or ''}",
                )
                return QueueActionResult(id=item_id, removed=bool(ok), new_state="rejected")
        if prefix == "INV":
            # Overdue invoice → remind on accept; no-op otherwise
            if action == "accept":
                nv_invoices.remind_invoice(
                    env_id=env, business_id=biz, invoice_id=raw_id, channel="email",
                )
                return QueueActionResult(id=item_id, removed=False, new_state="reminded")
            return QueueActionResult(id=item_id, removed=False, new_state=action)
        if prefix == "T":
            # Transaction queue item → handled via /transactions/:id/match or /split
            # Accept = noop here (UI should call /match directly); reject = mark categorized with no category.
            if action == "reject":
                nv_bank_transactions.update_match(
                    env_id=env, business_id=biz, txn_id=raw_id, receipt_id=None, invoice_id=None,
                )
                # Set match_state to categorized manually (skip through dismissal)
                return QueueActionResult(id=item_id, removed=False, new_state="dismissed")
            return QueueActionResult(id=item_id, removed=False, new_state=action)
        if prefix == "EXP":
            # Expense draft → move to confirmed on accept, rejected on reject
            from app.db import get_cursor
            new_state = {"accept": "confirmed", "reject": "rejected", "defer": "draft"}.get(action, "draft")
            with get_cursor() as cur:
                cur.execute(
                    """
                    UPDATE nv_expense_draft
                       SET status = %s
                     WHERE env_id = %s AND business_id = %s::uuid AND id = %s::uuid
                    """,
                    (new_state, env, biz, raw_id),
                )
            return QueueActionResult(
                id=item_id, removed=(new_state != "draft"), new_state=new_state
            )
        raise ValueError(f"unknown queue item prefix: {prefix}")
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(
            request=request, status_code=status, code=code,
            detail=str(exc), action=f"nv-accounting.queue.{action}.failed",
        )


@router.post("/transactions/{txn_id}/match", response_model=TransactionRowOut)
def match_transaction(
    request: Request,
    txn_id: str,
    body: MatchTransactionRequest,
    env_id: str = Query(...),
    business_id: UUID | None = Query(default=None),
):
    try:
        env, biz = _resolve(request, env_id, business_id)
        result = nv_bank_transactions.update_match(
            env_id=env, business_id=biz, txn_id=txn_id,
            receipt_id=body.receipt_id, invoice_id=body.invoice_id,
        )
        if result is None:
            raise LookupError(f"transaction {txn_id} not found")
        return TransactionRowOut(**result)
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(
            request=request, status_code=status, code=code,
            detail=str(exc), action="nv-accounting.transactions.match.failed",
        )


@router.post("/transactions/{txn_id}/split", response_model=SplitTransactionResult)
def split_transaction(
    request: Request,
    txn_id: str,
    body: SplitTransactionRequest,
    env_id: str = Query(...),
    business_id: UUID | None = Query(default=None),
):
    try:
        env, biz = _resolve(request, env_id, business_id)
        rows = nv_bank_transactions.split_transaction(
            env_id=env, business_id=biz, txn_id=txn_id,
            parts=[p.model_dump() for p in body.parts],
        )
        return SplitTransactionResult(
            original_id=txn_id,
            new_txn_ids=[r["id"] for r in rows],
        )
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(
            request=request, status_code=status, code=code,
            detail=str(exc), action="nv-accounting.transactions.split.failed",
        )


@router.post("/invoices", response_model=InvoiceRowOut)
def create_invoice(
    request: Request,
    body: InvoiceCreateRequest,
    env_id: str = Query(...),
    business_id: UUID | None = Query(default=None),
):
    try:
        env, biz = _resolve(request, env_id, business_id)
        issued = date.fromisoformat(body.issued)
        due = date.fromisoformat(body.due)
        amount_cents = int(round(body.amount * 100))
        row = nv_invoices.create_invoice(
            env_id=env, business_id=biz,
            client=body.client, issued=issued, due=due,
            amount_cents=amount_cents, engagement_id=body.engagement_id,
        )
        return InvoiceRowOut(**row)
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(
            request=request, status_code=status, code=code,
            detail=str(exc), action="nv-accounting.invoices.create.failed",
        )


@router.post("/invoices/{invoice_id}/remind", response_model=RemindInvoiceResult)
def remind_invoice(
    request: Request,
    invoice_id: str,
    body: RemindInvoiceRequest,
    env_id: str = Query(...),
    business_id: UUID | None = Query(default=None),
):
    try:
        env, biz = _resolve(request, env_id, business_id)
        result = nv_invoices.remind_invoice(
            env_id=env, business_id=biz, invoice_id=invoice_id, channel=body.channel,
        )
        if result is None:
            raise LookupError(f"invoice {invoice_id} not found")
        return RemindInvoiceResult(**result)
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(
            request=request, status_code=status, code=code,
            detail=str(exc), action="nv-accounting.invoices.remind.failed",
        )
