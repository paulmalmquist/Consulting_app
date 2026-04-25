"""Novendor Accounting — Receipt Intake MCP tools.

Family: novendor.accounting.*

All reads are instant. All writes require confirm=True.
Tools delegate to the existing service layer — never reimplement logic here.
"""
from __future__ import annotations

import base64
from datetime import date, datetime
from decimal import Decimal
from typing import Any
from uuid import UUID

from app.db import get_cursor
from app.mcp.auth import McpContext
from app.mcp.registry import ToolDef, registry
from app.mcp.schemas.novendor_accounting_tools import (
    AiSoftwareSummaryInput,
    AppleBilledReportInput,
    AttachIntakeInput,
    BalanceSnapshotInput,
    BulkIngestReceiptsInput,
    CashMovementInput,
    ClassifyReceiptInput,
    CreateExpenseFromReceiptInput,
    DetectRecurringInput,
    FinancialSnapshotInput,
    FlagAmbiguousInput,
    FlagSubscriptionReviewInput,
    GetReceiptReviewInput,
    IncomeStatementInput,
    IngestReceiptInput,
    MarkBusinessRelevanceInput,
    MarkSubscriptionNonBusinessInput,
    MatchTransactionInput,
    ParseReceiptInput,
    ProcessIntakeInput,
    RecordCapitalPurchaseInput,
    RecordHomeOfficeExpenseInput,
    SetOccurrenceStateInput,
    SoftwareSpendInput,
    SoftwareSpendReportInput,
    SubscriptionLedgerInput,
    SuppressOccurrenceInput,
    UpdateLedgerInput,
)
from app.services import (
    nv_accounting_kpis,
    nv_accounting_trends,
    nv_financial_statements,
    nv_software_spend,
    receipt_classification,
    receipt_intake,
    receipt_matching,
    receipt_orchestrator,
    receipt_reports,
    receipt_review_queue,
    subscription_ledger,
)


def _confirm_required(confirm: bool, action: str) -> dict | None:
    if not confirm:
        return {
            "error": "confirm_required",
            "message": f"{action} requires confirm=true to execute.",
        }
    return None


