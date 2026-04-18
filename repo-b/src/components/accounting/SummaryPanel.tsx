"use client";

import { useEffect, useState } from "react";
import { fetchAiSoftwareSummary, type AiSoftwareSummary } from "@/lib/accounting-api";

export type SummaryPanelProps = {
  envId: string;
  businessId?: string;
  monthKey?: string; // "YYYY-MM"
};

function usd(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function firstOfMonth(monthKey: string): string {
  return `${monthKey}-01`;
}

function lastOfMonth(monthKey: string): string {
  const [y, m] = monthKey.split("-").map(Number);
  const next = new Date(Date.UTC(y, m, 1));
  next.setUTCDate(next.getUTCDate() - 1);
  return next.toISOString().slice(0, 10);
}

export default function SummaryPanel({ envId, businessId, monthKey }: SummaryPanelProps) {
  const [data, setData] = useState<AiSoftwareSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const month = monthKey ?? new Date().toISOString().slice(0, 7);

  useEffect(() => {
    let cancelled = false;
    fetchAiSoftwareSummary({
      envId,
      businessId,
      periodStart: firstOfMonth(month),
      periodEnd: lastOfMonth(month),
    })
      .then((r) => {
        if (!cancelled) setData(r);
      })
      .catch((err) => {
        if (!cancelled) setError((err as Error).message);
      });
    return () => {
      cancelled = true;
    };
  }, [envId, businessId, month]);

  const tiles = data
    ? [
        { id: "apple", label: "Apple-billed", value: usd(data.apple_billed_total), accent: "text-amber-300 border-amber-400/50" },
        { id: "claude", label: "Claude (Anthropic)", value: usd(data.claude_total), accent: "text-cyan-300 border-cyan-400/50" },
        { id: "openai", label: "OpenAI", value: usd(data.openai_total), accent: "text-emerald-300 border-emerald-400/50" },
        {
          id: "pending",
          label: "Pending review",
          value: usd(data.ambiguous_pending_review_usd),
          accent: "text-rose-300 border-rose-400/50",
        },
        {
          id: "missing",
          label: "Missing support",
          value: `${data.missing_support_count}`,
          accent: "text-violet-300 border-violet-400/50",
        },
      ]
    : [];

  return (
    <section
      className="border-b border-slate-800 bg-slate-950/60 p-3"
      data-testid="accounting-summary-panel"
    >
      <div className="mb-2 flex items-center justify-between">
        <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-slate-400">
          AI · Software Spend · {month}
        </div>
        {error ? (
          <span className="font-mono text-[10px] text-rose-300">{error}</span>
        ) : data ? (
          <span className="font-mono text-[10px] uppercase tracking-widest text-slate-500">
            live rollup
          </span>
        ) : (
          <span className="font-mono text-[10px] text-slate-500">loading…</span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
        {tiles.map((t) => (
          <div
            key={t.id}
            className={`rounded border bg-slate-900/60 p-2 ${t.accent}`}
            data-testid={`summary-tile-${t.id}`}
          >
            <div className="font-mono text-[9px] uppercase tracking-[0.2em] text-slate-400">
              {t.label}
            </div>
            <div className="mt-1 font-mono text-[20px] leading-none tabular-nums">
              {t.value}
            </div>
          </div>
        ))}
      </div>

      {data && data.by_spend_type.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {data.by_spend_type.map((row) => (
            <span
              key={row.spend_type}
              className="rounded-full border border-slate-700 bg-slate-900 px-2 py-0.5 text-[11px] text-slate-300"
              data-testid={`summary-split-${row.spend_type}`}
            >
              {row.spend_type.replace(/_/g, " ")}: {usd(Number(row.total ?? 0))}{" "}
              <span className="text-slate-500">({row.receipt_count})</span>
            </span>
          ))}
        </div>
      ) : null}
    </section>
  );
}
