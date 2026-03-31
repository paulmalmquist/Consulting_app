"use client";

import Link from "next/link";
import { useEffect, useState, useCallback } from "react";
import { useConsultingEnv } from "@/components/consulting/ConsultingEnvProvider";
import { ActivityTimeline } from "@/components/consulting/ActivityTimeline";
import { NextActionPanel } from "@/components/consulting/NextActionPanel";
import { Card, CardContent, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import {
  createConsultingOpportunity,
  fetchAccountDetail,
  fetchAccountContacts,
  fetchAccountOpportunities,
  fetchActivities,
  fetchNextActions,
  generateProposal,
  updateLeadStage,
  type AccountDetail,
  type AccountContact,
  type OpportunityDetail,
  type Activity,
  type NextAction,
} from "@/lib/cro-api";

function formatError(err: unknown): string {
  if (!(err instanceof Error)) {
    return "Consulting API unreachable. Backend service is not available.";
  }
  const msg = err.message.replace(/\s*\(req:\s*[a-zA-Z0-9_-]+\)\s*$/, "");
  if (msg.includes("Network error")) {
    return "Consulting API unreachable. Backend service is not available.";
  }
  return msg || "Consulting API unreachable. Backend service is not available.";
}

function fmtCurrency(raw: number | string | null | undefined): string {
  const n = typeof raw === "string" ? parseFloat(raw) : raw;
  if (n == null || isNaN(n)) return "—";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

export default function AccountDetailPage({
  params,
}: {
  params: { envId: string; accountId: string };
}) {
  const { businessId, ready, loading: contextLoading, error: contextError } = useConsultingEnv();
  const [account, setAccount] = useState<AccountDetail | null>(null);
  const [contacts, setContacts] = useState<AccountContact[]>([]);
  const [opportunities, setOpportunities] = useState<OpportunityDetail[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [actions, setActions] = useState<NextAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [dataError, setDataError] = useState<string | null>(null);
  const [showConvertForm, setShowConvertForm] = useState(false);
  const [convertName, setConvertName] = useState("");
  const [convertAmount, setConvertAmount] = useState("");
  const [convertDays, setConvertDays] = useState("60");
  const [converting, setConverting] = useState(false);
  const [generatingProposal, setGeneratingProposal] = useState(false);

  const loadData = useCallback(async () => {
    if (!ready || !businessId) {
      if (ready && !businessId) setLoading(false);
      return;
    }
    setLoading(true);
    setDataError(null);
    try {
      const [accData, contactsData, oppData, actData, actionData] = await Promise.all([
        fetchAccountDetail(params.accountId, params.envId, businessId),
        fetchAccountContacts(params.accountId, params.envId, businessId),
        fetchAccountOpportunities(params.accountId, params.envId, businessId),
        fetchActivities(params.envId, businessId, { account_id: params.accountId, limit: 50 }),
        fetchNextActions(params.envId, businessId),
      ]);
      setAccount(accData);
      setContacts(contactsData);
      setOpportunities(oppData);
      setActivities(actData.filter((a: Activity) => a.crm_account_id === params.accountId));
      setActions(actionData.filter((a: NextAction) => a.entity_id === params.accountId));
    } catch (err) {
      setDataError(formatError(err));
    } finally {
      setLoading(false);
    }
  }, [businessId, params.accountId, params.envId, ready]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const bannerMessage = contextError || dataError;
  const isLoading = contextLoading || (ready && loading);

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
      {bannerMessage ? (
        <div className="rounded-lg border border-bm-danger/35 bg-bm-danger/10 px-4 py-3 text-sm text-bm-text">
          {bannerMessage}
        </div>
      ) : null}

      {account ? (
        <>
          <section className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h1 className="text-2xl font-semibold text-bm-text">{account.company_name}</h1>
                <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-bm-muted2">
                  {account.industry ? (
                    <span>
                      Industry: <span className="text-bm-text font-medium">{account.industry}</span>
                    </span>
                  ) : null}
                  {account.account_type ? (
                    <span>
                      Type: <span className="text-bm-text font-medium">{account.account_type}</span>
                    </span>
                  ) : null}
                  {account.employee_count ? (
                    <span>
                      Employees: <span className="text-bm-text font-medium">{account.employee_count}</span>
                    </span>
                  ) : null}
                </div>
                {account.website ? (
                  <div className="mt-2">
                    <a href={account.website} target="_blank" rel="noopener noreferrer" className="text-sm text-bm-accent hover:underline">
                      {account.website}
                    </a>
                  </div>
                ) : null}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  disabled={generatingProposal || !businessId}
                  onClick={async () => {
                    if (!businessId) return;
                    setGeneratingProposal(true);
                    try {
                      await generateProposal({
                        env_id: params.envId,
                        business_id: businessId,
                        crm_account_id: params.accountId,
                      });
                      void loadData();
                    } catch (e) {
                      setDataError(formatError(e));
                    } finally {
                      setGeneratingProposal(false);
                    }
                  }}
                >
                  {generatingProposal ? "Generating..." : "Generate Proposal"}
                </Button>
                <Link
                  href={`/lab/env/${params.envId}/consulting/accounts`}
                  className="rounded-lg border border-bm-border px-3 py-2 text-sm hover:bg-bm-surface/30"
                >
                  Back to Accounts
                </Link>
              </div>
            </div>
          </section>

          {account.score_breakdown && Object.keys(account.score_breakdown).length > 0 ? (
            <section className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xs uppercase tracking-[0.12em] text-bm-muted2">Lead Score Breakdown</h2>
                {account.lead_score != null ? (
                  <span className="text-sm font-semibold text-bm-accent">{account.lead_score} / 100</span>
                ) : null}
              </div>
              <div className="space-y-2">
                {Object.entries(account.score_breakdown).map(([key, factor]) => {
                  const pct = Math.min(Math.max((factor.value / 20) * 100, 0), 100);
                  const barColor = pct >= 70 ? "bg-emerald-500" : pct >= 40 ? "bg-amber-500" : "bg-rose-500";
                  const factorLabels: Record<string, string> = {
                    ai_maturity: "AI Maturity",
                    pain_category: "Pain Severity",
                    company_size: "Company Size",
                    estimated_budget: "Budget Signal",
                    lead_source: "Source Quality",
                  };
                  return (
                    <div key={key} className="flex items-center gap-3">
                      <span className="text-xs text-bm-muted2 w-36 shrink-0">{factorLabels[key] || key}</span>
                      <div className="flex-1 h-1.5 bg-bm-border/40 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${barColor}`} style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-xs font-medium text-bm-text w-12 text-right">{factor.value}/{20}</span>
                    </div>
                  );
                })}
              </div>
            </section>
          ) : null}

          {/* Pipeline Stage */}
          <section className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-5">
            <h2 className="text-xs uppercase tracking-[0.12em] text-bm-muted2 mb-3">Pipeline Stage</h2>
            {(() => {
              const stages = ["research", "identified", "contacted", "engaged", "meeting", "qualified", "proposal", "closed_won", "closed_lost"];
              const stageLabels: Record<string, string> = {
                research: "Research", identified: "Identified", contacted: "Contacted",
                engaged: "Engaged", meeting: "Meeting", qualified: "Qualified",
                proposal: "Proposal", closed_won: "Closed Won", closed_lost: "Closed Lost",
              };
              const currentStage = account.pipeline_stage || "research";
              const currentIdx = stages.indexOf(currentStage);
              return (
                <div className="flex flex-wrap gap-1.5">
                  {stages.filter(s => s !== "closed_lost").map((stage, idx) => {
                    const isCurrent = stage === currentStage;
                    const isPast = idx < currentIdx && currentStage !== "closed_lost";
                    const isClickable = !isCurrent && stage !== "closed_lost";
                    return (
                      <button
                        key={stage}
                        disabled={!isClickable}
                        onClick={async () => {
                          if (!isClickable) return;
                          try {
                            await updateLeadStage(params.accountId, params.envId, businessId!, stage);
                            void loadData();
                          } catch (e) {
                            console.error("Stage update failed:", e);
                          }
                        }}
                        className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                          isCurrent
                            ? "bg-bm-accent text-white"
                            : isPast
                            ? "bg-bm-accent/20 text-bm-accent border border-bm-accent/30"
                            : "bg-bm-surface/20 text-bm-muted2 border border-bm-border/50 hover:bg-bm-surface/40"
                        } ${isClickable ? "cursor-pointer" : "cursor-default"}`}
                      >
                        {stageLabels[stage]}
                      </button>
                    );
                  })}
                </div>
              );
            })()}
          </section>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Card>
              <CardContent className="py-4">
                <p className="text-xs text-bm-muted2 uppercase tracking-[0.1em]">Contacts</p>
                <p className="text-2xl font-semibold mt-1">{contacts.length}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="py-4">
                <p className="text-xs text-bm-muted2 uppercase tracking-[0.1em]">Opportunities</p>
                <p className="text-2xl font-semibold mt-1">{opportunities.length}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="py-4">
                <p className="text-xs text-bm-muted2 uppercase tracking-[0.1em]">Pipeline Value</p>
                <p className="text-2xl font-semibold mt-1">
                  {fmtCurrency(opportunities.reduce((sum, opp) => sum + (opp.amount || 0), 0))}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="py-4">
                <p className="text-xs text-bm-muted2 uppercase tracking-[0.1em]">Recent Activity</p>
                <p className="text-2xl font-semibold mt-1">{activities.length}</p>
              </CardContent>
            </Card>
          </div>

          {actions.length > 0 ? (
            <NextActionPanel
              title="Pending Actions"
              actions={actions}
              businessId={businessId!}
              onUpdate={() => void loadData()}
            />
          ) : null}

          <div>
            <h2 className="text-xs uppercase tracking-[0.12em] text-bm-muted2 mb-3">
              Contacts ({contacts.length})
            </h2>
            {contacts.length === 0 ? (
              <Card>
                <CardContent className="py-6 text-center">
                  <p className="text-sm text-bm-muted2">No contacts at this account.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                {contacts.map((contact) => (
                  <Card key={contact.crm_contact_id}>
                    <CardContent className="py-3">
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <Link
                            href={`/lab/env/${params.envId}/consulting/contacts/${contact.crm_contact_id}`}
                            className="text-sm font-medium text-bm-accent hover:underline"
                          >
                            {contact.full_name}
                          </Link>
                          <div className="flex items-center gap-2 mt-0.5">
                            {contact.title ? (
                              <span className="text-xs text-bm-muted2">{contact.title}</span>
                            ) : null}
                            {contact.decision_role ? (
                              <span className="text-[10px] uppercase tracking-wide rounded-full bg-bm-surface/40 px-2 py-0.5 text-bm-muted2 border border-bm-border/50">
                                {contact.decision_role}
                              </span>
                            ) : null}
                            {contact.relationship_strength ? (
                              <span className="text-[10px] uppercase tracking-wide rounded-full bg-bm-surface/40 px-2 py-0.5 text-bm-muted2">
                                {contact.relationship_strength}
                              </span>
                            ) : null}
                          </div>
                          {contact.email || contact.phone ? (
                            <div className="flex flex-wrap gap-2 mt-1 text-xs text-bm-muted2">
                              {contact.email ? <a href={`mailto:${contact.email}`} className="text-bm-accent hover:underline">{contact.email}</a> : null}
                              {contact.phone ? <span>{contact.phone}</span> : null}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>

          <div>
            <h2 className="text-xs uppercase tracking-[0.12em] text-bm-muted2 mb-3">
              Opportunities ({opportunities.length})
            </h2>
            {opportunities.length === 0 ? (
              <Card>
                <CardContent className="py-6">
                  {showConvertForm ? (
                    <div className="space-y-3">
                      <p className="text-sm font-semibold text-bm-text">Create Opportunity</p>
                      <input
                        type="text"
                        placeholder="Opportunity name"
                        value={convertName}
                        onChange={(e) => setConvertName(e.target.value)}
                        className="w-full rounded-lg border border-bm-border bg-bm-bg px-3 py-2 text-sm"
                      />
                      <div className="grid grid-cols-2 gap-3">
                        <input
                          type="text"
                          placeholder="Amount (e.g. 150000)"
                          value={convertAmount}
                          onChange={(e) => setConvertAmount(e.target.value)}
                          className="rounded-lg border border-bm-border bg-bm-bg px-3 py-2 text-sm"
                        />
                        <input
                          type="text"
                          placeholder="Days to close (e.g. 60)"
                          value={convertDays}
                          onChange={(e) => setConvertDays(e.target.value)}
                          className="rounded-lg border border-bm-border bg-bm-bg px-3 py-2 text-sm"
                        />
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          disabled={converting || !convertName.trim() || !convertAmount.trim()}
                          onClick={async () => {
                            if (!businessId) return;
                            setConverting(true);
                            try {
                              const closeDate = new Date();
                              closeDate.setDate(closeDate.getDate() + parseInt(convertDays || "60"));
                              await createConsultingOpportunity({
                                business_id: businessId,
                                name: convertName,
                                amount: convertAmount,
                                crm_account_id: params.accountId,
                                expected_close_date: closeDate.toISOString().split("T")[0],
                              });
                              setShowConvertForm(false);
                              setConvertName("");
                              setConvertAmount("");
                              void loadData();
                            } catch (e) {
                              setDataError(formatError(e));
                            } finally {
                              setConverting(false);
                            }
                          }}
                        >
                          {converting ? "Creating..." : "Create Opportunity"}
                        </Button>
                        <Button size="sm" variant="secondary" onClick={() => setShowConvertForm(false)}>
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center">
                      <p className="text-sm text-bm-muted2 mb-3">No opportunities at this account.</p>
                      <Button
                        size="sm"
                        onClick={() => {
                          setConvertName(account ? `${account.company_name} - AI Engagement` : "");
                          setConvertAmount(account?.estimated_budget ? String(Math.round(Number(account.estimated_budget))) : "");
                          setShowConvertForm(true);
                        }}
                      >
                        Convert to Opportunity
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                {opportunities.map((opp) => (
                  <Card key={opp.crm_opportunity_id}>
                    <CardContent className="py-3">
                      <div className="flex items-center justify-between">
                        <div className="flex-1 min-w-0">
                          <Link
                            href={`/lab/env/${params.envId}/consulting/pipeline/${opp.crm_opportunity_id}`}
                            className="text-sm font-medium text-bm-accent hover:underline"
                          >
                            {opp.name}
                          </Link>
                          <p className="text-xs text-bm-muted2">
                            {opp.stage_label || "No stage"} · {fmtCurrency(opp.amount)}
                          </p>
                        </div>
                        {opp.expected_close_date ? (
                          <span className="text-xs text-bm-muted2 whitespace-nowrap">
                            Close: {new Date(opp.expected_close_date).toLocaleDateString()}
                          </span>
                        ) : null}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>

          <div>
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
          </div>
        </>
      ) : (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-sm text-bm-muted2">Account not found.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
