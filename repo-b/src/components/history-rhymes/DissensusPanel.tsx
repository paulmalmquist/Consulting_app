"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { getChartColors, getTooltipStyle } from "@/components/charts/chart-theme";
import {
  fetchDissensusCurrent,
  fetchDissensusEvents,
  fetchDissensusHistory,
  type DissensusCurrent,
  type DissensusCurrentResult,
  type DissensusEventsResult,
  type DissensusHistoryPoint,
  type DissensusHistoryResult,
  type RegimeEvent,
} from "@/lib/trading-lab/dissensus-client";

export type DissensusPanelProps = {
  symbol: string;
  horizon: string;
};

type Row1Props = { data: DissensusCurrent; history: DissensusHistoryPoint[] | null };

// ── Helpers ──────────────────────────────────────────────────────────────────

function regimeClasses(flag: string): string {
  switch (flag) {
    case "elevated":
      return "bg-bm-warning-bg text-bm-warning border-bm-warning-border";
    case "high":
      return "bg-bm-warning-bg text-bm-warning border-bm-warning-border font-bold";
    case "extreme":
      return "bg-bm-danger-bg text-bm-danger border-bm-danger-border font-bold";
    case "suspicious_consensus":
      return "bg-bm-purple-bg text-bm-purple border-bm-purple font-bold";
    case "warmup":
      return "bg-bm-surface/40 text-bm-muted italic";
    case "normal":
    default:
      return "bg-bm-surface text-bm-muted border-bm-border";
  }
}

function diversityColor(nEff: number): { text: string; bar: string; label: string } {
  if (nEff < 2.5) return { text: "text-bm-danger", bar: "bg-bm-danger", label: "DANGER" };
  if (nEff < 3.5) return { text: "text-bm-warning", bar: "bg-bm-warning", label: "CAUTION" };
  return { text: "text-bm-success", bar: "bg-bm-success", label: "HEALTHY" };
}

function severityClasses(severity: string): string {
  switch (severity) {
    case "kill":
      return "text-bm-danger";
    case "action":
      return "text-bm-warning";
    case "watch":
    default:
      return "text-bm-warning/80";
  }
}

function isSuspiciousConsensus(data: DissensusCurrent): boolean {
  if (data.regime_flag === "suspicious_consensus") return true;
  // UI-side inference per spec: agents agree (z_D low) but independence is low (n_eff < 3)
  return data.z_D < -1 && data.n_eff < 3;
}

// ── Subcomponents ────────────────────────────────────────────────────────────

function OodBanner() {
  return (
    <div
      data-testid="dissensus-ood-banner"
      className="mb-3 rounded-md border bg-bm-warning-bg border-bm-warning-border px-3 py-2"
    >
      <p className="text-xs font-semibold text-bm-warning">
        ⚠ Current macro environment is outside the historical distribution.
      </p>
      <p className="text-[11px] text-bm-warning/90 mt-0.5">
        Low disagreement here is a WARNING, not confidence.
      </p>
    </div>
  );
}

function SuspiciousConsensusBanner() {
  return (
    <div
      data-testid="dissensus-suspicious-banner"
      className="mb-3 rounded-md border bg-bm-purple-bg border-bm-purple px-3 py-2"
    >
      <p className="text-xs font-semibold text-bm-purple">
        ⚠ Agents agree, but independence is low.
      </p>
      <p className="text-[11px] text-bm-purple/90 mt-0.5">
        Consensus may be mechanically correlated, not real.
      </p>
    </div>
  );
}

