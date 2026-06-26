"use client";

// Shared chrome for the Relativity MES Sandbox dashboards: the above-the-fold SYNTHETIC banner, the
// serving-source strip (honest source-kind + provenance), and the drill-to-source drawer that reads
// real rel_* source rows from the backend. All five consoles compose these so the sandbox reads as
// one honest data product.

import { useState } from "react";
import type { ReactNode } from "react";
import { C, Tag } from "../primitives";
import { DrawerWrapper, DrawerHeader, FieldRow } from "../drawerPrimitives";
import { SourceRowsTable } from "../drill";
import type { SourceKind } from "../drill";
import {
  getSourceRows, servingLabel, useRel, type ServingMeta, type SourceRowsResp,
} from "@/lib/telemetry/relativityMes";

export const REL_ACCENT = "#ff9e64";

// The unmistakable "this is synthetic" banner, rendered above the fold on every sandbox dashboard.
export function SyntheticBanner() {
  return (
    <div style={{ border: `1px solid ${REL_ACCENT}55`, background: `${REL_ACCENT}12`, borderRadius: 9,
      padding: "10px 14px", marginBottom: 16, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
      <Tag color={REL_ACCENT}>synthetic sandbox</Tag>
      <span style={{ fontFamily: C.mono, fontSize: 11, color: C.dim, lineHeight: 1.5 }}>
        Shaped like a Manufacturo MES + a generic ERP/PLM facsimile. Not real Relativity data, not a
        real schema, not a real API. Every row is synthetic; every number traces to a serving source row.
      </span>
    </div>
  );
}

// Honest serving-source strip: source-kind + Databricks/bootstrap provenance + as-of.
export function ServingStrip({ meta, note }: { meta: ServingMeta; note?: ReactNode }) {
  const tone = meta.source_kind === "live-rows" ? C.green : C.amber;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
      fontFamily: C.mono, fontSize: 10.5, color: C.faint, marginBottom: 12 }}>
      <Tag color={tone}>{meta.source_kind}</Tag>
      <span>{servingLabel(meta)}</span>
      {meta.as_of && <span>· as of {meta.as_of}</span>}
      {note && <span>· {note}</span>}
    </div>
  );
}

export type DrillTarget = {
  table: string;
  filterKey?: string;
  filterValue?: string;
  title: ReactNode;
  description?: ReactNode;
  fields?: { label: string; value: unknown }[];
} | null;

// Drill-to-source drawer: fetches the real rel_* source rows for the clicked value and renders them
// with the shared SourceRowsTable (honest kind + CSV export of the same filter context).
export function RelSourceDrill({ target, onClose }: { target: DrillTarget; onClose: () => void }) {
  const { data, loading, error } = useRel<SourceRowsResp>(
    () => target
      ? getSourceRows(target.table, target.filterKey, target.filterValue)
      : Promise.resolve(null as unknown as SourceRowsResp),
    [target?.table, target?.filterKey, target?.filterValue],
  );
  if (!target) return null;
  const kind: SourceKind = error ? "unavailable" : (data?.source_kind ?? "unavailable");
  return (
    <DrawerWrapper open={Boolean(target)} onClose={onClose}>
      <DrawerHeader title={target.title} description={target.description ?? `Source rows from ${target.table}`} />
      {target.fields && target.fields.length > 0 && (
        <div style={{ marginTop: 14 }}>
          {target.fields.map((f) => <FieldRow key={f.label} label={f.label} value={f.value} />)}
        </div>
      )}
      <div style={{ marginTop: 16 }}>
        {loading ? (
          <span style={{ fontFamily: C.mono, fontSize: 12, color: C.dim }}>Loading source rows…</span>
        ) : (
          <SourceRowsTable
            kind={kind}
            columns={data?.columns ?? []}
            rows={data?.rows ?? []}
            rowCount={data?.row_count}
            asOf={data?.as_of}
            sourceLabel={target.table}
            exportName={`${target.table}${target.filterValue ? `_${target.filterValue}` : ""}`}
            nullReason={error ?? data?.null_reason ?? null}
          />
        )}
      </div>
    </DrawerWrapper>
  );
}

// Tiny helper so consoles can manage one drill target with a setter.
export function useDrill() {
  return useState<DrillTarget>(null);
}
