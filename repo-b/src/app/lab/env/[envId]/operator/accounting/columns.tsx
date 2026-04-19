"use client";

import { Badge, fmtUSD } from "@/components/operator/command-desk";
import type { WorkTableColumn } from "@/components/operator/command-desk";
import type {
  NvQueueItem,
  NvTransactionRow,
  NvReceiptIntakeRow,
  NvInvoiceRow,
  NvSubscriptionRow,
} from "@/types/nv-accounting";

const TYPE_META: Record<
  string,
  { label: string; color: string; mark: string }
> = {
  "review-receipt":  { label: "REVIEW RECEIPT",  color: "var(--neon-cyan)",    mark: "◉" },
  "match-receipt":   { label: "MATCH TO TXN",    color: "var(--neon-amber)",   mark: "⇋" },
  "categorize":      { label: "CATEGORIZE",      color: "var(--neon-amber)",   mark: "⊕" },
  "overdue-invoice": { label: "OVERDUE INVOICE", color: "var(--sem-error)",    mark: "!" },
  "reimbursable":    { label: "REIMBURSABLE",    color: "var(--neon-violet)",  mark: "◐" },
};

export const needsColumns: WorkTableColumn<NvQueueItem>[] = [
  {
    key: "glyph",
    header: "",
    width: "22px",
    render: (row) => {
      const m = TYPE_META[row.type];
      return (
        <span
          style={{
            color: m?.color ?? "var(--fg-2)",
            fontSize: 13,
            textShadow: row.glow ? "0 0 8px rgba(255,31,61,.6)" : "none",
          }}
        >
          {m?.mark ?? "•"}
        </span>
      );
    },
  },
  {
    key: "type",
    header: "TYPE",
    width: "130px",
    render: (row) => {
      const m = TYPE_META[row.type];
      return (
        <span
          style={{
            color: m?.color ?? "var(--fg-2)",
            letterSpacing: ".08em",
            fontSize: 10,
            textTransform: "uppercase",
          }}
        >
          {m?.label ?? row.type}
        </span>
      );
    },
  },
  { key: "date", header: "DATE", width: "68px", render: (r) => <span style={{ color: "var(--fg-3)" }}>{r.date}</span> },
  {
    key: "amount",
    header: "AMOUNT",
    width: "90px",
    align: "right",
    render: (r) => (
      <span
        style={{
          fontVariantNumeric: "tabular-nums",
          color: r.state_tone === "error" ? "var(--sem-down)" : "var(--fg-1)",
        }}
      >
        {fmtUSD(r.amount)}
      </span>
    ),
  },
  { key: "party",  header: "COUNTERPARTY",        width: "1fr",  render: (r) => r.party },
  { key: "client", header: "CLIENT / ENGAGEMENT", width: "1fr",  render: (r) => <span style={{ color: "var(--fg-2)" }}>{r.client}</span> },
  {
    key: "state",
    header: "STATE",
    width: "130px",
    render: (r) => <Badge tone={r.state_tone} size="sm" glow={r.glow}>{r.state}</Badge>,
  },
  {
    key: "action",
    header: "NEXT ACTION",
    width: "180px",
    render: (r) => (
      <span style={{ color: "var(--fg-2)" }}>
        {r.action} <span style={{ color: "var(--neon-cyan)" }}>›</span>
      </span>
    ),
  },
  {
    key: "age",
    header: "AGE",
    width: "60px",
    align: "right",
    render: (r) => <span style={{ color: r.state_tone === "error" ? "var(--sem-down)" : "var(--fg-3)" }}>{r.age}</span>,
  },
];

