"use client";

import { useCallback, useEffect, useState } from "react";
import { X } from "lucide-react";
import {
  completeNextAction,
  draftOpportunityOutreach,
  fetchActivities,
  fetchExecutionDetail,
  fetchNextActions,
  fetchOpportunityDetail,
  generateOpportunityFollowups,
  generateOpportunityMeetingPrep,
  simulateOpportunityAction,
  type Activity,
  type ExecutionDetail,
  type NextAction,
  type OpportunityDetail,
} from "@/lib/cro-api";

function fmtCurrency(raw: number | string | null | undefined): string {
  const n = typeof raw === "string" ? parseFloat(raw) : raw;
  if (n == null || isNaN(n)) return "—";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

type Tab = "summary" | "activity" | "execution" | "drafts" | "prep" | "simulate";

export function DealSidePanel({
  dealId,
  envId,
  businessId,
  onClose,
  onDataChange,
}: {
  dealId: string;
  envId: string;
  businessId: string;
  onClose: () => void;
  onDataChange: () => void;
}) {
  const [tab, setTab] = useState<Tab>("execution");
  const [deal, setDeal] = useState<OpportunityDetail | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [nextActions, setNextActions] = useState<NextAction[]>([]);
  const [execution, setExecution] = useState<ExecutionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [simulationAction, setSimulationAction] = useState("send follow-up");
  const [simulationResult, setSimulationResult] = useState<{ expected_outcome: string; reasoning: string } | null>(null);

  const loadDeal = useCallback(async () => {
    if (!dealId || !businessId) return;
    setLoading(true);
    setError(null);
    try {
      const [dealRes, activityRes, actionRes, executionRes] = await Promise.all([
        fetchOpportunityDetail(dealId, envId, businessId),
        fetchActivities(envId, businessId, { opportunity_id: dealId, limit: 20 }),
        fetchNextActions(envId, businessId),
        fetchExecutionDetail(dealId, envId, businessId),
      ]);
      setDeal(dealRes);
      setActivities(activityRes);
      setNextActions(
        actionRes.filter((a) => a.entity_id === dealId && (a.status === "pending" || a.status === "in_progress")),
      );
      setExecution(executionRes);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load deal");
    } finally {
      setLoading(false);
    }
  }, [businessId, dealId, envId]);

  useEffect(() => {
    void loadDeal();
  }, [loadDeal]);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  async function handleCompleteAction(actionId: string) {
    try {
      await completeNextAction(actionId, businessId);
      await loadDeal();
      onDataChange();
    } catch {
      // keep current error state unchanged
    }
  }

  async function runQuickAction(kind: "draft" | "followups" | "prep") {
    setBusyAction(kind);
    setError(null);
    try {
      if (kind === "draft") {
        await draftOpportunityOutreach(dealId, { env_id: envId, business_id: businessId });
      } else if (kind === "followups") {
        await generateOpportunityFollowups(dealId, { env_id: envId, business_id: businessId });
      } else {
        await generateOpportunityMeetingPrep(dealId, { env_id: envId, business_id: businessId });
      }
      await loadDeal();
      onDataChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Quick action failed");
    } finally {
      setBusyAction(null);
    }
  }

  async function runSimulation() {
    setBusyAction("simulate");
    setError(null);
    try {
      const result = await simulateOpportunityAction(dealId, envId, businessId, { action: simulationAction });
      setSimulationResult({ expected_outcome: result.expected_outcome, reasoning: result.reasoning });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Simulation failed");
    } finally {
      setBusyAction(null);
    }
  }

  const tabs: Array<{ key: Tab; label: string }> = [
    { key: "summary", label: "Summary" },
    { key: "activity", label: "Activity" },
    { key: "execution", label: "Execution" },
    { key: "drafts", label: "Drafts" },
    { key: "prep", label: "Prep" },
    { key: "simulate", label: "Simulate" },
  ];

  const draftStack = execution?.auto_draft_stack ?? {};
  const initialDraft = draftStack.initial_outreach as { subject?: string; body?: string } | undefined;
  const followups = (draftStack.followups as Array<{ subject?: string; body?: string; angle_key?: string }> | undefined) ?? [];
  const prep = draftStack.meeting_prep as {
    company_summary?: string;
    likely_pain_points?: string[];
    tailored_demo_path?: string;
    key_questions?: string[];
    risks_to_watch?: string[];
  } | undefined;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} />
      <div className="fixed right-0 top-0 z-50 flex h-full w-full flex-col overflow-hidden border-l border-bm-border bg-bm-bg shadow-2xl md:w-[560px]">
        <div className="flex items-center justify-between border-b border-bm-border/50 px-4 py-3">
          <div className="min-w-0 flex-1">
            {loading ? (
              <div className="h-5 w-40 animate-pulse rounded bg-bm-surface/60" />
            ) : deal ? (
              <>
                <h2 className="truncate text-sm font-semibold text-bm-text">{deal.account_name || "—"}</h2>
                <p className="truncate text-xs text-bm-muted2">
                  {deal.name} · {execution?.card.execution_pressure || "medium"} pressure
                </p>
              </>
            ) : null}
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-bm-muted2 hover:bg-bm-surface/30 hover:text-bm-text">
            <X size={16} />
          </button>
        </div>

        <div className="flex border-b border-bm-border/30 px-4 overflow-x-auto scrollbar-none">
          {tabs.map((item) => (
            <button
              key={item.key}
              onClick={() => setTab(item.key)}
              className={`flex-shrink-0 border-b-2 px-3 py-2 text-xs font-medium transition-colors whitespace-nowrap ${
                tab === item.key ? "border-bm-accent text-bm-text" : "border-transparent text-bm-muted2 hover:text-bm-text"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3">
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => <div key={i} className="h-12 animate-pulse rounded bg-bm-surface/40" />)}
            </div>
          ) : error ? (
            <div className="rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-400">{error}</div>
          ) : tab === "summary" ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2">
                <MetricBox label="Amount" value={fmtCurrency(deal?.amount)} />
                <MetricBox label="Stage" value={execution?.card.execution_column_label || deal?.stage_label || "—"} />
                <MetricBox label="Momentum" value={execution?.card.momentum_status || "—"} />
                <MetricBox label="Drift" value={execution?.card.deal_drift_status || "—"} />
              </div>
              <SectionTitle title="Next Actions" />
              {nextActions.length === 0 ? (
                <p className="text-xs text-red-400">No next action defined. Use Execution to generate one.</p>
              ) : (
                <div className="space-y-1.5">
                  {nextActions.map((action) => (
                    <div key={action.id} className="flex items-center gap-2 rounded-lg border border-bm-border/40 px-3 py-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs text-bm-text">{action.description}</p>
                        <p className="text-[10px] text-bm-muted2">{action.action_type} · due {action.due_date} · {action.priority}</p>
                      </div>
                      <button onClick={() => void handleCompleteAction(action.id)} className="rounded px-2 py-0.5 text-[10px] font-medium text-emerald-400 hover:bg-emerald-400/10">
                        Done
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : tab === "activity" ? (
            <div className="space-y-2">
              {activities.map((item) => (
                <div key={item.crm_activity_id} className="rounded-lg border border-bm-border/40 px-3 py-2">
                  <p className="text-xs font-medium text-bm-text">{item.subject || item.activity_type}</p>
                  <p className="text-[10px] text-bm-muted2">{new Date(item.activity_at).toLocaleString()}</p>
                </div>
              ))}
            </div>
          ) : tab === "execution" ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2">
                <MetricBox label="Pressure" value={execution?.card.execution_pressure || "—"} tone={execution?.card.execution_pressure === "critical" ? "red" : execution?.card.execution_pressure === "high" ? "orange" : undefined} />
                <MetricBox label="Priority" value={String(execution?.card.priority_score || 0)} />
              </div>
              <SectionTitle title="Risk Flags" />
              <div className="flex flex-wrap gap-2">
                {(execution?.card.risk_flags || []).map((flag) => (
                  <span key={flag} className="rounded-full border border-bm-border/50 px-2 py-1 text-[10px] text-bm-muted2">{flag}</span>
                ))}
              </div>
              <SectionTitle title="Next Best Actions" />
              <div className="space-y-2">
                {(execution?.ranked_next_actions || []).map((action) => (
                  <div key={action.action_key} className="rounded-lg border border-bm-border/40 px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-medium text-bm-text">{action.label}</p>
                      <span className="text-[10px] uppercase text-bm-muted2">{action.impact}</span>
                    </div>
                    <p className="mt-1 text-[11px] text-bm-muted2">{action.reasoning}</p>
                  </div>
                ))}
              </div>
              <SectionTitle title="Suggestions" />
              <div className="space-y-2">
                {(execution?.stage_suggestions || []).map((suggestion) => (
                  <div key={suggestion.trigger_source} className="rounded-lg border border-bm-border/40 px-3 py-2">
                    <p className="text-xs font-medium text-bm-text">{suggestion.suggested_execution_column}</p>
                    <p className="mt-1 text-[11px] text-bm-muted2">{suggestion.reasoning}</p>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                <QuickButton label="Draft Outreach" busy={busyAction === "draft"} onClick={() => void runQuickAction("draft")} />
                <QuickButton label="Generate Follow-up" busy={busyAction === "followups"} onClick={() => void runQuickAction("followups")} />
                <QuickButton label="Prep Me" busy={busyAction === "prep"} onClick={() => void runQuickAction("prep")} />
              </div>
            </div>
          ) : tab === "drafts" ? (
            <div className="space-y-4">
              <SectionTitle title="Initial Outreach" />
              <DraftBlock subject={initialDraft?.subject} body={initialDraft?.body} />
              <SectionTitle title="Follow-up Stack" />
              {followups.map((draft, index) => (
                <DraftBlock key={`${draft.angle_key}-${index}`} subject={draft.subject} body={draft.body} label={draft.angle_key} />
              ))}
            </div>
          ) : tab === "prep" ? (
            <div className="space-y-4">
              <SectionTitle title="Company Summary" />
              <p className="text-sm text-bm-text">{prep?.company_summary || "Run Prep Me to generate meeting prep."}</p>
              <SectionTitle title="Tailored Demo Path" />
              <p className="text-sm text-bm-text">{prep?.tailored_demo_path || "—"}</p>
              <SectionTitle title="Key Questions" />
              <ul className="space-y-1 text-sm text-bm-text">
                {(prep?.key_questions || []).map((item) => <li key={item}>• {item}</li>)}
              </ul>
              <SectionTitle title="Risks To Watch" />
              <ul className="space-y-1 text-sm text-bm-text">
                {(prep?.risks_to_watch || []).map((item) => <li key={item}>• {item}</li>)}
              </ul>
            </div>
          ) : (
            <div className="space-y-4">
              <SectionTitle title="Before / After Simulation" />
              <select
                className="w-full rounded-lg border border-bm-border bg-bm-surface/20 px-3 py-2 text-sm text-bm-text"
                value={simulationAction}
                onChange={(e) => setSimulationAction(e.target.value)}
              >
                <option value="send follow-up">send follow-up</option>
                <option value="move to engaged">move to engaged</option>
                <option value="schedule demo">schedule demo</option>
              </select>
              <QuickButton label="Run Simulation" busy={busyAction === "simulate"} onClick={() => void runSimulation()} />
              {simulationResult ? (
                <div className="rounded-lg border border-bm-border/40 px-3 py-2">
                  <p className="text-xs font-medium text-bm-text">Expected outcome: {simulationResult.expected_outcome}</p>
                  <p className="mt-1 text-[11px] text-bm-muted2">{simulationResult.reasoning}</p>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function QuickButton({ label, busy, onClick }: { label: string; busy: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className="rounded-lg border border-bm-border px-3 py-2 text-xs font-medium text-bm-text hover:bg-bm-surface/30 disabled:opacity-50"
    >
      {busy ? "Working..." : label}
    </button>
  );
}

function MetricBox({ label, value, tone }: { label: string; value: string; tone?: "red" | "orange" }) {
  const toneClass = tone === "red" ? "text-red-400" : tone === "orange" ? "text-orange-400" : "text-bm-text";
  return (
    <div className="rounded-lg border border-bm-border/40 px-3 py-2">
      <p className="text-[10px] uppercase tracking-wider text-bm-muted2">{label}</p>
      <p className={`mt-1 text-sm font-semibold ${toneClass}`}>{value}</p>
    </div>
  );
}

function SectionTitle({ title }: { title: string }) {
  return <h3 className="text-xs font-semibold uppercase tracking-wider text-bm-muted2">{title}</h3>;
}

function DraftBlock({ subject, body, label }: { subject?: string; body?: string; label?: string }) {
  return (
    <div className="rounded-lg border border-bm-border/40 px-3 py-2">
      {label ? <p className="mb-1 text-[10px] uppercase tracking-wider text-bm-muted2">{label}</p> : null}
      <p className="text-xs font-medium text-bm-text">{subject || "No draft yet"}</p>
      <pre className="mt-2 whitespace-pre-wrap break-words text-[11px] leading-relaxed text-bm-muted2">{body || "Generate drafts to populate this stack."}</pre>
    </div>
  );
}
