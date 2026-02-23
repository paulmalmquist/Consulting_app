"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

type AnalyticsSnapshot = {
  id: string;
  date: string;
  sessions: number;
  pageviews: number;
  conversions: number;
  revenue: number;
  top_page: string | null;
};

type AnalyticsSummary = {
  sessions_7d: number;
  sessions_30d: number;
  top_page_7d: string | null;
  new_content_30d: number;
  revenue_mtd: number;
  conversion_events_7d: number;
  ranking_changes_30d: number;
};

export default function AnalyticsPage() {
  const params = useParams<{ envId: string }>();
  const envId = params.envId;

  const [snapshots, setSnapshots] = useState<AnalyticsSnapshot[]>([]);
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const today = new Date().toISOString().split("T")[0];
  const [date, setDate] = useState(today);
  const [sessions, setSessions] = useState("");
  const [pageviews, setPageviews] = useState("");
  const [conversions, setConversions] = useState("");
  const [revenue, setRevenue] = useState("");
  const [topPage, setTopPage] = useState("");

  const refresh = useCallback(async () => {
    const [snapshotsData, summaryData] = await Promise.all([
      apiFetch<AnalyticsSnapshot[]>(`/api/website/analytics/snapshots?env_id=${envId}&days=30`),
      apiFetch<AnalyticsSummary>(`/api/website/analytics/summary?env_id=${envId}`),
    ]);
    setSnapshots(snapshotsData);
    setSummary(summaryData);
  }, [envId]);

  useEffect(() => {
    refresh().catch(() => null);
  }, [refresh]);

  async function onLogSnapshot(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await apiFetch("/api/website/analytics/snapshots", {
        method: "POST",
        body: JSON.stringify({
          env_id: envId,
          date,
          sessions: parseInt(sessions) || 0,
          pageviews: parseInt(pageviews) || 0,
          conversions: parseInt(conversions) || 0,
          revenue: parseFloat(revenue) || 0,
          top_page: topPage || null,
        }),
      });
      setSessions("");
      setPageviews("");
      setConversions("");
      setRevenue("");
      setTopPage("");
      setShowForm(false);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to log snapshot");
    }
  }

  const kpis = summary
    ? [
        { label: "Sessions (7d)", value: summary.sessions_7d.toLocaleString() },
        { label: "Sessions (30d)", value: summary.sessions_30d.toLocaleString() },
        { label: "Top Page", value: summary.top_page_7d ?? "—" },
        { label: "Revenue MTD", value: summary.revenue_mtd > 0 ? `$${summary.revenue_mtd.toLocaleString()}` : "—" },
        { label: "Conversions (7d)", value: summary.conversion_events_7d },
      ]
    : [];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.14em] text-bm-muted2">Analytics</p>
          <h1 className="text-2xl font-bold">Website Analytics</h1>
          <p className="text-sm text-bm-muted mt-1">
            Manual entry — future integration hooks available
          </p>
        </div>
        <Button onClick={() => setShowForm((v) => !v)}>
          {showForm ? "Cancel" : "Log Snapshot"}
        </Button>
      </div>

      {error ? (
        <div className="rounded-lg border border-bm-danger/30 bg-bm-danger/10 px-4 py-3 text-sm">
          {error}
        </div>
      ) : null}

      {/* Summary KPI row */}
      {summary ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {kpis.map((kpi) => (
            <Card key={kpi.label}>
              <CardContent className="py-4">
                <p className="text-xs text-bm-muted2 uppercase tracking-[0.1em]">{kpi.label}</p>
                <p className="text-2xl font-semibold mt-1 truncate">{kpi.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : null}

      {/* Log snapshot form */}
      {showForm ? (
        <Card>
          <CardContent className="py-4">
            <form onSubmit={onLogSnapshot} className="space-y-4">
              <h2 className="font-semibold">Log Analytics Snapshot</h2>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                <div>
                  <label className="text-xs text-bm-muted">Date</label>
                  <Input
                    className="mt-1"
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label className="text-xs text-bm-muted">Sessions</label>
                  <Input
                    className="mt-1"
                    type="number"
                    min="0"
                    value={sessions}
                    onChange={(e) => setSessions(e.target.value)}
                    placeholder="0"
                  />
                </div>
                <div>
                  <label className="text-xs text-bm-muted">Pageviews</label>
                  <Input
                    className="mt-1"
                    type="number"
                    min="0"
                    value={pageviews}
                    onChange={(e) => setPageviews(e.target.value)}
                    placeholder="0"
                  />
                </div>
                <div>
                  <label className="text-xs text-bm-muted">Conversions</label>
                  <Input
                    className="mt-1"
                    type="number"
                    min="0"
                    value={conversions}
                    onChange={(e) => setConversions(e.target.value)}
                    placeholder="0"
                  />
                </div>
                <div>
                  <label className="text-xs text-bm-muted">Revenue ($)</label>
                  <Input
                    className="mt-1"
                    type="number"
                    min="0"
                    step="0.01"
                    value={revenue}
                    onChange={(e) => setRevenue(e.target.value)}
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <label className="text-xs text-bm-muted">Top Page</label>
                  <Input
                    className="mt-1"
                    value={topPage}
                    onChange={(e) => setTopPage(e.target.value)}
                    placeholder="/best-bagels-palm-beach"
                  />
                </div>
              </div>
              <Button type="submit">Save Snapshot</Button>
            </form>
          </CardContent>
        </Card>
      ) : null}

      {/* Snapshot table */}
      <div>
        <h2 className="text-xs uppercase tracking-[0.12em] text-bm-muted2 mb-3">
          Last 30 Days
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-bm-border/50 text-left">
                {["Date", "Sessions", "Pageviews", "Conversions", "Revenue", "Top Page"].map((h) => (
                  <th key={h} className="pb-2 pr-4 text-xs text-bm-muted2 font-medium uppercase">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-bm-border/30">
              {snapshots.map((snap) => (
                <tr key={snap.id}>
                  <td className="py-2.5 pr-4 font-mono text-xs">{snap.date}</td>
                  <td className="py-2.5 pr-4">{snap.sessions.toLocaleString()}</td>
                  <td className="py-2.5 pr-4">{snap.pageviews.toLocaleString()}</td>
                  <td className="py-2.5 pr-4">{snap.conversions}</td>
                  <td className="py-2.5 pr-4">
                    {snap.revenue > 0 ? `$${Number(snap.revenue).toLocaleString()}` : "—"}
                  </td>
                  <td className="py-2.5 text-bm-muted text-xs truncate max-w-[180px]">
                    {snap.top_page ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {snapshots.length === 0 ? (
            <p className="text-sm text-bm-muted text-center py-6">
              No analytics data yet. Log your first snapshot above.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