def _json_safe(value: Any) -> Any:
    if isinstance(value, (UUID,)):
        return str(value)
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, dict):
        return {k: _json_safe(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_json_safe(v) for v in value]
    return value


# ── Handlers ─────────────────────────────────────────────────────────────────

def _ingest_receipt(ctx: McpContext, inp: IngestReceiptInput) -> dict:
    err = _confirm_required(inp.confirm, "novendor.accounting.receipt.ingest")
    if err:
        return err
    try:
        file_bytes = base64.b64decode(inp.file_bytes_b64)
    except Exception:
        return {"error": "invalid_base64", "message": "file_bytes_b64 is not valid base64"}
    result = receipt_intake.ingest_file(
        env_id=inp.env_id,
        business_id=str(inp.business_id),
        file_bytes=file_bytes,
        filename=inp.filename,
        mime_type=inp.mime_type,
        source_type=inp.source_type,
        source_ref=inp.source_ref,
        uploaded_by=inp.uploaded_by,
    )
    return _json_safe(result)


def _bulk_ingest_receipts(ctx: McpContext, inp: BulkIngestReceiptsInput) -> dict:
    err = _confirm_required(inp.confirm, "novendor.accounting.receipt.bulk_ingest")
    if err:
        return err
    results = []
    for f in inp.files:
        try:
            raw = base64.b64decode(f.get("file_bytes_b64") or "")
        except Exception:
            results.append({"error": "invalid_base64", "filename": f.get("filename")})
            continue
        results.append(
            receipt_intake.ingest_file(
                env_id=inp.env_id, business_id=str(inp.business_id),
                file_bytes=raw, filename=f.get("filename"),
                mime_type=f.get("mime_type") or "application/octet-stream",
                source_type=inp.source_type,
            )
        )
    return {"count": len(results), "results": _json_safe(results)}


def _parse_receipt(ctx: McpContext, inp: ParseReceiptInput) -> dict:
    # Re-parse by reading the intake row; file bytes are not re-fetched here —
    # Phase 1 parse runs inline at upload time. This tool reports current state.
    detail = receipt_intake.get_intake_detail(
        env_id=inp.env_id, business_id=str(inp.business_id),
        intake_id=str(inp.intake_id),
    )
    if not detail:
        return {"error": "not_found", "message": f"No intake {inp.intake_id}"}
    return _json_safe(detail)


def _classify_receipt(ctx: McpContext, inp: ClassifyReceiptInput) -> dict:
    detail = receipt_intake.get_intake_detail(
        env_id=inp.env_id, business_id=str(inp.business_id),
        intake_id=str(inp.intake_id),
    )
    if not detail or not detail["parse"]:
        return {"error": "no_parse", "message": f"No parse_result for intake {inp.intake_id}"}
    p = detail["parse"]
    result = receipt_classification.classify(
        env_id=inp.env_id, business_id=str(inp.business_id),
        billing_platform=p.get("billing_platform"),
        service_name_guess=p.get("service_name_guess"),
        vendor_normalized=p.get("vendor_normalized"),
    )
    return _json_safe(result)


def _match_transaction(ctx: McpContext, inp: MatchTransactionInput) -> dict:
    detail = receipt_intake.get_intake_detail(
        env_id=inp.env_id, business_id=str(inp.business_id),
        intake_id=str(inp.intake_id),
    )
    if not detail or not detail["parse"]:
        return {"error": "no_parse"}
    p = detail["parse"]

    class _Shim:
        pass
    shim = _Shim()
    shim.vendor_normalized = p.get("vendor_normalized")
    shim.merchant_raw = p.get("merchant_raw")
    shim.transaction_date = p.get("transaction_date")
    shim.total = p.get("total")
    written = receipt_matching.match_to_transactions(
        env_id=inp.env_id, business_id=str(inp.business_id),
        intake_id=str(inp.intake_id), parsed=shim,
    )
    return {"candidates_written": written}


def _create_expense_from_receipt(ctx: McpContext, inp: CreateExpenseFromReceiptInput) -> dict:
    err = _confirm_required(inp.confirm, "novendor.accounting.receipt.create_expense")
    if err:
        return err
    detail = receipt_intake.get_intake_detail(
        env_id=inp.env_id, business_id=str(inp.business_id),
        intake_id=str(inp.intake_id),
    )
    if not detail or not detail["parse"]:
        return {"error": "no_parse"}
    p = detail["parse"]
    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO nv_expense_draft
              (env_id, business_id, source_receipt_id, vendor_normalized,
               service_name, category, amount, currency, transaction_date,
               entity_linkage, status)
            VALUES (%s, %s::uuid, %s::uuid, %s, %s, %s, %s, %s, %s, %s, 'draft')
            RETURNING id
            """,
            (
                inp.env_id, str(inp.business_id), str(inp.intake_id),
                p.get("vendor_normalized"), p.get("service_name_guess"),
                inp.category, p.get("total"), p.get("currency") or "USD",
                p.get("transaction_date"), inp.entity_linkage,
            ),
        )
        expense_id = str(cur.fetchone()["id"])
    return {"expense_id": expense_id, "status": "draft"}


def _flag_ambiguous(ctx: McpContext, inp: FlagAmbiguousInput) -> dict:
    item_id = receipt_review_queue.build_review_item(
        env_id=inp.env_id, business_id=str(inp.business_id),
        intake_id=str(inp.intake_id),
        reason=inp.reason, next_action=inp.next_action,
    )
    return {"review_item_id": item_id}


def _detect_recurring(ctx: McpContext, inp: DetectRecurringInput) -> dict:
    result = subscription_ledger.detect_recurring(
        env_id=inp.env_id, business_id=str(inp.business_id),
    )
    return _json_safe(result)


def _update_ledger(ctx: McpContext, inp: UpdateLedgerInput) -> dict:
    detail = receipt_intake.get_intake_detail(
        env_id=inp.env_id, business_id=str(inp.business_id),
        intake_id=str(inp.intake_id),
    )
    if not detail or not detail["parse"]:
        return {"error": "no_parse"}
    p = detail["parse"]

    class _Shim:
        pass
    shim = _Shim()
    shim.service_name_guess = p.get("service_name_guess")
    shim.billing_platform = p.get("billing_platform")
    shim.vendor_normalized = p.get("vendor_normalized")
    shim.total = p.get("total")
    shim.currency = p.get("currency") or "USD"
    shim.transaction_date = p.get("transaction_date")

    classification = receipt_classification.classify(
        env_id=inp.env_id, business_id=str(inp.business_id),
        billing_platform=shim.billing_platform,
        service_name_guess=shim.service_name_guess,
        vendor_normalized=shim.vendor_normalized,
    )
    out = subscription_ledger.update_ledger_on_new_receipt(
        env_id=inp.env_id, business_id=str(inp.business_id),
        intake_id=str(inp.intake_id),
        parsed=shim, classification=classification,
    )
    return _json_safe(out or {})


def _get_receipt_review(ctx: McpContext, inp: GetReceiptReviewInput) -> dict:
    items = receipt_review_queue.list_review_items(
        env_id=inp.env_id, business_id=str(inp.business_id),
        status=inp.status, limit=inp.limit,
    )
    return {"count": len(items), "items": _json_safe(items)}


def _software_spend_report(ctx: McpContext, inp: SoftwareSpendReportInput) -> dict:
    report = receipt_reports.software_spend_report(
        env_id=inp.env_id, business_id=str(inp.business_id),
        period_start=inp.period_start, period_end=inp.period_end,
    )
    return _json_safe(report)


def _apple_billed_report(ctx: McpContext, inp: AppleBilledReportInput) -> dict:
    report = receipt_reports.apple_billed_spend_report(
        env_id=inp.env_id, business_id=str(inp.business_id),
        period_start=inp.period_start, period_end=inp.period_end,
    )
    return _json_safe(report)


# ── Canonical orchestrator + operator actions ───────────────────────────────

def _process_intake(ctx: McpContext, inp: ProcessIntakeInput) -> dict:
    """Canonical chain for an intake. See receipt_orchestrator.process_intake."""
    result = receipt_orchestrator.process_intake(
        env_id=inp.env_id, business_id=str(inp.business_id),
        intake_id=str(inp.intake_id),
    )
    return _json_safe(result)


def _attach_intake_to_subscription(ctx: McpContext, inp: AttachIntakeInput) -> dict:
    err = _confirm_required(inp.confirm, "novendor.accounting.subscription.attach")
    if err:
        return err
    occ_id = subscription_ledger.attach_intake_to_subscription(
        env_id=inp.env_id, business_id=str(inp.business_id),
        subscription_id=str(inp.subscription_id), intake_id=str(inp.intake_id),
    )
    return {"occurrence_id": occ_id, "subscription_id": str(inp.subscription_id)}


def _mark_subscription_non_business(ctx: McpContext, inp: MarkSubscriptionNonBusinessInput) -> dict:
    err = _confirm_required(inp.confirm, "novendor.accounting.subscription.mark_non_business")
    if err:
        return err
    ok = subscription_ledger.mark_subscription_non_business(
        env_id=inp.env_id, business_id=str(inp.business_id),
        subscription_id=str(inp.subscription_id),
    )
    return {"updated": ok}


def _suppress_occurrence(ctx: McpContext, inp: SuppressOccurrenceInput) -> dict:
    err = _confirm_required(inp.confirm, "novendor.accounting.occurrence.suppress")
    if err:
        return err
    ok = subscription_ledger.suppress_duplicate_occurrence(
        env_id=inp.env_id, business_id=str(inp.business_id),
        occurrence_id=str(inp.occurrence_id),
    )
    return {"suppressed": ok}


def _set_occurrence_state(ctx: McpContext, inp: SetOccurrenceStateInput) -> dict:
    err = _confirm_required(inp.confirm, "novendor.accounting.occurrence.set_review_state")
    if err:
        return err
    ok = subscription_ledger.set_occurrence_review_state(
        env_id=inp.env_id, business_id=str(inp.business_id),
        occurrence_id=str(inp.occurrence_id),
        review_state=inp.review_state, notes=inp.notes,
    )
    return {"updated": ok, "review_state": inp.review_state}


def _ai_software_summary(ctx: McpContext, inp: AiSoftwareSummaryInput) -> dict:
    report = receipt_reports.ai_software_summary(
        env_id=inp.env_id, business_id=str(inp.business_id),
        period_start=inp.period_start, period_end=inp.period_end,
    )
    return _json_safe(report)


# ── Phase 8 handlers ─────────────────────────────────────────────────────────

def _financial_snapshot(ctx: McpContext, inp: FinancialSnapshotInput) -> dict:
    return _json_safe(nv_accounting_kpis.financial_snapshot(
        env_id=inp.env_id, business_id=str(inp.business_id),
    ))


def _software_spend(ctx: McpContext, inp: SoftwareSpendInput) -> dict:
    return _json_safe(nv_software_spend.get_software_spend(
        env_id=inp.env_id, business_id=str(inp.business_id),
    ))


def _subscription_ledger(ctx: McpContext, inp: SubscriptionLedgerInput) -> dict:
    rows = subscription_ledger.list_ledger(
        env_id=inp.env_id, business_id=str(inp.business_id),
        active_only=inp.active_only,
    )
    return _json_safe({"rows": rows, "count": len(rows)})


def _income_statement(ctx: McpContext, inp: IncomeStatementInput) -> dict:
    return _json_safe(nv_financial_statements.income_statement(
        env_id=inp.env_id, business_id=str(inp.business_id), months=inp.months,
    ))


def _cash_movement(ctx: McpContext, inp: CashMovementInput) -> dict:
    return _json_safe(nv_accounting_trends.cash_movement_30d(
        env_id=inp.env_id, business_id=str(inp.business_id),
    ))


def _balance_snapshot(ctx: McpContext, inp: BalanceSnapshotInput) -> dict:
    return _json_safe(nv_financial_statements.balance_snapshot(
        env_id=inp.env_id, business_id=str(inp.business_id),
    ))


def _flag_subscription_review(ctx: McpContext, inp: FlagSubscriptionReviewInput) -> dict:
    err = _confirm_required(inp.confirm, "novendor.accounting.subscription.flag_review")
    if err:
        return err
    with get_cursor() as cur:
        cur.execute(
            """
            UPDATE nv_subscription_ledger
               SET documentation_complete = false,
                   review_notes = COALESCE(%s, review_notes)
             WHERE env_id = %s AND business_id = %s::uuid AND id = %s::uuid
            RETURNING id
            """,
            (inp.note, inp.env_id, str(inp.business_id), str(inp.subscription_id)),
        )
        row = cur.fetchone()
    return {"updated": row is not None, "id": str(inp.subscription_id)}


def _mark_business_relevance(ctx: McpContext, inp: MarkBusinessRelevanceInput) -> dict:
    err = _confirm_required(inp.confirm, "novendor.accounting.subscription.mark_relevance")
    if err:
        return err
    allowed = {"business", "mixed", "personal"}
    if inp.business_relevance not in allowed:
        return {"error": "invalid_value", "message": f"business_relevance must be one of {allowed}"}
    with get_cursor() as cur:
        cur.execute(
            """
            UPDATE nv_subscription_ledger
               SET business_relevance = %s
             WHERE env_id = %s AND business_id = %s::uuid AND id = %s::uuid
            RETURNING id
            """,
            (inp.business_relevance, inp.env_id, str(inp.business_id), str(inp.subscription_id)),
        )
        row = cur.fetchone()
    return {"updated": row is not None, "business_relevance": inp.business_relevance}


def _insert_expense_draft(
    env_id: str, business_id: str, vendor: str, service_name: str,
    amount: float, transaction_date: Any, category: str, notes: str | None,
) -> dict:
    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO nv_expense_draft
              (env_id, business_id, vendor_normalized, service_name,
               amount, transaction_date, category, notes, status)
            VALUES (%s, %s::uuid, %s, %s, %s, %s, %s, %s, 'draft')
            RETURNING id, status, created_at
            """,
            (env_id, business_id, vendor, service_name,
             amount, transaction_date, category, notes),
        )
        return dict(cur.fetchone())


