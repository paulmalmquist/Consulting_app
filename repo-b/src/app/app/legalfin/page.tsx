"use client";

import { useState, useEffect, useCallback } from "react";
import { KpiStrip, type KpiDef } from "@/components/repe/asset-cockpit/KpiStrip";
import WaterfallChart, { type WaterfallItem } from "@/components/charts/WaterfallChart";
import { useLegalfinContext } from "@/lib/legalfin-context";
import {
  getLegalfinPortfolioHealth,
  getLegalfinLeakageFunnel,
  type LegalfinPortfolioHealth,
  type LegalfinLeakageFunnel,
  type LegalfinFirm,
} from "@/lib/bos-api";
import { fmtMoney, fmtPct } from "@/lib/format-utils";

// Clio benchmark for billing realization — industry average ~85–88%.
const BILLING_REALIZATION_BENCHMARK = 0.87;

function centsToDisplay(cents: number): string {
  return fmtMoney(cents / 100);
}

function realizationTone(rate: number): "positive" | "negative" | "neutral" {
  if (rate >= BILLING_REALIZATION_BENCHMARK) return "positive";
  if (rate < 0.80) return "negative";
  return "neutral";
}

// ── Firm selector ─────────────────────────────────────────────────────────────

function FirmSelector({
  firms,
  selectedKey,
  onSelect,
}: {
  firms: LegalfinFirm[];
  selectedKey: string | null;
  onSelect: (key: string | null, name: string | null) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        onClick={() => onSelect(null, null)}
        className={`rounded px-3 py-1 text-xs font-mono transition-colors ${
          selectedKey === null
            ? "bg-bm-accent text-white"
            : "bg-bm-surface2 text-bm-muted hover:bg-bm-surface3"
        }`}
      >
        All Firms
      </button>
      {firms.map((f) => (
        <button
          key={f.firmKey}
          onClick={() => onSelect(f.firmKey, f.firmName)}
          className={`rounded px-3 py-1 text-xs font-mono transition-colors ${
            selectedKey === f.firmKey
              ? "bg-bm-accent text-white"
              : "bg-bm-surface2 text-bm-muted hover:bg-bm-surface3"
          }`}
        >
          {f.firmName}
        </button>
      ))}
    </div>
  );
}

// ── Firm table ────────────────────────────────────────────────────────────────