function DSparkline({
  history,
  currentTs,
  currentD,
}: {
  history: DissensusHistoryPoint[];
  currentTs: string;
  currentD: number;
}) {
  const colors = getChartColors();
  const data = useMemo(
    () =>
      history.map((p) => ({
        ts: p.period_ts,
        D: p.composite_D,
        regime: p.regime_flag,
      })),
    [history],
  );
  // Regime transitions: where regime flag changes between consecutive points
  const transitions = useMemo(() => {
    const out: string[] = [];
    for (let i = 1; i < data.length; i++) {
      if (data[i].regime !== data[i - 1].regime) out.push(data[i].ts);
    }
    return out;
  }, [data]);

  return (
    <div className="h-16 w-full" data-testid="dissensus-sparkline">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 4, right: 4, left: 4, bottom: 4 }}>
          <Tooltip
            contentStyle={getTooltipStyle()}
            formatter={(v: number) => [v.toFixed(2), "D"]}
            labelFormatter={(l: string) => new Date(l).toLocaleDateString()}
          />
          {transitions.map((ts) => (
            <ReferenceLine
              key={ts}
              x={ts}
              stroke={colors.neutral}
              strokeDasharray="2 2"
              strokeOpacity={0.4}
            />
          ))}
          <Line
            type="monotone"
            dataKey="D"
            stroke={colors.primary}
            strokeWidth={1.25}
            dot={(props) => {
              const { cx, cy, payload } = props as { cx: number; cy: number; payload: { ts: string } };
              if (payload.ts !== currentTs) {
                // recharts requires a valid SVG element; return a transparent circle for non-current
                return <circle key={payload.ts} cx={cx} cy={cy} r={0} />;
              }
              return (
                <circle
                  key={payload.ts}
                  cx={cx}
                  cy={cy}
                  r={3}
                  fill={colors.primary}
                  stroke={colors.primary}
                />
              );
            }}
            activeDot={{ r: 3, fill: colors.primary }}
            isAnimationActive={false}
          />
          {/* Anchor the current point explicitly */}
          <ReferenceLine x={currentTs} stroke={colors.primary} strokeOpacity={0.2} />
        </LineChart>
      </ResponsiveContainer>
      <p className="sr-only">
        Current composite D value {currentD.toFixed(2)}.
      </p>
    </div>
  );
}

function Row1({ data, history }: Row1Props) {
  const dSign = data.composite_D >= 0 ? "+" : "";
  const zSign = data.z_D >= 0 ? "+" : "";
  const pctLabel = `${Math.round(data.pct_D * 100)}th pct`;
  return (
    <Card className="p-4" data-testid="dissensus-row1">
      <div className="grid grid-cols-1 md:grid-cols-[auto_1fr_auto] items-center gap-3">
        <span
          className={`inline-flex items-center rounded-md border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${regimeClasses(data.regime_flag)}`}
          data-testid="dissensus-regime-badge"
        >
          {data.regime_flag.replace(/_/g, " ")}
        </span>
        <div className="flex items-baseline gap-3 md:justify-center">
          <span className="text-3xl font-mono font-bold text-bm-text">
            D = {dSign}
            {data.composite_D.toFixed(2)}
          </span>
          <span className="text-sm font-mono text-bm-muted">
            (z = {zSign}
            {data.z_D.toFixed(1)})
          </span>
        </div>
        <span className="justify-self-end inline-flex items-center rounded-full border border-bm-border bg-bm-surface/40 px-2.5 py-1 text-[10px] font-mono text-bm-muted">
          {pctLabel}
        </span>
      </div>
      <div className="mt-3">
        {history && history.length > 0 ? (
          <DSparkline
            history={history}
            currentTs={data.period_ts}
            currentD={data.composite_D}
          />
        ) : (
          <p className="text-[10px] text-bm-muted2 italic">
            90-day history unavailable
          </p>
        )}
      </div>
    </Card>
  );
}

function DisagreementSources({ data }: { data: DissensusCurrent }) {
  // Proportional contribution: normalize |z_*| values
  const zW1 = Math.abs(data.z_w1);
  const zJsd = Math.abs(data.z_jsd);
  const zDir = Math.abs(data.z_dir);
  const total = Math.max(zW1 + zJsd + zDir, 0.0001);
  const pctW1 = (zW1 / total) * 100;
  const pctJsd = (zJsd / total) * 100;
  const pctDir = (zDir / total) * 100;

  return (
    <Card
      className="p-4 order-3 lg:order-none"
      data-testid="dissensus-sources"
    >
      <p className="text-[10px] font-bold uppercase tracking-wider text-bm-muted2 mb-2">
        Disagreement Sources
      </p>
      <div className="flex h-4 w-full rounded overflow-hidden bg-bm-surface/30">
        <div
          className="h-full bg-bm-accent"
          style={{ width: `${pctW1}%` }}
          title={`W1 raw z = ${data.z_w1.toFixed(2)}`}
          data-testid="dissensus-sources-w1"
        />
        <div
          className="h-full bg-bm-success"
          style={{ width: `${pctJsd}%` }}
          title={`JSD raw z = ${data.z_jsd.toFixed(2)}`}
          data-testid="dissensus-sources-jsd"
        />
        <div
          className="h-full bg-bm-purple"
          style={{ width: `${pctDir}%` }}
          title={`Directional raw z = ${data.z_dir.toFixed(2)}`}
          data-testid="dissensus-sources-dir"
        />
      </div>
      <div className="mt-2 flex justify-between text-[9px] font-mono text-bm-muted">
        <span>W1 {pctW1.toFixed(0)}%</span>
        <span>JSD {pctJsd.toFixed(0)}%</span>
        <span>DIR {pctDir.toFixed(0)}%</span>
      </div>
      <p className="mt-2 text-[10px] text-bm-muted2">
        Source of disagreement: structure vs direction
      </p>
    </Card>
  );
}

