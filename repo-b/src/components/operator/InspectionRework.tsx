"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useDomainEnv } from "@/components/domain/DomainEnvProvider";
import { getOperatorInspectionRework, OperatorInspectionReworkBoard } from "@/lib/bos-api";

function fmtCost(v: number | null | undefined): string {
  if (v == null || v === 0) return "$0";
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${Math.round(v)}`;
}

function label(s: string): string {
  return s.replace(/_/g, " ");
}

export function InspectionRework() {
  const { envId, businessId } = useDomainEnv();
  const [board, setBoard] = useState<OperatorInspectionReworkBoard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await getOperatorInspectionRework(envId, businessId || undefined);
        if (!cancelled) setBoard(data);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load inspection rework.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [envId, businessId]);

  if (loading) return <p className="text-sm text-bm-muted2">Loading inspection results…</p>;
  if (error) return <p className="text-sm text-red-400">{error}</p>;
  if (!board) return null;

  const { totals } = board;
  const worstType = board.by_inspection_type[0];
  const worstVendor = board.by_vendor[0];

  return (
    <div className="space-y-4">
      <div
        className="rounded-2xl border border-bm-border/60 bg-black/30 p-4"
        data-testid="inspection-rework-headline"
      >
        <p className="text-sm text-bm-text">
          {totals.fail_count > 0 ? (
            <>
              <span className="font-semibold text-red-400">
                {totals.fail_count} failures
              </span>{" "}
              across {totals.event_count} inspections (
              {Math.round(totals.overall_fail_rate * 100)}% fail rate) ·{" "}
              <span className="font-semibold text-bm-text">
                {fmtCost(totals.total_rework_cost_usd)}
              </span>{" "}
              rework exposure
              {worstType && (
                <>
                  . Worst type: {label(worstType.inspection_type)} at{" "}
                  {Math.round(worstType.fail_rate * 100)}% fail rate.
                </>
              )}
            </>
          ) : (
            <>No inspection failures recorded.</>
          )}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiTile label="Inspections" value={totals.event_count.toString()} />
        <KpiTile
          label="Failures"
          value={totals.fail_count.toString()}
          tone={totals.fail_count > 0 ? "warn" : undefined}
        />
        <KpiTile
          label="Fail rate"
          value={`${Math.round(totals.overall_fail_rate * 100)}%`}
          tone={totals.overall_fail_rate >= 0.3 ? "warn" : undefined}
        />
        <KpiTile
          label="Rework cost"
          value={fmtCost(totals.total_rework_cost_usd)}
          tone={totals.total_rework_cost_usd > 0 ? "warn" : undefined}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-bm-border/60 bg-black/20 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-bm-muted2">
            Fail rate by inspection type
          </p>
          <ul className="mt-3 space-y-2">
            {board.by_inspection_type.map((t) => (
              <li
                key={t.inspection_type}
                className="flex items-center justify-between rounded-xl border border-bm-border/50 bg-black/20 px-3 py-2 text-sm"
                data-testid={`inspection-type-${t.inspection_type}`}
              >
                <div>
                  <p className="font-medium text-bm-text">{label(t.inspection_type)}</p>
                  <p className="text-xs text-bm-muted2">
                    {t.failed}/{t.total} failed · {fmtCost(t.rework_cost_usd)} rework
                  </p>
                </div>
                <span
                  className={`rounded-full border px-2 py-0.5 text-xs ${
                    t.fail_rate >= 0.5
                      ? "border-red-500/40 bg-red-500/10 text-red-400"
                      : t.fail_rate > 0
                        ? "border-amber-500/40 bg-amber-500/10 text-amber-300"
                        : "border-bm-border/50 bg-white/5 text-bm-muted2"
                  }`}
                >
                  {Math.round(t.fail_rate * 100)}%
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-2xl border border-bm-border/60 bg-black/20 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-bm-muted2">
            Vendor rework ranking
          </p>
          <ul className="mt-3 space-y-2">
            {board.by_vendor.map((v) => (
              <li
                key={v.vendor_id}
                className="rounded-xl border border-bm-border/50 bg-black/20 px-3 py-2 text-sm"
                data-testid={`inspection-vendor-${v.vendor_id}`}
              >
                <div className="flex items-center justify-between">
                  <p className="font-medium text-bm-text">{v.vendor_name}</p>
                  <span className="text-red-400 font-medium">{fmtCost(v.rework_cost_usd)}</span>
                </div>
                <p className="mt-1 text-xs text-bm-muted2">
                  {v.failed}/{v.total} failed · {v.rework_hours}h rework · {Math.round(v.fail_rate * 100)}% fail rate
                </p>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="rounded-2xl border border-bm-border/60 bg-black/20 p-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-bm-muted2">
          Recent failures
        </p>
        <table className="mt-3 min-w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-[0.12em] text-bm-muted2">
              <th className="py-1.5">Date</th>
              <th className="py-1.5">Project</th>
              <th className="py-1.5">Type</th>
              <th className="py-1.5">Vendor</th>
              <th className="py-1.5">Issue</th>
              <th className="py-1.5">Rework $</th>
            </tr>
          </thead>
          <tbody>
            {board.recent_failures.map((f) => (
              <tr
                key={f.id}
                className="border-t border-bm-border/40"
                data-testid={`inspection-failure-${f.id}`}
              >
                <td className="py-1.5 text-bm-muted2">{f.inspection_date ?? "—"}</td>
                <td className="py-1.5">
                  <Link href={f.href ?? "#"} className="text-bm-text hover:underline">
                    {f.project_name ?? f.project_id}
                  </Link>
                </td>
                <td className="py-1.5 text-bm-text">{label(f.inspection_type ?? "—")}</td>
                <td className="py-1.5 text-bm-text">{f.vendor_name ?? "—"}</td>
                <td className="py-1.5 text-bm-muted2">{f.issue_summary ?? "—"}</td>
                <td className="py-1.5 text-red-400">{fmtCost(f.rework_cost_usd)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
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

export default InspectionRework;
