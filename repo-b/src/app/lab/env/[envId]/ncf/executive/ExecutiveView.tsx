"use client";

import Link from "next/link";
import { useState } from "react";
import type { NCFLiveMetric } from "@/lib/server/ncfMetrics";
import { ncfExecutiveKpis, type NCFExecutiveKpi, type ReportingLens } from "./fixture";

const lensStyle: Record<ReportingLens, { bg: string; fg: string; label: string }> = {
  financial_reporting: { bg: "#e9f5fb", fg: "#11789d", label: "Financial" },
  operational_reporting: { bg: "#eef6e9", fg: "#3f7a24", label: "Operational" },
  impact_reporting: { bg: "#f5ecf9", fg: "#7a2ea0", label: "Impact" },
};

const trendStyle: Record<NCFExecutiveKpi["trend"], { arrow: string; color: string }> = {
  up: { arrow: "\u2191", color: "#16a34a" },
  down: { arrow: "\u2193", color: "#dc2626" },
  flat: { arrow: "\u2192", color: "#64748b" },
};

type ResolvedKpi =
  | {
      key: string;
      label: string;
      shape: NCFExecutiveKpi;
      status: "live";
      liveValue: string;
      liveRefreshedAt: string;
      lens: ReportingLens;
      owner: string;
      sourcePath: string;
      sourceQueryHash: string | null;
      periodLabel: string | null;
      lineageNotes: string[];
    }
  | {
      key: string;
      label: string;
      shape: NCFExecutiveKpi;
      status: "unwired";
    };

