import { Suspense } from "react";
import { PageHeader } from "@/components/supply-chain/primitives";
import NotebooksPanel from "@/components/supply-chain/NotebooksPanel";

interface Props {
  params: Promise<{ envId: string }>;
}

export default async function NotebooksPage({ params }: Props) {
  const { envId } = await params;

  return (
    <>
      <PageHeader
        eyebrow="Architecture Proof Pack"
        title="Databricks notebooks"
        blurb="8 runnable notebooks covering the full medallion build — bronze ingestion through semantic views and AI NL→SQL. Inspect every assumption without opening a workspace."
      />

      {/* Start Here */}
      <div className="mb-8 rounded-xl border border-bm-accent/30 bg-bm-accent/5 p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.15em] text-bm-accent mb-2">
          Start here
        </p>
        <p className="text-sm text-bm-muted leading-relaxed mb-4">
          Same architecture used in production engagements at JLL and in REPE portfolio
          analytics: fragmented source systems → governed data products → analytics and AI layer.
          The OTIF metric below traces from a raw SAP shipment event to a natural-language query
          in six steps.
        </p>

        {/* OTIF lineage diagram */}
        <div className="rounded-lg bg-[--bm-surface-2] border border-[--bm-border] p-4 font-mono text-xs text-bm-muted leading-relaxed overflow-x-auto">
          <div className="text-bm-muted2 text-[10px] uppercase tracking-wide mb-2">
            OTIF lineage chain
          </div>
          <div className="space-y-1">
            <div>
              <span className="text-amber-500">bronze</span>.raw_purchase_orders ──┐
            </div>
            <div>
              <span className="text-amber-500">bronze</span>.raw_shipments{"        "}──┤──▶{" "}
              <span className="text-sky-400">silver</span>.fact_shipment_event ──▶{" "}
              <span className="text-yellow-400">gold</span>.supplier_otif_scorecard ──▶{" "}
              <span className="text-emerald-400">semantic</span>.otif_scorecard
            </div>
            <div>
              <span className="text-amber-500">bronze</span>.raw_sales_orders{"    "}──┘
            </div>
            <div className="mt-2 text-bm-muted2 text-[10px]">
              DLT expectations: valid_po_date (warn) · positive_qty (drop) · unique_po_number (warn)
            </div>
          </div>
        </div>

        {/* Suggested path */}
        <div className="mt-4 flex flex-wrap gap-2 items-center text-xs text-bm-muted">
          <span className="text-bm-muted2 uppercase tracking-wide text-[10px] font-semibold">
            Suggested order
          </span>
          {[
            ["00_setup.py", "bg-slate-500"],
            ["02_silver_transform.py", "bg-sky-600"],
            ["03_gold_kpis.py", "bg-yellow-500"],
            ["04_semantic_views.sql", "bg-emerald-600"],
            ["06_ai_layer.py", "bg-violet-600"],
          ].map(([file, color]) => (
            <span
              key={file}
              className={`rounded px-2 py-0.5 text-white font-mono text-[11px] ${color}`}
            >
              {file}
            </span>
          ))}
        </div>

        {/* Why this matters */}
        <div className="mt-4 rounded-lg border border-[--bm-border] bg-[--bm-surface] px-4 py-3">
          <p className="text-xs font-semibold text-bm-text mb-1">Why this matters</p>
          <p className="text-xs text-bm-muted leading-relaxed">
            The OTIF metric is queryable in natural language via the AI layer in under 3 seconds —
            no ETL, no prompt engineering, no custom BI training. The semantic views carry
            metric definitions as{" "}
            <code className="font-mono bg-[--bm-surface-2] px-1 rounded">COMMENT ON VIEW</code>,
            which is what makes that accuracy possible at scale.
          </p>
        </div>
      </div>

      {/* Notebook explorer */}
      <Suspense fallback={<div className="text-sm text-bm-muted">Loading notebooks…</div>}>
        <NotebooksPanel envId={envId} />
      </Suspense>
    </>
  );
}