function AgentDirectionSplit({ data }: { data: DissensusCurrent }) {
  const bullPct = Math.max(0, Math.min(1, data.frac_bullish)) * 100;
  const bearPct = 100 - bullPct;
  const is5050 = Math.abs(data.frac_bullish - 0.5) < 0.1;
  const agentCounts = (() => {
    const bulls = Math.round(data.frac_bullish * data.n_agents);
    return { bulls, bears: Math.max(0, data.n_agents - bulls) };
  })();

  return (
    <Card
      className={`p-4 order-2 lg:order-none ${is5050 ? "ring-2 ring-bm-warning shadow-[0_0_12px_rgba(251,191,36,0.35)]" : ""}`}
      data-testid="dissensus-direction"
    >
      <p className="text-[10px] font-bold uppercase tracking-wider text-bm-muted2 mb-2">
        Agent Direction Split
      </p>
      <div className="flex h-4 w-full rounded overflow-hidden bg-bm-surface/30">
        <div className="h-full bg-bm-danger" style={{ width: `${bearPct}%` }} />
        <div className="h-full bg-bm-success" style={{ width: `${bullPct}%` }} />
      </div>
      <div className="mt-2 flex justify-between text-[10px] font-mono">
        <span className="text-bm-danger">
          BEAR {bearPct.toFixed(0)}% ({agentCounts.bears})
        </span>
        <span className="text-bm-success">
          BULL {bullPct.toFixed(0)}% ({agentCounts.bulls})
        </span>
      </div>
      <div className="mt-2 flex justify-between text-[10px] text-bm-muted2">
        <span>p̄ bear {data.mean_p_bear.toFixed(2)}</span>
        <span>p̄ bull {data.mean_p_bull.toFixed(2)}</span>
      </div>
      {is5050 && (
        <p
          className="mt-2 text-[10px] font-semibold text-bm-warning"
          data-testid="dissensus-direction-5050"
        >
          MAX UNCERTAINTY · 50/50 split
        </p>
      )}
    </Card>
  );
}

