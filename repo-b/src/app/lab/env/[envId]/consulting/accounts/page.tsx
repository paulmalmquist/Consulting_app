"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useConsultingEnv } from "@/components/consulting/ConsultingEnvProvider";
import { Card, CardContent, CardTitle } from "@/components/ui/Card";
import { fetchLeads, type Lead } from "@/lib/cro-api";

function fmtCurrency(raw: number | string | null | undefined): string {
  const n = typeof raw === "string" ? parseFloat(raw) : raw;
  if (n == null || isNaN(n)) return "—";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
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

type FilterType = "all" | "qualified" | "high_score";

export default function AccountsPage({ params }: { params: { envId: string } }) {
  const { businessId, ready, loading: contextLoading, error: contextError } = useConsultingEnv();
  const [accounts, setAccounts] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [dataError, setDataError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterType>("all");

  useEffect(() => {
    if (!ready) return;
    if (!businessId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setDataError(null);
    fetchLeads(params.envId, businessId)
      .then((data) => {
        setAccounts(data);
      })
      .catch((err) => {
        setDataError(formatError(err));
      })
      .finally(() => setLoading(false));
  }, [businessId, params.envId, ready]);

  const sortedAccounts = useMemo(
    () =>
      [...accounts].sort((a, b) => {
        const aQualified = Boolean(a.qualified_at);
        const bQualified = Boolean(b.qualified_at);
        if (aQualified !== bQualified) return aQualified ? -1 : 1;
        if (b.lead_score !== a.lead_score) return b.lead_score - a.lead_score;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }),
    [accounts],
  );

  const visibleAccounts = useMemo(() => {
    if (filter === "qualified") {
      return sortedAccounts.filter((acc) => Boolean(acc.qualified_at));
    }
    if (filter === "high_score") {
      return sortedAccounts.filter((acc) => acc.lead_score >= 70);
    }
    return sortedAccounts;
  }, [filter, sortedAccounts]);

  const qualifiedCount = useMemo(
    () => accounts.filter((acc) => Boolean(acc.qualified_at)).length,
    [accounts],
  );

  const highScoreCount = useMemo(
    () => accounts.filter((acc) => acc.lead_score >= 70).length,
    [accounts],
  );

  const bannerMessage = contextError || dataError;
  const isLoading = contextLoading || (ready && loading);

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-20 bg-bm-surface/60 border border-bm-border/60 rounded-lg animate-pulse" />
        ))}
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

      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <CardTitle>Accounts</CardTitle>
          <p className="text-sm text-bm-muted mt-2">
            Manage accounts and track qualification pipeline.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setFilter("all")}
            className={`rounded-lg px-3 py-2 text-sm font-medium ${
              filter === "all"
                ? "bg-bm-accent text-white"
                : "border border-bm-border hover:bg-bm-surface/30"
            }`}
          >
            All
          </button>
          <button
            onClick={() => setFilter("qualified")}
            className={`rounded-lg px-3 py-2 text-sm font-medium ${
              filter === "qualified"
                ? "bg-bm-accent text-white"
                : "border border-bm-border hover:bg-bm-surface/30"
            }`}
          >
            Qualified
          </button>
          <button
            onClick={() => setFilter("high_score")}
            className={`rounded-lg px-3 py-2 text-sm font-medium ${
              filter === "high_score"
                ? "bg-bm-accent text-white"
                : "border border-bm-border hover:bg-bm-surface/30"
            }`}
          >
            High Score (&gt;= 70)
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card>
          <CardContent className="py-4">
            <p className="text-xs text-bm-muted2 uppercase tracking-[0.1em]">Total Accounts</p>
            <p className="text-2xl font-semibold mt-1">{accounts.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <p className="text-xs text-bm-muted2 uppercase tracking-[0.1em]">Qualified</p>
            <p className="text-2xl font-semibold mt-1">{qualifiedCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <p className="text-xs text-bm-muted2 uppercase tracking-[0.1em]">High Score</p>
            <p className="text-2xl font-semibold mt-1">{highScoreCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <p className="text-xs text-bm-muted2 uppercase tracking-[0.1em]">Total Budget</p>
            <p className="text-2xl font-semibold mt-1">
              {fmtCurrency(accounts.reduce((sum, acc) => sum + (acc.estimated_budget || 0), 0))}
            </p>
          </CardContent>
        </Card>
      </div>

      <div>
        <h2 className="text-xs uppercase tracking-[0.12em] text-bm-muted2 mb-3">
          Accounts ({visibleAccounts.length})
        </h2>
        {visibleAccounts.length === 0 ? (
          <Card>
            <CardContent className="py-6 text-center">
              <p className="text-sm text-bm-muted2">
                {accounts.length === 0
                  ? "No accounts yet. Add an account to get started."
                  : "No accounts match this filter."}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {visibleAccounts.map((account) => (
              <Link
                key={account.crm_account_id}
                href={`/lab/env/${params.envId}/consulting/accounts/${account.crm_account_id}`}
              >
                <Card className="hover:bg-bm-surface/30 transition">
                  <CardContent className="py-3 flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium truncate">{account.company_name}</p>
                        <span className={`text-xs font-semibold ${
                          account.lead_score >= 70
                            ? "text-bm-success"
                            : account.lead_score >= 40
                              ? "text-bm-warning"
                              : "text-bm-muted2"
                        }`}>
                          {account.lead_score}
                        </span>
                        {account.qualified_at ? (
                          <span className="text-xs bg-bm-success/10 text-bm-success px-1.5 py-0.5 rounded">
                            Qualified
                          </span>
                        ) : null}
                        {account.disqualified_at ? (
                          <span className="text-xs bg-bm-danger/10 text-bm-danger px-1.5 py-0.5 rounded">
                            Disqualified
                          </span>
                        ) : null}
                      </div>
                      <p className="text-xs text-bm-muted2 mt-0.5">
                        {account.industry || "—"} · {account.company_size || "—"} · {fmtCurrency(account.estimated_budget)}
                      </p>
                    </div>
                    <div className="text-right text-xs text-bm-muted2">
                      {account.ai_maturity || "—"}
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
