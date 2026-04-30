"use client";

/**
 * REPE Gross-to-Net Audit Surface
 *
 * NOT a dashboard. This is an audit surface for tracing net IRR back through
 * expenses, waterfall, and asset CFs. Every value is either a real number or
 * "Unavailable" with an explicit null_reason. No fake zeros.
 *
 * Sections:
 *   1. Snapshot status banner (promotion_state, trust_status, promotable, blocking reasons)
 *   2. Gross-to-net bridge table (5 rows, click-through provenance)
 *   3. Four metric panels (bottom_up, fund_expenses, waterfall, net)
 *   4. Promotion gate panel (every gate as pass/fail/warn/skip)
 *   5. Drill-through tables (assets, expenses, waterfall events)
 *
 * Fail-closed: unavailable values show "Unavailable" + null_reason, never zero.
 * Never implies released truth when snapshot is draft_audit.
 */

import { useEffect, useState } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle, ChevronDown, ChevronRight, Clock, Info, XCircle } from "lucide-react";

// ── Style constants (dark operating-console theme) ──────────────────────────
const card = "rounded-lg border border-bm-border/40 bg-bm-surface/10 overflow-hidden";
const cardH = "px-4 py-3 border-b border-bm-border/30 bg-bm-surface/20 flex items-center justify-between";
const cardTitle = "text-sm font-semibold text-bm-text";
const cardBody = "px-4 py-3";
const th = "px-3 py-2 text-left text-xs font-medium text-bm-muted2 uppercase tracking-wide whitespace-nowrap";
const thR = "px-3 py-2 text-right text-xs font-medium text-bm-muted2 uppercase tracking-wide whitespace-nowrap";
const td = "px-3 py-2 text-right text-xs tabular-nums text-bm-text whitespace-nowrap";
const tdL = "px-3 py-2 text-left text-xs text-bm-text";
const tdMono = "px-3 py-2 text-left text-xs font-mono text-bm-muted2";
const trRow = "border-b border-bm-border/20 hover:bg-bm-surface/20 transition-colors";
const trHead = "border-b border-bm-border/40 bg-bm-surface/20";
const label = "text-xs text-bm-muted2";
const value = "text-sm font-medium text-bm-text tabular-nums";
const unavailable = "text-xs text-amber-400/80 italic";
const badge = (color: string) => `inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${color}`;

// ── Types ────────────────────────────────────────────────────────────────────
interface BridgeItem {
  label: string;
  item_type: string;
  amount: number | null;
  null_reason: string | null;
  formula_key: string;
  source_table: string | null;
  provenance: Record<string, unknown>;
}

interface GateResult {
  gate: string;
  label: string;
  status: "pass" | "fail" | "warn" | "skip";
  detail: string | null;
}

interface AuditPayload {
  snapshot: {
    fund_id: string;
    quarter: string;
    period_start: string | null;
    period_end: string | null;
    promotion_state: string | null;
    trust_status: string | null;
    breakpoint_layer: string | null;
    audit_run_id: string | null;
    snapshot_version: string | null;
    created_at: string;
    promotable: boolean;
    blocking_reasons: string[];
    null_reasons: Record<string, string>;
  };
  bridge: {
    gross_return_amount: string | null;
    management_fees: string | null;
    fund_expenses: string | null;
    net_return_amount: string | null;
    rows: BridgeItem[];
    null_reasons: Record<string, unknown>;
    provenance: Array<Record<string, unknown>>;
    available: boolean;
  };
  metric_blocks: {
    bottom_up: Record<string, unknown> | null;
    fund_expenses: Record<string, unknown> | null;
    waterfall: Record<string, unknown> | null;
  };
  gate: GateResult[];
  drilldowns: {
    assets: Array<Record<string, unknown>>;
    expenses: Array<Record<string, unknown>>;
    waterfall_events: Array<Record<string, unknown>>;
  };
}

