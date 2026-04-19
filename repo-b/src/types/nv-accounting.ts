// Frontend types for the Novendor Accounting Command Desk.
// Shapes mirror backend/app/schemas/nv_accounting_desk.py.

export type NvBadgeTone =
  | "live" | "up" | "down" | "error" | "warn" | "manual"
  | "stale" | "tag" | "route" | "lime" | "neutral" | "info";

export type NvQueueItemType =
  | "review-receipt"
  | "match-receipt"
  | "categorize"
  | "overdue-invoice"
  | "reimbursable";

export type NvQueueItem = {
  id: string;
  type: NvQueueItemType;
  date: string;
  time: string;
  amount: number;
  party: string;
  client: string;
  state: string;
  state_tone: NvBadgeTone;
  age: string;
  action: string;
  priority: number;
  glow: boolean;
  source_intake_id: string | null;
  source_review_item_id: string | null;
  source_txn_id: string | null;
  source_invoice_id: string | null;
  source_expense_draft_id: string | null;
};

export type NvQueueCounts = {
  needs: number;
  txns: number;
  recs: number;
  invs: number;
  subs: number;
};

export type NvQueue = {
  items: NvQueueItem[];
  counts: NvQueueCounts;
};

export type NvTransactionRow = {
  id: string;
  external_id?: string;
  date: string;
  posted_at?: string | null;
  account: string;
  desc: string;
  amount: number;
  category: string | null;
  match: string;
  match_receipt_id?: string | null;
  match_invoice_id?: string | null;
  state: "reconciled" | "categorized" | "unreviewed" | "split";
};

export type NvInvoiceRow = {
  id: string;
  invoice_number?: string;
  client: string;
  engagement_id?: string | null;
  issued: string;
  due: string;
  amount: number;
  paid: number;
  state: "paid" | "overdue" | "sent" | "draft" | "void";
  age_label: string;
  glow: boolean;
};

export type NvKPIKey =
  | "cash-in" | "cash-out" | "unpaid" | "receipts" | "unrecon" | "reimburse";

export type NvKPITile = {
  key: NvKPIKey;
  label: string;
  value: string;
  delta: string | null;
  delta_tone: "up" | "down" | "neutral" | "warn" | null;
  source: string | null;
  accent: string;
  sparkline: number[];
  spark_color: string | null;
};

export type NvKPIBar = {
  tiles: NvKPITile[];
  as_of: string;
};

export type NvAROverdueRow = {
  id: string;
  invoice_number?: string;
  client: string;
  amount: number;
  days: number;
  glow: boolean;
};

export type NvARUpcomingRow = {
  id: string;
  invoice_number?: string;
  client: string;
  amount: number;
  due: string;
  days: number;
};

export type NvARPaymentRow = {
  id: string;
  invoice_number?: string;
  client: string;
  amount: number;
  paid_rel: string;
};

export type NvARAging = {
  overdue: NvAROverdueRow[];
  upcoming: NvARUpcomingRow[];
  payments: NvARPaymentRow[];
  overdue_total: number;
  upcoming_total: number;
  paid_30d: number;
};

export type NvExpenseCategorySlice = {
  key: string;
  label: string;
  amount: number;
  pct: number;
  color: string;
};

export type NvExpenseCategoryTrend = {
  slices: NvExpenseCategorySlice[];
  total_30d: number;
};

export type NvCashMovementTrend = {
  inflow: number[];
  outflow: number[];
  net_30d: number;
  in_30d: number;
  out_30d: number;
  axis_labels: string[];
};

// From the existing receipt-intake stack (not defined in types yet; shape follows
// nv_receipt_intake.py schemas — kept minimal here for the Command Desk UI).
export type NvReceiptIntakeRow = {
  id: string;
  source_type: string;
  ingest_status: string;
  filename: string | null;
  created_at: string;
  file_hash?: string;
  merchant_raw?: string | null;
  billing_platform?: string | null;
  vendor_normalized?: string | null;
  service_name_guess?: string | null;
  total?: number | null;
  currency?: string | null;
  transaction_date?: string | null;
  confidence_overall?: number | null;
};

export type NvReceiptIntakeList = {
  count: number;
  rows: NvReceiptIntakeRow[];
};

export type NvSubscriptionRow = {
  id: string;
  vendor_normalized: string | null;
  service_name: string;
  billing_platform: string | null;
  cadence: "monthly" | "quarterly" | "annual" | "unknown";
  expected_amount: number | null;
  currency: string | null;
  category: string | null;
  business_relevance: string | null;
  last_seen_date: string | null;
  next_expected_date: string | null;
  documentation_complete: boolean;
  is_active: boolean;
  spend_type?: string | null;
  occurrence_count?: number | null;
  last_price_delta_pct?: number | null;
};

export type NvSubscriptionLedgerList = {
  count: number;
  rows: NvSubscriptionRow[];
};

export type NvReviewItem = {
  id: string;
  intake_id: string;
  reason: string;
  next_action: string;
  status: string;
  created_at: string;
  merchant_raw?: string | null;
  vendor_normalized?: string | null;
  service_name_guess?: string | null;
  total?: number | null;
  currency?: string | null;
  confidence_overall?: number | null;
};

export type NvReviewQueueList = {
  count: number;
  items: NvReviewItem[];
};

export type NvAISoftwareSummary = {
  apple_billed_total: number;
  claude_total: number;
  openai_total: number;
  by_spend_type: { spend_type: string; total_spend: number }[];
  by_vendor: { vendor: string; total_spend: number }[];
  ambiguous_pending_review_usd: number;
  missing_support_count: number;
};
