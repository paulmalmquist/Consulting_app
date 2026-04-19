"""Pydantic schemas for the Novendor Accounting Command Desk frontend.

These are **view-layer DTOs** shaped for the frontend work-table, rail modules,
bottom band, and drawer. The underlying storage shapes live in
`nv_receipt_intake.py` (receipts/parse/subscriptions/review/expense-drafts)
and `603_nv_accounting_core.sql` (invoices, bank transactions).

Never duplicate types that already exist in `nv_receipt_intake.py` — import
from there if you need the raw shapes. This file is deliberately thin.
"""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Queue (Needs Attention) — unified across review items + txns + invoices + drafts
# ---------------------------------------------------------------------------

QueueItemType = Literal[
    "review-receipt",
    "match-receipt",
    "categorize",
    "overdue-invoice",
    "reimbursable",
]
BadgeTone = Literal[
    "live", "up", "down", "error", "warn", "manual", "stale", "tag", "route", "lime", "neutral", "info"
]


class QueueItemOut(BaseModel):
    id: str
    type: QueueItemType
    date: str  # "Apr 17"
    time: str  # "14:12" or "—"
    amount: float
    party: str
    client: str
    state: str
    state_tone: BadgeTone
    age: str
    action: str
    priority: int
    glow: bool = False
    # Cross-ref into the underlying stack for the drawer to load detail.
    source_intake_id: str | None = None
    source_review_item_id: str | None = None
    source_txn_id: str | None = None
    source_invoice_id: str | None = None
    source_expense_draft_id: str | None = None


class QueueCountsOut(BaseModel):
    needs: int
    txns: int
    recs: int
    invs: int
    subs: int


class QueueOut(BaseModel):
    items: list[QueueItemOut]
    counts: QueueCountsOut


# ---------------------------------------------------------------------------
# Transactions + invoices (from nv_bank_transaction / nv_invoice)
# ---------------------------------------------------------------------------


class TransactionRowOut(BaseModel):
    id: str
    date: str  # "Apr 17 · 14:12"
    account: str
    desc: str
    amount: float
    category: str | None = None
    match: str  # "receipt ✓" | "unmatched" | "3 likely" | "split?"
    state: Literal["reconciled", "categorized", "unreviewed", "split"]


class InvoiceRowOut(BaseModel):
    id: str
    client: str
    issued: str
    due: str
    amount: float
    paid: float
    state: Literal["paid", "overdue", "sent", "draft", "void"]
    age_label: str
    glow: bool = False


# ---------------------------------------------------------------------------
# KPIs
# ---------------------------------------------------------------------------

KPIKey = Literal["cash-in", "cash-out", "unpaid", "receipts", "unrecon", "reimburse"]


class KPITileOut(BaseModel):
    key: KPIKey
    label: str
    value: str
    delta: str | None = None
    delta_tone: Literal["up", "down", "neutral", "warn"] | None = None
    source: str | None = None
    accent: str
    sparkline: list[float] = Field(default_factory=list)
    spark_color: str | None = None


class KPIBarOut(BaseModel):
    tiles: list[KPITileOut]
    as_of: str


# ---------------------------------------------------------------------------
# AR aging (Revenue Watch rail)
# ---------------------------------------------------------------------------


class AROverdueRowOut(BaseModel):
    id: str
    client: str
    amount: float
    days: int
    glow: bool


class ARUpcomingRowOut(BaseModel):
    id: str
    client: str
    amount: float
    due: str
    days: int


class ARPaymentRowOut(BaseModel):
    id: str
    client: str
    amount: float
    paid_rel: str


class ARAgingOut(BaseModel):
    overdue: list[AROverdueRowOut]
    upcoming: list[ARUpcomingRowOut]
    payments: list[ARPaymentRowOut]
    overdue_total: float
    upcoming_total: float
    paid_30d: float


# ---------------------------------------------------------------------------
# Trends (bottom band)
# ---------------------------------------------------------------------------


class ExpenseCategorySliceOut(BaseModel):
    key: str
    label: str
    amount: float
    pct: float
    color: str


class TrendExpenseCategoryOut(BaseModel):
    slices: list[ExpenseCategorySliceOut]
    total_30d: float


class TrendCashMovementOut(BaseModel):
    inflow: list[float]
    outflow: list[float]
    net_30d: float
    in_30d: float
    out_30d: float
    axis_labels: list[str]


# ---------------------------------------------------------------------------
# Mutations
# ---------------------------------------------------------------------------


class QueueActionRequest(BaseModel):
    variant: str | None = None
    note: str | None = None


class QueueActionResult(BaseModel):
    id: str
    removed: bool
    new_state: str | None = None


class MatchTransactionRequest(BaseModel):
    receipt_id: str | None = None
    invoice_id: str | None = None
    confidence_threshold: int | None = None


class SplitPartIn(BaseModel):
    amount: float
    category: str | None = None
    memo: str | None = None


class SplitTransactionRequest(BaseModel):
    parts: list[SplitPartIn]


class SplitTransactionResult(BaseModel):
    original_id: str
    new_txn_ids: list[str]


class RemindInvoiceRequest(BaseModel):
    channel: Literal["email", "sms"] = "email"


class RemindInvoiceResult(BaseModel):
    invoice_id: str
    channel: str
    sent_at: str


class InvoiceCreateRequest(BaseModel):
    client: str
    issued: str
    due: str
    amount: float
    engagement_id: str | None = None
