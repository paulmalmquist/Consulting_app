"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  getRepeFund,
  listRepeDeals,
  listRepeAssets,
  RepeFundDetail,
  RepeDeal,
  getReV2FundQuarterState,
  getReV2FundMetrics,
  runReV2QuarterClose,
  listReV2Scenarios,
  ReV2FundQuarterState,
  ReV2FundMetrics,
  ReV2Scenario,
  ReV2QuarterCloseResult,
} from "@/lib/bos-api";
import RepeEntityDocuments from "@/components/repe/RepeEntityDocuments";
import { useRepeBasePath, useRepeContext } from "@/lib/repe-context";
import { fmtMoney, fmtMultiple, fmtPct } from "@/lib/format-utils";

// ─── Utilities ───────────────────────────────────────────────────────────────

function pickCurrentQuarter(): string {
  const d = new Date();
  const q = Math.floor(d.getUTCMonth() / 3) + 1;
  return `${d.getUTCFullYear()}Q${q}`;
}

const STAGE_LABELS: Record<string, string> = {
  sourcing: "Sourced",
  underwriting: "Underwriting",
  ic: "IC",
  closing: "Closed",
  operating: "Asset Mgmt",
  exited: "Exited",
};

const MODULES = [
  "Dashboard",
  "Investments",
  "Capital",
  "Scenarios",
  "Audit",
  "Attachments",
] as const;

type ModuleKey = (typeof MODULES)[number];

// ─── View-model adapters ──────────────────────────────────────────────────────

function deriveCapitalProgress(fundState: ReV2FundQuarterState | null): {
  calledPct: number;
  distributedPct: number;
} {
  const committed = Number(fundState?.total_committed ?? 0);
  if (!committed) return { calledPct: 0, distributedPct: 0 };
  const calledPct = Math.min(1, Math.max(0, Number(fundState?.total_called ?? 0) / committed));
  const distributedPct = Math.min(1, Math.max(0, Number(fundState?.total_distributed ?? 0) / committed));
  return { calledPct, distributedPct };
}

function deriveFundStatus(status: string | undefined): {
  label: string;
  tone: "amber" | "blue" | "muted";
} {
  if (!status) return { label: "—", tone: "muted" };
  if (status === "investing") return { label: "Investing", tone: "blue" };
  if (status === "fundraising") return { label: "Fundraising", tone: "amber" };
  if (status === "harvesting") return { label: "Harvesting", tone: "amber" };
  if (status === "closed") return { label: "Closed", tone: "muted" };
  return { label: status.charAt(0).toUpperCase() + status.slice(1), tone: "muted" };
}

function returnTone(v: number | null | undefined, threshold: number): string {
  if (v == null) return "text-bm-muted2";
  return Number(v) >= threshold ? "text-bm-success" : "text-bm-muted2";
}

function stagePillClasses(stage: string): string {
  const base = "font-mono text-[10px] font-semibold uppercase tracking-[0.32em] border px-2.5 py-0.5";
  switch (stage) {
    case "sourcing":     return `${base} border-bm-border/[0.2] text-bm-muted2`;
    case "underwriting": return `${base} border-bm-warning/30 text-bm-warning`;
    case "ic":           return `${base} border-bm-accent/30 text-bm-accent`;
    case "closing":      return `${base} border-bm-success/30 text-bm-success`;
    case "operating":    return `${base} border-bm-success/40 text-bm-success`;
    case "exited":       return `${base} border-bm-border/[0.2] text-bm-muted2`;
    default:             return `${base} border-bm-border/[0.2] text-bm-muted2`;
  }
}

// ─── Section components ───────────────────────────────────────────────────────

