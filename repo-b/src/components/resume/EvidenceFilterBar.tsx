"use client";

import type { CSSProperties } from "react";
import {
  DOMAIN_LABELS,
  ROLE_TARGET_LABELS,
  STATUS_LABELS,
  type Domain,
  type EvidenceStatus,
  type RoleTarget,
} from "./evidenceGraphData";

export type FilterState = {
  roles: Set<RoleTarget>;
  statuses: Set<EvidenceStatus>;
  domains: Set<Domain>;
};

function chipStyle(active: boolean): CSSProperties {
  return active
    ? {
        background: "rgba(212,152,64,0.10)",
        borderColor: "var(--ros-accent-gold)",
        color: "var(--ros-text-bright)",
      }
    : {
        background: "transparent",
        borderColor: "var(--ros-border)",
        color: "var(--ros-text-muted)",
      };
}

function Chip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded border px-2.5 py-[5px] text-[10px] font-semibold tracking-[0.14em] uppercase transition-colors leading-none"
      style={chipStyle(active)}
    >
      {label}
    </button>
  );
}

function FilterRow<T extends string>({
  eyebrow,
  options,
  labelOf,
  selected,
  onToggle,
  onClear,
}: {
  eyebrow: string;
  options: T[];
  labelOf: (v: T) => string;
  selected: Set<T>;
  onToggle: (v: T) => void;
  onClear: () => void;
}) {
  return (
    <div className="space-y-2">
      <p
        className="text-[10px] font-semibold tracking-[0.18em] uppercase"
        style={{ color: "var(--ros-text-dim)" }}
      >
        {eyebrow}
      </p>
      <div className="flex flex-wrap gap-1.5">
        <Chip label="All" active={selected.size === 0} onClick={onClear} />
        {options.map((opt) => (
          <Chip
            key={opt}
            label={labelOf(opt)}
            active={selected.has(opt)}
            onClick={() => onToggle(opt)}
          />
        ))}
      </div>
    </div>
  );
}

const ALL_ROLES = Object.keys(ROLE_TARGET_LABELS) as RoleTarget[];
const ALL_STATUSES = Object.keys(STATUS_LABELS) as EvidenceStatus[];
const ALL_DOMAINS = Object.keys(DOMAIN_LABELS) as Domain[];

export function EvidenceFilterBar({
  filters,
  onChange,
}: {
  filters: FilterState;
  onChange: (next: FilterState) => void;
}) {
  function toggle<T>(set: Set<T>, value: T): Set<T> {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    return next;
  }

  return (
    <div className="space-y-5">
      <FilterRow
        eyebrow="Role target"
        options={ALL_ROLES}
        labelOf={(r) => ROLE_TARGET_LABELS[r]}
        selected={filters.roles}
        onToggle={(v) => onChange({ ...filters, roles: toggle(filters.roles, v) })}
        onClear={() => onChange({ ...filters, roles: new Set() })}
      />
      <FilterRow
        eyebrow="Evidence status"
        options={ALL_STATUSES}
        labelOf={(s) => STATUS_LABELS[s]}
        selected={filters.statuses}
        onToggle={(v) => onChange({ ...filters, statuses: toggle(filters.statuses, v) })}
        onClear={() => onChange({ ...filters, statuses: new Set() })}
      />
      <FilterRow
        eyebrow="Domain"
        options={ALL_DOMAINS}
        labelOf={(d) => DOMAIN_LABELS[d]}
        selected={filters.domains}
        onToggle={(v) => onChange({ ...filters, domains: toggle(filters.domains, v) })}
        onClear={() => onChange({ ...filters, domains: new Set() })}
      />
    </div>
  );
}
