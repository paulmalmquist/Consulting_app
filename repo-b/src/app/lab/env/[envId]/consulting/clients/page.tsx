"use client";

import { useEffect, useState } from "react";
import { useConsultingEnv } from "@/components/consulting/ConsultingEnvProvider";
import { Card, CardContent } from "@/components/ui/Card";
import { fetchClients, type Client } from "@/lib/cro-api";

function fmtCurrency(n: number | null | undefined): string {
  if (n == null || isNaN(n)) return "—";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

const STATUS_STYLES: Record<string, string> = {
  active: "bg-bm-success/10 text-bm-success",
  paused: "bg-bm-warning/10 text-bm-warning",
  churned: "bg-bm-danger/10 text-bm-danger",
  completed: "bg-bm-muted/10 text-bm-muted2",
};

export default function ClientsPage({
  params,
}: {
  params: { envId: string };
}) {
  const { businessId } = useConsultingEnv();
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string | null>(null);

  useEffect(() => {
    if (!businessId) return;
    setLoading(true);
    fetchClients(params.envId, businessId, filter ? { status: filter } : undefined)
      .then(setClients)
      .catch(() => setClients([]))
      .finally(() => setLoading(false));
  }, [businessId, params.envId, filter]);

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

  const statusFilters = [null, "active", "paused", "churned", "completed"];

  const totalLtv = clients.reduce((sum, c) => sum + Number(c.lifetime_value), 0);
  const totalRevenue = clients.reduce((sum, c) => sum + Number(c.total_revenue), 0);

  return (
    <div className="space-y-4">
      {/* Page header */}
      <h1 className="text-lg font-semibold text-bm-text">Clients</h1>

      {/* Summary stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card>
          <CardContent className="py-4">
            <p className="text-xs text-bm-muted2 uppercase tracking-[0.1em]">Total Clients</p>
            <p className="text-2xl font-semibold mt-1">{clients.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <p className="text-xs text-bm-muted2 uppercase tracking-[0.1em]">Active</p>
            <p className="text-2xl font-semibold mt-1">
              {clients.filter((c) => c.client_status === "active").length}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <p className="text-xs text-bm-muted2 uppercase tracking-[0.1em]">Lifetime Value</p>
            <p className="text-2xl font-semibold mt-1">{fmtCurrency(totalLtv)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <p className="text-xs text-bm-muted2 uppercase tracking-[0.1em]">Total Revenue</p>
            <p className="text-2xl font-semibold mt-1">{fmtCurrency(totalRevenue)}</p>
          </CardContent>
        </Card>
      </div>

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

      {/* Clients list */}
      {clients.length === 0 ? (
        <Card>
          <CardContent className="py-6 text-center">
            <p className="text-sm text-bm-muted2">
              No clients{filter ? ` with status "${filter}"` : ""}. Convert a lead to get started.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {clients.map((c) => (
            <Card key={c.id}>
              <CardContent className="py-3">
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium truncate">{c.company_name}</p>
                      <span className={`text-xs px-1.5 py-0.5 rounded ${STATUS_STYLES[c.client_status] || ""}`}>
                        {c.client_status}
                      </span>
                    </div>
                    <p className="text-xs text-bm-muted2 mt-0.5">
                      Owner: {c.account_owner || "Unassigned"} ·{" "}
                      Started: {c.start_date} ·{" "}
                      {c.active_engagements} active engagement{c.active_engagements !== 1 ? "s" : ""}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold">{fmtCurrency(Number(c.total_revenue))}</p>
                    <p className="text-xs text-bm-muted2">LTV: {fmtCurrency(Number(c.lifetime_value))}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