export const txnsColumns: WorkTableColumn<NvTransactionRow>[] = [
  { key: "id",      header: "ID",          width: "90px",  render: (r) => <span style={{ color: "var(--fg-3)" }}>{(r.external_id ?? r.id).slice(0, 9)}</span> },
  { key: "date",    header: "DATE · TIME", width: "150px", render: (r) => <span style={{ color: "var(--fg-2)" }}>{r.date}</span> },
  { key: "account", header: "ACCOUNT",     width: "120px", render: (r) => <span style={{ color: "var(--fg-2)" }}>{r.account}</span> },
  { key: "desc",    header: "DESCRIPTION", width: "1fr",   render: (r) => r.desc },
  {
    key: "amount",
    header: "AMOUNT",
    width: "110px",
    align: "right",
    render: (r) => (
      <span
        style={{
          fontVariantNumeric: "tabular-nums",
          color: r.amount > 0 ? "var(--sem-up)" : "var(--fg-1)",
        }}
      >
        {r.amount > 0 ? "+" : ""}
        {fmtUSD(r.amount)}
      </span>
    ),
  },
  {
    key: "category",
    header: "CATEGORY",
    width: "130px",
    render: (r) => (
      <span style={{ color: r.category ? "var(--neon-violet)" : "var(--fg-4)" }}>
        {r.category ?? "—"}
      </span>
    ),
  },
  {
    key: "match",
    header: "MATCH",
    width: "100px",
    render: (r) => {
      const color =
        r.match === "unmatched"
          ? "var(--neon-amber)"
          : r.match.includes("✓")
          ? "var(--sem-up)"
          : "var(--neon-amber)";
      return <span style={{ color }}>{r.match}</span>;
    },
  },
  {
    key: "state",
    header: "STATE",
    width: "110px",
    render: (r) => {
      const tone =
        r.state === "reconciled" ? "up" : r.state === "categorized" ? "live" : "warn";
      return <Badge tone={tone} size="sm">{r.state}</Badge>;
    },
  },
];

export const receiptsColumns: WorkTableColumn<NvReceiptIntakeRow>[] = [
  { key: "id",         header: "ID",      width: "90px",  render: (r) => <span style={{ color: "var(--fg-3)" }}>{r.id.slice(0, 9)}</span> },
  { key: "received",   header: "RECEIVED", width: "160px", render: (r) => <span style={{ color: "var(--fg-2)" }}>{r.created_at?.slice(5, 16).replace("T", " · ")}</span> },
  {
    key: "vendor",
    header: "VENDOR",
    width: "1fr",
    render: (r) => r.vendor_normalized ?? r.merchant_raw ?? r.service_name_guess ?? "—",
  },
  {
    key: "total",
    header: "TOTAL",
    width: "120px",
    align: "right",
    render: (r) => (
      <span style={{ fontVariantNumeric: "tabular-nums" }}>
        {r.total != null ? fmtUSD(Number(r.total)) : "—"}
      </span>
    ),
  },
  { key: "source",     header: "SOURCE",  width: "150px", render: (r) => <span style={{ color: "var(--fg-2)" }}>{r.source_type}</span> },
  {
    key: "conf",
    header: "CONF",
    width: "90px",
    render: (r) => {
      const c = r.confidence_overall ? Math.round(Number(r.confidence_overall) * 100) : 0;
      const color = c >= 95 ? "var(--sem-up)" : c >= 80 ? "var(--neon-cyan)" : "var(--neon-amber)";
      return <span style={{ color, fontVariantNumeric: "tabular-nums" }}>{c}%</span>;
    },
  },
  {
    key: "state",
    header: "STATE",
    width: "140px",
    render: (r) => {
      const s = r.ingest_status;
      const tone = s === "parsed" ? "live" : s === "failed" ? "error" : "warn";
      return <Badge tone={tone} size="sm">{s}</Badge>;
    },
  },
];