function FundCommandHeader({
  detail,
  quarter,
  closing,
  closeResult,
  fundId,
  basePath,
  onQuarterClose,
}: {
  detail: RepeFundDetail | null;
  quarter: string;
  closing: boolean;
  closeResult: ReV2QuarterCloseResult | null;
  fundId: string;
  basePath: string;
  onQuarterClose: () => void;
}) {
  const fund = detail?.fund;
  const latestTerms = detail?.terms?.[0];
  const status = deriveFundStatus(fund?.status);

  const pillClasses = {
    amber: "border-bm-warning/40 text-bm-warning",
    blue:  "border-bm-accent/40 text-bm-accent",
    muted: "border-bm-border/[0.2] text-bm-muted2",
  }[status.tone];

  return (
    <div>
      {/* Main header */}
      <div className="pb-8 border-b border-bm-border/[0.1]">
        <div className="flex flex-col items-start justify-between gap-6 lg:flex-row lg:items-start">
          {/* Identity */}
          <div className="min-w-0 flex-1">
            <p className="font-mono text-[10px] uppercase tracking-[0.34em] text-bm-muted2">
              Fund{fund?.vintage_year ? ` · Vintage ${fund.vintage_year}` : ""}
            </p>
            <h1 className="mt-2 font-editorial text-[2.4rem] font-medium leading-[1.1] tracking-[-0.025em] text-bm-text sm:text-[2.8rem]">
              {fund?.name ?? "—"}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-bm-muted">
                {[fund?.strategy, fund?.sub_strategy].filter(Boolean).join(" · ")}
                {fund?.target_size ? ` · Target ${fmtMoney(fund.target_size)}` : ""}
              </p>
              {fund?.status && (
                <span className={`border px-3 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.32em] ${pillClasses}`}>
                  {status.label}
                </span>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <Link
              href={`${basePath}/sustainability?section=portfolio-footprint&fundId=${fundId}`}
              className="border border-bm-border/[0.15] px-4 py-2 font-mono text-[11px] uppercase tracking-[0.18em] text-bm-muted transition-colors hover:border-bm-border/30 hover:text-bm-text"
            >
              Sustainability
            </Link>
            <button
              onClick={onQuarterClose}
              disabled={closing}
              className="border border-bm-accent/30 px-4 py-2 font-mono text-[11px] uppercase tracking-[0.18em] text-bm-accent transition-colors hover:bg-bm-accent/[0.06] disabled:opacity-50"
            >
              {closing ? "Closing..." : `Close ${quarter}`}
            </button>
            <Link
              href={`${basePath}/deals?fund=${fundId}`}
              className="border border-bm-border/[0.15] px-4 py-2 font-mono text-[11px] uppercase tracking-[0.18em] text-bm-muted transition-colors hover:border-bm-border/30 hover:text-bm-text"
            >
              + Investment
            </Link>
          </div>
        </div>

        {/* Terms DL */}
        {latestTerms && (
          <dl className="mt-6 flex flex-wrap gap-x-10 gap-y-4 border-t border-bm-border/[0.1] pt-6">
            {latestTerms.preferred_return_rate != null && (
              <div>
                <dt className="font-mono text-[10px] uppercase tracking-[0.34em] text-bm-muted2">Pref Return</dt>
                <dd className="mt-1 font-editorial text-[1.4rem] font-medium leading-none tabular-nums text-bm-text">
                  {fmtPct(latestTerms.preferred_return_rate)}
                </dd>
              </div>
            )}
            {latestTerms.carry_rate != null && (
              <div>
                <dt className="font-mono text-[10px] uppercase tracking-[0.34em] text-bm-muted2">Carry</dt>
                <dd className="mt-1 font-editorial text-[1.4rem] font-medium leading-none tabular-nums text-bm-text">
                  {fmtPct(latestTerms.carry_rate)}
                </dd>
              </div>
            )}
            {latestTerms.waterfall_style && (
              <div>
                <dt className="font-mono text-[10px] uppercase tracking-[0.34em] text-bm-muted2">Waterfall</dt>
                <dd className="mt-1 font-editorial text-[1.4rem] font-medium leading-none capitalize text-bm-text">
                  {latestTerms.waterfall_style}
                </dd>
              </div>
            )}
            {latestTerms.management_fee_rate != null && (
              <div>
                <dt className="font-mono text-[10px] uppercase tracking-[0.34em] text-bm-muted2">Mgmt Fee</dt>
                <dd className="mt-1 font-editorial text-[1.4rem] font-medium leading-none tabular-nums text-bm-text">
                  {fmtPct(latestTerms.management_fee_rate)}
                </dd>
              </div>
            )}
          </dl>
        )}
      </div>

      {/* Quarter Close result strip */}
      {closeResult && (
        <div
          className={`border-b py-3 font-mono text-[11px] ${
            closeResult.status === "success"
              ? "border-bm-success/40 text-bm-success"
              : "border-bm-danger/40 text-bm-danger"
          }`}
        >
          Quarter Close: {closeResult.status}
          {closeResult.status === "success" && (
            <span className="ml-4 text-bm-muted2">
              {closeResult.assets_processed} assets · {closeResult.jvs_processed} JVs · {closeResult.investments_processed} investments
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function FundCapitalSection({ fundState }: { fundState: ReV2FundQuarterState | null }) {
  const { calledPct, distributedPct } = deriveCapitalProgress(fundState);

  const metrics = [
    { label: "NAV", value: fmtMoney(fundState?.portfolio_nav) },
    { label: "Committed", value: fmtMoney(fundState?.total_committed) },
    { label: "Called", value: fmtMoney(fundState?.total_called) },
    { label: "Distributed", value: fmtMoney(fundState?.total_distributed) },
  ];

  return (
    <div className="py-8 pr-0 lg:border-r lg:border-bm-border/[0.1] lg:pr-8">
      <p className="font-mono text-[10px] uppercase tracking-[0.34em] text-bm-muted2">Capital</p>
      <h2 className="mt-2 font-editorial text-[2.2rem] font-medium tracking-[-0.025em] text-bm-text">
        Accounts
      </h2>

      <div className="mt-6 grid grid-cols-2 gap-x-8 gap-y-6">
        {metrics.map(({ label, value }) => (
          <div key={label}>
            <p className="font-mono text-[10px] uppercase tracking-[0.34em] text-bm-muted2">{label}</p>
            <p className={`mt-1 font-editorial text-[2.4rem] font-medium leading-none tracking-[-0.03em] tabular-nums ${value === "—" ? "text-bm-muted2" : "text-bm-text"}`}>
              {value}
            </p>
          </div>
        ))}
      </div>

      {/* Progress bars */}
      <div className="mt-8 space-y-4">
        <div>
          <div className="mb-1.5 flex items-baseline justify-between">
            <span className="font-mono text-[10px] uppercase tracking-[0.28em] text-bm-muted2">Called</span>
            <span className="font-mono text-[10px] text-bm-muted2">{(calledPct * 100).toFixed(1)}%</span>
          </div>
          <div className="h-[1.5px] w-full bg-bm-border/[0.15]">
            <div className="h-[1.5px] bg-bm-accent transition-all" style={{ width: `${calledPct * 100}%` }} />
          </div>
        </div>
        <div>
          <div className="mb-1.5 flex items-baseline justify-between">
            <span className="font-mono text-[10px] uppercase tracking-[0.28em] text-bm-muted2">Distributed</span>
            <span className="font-mono text-[10px] text-bm-muted2">{(distributedPct * 100).toFixed(1)}%</span>
          </div>
          <div className="h-[1.5px] w-full bg-bm-border/[0.15]">
            <div className="h-[1.5px] bg-bm-success transition-all" style={{ width: `${distributedPct * 100}%` }} />
          </div>
        </div>
      </div>

      {!fundState && (
        <p className="mt-6 font-mono text-[10px] uppercase tracking-[0.18em] text-bm-muted2">
          No quarter state — run a Quarter Close to generate metrics.
        </p>
      )}
    </div>
  );
}

function FundReturnsSection({
  fundState,
  fundMetrics,
}: {
  fundState: ReV2FundQuarterState | null;
  fundMetrics: ReV2FundMetrics | null;
}) {
  const rows: { label: string; value: string; tone: string }[] = [
    {
      label: "DPI",
      value: fmtMultiple(fundState?.dpi),
      tone: returnTone(fundState?.dpi, 1.0),
    },
    {
      label: "RVPI",
      value: fmtMultiple(fundState?.rvpi),
      tone: returnTone(fundState?.rvpi, 0),
    },
    {
      label: "TVPI",
      value: fmtMultiple(fundState?.tvpi),
      tone: returnTone(fundState?.tvpi, 1.0),
    },
    {
      label: "Gross IRR",
      value: fmtPct(fundState?.gross_irr),
      tone: returnTone(fundState?.gross_irr, 0.08),
    },
    {
      label: "Net IRR",
      value: fmtPct(fundState?.net_irr ?? fundMetrics?.irr),
      tone: returnTone(fundState?.net_irr ?? fundMetrics?.irr, 0.08),
    },
  ];

  return (
    <div className="py-8 lg:pl-8">
      <p className="font-mono text-[10px] uppercase tracking-[0.34em] text-bm-muted2">Performance</p>
      <h2 className="mt-2 font-editorial text-[2.2rem] font-medium tracking-[-0.025em] text-bm-text">
        Returns
      </h2>

      <div className="mt-6 divide-y divide-bm-border/[0.08]">
        {rows.map(({ label, value, tone }) => (
          <div key={label} className="flex items-baseline justify-between py-4">
            <span className="font-mono text-[10px] uppercase tracking-[0.34em] text-bm-muted2">{label}</span>
            <span className={`font-editorial text-[2rem] font-medium leading-none tracking-[-0.02em] tabular-nums ${value === "—" ? "text-bm-muted2" : tone}`}>
              {value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function FundPortfolioStatePanel({
  deals,
  totalAssets,
  scenarios,
  fundState,
}: {
  deals: RepeDeal[];
  totalAssets: number;
  scenarios: ReV2Scenario[];
  fundState: ReV2FundQuarterState | null;
}) {
  const stats = [
    { label: "Investments", value: deals.length },
    { label: "Assets", value: totalAssets },
    { label: "Scenarios", value: scenarios.length },
  ];

  return (
    <div className="py-8 pr-0 lg:border-r lg:border-bm-border/[0.1] lg:pr-8">
      <p className="font-mono text-[10px] uppercase tracking-[0.34em] text-bm-muted2">Portfolio</p>
      <h2 className="mt-2 font-editorial text-[2.2rem] font-medium tracking-[-0.025em] text-bm-text">
        State
      </h2>

      <div className="mt-6 space-y-6">
        {stats.map(({ label, value }) => (
          <div key={label} className="border-b border-bm-border/[0.08] pb-6 last:border-b-0 last:pb-0">
            <p className="font-mono text-[10px] uppercase tracking-[0.34em] text-bm-muted2">{label}</p>
            <p className="mt-1 font-editorial text-[3rem] font-medium leading-none tracking-[-0.03em] tabular-nums text-bm-text">
              {value}
            </p>
          </div>
        ))}
      </div>

      {!fundState && (
        <p className="mt-6 font-mono text-[10px] uppercase tracking-[0.18em] text-bm-muted2">
          No quarter state — run a Quarter Close to generate fund metrics.
        </p>
      )}
    </div>
  );
}

function FundValueCreationPanel() {
  return (
    <div className="py-8 lg:pl-8">
      <p className="font-mono text-[10px] uppercase tracking-[0.34em] text-bm-muted2">Analytics</p>
      <h2 className="mt-2 font-editorial text-[2.2rem] font-medium tracking-[-0.025em] text-bm-text">
        Value Creation
      </h2>

      <div className="mt-6 flex min-h-[240px] flex-col items-center justify-center border border-bm-border/[0.1] px-8 py-12 text-center">
        {/* Decorative placeholder lines */}
        <svg
          viewBox="0 0 120 48"
          className="mb-5 h-10 w-24 opacity-20"
          aria-hidden="true"
          fill="none"
        >
          <line x1="0" y1="40" x2="30" y2="32" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <line x1="30" y1="32" x2="60" y2="22" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <line x1="60" y1="22" x2="90" y2="14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <line x1="90" y1="14" x2="120" y2="8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <rect x="0" y="40" width="12" height="6" fill="currentColor" opacity="0.5" />
          <rect x="30" y="36" width="12" height="10" fill="currentColor" opacity="0.5" />
          <rect x="60" y="28" width="12" height="18" fill="currentColor" opacity="0.5" />
          <rect x="90" y="20" width="12" height="26" fill="currentColor" opacity="0.5" />
        </svg>
        <p className="font-editorial text-[1.4rem] font-medium text-bm-muted">
          Value Creation Chart
        </p>
        <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.18em] text-bm-muted2">
          Time-series data not yet available.
        </p>
        <p className="mt-1 font-mono text-[10px] text-bm-muted2/60">
          Run quarter closes to populate NAV history.
        </p>
      </div>
    </div>
  );
}

function FundOperatingGrid({
  deals,
  assetCounts,
  basePath,
}: {
  deals: RepeDeal[];
  assetCounts: Record<string, number>;
  basePath: string;
}) {
  return (
    <div>
      <div className="mb-6 flex flex-col items-start justify-between gap-4 border-b border-bm-border/[0.1] pb-6 sm:flex-row sm:items-end">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.34em] text-bm-muted2">Portfolio / Current Quarter</p>
          <h2 className="mt-2 font-editorial text-[2.2rem] font-medium tracking-[-0.025em] text-bm-text">
            Operating Grid
          </h2>
        </div>
        <Link
          href={`${basePath}/deals`}
          className="shrink-0 border border-bm-border/[0.15] px-4 py-2 font-mono text-[11px] uppercase tracking-[0.18em] text-bm-muted transition-colors hover:border-bm-border/30 hover:text-bm-text"
        >
          + New Investment
        </Link>
      </div>

      {deals.length === 0 ? (
        <div className="py-16 text-center">
          <p className="font-editorial text-[1.4rem] font-medium text-bm-muted">No investments yet.</p>
          <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.18em] text-bm-muted2">
            Add an investment to begin tracking portfolio performance.
          </p>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px]">
              <thead>
                <tr className="border-b border-bm-border/[0.1]">
                  {["Investment", "Type", "Stage", "Assets", "Sponsor", "Target Close", "NOI *", "Occupancy *", "LTV *"].map((col) => (
                    <th
                      key={col}
                      className="py-3 pr-6 text-left font-mono text-[10px] uppercase tracking-[0.28em] text-bm-muted2 last:pr-0"
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {deals.map((deal) => (
                  <tr
                    key={deal.deal_id}
                    className="group cursor-pointer border-b border-bm-border/[0.06] transition-colors hover:bg-bm-surface/[0.04]"
                    onClick={() => { window.location.href = `${basePath}/deals/${deal.deal_id}`; }}
                  >
                    <td className="py-4 pr-6">
                      <Link
                        href={`${basePath}/deals/${deal.deal_id}`}
                        className="font-sans text-sm font-medium text-bm-text transition-colors group-hover:text-bm-accent"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {deal.name}
                      </Link>
                    </td>
                    <td className="py-4 pr-6">
                      <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-bm-muted">
                        {deal.deal_type}
                      </span>
                    </td>
                    <td className="py-4 pr-6">
                      <span className={stagePillClasses(deal.stage)}>
                        {STAGE_LABELS[deal.stage] ?? deal.stage}
                      </span>
                    </td>
                    <td className="py-4 pr-6 font-mono text-sm tabular-nums text-bm-muted2">
                      {assetCounts[deal.deal_id] ?? 0}
                    </td>
                    <td className="py-4 pr-6 font-sans text-sm text-bm-muted2">
                      {deal.sponsor ?? "—"}
                    </td>
                    <td className="py-4 pr-6 font-mono text-[11px] text-bm-muted2">
                      {deal.target_close_date?.slice(0, 10) ?? "—"}
                    </td>
                    <td className="py-4 pr-6 font-mono text-[11px] text-bm-muted2/50">—</td>
                    <td className="py-4 pr-6 font-mono text-[11px] text-bm-muted2/50">—</td>
                    <td className="py-4 font-mono text-[11px] text-bm-muted2/50">—</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 font-mono text-[10px] text-bm-muted2/50">
            * Asset-level fields (NOI, Occupancy, LTV) are loaded per-investment. Open a deal to view operating metrics.
          </p>
        </>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function RepeFundDetailPage({ params }: { params: { fundId: string } }) {
  const { businessId, environmentId } = useRepeContext();
  const basePath = useRepeBasePath();
  const [moduleTab, setModuleTab] = useState<ModuleKey>("Dashboard");
  const [detail, setDetail] = useState<RepeFundDetail | null>(null);
  const [deals, setDeals] = useState<RepeDeal[]>([]);
  const [fundState, setFundState] = useState<ReV2FundQuarterState | null>(null);
  const [fundMetrics, setFundMetrics] = useState<ReV2FundMetrics | null>(null);
  const [scenarios, setScenarios] = useState<ReV2Scenario[]>([]);
  const [assetCounts, setAssetCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);
  const [closeResult, setCloseResult] = useState<ReV2QuarterCloseResult | null>(null);
  const quarter = pickCurrentQuarter();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    Promise.all([
      getRepeFund(params.fundId),
      listRepeDeals(params.fundId),
      getReV2FundQuarterState(params.fundId, quarter).catch(() => null),
      getReV2FundMetrics(params.fundId, quarter).catch(() => null),
      listReV2Scenarios(params.fundId).catch(() => []),
    ])
      .then(async ([d, dls, fs, fm, sc]) => {
        if (cancelled) return;
        setDetail(d);
        setDeals(dls);
        setFundState(fs);
        setFundMetrics(fm);
        setScenarios(sc);
        const counts = await Promise.all(
          dls.map(async (deal) => {
            const rows = await listRepeAssets(deal.deal_id).catch(() => []);
            return [deal.deal_id, rows.length] as const;
          })
        );
        if (!cancelled) setAssetCounts(Object.fromEntries(counts));
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load fund");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [params.fundId, quarter]);

  const handleQuarterClose = async () => {
    setClosing(true);
    setCloseResult(null);
    try {
      const result = await runReV2QuarterClose(params.fundId, {
        quarter,
        run_waterfall: true,
      });
      setCloseResult(result);
      if (result.fund_state) setFundState(result.fund_state);
      if (result.fund_metrics) setFundMetrics(result.fund_metrics);
    } catch {
      setCloseResult({ status: "failed", run_id: "", fund_id: params.fundId, quarter, assets_processed: 0, jvs_processed: 0, investments_processed: 0 });
    } finally {
      setClosing(false);
    }
  };

  if (loading) {
    return (
      <div className="py-16 text-center">
        <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-bm-muted2">Loading fund...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-16 text-center">
        <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-bm-danger">{error}</p>
      </div>
    );
  }

  const totalAssets = Object.values(assetCounts).reduce((s, n) => s + n, 0);

  return (
    <section className="flex flex-col" data-testid="re-fund-homepage">

      {/* Header */}
      <FundCommandHeader
        detail={detail}
        quarter={quarter}
        closing={closing}
        closeResult={closeResult}
        fundId={params.fundId}
        basePath={basePath}
        onQuarterClose={handleQuarterClose}
      />

      {/* Tab navigation — underline style */}
      <nav className="-mb-px flex gap-0 border-b border-bm-border/[0.1] overflow-x-auto">
        {MODULES.map((label) => (
          <button
            key={label}
            type="button"
            onClick={() => setModuleTab(label)}
            className={[
              "shrink-0 border-b-[1.5px] px-4 py-3 font-mono text-[10px] uppercase tracking-[0.28em] transition-colors",
              moduleTab === label
                ? "border-b-bm-text text-bm-text"
                : "border-b-transparent text-bm-muted2 hover:text-bm-muted",
            ].join(" ")}
          >
            {label}
          </button>
        ))}
      </nav>

      {/* Tab content */}
      <div className="pt-0">

        {/* Dashboard — full command sheet layout */}
        {moduleTab === "Dashboard" && (
          <div>
            {/* Row 1: Capital + Returns */}
            <div className="grid grid-cols-1 border-b border-bm-border/[0.1] lg:grid-cols-12">
              <div className="lg:col-span-7">
                <FundCapitalSection fundState={fundState} />
              </div>
              <div className="border-t border-bm-border/[0.1] lg:col-span-5 lg:border-t-0">
                <FundReturnsSection fundState={fundState} fundMetrics={fundMetrics} />
              </div>
            </div>

            {/* Row 2: Portfolio State + Value Creation */}
            <div className="grid grid-cols-1 lg:grid-cols-12">
              <div className="lg:col-span-4">
                <FundPortfolioStatePanel
                  deals={deals}
                  totalAssets={totalAssets}
                  scenarios={scenarios}
                  fundState={fundState}
                />
              </div>
              <div className="border-t border-bm-border/[0.1] lg:col-span-8 lg:border-t-0">
                <FundValueCreationPanel />
              </div>
            </div>
          </div>
        )}

        {/* Investments / Operating Grid */}
        {moduleTab === "Investments" && (
          <div className="pt-8">
            <FundOperatingGrid deals={deals} assetCounts={assetCounts} basePath={basePath} />
          </div>
        )}

        {/* Capital tab — flat metric grid */}
        {moduleTab === "Capital" && (
          <div className="py-8">
            <p className="font-mono text-[10px] uppercase tracking-[0.34em] text-bm-muted2">Capital Accounts</p>
            <h2 className="mt-2 font-editorial text-[2.2rem] font-medium tracking-[-0.025em] text-bm-text">
              Fund Capital
            </h2>
            <div className="mt-6 grid grid-cols-2 gap-px border border-bm-border/[0.1] sm:grid-cols-4">
              {[
                { label: "Committed", value: fmtMoney(fundState?.total_committed) },
                { label: "Called", value: fmtMoney(fundState?.total_called) },
                { label: "Distributed", value: fmtMoney(fundState?.total_distributed) },
                { label: "NAV", value: fmtMoney(fundState?.portfolio_nav) },
              ].map(({ label, value }) => (
                <div key={label} className="bg-bm-bg p-6">
                  <p className="font-mono text-[10px] uppercase tracking-[0.34em] text-bm-muted2">{label}</p>
                  <p className={`mt-2 font-editorial text-[2.4rem] font-medium leading-none tracking-[-0.03em] tabular-nums ${value === "—" ? "text-bm-muted2" : "text-bm-text"}`}>
                    {value}
                  </p>
                </div>
              ))}
            </div>
            {!fundState && (
              <p className="mt-6 font-mono text-[10px] uppercase tracking-[0.18em] text-bm-muted2">
                No quarter state — run a Quarter Close to generate capital metrics.
              </p>
            )}
          </div>
        )}

        {/* Scenarios */}
        {moduleTab === "Scenarios" && (
          <div className="py-8">
            <p className="font-mono text-[10px] uppercase tracking-[0.34em] text-bm-muted2">Fund</p>
            <h2 className="mt-2 font-editorial text-[2.2rem] font-medium tracking-[-0.025em] text-bm-text">
              Scenarios
            </h2>

            {scenarios.length === 0 ? (
              <div className="mt-8 py-12 text-center">
                <p className="font-editorial text-[1.4rem] font-medium text-bm-muted">No scenarios configured.</p>
                <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.18em] text-bm-muted2">
                  A base scenario is created automatically with the fund.
                </p>
              </div>
            ) : (
              <div className="mt-6 divide-y divide-bm-border/[0.08]">
                {scenarios.map((s) => (
                  <div key={s.scenario_id} className="flex items-center justify-between py-4">
                    <div>
                      <p className="font-sans text-sm font-medium text-bm-text">{s.name}</p>
                      <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.18em] text-bm-muted2">
                        {s.scenario_type}{s.is_base ? " · Base" : ""}
                      </p>
                    </div>
                    <span className="border border-bm-border/[0.2] px-3 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.28em] text-bm-muted2">
                      {s.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Audit */}
        {moduleTab === "Audit" && (
          <div className="py-8">
            <p className="font-mono text-[10px] uppercase tracking-[0.34em] text-bm-muted2">System</p>
            <h2 className="mt-2 font-editorial text-[2.2rem] font-medium tracking-[-0.025em] text-bm-text">
              Audit Trail
            </h2>

            <div className="mt-6 divide-y divide-bm-border/[0.06]">
              <div className="py-4">
                <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-bm-text">fund.created</p>
                <p className="mt-1 font-mono text-[10px] text-bm-muted2">
                  {detail?.fund?.created_at?.slice(0, 19).replace("T", " ") ?? "—"}
                </p>
              </div>
              {deals.map((deal) => (
                <div key={deal.deal_id} className="py-4">
                  <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-bm-text">
                    investment.linked · {deal.name}
                  </p>
                  <p className="mt-1 font-mono text-[10px] text-bm-muted2">
                    {deal.created_at?.slice(0, 19).replace("T", " ")}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Attachments */}
        {moduleTab === "Attachments" && businessId && environmentId && (
          <div className="py-6">
            <RepeEntityDocuments
              businessId={businessId}
              envId={environmentId}
              entityType="fund"
              entityId={params.fundId}
            />
          </div>
        )}

      </div>
    </section>
  );
}