function DiversityPanel({ data }: { data: DissensusCurrent }) {
  const color = diversityColor(data.n_eff);
  const pct = Math.max(0, Math.min(1, data.n_eff / Math.max(data.n_agents, 1))) * 100;
  return (
    <Card
      className="p-4 order-1 lg:order-none border-2"
      data-testid="dissensus-diversity"
    >
      <p className="text-[10px] font-bold uppercase tracking-wider text-bm-muted2 mb-2">
        Diversity
      </p>
      <div className="flex items-baseline gap-2">
        <span
          className={`text-3xl font-mono font-bold ${color.text}`}
          data-testid="dissensus-n-eff"
        >
          {data.n_eff.toFixed(1)}
        </span>
        <span className="text-sm font-mono text-bm-muted">/ {data.n_agents}</span>
      </div>
      <p className="text-[10px] text-bm-muted2">Effective independent agents</p>
      <div className="mt-2 h-1.5 w-full rounded-full bg-bm-surface/30 overflow-hidden">
        <div
          className={`h-full ${color.bar}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="mt-2 flex justify-between text-[10px]">
        <span className={`font-semibold ${color.text}`}>{color.label}</span>
        {typeof data.max_pairwise_rho === "number" && (
          <span className="font-mono text-bm-muted">
            ρ_max {data.max_pairwise_rho.toFixed(2)}
          </span>
        )}
      </div>
    </Card>
  );
}

function RegimeEventsLog({ events }: { events: RegimeEvent[] | null }) {
  if (!events || events.length === 0) {
    return (
      <div
        className="text-[11px] text-bm-muted2 italic"
        data-testid="dissensus-events-empty"
      >
        No recent alerts
      </div>
    );
  }
  return (
    <div className="space-y-1" data-testid="dissensus-events">
      {events.map((e) => {
        const ts = new Date(e.event_ts);
        const tsLabel = isNaN(ts.getTime()) ? e.event_ts : ts.toLocaleString();
        const summary =
          Object.entries(e.triggering_metrics || {})
            .slice(0, 2)
            .map(([k, v]) => `${k}=${typeof v === "number" ? v.toFixed(2) : String(v)}`)
            .join(", ") || "—";
        return (
          <div
            key={`${e.event_ts}-${e.event_type}`}
            className="grid grid-cols-[auto_auto_auto_1fr] items-center gap-2 text-[10px] font-mono"
          >
            <span className="text-bm-muted2">{tsLabel}</span>
            <span className="text-bm-text">{e.event_type}</span>
            <span className={`uppercase ${severityClasses(e.severity)}`}>
              {e.severity}
            </span>
            <span className="text-bm-muted truncate">{summary}</span>
          </div>
        );
      })}
    </div>
  );
}

// ── Skeleton / Warmup / Error ────────────────────────────────────────────────

function Skeleton() {
  return (
    <section
      className="space-y-3"
      data-testid="dissensus-skeleton"
      aria-busy="true"
    >
      <div className="h-16 rounded-md bg-bm-surface/40 animate-pulse" />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className="h-24 rounded-md bg-bm-surface/40 animate-pulse" />
        <div className="h-24 rounded-md bg-bm-surface/40 animate-pulse" />
        <div className="h-24 rounded-md bg-bm-surface/40 animate-pulse" />
      </div>
      <div className="h-10 rounded-md bg-bm-surface/40 animate-pulse" />
    </section>
  );
}

function WarmupCard({ nLogged, nNeeded }: { nLogged: number; nNeeded: number }) {
  return (
    <Card className="p-6 text-center" data-testid="dissensus-warmup">
      <p className="text-xs text-bm-muted2 uppercase tracking-wider">Dissensus</p>
      <p className="mt-2 text-sm text-bm-text">
        Dissensus signal is warming up. {nLogged} forecasts logged, {nNeeded} needed.
      </p>
    </Card>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div
      className="rounded-md border bg-bm-danger-bg border-bm-danger-border px-3 py-2"
      data-testid="dissensus-error"
    >
      <p className="text-xs font-semibold text-bm-danger">Dissensus unavailable</p>
      <p className="text-[11px] text-bm-danger/90 mt-0.5">{message}</p>
    </div>
  );
}

// ── Main panel ───────────────────────────────────────────────────────────────

export function DissensusPanel({ symbol, horizon }: DissensusPanelProps) {
  const [currentResult, setCurrentResult] = useState<DissensusCurrentResult | null>(null);
  const [historyResult, setHistoryResult] = useState<DissensusHistoryResult | null>(null);
  const [eventsResult, setEventsResult] = useState<DissensusEventsResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    setLoading(true);
    setCurrentResult(null);
    setHistoryResult(null);
    setEventsResult(null);

    Promise.all([
      fetchDissensusCurrent({ symbol, horizon }, { signal: controller.signal }),
      fetchDissensusHistory({ symbol, horizon, days: 90 }, { signal: controller.signal }),
      fetchDissensusEvents({ symbol, horizon, limit: 3 }, { signal: controller.signal }),
    ])
      .then(([curr, hist, evts]) => {
        if (cancelled) return;
        setCurrentResult(curr);
        setHistoryResult(hist);
        setEventsResult(evts);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setCurrentResult({ state: "error", message: (err as Error).message || "Network error" });
        setLoading(false);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [symbol, horizon]);

  if (loading || !currentResult) return <Skeleton />;

  // Rendering precedence: `current` controls panel state.
  if (currentResult.state === "warmup") {
    return <WarmupCard nLogged={currentResult.n_logged} nNeeded={currentResult.n_needed} />;
  }
  if (currentResult.state === "error") {
    return <ErrorBanner message={currentResult.message} />;
  }

  const data = currentResult.data;
  const history = historyResult?.state === "ready" ? historyResult.series : null;
  const events = eventsResult?.state === "ready" ? eventsResult.events : null;
  const showSuspicious = isSuspiciousConsensus(data);

  return (
    <section className="space-y-3" data-testid="dissensus-panel">
      {data.ood_flag && <OodBanner />}
      {showSuspicious && <SuspiciousConsensusBanner />}
      <Row1 data={data} history={history} />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <DisagreementSources data={data} />
        <AgentDirectionSplit data={data} />
        <DiversityPanel data={data} />
      </div>
      <Card className="p-3" data-testid="dissensus-events-card">
        <div className="flex items-center justify-between mb-2">
          <p className="text-[10px] font-bold uppercase tracking-wider text-bm-muted2">
            Regime Events
          </p>
          <Badge variant="accent">LAST 3</Badge>
        </div>
        <RegimeEventsLog events={events} />
      </Card>
    </section>
  );
}

export default DissensusPanel;
