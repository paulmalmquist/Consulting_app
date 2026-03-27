"use client";

import Link from "next/link";
import { useEffect, useState, useCallback } from "react";
import { useConsultingEnv } from "@/components/consulting/ConsultingEnvProvider";
import { ActivityTimeline } from "@/components/consulting/ActivityTimeline";
import { NextActionPanel } from "@/components/consulting/NextActionPanel";
import { Card, CardContent } from "@/components/ui/Card";
import {
  fetchOpportunityDetail,
  fetchOpportunityContacts,
  fetchOpportunityStageHistory,
  fetchActivities,
  fetchNextActions,
  fetchPipelineStages,
  advanceOpportunityStage,
  type OpportunityDetail,
  type AccountContact,
  type StageHistoryEntry,
  type Activity,
  type NextAction,
  type PipelineStage,
} from "@/lib/cro-api";

function fmtCurrency(raw: number | string | null | undefined): string {
  const n = typeof raw === "string" ? parseFloat(raw) : raw;
  if (n == null || isNaN(n)) return "—";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function relDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diff = Math.floor((now.getTime() - d.getTime()) / 86_400_000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  if (diff < 30) return `${diff}d ago`;
  return d.toLocaleDateString();
}

const STATUS_COLORS: Record<string, string> = {
  open: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  won: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  lost: "bg-red-500/20 text-red-300 border-red-500/30",
};

const STRENGTH_COLORS: Record<string, string> = {
  champion: "bg-emerald-500/20 text-emerald-300",
  hot: "bg-orange-500/20 text-orange-300",
  warm: "bg-yellow-500/20 text-yellow-300",
  cold: "bg-slate-500/20 text-slate-300",
};

export default function OpportunityDetailPage({
  params,
}: {
  params: { envId: string; opportunityId: string };
}) {
  const { businessId, ready, loading: ctxLoading, error: ctxError } = useConsultingEnv();
  const [opp, setOpp] = useState<OpportunityDetail | null>(null);
  const [contacts, setContacts] = useState<AccountContact[]>([]);
  const [history, setHistory] = useState<StageHistoryEntry[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [actions, setActions] = useState<NextAction[]>([]);
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [loading, setLoading] = useState(true);
  const [dataError, setDataError] = useState<string | null>(null);
  const [advancing, setAdvancing] = useState(false);
  const [closeModal, setCloseModal] = useState<{ type: "won" | "lost" } | null>(null);
  const [closeReason, setCloseReason] = useState("");
  const [closeIncumbent, setCloseIncumbent] = useState("");
  const [closeNotes, setCloseNotes] = useState("");

  const loadData = useCallback(async () => {
    if (!ready || !businessId) {
      if (ready && !businessId) setLoading(false);
      return;
    }
    setLoading(true);
    setDataError(null);
    try {
      const [oppData, contactsData, historyData, actData, actionData, stageData] =
        await Promise.all([
          fetchOpportunityDetail(params.opportunityId, params.envId, businessId),
          fetchOpportunityContacts(params.opportunityId, params.envId, businessId),
          fetchOpportunityStageHistory(params.opportunityId, params.envId, businessId),
          fetchActivities(params.envId, businessId, {
            opportunity_id: params.opportunityId,
            limit: 50,
          }),
          fetchNextActions(params.envId, businessId),
          fetchPipelineStages(businessId),
        ]);
      setOpp(oppData);
      setContacts(contactsData);
      setHistory(historyData);
      setActivities(actData);
      setActions(
        actionData.filter((a) => a.entity_id === params.opportunityId)
      );
      setStages(stageData.filter((s) => !s.is_closed));
    } catch (err) {
      setDataError(
        err instanceof Error ? err.message : "Failed to load opportunity."
      );
    } finally {
      setLoading(false);
    }
  }, [ready, businessId, params.opportunityId, params.envId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleAdvance = async (stageKey: string, extra?: { close_reason?: string; competitive_incumbent?: string; close_notes?: string }) => {
    if (!businessId || !opp) return;
    setAdvancing(true);
    try {
      await advanceOpportunityStage({
        env_id: params.envId,
        business_id: businessId,
        opportunity_id: params.opportunityId,
        to_stage_key: stageKey,
        ...extra,
      });
      await loadData();
    } catch (err) {
      setDataError(err instanceof Error ? err.message : "Stage advance failed");
    } finally {
      setAdvancing(false);
    }
  };

  const handleCloseSubmit = async () => {
    if (!closeModal) return;
    const stageKey = closeModal.type === "won" ? "closed_won" : "closed_lost";
    setCloseModal(null);
    await handleAdvance(stageKey, {
      close_reason: closeReason || undefined,
      competitive_incumbent: closeIncumbent || undefined,
      close_notes: closeNotes || undefined,
    });
    setCloseReason("");
    setCloseIncumbent("");
    setCloseNotes("");
  };

  const bannerMessage = ctxError || dataError;
  const isLoading = ctxLoading || (ready && loading);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-32 bg-bm-surface/60 rounded-lg animate-pulse" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 bg-bm-surface/60 rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {bannerMessage && (
        <div className="rounded-lg border border-bm-danger/35 bg-bm-danger/10 px-4 py-3 text-sm text-bm-text">
          {bannerMessage}
        </div>
      )}

      {opp ? (
        <>
          {/* Header */}
          <section className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h1 className="text-2xl font-semibold text-bm-text">{opp.name}</h1>
                <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
                  <span
                    className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${
                      STATUS_COLORS[opp.status] || "bg-bm-surface/30 text-bm-muted2 border-bm-border"
                    }`}
                  >
                    {opp.status.toUpperCase()}
                  </span>
                  {opp.stage_label && (
                    <span className="text-bm-muted2">
                      Stage: <span className="text-bm-text font-medium">{opp.stage_label}</span>
                    </span>
                  )}
                  {opp.win_probability != null && (
                    <span className="text-bm-muted2">
                      Win: <span className="text-bm-text font-medium">{Math.round(opp.win_probability * 100)}%</span>
                    </span>
                  )}
                </div>
                {opp.account_name && (
                  <div className="mt-2 text-sm text-bm-muted2">
                    Account:{" "}
                    {opp.crm_account_id ? (
                      <Link
                        href={`/lab/env/${params.envId}/consulting/accounts/${opp.crm_account_id}`}
                        className="text-bm-accent hover:underline"
                      >
                        {opp.account_name}
                      </Link>
                    ) : (
                      <span className="text-bm-text">{opp.account_name}</span>
                    )}
                  </div>
                )}
              </div>
              <Link
                href={`/lab/env/${params.envId}/consulting/pipeline`}
                className="rounded-lg border border-bm-border px-3 py-2 text-sm hover:bg-bm-surface/30"
              >
                Back to Pipeline
              </Link>
            </div>
          </section>

          {/* Metrics row */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Card>
              <CardContent className="py-4">
                <p className="text-xs text-bm-muted2 uppercase tracking-[0.1em]">Deal Value</p>
                <p className="text-2xl font-semibold mt-1">{fmtCurrency(opp.amount)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="py-4">
                <p className="text-xs text-bm-muted2 uppercase tracking-[0.1em]">Weighted Value</p>
                <p className="text-2xl font-semibold mt-1">
                  {fmtCurrency(
                    opp.amount && opp.win_probability
                      ? opp.amount * opp.win_probability
                      : null
                  )}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="py-4">
                <p className="text-xs text-bm-muted2 uppercase tracking-[0.1em]">Expected Close</p>
                <p className="text-2xl font-semibold mt-1">
                  {opp.expected_close_date
                    ? new Date(opp.expected_close_date).toLocaleDateString()
                    : "—"}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="py-4">
                <p className="text-xs text-bm-muted2 uppercase tracking-[0.1em]">Contacts</p>
                <p className="text-2xl font-semibold mt-1">{contacts.length}</p>
              </CardContent>
            </Card>
          </div>

          {/* Stage Advancement */}
          {opp.status === "open" && stages.length > 0 && (
            <section>
              <h2 className="text-xs uppercase tracking-[0.12em] text-bm-muted2 mb-3">
                Advance Stage
              </h2>
              <div className="flex flex-wrap gap-2">
                {stages.map((stage) => (
                  <button
                    key={stage.key}
                    onClick={() => handleAdvance(stage.key)}
                    disabled={advancing || stage.key === opp.stage_key}
                    className={`rounded-lg border px-3 py-2 text-xs transition-colors ${
                      stage.key === opp.stage_key
                        ? "bg-bm-accent/20 text-bm-accent border-bm-accent/40 font-medium"
                        : "border-bm-border text-bm-muted2 hover:bg-bm-surface/30 hover:text-bm-text"
                    } disabled:opacity-50`}
                  >
                    {stage.label}
                  </button>
                ))}
                <button
                  onClick={() => setCloseModal({ type: "won" })}
                  disabled={advancing}
                  className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-50"
                >
                  Close Won
                </button>
                <button
                  onClick={() => setCloseModal({ type: "lost" })}
                  disabled={advancing}
                  className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300 hover:bg-red-500/20 disabled:opacity-50"
                >
                  Close Lost
                </button>
              </div>
            </section>
          )}

          {/* Closed deal info */}
          {opp.status !== "open" && (opp.close_reason || opp.competitive_incumbent || opp.close_notes) && (
            <section className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-5">
              <h2 className="text-xs uppercase tracking-[0.12em] text-bm-muted2 mb-3">
                {opp.status === "won" ? "Win Details" : "Loss Details"}
              </h2>
              <dl className="space-y-2 text-sm">
                {opp.close_reason && (
                  <div className="flex gap-3">
                    <dt className="text-bm-muted2 w-36 shrink-0">Reason</dt>
                    <dd className="text-bm-text">{opp.close_reason}</dd>
                  </div>
                )}
                {opp.competitive_incumbent && (
                  <div className="flex gap-3">
                    <dt className="text-bm-muted2 w-36 shrink-0">Competitor / Incumbent</dt>
                    <dd className="text-bm-text">{opp.competitive_incumbent}</dd>
                  </div>
                )}
                {opp.close_notes && (
                  <div className="flex gap-3">
                    <dt className="text-bm-muted2 w-36 shrink-0">Notes</dt>
                    <dd className="text-bm-text">{opp.close_notes}</dd>
                  </div>
                )}
                {opp.closed_at && (
                  <div className="flex gap-3">
                    <dt className="text-bm-muted2 w-36 shrink-0">Closed</dt>
                    <dd className="text-bm-text">{new Date(opp.closed_at).toLocaleDateString()}</dd>
                  </div>
                )}
              </dl>
            </section>
          )}

          {/* Next Actions */}
          {actions.length > 0 && (
            <NextActionPanel
              title="Pending Actions"
              actions={actions}
              businessId={businessId!}
              onUpdate={() => void loadData()}
            />
          )}

          {/* Contacts */}
          <section>
            <h2 className="text-xs uppercase tracking-[0.12em] text-bm-muted2 mb-3">
              Related Contacts ({contacts.length})
            </h2>
            {contacts.length === 0 ? (
              <Card>
                <CardContent className="py-6 text-center">
                  <p className="text-sm text-bm-muted2">No contacts linked to this deal.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                {contacts.map((c) => (
                  <Card key={c.crm_contact_id}>
                    <CardContent className="py-3">
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <Link
                              href={`/lab/env/${params.envId}/consulting/contacts/${c.crm_contact_id}`}
                              className="text-sm font-medium text-bm-accent hover:underline"
                            >
                              {c.full_name}
                            </Link>
                            {c.decision_role && (
                              <span className="text-[10px] uppercase tracking-wide rounded-full bg-bm-surface/40 px-2 py-0.5 text-bm-muted2 border border-bm-border/50">
                                {c.decision_role}
                              </span>
                            )}
                            {c.relationship_strength && (
                              <span
                                className={`text-[10px] uppercase tracking-wide rounded-full px-2 py-0.5 ${
                                  STRENGTH_COLORS[c.relationship_strength] || "bg-bm-surface/30 text-bm-muted2"
                                }`}
                              >
                                {c.relationship_strength}
                              </span>
                            )}
                          </div>
                          {c.title && <p className="text-xs text-bm-muted2">{c.title}</p>}
                          <div className="flex flex-wrap gap-2 mt-1 text-xs text-bm-muted2">
                            {c.email && (
                              <a href={`mailto:${c.email}`} className="text-bm-accent hover:underline">
                                {c.email}
                              </a>
                            )}
                            {c.phone && <span>{c.phone}</span>}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </section>

          {/* Stage History */}
          <section>
            <h2 className="text-xs uppercase tracking-[0.12em] text-bm-muted2 mb-3">
              Stage History ({history.length})
            </h2>
            {history.length === 0 ? (
              <Card>
                <CardContent className="py-6 text-center">
                  <p className="text-sm text-bm-muted2">No stage transitions recorded.</p>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="py-4">
                  <div className="space-y-3">
                    {history.map((h) => (
                      <div key={h.id} className="flex items-start gap-3">
                        <div className="w-2 h-2 rounded-full bg-bm-accent mt-1.5 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-bm-text">
                            {h.from_stage_label ? (
                              <>
                                <span className="text-bm-muted2">{h.from_stage_label}</span>
                                {" → "}
                                <span className="font-medium">{h.to_stage_label}</span>
                              </>
                            ) : (
                              <span className="font-medium">Created at {h.to_stage_label}</span>
                            )}
                          </p>
                          {h.note && <p className="text-xs text-bm-muted2 mt-0.5">{h.note}</p>}
                          <p className="text-xs text-bm-muted mt-0.5">{relDate(h.changed_at)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </section>

          {/* Activity Timeline */}
          <section>
            <h2 className="text-xs uppercase tracking-[0.12em] text-bm-muted2 mb-3">
              Activity Timeline ({activities.length})
            </h2>
            {activities.length === 0 ? (
              <Card>
                <CardContent className="py-6 text-center">
                  <p className="text-sm text-bm-muted2">No activities yet.</p>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="py-4">
                  <ActivityTimeline activities={activities} maxItems={20} />
                </CardContent>
              </Card>
            )}
          </section>
        </>
      ) : (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-sm text-bm-muted2">Opportunity not found.</p>
          </CardContent>
        </Card>
      )}

      {/* Close capture modal */}
      {closeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-xl border border-bm-border bg-bm-bg p-6 shadow-xl space-y-4">
            <h2 className="text-lg font-semibold text-bm-text">
              {closeModal.type === "won" ? "Close as Won" : "Close as Lost"}
            </h2>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-bm-muted2 uppercase tracking-[0.1em] mb-1 block">
                  {closeModal.type === "won" ? "Win reason" : "Loss reason"}
                </label>
                <input
                  type="text"
                  value={closeReason}
                  onChange={(e) => setCloseReason(e.target.value)}
                  placeholder={closeModal.type === "won" ? "e.g. Best AI maturity score" : "e.g. Budget cut, went with competitor"}
                  className="w-full rounded-lg border border-bm-border bg-bm-surface/30 px-3 py-2 text-sm text-bm-text placeholder:text-bm-muted focus:outline-none focus:border-bm-accent"
                />
              </div>
              <div>
                <label className="text-xs text-bm-muted2 uppercase tracking-[0.1em] mb-1 block">
                  Competitor / Incumbent (optional)
                </label>
                <input
                  type="text"
                  value={closeIncumbent}
                  onChange={(e) => setCloseIncumbent(e.target.value)}
                  placeholder="e.g. Accenture, in-house team"
                  className="w-full rounded-lg border border-bm-border bg-bm-surface/30 px-3 py-2 text-sm text-bm-text placeholder:text-bm-muted focus:outline-none focus:border-bm-accent"
                />
              </div>
              <div>
                <label className="text-xs text-bm-muted2 uppercase tracking-[0.1em] mb-1 block">
                  Notes (optional)
                </label>
                <textarea
                  value={closeNotes}
                  onChange={(e) => setCloseNotes(e.target.value)}
                  rows={3}
                  placeholder="Any additional context…"
                  className="w-full rounded-lg border border-bm-border bg-bm-surface/30 px-3 py-2 text-sm text-bm-text placeholder:text-bm-muted focus:outline-none focus:border-bm-accent resize-none"
                />
              </div>
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <button
                onClick={() => { setCloseModal(null); setCloseReason(""); setCloseIncumbent(""); setCloseNotes(""); }}
                className="rounded-lg border border-bm-border px-4 py-2 text-sm text-bm-muted2 hover:bg-bm-surface/30"
              >
                Cancel
              </button>
              <button
                onClick={() => void handleCloseSubmit()}
                disabled={advancing}
                className={`rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50 ${
                  closeModal.type === "won"
                    ? "bg-emerald-600 hover:bg-emerald-500 text-white"
                    : "bg-red-700 hover:bg-red-600 text-white"
                }`}
              >
                {advancing ? "Saving…" : closeModal.type === "won" ? "Mark Won" : "Mark Lost"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
