"use client";

import type { ReV2OperatorDiagnosticsSummary } from "@/lib/bos-api";

interface Props {
  summary: ReV2OperatorDiagnosticsSummary;
}

function pct(value: string | null): string {
  if (value === null) return "—";
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return `${(n * 100).toFixed(1)}%`;
}

function signedPct(value: string | null): string {
  if (value === null) return "—";
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  const sign = n >= 0 ? "+" : "";
  return `${sign}${(n * 100).toFixed(1)}%`;
}

export function OperatorSummaryStrip({ summary }: Props) {
  const reason = (key: string) => summary.null_reasons?.[key] ?? null;

  const items: Array<{
    label: string;
    value: string;
    reasonKey: string;
    tone?: "neutral" | "warn";
  }> = [
    {
      label: "Senior-housing assets",
      value: `${summary.released_count}/${summary.asset_count} released`,
      reasonKey: "asset_count",
    },
    {
      label: "Avg NOI margin",
      value: pct(summary.avg_noi_margin),
      reasonKey: "avg_noi_margin",
    },
    {
      label: "Avg occupancy",
      value: pct(summary.avg_occupancy),
      reasonKey: "avg_occupancy",
    },
    {
      label: "Avg peer Δ",
      value: signedPct(summary.avg_peer_delta),
      reasonKey: "avg_peer_delta",
      tone:
        summary.avg_peer_delta !== null && Number(summary.avg_peer_delta) < 0
          ? "warn"
          : "neutral",
    },
  ];

  return (
    <section
      data-testid="summary-strip"
      className="grid grid-cols-2 gap-x-8 gap-y-3 border-y border-bm-border/40 py-4 sm:grid-cols-4"
    >
      {items.map((it) => (
        <div key={it.label}>
          <div className="text-[10px] uppercase tracking-widest text-bm-foreground-muted">
            {it.label}
          </div>
          <div
            className={`mt-1 text-xl tabular-nums ${
              it.tone === "warn" ? "text-amber-300" : "text-bm-foreground"
            }`}
          >
            {it.value}
          </div>
          {it.value === "—" && reason(it.reasonKey) && (
            <div className="mt-0.5 text-[10px] italic text-bm-foreground-muted">
              {reason(it.reasonKey)}
            </div>
          )}
        </div>
      ))}
    </section>
  );
}
