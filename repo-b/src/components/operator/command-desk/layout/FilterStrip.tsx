"use client";
import { forwardRef } from "react";
import type { Ref } from "react";
import { Caps } from "../atoms/Caps";
import { Field } from "../atoms/Field";
import { FilterPill } from "../atoms/FilterPill";

export type FilterPillDef = {
  key: string;
  label: string;
  value: string;
  active?: boolean;
  onClick?: () => void;
};

type FilterStripProps = {
  pills: FilterPillDef[];
  unresolvedOnly: boolean;
  onToggleUnresolved: () => void;
  query: string;
  onQuery: (v: string) => void;
  onAddFilter?: () => void;
  queryInputRef?: Ref<HTMLInputElement>;
};

export const FilterStrip = forwardRef<HTMLDivElement, FilterStripProps>(function FilterStrip(
  { pills, unresolvedOnly, onToggleUnresolved, query, onQuery, onAddFilter, queryInputRef },
  ref,
) {
  return (
    <div
      ref={ref}
      style={{
        height: 42,
        padding: "8px 16px",
        background: "var(--bg-base)",
        borderBottom: "1px solid var(--line-2)",
        display: "flex",
        alignItems: "center",
        gap: 8,
      }}
    >
      <Caps>FILTERS</Caps>
      {pills.map((p) => (
        <FilterPill
          key={p.key}
          label={p.label}
          value={p.value}
          active={p.active}
          onClick={p.onClick}
        />
      ))}
      <div
        onClick={onToggleUnresolved}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          letterSpacing: ".08em",
          textTransform: "uppercase",
          padding: "0 10px",
          height: 26,
          borderRadius: 3,
          border: `1px solid ${unresolvedOnly ? "var(--neon-amber)" : "var(--line-2)"}`,
          background: unresolvedOnly ? "rgba(255,176,32,.08)" : "var(--bg-inset)",
          color: unresolvedOnly ? "var(--neon-amber)" : "var(--fg-2)",
          cursor: "pointer",
        }}
      >
        <span
          style={{
            width: 10,
            height: 10,
            borderRadius: 2,
            border: `1px solid ${unresolvedOnly ? "var(--neon-amber)" : "var(--line-3)"}`,
            background: unresolvedOnly ? "var(--neon-amber)" : "transparent",
          }}
        />
        UNRESOLVED ONLY
      </div>
      {onAddFilter && (
        <div
          onClick={onAddFilter}
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            letterSpacing: ".08em",
            textTransform: "uppercase",
            padding: "0 10px",
            height: 26,
            borderRadius: 3,
            border: "1px dashed var(--line-3)",
            color: "var(--fg-3)",
            display: "inline-flex",
            alignItems: "center",
            cursor: "pointer",
          }}
        >
          + ADD FILTER
        </div>
      )}
      <div style={{ flex: 1 }} />
      <div style={{ width: 280 }}>
        <Field
          ref={queryInputRef}
          value={query}
          onChange={onQuery}
          placeholder="Search…"
          prefix=">"
          suffix="⌘K"
        />
      </div>
    </div>
  );
});
