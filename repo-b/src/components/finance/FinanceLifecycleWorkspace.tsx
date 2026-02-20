"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useBusinessContext } from "@/lib/business-context";
import {
  FinFund,
  UnderwritingRun,
  DocumentItem,
  ExecutionItem,
  getBusinessOverviewReport,
  getDepartmentHealthReport,
  getDocRegisterReport,
  getExecutionLedgerReport,
  listDocuments,
  listExecutions,
  listFinAssets,
  listFinCapitalCalls,
  listFinCommitments,
  listFinDistributionEvents,
  listFinFunds,
  listFinPartitions,
  listUnderwritingRuns,
} from "@/lib/bos-api";
import { Badge } from "@/components/ui/Badge";

type FinanceSection = "portfolio" | "funds" | "deals" | "asset-management" | "waterfalls" | "controls";

type FundSnapshot = FinFund & {
  commitmentsTotal: number;
  calledTotal: number;
  calledYtd: number;
  distributedTotal: number;
  valuationTotal: number;
  deployedPct: number | null;
  netIrr: number | null;
  statusLabel: "Deploying" | "Harvesting" | "Closed";
  watchlistAssets: number;
  accruedPrefEstimate: number;
};

type RecentActivity = {
  id: string;
  at: string;
  kind: "execution" | "upload" | "waterfall";
  label: string;
  status: string;
};

const TARGET_NET_IRR = 0.14;

const NAV_ITEMS: Array<{ key: FinanceSection; label: string }> = [
  { key: "portfolio", label: "Portfolio" },
  { key: "funds", label: "Funds" },
  { key: "deals", label: "Deals" },
  { key: "asset-management", label: "Asset Management" },
  { key: "waterfalls", label: "Waterfalls" },
  { key: "controls", label: "Controls & Governance" },
];

const SECTION_MODULES: Record<FinanceSection, Array<{ label: string; href: string; tag?: string }>> = {
  portfolio: [
    { label: "Fund Waterfall Engine", href: "/app/finance/repe", tag: "REPE" },
    { label: "Underwriting Orchestrator", href: "/app/finance/underwriting", tag: "Deals" },
    { label: "Security & ACL", href: "/app/finance/security", tag: "Controls" },
  ],
  funds: [{ label: "REPE Waterfalls", href: "/app/finance/repe", tag: "Fund Ledger" }],
  deals: [
    { label: "Underwriting", href: "/app/finance/underwriting", tag: "Core" },
    { label: "Scenario Lab", href: "/app/finance/scenarios", tag: "Sensitivity" },
    { label: "Healthcare / MSO", href: "/app/finance/healthcare", tag: "Industry Overlay" },
    { label: "Legal Economics", href: "/app/finance/legal", tag: "Deal Economics" },
  ],
  "asset-management": [
    { label: "Construction Finance", href: "/app/finance/construction", tag: "Forecasting" },
    { label: "Scenario Lab", href: "/app/finance/scenarios", tag: "Reforecast" },
  ],
  waterfalls: [{ label: "REPE Waterfalls", href: "/app/finance/repe", tag: "Distributions" }],
  controls: [
    { label: "Security & ACL", href: "/app/finance/security", tag: "Access" },
    { label: "Legal Economics", href: "/app/finance/legal", tag: "Evidence" },
  ],
};

function parseAmount(input: string | number | null | undefined): number {
  if (input === null || input === undefined) return 0;
  if (typeof input === "number") return Number.isFinite(input) ? input : 0;
  const cleaned = input.replace(/[^0-9.-]/g, "");
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : 0;
}

