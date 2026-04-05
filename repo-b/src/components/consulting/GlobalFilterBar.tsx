"use client";

import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useCallback } from "react";

const STATUS_OPTIONS = ["NeedsAttention", "ReadyToAct", "Waiting", "OnTrack"] as const;
const ACTIVITY_WINDOWS = [
  { label: "Any", value: "" },
  { label: "< 24h", value: "1" },
  { label: "< 7d", value: "7" },
  { label: "< 14d", value: "14" },
  { label: "> 14d stale", value: "15" },
] as const;

export default function GlobalFilterBar({
  industries,
  stages,
}: {
  industries: string[];
  stages: { key: string; label: string }[];
}) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const setFilter = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [searchParams, router, pathname],
  );

  const current = (key: string) => searchParams.get(key) || "";

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-bm-border/40 px-3 py-2">
      <span className="text-[10px] uppercase tracking-[0.14em] text-bm-muted2 font-semibold mr-1">
        Filters
      </span>

      <select
        value={current("industry")}
        onChange={(e) => setFilter("industry", e.target.value)}
        className="rounded border border-bm-border/50 bg-transparent px-2 py-1 text-xs text-bm-text"
      >
        <option value="">All Industries</option>
        {industries.map((i) => (
          <option key={i} value={i}>{i}</option>
        ))}
      </select>

      <select
        value={current("stage_key")}
        onChange={(e) => setFilter("stage_key", e.target.value)}
        className="rounded border border-bm-border/50 bg-transparent px-2 py-1 text-xs text-bm-text"
      >
        <option value="">All Stages</option>
        {stages.map((s) => (
          <option key={s.key} value={s.key}>{s.label}</option>
        ))}
      </select>

      <select
        value={current("computed_status")}
        onChange={(e) => setFilter("computed_status", e.target.value)}
        className="rounded border border-bm-border/50 bg-transparent px-2 py-1 text-xs text-bm-text"
      >
        <option value="">All Statuses</option>
        {STATUS_OPTIONS.map((s) => (
          <option key={s} value={s}>{s}</option>
        ))}
      </select>

      <select
        value={current("last_activity_days")}
        onChange={(e) => setFilter("last_activity_days", e.target.value)}
        className="rounded border border-bm-border/50 bg-transparent px-2 py-1 text-xs text-bm-text"
      >
        {ACTIVITY_WINDOWS.map((w) => (
          <option key={w.value} value={w.value}>{w.label}</option>
        ))}
      </select>

      {searchParams.toString() ? (
        <button
          type="button"
          onClick={() => router.replace(pathname, { scroll: false })}
          className="rounded border border-bm-border/50 px-2 py-1 text-[10px] text-bm-muted2 hover:text-bm-text"
        >
          Clear
        </button>
      ) : null}
    </div>
  );
}
