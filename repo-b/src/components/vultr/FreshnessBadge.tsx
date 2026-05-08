/**
 * Per-source freshness indicator. Reads a `SourceFreshness` from the API
 * envelope and renders a small dot + label. Stale and unavailable states are
 * loud on purpose — the surface should not look "fine" when data is missing.
 */
import { CircleDot } from "lucide-react";
import type { SourceFreshness } from "@/lib/vultr-contracts";

const STYLES: Record<SourceFreshness, { dot: string; text: string; label: string }> = {
  fresh: {
    dot: "text-emerald-400",
    text: "text-emerald-200",
    label: "fresh",
  },
  stale: {
    dot: "text-amber-400",
    text: "text-amber-200",
    label: "stale",
  },
  unavailable: {
    dot: "text-rose-400",
    text: "text-rose-200",
    label: "unavailable",
  },
};

export function FreshnessBadge({
  source,
  status,
}: {
  source: string;
  status: SourceFreshness;
}) {
  const s = STYLES[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border border-bm-divider/40 bg-bm-bg-1/60 px-2.5 py-0.5 text-[10px] uppercase tracking-[0.14em] ${s.text}`}
      aria-label={`${source} ${s.label}`}
    >
      <CircleDot className={`h-2.5 w-2.5 ${s.dot}`} aria-hidden />
      <span className="font-medium">{source}</span>
      <span className="opacity-70">·</span>
      <span>{s.label}</span>
    </span>
  );
}

export function FreshnessRow({
  freshness,
}: {
  freshness: {
    usage: SourceFreshness;
    billing: SourceFreshness;
    netsuite: SourceFreshness;
    salesforce: SourceFreshness;
    support: SourceFreshness;
  };
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <FreshnessBadge source="usage" status={freshness.usage} />
      <FreshnessBadge source="billing" status={freshness.billing} />
      <FreshnessBadge source="netsuite" status={freshness.netsuite} />
      <FreshnessBadge source="salesforce" status={freshness.salesforce} />
      <FreshnessBadge source="support" status={freshness.support} />
    </div>
  );
}
