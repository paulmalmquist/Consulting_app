"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { useParams } from "next/navigation";

import {
  approveTradeIntent,
  getPostTradeReviews,
  getTradeAccountSummary,
  getTradeAlerts,
  getTradeControlState,
  getTradeIntents,
  getTradeOrders,
  getTradePositions,
  getTradePromotionChecklist,
  runTradeRiskCheck,
  setTradeKillSwitch,
  setTradeMode,
  submitTradeIntent,
} from "@/lib/bos-api";
import { useBusinessContext } from "@/lib/business-context";
import type {
  AccountSummary,
  ExecutionControlState,
  ExecutionEvent,
  ExecutionOrder,
  PortfolioPosition,
  PostTradeReview,
  PromotionChecklist,
  TradeIntent,
} from "@/lib/trades/types";

function toNumber(value: number | string | null | undefined): number {
  const num = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(num) ? num : 0;
}

function formatMoney(value: number | string | null | undefined): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(toNumber(value));
}

function formatPct(value: number | string | null | undefined): string {
  return `${toNumber(value).toFixed(1)}%`;
}

function badgeTone(value: string): string {
  if (value === "approved" || value === "filled" || value === "pass" || value === "paper") {
    return "border-emerald-400/40 bg-emerald-500/10 text-emerald-200";
  }
  if (value === "blocked" || value === "error" || value === "critical") {
    return "border-rose-400/40 bg-rose-500/10 text-rose-200";
  }
  if (value === "reduce" || value === "warning" || value === "live_enabled") {
    return "border-amber-400/40 bg-amber-500/10 text-amber-100";
  }
  return "border-white/10 bg-white/5 text-slate-200";
}

function formatTime(value?: string | null): string {
  if (!value) return "-";
  return new Date(value).toLocaleString();
}