// ── Formatters ───────────────────────────────────────────────────────────────
function fmtMoney(v: string | number | null | undefined): string {
  if (v == null) return "—";
  const n = typeof v === "string" ? parseFloat(v) : v;
  if (!isFinite(n)) return "—";
  const abs = Math.abs(n);
  if (abs >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

function fmtPct(v: number | string | null | undefined, digits = 1): string {
  if (v == null) return "—";
  const n = typeof v === "string" ? parseFloat(v) : v;
  if (!isFinite(n)) return "—";
  return `${(n * 100).toFixed(digits)}%`;
}

function fmtMultiple(v: number | string | null | undefined): string {
  if (v == null) return "—";
  const n = typeof v === "string" ? parseFloat(v) : v;
  if (!isFinite(n)) return "—";
  return `${n.toFixed(2)}x`;
}

function fmtBps(v: number | null | undefined): string {
  if (v == null) return "—";
  return `${v} bps`;
}

function Unavail({ reason }: { reason: string | null | undefined }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span data-testid="unavailable-label" className={unavailable}>Unavailable</span>
      {reason && <span className="text-[10px] text-amber-400/60 font-mono" data-testid="null-reason">({reason})</span>}
    </span>
  );
}

// ── Promotion state badge ────────────────────────────────────────────────────
function PromotionBadge({ state }: { state: string | null }) {
  if (!state) return <span className={badge("bg-slate-700 text-slate-300")}>unknown</span>;
  if (state === "released") return <span className={badge("bg-emerald-900/60 text-emerald-300")} data-testid="promotion-badge">released</span>;
  if (state === "verified") return <span className={badge("bg-blue-900/60 text-blue-300")} data-testid="promotion-badge">verified</span>;
  if (state === "draft_audit") return <span className={badge("bg-amber-900/60 text-amber-300")} data-testid="promotion-badge">draft_audit</span>;
  if (state === "superseded") return <span className={badge("bg-slate-700 text-slate-400")} data-testid="promotion-badge">superseded</span>;
  return <span className={badge("bg-slate-700 text-slate-300")} data-testid="promotion-badge">{state}</span>;
}

function TrustBadge({ trust }: { trust: string | null }) {
  if (!trust) return null;
  if (trust === "trusted") return <span className={badge("bg-emerald-900/40 text-emerald-400")}>trusted</span>;
  if (trust === "untrusted") return <span className={badge("bg-red-900/40 text-red-400")}>untrusted</span>;
  return <span className={badge("bg-slate-700 text-slate-300")}>{trust}</span>;
}

function GateIcon({ status }: { status: "pass" | "fail" | "warn" | "skip" }) {
  if (status === "pass") return <CheckCircle size={14} className="text-emerald-400 shrink-0" />;
  if (status === "fail") return <XCircle size={14} className="text-red-400 shrink-0" />;
  if (status === "warn") return <AlertTriangle size={14} className="text-amber-400 shrink-0" />;
  return <Clock size={14} className="text-slate-500 shrink-0" />;
}

// ── Metric value display ─────────────────────────────────────────────────────
function MetricVal({ v, nullReason, fmt }: { v: unknown; nullReason?: string | null; fmt?: (x: unknown) => string }) {
  if (v == null || v === "") {
    return <Unavail reason={nullReason ?? null} />;
  }
  const formatted = fmt ? fmt(v) : String(v);
  return <span className={value}>{formatted}</span>;
}

// ── Bridge item type indicator ───────────────────────────────────────────────
function ItemTypeChip({ type }: { type: string }) {
  if (type === "starting") return <span className="text-[10px] text-slate-400">GROSS</span>;
  if (type === "subtraction") return <span className="text-[10px] text-red-400/80">LESS</span>;
  if (type === "ending") return <span className="text-[10px] text-emerald-400/80">NET</span>;
  if (type === "memo") return <span className="text-[10px] text-slate-500 italic">MEMO</span>;
  return <span className="text-[10px] text-slate-500">{type}</span>;
}

// ── Collapsible panel ────────────────────────────────────────────────────────
function Panel({ title, children, defaultOpen = true, badge: badgeEl }: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  badge?: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={card}>
      <button
        type="button"
        className={`${cardH} w-full text-left cursor-pointer`}
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
      >
        <div className="flex items-center gap-2">
          {open ? <ChevronDown size={14} className="text-bm-muted2" /> : <ChevronRight size={14} className="text-bm-muted2" />}
          <span className={cardTitle}>{title}</span>
          {badgeEl}
        </div>
      </button>
      {open && <div className={cardBody}>{children}</div>}
    </div>
  );
}

