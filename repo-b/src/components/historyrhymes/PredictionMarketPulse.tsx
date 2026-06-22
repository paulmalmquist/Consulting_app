"use client";

import React from "react";
import type {
  PolymarketPulseItem,
  PolymarketPulseResponse,
  PredictionMarketStatus,
} from "@/lib/historyrhymes/client";

const STATUS_STYLE: Record<PredictionMarketStatus, string> = {
  LIVE: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
  STALE: "border-red-500/40 bg-red-500/10 text-red-300",
  THIN: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  AMBIGUOUS: "border-orange-500/40 bg-orange-500/10 text-orange-300",
  RESEARCH: "border-sky-500/40 bg-sky-500/10 text-sky-300",
  UNSUPPORTED: "border-neutral-600 bg-neutral-800 text-neutral-300",
};

interface Props {
  pulse: PolymarketPulseResponse | null;
}

export function PredictionMarketPulse({ pulse }: Props) {
  const items = pulse?.items ?? [];

  return (
    <section
      aria-label="Prediction Market Pulse"
      className="mb-6 rounded-lg border border-neutral-800 bg-neutral-950/60 p-4"
      data-testid="prediction-market-pulse"
    >
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-200">
            Prediction Market Pulse
          </h2>
          <p className="mt-1 text-xs text-neutral-500">
            Public market-implied probabilities are a crowd signal, not ground truth.
          </p>
        </div>
        <span className="font-mono text-[10px] uppercase tracking-wider text-neutral-500">
          {pulse?.as_of ? `as of ${formatTimestamp(pulse.as_of)}` : "not available"}
        </span>
      </div>

      {items.length === 0 ? (
        <div
          className="rounded-md border border-dashed border-neutral-700 px-4 py-5 text-sm text-neutral-400"
          data-testid="prediction-market-empty"
        >
          Not available
          {pulse?.null_reason ? (
            <span className="ml-2 font-mono text-xs text-neutral-600">
              {humanize(pulse.null_reason)}
            </span>
          ) : null}
        </div>
      ) : (
        <div className="flex snap-x gap-3 overflow-x-auto pb-2">
          {items.map((item) => (
            <PredictionMarketCard key={item.market_id} item={item} />
          ))}
        </div>
      )}
    </section>
  );
}

function PredictionMarketCard({ item }: { item: PolymarketPulseItem }) {
  const status = item.status || deriveStatus(item);
  const change =
    item.probability_change_1h ?? item.probability_change_24h ?? item.probability_change_5m;

  return (
    <article
      className="min-w-[280px] max-w-[320px] snap-start rounded-md border border-neutral-800 bg-neutral-900 p-4"
      data-testid="prediction-market-card"
      data-status={status}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <span
          className={`rounded border px-2 py-0.5 text-[10px] font-semibold tracking-wider ${STATUS_STYLE[status]}`}
        >
          {status}
        </span>
        <span className="font-mono text-[10px] text-neutral-600">
          {formatTimestamp(item.as_of)}
        </span>
      </div>

      <h3 className="min-h-12 text-sm font-medium leading-5 text-neutral-100">
        {item.question}
      </h3>

      <dl className="mt-4 grid grid-cols-3 gap-2">
        <Metric label="Market" value={formatProbability(item.yes_probability)} />
        <Metric label="HR" value={formatProbability(item.p_hr)} />
        <Metric
          label="Divergence"
          value={formatSignedPoints(item.signed_divergence)}
          tone={divergenceTone(item.signed_divergence)}
        />
      </dl>

      <div className="mt-4 grid grid-cols-2 gap-3 border-t border-neutral-800 pt-3 text-xs">
        <div>
          <div className="uppercase tracking-wider text-neutral-600">Change</div>
          <div className="mt-1 font-mono text-neutral-300">
            {formatSignedPoints(change)}
          </div>
        </div>
        <div>
          <div className="uppercase tracking-wider text-neutral-600">Liquidity</div>
          <div className="mt-1 font-mono text-neutral-300">
            {formatConfidence(item.liquidity_confidence)}
          </div>
        </div>
      </div>

      <div className="mt-3 text-[10px] text-neutral-600">
        Basis: {item.price_basis ? humanize(item.price_basis) : "not available"}
        {item.forecast_null_reason ? (
          <span className="block mt-1">HR: {humanize(item.forecast_null_reason)}</span>
        ) : null}
      </div>
    </article>
  );
}

function Metric({
  label,
  value,
  tone = "text-neutral-100",
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wider text-neutral-600">{label}</dt>
      <dd className={`mt-1 font-mono text-base font-semibold ${tone}`}>{value}</dd>
    </div>
  );
}

function deriveStatus(item: PolymarketPulseItem): PredictionMarketStatus {
  if (item.connection_stale) return "STALE";
  if (item.ambiguity_flag || item.forecast_status === "ambiguous") return "AMBIGUOUS";
  if (item.thin_liquidity_flag) return "THIN";
  if (item.forecast_status === "unsupported") return "UNSUPPORTED";
  if (["research", "withheld", "uncalibrated"].includes(item.forecast_status ?? "")) {
    return "RESEARCH";
  }
  return "LIVE";
}

function formatProbability(value: number | null): string {
  return value === null || value === undefined ? "N/A" : `${(value * 100).toFixed(0)}%`;
}

function formatSignedPoints(value: number | null): string {
  if (value === null || value === undefined) return "N/A";
  const points = value * 100;
  return `${points >= 0 ? "+" : ""}${points.toFixed(1)} pts`;
}

function formatConfidence(value: number | null): string {
  return value === null || value === undefined ? "N/A" : `${(value * 100).toFixed(0)}%`;
}

function formatTimestamp(value: string | null): string {
  if (!value) return "no timestamp";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) return value;
  return parsed.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function divergenceTone(value: number | null): string {
  if (value === null || value === undefined) return "text-neutral-500";
  if (value > 0.1) return "text-amber-300";
  if (value < -0.1) return "text-sky-300";
  return "text-neutral-100";
}

function humanize(value: string): string {
  return value.replaceAll("_", " ");
}