export default function ExecutionWorkspacePage() {
  const params = useParams<{ envId: string }>();
  const envId = params?.envId;
  const { businessId } = useBusinessContext();
  const [isPending, startTransition] = useTransition();

  const [summary, setSummary] = useState<AccountSummary | null>(null);
  const [control, setControl] = useState<ExecutionControlState | null>(null);
  const [intents, setIntents] = useState<TradeIntent[]>([]);
  const [orders, setOrders] = useState<ExecutionOrder[]>([]);
  const [positions, setPositions] = useState<PortfolioPosition[]>([]);
  const [alerts, setAlerts] = useState<ExecutionEvent[]>([]);
  const [reviews, setReviews] = useState<PostTradeReview[]>([]);
  const [checklist, setChecklist] = useState<PromotionChecklist | null>(null);
  const [selectedIntentId, setSelectedIntentId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadExecutionWorkspace() {
    if (!businessId) return;
    setError(null);
    try {
      const [nextSummary, nextControl, nextIntents, nextOrders, nextPositions, nextAlerts, nextReviews, nextChecklist] = await Promise.all([
        getTradeAccountSummary(businessId),
        getTradeControlState(businessId),
        getTradeIntents(businessId, { envId }),
        getTradeOrders(businessId),
        getTradePositions(businessId),
        getTradeAlerts(businessId),
        getPostTradeReviews(businessId),
        getTradePromotionChecklist(businessId),
      ]);
      setSummary(nextSummary);
      setControl(nextControl);
      setIntents(nextIntents);
      setOrders(nextOrders);
      setPositions(nextPositions);
      setAlerts(nextAlerts);
      setReviews(nextReviews);
      setChecklist(nextChecklist);
      setSelectedIntentId((current) => current ?? nextIntents[0]?.trade_intent_id ?? null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load execution workspace");
    }
  }

  useEffect(() => {
    void loadExecutionWorkspace();
  }, [businessId, envId]);

  const selectedIntent = intents.find((intent) => intent.trade_intent_id === selectedIntentId) ?? intents[0] ?? null;

  function runAction(action: () => Promise<void>) {
    startTransition(() => {
      void action();
    });
  }

  function handleRiskCheck(tradeIntentId: string) {
    runAction(async () => {
      if (!businessId) return;
      await runTradeRiskCheck(tradeIntentId, businessId);
      await loadExecutionWorkspace();
    });
  }

  function handleApprove(tradeIntentId: string) {
    runAction(async () => {
      if (!businessId) return;
      await approveTradeIntent(tradeIntentId, {
        business_id: businessId,
        approved_by: "lab_operator",
        approval_notes: "Approved from Trading Lab execution workspace.",
      });
      await loadExecutionWorkspace();
    });
  }

  function handleSubmit(tradeIntentId: string) {
    runAction(async () => {
      if (!businessId) return;
      await submitTradeIntent(tradeIntentId, {
        business_id: businessId,
        actor: "lab_operator",
        broker_account_mode: "paper",
      });
      await loadExecutionWorkspace();
    });
  }

  function handleKillSwitch(nextValue: boolean) {
    runAction(async () => {
      if (!businessId) return;
      const reason = window.prompt(
        nextValue ? "Reason for activating the kill switch" : "Reason for clearing the kill switch",
        nextValue ? "Manual risk pause from Trading Lab" : "Manual reset after review",
      );
      if (!reason) return;
      await setTradeKillSwitch({
        business_id: businessId,
        activate: nextValue,
        reason,
        changed_by: "lab_operator",
      });
      await loadExecutionWorkspace();
    });
  }

  function handleModeChange(targetMode: "paper" | "live_disabled" | "live_enabled") {
    runAction(async () => {
      if (!businessId) return;
      let confirmationPhrase: string | undefined;
      if (targetMode === "live_enabled") {
        confirmationPhrase = window.prompt("Type ENABLE LIVE TRADING to confirm the mode change.") ?? undefined;
      }
      await setTradeMode({
        business_id: businessId,
        target_mode: targetMode,
        changed_by: "lab_operator",
        reason: `Mode change requested from env ${envId ?? "unknown"}`,
        confirmation_phrase: confirmationPhrase,
      });
      await loadExecutionWorkspace();
    });
  }

  if (!businessId) {
    return (
      <div className="min-h-full bg-slate-950 px-6 py-8 text-slate-100">
        <div className="mx-auto max-w-5xl rounded-3xl border border-white/10 bg-white/5 p-8">
          <h1 className="text-3xl font-semibold tracking-tight">Execution Workspace</h1>
          <p className="mt-3 max-w-2xl text-sm text-slate-300">
            Select a Business OS business first so Winston knows which control state, limits, and broker projections to load.
          </p>
          <Link href={`/lab/env/${envId}/markets`} className="mt-6 inline-flex rounded-full border border-white/15 px-4 py-2 text-sm text-slate-200 transition hover:bg-white/10">
            Back to Trading Lab
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.18),_transparent_28%),radial-gradient(circle_at_top_right,_rgba(251,191,36,0.14),_transparent_24%),linear-gradient(180deg,_#020617_0%,_#0f172a_52%,_#111827_100%)] px-6 py-8 text-slate-100">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <div className="flex flex-col gap-4 rounded-[28px] border border-white/10 bg-slate-950/70 p-6 shadow-2xl shadow-black/30 backdrop-blur">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="text-xs uppercase tracking-[0.32em] text-emerald-200/80">Winston Execution Layer</div>
              <h1 className="mt-2 font-serif text-4xl tracking-tight text-white">Paper-first execution with explicit control gates.</h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">
                Research can originate here, but it does not bypass validation. Every intent is sized, checked, routed, logged, and visibly blocked when the control state is hostile.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              <Link href={`/lab/env/${envId}/markets`} className="rounded-full border border-white/15 px-4 py-2 text-slate-200 transition hover:bg-white/10">
                Trading Lab
              </Link>
              <button onClick={() => handleModeChange("paper")} className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-4 py-2 text-emerald-100 transition hover:bg-emerald-500/20">
                Force Paper
              </button>
              <button onClick={() => handleModeChange("live_enabled")} className="rounded-full border border-amber-400/30 bg-amber-500/10 px-4 py-2 text-amber-100 transition hover:bg-amber-500/20">
                Enable Live Mode
              </button>
              <button
                onClick={() => handleKillSwitch(!(control?.kill_switch_active ?? false))}
                className="rounded-full border border-rose-400/30 bg-rose-500/10 px-4 py-2 text-rose-100 transition hover:bg-rose-500/20"
              >
                {control?.kill_switch_active ? "Clear Kill Switch" : "Activate Kill Switch"}
              </button>
            </div>
          </div>
          {error ? <div className="rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">{error}</div> : null}
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="text-xs uppercase tracking-[0.28em] text-slate-400">Broker</div>
              <div className="mt-2 text-2xl font-semibold text-white">{summary?.broker_connected ? "Connected" : "Offline"}</div>
              <div className="mt-1 text-sm text-slate-400">IBKR localhost gateway</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="text-xs uppercase tracking-[0.28em] text-slate-400">Account Mode</div>
              <div className={`mt-2 inline-flex rounded-full border px-3 py-1 text-sm ${badgeTone(control?.current_mode ?? "paper")}`}>
                {control?.current_mode ?? "paper"}
              </div>
              <div className="mt-2 text-sm text-slate-400">Live submission remains rollout-gated.</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="text-xs uppercase tracking-[0.28em] text-slate-400">Kill Switch</div>
              <div className={`mt-2 inline-flex rounded-full border px-3 py-1 text-sm ${badgeTone(control?.kill_switch_active ? "blocked" : "paper")}`}>
                {control?.kill_switch_active ? "Active" : "Clear"}
              </div>
              <div className="mt-2 text-sm text-slate-400">{control?.reason ?? "No active override reason."}</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="text-xs uppercase tracking-[0.28em] text-slate-400">Open Orders</div>
              <div className="mt-2 text-2xl font-semibold text-white">{summary?.open_orders ?? 0}</div>
              <div className="mt-1 text-sm text-slate-400">Orders waiting on fills or cancellation</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="text-xs uppercase tracking-[0.28em] text-slate-400">Positions</div>
              <div className="mt-2 text-2xl font-semibold text-white">{summary?.positions_count ?? 0}</div>
              <div className="mt-1 text-sm text-slate-400">Projected broker positions in {summary?.account_mode ?? "paper"}</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="text-xs uppercase tracking-[0.28em] text-slate-400">Risk Utilization</div>
              <div className="mt-2 text-2xl font-semibold text-white">{formatPct(summary?.risk_utilization_pct)}</div>
              <div className="mt-1 text-sm text-slate-400">Against current guardrails</div>
            </div>
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.25fr_0.95fr]">
          <section className="rounded-[28px] border border-white/10 bg-slate-950/65 p-6 backdrop-blur">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-xs uppercase tracking-[0.28em] text-slate-400">Trade Intent Queue</div>
                <h2 className="mt-2 text-2xl font-semibold text-white">Pending review, approvals, and submissions</h2>
              </div>
              <div className="text-sm text-slate-400">{intents.length} intents</div>
            </div>
            <div className="mt-5 grid gap-3">
              {intents.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-white/15 bg-white/5 p-6 text-sm text-slate-300">
                  No execution intents are loaded for this environment yet. As new History Rhymes forecasts are routed into `trade_intents`, they will appear here for risk review.
                </div>
              ) : (
                intents.map((intent) => {
                  const isActive = selectedIntent?.trade_intent_id === intent.trade_intent_id;
                  return (
                    <button
                      key={intent.trade_intent_id}
                      onClick={() => setSelectedIntentId(intent.trade_intent_id)}
                      className={`rounded-2xl border p-4 text-left transition ${isActive ? "border-emerald-300/50 bg-emerald-500/10" : "border-white/10 bg-white/5 hover:bg-white/10"}`}
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="text-lg font-semibold text-white">{intent.symbol}</div>
                        <div className={`rounded-full border px-2.5 py-1 text-xs ${badgeTone(intent.status)}`}>{intent.status}</div>
                        <div className={`rounded-full border px-2.5 py-1 text-xs ${badgeTone(intent.latest_risk_check?.final_decision ?? "pending")}`}>
                          {intent.latest_risk_check?.final_decision ?? "risk pending"}
                        </div>
                      </div>
                      <p className="mt-2 text-sm leading-6 text-slate-300">{intent.thesis_summary}</p>
                      <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-400">
                        <span>Confidence {intent.confidence_score}</span>
                        <span>Trap risk {intent.trap_risk_score}</span>
                        <span>{formatTime(intent.created_at)}</span>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </section>

          <section className="rounded-[28px] border border-white/10 bg-slate-950/65 p-6 backdrop-blur">
            <div className="text-xs uppercase tracking-[0.28em] text-slate-400">Order Ticket</div>
            <h2 className="mt-2 text-2xl font-semibold text-white">Review before paper routing</h2>
            {selectedIntent ? (
              <div className="mt-5 space-y-4">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <div className="text-2xl font-semibold text-white">{selectedIntent.symbol}</div>
                      <div className="mt-1 text-sm text-slate-400">{selectedIntent.side.toUpperCase()} {selectedIntent.order_type.toUpperCase()}</div>
                    </div>
                    <div className={`rounded-full border px-3 py-1 text-sm ${badgeTone(control?.current_mode ?? "paper")}`}>
                      {control?.current_mode ?? "paper"}
                    </div>
                  </div>
                  <div className="mt-4 grid gap-3 text-sm text-slate-300 md:grid-cols-2">
                    <div>
                      <div className="text-xs uppercase tracking-[0.24em] text-slate-500">Thesis</div>
                      <div className="mt-1 leading-6">{selectedIntent.thesis_summary}</div>
                    </div>
                    <div>
                      <div className="text-xs uppercase tracking-[0.24em] text-slate-500">Invalidation</div>
                      <div className="mt-1 leading-6">{selectedIntent.invalidation_condition}</div>
                    </div>
                    <div>
                      <div className="text-xs uppercase tracking-[0.24em] text-slate-500">Expected Scenario</div>
                      <div className="mt-1 leading-6">{selectedIntent.expected_scenario}</div>
                    </div>
                    <div>
                      <div className="text-xs uppercase tracking-[0.24em] text-slate-500">Sizing Rationale</div>
                      <div className="mt-1 leading-6">{selectedIntent.latest_risk_check?.size_explanation ?? "Run the risk engine to generate a size explanation."}</div>
                    </div>
                  </div>
                </div>
                <div className="grid gap-3 md:grid-cols-3">
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <div className="text-xs uppercase tracking-[0.24em] text-slate-500">Expected Max Loss</div>
                    <div className="mt-2 text-xl font-semibold text-white">{formatMoney(selectedIntent.latest_risk_check?.expected_max_loss)}</div>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <div className="text-xs uppercase tracking-[0.24em] text-slate-500">Recommended Size</div>
                    <div className="mt-2 text-xl font-semibold text-white">{selectedIntent.latest_risk_check?.recommended_size ?? 0}</div>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <div className="text-xs uppercase tracking-[0.24em] text-slate-500">Trap Risk</div>
                    <div className="mt-2 text-xl font-semibold text-white">{selectedIntent.trap_risk_score}</div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => handleRiskCheck(selectedIntent.trade_intent_id)} className="rounded-full border border-white/15 px-4 py-2 text-sm text-slate-100 transition hover:bg-white/10">
                    Run Risk Check
                  </button>
                  <button onClick={() => handleApprove(selectedIntent.trade_intent_id)} className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-100 transition hover:bg-emerald-500/20">
                    Approve Intent
                  </button>
                  <button onClick={() => handleSubmit(selectedIntent.trade_intent_id)} className="rounded-full border border-sky-400/30 bg-sky-500/10 px-4 py-2 text-sm text-sky-100 transition hover:bg-sky-500/20">
                    Submit Paper Order
                  </button>
                </div>
                <div className="rounded-2xl border border-amber-400/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                  Paper is the default. Any attempt to enable live mode still records the audit event, but actual live submission remains disabled for this rollout.
                </div>
              </div>
            ) : (
              <div className="mt-5 rounded-2xl border border-dashed border-white/15 bg-white/5 p-6 text-sm text-slate-300">
                Select a trade intent to inspect its thesis, invalidation, sizing output, and execution controls.
              </div>
            )}
          </section>
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr_0.9fr]">
          <section className="rounded-[28px] border border-white/10 bg-slate-950/65 p-6 backdrop-blur">
            <div className="text-xs uppercase tracking-[0.28em] text-slate-400">Positions Monitor</div>
            <h2 className="mt-2 text-2xl font-semibold text-white">Projected positions and exposure</h2>
            <div className="mt-5 space-y-3">
              {positions.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-white/15 bg-white/5 p-5 text-sm text-slate-300">No reconciled positions yet.</div>
              ) : (
                positions.map((position) => (
                  <div key={position.portfolio_position_id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-lg font-semibold text-white">{position.symbol}</div>
                        <div className="text-sm text-slate-400">{position.account_mode} account</div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm text-slate-300">Qty {position.quantity}</div>
                        <div className="text-xs text-slate-500">{formatMoney(position.market_value)}</div>
                      </div>
                    </div>
                    <div className="mt-3 flex items-center justify-between text-sm text-slate-300">
                      <span>Unrealized</span>
                      <span>{formatMoney(position.unrealized_pnl)}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>

          <section className="rounded-[28px] border border-white/10 bg-slate-950/65 p-6 backdrop-blur">
            <div className="text-xs uppercase tracking-[0.28em] text-slate-400">Execution Journal</div>
            <h2 className="mt-2 text-2xl font-semibold text-white">Orders, alerts, and post-trade discipline</h2>
            <div className="mt-5 space-y-3">
              {orders.slice(0, 4).map((order) => (
                <div key={order.execution_order_id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-base font-semibold text-white">{order.symbol}</div>
                      <div className="text-sm text-slate-400">{order.side.toUpperCase()} {order.quantity} via {order.broker_account_mode}</div>
                    </div>
                    <div className={`rounded-full border px-2.5 py-1 text-xs ${badgeTone(order.last_status)}`}>{order.last_status}</div>
                  </div>
                  <div className="mt-3 text-xs text-slate-500">{formatTime(order.updated_at)}</div>
                </div>
              ))}
              {alerts.slice(0, 3).map((alert) => (
                <div key={alert.execution_event_id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm text-white">{alert.event_message}</div>
                    <div className={`rounded-full border px-2.5 py-1 text-xs ${badgeTone(alert.severity)}`}>{alert.severity}</div>
                  </div>
                  <div className="mt-2 text-xs text-slate-500">{formatTime(alert.created_at)}</div>
                </div>
              ))}
              {reviews.slice(0, 2).map((review) => (
                <div key={review.post_trade_review_id} className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-300">
                  <div className="font-medium text-white">Review for {review.trade_intent_id.slice(0, 8)}</div>
                  <div className="mt-2">Discipline {review.discipline_score ?? "-"} | Execution {review.execution_quality_score ?? "-"}</div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-[28px] border border-white/10 bg-slate-950/65 p-6 backdrop-blur">
            <div className="text-xs uppercase tracking-[0.28em] text-slate-400">Promotion Panel</div>
            <h2 className="mt-2 text-2xl font-semibold text-white">Paper-to-live readiness</h2>
            <div className={`mt-4 inline-flex rounded-full border px-3 py-1 text-sm text-white ${badgeTone(checklist?.ready_for_live ? "approved" : "reduce")}`}>
              {checklist?.ready_for_live ? "Ready for live review" : "Paper incubation still required"}
            </div>
            <div className="mt-5 space-y-3">
              {checklist?.items.map((item) => (
                <div key={item.key} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium text-white">{item.label}</div>
                      {item.note ? <div className="mt-1 text-xs leading-5 text-slate-400">{item.note}</div> : null}
                    </div>
                    <div className={`rounded-full border px-2.5 py-1 text-xs ${badgeTone(item.passed ? "approved" : "reduce")}`}>
                      {item.passed ? "pass" : "pending"}
                    </div>
                  </div>
                  <div className="mt-3 text-xs text-slate-500">Current {String(item.current)} / Required {String(item.required)}</div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>

      {isPending ? (
        <div className="pointer-events-none fixed bottom-6 right-6 rounded-full border border-white/10 bg-slate-950/85 px-4 py-2 text-sm text-slate-200 shadow-lg shadow-black/30">
          Refreshing execution state...
        </div>
      ) : null}
    </div>
  );
}