export const invoicesColumns: WorkTableColumn<NvInvoiceRow>[] = [
  { key: "id",      header: "ID",      width: "90px",  render: (r) => <span style={{ color: "var(--fg-3)" }}>{r.invoice_number ?? r.id.slice(0, 9)}</span> },
  { key: "client",  header: "CLIENT",  width: "1fr",   render: (r) => r.client },
  { key: "issued",  header: "ISSUED",  width: "90px",  render: (r) => <span style={{ color: "var(--fg-2)" }}>{r.issued}</span> },
  {
    key: "due",
    header: "DUE",
    width: "90px",
    render: (r) => (
      <span style={{ color: r.state === "overdue" ? "var(--sem-down)" : "var(--fg-2)" }}>
        {r.due}
      </span>
    ),
  },
  {
    key: "amount",
    header: "AMOUNT",
    width: "120px",
    align: "right",
    render: (r) => <span style={{ fontVariantNumeric: "tabular-nums" }}>{fmtUSD(r.amount)}</span>,
  },
  {
    key: "out",
    header: "OUTSTANDING",
    width: "120px",
    align: "right",
    render: (r) => {
      const out = r.amount - r.paid;
      return (
        <span
          style={{
            fontVariantNumeric: "tabular-nums",
            color: out > 0 ? "var(--neon-amber)" : "var(--fg-3)",
          }}
        >
          {out > 0 ? fmtUSD(out) : "—"}
        </span>
      );
    },
  },
  {
    key: "state",
    header: "STATE",
    width: "100px",
    render: (r) => {
      const tone =
        r.state === "paid"
          ? "up"
          : r.state === "overdue"
          ? "error"
          : r.state === "sent"
          ? "live"
          : "stale";
      return <Badge tone={tone} size="sm" glow={r.glow}>{r.state}</Badge>;
    },
  },
  {
    key: "age",
    header: "AGE",
    width: "120px",
    render: (r) => <span style={{ color: r.glow ? "var(--sem-down)" : "var(--fg-2)" }}>{r.age_label}</span>,
  },
];

const PLATFORM_COLORS: Record<string, string> = {
  Apple: "var(--neon-magenta)",
  apple: "var(--neon-magenta)",
  stripe: "var(--neon-violet)",
  direct: "var(--sem-up)",
};

export const subscriptionsColumns: WorkTableColumn<NvSubscriptionRow>[] = [
  {
    key: "vendor",
    header: "VENDOR",
    width: "180px",
    render: (r) => r.vendor_normalized ?? "—",
  },
  { key: "service", header: "PRODUCT", width: "1fr",  render: (r) => r.service_name },
  {
    key: "platform",
    header: "PLATFORM",
    width: "120px",
    render: (r) => {
      if (!r.billing_platform) return <span style={{ color: "var(--fg-4)" }}>—</span>;
      const color = PLATFORM_COLORS[r.billing_platform] ?? "var(--fg-2)";
      return (
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            letterSpacing: ".08em",
            textTransform: "uppercase",
            padding: "2px 6px",
            border: `1px solid ${color}`,
            color,
            borderRadius: 2,
          }}
        >
          {r.billing_platform}
        </span>
      );
    },
  },
  {
    key: "cadence",
    header: "CADENCE",
    width: "100px",
    render: (r) => <span style={{ color: "var(--fg-2)" }}>{r.cadence}</span>,
  },
  {
    key: "last_seen",
    header: "LAST BILLED",
    width: "110px",
    render: (r) => <span style={{ color: "var(--fg-2)" }}>{r.last_seen_date ?? "—"}</span>,
  },
  {
    key: "next",
    header: "NEXT",
    width: "110px",
    render: (r) => <span style={{ color: "var(--fg-2)" }}>{r.next_expected_date ?? "—"}</span>,
  },
  {
    key: "amount",
    header: "AMOUNT",
    width: "110px",
    align: "right",
    render: (r) => (
      <span style={{ fontVariantNumeric: "tabular-nums" }}>
        {r.expected_amount != null ? fmtUSD(Number(r.expected_amount)) : "—"}
      </span>
    ),
  },
  {
    key: "doc",
    header: "DOC",
    width: "80px",
    render: (r) =>
      r.documentation_complete ? (
        <Badge tone="up" size="sm">ok</Badge>
      ) : (
        <Badge tone="warn" size="sm">missing</Badge>
      ),
  },
];

export { TYPE_META };
