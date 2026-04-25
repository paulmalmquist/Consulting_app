"use client";

import Link from "next/link";
import {
  Badge,
  Caps,
  Dot,
  RailModule,
  fmtUSD,
  fmtUSDK,
} from "@/components/operator/command-desk";
import type {
  TodayMoveRow,
  PipelineRisksOut,
  RecentActivityRow,
  RecentClosesOut,
  OutreachBriefOut,
} from "@/types/pipeline-rail";
import type { NvKPIBar } from "@/types/nv-accounting";

// ---------- Today's Moves ------------------------------------------------

const REASON_COLORS: Record<string, string> = {
  overdue_action_active_deal: "var(--sem-error)",
  no_action_active_stage: "var(--neon-amber)",
  proposal_no_followup: "var(--neon-amber)",
  high_value_idle: "var(--neon-violet)",
  outreach_ready_for_next_touch: "var(--neon-cyan)",
  discovery_no_scheduled_step: "var(--neon-cyan)",
};

export function TodayMovesPanel({ moves }: { moves: TodayMoveRow[] | null }) {
  return (
    <RailModule
      title="TODAY'S MOVES"
      accent="var(--neon-cyan)"
      caption={moves ? `${moves.length} prioritized` : ""}
    >
      {!moves || moves.length === 0 ? (
        <EmptyRow label="No moves scored above threshold." />
      ) : (
        moves.map((m, i) => (
          <div
            key={m.id}
            style={{
              padding: "8px 12px",
              borderBottom: i < moves.length - 1 ? "1px solid var(--line-1)" : "none",
              display: "grid",
              gridTemplateColumns: "1fr auto",
              gap: 6,
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontFamily: "var(--font-sans)",
                  fontSize: 12,
                  color: "var(--fg-1)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {m.reason_text}
              </div>
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 9,
                  color: REASON_COLORS[m.reason_code] ?? "var(--fg-3)",
                  letterSpacing: ".08em",
                  textTransform: "uppercase",
                  marginTop: 2,
                }}
              >
                {m.reason_code.replaceAll("_", " ")}
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 11,
                  color: "var(--fg-1)",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {m.amount ? fmtUSDK(m.amount) : "—"}
              </div>
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 9,
                  color: "var(--fg-3)",
                }}
              >
                p{m.priority_score}
              </div>
            </div>
          </div>
        ))
      )}
    </RailModule>
  );
}

// ---------- Pipeline Risks ------------------------------------------------

const RISK_ROWS: Array<{ key: keyof PipelineRisksOut["counts"]; label: string; tone: "error" | "warn" | "neutral" }> = [
  { key: "no_next_action", label: "Deals w/ no next action", tone: "error" },
  { key: "stuck_in_outreach", label: "Stuck in outreach", tone: "warn" },
  { key: "in_proposal_no_followup", label: "Proposal · no follow-up", tone: "warn" },
  { key: "idle_gt_7d", label: "Idle > 7 days", tone: "warn" },
  { key: "drifting", label: "Drifting", tone: "warn" },
  { key: "at_risk", label: "At risk", tone: "error" },
];

export function PipelineRisksPanel({ data }: { data: PipelineRisksOut | null }) {
  return (
    <RailModule title="PIPELINE RISKS" accent="var(--sem-error)">
      {!data ? (
        <EmptyRow label="Loading…" />
      ) : (
        <>
          {RISK_ROWS.map((r) => {
            const v = (data.counts?.[r.key] ?? 0) as number;
            return (
              <div
                key={r.key}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr auto",
                  padding: "6px 12px",
                  borderBottom: "1px solid var(--line-1)",
                  alignItems: "center",
                }}
              >
                <span style={{ fontFamily: "var(--font-sans)", fontSize: 12, color: "var(--fg-2)" }}>
                  {r.label}
                </span>
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 12,
                    color:
                      v === 0
                        ? "var(--fg-3)"
                        : r.tone === "error"
                        ? "var(--sem-down)"
                        : "var(--neon-amber)",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {v}
                </span>
              </div>
            );
          })}
          {data.no_action_hotlist && data.no_action_hotlist.length > 0 && (
            <>
              <div
                style={{
                  padding: "8px 12px 4px",
                  borderBottom: "1px solid var(--line-1)",
                  borderTop: "1px solid var(--line-2)",
                }}
              >
                <Caps color="var(--sem-error)">NO-ACTION HOTLIST</Caps>
              </div>
              {data.no_action_hotlist.map((d, i) => (
                <div
                  key={d.deal_id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr auto",
                    padding: "6px 12px",
                    borderBottom:
                      i < data.no_action_hotlist.length - 1
                        ? "1px solid var(--line-1)"
                        : "none",
                    borderLeft: "2px solid var(--sem-error)",
                    background: "rgba(255,31,61,.03)",
                  }}
                >
                  <div>
                    <div style={{ fontFamily: "var(--font-sans)", fontSize: 12, color: "var(--fg-1)" }}>
                      {d.account_name}
                    </div>
                    <div
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 10,
                        color: "var(--sem-down)",
                        marginTop: 1,
                      }}
                    >
                      {d.stage} · idle {d.days_since_last_touch ?? "—"}d
                    </div>
                  </div>
                  <div
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 11,
                      color: "var(--fg-1)",
                      fontVariantNumeric: "tabular-nums",
                      alignSelf: "center",
                    }}
                  >
                    {d.amount ? fmtUSDK(d.amount) : "—"}
                  </div>
                </div>
              ))}
            </>
          )}
        </>
      )}
    </RailModule>
  );
}

