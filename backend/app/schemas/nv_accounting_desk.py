"""Pydantic schemas for the Novendor Accounting Command Desk.

Shapes are designed against the design handoff in
`design_handoff_accounting_command_desk/` — data contracts match what the
frontend work-table, rail modules, bottom band, and drawer consume.

Track A models the core accounting queue/transactions/receipts/invoices.
Track B extends with subscription intake + evidence normalization so that
recurring software spend (Apple-billed Claude/OpenAI, direct API billing,
generic SaaS) is first-class rather than "yet another receipt."
"""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Queue (Needs Attention)
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


class QueueCountsOut(BaseModel):
    needs: int
    txns: int
    recs: int
    invs: int


class QueueOut(BaseModel):
    items: list[QueueItemOut]
    counts: QueueCountsOut


# ---------------------------------------------------------------------------
# Transactions, receipts, invoices
# ---------------------------------------------------------------------------


class TransactionRowOut(BaseModel):
    id: str
    date: str  # "Apr 17 · 14:12"
    account: str
    desc: str
    amount: float
    category: str | None
    match: str
    state: Literal["reconciled", "categorized", "unreviewed"]


class ReceiptRowOut(BaseModel):
    id: str
    received_at: str  # "Apr 17 · 14:12"
    vendor: str
    amount: float
    source: str
    ocr_confidence: int
    state: Literal["review", "matched", "auto-matched"]


class InvoiceRowOut(BaseModel):
    id: str
    client: str
    issued: str  # "Apr 05"
    due: str  # "May 05"
    amount: float
    paid: float
    state: Literal["paid", "overdue", "sent", "draft"]
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
# Reconciliation / intake / AR
# ---------------------------------------------------------------------------


class MatchCandidateOut(BaseModel):
    txn_id: str | None = None
    receipt_id: str | None = None
    invoice_id: str | None = None
    label: str
    amount: float
    date: str
    confidence: int
    reason: str | None = None


class UnmatchedTxnOut(BaseModel):
    txn_id: str
    desc: str
    amount: float
    date: str
    candidates: list[MatchCandidateOut] = Field(default_factory=list)


class SplitNeededTxnOut(BaseModel):
    txn_id: str
    desc: str
    amount: float
    note: str


class ReconciliationOut(BaseModel):
    unmatched: list[UnmatchedTxnOut]
    splits: list[SplitNeededTxnOut]
    unmatched_total: float
    splits_count: int


class ReceiptIntakeItemOut(BaseModel):
    id: str
    vendor: str
    amount: float
    received_rel: str  # "12m"
    source: str
    confidence: int
    flag: bool = False


class ReceiptIntakeOut(BaseModel):
    items: list[ReceiptIntakeItemOut]


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


class ToolingMonthOut(BaseModel):
    label: str
    amount: float


class TrendToolingSpendOut(BaseModel):
    months: list[ToolingMonthOut]
    mom_pct: float
    summary: str


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
    originals: list[str]
    new_txn_ids: list[str]


class RemindInvoiceRequest(BaseModel):
    channel: Literal["email", "sms"] = "email"


class RemindInvoiceResult(BaseModel):
    invoice_id: str
    channel: str
    sent_at: str


class ExpenseCreateRequest(BaseModel):
    employee: str
    vendor: str
    amount: float
    reimbursable: bool = True
    engagement_id: str | None = None
    memo: str | None = None


class ExpenseRowOut(BaseModel):
    id: str
    employee: str
    vendor: str
    date: str
    amount: float
    status: str
    reimbursable: bool
    engagement_id: str | None = None


class InvoiceCreateRequest(BaseModel):
    client: str
    issued: str
    due: str
    amount: float
    engagement_id: str | None = None


class ReceiptUploadJSONRequest(BaseModel):
    """JSON-first alternative to multipart — used by MCP ingestion."""

    filename: str
    bytes_b64: str | None = None
    vendor_hint: str | None = None
    amount_hint: float | None = None
    engagement_id: str | None = None


