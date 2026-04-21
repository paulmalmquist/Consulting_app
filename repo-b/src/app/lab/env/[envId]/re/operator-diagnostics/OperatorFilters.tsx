"use client";

import type { ReV2OperatorDiagnostics } from "@/lib/bos-api";

interface SelectedFilters {
  acuity?: string;
  region?: string;
  operator?: string;
  fundId?: string;
}

interface Props {
  data: ReV2OperatorDiagnostics | null;
  selected: SelectedFilters;
  onChange: (key: "acuity" | "region" | "operator" | "fundId", value: string | null) => void;
}

export function OperatorFilters({ data, selected, onChange }: Props) {
  const acuities = unique(data?.assets.map((a) => a.acuity_type));
  const regions = unique(data?.assets.map((a) => a.market));
  const operators = unique(data?.operators.map((o) => o.operator_name));

  return (
    <div
      data-testid="operator-filters"
      className="flex flex-wrap items-center gap-2 border-b border-bm-border/40 pb-3"
    >
      <FilterGroup
        label="Acuity"
        options={acuities}
        selected={selected.acuity ?? null}
        onChange={(v) => onChange("acuity", v)}
      />
      <FilterGroup
        label="Region"
        options={regions}
        selected={selected.region ?? null}
        onChange={(v) => onChange("region", v)}
      />
      <FilterGroup
        label="Operator"
        options={operators}
        selected={selected.operator ?? null}
        onChange={(v) => onChange("operator", v)}
      />
    </div>
  );
}

function FilterGroup({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: string[];
  selected: string | null;
  onChange: (v: string | null) => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] uppercase tracking-widest text-bm-foreground-muted">
        {label}
      </span>
      <button
        type="button"
        onClick={() => onChange(null)}
        className={`rounded px-2 py-0.5 text-xs ${
          selected === null
            ? "bg-bm-accent/20 text-bm-accent"
            : "text-bm-foreground-muted hover:text-bm-foreground"
        }`}
      >
        All
      </button>
      {options.map((opt) => (
        <button
          key={opt}
          type="button"
          onClick={() => onChange(opt === selected ? null : opt)}
          className={`rounded border px-2 py-0.5 text-xs ${
            selected === opt
              ? "border-bm-accent bg-bm-accent/10 text-bm-accent"
              : "border-bm-border/40 text-bm-foreground-muted hover:border-bm-border hover:text-bm-foreground"
          }`}
        >
          {opt}
        </button>
      ))}
    </div>
  );
}

function unique(values: Array<string | null | undefined> | undefined): string[] {
  if (!values) return [];
  const set = new Set<string>();
  for (const v of values) {
    if (typeof v === "string" && v.length > 0) set.add(v);
  }
  return Array.from(set).sort();
}
