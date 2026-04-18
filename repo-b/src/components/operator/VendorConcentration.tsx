"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useDomainEnv } from "@/components/domain/DomainEnvProvider";
import {
  getOperatorVendorConcentration,
  OperatorVendorConcentrationBoard,
  OperatorVendorConcentrationRow,
} from "@/lib/bos-api";

const SEVERITY_TONE: Record<string, string> = {
  high: "border-red-500/40 bg-red-500/15 text-red-400",
  medium: "border-amber-500/40 bg-amber-500/15 text-amber-300",
  low: "border-bm-border/50 bg-white/5 text-bm-muted2",
};

const TREND_TONE: Record<string, string> = {
  improving: "text-green-400",
  stable: "text-bm-muted2",
  declining: "text-red-400",
};

function fmtPct(v: number | null | undefined, digits = 1): string {
  if (v == null) return "—";
  return `${v.toFixed(digits)}%`;
}

function fmtRate(v: number | null | undefined): string {
  if (v == null) return "—";
  return `${Math.round(v * 100)}%`;
}

function fmtCost(v: number | null | undefined): string {
  if (v == null) return "—";
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v}`;
}

export default function VendorConcentration() {
  const { envId, businessId } = useDomainEnv();
  const [board, setBoard] = useState<OperatorVendorConcentrationBoard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await getOperatorVendorConcentration(envId, businessId || undefined);
        if (!cancelled) setBoard(data);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load vendor concentration.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [envId, businessId]);

  if (loading) {
    return <p className="text-sm text-bm-muted2">Loading vendor concentration…</p>;
  }
  if (error) {
    return <p className="text-sm text-red-400">{error}</p>;
  }
  if (!board || board.vendors.length === 0) {
    return <p className="text-sm text-bm-muted2">No vendor performance data available.</p>;
  }

  const { totals } = board;
  const flaggedVendor = board.vendors.find(
    (v) => v.concentration_severity === "high"
  );

  return (
    <div className="space-y-4">
      {/* Headline */}
      <div
        className="rounded-2xl border border-bm-border/60 bg-black/30 p-4"
        data-testid="vendor-concentration-headline"
      >
        <p className="text-sm text-bm-text">
          {flaggedVendor ? (
            <>
              <span className="font-semibold text-red-400">
                {flaggedVendor.vendor_name}
              </span>{" "}
              is on{" "}
              <span className="font-semibold text-bm-text">
                {fmtPct(flaggedVendor.concentration_pct, 0)}
              </span>{" "}
              of active jobs — concentration flagged. {flaggedVendor.delay_correlation}
            </>
          ) : (
            <>No single vendor exceeds the 40% concentration threshold.</>
          )}
        </p>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiTile
          label="Vendors tracked"
          value={totals.vendor_count.toString()}
        />
        <KpiTile
          label="Flagged ≥40%"
          value={totals.flagged_count.toString()}
          tone={totals.flagged_count > 0 ? "warn" : undefined}
        />
        <KpiTile
          label="Max concentration"
          value={fmtPct(totals.max_concentration_pct, 0)}
          tone={totals.max_concentration_pct >= 40 ? "warn" : undefined}
        />
        <KpiTile
          label="Portfolio on-time"
          value={fmtRate(totals.portfolio_on_time_rate)}
        />
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-2xl border border-bm-border/60">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-bm-border/60 bg-black/40 text-left text-[11px] uppercase tracking-[0.14em] text-bm-muted2">
              <th className="px-3 py-2">Vendor</th>
              <th className="px-3 py-2">Concentration</th>
              <th className="px-3 py-2">On-time</th>
              <th className="px-3 py-2">Budget adherence</th>
              <th className="px-3 py-2">Avg delay</th>
              <th className="px-3 py-2">At-risk projects</th>
              <th className="px-3 py-2">Trend</th>
            </tr>
          </thead>
          <tbody>
            {board.vendors.map((v) => (
              <VendorRow key={v.vendor_id} vendor={v} />
            ))}
          </tbody>
        </table>
      </div>

      {/* Flagged vendor detail — if any */}
      {flaggedVendor && flaggedVendor.impact?.if_ignored?.in_30_days && (
        <div
          data-testid="vendor-if-ignored"
          className="rounded-2xl border border-red-500/30 bg-red-500/5 p-4"
        >
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-red-400">
            If ignored 30d
          </p>
          <p className="mt-1 text-sm text-bm-text">
            +{fmtCost(flaggedVendor.impact.if_ignored.in_30_days.estimated_cost_usd)} ·{" "}
            +{flaggedVendor.impact.if_ignored.in_30_days.estimated_delay_days}d
          </p>
          {flaggedVendor.impact.if_ignored.in_30_days.secondary_effects?.length ? (
            <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs text-bm-muted2">
              {flaggedVendor.impact.if_ignored.in_30_days.secondary_effects.map((eff, i) => (
                <li key={i}>{eff}</li>
              ))}
            </ul>
          ) : null}
        </div>
      )}
    </div>
  );
}

function VendorRow({ vendor: v }: { vendor: OperatorVendorConcentrationRow }) {
  const severity = v.concentration_severity ?? "low";
  return (
    <tr className="border-b border-bm-border/40 last:border-b-0">
      <td className="px-3 py-2">
        <div className="font-medium text-bm-text">{v.vendor_name}</div>
        {v.category && <div className="text-xs text-bm-muted2">{v.category}</div>}
        {v.linked_projects.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {v.linked_projects.slice(0, 3).map((p) => (
              <Link
                key={p.project_id}
                href={p.href ?? "#"}
                className="rounded-full border border-bm-border/50 bg-white/5 px-2 py-0.5 text-[10px] text-bm-muted2 hover:bg-white/10 hover:text-bm-text"
              >
                {p.project_name ?? p.project_id}
              </Link>
            ))}
          </div>
        )}
      </td>
      <td className="px-3 py-2">
        <span
          data-testid={`vendor-concentration-pill-${v.vendor_id}`}
          className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${SEVERITY_TONE[severity]}`}
        >
          {fmtPct(v.concentration_pct, 0)}
        </span>
        <div className="mt-1 text-[11px] text-bm-muted2">
          {v.active_project_count ?? "—"} of {v.total_active_jobs_denominator ?? "—"} jobs
        </div>
      </td>
      <td className="px-3 py-2">
        <span className={v.on_time_warn ? "text-amber-300" : "text-bm-text"}>
          {fmtRate(v.on_time_rate)}
        </span>
      </td>
      <td className="px-3 py-2 text-bm-text">{fmtPct(v.budget_adherence_pct, 0)}</td>
      <td className="px-3 py-2 text-bm-text">
        {v.avg_delay_days != null ? `${v.avg_delay_days}d` : "—"}
      </td>
      <td className="px-3 py-2 text-bm-text">{v.at_risk_project_count ?? 0}</td>
      <td className={`px-3 py-2 text-xs uppercase tracking-[0.12em] ${TREND_TONE[v.trend ?? "stable"]}`}>
        {v.trend ?? "—"}
      </td>
    </tr>
  );
}

function KpiTile({ label, value, tone }: { label: string; value: string; tone?: "warn" }) {
  return (
    <div
      className={`rounded-2xl border p-3 ${
        tone === "warn"
          ? "border-red-500/30 bg-red-500/10"
          : "border-bm-border/60 bg-black/25"
      }`}
    >
      <p className="text-[11px] uppercase tracking-[0.14em] text-bm-muted2">{label}</p>
      <p className={`mt-1 text-lg font-semibold ${tone === "warn" ? "text-red-400" : "text-bm-text"}`}>
        {value}
      </p>
    </div>
  );
}
