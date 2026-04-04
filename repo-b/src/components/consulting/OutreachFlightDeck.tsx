"use client";

import { useState } from "react";
import Link from "next/link";
import {
  type DailyBrief,
  type BestShotItem,
  type BlockingIssueSummary,
  type MessageQueueItem,
  type ObjectionItem,
  type ProofReadinessItem,
  type WeeklyStripItem,
} from "@/lib/cro-api";

// ── Shared primitives ─────────────────────────────────────────────────────────

function SectionHeader({
  label,
  count,
  action,
  actionHref,
  onAction,
}: {
  label: string;
  count?: number;
  action?: string;
  actionHref?: string;
  onAction?: () => void;
}) {
  return (
    <div className="flex items-center justify-between border-b border-bm-border/40 px-3 py-2">
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-bm-muted2">
          {label}
        </span>
        {count !== undefined && (
          <span className="rounded bg-bm-surface/30 px-1 py-0.5 text-[9px] font-bold text-bm-muted2">
            {count}
          </span>
        )}
      </div>
      {action && actionHref && (
        <Link href={actionHref} className="text-[10px] text-bm-accent hover:underline">
          {action} →
        </Link>
      )}
      {action && onAction && (
        <button onClick={onAction} className="text-[10px] text-bm-accent hover:underline">
          {action} →
        </button>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    ready:        "bg-emerald-500/15 text-emerald-400",
    draft:        "bg-amber-500/15 text-amber-400",
    needs_update: "bg-orange-500/15 text-orange-400",
    missing:      "bg-red-500/15 text-red-400",
    pending:      "bg-bm-surface/30 text-bm-muted2",
    overcome:     "bg-emerald-500/15 text-emerald-400",
    deferred:     "bg-amber-500/15 text-amber-400",
    lost:         "bg-red-500/15 text-red-400",
  };
  return (
    <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase ${styles[status] ?? "bg-bm-surface/20 text-bm-muted2"}`}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

function ReadinessBadge({ score }: { score: number }) {
  const color =
    score >= 6 ? "text-emerald-400" :
    score >= 4 ? "text-amber-400" :
    "text-red-400";
  return (
    <span className={`text-[9px] font-bold tabular-nums ${color}`}>
      {score}/8
    </span>
  );
}

// ── Panel 1: Best Shots ───────────────────────────────────────────────────────

function BestShotsPanel({ shots, envId }: { shots: BestShotItem[]; envId: string }) {
  return (
    <section className="border border-bm-border/40 rounded">
      <SectionHeader
        label="Best Shots Today"
        count={shots.length}
        action="All pipeline"
        actionHref={`/lab/env/${envId}/consulting/strategic-outreach`}
      />
      {shots.length === 0 ? (
        <p className="px-3 py-4 text-xs text-bm-muted2">
          No outreach-ready accounts yet — resolve blocking issues below.
        </p>
      ) : (
        <div className="divide-y divide-bm-border/25">
          {shots.map((shot) => (
            <div key={shot.crm_account_id} className="grid grid-cols-[1fr_auto] items-start gap-3 px-3 py-2.5">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <p className="truncate text-sm font-medium text-bm-text">{shot.company_name}</p>
                  {shot.recommended_channel === "email" && (
                    <span className="shrink-0 rounded border border-bm-border/30 px-1 py-0.5 text-[9px] font-bold text-bm-muted2">EM</span>
                  )}
                  {shot.recommended_channel === "linkedin" && (
                    <span className="shrink-0 rounded border border-bm-border/30 px-1 py-0.5 text-[9px] font-bold text-bm-muted2">LI</span>
                  )}
                </div>
                {shot.contact_name && (
                  <p className="text-xs text-bm-muted2">
                    {shot.contact_name}{shot.contact_title ? ` · ${shot.contact_title}` : ""}
                  </p>
                )}
                {shot.why_now_trigger && (
                  <p className="mt-0.5 text-[10px] font-medium text-amber-400/90 leading-snug">
                    {shot.why_now_trigger.length > 80
                      ? shot.why_now_trigger.slice(0, 80) + "…"
                      : shot.why_now_trigger}
                  </p>
                )}
                {shot.missing_signals.length > 0 && (
                  <p className="mt-0.5 text-[10px] text-red-400/70">
                    Missing: {shot.missing_signals.slice(0, 2).join(", ").replace(/_/g, " ")}
                    {shot.missing_signals.length > 2 ? ` +${shot.missing_signals.length - 2}` : ""}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1.5">
                <ReadinessBadge score={shot.readiness_score} />
                <span className="rounded border border-bm-accent/40 px-2 py-1 text-[9px] font-semibold text-bm-accent hover:bg-bm-accent/10 cursor-pointer whitespace-nowrap">
                  {shot.cta.length > 22 ? shot.cta.slice(0, 22) + "…" : shot.cta}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// ── Panel 2: Blocking Issues ──────────────────────────────────────────────────

const BLOCKER_LABELS: Record<string, string> = {
  missing_contact:       "No named contact",
  missing_channel:       "No email or LinkedIn",
  missing_pain_thesis:   "No pain thesis",
  missing_matched_offer: "No matched offer",
  missing_proof_asset:   "No ready proof asset",
  no_followup_scheduled: "No follow-up scheduled",
};

function BlockingIssuesPanel({ issues }: { issues: BlockingIssueSummary }) {
  const buckets: Array<{ key: keyof typeof BLOCKER_LABELS; count: number }> = [
    { key: "missing_contact",       count: issues.missing_contact },
    { key: "missing_channel",       count: issues.missing_channel },
    { key: "missing_pain_thesis",   count: issues.missing_pain_thesis },
    { key: "missing_matched_offer", count: issues.missing_matched_offer },
    { key: "missing_proof_asset",   count: issues.missing_proof_asset },
    { key: "no_followup_scheduled", count: issues.no_followup_scheduled },
  ].filter((b) => b.count > 0);

  return (
    <section className="border border-bm-border/40 rounded">
      <SectionHeader
        label="Blocking Issues"
        count={issues.total_blocked}
      />
      {buckets.length === 0 ? (
        <p className="px-3 py-4 text-xs text-bm-muted2">No active blockers.</p>
      ) : (
        <div className="divide-y divide-bm-border/25">
          {buckets.map((b) => {
            const accounts = issues.by_bucket[b.key] ?? [];
            return (
              <details key={b.key} className="group">
                <summary className="flex cursor-pointer items-center justify-between px-3 py-2 list-none">
                  <span className="text-xs text-bm-text">{BLOCKER_LABELS[b.key]}</span>
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-red-500/15 px-1.5 py-0.5 text-[9px] font-bold text-red-400">
                      {b.count}
                    </span>
                    <span className="text-[9px] text-bm-muted2 group-open:rotate-90 transition-transform">▶</span>
                  </div>
                </summary>
                {accounts.length > 0 && (
                  <div className="border-t border-bm-border/20 bg-bm-surface/10 px-3 py-2">
                    {accounts.slice(0, 5).map((a) => (
                      <p key={a.crm_account_id} className="py-0.5 text-[10px] text-bm-muted2">
                        · {a.company_name}
                      </p>
                    ))}
                    {accounts.length > 5 && (
                      <p className="text-[10px] text-bm-muted2">+{accounts.length - 5} more</p>
                    )}
                  </div>
                )}
              </details>
            );
          })}
        </div>
      )}
    </section>
  );
}

// ── Panel 3: Message Queue ────────────────────────────────────────────────────

function MessageQueuePanel({ queue }: { queue: MessageQueueItem[] }) {
  return (
    <section className="border border-bm-border/40 rounded">
      <SectionHeader label="Message Queue" count={queue.length} />
      {queue.length === 0 ? (
        <p className="px-3 py-4 text-xs text-bm-muted2">
          No drafted messages. Use "Draft outreach" on an account.
        </p>
      ) : (
        <div className="divide-y divide-bm-border/25">
          {queue.map((item) => (
            <div key={item.outreach_sequence_id} className="grid grid-cols-[1fr_auto] items-center gap-2 px-3 py-2.5">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="shrink-0 rounded border border-bm-border/30 px-1 py-0.5 text-[9px] font-bold text-bm-muted2 uppercase">
                    {item.channel === "linkedin" ? "LI" : item.channel === "email" ? "EM" : item.channel.slice(0, 2).toUpperCase()}
                  </span>
                  <p className="truncate text-sm font-medium text-bm-text">{item.company_name}</p>
                  <span className="shrink-0 text-[9px] text-bm-muted2">S{item.sequence_stage}</span>
                </div>
                {item.draft_preview && (
                  <p className="mt-0.5 truncate text-[10px] text-bm-muted2">{item.draft_preview}</p>
                )}
                {item.proof_asset_attached && (
                  <p className="text-[9px] text-emerald-400">Asset attached</p>
                )}
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                {item.send_ready ? (
                  <span className="rounded border border-emerald-500/40 px-2 py-1 text-[9px] font-semibold text-emerald-400 cursor-pointer hover:bg-emerald-500/10">
                    Send
                  </span>
                ) : (
                  <span className="rounded border border-amber-500/40 px-2 py-1 text-[9px] font-semibold text-amber-400 cursor-pointer hover:bg-amber-500/10">
                    Approve
                  </span>
                )}
                <span className="text-[9px] text-bm-muted2/60 cursor-pointer hover:text-bm-muted2">
                  Snooze
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// ── Panel 4: Objection Radar ──────────────────────────────────────────────────

const STATIC_OBJECTIONS = [
  {
    summary: "We already use Juniper Square",
    response: "Juniper Square is LP portal + reporting. We handle internal process automation — the coordination layer between your fund ops, acquisitions, and asset management teams that Juniper doesn't touch.",
  },
  {
    summary: "We already use ARGUS",
    response: "ARGUS is an underwriting model. We address the upstream data assembly and downstream distribution work — pulling actuals from your PM system into a governed reporting layer. ARGUS doesn't solve that handoff.",
  },
  {
    summary: "We're not ready for AI yet",
    response: "We don't start with AI — we start with process mapping and data flow. AI is a later layer once the underlying process is governed. The first sprint is workflow, not model deployment.",
  },
  {
    summary: "We can do this with ChatGPT",
    response: "ChatGPT helps individuals work faster. We build institutional workflows — multi-step processes with data sources, approval gates, audit trails, and repeatable outputs. These are different problems.",
  },
];

function ObjectionRadarPanel({ objections }: { objections: ObjectionItem[] }) {
  // Use DB objections if available, otherwise fall back to static
  const items =
    objections.length > 0
      ? objections.map((o) => ({
          summary: o.summary,
          response: o.response_strategy ?? "No counter-script recorded yet.",
          status: o.outcome,
        }))
      : STATIC_OBJECTIONS.map((o) => ({ ...o, status: null }));

  return (
    <section className="border border-bm-border/40 rounded">
      <SectionHeader label="Objection Radar" count={items.length} />
      <div className="divide-y divide-bm-border/25">
        {items.map((item, i) => (
          <details key={i} className="group">
            <summary className="flex cursor-pointer items-center justify-between px-3 py-2.5 list-none">
              <p className="text-xs font-medium text-bm-text">{item.summary}</p>
              <span className="text-[9px] text-bm-muted2 transition-transform group-open:rotate-90">▶</span>
            </summary>
            <div className="border-t border-bm-border/20 bg-bm-surface/10 px-3 py-2.5">
              <p className="text-xs text-bm-muted2 leading-relaxed">{item.response}</p>
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}

// ── Panel 5: Proof Readiness ──────────────────────────────────────────────────

function ProofReadinessPanel({
  assets,
  envId,
}: {
  assets: ProofReadinessItem[];
  envId: string;
}) {
  return (
    <section className="border border-bm-border/40 rounded">
      <SectionHeader
        label="Proof Readiness"
        action="Manage"
        actionHref={`/lab/env/${envId}/consulting/proof-assets`}
      />
      <div className="divide-y divide-bm-border/25">
        {assets.map((asset) => (
          <div
            key={asset.asset_type}
            className="grid grid-cols-[1fr_auto_auto] items-center gap-3 px-3 py-2"
          >
            <p className="truncate text-xs text-bm-text">{asset.title}</p>
            <StatusBadge status={asset.status} />
            {asset.action_label && (
              <Link
                href={`/lab/env/${envId}/consulting/proof-assets`}
                className="text-[10px] text-bm-accent hover:underline"
              >
                {asset.action_label}
              </Link>
            )}
            {!asset.action_label && <span />}
          </div>
        ))}
      </div>
    </section>
  );
}

// ── Panel 6: Weekly Conversion Strip ──────────────────────────────────────────

function WeeklyStripPanel({ strip }: { strip: WeeklyStripItem }) {
  const cells = [
    { label: "Target", value: String(strip.touches_target), alert: false },
    {
      label: "Sent",
      value: String(strip.sent),
      alert: strip.sent === 0,
    },
    { label: "Replies", value: String(strip.replies), alert: false },
    { label: "Meetings", value: String(strip.meetings_booked), alert: false },
    { label: "Proposals", value: String(strip.proposals_sent), alert: false },
    {
      label: "Reply Rate",
      value: strip.reply_rate_pct !== null ? `${strip.reply_rate_pct}%` : "—",
      alert: false,
    },
  ];

  return (
    <section className="col-span-full border border-bm-border/40 rounded bg-bm-surface/10">
      <div className="flex items-center justify-between border-b border-bm-border/40 px-3 py-2">
        <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-bm-muted2">
          This Week
        </span>
        <span className="text-[9px] text-bm-muted2/60">Resets Monday</span>
      </div>
      <div className="grid grid-cols-6 divide-x divide-bm-border/25 px-0">
        {cells.map((cell) => (
          <div key={cell.label} className="flex flex-col items-center py-2.5">
            <span className={`text-base font-bold tabular-nums leading-none ${cell.alert ? "text-red-400" : "text-bm-text"}`}>
              {cell.value}
            </span>
            <span className="mt-1 text-[9px] uppercase tracking-wide text-bm-muted2">
              {cell.label}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

// ── Root Component ────────────────────────────────────────────────────────────

export function OutreachFlightDeck({
  brief,
  envId,
  onRefresh,
}: {
  brief: DailyBrief;
  envId: string;
  onRefresh: () => void;
}) {
  return (
    <div className="space-y-0 rounded border border-bm-border/50 bg-bm-surface/5">
      {/* Flight deck header */}
      <div className="flex items-center justify-between border-b border-bm-border/50 px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-bm-text">
            Outreach Flight Deck
          </span>
          <span className="rounded bg-bm-surface/30 px-1.5 py-0.5 text-[9px] font-bold text-bm-muted2">
            {brief.total_active_leads} active · {brief.ready_now_count} ready now
          </span>
        </div>
        <button
          onClick={onRefresh}
          className="text-[10px] text-bm-muted2 hover:text-bm-text transition-colors"
        >
          Refresh
        </button>
      </div>

      {/* 2-column grid for the 5 panels */}
      <div className="grid grid-cols-1 gap-0 p-3 lg:grid-cols-2 lg:gap-3">
        <BestShotsPanel shots={brief.best_shots} envId={envId} />
        <BlockingIssuesPanel issues={brief.blocking_issues} />
        <MessageQueuePanel queue={brief.message_queue} />
        <ObjectionRadarPanel objections={brief.objection_radar} />
        <ProofReadinessPanel assets={brief.proof_readiness} envId={envId} />
      </div>

      {/* Weekly strip spans full width */}
      <div className="px-3 pb-3">
        <WeeklyStripPanel strip={brief.weekly_strip} />
      </div>
    </div>
  );
}
