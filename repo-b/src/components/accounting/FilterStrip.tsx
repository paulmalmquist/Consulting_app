"use client";

export type FilterStripProps = {
  query: string;
  onQueryChange: (value: string) => void;
  unresolvedOnly: boolean;
  onToggleUnresolved: () => void;
};

const PILL_OPTIONS = ["30 days", "90 days", "all entities", "all status"];

export default function FilterStrip({
  query,
  onQueryChange,
  unresolvedOnly,
  onToggleUnresolved,
}: FilterStripProps) {
  return (
    <div
      className="flex h-[42px] flex-none items-center justify-between border-b border-slate-800 bg-slate-950 px-4"
      data-testid="accounting-filter-strip"
    >
      <div className="flex items-center gap-2">
        <span className="font-mono text-[10px] uppercase tracking-widest text-slate-500">Filters</span>
        {PILL_OPTIONS.map((label) => (
          <span
            key={label}
            className="rounded-full border border-slate-700 bg-slate-900 px-2 py-0.5 text-[11px] text-slate-300"
          >
            {label}
          </span>
        ))}
        <button
          type="button"
          onClick={onToggleUnresolved}
          className={`rounded-full px-2 py-0.5 text-[11px] transition ${
            unresolvedOnly
              ? "border border-amber-400 bg-amber-400/10 text-amber-200"
              : "border border-slate-700 bg-slate-900 text-slate-400 hover:text-slate-200"
          }`}
          data-testid="unresolved-toggle"
        >
          Unresolved only
        </button>
      </div>

      <label className="flex w-72 items-center gap-2 rounded-md border border-slate-700 bg-slate-900 px-2 py-1">
        <span className="font-mono text-xs text-cyan-400">{">"}</span>
        <input
          type="search"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Command search"
          className="w-full bg-transparent font-mono text-xs text-slate-100 placeholder-slate-500 outline-none"
          data-testid="command-search-input"
        />
        <span className="rounded border border-slate-700 bg-slate-800 px-1 font-mono text-[10px] text-slate-400">
          ⌘K
        </span>
      </label>
    </div>
  );
}