// ---------- Outreach Engine -----------------------------------------------

export function OutreachEnginePanel({ data }: { data: OutreachBriefOut | null }) {
  const rows = [
    { label: "Follow-ups due today", value: data?.followups_due_today ?? "—" },
    { label: "No-touch in outreach", value: data?.no_touch_in_outreach ?? "—" },
    { label: "Touches this week", value: data?.touches_this_week ?? "—" },
    { label: "Replies this week", value: data?.replies_this_week ?? "—" },
    { label: "Top vertical by response", value: data?.top_vertical_by_response ?? "—" },
  ];
  return (
    <RailModule title="OUTREACH ENGINE" accent="var(--neon-violet)">
      {rows.map((r, i) => (
        <div
          key={r.label}
          style={{
            display: "grid",
            gridTemplateColumns: "1fr auto",
            padding: "6px 12px",
            borderBottom: i < rows.length - 1 ? "1px solid var(--line-1)" : "none",
            alignItems: "center",
          }}
        >
          <span style={{ fontFamily: "var(--font-sans)", fontSize: 12, color: "var(--fg-2)" }}>
            {r.label}
          </span>
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 12,
              color: "var(--fg-1)",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {r.value}
          </span>
        </div>
      ))}
    </RailModule>
  );
}

// ---------- Recent Activity ----------------------------------------------

const ACTIVITY_COLORS: Record<string, string> = {
  stage_advanced: "var(--neon-cyan)",
  outreach_sent: "var(--neon-cyan)",
  reply_received: "var(--sem-up)",
  meeting_booked: "var(--sem-up)",
  proposal_sent: "var(--neon-amber)",
  next_action_completed: "var(--sem-up)",
  next_action_created: "var(--neon-violet)",
  closed_won: "var(--sem-up)",
  closed_lost: "var(--sem-down)",
};

function relTime(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const mins = Math.round((now - then) / 60_000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.round(hrs / 24);
  return `${days}d`;
}

export function RecentActivityPanel({ rows }: { rows: RecentActivityRow[] | null }) {
  return (
    <RailModule title="RECENT ACTIVITY" accent="var(--neon-cyan)">
      {!rows || rows.length === 0 ? (
        <EmptyRow label="No recent activity." />
      ) : (
        rows.slice(0, 12).map((r, i) => (
          <div
            key={`${r.ts}-${i}`}
            style={{
              display: "grid",
              gridTemplateColumns: "auto 1fr auto",
              gap: 8,
              padding: "6px 12px",
              borderBottom: i < rows.length - 1 ? "1px solid var(--line-1)" : "none",
              alignItems: "center",
            }}
          >
            <Dot color={ACTIVITY_COLORS[r.kind] ?? "var(--fg-3)"} size={5} />
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontFamily: "var(--font-sans)",
                  fontSize: 12,
                  color: "var(--fg-1)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {r.description}
              </div>
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 10,
                  color: "var(--fg-3)",
                  marginTop: 1,
                }}
              >
                {r.kind.replaceAll("_", " ")} · {r.account_name}
              </div>
            </div>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--fg-3)" }}>
              {relTime(r.ts)}
            </span>
          </div>
        ))
      )}
    </RailModule>
  );
}

// ---------- Wins / Losses ------------------------------------------------

