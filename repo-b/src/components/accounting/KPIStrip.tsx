"use client";

export type KPIValues = {
  unreviewed: number;
  appleSpend: number;
  ambiguous: number;
  uncategorized: number;
  duplicates: number;
  total: number;
};

export type KPIStripProps = {
  kpis: KPIValues;
  activeFilter: string | null;
  onToggleFilter: (id: string) => void;
};

type Tile = {
  id: string;
  label: string;
  value: string;
  source: string;
  accent: string;
};

function fmt(n: number): string {
  return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function usd(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

export default function KPIStrip({ kpis, activeFilter, onToggleFilter }: KPIStripProps) {
  const tiles: Tile[] = [
    {
      id: "unreviewed",
      label: "Unreviewed receipts",
      value: fmt(kpis.unreviewed),
      source: "confidence < 80%",
      accent: "border-cyan-400/60 text-cyan-300",
    },
    {
      id: "apple",
      label: "Apple-billed · MTD",
      value: usd(kpis.appleSpend),
      source: "platform = Apple",
      accent: "border-amber-400/60 text-amber-200",
    },
    {
      id: "ambiguous",
      label: "Apple-ambiguous",
      value: fmt(kpis.ambiguous),
      source: "underlying vendor ?",
      accent: "border-rose-400/60 text-rose-300",
    },
    {
      id: "uncategorized",
      label: "Uncategorized",
      value: fmt(kpis.uncategorized),
      source: "needs category",
      accent: "border-violet-400/60 text-violet-300",
    },
    {
      id: "duplicates",
      label: "Duplicates caught",
      value: fmt(kpis.duplicates),
      source: "dedupe by hash",
      accent: "border-emerald-400/60 text-emerald-300",
    },
    {
      id: "total",
      label: "Total intake",
      value: fmt(kpis.total),
      source: "all receipts",
      accent: "border-slate-500/60 text-slate-200",
    },
  ];

  return (
    <div
      className="grid flex-none grid-cols-2 gap-2 border-b border-slate-800 bg-slate-950 px-3 py-2 md:grid-cols-3 lg:grid-cols-6"
      data-testid="accounting-kpi-strip"
    >
      {tiles.map((tile) => {
        const active = activeFilter === tile.id;
        return (
          <button
            key={tile.id}
            type="button"
            onClick={() => onToggleFilter(tile.id)}
            className={`group rounded-md border bg-slate-900 p-2 text-left transition ${
              active ? tile.accent : "border-slate-700 text-slate-300 hover:border-slate-500"
            }`}
            data-testid={`kpi-tile-${tile.id}`}
            aria-pressed={active}
          >
            <div className="font-mono text-[9px] uppercase tracking-widest text-slate-400">
              {tile.label}
            </div>
            <div className="mt-1 font-mono text-[22px] leading-none tabular-nums text-slate-50">
              {tile.value}
            </div>
            <div className="mt-1 text-[10px] uppercase tracking-widest text-slate-500">
              {active ? "● filtered" : tile.source}
            </div>
          </button>
        );
      })}
    </div>
  );
}
