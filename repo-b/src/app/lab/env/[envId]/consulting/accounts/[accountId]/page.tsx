"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useConsultingEnv } from "@/components/consulting/ConsultingEnvProvider";
import { ActivityTimeline } from "@/components/consulting/ActivityTimeline";
import { NextActionPanel } from "@/components/consulting/NextActionPanel";
import { Card, CardContent, CardTitle } from "@/components/ui/Card";
import { fetchActivities, fetchNextActions, type Activity, type NextAction } from "@/lib/cro-api";

interface Account {
  crm_account_id: string;
  company_name: string;
  industry?: string;
  website?: string;
  account_type?: string;
  annual_revenue?: number;
  employee_count?: number;
  created_at: string;
}

interface Contact {
  crm_contact_id: string;
  full_name: string;
  email?: string;
  phone?: string;
  title?: string;
  created_at: string;
}

interface Opportunity {
  crm_opportunity_id: string;
  name: string;
  amount?: number;
  stage_key?: string;
  stage_label?: string;
  expected_close_date?: string;
  created_at: string;
}

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
  const [account, setAccount] = useState<Account | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [actions, setActions] = useState<NextAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [dataError, setDataError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready || !businessId) {
      if (ready && !businessId) setLoading(false);
      return;
    }

    setLoading(true);
    setDataError(null);

    Promise.allSettled([
      fetch(
        `/api/consulting/accounts/${params.accountId}?env_id=${params.envId}&business_id=${businessId}`
      ).then((r) => r.json()),
      fetch(
        `/api/consulting/accounts/${params.accountId}/contacts?env_id=${params.envId}&business_id=${businessId}`
      ).then((r) => r.json()),
      fetch(
        `/api/consulting/accounts/${params.accountId}/opportunities?env_id=${params.envId}&business_id=${businessId}`
      ).then((r) => r.json()),
      fetchActivities(params.envId, businessId, { account_id: params.accountId, limit: 50 }),
      fetchNextActions(params.envId, businessId),
    ])
      .then(([accResult, contactsResult, oppResult, actResult, actionResult]) => {
        if (accResult.status === "fulfilled") {
          setAccount(accResult.value);
        }
        if (contactsResult.status === "fulfilled") {
          setContacts(contactsResult.value);
        }
        if (oppResult.status === "fulfilled") {
          setOpportunities(oppResult.value);
        }
        if (actResult.status === "fulfilled") {
          setActivities(
            actResult.value.filter((a: Activity) => a.crm_account_id === params.accountId)
          );
        }
        if (actionResult.status === "fulfilled") {
          setActions(
            actionResult.value.filter((a: NextAction) => a.entity_id === params.accountId)
          );
        }
      })
      .catch((err) => {
        setDataError(formatError(err));
      })
      .finally(() => setLoading(false));
  }, [businessId, params.accountId, params.envId, ready]);

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
              <Link
                href={`/lab/env/${params.envId}/consulting/accounts`}
                className="rounded-lg border border-bm-border px-3 py-2 text-sm hover:bg-bm-surface/30"
              >
                Back to Accounts
              </Link>
            </div>
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
              onUpdate={() => {
                // Reload actions if needed
              }}
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
                          <p className="text-sm font-medium text-bm-text">{contact.full_name}</p>
                          {contact.title ? (
                            <p className="text-xs text-bm-muted2">{contact.title}</p>
                          ) : null}
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
                <CardContent className="py-6 text-center">
                  <p className="text-sm text-bm-muted2">No opportunities at this account.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                {opportunities.map((opp) => (
                  <Card key={opp.crm_opportunity_id}>
                    <CardContent className="py-3">
                      <div className="flex items-center justify-between">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-bm-text">{opp.name}</p>
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
