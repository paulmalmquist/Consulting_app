"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { Card, CardContent } from "@/components/ui/Card";
import type { RepeWorkspaceData } from "@/lib/server/repe";

type Props = {
  envId: string;
  initialData: RepeWorkspaceData;
};

type AssumptionState = {
  rentGrowthPct: string;
  expenseRatio: string;
  exitCapRate: string;
};

function formatMoney(value?: number | null): string {
  if (value === null || value === undefined) return "N/A";
  if (Math.abs(value) >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)}B`;
  if (Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  return `$${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function formatPct(value?: number | null): string {
  if (value === null || value === undefined) return "N/A";
  return `${(value * 100).toFixed(1)}%`;
}

function formatMultiple(value?: number | null): string {
  if (value === null || value === undefined) return "N/A";
  return `${value.toFixed(2)}x`;
}

async function parseJson(response: Response) {
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || payload.detail || "Request failed");
  }
  return payload;
}

export default function RepeWorkspace({ envId, initialData }: Props) {
  const [workspace, setWorkspace] = useState(initialData);
  const [assumptions, setAssumptions] = useState<AssumptionState>({
    rentGrowthPct: "0.03",
    expenseRatio: "0.35",
    exitCapRate: "0.055",
  });
  const [status, setStatus] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const selectedModel = workspace.models[0] ?? null;
  const selectedScenario = workspace.scenarios[0] ?? null;
  const funds = workspace.funds;

  const workflowStatus = useMemo(
    () => [
      {
        label: "Deal sourcing",
        ready: workspace.pipelineDeals.length > 0,
        helper: `${workspace.pipelineDeals.length} pipeline deals in scope`,
      },
      {
        label: "Document intelligence",
        ready: workspace.documents.length > 0,
        helper: `${workspace.documents.length} diligence documents`,
      },
      {
        label: "Underwriting",
        ready: Boolean(selectedModel?.latestRunId),
        helper: selectedModel?.latestRunId ? `Latest run ${selectedModel.latestRunId}` : "No persisted model run yet",
      },
      {
        label: "Scenario",
        ready: workspace.scenarios.length > 0,
        helper: `${workspace.scenarios.length} scenarios`,
      },
      {
        label: "Waterfall",
        ready: workspace.waterfallRuns.length > 0,
        helper: `${workspace.waterfallRuns.length} runs`,
      },
      {
        label: "IC memo",
        ready: Boolean(workspace.latestIcMemo),
        helper: workspace.latestIcMemo?.title || "No IC memo draft yet",
      },
    ],
    [workspace, selectedModel]
  );

  async function refresh() {
    const params = new URLSearchParams({
      env_id: envId,
      business_id: workspace.businessId,
      fund_id: workspace.selectedFundId,
      quarter: workspace.quarter,
    });
    const payload = await parseJson(
      await fetch(`/api/re/v2/workspace?${params.toString()}`, { cache: "no-store" })
    );
    setWorkspace(payload);
  }

  function assumptionPayload() {
    return {
      assumptions: {
        rent_growth_pct: Number(assumptions.rentGrowthPct),
        expense_ratio: Number(assumptions.expenseRatio),
        exit_cap_rate: Number(assumptions.exitCapRate),
      },
    };
  }

  async function handleRunModel() {
    if (!selectedModel) {
      setStatus("No model is available for this fund.");
      return;
    }
    startTransition(async () => {
      try {
        const payload = await parseJson(
          await fetch(`/api/re/v2/models/${selectedModel.modelId}/runs`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              quarter: workspace.quarter,
              ...assumptionPayload(),
            }),
          })
        );
        setStatus(`Underwriting run ${payload.runId} completed.`);
        await refresh();
      } catch (error) {
        setStatus(error instanceof Error ? error.message : "Model run failed.");
      }
    });
  }

  async function handleCreateScenario() {
    startTransition(async () => {
      try {
        const payload = await parseJson(
          await fetch(`/api/re/v2/funds/${workspace.selectedFundId}/scenarios`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              quarter: workspace.quarter,
              model_id: selectedModel?.modelId,
              name: "Workspace Downside",
              description: "Created from the Meridian workspace action panel.",
              ...assumptionPayload(),
            }),
          })
        );
        setStatus(`Scenario ${payload.scenarioId} created for ${payload.quarter}.`);
        await refresh();
      } catch (error) {
        setStatus(error instanceof Error ? error.message : "Scenario creation failed.");
      }
    });
  }

  async function handleRunWaterfall() {
    startTransition(async () => {
      try {
        const payload = await parseJson(
          await fetch(`/api/re/v2/funds/${workspace.selectedFundId}/waterfall/runs`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              quarter: workspace.quarter,
              scenario_id: selectedScenario?.scenarioId,
              run_type: "workspace",
            }),
          })
        );
        setStatus(
          `Waterfall run ${payload.runId} allocated ${formatMoney(payload.totalDistributable)}.`
        );
        await refresh();
      } catch (error) {
        setStatus(error instanceof Error ? error.message : "Waterfall run failed.");
      }
    });
  }

  async function handleGenerateMemo() {
    startTransition(async () => {
      try {
        const payload = await parseJson(
          await fetch(`/api/re/v2/reports/ic-memo`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              env_id: envId,
              fund_id: workspace.selectedFundId,
              quarter: workspace.quarter,
              scenario_id: selectedScenario?.scenarioId,
              model_run_id: selectedModel?.latestRunId,
            }),
          })
        );
        setStatus(`IC memo draft ${payload.id} generated.`);
        await refresh();
      } catch (error) {
        setStatus(error instanceof Error ? error.message : "IC memo generation failed.");
      }
    });
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_#fef3c7,_transparent_30%),linear-gradient(180deg,_#fff8ec,_#f8fafc_45%,_#eef2ff)] text-slate-900">
      <div className="mx-auto max-w-7xl px-6 py-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm uppercase tracking-[0.24em] text-amber-700">Meridian REPE MVP</p>
            <h1 className="mt-2 text-4xl font-semibold tracking-tight">
              {workspace.selectedFund.name}
            </h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-600">
              Source-backed Meridian workflow from pipeline to memo, wired against the live RE tables.
            </p>
          </div>
          <div className="rounded-2xl border border-amber-200 bg-white/80 px-4 py-3 shadow-sm backdrop-blur">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Selected Quarter</p>
            <p className="mt-1 text-lg font-semibold">{workspace.quarter}</p>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-2">
          {funds.map((fund) => {
            const active = fund.fundId === workspace.selectedFundId;
            return (
              <Link
                key={fund.fundId}
                href={`/lab/env/${envId}/re?fund_id=${fund.fundId}&quarter=${workspace.quarter}`}
                className={`rounded-full border px-4 py-2 text-sm transition ${
                  active
                    ? "border-amber-500 bg-amber-500 text-white"
                    : "border-slate-200 bg-white/90 text-slate-700 hover:border-amber-300"
                }`}
              >
                {fund.name}
              </Link>
            );
          })}
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <MetricCard label="Portfolio NAV" value={formatMoney(workspace.quarterState?.portfolioNav)} />
          <MetricCard label="Gross IRR" value={formatPct(workspace.quarterState?.grossIrr)} />
          <MetricCard label="Net IRR" value={formatPct(workspace.quarterState?.netIrr)} />
          <MetricCard label="TVPI" value={formatMultiple(workspace.quarterState?.tvpi)} />
          <MetricCard label="DPI" value={formatMultiple(workspace.quarterState?.dpi)} />
        </div>

        <div className="mt-8 grid gap-6 xl:grid-cols-[1.2fr,0.8fr]">
          <Card className="overflow-hidden border-amber-200/70 bg-white/90">
            <CardContent className="p-0">
              <div className="border-b border-slate-200 bg-slate-950 px-5 py-4 text-white">
                <p className="text-xs uppercase tracking-[0.24em] text-amber-300">Execution Rail</p>
                <h2 className="mt-1 text-xl font-semibold">End-to-End Flow</h2>
              </div>
              <div className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-3">
                {workflowStatus.map((step) => (
                  <div
                    key={step.label}
                    className={`rounded-2xl border p-4 ${
                      step.ready
                        ? "border-emerald-200 bg-emerald-50/80"
                        : "border-amber-200 bg-amber-50/70"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold">{step.label}</p>
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                          step.ready
                            ? "bg-emerald-600 text-white"
                            : "bg-amber-500 text-white"
                        }`}
                      >
                        {step.ready ? "Ready" : "Pending"}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-slate-600">{step.helper}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-200 bg-white/90">
            <CardContent className="space-y-4">
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Workflow Actions</p>
                <h2 className="mt-1 text-xl font-semibold">Drive The Meridian Lane</h2>
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                <label className="space-y-1 text-sm">
                  <span className="text-slate-600">Rent growth</span>
                  <input
                    value={assumptions.rentGrowthPct}
                    onChange={(event) =>
                      setAssumptions((current) => ({
                        ...current,
                        rentGrowthPct: event.target.value,
                      }))
                    }
                    className="w-full rounded-xl border border-slate-200 px-3 py-2"
                  />
                </label>
                <label className="space-y-1 text-sm">
                  <span className="text-slate-600">Expense ratio</span>
                  <input
                    value={assumptions.expenseRatio}
                    onChange={(event) =>
                      setAssumptions((current) => ({
                        ...current,
                        expenseRatio: event.target.value,
                      }))
                    }
                    className="w-full rounded-xl border border-slate-200 px-3 py-2"
                  />
                </label>
                <label className="space-y-1 text-sm">
                  <span className="text-slate-600">Exit cap</span>
                  <input
                    value={assumptions.exitCapRate}
                    onChange={(event) =>
                      setAssumptions((current) => ({
                        ...current,
                        exitCapRate: event.target.value,
                      }))
                    }
                    className="w-full rounded-xl border border-slate-200 px-3 py-2"
                  />
                </label>
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                <ActionButton label="1. Run Underwriting" onClick={handleRunModel} disabled={!selectedModel || isPending} />
                <ActionButton label="2. Create Scenario" onClick={handleCreateScenario} disabled={!selectedModel || isPending} />
                <ActionButton label="3. Run Waterfall" onClick={handleRunWaterfall} disabled={isPending} />
                <ActionButton label="4. Generate IC Memo" onClick={handleGenerateMemo} disabled={isPending} />
              </div>
              <p className="min-h-6 text-sm text-slate-600">
                {isPending ? "Running workflow action..." : status}
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="mt-8 grid gap-6 xl:grid-cols-2">
          <SectionCard title="Deal Sourcing + Pipeline" eyebrow="Pipeline">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="text-left text-slate-500">
                  <tr>
                    <th className="pb-2">Deal</th>
                    <th className="pb-2">Status</th>
                    <th className="pb-2">Price</th>
                    <th className="pb-2">Target IRR</th>
                  </tr>
                </thead>
                <tbody>
                  {workspace.pipelineDeals.slice(0, 6).map((deal) => (
                    <tr key={deal.dealId} className="border-t border-slate-100">
                      <td className="py-2 font-medium">{deal.dealName}</td>
                      <td className="py-2">{deal.status}</td>
                      <td className="py-2">{formatMoney(deal.headlinePrice)}</td>
                      <td className="py-2">{formatPct((deal.targetIrr ?? 0) / 100)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionCard>

          <SectionCard title="Document Intelligence" eyebrow="Documents">
            <div className="space-y-3">
              {workspace.documents.slice(0, 5).map((document) => (
                <div
                  key={document.docId}
                  className="rounded-2xl border border-slate-100 bg-slate-50/80 p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-medium">{document.fileName}</p>
                      <p className="text-sm text-slate-600">
                        {document.assetName} · {document.location || document.market || "Unknown market"}
                      </p>
                    </div>
                    <span className="rounded-full bg-slate-900 px-3 py-1 text-xs font-medium text-white">
                      {document.extractionStatus}
                    </span>
                  </div>
                  <div className="mt-3 grid gap-2 text-sm text-slate-700 md:grid-cols-2">
                    <p>Type: {document.classification}</p>
                    <p>Year built: {document.yearBuilt ?? "N/A"}</p>
                    <p>
                      Unit count: {String(document.extractedFields.unit_count ?? "N/A")}
                    </p>
                    <p>
                      Rent range: {String(document.extractedFields.rent_range ?? "N/A")}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>

          <SectionCard title="Underwriting Engine" eyebrow="Models">
            <div className="space-y-4">
              {workspace.models.slice(0, 3).map((model) => (
                <div key={model.modelId} className="rounded-2xl border border-slate-100 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-medium">{model.name}</p>
                      <p className="text-sm text-slate-600">
                        {model.modelType || "model"} · {model.strategyType || "strategy"}
                      </p>
                    </div>
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                      {model.latestRunStatus || model.status || "draft"}
                    </span>
                  </div>
                  <div className="mt-4 grid gap-3 md:grid-cols-3">
                    {model.latestRunResults.slice(0, 3).map((metric) => (
                      <div key={`${model.modelId}-${metric.metric}`} className="rounded-xl bg-slate-50 px-3 py-2">
                        <p className="text-xs uppercase tracking-[0.16em] text-slate-500">{metric.metric}</p>
                        <p className="mt-1 text-lg font-semibold">{formatMoney(metric.modelValue)}</p>
                        <p className="text-xs text-slate-600">vs base {formatMoney(metric.baseValue)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>

          <SectionCard title="Scenario Modeling" eyebrow="Scenarios">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="text-left text-slate-500">
                  <tr>
                    <th className="pb-2">Scenario</th>
                    <th className="pb-2">Quarter</th>
                    <th className="pb-2">Gross IRR</th>
                    <th className="pb-2">NAV</th>
                    <th className="pb-2">Waterfall</th>
                  </tr>
                </thead>
                <tbody>
                  {workspace.scenarios.slice(0, 8).map((scenario) => (
                    <tr key={scenario.scenarioId} className="border-t border-slate-100">
                      <td className="py-2 font-medium">{scenario.name}</td>
                      <td className="py-2">{scenario.quarter || "N/A"}</td>
                      <td className="py-2">{formatPct(scenario.grossIrr)}</td>
                      <td className="py-2">{formatMoney(scenario.portfolioNav)}</td>
                      <td className="py-2">{scenario.waterfallRunId ? "Attached" : "Pending"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionCard>

          <SectionCard title="Waterfall + LP Allocations" eyebrow="Waterfall">
            <div className="space-y-3">
              {workspace.latestWaterfallResults.slice(0, 6).map((result) => (
                <div
                  key={result.resultId}
                  className="flex items-center justify-between rounded-2xl border border-slate-100 px-4 py-3"
                >
                  <div>
                    <p className="font-medium">{result.partnerName || result.partnerId}</p>
                    <p className="text-sm text-slate-600">{result.tierCode}</p>
                  </div>
                  <p className="text-lg font-semibold">{formatMoney(result.amount)}</p>
                </div>
              ))}
            </div>
          </SectionCard>

          <SectionCard title="Entity Graph + Loans" eyebrow="Structure">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl border border-slate-100 bg-slate-50/80 p-4">
                <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Graph</p>
                <p className="mt-2 text-2xl font-semibold">{workspace.entityGraph.nodes.length} nodes</p>
                <p className="text-sm text-slate-600">{workspace.entityGraph.edges.length} linked relationships</p>
              </div>
              <div className="rounded-2xl border border-slate-100 bg-slate-50/80 p-4">
                <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Loans</p>
                <p className="mt-2 text-2xl font-semibold">{workspace.loans.length}</p>
                <p className="text-sm text-slate-600">Debt instruments tied to the selected fund</p>
              </div>
            </div>
            <div className="mt-4 space-y-3">
              {workspace.loans.slice(0, 4).map((loan) => (
                <div key={loan.id} className="rounded-2xl border border-slate-100 px-4 py-3">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="font-medium">{loan.loanName}</p>
                      <p className="text-sm text-slate-600">
                        {loan.rateType || "rate"} · maturity {loan.maturity || "N/A"}
                      </p>
                    </div>
                    <p className="text-lg font-semibold">{formatMoney(loan.upb)}</p>
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>

          <SectionCard title="Post-Close Variance" eyebrow="Actuals">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="text-left text-slate-500">
                  <tr>
                    <th className="pb-2">Asset</th>
                    <th className="pb-2">Line</th>
                    <th className="pb-2">Actual</th>
                    <th className="pb-2">Plan</th>
                    <th className="pb-2">Variance</th>
                  </tr>
                </thead>
                <tbody>
                  {workspace.uwVsActual.slice(0, 8).map((row, index) => (
                    <tr key={`${row.assetName}-${row.lineCode}-${index}`} className="border-t border-slate-100">
                      <td className="py-2 font-medium">{row.assetName}</td>
                      <td className="py-2">{row.lineCode}</td>
                      <td className="py-2">{formatMoney(row.actualAmount)}</td>
                      <td className="py-2">{formatMoney(row.planAmount)}</td>
                      <td className="py-2">{formatMoney(row.varianceAmount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionCard>

          <SectionCard title="IC Memo" eyebrow="Reporting">
            {workspace.latestIcMemo ? (
              <div className="space-y-4">
                <div>
                  <p className="text-lg font-semibold">{workspace.latestIcMemo.title}</p>
                  <p className="text-sm text-slate-600">
                    {workspace.latestIcMemo.status} · updated {workspace.latestIcMemo.updatedAt || "recently"}
                  </p>
                </div>
                <pre className="overflow-x-auto whitespace-pre-wrap rounded-2xl bg-slate-950 p-4 text-sm text-slate-50">
                  {workspace.latestIcMemo.markdown}
                </pre>
              </div>
            ) : (
              <p className="text-sm text-slate-600">
                No IC memo draft has been generated yet. Use the action panel above to create one from the
                current model/scenario state.
              </p>
            )}
          </SectionCard>
        </div>
      </div>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <Card className="border-white/80 bg-white/85 backdrop-blur">
      <CardContent>
        <p className="text-xs uppercase tracking-[0.18em] text-slate-500">{label}</p>
        <p className="mt-2 text-3xl font-semibold tracking-tight">{value}</p>
      </CardContent>
    </Card>
  );
}

function SectionCard({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="border-white/80 bg-white/90 backdrop-blur">
      <CardContent>
        <p className="text-xs uppercase tracking-[0.2em] text-slate-500">{eyebrow}</p>
        <h2 className="mt-1 text-xl font-semibold">{title}</h2>
        <div className="mt-4">{children}</div>
      </CardContent>
    </Card>
  );
}

function ActionButton({
  label,
  onClick,
  disabled,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-xl bg-slate-950 px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
    >
      {label}
    </button>
  );
}