export function WinsLossesPanel({ data, envId }: { data: RecentClosesOut | null; envId?: string }) {
  if (!data) return <RailModule title="WINS / LOSSES" accent="var(--sem-up)"><EmptyRow label="Loading…" /></RailModule>;
  return (
    <RailModule
      title="WINS / LOSSES"
      accent="var(--sem-up)"
      caption={`+${fmtUSDK(data.win_total)} / -${fmtUSDK(data.loss_total)}`}
    >
      {data.wins.length > 0 && (
        <>
          <div style={{ padding: "6px 12px 2px" }}>
            <Caps color="var(--sem-up)">WON · {data.wins.length}</Caps>
          </div>
          {data.wins.map((w, i) => (
            <div
              key={`w-${w.deal_id}`}
              style={{
                display: "grid",
                gridTemplateColumns: "1fr auto",
                padding: "4px 12px",
                borderBottom: i < data.wins.length - 1 ? "1px solid var(--line-1)" : "none",
              }}
            >
              <span style={{ fontFamily: "var(--font-sans)", fontSize: 12, color: "var(--fg-1)" }}>
                {w.account_name}
              </span>
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 11,
                  color: "var(--sem-up)",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                +{fmtUSDK(w.amount || 0)}
              </span>
            </div>
          ))}
        </>
      )}
      {data.losses.length > 0 && (
        <>
          <div style={{ padding: "6px 12px 2px", borderTop: "1px solid var(--line-2)" }}>
            <Caps color="var(--sem-down)">LOST · {data.losses.length}</Caps>
          </div>
          {data.losses.map((l, i) => (
            <div
              key={`l-${l.deal_id}`}
              style={{
                display: "grid",
                gridTemplateColumns: "1fr auto",
                padding: "4px 12px",
                borderBottom: i < data.losses.length - 1 ? "1px solid var(--line-1)" : "none",
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontFamily: "var(--font-sans)", fontSize: 12, color: "var(--fg-1)" }}>
                  {l.account_name}
                </div>
                {l.loss_reason && (
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--fg-3)", marginTop: 1 }}>
                    {l.loss_reason}
                  </div>
                )}
              </div>
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 11,
                  color: "var(--sem-down)",
                  fontVariantNumeric: "tabular-nums",
                  alignSelf: "center",
                }}
              >
                -{fmtUSDK(l.amount || 0)}
              </span>
            </div>
          ))}
        </>
      )}
      {data.wins.length === 0 && data.losses.length === 0 && (
        <EmptyRow label="No recent closes." />
      )}
      {envId && (
        <div style={{ padding: "6px 12px", borderTop: "1px solid var(--line-2)" }}>
          <Link
            href={`/lab/env/${envId}/consulting/pipeline/lost`}
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              color: "var(--neon-amber)",
              letterSpacing: ".08em",
              textTransform: "uppercase",
              textDecoration: "none",
              border: 0,
            }}
          >
            View lost deals ›
          </Link>
        </div>
      )}
    </RailModule>
  );
}

// ---------- Finance Snapshot (cross-mode link) ----------------------------

export function FinanceSnapshotPanel({ kpis, envId }: { kpis: NvKPIBar | null; envId?: string }) {
  const tiles = kpis?.tiles ?? [];
  const pick = (key: string) => tiles.find((t) => t.key === key);
  const rows = [
    { label: "Unpaid invoices", tile: pick("unpaid") },
    { label: "Cash in 30d",     tile: pick("cash-in") },
    { label: "Cash out 30d",    tile: pick("cash-out") },
  ];
  return (
    <RailModule title="FINANCE SNAPSHOT" accent="var(--sem-up)">
      {rows.map((r, i) => (
        <div
          key={r.label}
          style={{
            display: "grid",
            gridTemplateColumns: "1fr auto",
            padding: "6px 12px",
            borderBottom: i < rows.length - 1 ? "1px solid var(--line-1)" : "none",
          }}
        >
          <span style={{ fontFamily: "var(--font-sans)", fontSize: 12, color: "var(--fg-2)" }}>
            {r.label}
          </span>
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 12,
              color: "var(--fg-1)",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {r.tile?.value ?? "—"}
          </span>
        </div>
      ))}
      {envId && (
        <div style={{ padding: "6px 12px", borderTop: "1px solid var(--line-2)" }}>
          <Link
            href={`/lab/env/${envId}/operator/accounting`}
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              color: "var(--neon-cyan)",
              letterSpacing: ".08em",
              textTransform: "uppercase",
              textDecoration: "none",
              border: 0,
            }}
          >
            Open accounting ›
          </Link>
        </div>
      )}
    </RailModule>
  );
}

// ---------- Helpers -------------------------------------------------------

function EmptyRow({ label }: { label: string }) {
  return (
    <div
      style={{
        padding: "14px 12px",
        color: "var(--fg-3)",
        fontSize: 11,
        fontFamily: "var(--font-sans)",
      }}
    >
      {label}
    </div>
  );
}
