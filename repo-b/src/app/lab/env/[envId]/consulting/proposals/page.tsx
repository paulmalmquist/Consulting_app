"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useConsultingEnv } from "@/components/consulting/ConsultingEnvProvider";
import { Card, CardContent } from "@/components/ui/Card";
import { fetchProposals, type Proposal } from "@/lib/cro-api";

function fmtCurrency(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function fmtPct(n: number | null): string {
  if (n === null || n === undefined) return "—";
  return `${(n * 100).toFixed(0)}%`;
}

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-bm-muted/10 text-bm-muted",
  sent: "bg-bm-accent/10 text-bm-accent",
  viewed: "bg-bm-warning/10 text-bm-warning",
  accepted: "bg-bm-success/10 text-bm-success",
  rejected: "bg-bm-danger/10 text-bm-danger",
  expired: "bg-bm-muted/10 text-bm-muted2",
};

export default function ProposalsPage({
  params,
}: {
  params: { envId: string };
}) {
  const { businessId } = useConsultingEnv();
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string | null>(null);

  useEffect(() => {
    if (!businessId) return;
    setLoading(true);
    fetchProposals(params.envId, businessId, filter ? { status: filter } : undefined)
      .then(setProposals)
      .catch(() => setProposals([]))
      .finally(() => setLoading(false));
  }, [businessId, params.envId, filter]);

  const base = `/lab/env/${params.envId}/consulting`;

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 bg-bm-surface/60 rounded animate-pulse" />
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-20 bg-bm-surface/60 border border-bm-border/60 rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  const statusFilters = [null, "draft", "sent", "viewed", "accepted", "rejected"];

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-bm-muted2 uppercase tracking-[0.1em]">Status:</span>
        {statusFilters.map((s) => (
          <button
            key={s ?? "all"}
            onClick={() => setFilter(s)}
            className={`text-xs px-2 py-1 rounded transition-colors ${
              filter === s
                ? "bg-bm-accent/20 text-bm-accent"
                : "bm-glass-interactive text-bm-muted2"
            }`}
          >
            {s ?? "All"}
          </button>
        ))}
      </div>

      {/* Proposals list */}
      {proposals.length === 0 ? (
        <Card>
          <CardContent className="py-6 text-center">
            <p className="text-sm text-bm-muted2">
              No proposals{filter ? ` with status "${filter}"` : ""}. Create one to get started.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {proposals.map((p) => (
            <Card key={p.id}>
              <CardContent className="py-3">
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium truncate">{p.title}</p>
                      <span className={`text-xs px-1.5 py-0.5 rounded ${STATUS_STYLES[p.status] || ""}`}>
                        {p.status}
                      </span>
                      <span className="text-xs text-bm-muted2">v{p.version}</span>
                    </div>
                    <p className="text-xs text-bm-muted2 mt-0.5">
                      {p.account_name || "No account"} ·{" "}
                      {p.pricing_model || "—"} ·{" "}
                      Margin: {fmtPct(p.margin_pct)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold">{fmtCurrency(p.total_value)}</p>
                    <p className="text-xs text-bm-muted2">
                      Cost: {fmtCurrency(p.cost_estimate)}
                    </p>
                  </div>
                </div>
                {p.scope_summary && (
                  <p className="text-xs text-bm-muted mt-2 line-clamp-2">
                    {p.scope_summary}
                  </p>
                )}
                <div className="flex items-center justify-between mt-2">
                  <span className="text-xs text-bm-muted2">
                    {p.valid_until ? `Valid until ${p.valid_until}` : "No expiry"}
                  </span>
                  <span className="text-xs text-bm-muted2">
                    {new Date(p.created_at).toLocaleDateString()}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