# ---------------------------------------------------------------------------
# Track B — subscription intake + evidence normalization
# ---------------------------------------------------------------------------

EvidenceSource = Literal["receipt", "api_invoice", "apple_iap", "provider_webhook", "card_charge"]
BillingPlatform = Literal["apple", "stripe", "direct", "ramp", "amex", "chase", "none"]
SubscriptionCadence = Literal["monthly", "annual", "usage", "unknown"]


class SubscriptionEvidenceOut(BaseModel):
    id: str
    source: EvidenceSource
    received_at: str
    raw_vendor_string: str
    amount: float
    currency: str
    billing_date: str
    provenance: str | None = None
    note: str | None = None


class VendorCandidate(BaseModel):
    name: str
    confidence: int


class ProductCandidate(BaseModel):
    name: str
    confidence: int


class SubscriptionParseResultOut(BaseModel):
    evidence_id: str
    billing_platform: BillingPlatform
    vendor_normalized: str | None
    product: str | None
    vendor_confidence: int
    product_confidence: int
    ambiguity_notes: str = ""
    requires_review: bool = False


class SubscriptionOccurrenceOut(BaseModel):
    id: str
    ledger_id: str
    evidence_id: str
    billing_date: str
    amount: float
    price_delta_pct: float | None = None
    status: Literal["confirmed", "projected", "missing"]


class SubscriptionLedgerRowOut(BaseModel):
    id: str
    vendor_normalized: str
    product: str
    billing_platform: BillingPlatform
    cadence: SubscriptionCadence
    typical_amount: float
    currency: str
    active: bool
    first_seen: str
    last_seen: str
    linked_evidence_ids: list[str]
    next_projected: str | None = None
    last_amount: float | None = None


class SubscriptionReviewItemOut(BaseModel):
    evidence_id: str
    reason: Literal[
        "unknown_vendor",
        "apple_opaque",
        "amount_shift",
        "new_product",
        "missing_support_doc",
    ]
    candidate_vendors: list[VendorCandidate]
    candidate_products: list[ProductCandidate]
    proposed_ledger_id: str | None = None


class SubscriptionReviewQueueOut(BaseModel):
    items: list[SubscriptionReviewItemOut]


class SubscriptionIngestRequest(BaseModel):
    source: EvidenceSource
    raw_vendor_string: str
    amount: float
    currency: str = "USD"
    billing_date: str
    provenance: str | None = None
    raw_payload: dict | None = None


class SubscriptionIngestResult(BaseModel):
    evidence: SubscriptionEvidenceOut
    parse_result: SubscriptionParseResultOut
    ledger_id: str | None
    review_item: SubscriptionReviewItemOut | None = None


class SubscriptionBulkIngestRequest(BaseModel):
    payloads: list[SubscriptionIngestRequest]


class SubscriptionBulkIngestResult(BaseModel):
    results: list[SubscriptionIngestResult]


class SubscriptionNormalizeRequest(BaseModel):
    evidence_id: str


class SubscriptionDetectRecurringRequest(BaseModel):
    window_days: int = 90


class SoftwareSpendSliceOut(BaseModel):
    key: str
    label: str
    amount: float
    pct: float


class SoftwareSpendOut(BaseModel):
    total: float
    by_vendor: list[SoftwareSpendSliceOut]
    by_platform: list[SoftwareSpendSliceOut]
    by_product: list[SoftwareSpendSliceOut]
    claude_total: float
    openai_total: float
    apple_billed_total: float


class SubscriptionLedgerListOut(BaseModel):
    items: list[SubscriptionLedgerRowOut]


class SubscriptionReviewResolveRequest(BaseModel):
    chosen_vendor: str
    chosen_product: str
    create_ledger: bool = True


class SubscriptionReviewResolveResult(BaseModel):
    evidence_id: str
    ledger_id: str
    resolved: bool