function formatCurrency(value: number | null): string {
  if (value === null || Number.isNaN(value)) return "N/A";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatPercent(value: number | null, digits = 1): string {
  if (value === null || Number.isNaN(value)) return "N/A";
  return `${(value * 100).toFixed(digits)}%`;
}

function normalizeStatusLabel(status: string): string {
  const lower = status.toLowerCase();
  if (lower.includes("complete") || lower.includes("closed") || lower.includes("approved")) return "Approved";
  if (lower.includes("fail") || lower.includes("error")) return "Watchlist";
  if (lower.includes("run") || lower.includes("draft") || lower.includes("pending")) return "Draft";
  return "Draft";
}

function statusVariantForTag(status: string): "default" | "accent" | "success" | "warning" | "danger" {
  const lower = status.toLowerCase();
  if (lower.includes("approved") || lower.includes("locked") || lower.includes("closed") || lower.includes("success")) {
    return "success";
  }
  if (lower.includes("watch") || lower.includes("failed") || lower.includes("risk")) {
    return "danger";
  }
  if (lower.includes("draft") || lower.includes("pending") || lower.includes("ic")) {
    return "warning";
  }
  if (lower.includes("active") || lower.includes("deploy")) {
    return "accent";
  }
  return "default";
}

function inferFundStatus(deployedPct: number | null, distributedTotal: number, calledTotal: number): "Deploying" | "Harvesting" | "Closed" {
  if ((deployedPct ?? 0) >= 0.95 && distributedTotal >= calledTotal && calledTotal > 0) return "Closed";
  if ((deployedPct ?? 0) >= 0.75) return "Harvesting";
  return "Deploying";
}

function asOfDateLabel(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  }).format(date);
}