// ── Bridge provenance popover ─────────────────────────────────────────────────
function ProvenancePopover({ item }: { item: BridgeItem }) {
  const [open, setOpen] = useState(false);
  const hasProvenance = item.provenance && Object.keys(item.provenance).length > 0;
  if (!hasProvenance && !item.formula_key) return null;
  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="text-bm-muted2 hover:text-bm-text transition-colors"
        aria-label="Show provenance"
      >
        <Info size={12} />
      </button>
      {open && (
        <div
          data-testid="provenance-popover"
          className="absolute left-0 top-5 z-20 w-72 rounded-lg border border-bm-border/50 bg-bm-bg shadow-xl p-3 text-xs"
          onClick={e => e.stopPropagation()}
        >
          <button type="button" onClick={() => setOpen(false)} className="float-right text-bm-muted2 hover:text-bm-text">✕</button>
          <p className="font-semibold text-bm-text mb-2">{item.label}</p>
          <p className="text-bm-muted2 mb-1 font-mono text-[10px]">{item.formula_key}</p>
          {item.source_table && (
            <p className="text-bm-muted2 text-[10px] mb-2">Source: {item.source_table}</p>
          )}
          {hasProvenance && (
            <pre className="text-[10px] font-mono text-bm-muted2 overflow-x-auto whitespace-pre-wrap max-h-40">
              {JSON.stringify(item.provenance, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

// ── 1. Snapshot status banner ─────────────────────────────────────────────────
function SnapshotBanner({ snap }: { snap: AuditPayload["snapshot"] }) {
  const isDraft = snap.promotion_state === "draft_audit";
  return (
    <div
      data-testid="snapshot-banner"
      className={`rounded-lg border p-4 ${isDraft ? "border-amber-800/50 bg-amber-950/20" : "border-bm-border/40 bg-bm-surface/10"}`}
    >
      {isDraft && (
        <div className="flex items-center gap-2 mb-3 text-amber-300 text-xs font-medium">
          <AlertTriangle size={14} />
          Draft snapshot — not released. Values are tentative and subject to promotion review.
        </div>
      )}
      <div className="grid grid-cols-2 gap-x-8 gap-y-3 sm:grid-cols-4">
        <div>
          <p className={label}>Quarter</p>
          <p className={value}>{snap.quarter}</p>
        </div>
        <div>
          <p className={label}>Promotion state</p>
          <div className="mt-0.5"><PromotionBadge state={snap.promotion_state} /></div>
        </div>
        <div>
          <p className={label}>Trust status</p>
          <div className="mt-0.5"><TrustBadge trust={snap.trust_status} /></div>
        </div>
        <div>
          <p className={label}>Promotable</p>
          <div className="mt-0.5">
            {snap.promotable
              ? <span className={badge("bg-emerald-900/40 text-emerald-400")} data-testid="promotable-yes">Yes</span>
              : <span className={badge("bg-red-900/40 text-red-400")} data-testid="promotable-no">No</span>
            }
          </div>
        </div>
        <div className="sm:col-span-2">
          <p className={label}>Breakpoint layer</p>
          <p className={`${value} font-mono`}>{snap.breakpoint_layer ?? "—"}</p>
        </div>
        <div className="sm:col-span-2">
          <p className={label}>Period</p>
          <p className={value}>{snap.period_start ?? "—"} → {snap.period_end ?? "—"}</p>
        </div>
        <div className="sm:col-span-2">
          <p className={label}>Snapshot version</p>
          <p className="text-xs font-mono text-bm-muted2 mt-0.5 break-all">{snap.snapshot_version ?? "—"}</p>
        </div>
        <div className="sm:col-span-2">
          <p className={label}>Audit run ID</p>
          <p className="text-xs font-mono text-bm-muted2 mt-0.5 break-all">{snap.audit_run_id ?? "—"}</p>
        </div>
      </div>

      {!snap.promotable && snap.blocking_reasons.length > 0 && (
        <div className="mt-4 pt-3 border-t border-bm-border/30">
          <p className="text-xs font-semibold text-red-400 mb-2">Blocking reasons</p>
          <ul className="space-y-1" data-testid="blocking-reasons">
            {snap.blocking_reasons.map((r, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-red-300/80">
                <XCircle size={12} className="text-red-400 mt-0.5 shrink-0" />
                <span className="font-mono">{r}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {Object.keys(snap.null_reasons).length > 0 && (
        <details className="mt-3">
          <summary className="text-xs text-bm-muted2 cursor-pointer hover:text-bm-text">
            null_reasons ({Object.keys(snap.null_reasons).length})
          </summary>
          <div className="mt-2 grid grid-cols-1 gap-1 sm:grid-cols-2">
            {Object.entries(snap.null_reasons).map(([k, v]) => (
              <div key={k} className="flex items-start gap-2 text-xs">
                <span className="font-mono text-bm-muted2 shrink-0">{k}:</span>
                <span className="font-mono text-amber-400/80">{v}</span>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

// ── 2. Gross-to-net bridge table ──────────────────────────────────────────────
function BridgeTable({ bridge }: { bridge: AuditPayload["bridge"] }) {
  if (!bridge.available) {
    return (
      <div className="text-sm text-bm-muted2 py-4" data-testid="bridge-unavailable">
        No bridge data for this snapshot. The fund expense layer or waterfall may not have run.
      </div>
    );
  }

  const rows = bridge.rows.filter(r => r.item_type !== "memo");
  const memoRows = bridge.rows.filter(r => r.item_type === "memo");

  return (
    <div data-testid="bridge-table">
      <table className="w-full text-xs">
        <thead>
          <tr className={trHead}>
            <th className={th}>Item</th>
            <th className={thR}>Amount</th>
            <th className={th}>Source</th>
            <th className={th}>Trust</th>
            <th className="px-3 py-2 w-6" />
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const isSeparator = row.item_type === "ending";
            return (
              <tr
                key={i}
                className={`${trRow} ${isSeparator ? "border-t-2 border-bm-border/60 bg-bm-surface/20" : ""}`}
                data-testid={`bridge-row-${row.item_type}`}
              >
                <td className={tdL}>
                  <div className="flex items-center gap-2">
                    <ItemTypeChip type={row.item_type} />
                    <span className={row.item_type === "ending" ? "font-semibold text-bm-text" : ""}>{row.label}</span>
                  </div>
                </td>
                <td className={`${td} ${row.amount == null ? "" : row.item_type === "subtraction" ? "text-red-400/90" : row.item_type === "ending" ? "text-emerald-400 font-semibold" : ""}`}>
                  {row.amount == null
                    ? <Unavail reason={row.null_reason} />
                    : row.item_type === "subtraction"
                      ? `(${fmtMoney(Math.abs(row.amount))})`
                      : fmtMoney(row.amount)
                  }
                </td>
                <td className={tdMono}>{row.source_table ?? "—"}</td>
                <td className={tdL}>
                  {row.null_reason
                    ? <span className="text-amber-400/80 text-[10px]">incomplete</span>
                    : <span className="text-emerald-400/80 text-[10px]">ok</span>
                  }
                </td>
                <td className="px-3 py-2">
                  <ProvenancePopover item={row} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {memoRows.length > 0 && (
        <div className="mt-3 pt-3 border-t border-bm-border/20">
          <p className="text-xs text-bm-muted2 mb-2 font-medium">Memo lines (informational only)</p>
          {memoRows.map((row, i) => (
            <div key={i} className="flex items-start gap-3 text-xs py-1" data-testid="bridge-row-memo">
              <span className="text-bm-muted2 w-56 shrink-0">{row.label}</span>
              <span className="font-mono tabular-nums text-bm-muted2">
                {row.amount != null ? (typeof row.amount === "number" && Math.abs(row.amount) > 10000 ? fmtMoney(row.amount) : row.amount.toFixed(2)) : "—"}
              </span>
              <span className="text-bm-muted2 text-[10px]">{row.formula_key}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── 3. Metric panels ──────────────────────────────────────────────────────────
function MetricGrid({ pairs }: { pairs: Array<{ label: string; val: React.ReactNode }> }) {
  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
      {pairs.map(({ label: lbl, val }, i) => (
        <div key={i}>
          <p className={label}>{lbl}</p>
          <div className="mt-0.5">{val}</div>
        </div>
      ))}
    </div>
  );
}

function BottomUpPanel({ block, nullReasons }: { block: Record<string, unknown> | null; nullReasons: Record<string, string> }) {
  if (!block) {
    return <p className="text-sm text-bm-muted2"><Unavail reason={nullReasons["bottom_up_irr"] ?? "no_bottom_up_block"} /></p>;
  }
  const trust = (block["trust_status"] as string | null) ?? null;
  return (
    <div data-testid="panel-bottom-up">
      <div className="flex items-center gap-2 mb-3">
        <TrustBadge trust={trust} />
        {Boolean(block["breakpoint_layer"]) && <span className="text-xs text-bm-muted2 font-mono">{String(block["breakpoint_layer"])}</span>}
      </div>
      <MetricGrid pairs={[
        { label: "Gross IRR (bottom-up)", val: block["gross_irr_bottom_up"] != null ? <span className={value}>{fmtPct(block["gross_irr_bottom_up"] as number)}</span> : <Unavail reason={nullReasons["bottom_up_irr"]} /> },
        { label: "Gross TVPI", val: block["gross_tvpi"] != null ? <span className={value}>{fmtMultiple(block["gross_tvpi"] as number)}</span> : <Unavail reason={nullReasons["bottom_up_irr"]} /> },
        { label: "Gross DPI", val: block["dpi"] != null ? <span className={value}>{fmtMultiple(block["dpi"] as number)}</span> : <Unavail reason={nullReasons["bottom_up_irr"]} /> },
        { label: "Investment count", val: <span className={value}>{block["investment_count"] != null ? String(block["investment_count"]) : "—"}</span> },
        { label: "Asset count", val: <span className={value}>{block["asset_count"] != null ? String(block["asset_count"]) : "—"}</span> },
        { label: "Scope completeness", val: <span className={value}>{(block["scope"] as Record<string, unknown> | undefined)?.["scope_completeness"] != null ? String((block["scope"] as Record<string, unknown>)["scope_completeness"]) : "—"}</span> },
      ]} />
    </div>
  );
}

function ExpensePanel({ block, nullReasons }: { block: Record<string, unknown> | null; nullReasons: Record<string, string> }) {
  if (!block) {
    return <p className="text-sm text-bm-muted2"><Unavail reason={nullReasons["fund_expense_layer"] ?? "no_expense_block"} /></p>;
  }
  const trust = (block["trust_status"] as string | null) ?? null;
  const expByType = (block["expense_by_type"] ?? {}) as Record<string, unknown>;
  return (
    <div data-testid="panel-fund-expenses">
      <div className="flex items-center gap-2 mb-3">
        <TrustBadge trust={trust} />
      </div>
      <MetricGrid pairs={[
        { label: "Total mgmt fees", val: block["total_management_fees"] != null ? <span className={value}>{fmtMoney(block["total_management_fees"] as number)}</span> : <Unavail reason={nullReasons["fund_expense_layer"]} /> },
        { label: "Total other expenses", val: block["total_other_expenses"] != null ? <span className={value}>{fmtMoney(block["total_other_expenses"] as number)}</span> : <Unavail reason={nullReasons["fund_expense_layer"]} /> },
        { label: "Expense drag", val: block["expense_drag_bps"] != null ? <span className={value}>{fmtBps(block["expense_drag_bps"] as number)}</span> : <Unavail reason={nullReasons["fund_expense_layer"]} /> },
        { label: "Expected types", val: <span className={`${value} text-xs font-mono`}>{Array.isArray(block["expected_types"]) ? (block["expected_types"] as string[]).join(", ") : "—"}</span> },
        { label: "Actual types", val: <span className={`${value} text-xs font-mono`}>{Array.isArray(block["actual_types"]) ? (block["actual_types"] as string[]).join(", ") : "—"}</span> },
        { label: "CF hash", val: <span className="text-[10px] font-mono text-bm-muted2 break-all">{block["expense_cf_hash"] != null ? String(block["expense_cf_hash"]).slice(0, 20) + "…" : "—"}</span> },
      ]} />
      {Object.keys(expByType).length > 0 && (
        <details className="mt-4">
          <summary className="text-xs text-bm-muted2 cursor-pointer hover:text-bm-text">By type</summary>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {Object.entries(expByType).map(([t, amt]) => (
              <div key={t} className="flex justify-between text-xs border-b border-bm-border/20 py-1">
                <span className="font-mono text-bm-muted2">{t}</span>
                <span className="tabular-nums text-bm-text">{fmtMoney(amt as number)}</span>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

function WaterfallPanel({ block, nullReasons }: { block: Record<string, unknown> | null; nullReasons: Record<string, string> }) {
  if (!block) {
    return <p className="text-sm text-bm-muted2"><Unavail reason={nullReasons["waterfall"] ?? "no_waterfall_block"} /></p>;
  }
  const trust = (block["trust_status"] as string | null) ?? null;
  return (
    <div data-testid="panel-waterfall">
      <div className="flex items-center gap-2 mb-3">
        <TrustBadge trust={trust} />
        {block["waterfall_status"] && (
          <span className={badge(block["waterfall_status"] === "computed" ? "bg-emerald-900/40 text-emerald-400" : "bg-amber-900/40 text-amber-400")}>
            {String(block["waterfall_status"])}
          </span>
        )}
        {block["waterfall_style"] && <span className="text-xs text-bm-muted2">{String(block["waterfall_style"])}</span>}
      </div>
      <MetricGrid pairs={[
        { label: "Net IRR (LP)", val: block["net_irr"] != null ? <span className={value}>{fmtPct(block["net_irr"] as number)}</span> : <Unavail reason={nullReasons["net_irr"]} /> },
        { label: "Net TVPI", val: block["net_tvpi"] != null ? <span className={value}>{fmtMultiple(block["net_tvpi"] as number)}</span> : <Unavail reason={nullReasons["net_irr"]} /> },
        { label: "DPI (net)", val: block["dpi"] != null ? <span className={value}>{fmtMultiple(block["dpi"] as number)}</span> : <Unavail reason={nullReasons["net_irr"]} /> },
        { label: "Carry / promote", val: block["carry"] != null ? <span className={value}>{fmtMoney(block["carry"] as number)}</span> : <Unavail reason={nullReasons["waterfall"]} /> },
        { label: "LP share", val: block["lp_share"] != null ? <span className={value}>{fmtMoney(block["lp_share"] as number)}</span> : <Unavail reason={nullReasons["waterfall"]} /> },
        { label: "Gross–net spread", val: block["gross_net_spread_bps"] != null ? <span className={value}>{fmtBps(block["gross_net_spread_bps"] as number)}</span> : <Unavail reason={nullReasons["net_irr"]} /> },
        { label: "Pref rate", val: block["pref_rate"] != null ? <span className={value}>{fmtPct(block["pref_rate"] as number)}</span> : <span className={value}>—</span> },
        { label: "Carry rate", val: block["carry_rate"] != null ? <span className={value}>{fmtPct(block["carry_rate"] as number)}</span> : <span className={value}>—</span> },
        { label: "Hurdle status", val: <span className={value}>{block["hurdle_status"] != null ? String(block["hurdle_status"]) : "—"}</span> },
      ]} />
    </div>
  );
}

// ── 4. Promotion gate panel ───────────────────────────────────────────────────
function GatePanel({ gates }: { gates: GateResult[] }) {
  const counts = { pass: 0, fail: 0, warn: 0, skip: 0 };
  for (const g of gates) counts[g.status]++;

  return (
    <div data-testid="gate-panel">
      <div className="flex items-center gap-3 mb-3 text-xs">
        {counts.pass > 0 && <span className="text-emerald-400">{counts.pass} pass</span>}
        {counts.warn > 0 && <span className="text-amber-400">{counts.warn} warn</span>}
        {counts.fail > 0 && <span className="text-red-400 font-semibold">{counts.fail} fail</span>}
        {counts.skip > 0 && <span className="text-slate-500">{counts.skip} skip</span>}
      </div>
      <table className="w-full text-xs">
        <thead>
          <tr className={trHead}>
            <th className="w-6 px-2 py-2" />
            <th className={th}>Gate</th>
            <th className={th}>Status</th>
            <th className={th}>Detail</th>
          </tr>
        </thead>
        <tbody>
          {gates.map((g) => (
            <tr key={g.gate} className={trRow} data-testid={`gate-row-${g.gate}`}>
              <td className="px-2 py-2 text-center">
                <GateIcon status={g.status} />
              </td>
              <td className={tdL}>
                <span className="font-mono text-bm-muted2 text-[10px]">{g.gate}</span>
                <br />
                <span>{g.label}</span>
              </td>
              <td className={tdL}>
                <span className={
                  g.status === "pass" ? "text-emerald-400" :
                  g.status === "fail" ? "text-red-400 font-semibold" :
                  g.status === "warn" ? "text-amber-400" :
                  "text-slate-500"
                }>{g.status}</span>
              </td>
              <td className={`${tdL} text-bm-muted2 font-mono`}>{g.detail ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── 5. Drilldown tables ───────────────────────────────────────────────────────
function AssetDrilldown({ rows }: { rows: Array<Record<string, unknown>> }) {
  if (!rows.length) return <p className="text-xs text-bm-muted2 py-2">No asset drilldown data available in this snapshot.</p>;
  return (
    <div data-testid="drilldown-assets">
      <table className="w-full text-xs">
        <thead>
          <tr className={trHead}>
            <th className={th}>Asset</th>
            <th className={th}>Investment</th>
            <th className={thR}>Ownership</th>
            <th className={thR}>CF amount</th>
            <th className={thR}>Gross IRR</th>
            <th className={th}>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className={trRow}>
              <td className={tdL}>{r["asset_name"] as string ?? "—"}</td>
              <td className={tdL}>{r["investment_name"] as string ?? "—"}</td>
              <td className={td}>{r["ownership_pct"] != null ? fmtPct(r["ownership_pct"] as number) : "—"}</td>
              <td className={td}>{r["cf_amount"] != null ? fmtMoney(r["cf_amount"] as number) : "—"}</td>
              <td className={td}>{r["gross_irr"] != null ? fmtPct(r["gross_irr"] as number) : "—"}</td>
              <td className={tdL}>
                {r["null_reason"]
                  ? <span className="text-amber-400/80 font-mono text-[10px]">{String(r["null_reason"])}</span>
                  : <span className="text-emerald-400/80 text-[10px]">ok</span>
                }
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ExpenseDrilldown({ rows }: { rows: Array<Record<string, unknown>> }) {
  if (!rows.length) return <p className="text-xs text-bm-muted2 py-2">No expense data available in this snapshot.</p>;
  return (
    <div data-testid="drilldown-expenses">
      <table className="w-full text-xs">
        <thead>
          <tr className={trHead}>
            <th className={th}>Expense type</th>
            <th className={thR}>Amount</th>
            <th className={th}>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className={trRow}>
              <td className={tdL}><span className="font-mono">{r["expense_type"] as string}</span></td>
              <td className={td}>{r["amount"] != null ? fmtMoney(r["amount"] as number) : <Unavail reason={r["null_reason"] as string | null} />}</td>
              <td className={tdL}>
                {r["null_reason"]
                  ? <span className="text-amber-400/80 font-mono text-[10px]">{String(r["null_reason"])}</span>
                  : <span className="text-emerald-400/80 text-[10px]">ok</span>
                }
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function WaterfallEventDrilldown({ rows }: { rows: Array<Record<string, unknown>> }) {
  if (!rows.length) return <p className="text-xs text-bm-muted2 py-2">No distribution events in this snapshot.</p>;
  return (
    <div data-testid="drilldown-waterfall-events">
      {rows.map((ev, i) => (
        <details key={i} className="mb-2 rounded-md border border-bm-border/30 bg-bm-surface/10">
          <summary className="px-3 py-2 cursor-pointer text-xs flex items-center justify-between">
            <span className="font-medium">{ev["quarter"] as string ?? `Event ${i + 1}`}</span>
            <span className="text-bm-muted2 tabular-nums">
              Dist: {fmtMoney(ev["distribution_amount"] as number)} | LP: {fmtMoney(ev["lp_total"] as number)} | GP: {fmtMoney(ev["gp_total"] as number)}
            </span>
          </summary>
          <div className="px-3 pb-3">
            <div className="flex gap-4 text-xs mb-2">
              <span className="text-bm-muted2">Conservation diff: <span className="font-mono text-bm-text">{ev["conservation_diff"] != null ? String(ev["conservation_diff"]) : "—"}</span></span>
            </div>
            {Array.isArray(ev["tier_breakdown"]) && ev["tier_breakdown"].length > 0 && (
              <table className="w-full text-xs">
                <thead>
                  <tr className={trHead}>
                    <th className={th}>Tier</th>
                    <th className={th}>Partner</th>
                    <th className={th}>Type</th>
                    <th className={thR}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {(ev["tier_breakdown"] as Array<Record<string, unknown>>).map((a, j) => (
                    <tr key={j} className={trRow}>
                      <td className={tdL}>{a["tier_order"] != null ? String(a["tier_order"]) : "—"}</td>
                      <td className={tdL}>{a["partner_name"] as string ?? "—"}</td>
                      <td className={tdL}>{a["partner_type"] as string ?? "—"}</td>
                      <td className={td}>{fmtMoney(a["amount"] as number)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </details>
      ))}
    </div>
  );
}

// ── Quarter picker ────────────────────────────────────────────────────────────
function QuarterPicker({ value: v, onChange }: { value: string; onChange: (q: string) => void }) {
  const options = [];
  for (let yr = 2024; yr <= 2027; yr++) {
    for (let q = 1; q <= 4; q++) options.push(`${yr}Q${q}`);
  }
  return (
    <select
      className="rounded border border-bm-border/40 bg-bm-surface/20 px-2 py-1.5 text-sm text-bm-text focus:outline-none focus:ring-1 focus:ring-bm-accent/50"
      value={v}
      onChange={e => onChange(e.target.value)}
      aria-label="Select quarter"
    >
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function GrossToNetAuditPage() {
  const params = useParams<{ fundId: string }>();
  const fundId = params?.fundId ?? "";
  const searchParams = useSearchParams();
  const router = useRouter();

  function defaultQuarter(): string {
    const now = new Date();
    const q = Math.ceil((now.getUTCMonth() + 1) / 3);
    return `${now.getUTCFullYear()}Q${q}`;
  }

  const [quarter, setQuarter] = useState(searchParams?.get("quarter") ?? defaultQuarter());
  const [data, setData] = useState<AuditPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeDrilldown, setActiveDrilldown] = useState<"assets" | "expenses" | "waterfall" | null>(null);

  async function load(q: string) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/re/v2/funds/${fundId}/gross-to-net-audit?quarter=${q}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.message ?? `HTTP ${res.status}`);
      }
      setData(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (fundId) load(quarter);
  }, [fundId, quarter]);

  function handleQuarterChange(q: string) {
    setQuarter(q);
    const url = new URL(window.location.href);
    url.searchParams.set("quarter", q);
    router.replace(url.pathname + url.search, { scroll: false });
  }

  const failGates = data?.gate.filter(g => g.status === "fail") ?? [];
  const warnGates = data?.gate.filter(g => g.status === "warn") ?? [];

  return (
    <div className="min-h-screen bg-bm-bg px-4 py-6 sm:px-6">
      <div className="max-w-5xl mx-auto space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-lg font-semibold text-bm-text">Gross-to-Net Audit</h1>
            <p className="text-xs text-bm-muted2 mt-0.5">
              Trace net IRR back through expenses, waterfall, and asset CFs. Audit surface — not a dashboard.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <QuarterPicker value={quarter} onChange={handleQuarterChange} />
            <button
              type="button"
              onClick={() => load(quarter)}
              disabled={loading}
              className="px-3 py-1.5 rounded text-xs font-medium bg-bm-accent/20 text-bm-accent hover:bg-bm-accent/30 disabled:opacity-50 transition-colors"
            >
              {loading ? "Loading…" : "Refresh"}
            </button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="rounded-lg border border-red-800/50 bg-red-950/20 p-4 text-sm text-red-300" data-testid="error-panel">
            <div className="flex items-center gap-2 font-medium mb-1">
              <XCircle size={14} /> Error loading audit data
            </div>
            <p className="font-mono text-xs text-red-300/70">{error}</p>
          </div>
        )}

        {/* Gate summary alert (sticky, shown when fails/warns present) */}
        {data && (failGates.length > 0 || warnGates.length > 0) && (
          <div className={`rounded-lg border p-3 text-xs ${failGates.length > 0 ? "border-red-800/50 bg-red-950/20 text-red-300" : "border-amber-800/50 bg-amber-950/20 text-amber-300"}`}
            data-testid="gate-alert">
            <div className="flex items-center gap-2 font-medium">
              {failGates.length > 0 ? <XCircle size={13} /> : <AlertTriangle size={13} />}
              {failGates.length > 0
                ? `${failGates.length} gate(s) failing — not promotable`
                : `${warnGates.length} gate(s) with warnings`}
            </div>
          </div>
        )}

        {/* Loading skeleton */}
        {loading && (
          <div className="space-y-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-24 rounded-lg bg-bm-surface/10 animate-pulse border border-bm-border/20" />
            ))}
          </div>
        )}

        {data && !loading && (
          <>
            {/* Section 1: Snapshot status */}
            <SnapshotBanner snap={data.snapshot} />

            {/* Section 2: Bridge */}
            <Panel
              title="Gross-to-Net Bridge"
              badge={
                data.bridge.available
                  ? <span className="text-[10px] text-bm-muted2">5-row value bridge</span>
                  : <span className="text-[10px] text-amber-400/80">bridge not available</span>
              }
            >
              <BridgeTable bridge={data.bridge} />
            </Panel>

            {/* Section 3: Metric panels (2-col grid) */}
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <Panel title="Bottom-Up (Gross)" defaultOpen>
                <BottomUpPanel block={data.metric_blocks.bottom_up} nullReasons={data.snapshot.null_reasons} />
              </Panel>
              <Panel title="Fund Expenses" defaultOpen>
                <ExpensePanel block={data.metric_blocks.fund_expenses} nullReasons={data.snapshot.null_reasons} />
              </Panel>
              <Panel title="Waterfall & Net Metrics" defaultOpen>
                <WaterfallPanel block={data.metric_blocks.waterfall} nullReasons={data.snapshot.null_reasons} />
              </Panel>
              <Panel title="Null Reasons Summary" defaultOpen={Object.keys(data.snapshot.null_reasons).length > 0}>
                {Object.keys(data.snapshot.null_reasons).length === 0
                  ? <p className="text-xs text-emerald-400/80">No null_reasons — all layers resolved.</p>
                  : (
                    <div className="space-y-2" data-testid="null-reasons-summary">
                      {Object.entries(data.snapshot.null_reasons).map(([k, v]) => (
                        <div key={k} className="text-xs flex items-start gap-2">
                          <span className="font-mono text-bm-muted2 shrink-0 w-32">{k}</span>
                          <span className="font-mono text-amber-400/80">{v}</span>
                        </div>
                      ))}
                    </div>
                  )
                }
              </Panel>
            </div>

            {/* Section 4: Promotion gate */}
            <Panel
              title="Promotion Gate"
              badge={
                failGates.length > 0
                  ? <span className="text-[10px] text-red-400 font-medium">{failGates.length} fail</span>
                  : warnGates.length > 0
                    ? <span className="text-[10px] text-amber-400">{warnGates.length} warn</span>
                    : <span className="text-[10px] text-emerald-400">all pass</span>
              }
            >
              <GatePanel gates={data.gate} />
            </Panel>

            {/* Section 5: Drilldown tables */}
            <Panel title="Drilldown Tables" defaultOpen={false}>
              <div className="flex gap-2 mb-4">
                {(["assets", "expenses", "waterfall"] as const).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setActiveDrilldown(activeDrilldown === tab ? null : tab)}
                    className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${activeDrilldown === tab ? "bg-bm-accent/20 text-bm-accent" : "bg-bm-surface/20 text-bm-muted2 hover:text-bm-text"}`}
                  >
                    {tab === "assets" ? "Asset CFs" : tab === "expenses" ? "Expense Lines" : "Waterfall Events"}
                    {tab === "assets" && data.drilldowns.assets.length > 0 && ` (${data.drilldowns.assets.length})`}
                    {tab === "expenses" && data.drilldowns.expenses.length > 0 && ` (${data.drilldowns.expenses.length})`}
                    {tab === "waterfall" && data.drilldowns.waterfall_events.length > 0 && ` (${data.drilldowns.waterfall_events.length})`}
                  </button>
                ))}
              </div>
              {activeDrilldown === "assets" && <AssetDrilldown rows={data.drilldowns.assets} />}
              {activeDrilldown === "expenses" && <ExpenseDrilldown rows={data.drilldowns.expenses} />}
              {activeDrilldown === "waterfall" && <WaterfallEventDrilldown rows={data.drilldowns.waterfall_events} />}
              {!activeDrilldown && <p className="text-xs text-bm-muted2">Select a drilldown above to inspect individual rows.</p>}
            </Panel>

            {/* Raw canonical_metrics (collapsed) */}
            <details className="rounded-lg border border-bm-border/30 bg-bm-surface/10 text-xs">
              <summary className="px-4 py-3 cursor-pointer text-bm-muted2 hover:text-bm-text font-medium">
                Raw canonical_metrics (JSON)
              </summary>
              <pre className="px-4 pb-4 overflow-x-auto font-mono text-[10px] text-bm-muted2 whitespace-pre-wrap max-h-64">
                {JSON.stringify({ bottom_up: data.metric_blocks.bottom_up, fund_expenses: data.metric_blocks.fund_expenses, waterfall: data.metric_blocks.waterfall }, null, 2)}
              </pre>
            </details>
          </>
        )}

        {!data && !loading && !error && (
          <div className="text-center py-16 text-sm text-bm-muted2">
            Select a quarter and click Refresh to load audit data.
          </div>
        )}
      </div>
    </div>
  );
}