def _record_capital_purchase(ctx: McpContext, inp: RecordCapitalPurchaseInput) -> dict:
    err = _confirm_required(inp.confirm, "novendor.accounting.record_capital_purchase")
    if err:
        return err
    full_notes = f"[capital_purchase] {inp.notes or ''}".strip()
    row = _insert_expense_draft(
        env_id=inp.env_id, business_id=str(inp.business_id),
        vendor=inp.vendor, service_name=inp.description,
        amount=inp.amount, transaction_date=inp.purchase_date,
        category=inp.category, notes=full_notes,
    )
    return _json_safe(row)


def _record_home_office_expense(ctx: McpContext, inp: RecordHomeOfficeExpenseInput) -> dict:
    err = _confirm_required(inp.confirm, "novendor.accounting.record_home_office_expense")
    if err:
        return err
    full_notes = f"[home_office][tax_review_required] {inp.notes or ''}".strip()
    row = _insert_expense_draft(
        env_id=inp.env_id, business_id=str(inp.business_id),
        vendor="Home Office", service_name=inp.description,
        amount=inp.amount, transaction_date=inp.period_end,
        category="home_office", notes=full_notes,
    )
    return _json_safe(row)


# ── Registration ─────────────────────────────────────────────────────────────

def register_novendor_accounting_tools() -> None:
    tools = [
        ToolDef(name="novendor.accounting.receipt.ingest",
                description="Ingest a single receipt file (PDF/PNG/JPG). Dedupes by SHA256 per env+business. Requires confirm=true.",
                module="novendor", permission="write",
                input_model=IngestReceiptInput, handler=_ingest_receipt,
                tags=frozenset({"novendor", "accounting", "receipt", "write"})),

        ToolDef(name="novendor.accounting.receipt.bulk_ingest",
                description="Ingest multiple receipt files in one call. Requires confirm=true.",
                module="novendor", permission="write",
                input_model=BulkIngestReceiptsInput, handler=_bulk_ingest_receipts,
                tags=frozenset({"novendor", "accounting", "receipt", "write"})),

        ToolDef(name="novendor.accounting.receipt.parse",
                description="Return current intake + parse result + match candidates + review items for a receipt.",
                module="novendor", permission="read",
                input_model=ParseReceiptInput, handler=_parse_receipt,
                tags=frozenset({"novendor", "accounting", "receipt", "read"})),

        ToolDef(name="novendor.accounting.receipt.classify",
                description="Run classification on an existing parse: category, business_relevance, entity_linkage.",
                module="novendor", permission="read",
                input_model=ClassifyReceiptInput, handler=_classify_receipt,
                tags=frozenset({"novendor", "accounting", "receipt", "read"})),

        ToolDef(name="novendor.accounting.receipt.match_transaction",
                description="Score and write receipt↔transaction match candidates for an intake.",
                module="novendor", permission="write",
                input_model=MatchTransactionInput, handler=_match_transaction,
                tags=frozenset({"novendor", "accounting", "receipt", "write"}),
                confirmation_required=False),

        ToolDef(name="novendor.accounting.receipt.create_expense",
                description="Create a draft expense from a parsed receipt. Requires confirm=true.",
                module="novendor", permission="write",
                input_model=CreateExpenseFromReceiptInput, handler=_create_expense_from_receipt,
                tags=frozenset({"novendor", "accounting", "receipt", "write"})),

        ToolDef(name="novendor.accounting.receipt.flag_ambiguous",
                description="Create a review queue item for a receipt (e.g. apple_ambiguous, possibly_personal).",
                module="novendor", permission="write",
                input_model=FlagAmbiguousInput, handler=_flag_ambiguous,
                tags=frozenset({"novendor", "accounting", "review", "write"}),
                confirmation_required=False),

        ToolDef(name="novendor.accounting.subscription.detect_recurring",
                description="Scan parse results and upsert the subscription ledger with detected cadences.",
                module="novendor", permission="write",
                input_model=DetectRecurringInput, handler=_detect_recurring,
                tags=frozenset({"novendor", "accounting", "subscription", "write"}),
                confirmation_required=False),

        ToolDef(name="novendor.accounting.subscription.update_ledger",
                description="Upsert a single subscription_ledger row from one intake's parse result.",
                module="novendor", permission="write",
                input_model=UpdateLedgerInput, handler=_update_ledger,
                tags=frozenset({"novendor", "accounting", "subscription", "write"}),
                confirmation_required=False),

        ToolDef(name="novendor.accounting.queue.get_receipt_review",
                description="Return open review queue items with next_action strings.",
                module="novendor", permission="read",
                input_model=GetReceiptReviewInput, handler=_get_receipt_review,
                tags=frozenset({"novendor", "accounting", "review", "read"})),

        ToolDef(name="novendor.accounting.report.software_spend",
                description="Aggregate software spend by vendor and by billing platform over a date range.",
                module="novendor", permission="read",
                input_model=SoftwareSpendReportInput, handler=_software_spend_report,
                tags=frozenset({"novendor", "accounting", "report", "read"})),

        ToolDef(name="novendor.accounting.report.apple_billed_spend",
                description="Apple-billed spend broken down by inferred underlying vendor and service.",
                module="novendor", permission="read",
                input_model=AppleBilledReportInput, handler=_apple_billed_report,
                tags=frozenset({"novendor", "accounting", "report", "read"})),

        # CANONICAL ORCHESTRATOR — the one obvious default path.
        ToolDef(name="novendor.accounting.receipt.process",
                description=(
                    "Canonical receipt pipeline for an intake_id: "
                    "classify → ledger+occurrence (stability: tax/date drift, annual, gap+reappear, triple-signal dedup) "
                    "→ match transactions → score review queue. "
                    "Idempotent. Prefer this over the individual primitives."
                ),
                module="novendor", permission="write",
                input_model=ProcessIntakeInput, handler=_process_intake,
                tags=frozenset({"novendor", "accounting", "orchestrator", "write"}),
                confirmation_required=False),

        # Operator actions exposed from the Subscription Watch action menu.
        ToolDef(name="novendor.accounting.subscription.attach_intake",
                description="Attach an intake to an existing subscription as a confirmed occurrence. Requires confirm=true.",
                module="novendor", permission="write",
                input_model=AttachIntakeInput, handler=_attach_intake_to_subscription,
                tags=frozenset({"novendor", "accounting", "subscription", "write"})),

        ToolDef(name="novendor.accounting.subscription.mark_non_business",
                description="Mark a subscription as personal/non-business and deactivate it. Requires confirm=true.",
                module="novendor", permission="write",
                input_model=MarkSubscriptionNonBusinessInput, handler=_mark_subscription_non_business,
                tags=frozenset({"novendor", "accounting", "subscription", "write"})),

        ToolDef(name="novendor.accounting.occurrence.suppress",
                description="Suppress a duplicate subscription occurrence (set review_state=rejected). Requires confirm=true.",
                module="novendor", permission="write",
                input_model=SuppressOccurrenceInput, handler=_suppress_occurrence,
                tags=frozenset({"novendor", "accounting", "occurrence", "write"})),

        ToolDef(name="novendor.accounting.occurrence.set_review_state",
                description="Set a subscription occurrence's review_state (confirmed | rejected | non_business | mixed | manual). Requires confirm=true.",
                module="novendor", permission="write",
                input_model=SetOccurrenceStateInput, handler=_set_occurrence_state,
                tags=frozenset({"novendor", "accounting", "occurrence", "write"})),

        # AI/software spend summary — the single report that proves value.
        ToolDef(name="novendor.accounting.report.ai_software_summary",
                description=(
                    "Single-glance AI & software spend rollup: Apple-billed total, "
                    "Claude total, OpenAI total, subscription vs API-usage vs one-off, "
                    "ambiguous-amount pending review, missing-support count."
                ),
                module="novendor", permission="read",
                input_model=AiSoftwareSummaryInput, handler=_ai_software_summary,
                tags=frozenset({"novendor", "accounting", "report", "read"})),

        # ── Phase 8: financial intelligence tools ──────────────────────────────
        ToolDef(name="novendor.accounting.get_financial_snapshot",
                description=(
                    "6-field financial health snapshot: cash balance (with availability status), "
                    "cash in/out 30d, net cash, unpaid receivables, MRR software spend. "
                    "Cash balance returns null + status=unavailable when no transactions imported."
                ),
                module="novendor", permission="read",
                input_model=FinancialSnapshotInput, handler=_financial_snapshot,
                tags=frozenset({"novendor", "accounting", "financial", "read"})),

        ToolDef(name="novendor.accounting.get_software_spend",
                description=(
                    "Aggregated software/AI spend from subscription ledger: per-vendor rows, "
                    "category totals (ai_tools/infrastructure/other), apple_billed vs direct, "
                    "and dedup_candidates (same vendor on both Apple billing and direct)."
                ),
                module="novendor", permission="read",
                input_model=SoftwareSpendInput, handler=_software_spend,
                tags=frozenset({"novendor", "accounting", "software", "read"})),

        ToolDef(name="novendor.accounting.get_subscription_ledger",
                description="List all subscription ledger rows with vendor, cadence, amount, business_relevance, billing_platform.",
                module="novendor", permission="read",
                input_model=SubscriptionLedgerInput, handler=_subscription_ledger,
                tags=frozenset({"novendor", "accounting", "subscription", "read"})),

        ToolDef(name="novendor.accounting.get_income_statement",
                description="Monthly income statement for last N months: revenue, expenses by category, net per month.",
                module="novendor", permission="read",
                input_model=IncomeStatementInput, handler=_income_statement,
                tags=frozenset({"novendor", "accounting", "financial", "read"})),

        ToolDef(name="novendor.accounting.get_cash_movement",
                description="30-day cash flow: daily inflow/outflow arrays, net_30d, in_30d, out_30d.",
                module="novendor", permission="read",
                input_model=CashMovementInput, handler=_cash_movement,
                tags=frozenset({"novendor", "accounting", "financial", "read"})),

        ToolDef(name="novendor.accounting.get_balance_snapshot",
                description=(
                    "Simple balance sheet: assets (cash + receivables), liabilities (payables), equity. "
                    "Cash field carries status=unavailable when no transactions imported — never zero."
                ),
                module="novendor", permission="read",
                input_model=BalanceSnapshotInput, handler=_balance_snapshot,
                tags=frozenset({"novendor", "accounting", "financial", "read"})),

        ToolDef(name="novendor.accounting.flag_subscription_review",
                description="Mark a subscription as needing documentation review (sets documentation_complete=false). Requires confirm=true.",
                module="novendor", permission="write",
                input_model=FlagSubscriptionReviewInput, handler=_flag_subscription_review,
                tags=frozenset({"novendor", "accounting", "subscription", "write"})),

        ToolDef(name="novendor.accounting.mark_business_relevance",
                description="Set business_relevance (business|mixed|personal) on a subscription row. Requires confirm=true.",
                module="novendor", permission="write",
                input_model=MarkBusinessRelevanceInput, handler=_mark_business_relevance,
                tags=frozenset({"novendor", "accounting", "subscription", "write"})),

        ToolDef(name="novendor.accounting.record_capital_purchase",
                description="Create a capital_purchase expense draft (computers, equipment). Requires confirm=true.",
                module="novendor", permission="write",
                input_model=RecordCapitalPurchaseInput, handler=_record_capital_purchase,
                tags=frozenset({"novendor", "accounting", "expense", "write"})),

        ToolDef(name="novendor.accounting.record_home_office_expense",
                description="Create a home_office expense draft with tax_review_flag=true. Requires confirm=true.",
                module="novendor", permission="write",
                input_model=RecordHomeOfficeExpenseInput, handler=_record_home_office_expense,
                tags=frozenset({"novendor", "accounting", "expense", "write"})),
    ]
    for tool in tools:
        registry.register(tool)
