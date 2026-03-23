"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import WinstonInstitutionalShell from "@/components/winston/WinstonInstitutionalShell";
import {
  applyWinstonScenario,
  askWinston,
  buildScenarioPrompt,
  buildStructuredQueryPlan,
  MERIDIAN_DEMO_ASSETS,
  MERIDIAN_DEMO_BASE_SCENARIO_ID,
  MERIDIAN_DEMO_FUND_ID,
  runStructuredQuery,
  seedMeridianDemo,
  type ScenarioApplyResult,
  type StructuredQueryPlan,
  type StructuredQueryResult,
  type WinstonAssistantAnswer,
} from "@/lib/winston-demo";

type AssistantMode = "ask" | "query" | "scenario";

const CHECKLIST = [
  "Ask Winston: What is NOI?",
  "Ask Winston: Show NOI by asset Q1 2026",
  "Ask Winston: Apply downside cap rate +75bps",
  "Propose NOI definition change",
  "Show downstream impact detection",
  "Approve change",
  "Show audit log entry",
];

function fmtMoney(value: number) {
  const sign = value < 0 ? "-" : "";
  return `${sign}$${Math.abs(value).toLocaleString()}`;
}

function fmtPct(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

export default function WinstonDemoPage({ params }: { params: { envId: string } }) {
  const envId = params.envId;
  const [mode, setMode] = useState<AssistantMode>("ask");
  const [input, setInput] = useState("What is NOI?");
  const [loading, setLoading] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [askResult, setAskResult] = useState<WinstonAssistantAnswer | null>(null);
  const [queryPlan, setQueryPlan] = useState<StructuredQueryPlan | null>(null);
  const [queryResult, setQueryResult] = useState<StructuredQueryResult | null>(null);
  const [scenarioPlan, setScenarioPlan] = useState<ReturnType<typeof buildScenarioPrompt> | null>(null);
  const [scenarioResult, setScenarioResult] = useState<ScenarioApplyResult | null>(null);

  const kpis = useMemo(
    () => [
      { label: "Total NOI", value: fmtMoney(5820000) },
      { label: "Portfolio NAV", value: fmtMoney(132700000) },
      { label: "TVPI", value: "1.31x" },
      { label: "Net IRR", value: fmtPct(0.118) },
    ],
    []
  );

  const runAssistant = async () => {
    setLoading(true);
    setError(null);
    try {
      if (mode === "ask") {
        const result = await askWinston(envId, {
          question: input,
          verified_only: true,
          limit: 5,
        });
        setAskResult(result);
        setQueryPlan(null);
        setQueryResult(null);
        setScenarioPlan(null);
        setScenarioResult(null);
        return;
      }

      if (mode === "query") {
        setQueryPlan(buildStructuredQueryPlan(input));
        setQueryResult(null);
        setAskResult(null);
        setScenarioPlan(null);
        setScenarioResult(null);
        return;
      }

      setScenarioPlan(buildScenarioPrompt(input));
      setScenarioResult(null);
      setAskResult(null);
      setQueryPlan(null);
      setQueryResult(null);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "The assistant request failed.");
    } finally {
      setLoading(false);
    }
  };

  const runQuery = async () => {
    if (!queryPlan) return;
    setLoading(true);
    setError(null);
    try {
      const result = await runStructuredQuery(queryPlan, envId);
      setQueryResult(result);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Query execution failed.");
    } finally {
      setLoading(false);
    }
  };

  const applyScenario = async () => {
    if (!scenarioPlan) return;
    setLoading(true);
    setError(null);
    try {
      const result = await applyWinstonScenario(envId, {
        fund_id: MERIDIAN_DEMO_FUND_ID,
        base_scenario_id: MERIDIAN_DEMO_BASE_SCENARIO_ID,
        change_type: scenarioPlan.change_type,
        lever_patch: scenarioPlan.lever_patch,
        quarter: "2026Q1",
      });
      setScenarioResult(result);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Scenario application failed.");
    } finally {
      setLoading(false);
    }
  };

  const reseed = async () => {
    setSeeding(true);
    setError(null);
    try {
      await seedMeridianDemo(envId);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Seeding failed.");
    } finally {
      setSeeding(false);
    }
  };

  const openAudit = () => {
    window.dispatchEvent(new Event("winston-open-audit"));
  };

  return (
    <WinstonInstitutionalShell envId={envId} active="demo">
      <div className="grid gap-4 xl:grid-cols-[280px,minmax(0,1fr),300px]">
        <section className="rounded-lg border border-bm-border/70 bg-bm-surface/30 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-bm-text">Live Demo Checklist</p>
              <p className="text-xs text-bm-muted">Use this sequence for the institutional governance walkthrough.</p>
            </div>
            <button
              type="button"
              className="rounded-md border border-bm-border/70 px-3 py-2 text-xs text-bm-text"
              onClick={openAudit}
            >
              Open Audit Log
            </button>
          </div>
          <div className="mt-4 space-y-2">
            {CHECKLIST.map((item) => (
              <div key={item} className="rounded-md border border-bm-border/60 bg-bm-surface/20 px-3 py-2 text-sm text-bm-text">
                {item}
              </div>
            ))}
          </div>
          <button
            type="button"
            className="mt-4 w-full rounded-md border border-bm-accent/40 bg-bm-accent/10 px-3 py-2 text-sm font-medium text-bm-text"
            onClick={reseed}
            disabled={seeding}
          >
            {seeding ? "Refreshing Seed..." : "Seed / Refresh Demo Data"}
          </button>
        </section>

        <section className="rounded-lg border border-bm-border/70 bg-bm-surface/30 p-4">
          <div className="flex flex-wrap items-center gap-2">
            {(["ask", "query", "scenario"] as AssistantMode[]).map((nextMode) => (
              <button
                key={nextMode}
                type="button"
                className={cnMode(mode === nextMode)}
                onClick={() => {
                  setMode(nextMode);
                  if (nextMode === "ask") setInput("What is NOI?");
                  if (nextMode === "query") setInput("Show NOI by asset Q1 2026");
                  if (nextMode === "scenario") setInput("Apply downside cap rate +75bps");
                }}
              >
                {nextMode === "ask" ? "Ask" : nextMode === "query" ? "Query" : "Scenario"}
              </button>
            ))}
          </div>

          <div className="mt-4">
            <label className="block text-xs font-medium uppercase tracking-[0.14em] text-bm-muted">
              Winston Prompt
            </label>
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              rows={3}
              className="mt-2 w-full rounded-md border border-bm-border/70 bg-bm-surface/20 px-3 py-2 text-sm text-bm-text outline-none"
              placeholder="Ask for a governed answer, a structured query, or a scenario change."
            />
            <button
              type="button"
              className="mt-3 rounded-md border border-bm-accent/40 bg-bm-accent/10 px-4 py-2 text-sm font-medium text-bm-text"
              onClick={runAssistant}
              disabled={loading}
            >
              {loading ? "Working..." : mode === "ask" ? "Ask Winston" : mode === "query" ? "Generate Query Plan" : "Generate Scenario Plan"}
            </button>
          </div>

          {error ? <p className="mt-3 text-sm text-rose-300">{error}</p> : null}

          {askResult ? (
            <div className="mt-5 rounded-lg border border-bm-border/60 bg-bm-surface/20 p-4">
              <p className="text-sm font-semibold text-bm-text">Answer</p>
              <p className="mt-2 text-sm leading-6 text-bm-text">{askResult.answer}</p>
              <div className="mt-4 space-y-2">
                {askResult.citations.map((citation) => (
                  <Link
                    key={citation.chunk_id}
                    href={citation.anchor_href}
                    className="block rounded-md border border-bm-border/60 px-3 py-2 text-sm text-bm-text hover:bg-bm-surface/40"
                  >
                    <span className="font-medium">{citation.title}</span>
                    <span className="ml-2 text-xs text-bm-muted">{citation.doc_type}</span>
                    <p className="mt-1 text-xs text-bm-muted">{citation.snippet}</p>
                  </Link>
                ))}
              </div>
              <p className="mt-3 text-xs text-bm-muted">Audit Trace ID: {askResult.audit_trace_id}</p>
            </div>
          ) : null}

          {queryPlan ? (
            <div className="mt-5 rounded-lg border border-bm-border/60 bg-bm-surface/20 p-4">
              <p className="text-sm font-semibold text-bm-text">Query Plan</p>
              <p className="mt-1 text-sm text-bm-muted">{queryPlan.title}</p>
              <pre className="mt-3 overflow-x-auto whitespace-pre-wrap break-words text-xs text-bm-muted">
                {JSON.stringify(queryPlan, null, 2)}
              </pre>
              <button
                type="button"
                className="mt-3 rounded-md border border-bm-accent/40 bg-bm-accent/10 px-4 py-2 text-sm font-medium text-bm-text"
                onClick={runQuery}
                disabled={loading}
              >
                Run Query
              </button>
            </div>
          ) : null}

          {queryResult ? (
            <div className="mt-4 rounded-lg border border-bm-border/60 bg-bm-surface/20 p-4">
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="text-left text-bm-muted">
                      {queryResult.columns.map((column) => (
                        <th key={column} className="px-2 py-1.5 font-medium">
                          {column}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {queryResult.rows.map((row, index) => (
                      <tr key={index} className="border-t border-bm-border/40 text-bm-text">
                        {queryResult.columns.map((column) => (
                          <td key={column} className="px-2 py-1.5">
                            {String(row[column] ?? "—")}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-3 text-xs text-bm-muted">Audit Trace ID: {queryResult.metadata.audit_trace_id}</p>
            </div>
          ) : null}

          {scenarioPlan ? (
            <div className="mt-5 rounded-lg border border-bm-border/60 bg-bm-surface/20 p-4">
              <p className="text-sm font-semibold text-bm-text">Scenario Plan</p>
              <p className="mt-1 text-sm text-bm-muted">{scenarioPlan.title}</p>
              <pre className="mt-3 overflow-x-auto whitespace-pre-wrap break-words text-xs text-bm-muted">
                {JSON.stringify(scenarioPlan, null, 2)}
              </pre>
              <button
                type="button"
                className="mt-3 rounded-md border border-bm-accent/40 bg-bm-accent/10 px-4 py-2 text-sm font-medium text-bm-text"
                onClick={applyScenario}
                disabled={loading}
              >
                Apply Scenario
              </button>
            </div>
          ) : null}

          {scenarioResult ? (
            <div className="mt-4 rounded-lg border border-bm-border/60 bg-bm-surface/20 p-4">
              <p className="text-sm font-semibold text-bm-text">Scenario Delta vs Base</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <MetricCard label="Asset Value Delta" value={fmtMoney(scenarioResult.delta.asset_value)} />
                <MetricCard label="Fund NAV Delta" value={fmtMoney(scenarioResult.delta.fund_nav)} />
                <MetricCard label="TVPI Delta" value={scenarioResult.delta.tvpi.toFixed(2)} />
                <MetricCard label="IRR Delta" value={`${(scenarioResult.delta.irr * 100).toFixed(1)} pts`} />
              </div>
              <p className="mt-3 text-xs text-bm-muted">Audit Trace ID: {scenarioResult.audit_trace_id}</p>
            </div>
          ) : null}
        </section>

        <section className="space-y-4">
          <div className="rounded-lg border border-bm-border/70 bg-bm-surface/30 p-4">
            <p className="text-sm font-semibold text-bm-text">Q1 2026 Portfolio KPIs</p>
            <div className="mt-4 grid gap-3">
              {kpis.map((kpi) => (
                <MetricCard key={kpi.label} label={kpi.label} value={kpi.value} />
              ))}
            </div>
          </div>
          <div className="rounded-lg border border-bm-border/70 bg-bm-surface/30 p-4">
            <p className="text-sm font-semibold text-bm-text">NOI By Asset</p>
            <div className="mt-3 space-y-2">
              {MERIDIAN_DEMO_ASSETS.map((asset) => (
                <div key={asset.asset_id} className="rounded-md border border-bm-border/60 px-3 py-2">
                  <p className="text-sm font-medium text-bm-text">{asset.name}</p>
                  <p className="text-xs text-bm-muted">
                    {fmtMoney(asset.noi)} NOI · {asset.dscr.toFixed(2)}x DSCR
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>

      <div className="grid gap-3 md:grid-cols-5">
        <ShortcutLink href={`/lab/env/${envId}/documents`} label="Open Documents Hub" />
        <ShortcutLink href={`/lab/env/${envId}/definitions`} label="Open Definitions" />
        <ShortcutLink href={`/lab/env/${envId}/re`} label="Open Asset Valuation" />
        <button
          type="button"
          className="rounded-lg border border-bm-border/70 bg-bm-surface/30 px-4 py-3 text-sm text-bm-text"
          onClick={() => {
            setMode("scenario");
            setInput("Apply downside cap rate +75bps");
            setScenarioPlan(buildScenarioPrompt("Apply downside cap rate +75bps"));
          }}
        >
          Open Scenario Center
        </button>
        <button
          type="button"
          className="rounded-lg border border-bm-border/70 bg-bm-surface/30 px-4 py-3 text-sm text-bm-text"
          onClick={openAudit}
        >
          Open Audit Log
        </button>
      </div>
    </WinstonInstitutionalShell>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-bm-border/60 bg-bm-surface/20 p-3">
      <p className="text-xs uppercase tracking-[0.14em] text-bm-muted">{label}</p>
      <p className="mt-1 text-lg font-semibold text-bm-text">{value}</p>
    </div>
  );
}

function ShortcutLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="rounded-lg border border-bm-border/70 bg-bm-surface/30 px-4 py-3 text-center text-sm text-bm-text transition-colors hover:bg-bm-surface/50"
    >
      {label}
    </Link>
  );
}

function cnMode(active: boolean) {
  return active
    ? "rounded-md border border-bm-accent/40 bg-bm-accent/10 px-3 py-2 text-sm font-medium text-bm-text"
    : "rounded-md border border-bm-border/70 px-3 py-2 text-sm text-bm-muted";
}