function FirmTable({ firms }: { firms: LegalfinFirm[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs font-mono">
        <thead>
          <tr className="border-b border-bm-border/30 text-bm-muted2 text-left">
            <th className="pb-2 pr-4">Firm</th>
            <th className="pb-2 pr-4">Brand</th>
            <th className="pb-2 pr-4 text-right">Worked</th>
            <th className="pb-2 pr-4 text-right">Billed</th>
            <th className="pb-2 pr-4 text-right">Collected</th>
            <th className="pb-2 pr-4 text-right">Billing Real.</th>
            <th className="pb-2 text-right">Collection</th>
          </tr>
        </thead>
        <tbody>
          {firms.map((f) => {
            const tone = realizationTone(f.billingRealizationRate);
            return (
              <tr key={f.firmKey} className="border-b border-bm-border/10 hover:bg-bm-surface2/30">
                <td className="py-2 pr-4 text-bm-text">{f.firmName}</td>
                <td className="py-2 pr-4 text-bm-muted">{f.sourceSystem}</td>
                <td className="py-2 pr-4 text-right text-bm-muted">{centsToDisplay(f.workedCents)}</td>
                <td className="py-2 pr-4 text-right text-bm-muted">{centsToDisplay(f.billedCents)}</td>
                <td className="py-2 pr-4 text-right text-bm-muted">{centsToDisplay(f.collectedCents)}</td>
                <td
                  className={`py-2 pr-4 text-right font-semibold ${
                    tone === "positive"
                      ? "text-bm-success"
                      : tone === "negative"
                        ? "text-bm-danger"
                        : "text-bm-muted"
                  }`}
                >
                  {fmtPct(f.billingRealizationRate)}
                </td>
                <td className="py-2 text-right text-bm-muted">{fmtPct(f.collectionRate)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Audit table ───────────────────────────────────────────────────────────────

function AuditSection({ compiledSql, label }: { compiledSql: string; label: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border border-bm-border/20 rounded">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-2 text-xs font-mono text-bm-muted2 hover:bg-bm-surface2/40 transition-colors"
      >
        <span>{label}</span>
        <span>{open ? "▲ collapse" : "▼ compiled SQL"}</span>
      </button>
      {open && (
        <pre className="overflow-x-auto px-4 pb-4 pt-1 text-[11px] font-mono text-bm-muted leading-relaxed whitespace-pre-wrap">
          {compiledSql}
        </pre>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function LegalfinPage() {
  const { firmKey, firmName, period, setFirm } = useLegalfinContext();

  const [health, setHealth] = useState<LegalfinPortfolioHealth | null>(null);
  const [funnel, setFunnel] = useState<LegalfinLeakageFunnel | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [h, f] = await Promise.all([
        getLegalfinPortfolioHealth(firmKey ?? undefined),
        getLegalfinLeakageFunnel(firmKey ?? undefined),
      ]);
      setHealth(h);
      setFunnel(f);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load legal finance data");
    } finally {
      setLoading(false);
    }
  }, [firmKey]);

  useEffect(() => { load(); }, [load]);

  // ── Build KPI strip ────────────────────────────────────────────────────────
  const kpis: KpiDef[] = [];
  if (health && funnel) {
    const allFirms = health.firms;
    const selectedFirm = firmKey ? allFirms.find((f) => f.firmKey === firmKey) : null;

    // If a single firm is selected, use its rates directly; otherwise compute dollar-weighted portfolio.
    let billingReal: number;
    let collectionRate: number;
    let worked: number;
    let billed: number;
    let collected: number;

    if (selectedFirm) {
      billingReal = selectedFirm.billingRealizationRate;
      collectionRate = selectedFirm.collectionRate;
      worked = selectedFirm.workedCents;
      billed = selectedFirm.billedCents;
      collected = selectedFirm.collectedCents;
    } else {
      worked = allFirms.reduce((s, f) => s + f.workedCents, 0);
      billed = allFirms.reduce((s, f) => s + f.billedCents, 0);
      collected = allFirms.reduce((s, f) => s + f.collectedCents, 0);
      billingReal = worked > 0 ? billed / worked : 0;
      collectionRate = billed > 0 ? collected / billed : 0;
    }

    const billingTone = realizationTone(billingReal);

    kpis.push(
      {
        label: "Billing Realization",
        value: fmtPct(billingReal),
        delta: {
          value: `${fmtPct(billingReal - BILLING_REALIZATION_BENCHMARK)} vs benchmark`,
          tone: billingTone,
        },
        hint: `Clio benchmark: ${fmtPct(BILLING_REALIZATION_BENCHMARK)}`,
      },
      {
        label: "Collection Rate",
        value: fmtPct(collectionRate),
        delta: {
          value: collectionRate >= 0.93 ? "on target" : "below target",
          tone: collectionRate >= 0.93 ? "positive" : "negative",
        },
      },
      {
        label: "End-to-End Leakage",
        value: funnel.endToEndLeakage != null ? fmtPct(funnel.endToEndLeakage) : "—",
        delta: {
          value: "worked → collected",
          tone: "neutral",
        },
        hint: "1 − (collected / worked)",
      },
      {
        label: "Worked",
        value: centsToDisplay(worked),
      },
      {
        label: "Billed",
        value: centsToDisplay(billed),
      },
      {
        label: "Collected",
        value: centsToDisplay(collected),
      }
    );
  }

  // ── Build waterfall items (convert cents → dollars for chart) ─────────────
  const waterfallItems: WaterfallItem[] =
    funnel?.items.map((item) => ({
      name: item.name,
      value: item.value / 100,
      isTotal: item.isTotal,
    })) ?? [];

  const allFirms = health?.firms ?? [];

  return (
    <div className="min-h-screen bg-bm-background">
      <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6">
        {/* Header */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="font-display text-xl font-semibold text-bm-text">
              Legal Finance Analytics
            </h1>
            <p className="mt-1 text-xs font-mono text-bm-muted2">
              Cross-portfolio billing realization · {period} · {allFirms.length} firms
            </p>
          </div>
          <p className="text-xs font-mono text-bm-muted2">
            Viewing: <span className="text-bm-text font-semibold">{firmName ?? "All Firms"}</span>
          </p>
        </div>

        {/* Firm filter */}
        {allFirms.length > 0 && (
          <FirmSelector
            firms={allFirms}
            selectedKey={firmKey}
            onSelect={setFirm}
          />
        )}

        {/* Loading / error */}
        {loading && (
          <div className="py-12 text-center text-xs font-mono text-bm-muted2">
            Loading…
          </div>
        )}
        {error && (
          <div className="rounded border border-bm-danger/30 bg-bm-danger/5 px-4 py-3 text-xs font-mono text-bm-danger">
            {error}
          </div>
        )}

        {!loading && !error && health && funnel && (
          <>
            {/* KPI strip */}
            <KpiStrip kpis={kpis} variant="band" />

            {/* Leakage funnel */}
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-mono uppercase tracking-widest text-bm-muted2">
                  Revenue Leakage — Worked → Billed → Collected
                </h2>
                <span className="text-xs font-mono text-bm-muted2">{period}</span>
              </div>
              <div className="rounded border border-bm-border/20 bg-bm-surface p-4">
                <WaterfallChart items={waterfallItems} height={280} />
              </div>
              <AuditSection
                compiledSql={funnel.compiledSql}
                label="leakage-funnel · Gold Parquet · single source of truth"
              />
            </section>

            {/* Firm table (only in portfolio view) */}
            {!firmKey && (
              <section className="space-y-3">
                <h2 className="text-xs font-mono uppercase tracking-widest text-bm-muted2">
                  Firm Breakdown
                </h2>
                <div className="rounded border border-bm-border/20 bg-bm-surface p-4">
                  <FirmTable firms={allFirms} />
                </div>
                <AuditSection
                  compiledSql={health.compiledSql}
                  label="portfolio-health · Gold Parquet · same SQL as MCP legal.query_metric"
                />
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}
