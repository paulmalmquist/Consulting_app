"use client";

import type { CloudConfig, Overview } from "@/lib/historyrhymes/mlDemo";
import { CloudProviderBadge } from "./CloudProviderBadge";
import { StatTile, fmt } from "./mlUi";

export function AlgorithmLabHero({
  overview,
  cloudConfig,
}: {
  overview: Overview;
  cloudConfig: CloudConfig | null;
}) {
  const h = overview.hero_metrics;
  return (
    <header className="mb-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-50">{overview.title}</h1>
          <p className="text-sm text-neutral-400 mt-1">{overview.subtitle}</p>
        </div>
        <CloudProviderBadge config={cloudConfig} />
      </div>

      <p className="text-xs text-neutral-400 mt-3 max-w-3xl border-l-2 border-neutral-700 pl-3">
        {overview.lesson}
      </p>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2 mt-4">
        <StatTile label="Observations" value={h.n_rows} />
        <StatTile label="Features" value={h.n_features} />
        <StatTile label="Algorithms" value={`${h.algorithms_available}/${h.algorithms_total}`} />
        <StatTile
          label="Best regression"
          value={h.best_regression.name ?? "—"}
          sub={h.best_regression.headline ? `${h.best_regression.headline.label} ${fmt(h.best_regression.headline.value)}` : undefined}
        />
        <StatTile
          label="Best classifier"
          value={h.best_classification.name ?? "—"}
          sub={h.best_classification.headline ? `${h.best_classification.headline.label} ${fmt(h.best_classification.headline.value)}` : undefined}
        />
        <StatTile label="Data freshness" value="Deterministic" sub="synthetic, seed 42" />
      </div>

      <p className="text-[10px] text-neutral-600 mt-2">
        Synthetic, deterministic demo data. No production-performance claims — metrics show fit for a target/constraint, not a leaderboard.
      </p>
    </header>
  );
}