function formatLiveValue(m: NCFLiveMetric): string {
  if (m.value_text && m.value_text.trim().length > 0) return m.value_text;
  if (m.value_numeric == null) return "--";
  const n = m.value_numeric;
  if (Math.abs(n) >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  return n.toLocaleString("en-US");
}

function formatPeriod(m: NCFLiveMetric): string | null {
  if (m.period_start && m.period_end) return `${m.period_start} \u2192 ${m.period_end}`;
  if (m.period_end) return `as of ${m.period_end}`;
  if (m.period_start) return `from ${m.period_start}`;
  return null;
}

export default function ExecutiveView({
  envId,
  liveMetrics,
}: {
  envId: string;
  liveMetrics: Record<string, NCFLiveMetric>;
}) {
  const [activeKey, setActiveKey] = useState<string | null>(null);

  const resolved: ResolvedKpi[] = ncfExecutiveKpis.map((shape) => {
    const live = liveMetrics[shape.key];
    if (live) {
      return {
        key: shape.key,
        label: shape.label,
        shape,
        status: "live" as const,
        liveValue: formatLiveValue(live),
        liveRefreshedAt: live.refreshed_at,
        lens: live.reporting_lens,
        owner: live.owner_role ?? shape.owner,
        sourcePath: live.source_table,
        sourceQueryHash: live.source_query_hash,
        periodLabel: formatPeriod(live),
        lineageNotes:
          live.lineage_notes.length > 0 ? live.lineage_notes : shape.lineageNotes,
      };
    }
    return { key: shape.key, label: shape.label, shape, status: "unwired" as const };
  });

  const liveCount = resolved.filter((r) => r.status === "live").length;
  const active = resolved.find((r) => r.key === activeKey) ?? null;

  return (
    <div className="min-h-screen bg-bm-bg pb-16 text-bm-text">
      <div className="mx-auto max-w-7xl px-6 py-10 md:px-10 lg:px-12">
        <div className="flex items-start justify-between gap-6">
          <div>
            <div className="text-[11px] font-medium uppercase tracking-[0.26em]" style={{ color: "#1ba6d9" }}>
              NCF Reporting &amp; Stewardship Model
            </div>
            <h1 className="nv-h1 mt-3 text-bm-text">
              Executive view
            </h1>
            <p className="nv-body mt-3 max-w-3xl text-bm-muted2">
              One governed number per card. Click any metric to see what it represents, which reporting lens it uses, and where it came from. Ownership and scope travel with the value.
            </p>
          </div>
          <Link
            href={`/lab/env/${envId}/ncf`}
            className="hidden shrink-0 rounded-md border border-bm-border/50 bg-bm-surface/30 px-4 py-2 text-xs font-medium text-bm-muted2 shadow-sm hover:bg-bm-surface/45 hover:text-bm-text md:inline-block"
          >
            &larr; Back to model overview
          </Link>
        </div>

        <div className="mt-6 inline-flex items-center gap-3 rounded-md border border-bm-border/45 bg-bm-surface/30 px-4 py-2 text-xs text-bm-muted2 shadow-sm">
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ backgroundColor: liveCount > 0 ? "#16a34a" : "#f59e0b" }}
          />
          <span>
            {liveCount} of {resolved.length} metrics resolved from <span className="font-mono">ncf_metric</span>
          </span>
          <span className="text-bm-muted2">&middot;</span>
          <span>
            {liveCount === 0
              ? "Environment scaffolded; no metric rows seeded yet."
              : "Click a live card for governed provenance. Unwired cards fail closed."}
          </span>
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {resolved.map((item) => {
            const isActive = item.key === activeKey;
            if (item.status === "live") {
              const lens = lensStyle[item.lens];
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setActiveKey(item.key)}
                  className={`group rounded-lg border bg-bm-surface/30 p-5 text-left shadow-sm transition hover:bg-bm-surface/45 focus:outline-none focus:ring-2 focus:ring-bm-accent/40 ${
                    isActive ? "ring-2 ring-bm-accent/60" : "border-bm-border/40"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className="rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em]"
                      style={{ backgroundColor: lens.bg, color: lens.fg }}
                    >
                      {lens.label}
                    </span>
                    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-700">
                      Live
                    </span>
                  </div>
                  <div className="nv-eyebrow mt-5 text-bm-muted2">
                    {item.label}
                  </div>
                  <div className="nv-metric-large mt-1 text-bm-text">
                    {item.liveValue}
                  </div>
                  {item.periodLabel ? (
                    <div className="mt-2 text-xs text-bm-muted2">{item.periodLabel}</div>
                  ) : null}
                  <div className="mt-4 text-[11px] text-bm-muted2 group-hover:text-bm-text">
                    Click for provenance &rarr;
                  </div>
                </button>
              );
            }

            const lens = lensStyle[item.shape.lens];
            return (
              <div
                key={item.key}
                className="rounded-lg border border-dashed border-bm-border/45 bg-bm-surface/18 p-5 text-left shadow-none"
              >
                <div className="flex items-center justify-between">
                  <span
                    className="rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] opacity-70"
                    style={{ backgroundColor: lens.bg, color: lens.fg }}
                  >
                    {lens.label}
                  </span>
                  <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-700">
                    Unwired
                  </span>
                </div>
                <div className="nv-eyebrow mt-5 text-bm-muted2">
                  {item.label}
                </div>
                <div className="nv-h3 mt-1 text-bm-text">
                  Not available in current context
                </div>
                <div className="mt-2 text-xs text-bm-muted2">
                  No row in <span className="font-mono">ncf_metric</span> for this key yet. Fail-closed per design.
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-10 rounded-lg border border-bm-border/40 bg-bm-surface/25 p-6 shadow-sm md:p-8">
          <div className="nv-eyebrow text-bm-muted2">
            Why the executive view looks like this
          </div>
          <div className="nv-body mt-3 max-w-3xl text-bm-muted2">
            Every number carries a reporting lens and a source path. Financial, operational, and impact lenses answer different questions and are never flattened into a single summary.
            When a leader asks <span className="italic">&ldquo;is this financial or impact?&rdquo;</span> the answer is on the card. When they ask <span className="italic">&ldquo;where did this come from?&rdquo;</span> it is one click away.
          </div>
          <div className="mt-5 flex flex-wrap gap-4 text-xs text-bm-muted2">
            <div className="flex items-center gap-2">
              <span className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: "#1ba6d9" }} />
              Financial reporting &mdash; audited consolidated view
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: "#3f7a24" }} />
              Operational reporting &mdash; internal workflow truth
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: "#7a2ea0" }} />
              Impact reporting &mdash; externally communicated story
            </div>
          </div>
        </div>
      </div>

      {active && active.status === "live" ? (
        <div className="fixed inset-0 z-40 flex justify-end bg-black/60" onClick={() => setActiveKey(null)}>
          <div
            className="h-full w-full max-w-xl overflow-y-auto bg-bm-bg shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-bm-border/40 px-6 py-4">
              <div>
                <div className="nv-eyebrow text-bm-muted2">
                  Metric provenance
                </div>
                <div className="nv-h3 mt-1 text-bm-text">{active.label}</div>
              </div>
              <button
                type="button"
                onClick={() => setActiveKey(null)}
                className="rounded-md border border-bm-border/40 px-3 py-1 text-xs text-bm-muted2 hover:bg-bm-surface/40 hover:text-bm-text"
              >
                Close
              </button>
            </div>

            <div className="space-y-6 px-6 py-6">
              <div>
                <div className="nv-metric-large text-bm-text">{active.liveValue}</div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span
                    className="rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em]"
                    style={{ backgroundColor: lensStyle[active.lens].bg, color: lensStyle[active.lens].fg }}
                  >
                    {lensStyle[active.lens].label} reporting
                  </span>
                  <span className="rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-700">
                    Live from ncf_metric
                  </span>
                </div>
                {active.periodLabel ? (
                  <div className="mt-2 text-xs text-bm-muted2">Period: {active.periodLabel}</div>
                ) : null}
              </div>

              <section>
                <div className="nv-eyebrow text-bm-muted2">What it represents</div>
                <p className="nv-body mt-2 max-w-none text-bm-muted2">{active.shape.represents}</p>
              </section>

              <section>
                <div className="nv-eyebrow text-bm-muted2">Which reporting lens it uses</div>
                <p className="nv-body mt-2 max-w-none text-bm-muted2">
                  This number is governed under the <span className="font-medium">{active.lens.replace("_", " ")}</span> lens.
                  Other lenses may report a different figure for the same underlying activity, and that is deliberate.
                </p>
              </section>

              <section>
                <div className="nv-eyebrow text-bm-muted2">Where it came from</div>
                <div className="mt-3 space-y-3 rounded-lg bg-bm-surface/35 p-4 text-xs text-bm-muted2">
                  <div>
                    <div className="nv-eyebrow text-bm-muted2">Source</div>
                    <div className="nv-metric mt-1 text-[11px] text-bm-text">{active.sourcePath}</div>
                  </div>
                  {active.sourceQueryHash ? (
                    <div>
                      <div className="nv-eyebrow text-bm-muted2">Query hash</div>
                      <div className="nv-metric mt-1 text-[11px] text-bm-text">{active.sourceQueryHash}</div>
                    </div>
                  ) : null}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <div className="nv-eyebrow text-bm-muted2">Owner</div>
                      <div className="mt-1 text-bm-text">{active.owner}</div>
                    </div>
                    <div>
                      <div className="nv-eyebrow text-bm-muted2">Scope</div>
                      <div className="mt-1 text-bm-text">{active.shape.scope}</div>
                    </div>
                  </div>
                  <div>
                    <div className="nv-eyebrow text-bm-muted2">Last refreshed</div>
                    <div className="mt-1 text-bm-text">{new Date(active.liveRefreshedAt).toLocaleString()}</div>
                  </div>
                </div>
              </section>

              <section>
                <div className="nv-eyebrow text-bm-muted2">Lineage notes</div>
                <ul className="nv-body mt-2 max-w-none space-y-2 text-bm-muted2">
                  {active.lineageNotes.map((note) => (
                    <li key={note} className="flex gap-2">
                      <span className="mt-2 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400" />
                      <span>{note}</span>
                    </li>
                  ))}
                </ul>
              </section>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