export default function FinanceLifecycleWorkspace({
  deptKey,
  section,
}: {
  deptKey: string;
  section: FinanceSection;
}) {
  const { businessId, departments } = useBusinessContext();
  const financeDept = departments.find((dept) => dept.key === "finance");

  const [loading, setLoading] = useState(true);
  const [fundRows, setFundRows] = useState<FundSnapshot[]>([]);
  const [underwritingRuns, setUnderwritingRuns] = useState<UnderwritingRun[]>([]);
  const [executions, setExecutions] = useState<ExecutionItem[]>([]);
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [riskRows, setRiskRows] = useState<Array<{ label: string; status: string; note: string }>>([]);
  const [activityRows, setActivityRows] = useState<RecentActivity[]>([]);
  const [environmentName, setEnvironmentName] = useState("No environment selected");
  const [industryName, setIndustryName] = useState("General");
  const [refreshStatus, setRefreshStatus] = useState("Refreshing");
  const [roleLabel, setRoleLabel] = useState("Portfolio Manager");
  const [asOfDate, setAsOfDate] = useState(() => new Date());

  useEffect(() => {
    const roleFromStorage =
      (typeof window !== "undefined" &&
        (localStorage.getItem("active_user_role") || localStorage.getItem("demo_user_role"))) ||
      "Portfolio Manager";
    setRoleLabel(roleFromStorage);
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!businessId) {
      setLoading(false);
      return;
    }

    async function loadFinanceWorkspace() {
      const currentBusinessId = businessId;
      if (!currentBusinessId) return;
      setLoading(true);
      try {
        const now = new Date();
        const currentYear = now.getFullYear();

        const [partitions, uwRuns, execRows, docRows, envPayload, overview, health, ledger, docRegister] = await Promise.all([
          listFinPartitions(currentBusinessId).catch(() => []),
          listUnderwritingRuns(currentBusinessId, { limit: 1000 }).catch(() => []),
          financeDept
            ? listExecutions(currentBusinessId, financeDept.department_id).catch(() => [])
            : listExecutions(currentBusinessId).catch(() => []),
          financeDept
            ? listDocuments(currentBusinessId, financeDept.department_id).catch(() => [])
            : listDocuments(currentBusinessId).catch(() => []),
          fetch("/api/v1/environments")
            .then((res) => (res.ok ? res.json() : { environments: [] }))
            .catch(() => ({ environments: [] })),
          getBusinessOverviewReport(currentBusinessId).catch(() => null),
          getDepartmentHealthReport(currentBusinessId, "finance").catch(() => ({ rows: [] })),
          getExecutionLedgerReport(currentBusinessId).catch(() => ({ rows: [] })),
          getDocRegisterReport(currentBusinessId).catch(() => ({ rows: [] })),
        ]);

        const fundRowsByPartition = await Promise.all(
          partitions.map((partition) => listFinFunds(currentBusinessId, partition.partition_id).catch(() => []))
        );
        const allFunds = fundRowsByPartition.flat();

        const scopedFunds = allFunds.slice(0, 120);
        const scopedFundDetails = await Promise.all(
          scopedFunds.map(async (fund) => {
            const [commitments, calls, assets, dists] = await Promise.all([
              listFinCommitments(fund.fin_fund_id).catch(() => []),
              listFinCapitalCalls(fund.fin_fund_id).catch(() => []),
              listFinAssets(fund.fin_fund_id).catch(() => []),
              listFinDistributionEvents(fund.fin_fund_id).catch(() => []),
            ]);

            const commitmentsTotal = commitments.reduce((sum, row) => sum + parseAmount(row.committed_amount), 0);
            const calledTotal = calls.reduce((sum, row) => sum + parseAmount(row.amount_requested), 0);
            const calledYtd = calls.reduce((sum, row) => {
              const year = new Date(row.call_date).getFullYear();
              return year === currentYear ? sum + parseAmount(row.amount_requested) : sum;
            }, 0);
            const distributedTotal = dists.reduce((sum, row) => sum + parseAmount(row.net_distributable), 0);
            const valuationTotal = assets.reduce(
              (sum, row) => sum + parseAmount(row.current_valuation || row.cost_basis),
              0
            );
            const deployedPct = commitmentsTotal > 0 ? Math.min(calledTotal / commitmentsTotal, 1) : null;
            const netIrr =
              calledTotal > 0 ? (distributedTotal + valuationTotal - calledTotal) / calledTotal : null;
            const watchlistAssets = assets.filter((asset) => {
              const status = String(asset.status || "").toLowerCase();
              if (status.includes("watch") || status.includes("distress") || status.includes("default")) return true;
              const cost = parseAmount(asset.cost_basis);
              const value = parseAmount(asset.current_valuation || asset.cost_basis);
              return cost > 0 && value / cost < 0.82;
            }).length;
            const statusLabel = inferFundStatus(deployedPct, distributedTotal, calledTotal);
            const accruedPrefEstimate = commitmentsTotal * parseAmount(fund.pref_rate) * 0.25;

            return {
              ...fund,
              commitmentsTotal,
              calledTotal,
              calledYtd,
              distributedTotal,
              valuationTotal,
              deployedPct,
              netIrr,
              watchlistAssets,
              statusLabel,
              accruedPrefEstimate,
            } as FundSnapshot;
          })
        );

        const byFundId = new Map(scopedFundDetails.map((row) => [row.fin_fund_id, row]));
        const mergedFundRows: FundSnapshot[] = allFunds.map((fund) => {
          const maybe = byFundId.get(fund.fin_fund_id);
          if (maybe) return maybe;
          return {
            ...fund,
            commitmentsTotal: 0,
            calledTotal: 0,
            calledYtd: 0,
            distributedTotal: 0,
            valuationTotal: 0,
            deployedPct: null,
            netIrr: null,
            watchlistAssets: 0,
            statusLabel: "Deploying",
            accruedPrefEstimate: 0,
          };
        });

        const envId = typeof window !== "undefined" ? localStorage.getItem("demo_lab_env_id") : null;
        const environments = Array.isArray(envPayload?.environments) ? envPayload.environments : [];
        const selectedEnv = environments.find((env: { env_id?: string }) => env.env_id === envId) || null;

        const businessObject = overview && typeof overview === "object" ? overview.business : null;
        const businessName =
          (businessObject &&
            typeof businessObject === "object" &&
            (String((businessObject as Record<string, unknown>).name || "") ||
              String((businessObject as Record<string, unknown>).label || "") ||
              String((businessObject as Record<string, unknown>).business_name || "") ||
              String((businessObject as Record<string, unknown>).slug || ""))) ||
          "";

        const riskSignals = [
          {
            label: "Assets on watchlist",
            status: mergedFundRows.reduce((sum, fund) => sum + fund.watchlistAssets, 0) > 0 ? "Watchlist" : "Approved",
            note:
              mergedFundRows.reduce((sum, fund) => sum + fund.watchlistAssets, 0) > 0
                ? "Asset-level valuation or operating stress requires IC visibility."
                : "No active watchlist assets in current fund sample.",
          },
          {
            label: "Execution exceptions",
            status:
              execRows.filter((row) => row.status.toLowerCase().includes("fail")).length > 0
                ? "Watchlist"
                : "Approved",
            note:
              execRows.filter((row) => row.status.toLowerCase().includes("fail")).length > 0
                ? "Recent failed finance executions need rerun or remediation."
                : "No failed finance executions in recent window.",
          },
          {
            label: "Control evidence freshness",
            status:
              docRegister.rows && docRegister.rows.length > 0
                ? "Approved"
                : "Draft",
            note:
              docRegister.rows && docRegister.rows.length > 0
                ? "Document registry populated with source records."
                : "Document registry has limited entries; evidence chain may be incomplete.",
          },
          {
            label: "Department health",
            status:
              Array.isArray(health.rows) && health.rows.length > 0
                ? "Approved"
                : "Draft",
            note:
              Array.isArray(health.rows) && health.rows.length > 0
                ? "Department health report is available for this environment."
                : "Department health report has no rows in this tenant.",
          },
        ];

        const waterfallActivities = execRows
          .filter((row) => JSON.stringify(row.inputs_json).toLowerCase().includes("waterfall"))
          .slice(0, 4)
          .map((row) => ({
            id: `waterfall-${row.execution_id}`,
            at: row.created_at,
            kind: "waterfall" as const,
            label: `Waterfall run ${row.execution_id.slice(0, 8)}`,
            status: row.status,
          }));

        const execActivities = execRows.slice(0, 6).map((row) => ({
          id: `exec-${row.execution_id}`,
          at: row.created_at,
          kind: "execution" as const,
          label: `Execution ${row.execution_id.slice(0, 8)}`,
          status: row.status,
        }));

        const uploadActivities = docRows.slice(0, 6).map((row) => ({
          id: `upload-${row.document_id}`,
          at: row.created_at,
          kind: "upload" as const,
          label: `Document upload: ${row.title}`,
          status: row.status,
        }));

        const recentActivity = [...execActivities, ...uploadActivities, ...waterfallActivities]
          .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
          .slice(0, 10);

        if (cancelled) return;
        setFundRows(mergedFundRows);
        setUnderwritingRuns(uwRuns);
        setExecutions(execRows);
        setDocuments(docRows);
        setRiskRows(riskSignals);
        setActivityRows(recentActivity);
        setEnvironmentName(selectedEnv?.client_name || businessName || "Current Business");
        setIndustryName(selectedEnv?.industry_type || selectedEnv?.industry || "Real Estate");
        setAsOfDate(now);
        setRefreshStatus("Synced");

        if (!ledger.rows || ledger.rows.length === 0) {
          setRefreshStatus("Partial");
        }
      } catch {
        if (!cancelled) {
          setRefreshStatus("Partial");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadFinanceWorkspace();
    return () => {
      cancelled = true;
    };
  }, [businessId, financeDept]);

  const dealBuckets = useMemo(() => {
    const pipeline: UnderwritingRun[] = [];
    const inIc: UnderwritingRun[] = [];
    const assetMgmt: UnderwritingRun[] = [];

    for (const run of underwritingRuns) {
      const status = run.status.toLowerCase();
      if (status.includes("ic") || status.includes("committee") || status.includes("approval")) {
        inIc.push(run);
      } else if (status.includes("approved") || status.includes("active") || status.includes("asset")) {
        assetMgmt.push(run);
      } else {
        pipeline.push(run);
      }
    }

    return { pipeline, inIc, assetMgmt };
  }, [underwritingRuns]);

  const summary = useMemo(() => {
    const activeFunds = fundRows.filter((fund) => fund.statusLabel !== "Closed").length;
    const dealsInIc = dealBuckets.inIc.length;
    const capitalDeployedYtd = fundRows.reduce((sum, row) => sum + row.calledYtd, 0);
    const withIrr = fundRows.filter((row) => row.netIrr !== null);
    const netIrr = withIrr.length
      ? withIrr.reduce((sum, row) => sum + (row.netIrr || 0), 0) / withIrr.length
      : null;
    const assetsOnWatchlist = fundRows.reduce((sum, row) => sum + row.watchlistAssets, 0);

    return {
      activeFunds,
      dealsInIc,
      capitalDeployedYtd,
      netIrr,
      assetsOnWatchlist,
    };
  }, [fundRows, dealBuckets.inIc.length]);

  const statusForRefresh = refreshStatus === "Synced" ? "Locked" : refreshStatus === "Partial" ? "Draft" : "Draft";

  if (deptKey !== "finance") {
    return (
      <div className="space-y-3 max-w-3xl">
        <h1 className="text-xl font-semibold">Lifecycle workspace available for Finance</h1>
        <p className="text-sm text-bm-muted2">
          This route is reserved for the Finance department lifecycle model.
        </p>
        <Link
          href={`/app/${deptKey}`}
          className="inline-flex items-center rounded-lg border border-bm-border/70 px-3 py-2 text-sm hover:bg-bm-surface/40"
        >
          Return to {deptKey}
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1400px] space-y-4">
      <header className="rounded-xl border border-bm-border/70 bg-bm-bg/30 px-4 py-3 sm:px-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.14em] text-bm-muted2">Finance Command Center</p>
            <h1 className="text-xl font-semibold">Institutional Lifecycle Operating Surface</h1>
          </div>
          <div className="text-sm">
            <p className="text-bm-muted2">As-of Date</p>
            <p className="font-semibold">{asOfDateLabel(asOfDate)}</p>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-5">
          <ContextCell label="Environment" value={environmentName} />
          <ContextCell label="Industry" value={industryName} />
          <ContextCell label="As-of" value={asOfDateLabel(asOfDate)} />
          <ContextCell label="Data Refresh" value={refreshStatus} badge={statusForRefresh} />
          <ContextCell label="Active User Role" value={roleLabel} />
        </div>
      </header>

      <nav className="grid grid-cols-2 gap-2 rounded-xl border border-bm-border/70 bg-bm-bg/25 p-2 md:grid-cols-3 xl:grid-cols-6">
        {NAV_ITEMS.map((item) => {
          const active = item.key === section;
          return (
            <Link
              key={item.key}
              href={`/app/${deptKey}/${item.key}`}
              className={`rounded-lg border px-3 py-2 text-sm transition ${
                active
                  ? "border-bm-accent/40 bg-bm-accent/10 text-bm-text"
                  : "border-transparent bg-bm-surface/25 text-bm-muted hover:border-bm-border/70 hover:text-bm-text"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      {section === "portfolio" && (
        <section className="space-y-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
            <MetricCard label="Active Funds" value={String(summary.activeFunds)} />
            <MetricCard label="Deals in IC" value={String(summary.dealsInIc)} />
            <MetricCard label="Capital Deployed YTD" value={formatCurrency(summary.capitalDeployedYtd)} />
            <MetricCard
              label="Net IRR vs Target"
              value={`${formatPercent(summary.netIrr)} vs ${formatPercent(TARGET_NET_IRR)}`}
              tone={
                summary.netIrr !== null && summary.netIrr >= TARGET_NET_IRR
                  ? "success"
                  : "warning"
              }
            />
            <MetricCard
              label="Assets on Watchlist"
              value={String(summary.assetsOnWatchlist)}
              tone={summary.assetsOnWatchlist > 0 ? "danger" : "success"}
            />
          </div>

          <div className="grid grid-cols-1 gap-3 xl:grid-cols-12">
            <div className="rounded-xl border border-bm-border/70 bg-bm-bg/25 p-4 xl:col-span-5">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-bm-muted2">Risk Signals</h2>
                <Badge variant="default">Control Radar</Badge>
              </div>
              <div className="space-y-2">
                {riskRows.map((row) => (
                  <div key={row.label} className="rounded-lg border border-bm-border/60 bg-bm-surface/30 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium">{row.label}</p>
                      <Badge variant={statusVariantForTag(row.status)}>{row.status}</Badge>
                    </div>
                    <p className="mt-1 text-xs text-bm-muted2">{row.note}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-xl border border-bm-border/70 bg-bm-bg/25 p-4 xl:col-span-7">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-bm-muted2">Recent Activity</h2>
                <Badge variant="accent">Executions, uploads, waterfalls</Badge>
              </div>
              <div className="space-y-2">
                {activityRows.length === 0 ? (
                  <p className="rounded-lg border border-bm-border/60 bg-bm-surface/30 p-3 text-sm text-bm-muted2">
                    No finance activity captured yet for this business.
                  </p>
                ) : (
                  activityRows.map((row) => (
                    <div key={row.id} className="flex items-center justify-between rounded-lg border border-bm-border/60 bg-bm-surface/30 px-3 py-2">
                      <div>
                        <p className="text-sm">{row.label}</p>
                        <p className="text-xs text-bm-muted2">{new Date(row.at).toLocaleString()}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="default">{row.kind}</Badge>
                        <Badge variant={statusVariantForTag(row.status)}>{normalizeStatusLabel(row.status)}</Badge>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          <EmbeddedModules section={section} />
        </section>
      )}

      {section === "funds" && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Funds</h2>
            <Badge variant="accent">{fundRows.length} fund records</Badge>
          </div>
          <div className="overflow-x-auto rounded-xl border border-bm-border/70 bg-bm-bg/25">
            <table className="min-w-full text-sm">
              <thead className="bg-bm-surface/40 text-left text-xs uppercase tracking-[0.12em] text-bm-muted2">
                <tr>
                  <th className="px-3 py-2">Fund</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Commitments</th>
                  <th className="px-3 py-2">% Deployed</th>
                  <th className="px-3 py-2">Net IRR</th>
                  <th className="px-3 py-2">Action</th>
                </tr>
              </thead>
              <tbody>
                {fundRows.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-3 py-6 text-center text-bm-muted2">
                      No fund rows found.
                    </td>
                  </tr>
                )}
                {fundRows.map((fund) => (
                  <tr key={fund.fin_fund_id} className="border-t border-bm-border/60">
                    <td className="px-3 py-2">
                      <p className="font-medium">{fund.name}</p>
                      <p className="text-xs text-bm-muted2">{fund.fund_code}</p>
                    </td>
                    <td className="px-3 py-2">
                      <Badge variant={statusVariantForTag(fund.statusLabel)}>{fund.statusLabel}</Badge>
                    </td>
                    <td className="px-3 py-2">{formatCurrency(fund.commitmentsTotal)}</td>
                    <td className="px-3 py-2">{formatPercent(fund.deployedPct)}</td>
                    <td className="px-3 py-2">{formatPercent(fund.netIrr)}</td>
                    <td className="px-3 py-2">
                      <Link
                        href="/app/finance/repe"
                        className="inline-flex rounded-md border border-bm-border/70 px-2.5 py-1.5 text-xs hover:bg-bm-surface/40"
                      >
                        Open Fund
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <EmbeddedModules section={section} />
        </section>
      )}

      {section === "deals" && (
        <section className="space-y-3">
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <MetricCard label="Deals in Pipeline" value={String(dealBuckets.pipeline.length)} />
            <MetricCard label="Deals in IC" value={String(dealBuckets.inIc.length)} />
            <MetricCard label="Deals in Asset Mgmt" value={String(dealBuckets.assetMgmt.length)} />
            <MetricCard
              label="Underwriting Status"
              value={`${underwritingRuns.length} total runs`}
              tone={underwritingRuns.length > 0 ? "accent" : "default"}
            />
          </div>

          <div className="overflow-x-auto rounded-xl border border-bm-border/70 bg-bm-bg/25">
            <table className="min-w-full text-sm">
              <thead className="bg-bm-surface/40 text-left text-xs uppercase tracking-[0.12em] text-bm-muted2">
                <tr>
                  <th className="px-3 py-2">Deal</th>
                  <th className="px-3 py-2">Underwriting</th>
                  <th className="px-3 py-2">Lifecycle Stage</th>
                  <th className="px-3 py-2">Updated</th>
                  <th className="px-3 py-2">Action</th>
                </tr>
              </thead>
              <tbody>
                {underwritingRuns.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-3 py-6 text-center text-bm-muted2">
                      No underwriting deals yet.
                    </td>
                  </tr>
                )}
                {underwritingRuns.slice(0, 150).map((run) => {
                  const status = run.status.toLowerCase();
                  const stage =
                    status.includes("ic") || status.includes("committee")
                      ? "IC"
                      : status.includes("approved") || status.includes("active")
                        ? "Asset Mgmt"
                        : "Pipeline";
                  return (
                    <tr key={run.run_id} className="border-t border-bm-border/60">
                      <td className="px-3 py-2">
                        <p className="font-medium">{run.property_name}</p>
                        <p className="text-xs text-bm-muted2">{run.property_type}</p>
                      </td>
                      <td className="px-3 py-2">
                        <Badge variant={statusVariantForTag(run.status)}>{normalizeStatusLabel(run.status)}</Badge>
                      </td>
                      <td className="px-3 py-2">
                        <Badge variant={statusVariantForTag(stage)}>{stage}</Badge>
                      </td>
                      <td className="px-3 py-2 text-xs text-bm-muted2">{new Date(run.updated_at).toLocaleString()}</td>
                      <td className="px-3 py-2">
                        <Link
                          href="/app/finance/underwriting"
                          className="inline-flex rounded-md border border-bm-border/70 px-2.5 py-1.5 text-xs hover:bg-bm-surface/40"
                        >
                          Open Deal
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <EmbeddedModules section={section} />
        </section>
      )}

      {section === "asset-management" && (
        <section className="grid grid-cols-1 gap-3 xl:grid-cols-12">
          <div className="rounded-xl border border-bm-border/70 bg-bm-bg/25 p-4 xl:col-span-4">
            <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-bm-muted2">DSCR Flags</h2>
            <p className="mt-2 text-2xl font-semibold">{summary.assetsOnWatchlist}</p>
            <p className="text-xs text-bm-muted2">Assets marked watchlist/distress from finance asset books.</p>
          </div>
          <div className="rounded-xl border border-bm-border/70 bg-bm-bg/25 p-4 xl:col-span-4">
            <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-bm-muted2">Covenant Monitoring</h2>
            <p className="mt-2 text-2xl font-semibold">
              {executions.filter((row) => row.status.toLowerCase().includes("fail")).length}
            </p>
            <p className="text-xs text-bm-muted2">Failed or exception finance executions requiring controls review.</p>
          </div>
          <div className="rounded-xl border border-bm-border/70 bg-bm-bg/25 p-4 xl:col-span-4">
            <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-bm-muted2">Reforecast Runs</h2>
            <p className="mt-2 text-2xl font-semibold">
              {
                executions.filter((row) => JSON.stringify(row.inputs_json).toLowerCase().includes("scenario"))
                  .length
              }
            </p>
            <p className="text-xs text-bm-muted2">Scenario-linked execution count in current finance workspace.</p>
          </div>

          <div className="rounded-xl border border-bm-border/70 bg-bm-bg/25 p-4 xl:col-span-12">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-bm-muted2">Watchlist Items</h2>
              <Badge variant={summary.assetsOnWatchlist > 0 ? "danger" : "success"}>
                {summary.assetsOnWatchlist > 0 ? "Watchlist" : "Clear"}
              </Badge>
            </div>
            <div className="space-y-2">
              {fundRows.filter((row) => row.watchlistAssets > 0).length === 0 ? (
                <p className="text-sm text-bm-muted2">No flagged funds in watchlist scope.</p>
              ) : (
                fundRows
                  .filter((row) => row.watchlistAssets > 0)
                  .map((row) => (
                    <div key={row.fin_fund_id} className="flex items-center justify-between rounded-lg border border-bm-border/60 bg-bm-surface/30 px-3 py-2">
                      <div>
                        <p className="text-sm font-medium">{row.name}</p>
                        <p className="text-xs text-bm-muted2">{row.watchlistAssets} assets flagged</p>
                      </div>
                      <Link
                        href="/app/finance/construction"
                        className="inline-flex rounded-md border border-bm-border/70 px-2 py-1 text-xs hover:bg-bm-surface/40"
                      >
                        Open Asset Mgmt
                      </Link>
                    </div>
                  ))
              )}
            </div>
          </div>

          <EmbeddedModules section={section} />
        </section>
      )}

      {section === "waterfalls" && (
        <section className="space-y-3">
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <MetricCard
              label="Distribution History"
              value={String(fundRows.reduce((sum, row) => sum + (row.distributedTotal > 0 ? 1 : 0), 0))}
            />
            <MetricCard
              label="Accrued Pref"
              value={formatCurrency(fundRows.reduce((sum, row) => sum + row.accruedPrefEstimate, 0))}
            />
            <MetricCard
              label="Versioned Runs"
              value={String(activityRows.filter((row) => row.kind === "waterfall").length)}
            />
            <MetricCard
              label="Locked vs Draft"
              value={`${executions.filter((row) => row.status.toLowerCase().includes("complete")).length} locked / ${executions.filter((row) => !row.status.toLowerCase().includes("complete")).length} draft`}
            />
          </div>

          <div className="overflow-x-auto rounded-xl border border-bm-border/70 bg-bm-bg/25">
            <table className="min-w-full text-sm">
              <thead className="bg-bm-surface/40 text-left text-xs uppercase tracking-[0.12em] text-bm-muted2">
                <tr>
                  <th className="px-3 py-2">Fund</th>
                  <th className="px-3 py-2">Distribution</th>
                  <th className="px-3 py-2">Accrued Pref</th>
                  <th className="px-3 py-2">State</th>
                  <th className="px-3 py-2">Action</th>
                </tr>
              </thead>
              <tbody>
                {fundRows.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-3 py-6 text-center text-bm-muted2">
                      No fund rows found.
                    </td>
                  </tr>
                )}
                {fundRows.slice(0, 160).map((row) => {
                  const locked = row.statusLabel === "Closed";
                  return (
                    <tr key={row.fin_fund_id} className="border-t border-bm-border/60">
                      <td className="px-3 py-2">{row.name}</td>
                      <td className="px-3 py-2">{formatCurrency(row.distributedTotal)}</td>
                      <td className="px-3 py-2">{formatCurrency(row.accruedPrefEstimate)}</td>
                      <td className="px-3 py-2">
                        <Badge variant={locked ? "success" : "warning"}>{locked ? "Locked" : "Draft"}</Badge>
                      </td>
                      <td className="px-3 py-2">
                        <Link
                          href="/app/finance/repe"
                          className="inline-flex rounded-md border border-bm-border/70 px-2.5 py-1.5 text-xs hover:bg-bm-surface/40"
                        >
                          Open Waterfall
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <EmbeddedModules section={section} />
        </section>
      )}

      {section === "controls" && (
        <section className="space-y-3">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            <ControlCard
              label="ACL / Role Surfaces"
              detail="Role boundaries and entity access segregation"
              status={roleLabel}
              href="/app/finance/security"
            />
            <ControlCard
              label="Audit Log Access"
              detail="Execution and change audit visibility"
              status={`${executions.length} events`}
              href="/lab/audit"
            />
            <ControlCard
              label="Document Registry"
              detail="Evidence-backed source records"
              status={`${documents.length} docs`}
              href="/app/reports/document-register"
            />
            <ControlCard
              label="Evidence Chain"
              detail="Lineage from inputs to outputs"
              status={activityRows.length > 0 ? "Active" : "Draft"}
              href="/app/reports/execution-ledger"
            />
          </div>
          <EmbeddedModules section={section} />
        </section>
      )}

      {loading && (
        <div className="rounded-xl border border-bm-border/70 bg-bm-bg/25 px-4 py-3 text-sm text-bm-muted2">
          Loading finance lifecycle context...
        </div>
      )}
    </div>
  );
}

function ContextCell({
  label,
  value,
  badge,
}: {
  label: string;
  value: string;
  badge?: string;
}) {
  return (
    <div className="rounded-lg border border-bm-border/60 bg-bm-surface/30 px-3 py-2">
      <p className="text-[11px] uppercase tracking-[0.12em] text-bm-muted2">{label}</p>
      <div className="mt-1 flex items-center justify-between gap-2">
        <p className="text-sm font-medium">{value}</p>
        {badge ? <Badge variant={statusVariantForTag(badge)}>{badge}</Badge> : null}
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "accent" | "success" | "warning" | "danger";
}) {
  return (
    <div className="rounded-xl border border-bm-border/70 bg-bm-bg/25 p-3">
      <p className="text-xs uppercase tracking-[0.12em] text-bm-muted2">{label}</p>
      <div className="mt-2 flex items-center justify-between">
        <p className="text-lg font-semibold">{value}</p>
        <Badge variant={tone}>As-of</Badge>
      </div>
    </div>
  );
}

function EmbeddedModules({ section }: { section: FinanceSection }) {
  const modules = SECTION_MODULES[section];
  if (!modules || modules.length === 0) return null;

  return (
    <div className="rounded-xl border border-bm-border/70 bg-bm-bg/25 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-bm-muted2">Embedded Capabilities</h2>
        <Badge variant="default">Lifecycle-mapped</Badge>
      </div>
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
        {modules.map((module) => (
          <Link
            key={`${section}-${module.href}`}
            href={module.href}
            className="rounded-lg border border-bm-border/60 bg-bm-surface/25 px-3 py-2 hover:bg-bm-surface/45"
          >
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium">{module.label}</p>
              {module.tag ? <Badge variant="accent">{module.tag}</Badge> : null}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

function ControlCard({
  label,
  detail,
  status,
  href,
}: {
  label: string;
  detail: string;
  status: string;
  href: string;
}) {
  return (
    <div className="rounded-xl border border-bm-border/70 bg-bm-bg/25 p-4">
      <p className="text-sm font-semibold">{label}</p>
      <p className="mt-1 text-xs text-bm-muted2">{detail}</p>
      <div className="mt-3 flex items-center justify-between">
        <Badge variant="default">{status}</Badge>
        <Link href={href} className="text-xs text-bm-accent hover:text-bm-accent2">
          Open
        </Link>
      </div>
    </div>
  );
}
