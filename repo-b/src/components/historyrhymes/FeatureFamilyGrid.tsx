"use client";

import type { FeatureOverview } from "@/lib/historyrhymes/featureStore";

function label(family: string): string {
  return family.replace(/_/g, " ");
}

/** 20 feature-family cards; clicking one filters the feature list (null = all). */
export function FeatureFamilyGrid({
  overview,
  selected,
  onSelect,
}: {
  overview: FeatureOverview;
  selected: string | null;
  onSelect: (family: string | null) => void;
}) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
      <button
        type="button"
        onClick={() => onSelect(null)}
        className={`text-left rounded-md border p-2 transition-colors ${
          selected === null
            ? "border-sky-500/60 bg-sky-500/10"
            : "border-neutral-800 bg-neutral-900 hover:border-neutral-600"
        }`}
      >
        <div className="text-xs font-medium text-neutral-100">All families</div>
        <div className="text-[10px] text-neutral-500">{overview.feature_count} features</div>
      </button>
      {overview.families.map((f) => (
        <button
          key={f.family}
          type="button"
          data-testid="hr-feature-family-card"
          onClick={() => onSelect(f.family)}
          className={`text-left rounded-md border p-2 transition-colors ${
            selected === f.family
              ? "border-sky-500/60 bg-sky-500/10"
              : "border-neutral-800 bg-neutral-900 hover:border-neutral-600"
          }`}
        >
          <div className="text-xs font-medium text-neutral-100 capitalize">{label(f.family)}</div>
          <div className="text-[10px] text-neutral-500">{f.feature_count} feature{f.feature_count === 1 ? "" : "s"}</div>
        </button>
      ))}
    </div>
  );
}
