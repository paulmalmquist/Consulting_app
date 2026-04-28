// Notebook metadata registry.
// Code is NOT stored here — fetched on demand from /supply-chain-notebooks/{filename}.
// This file stays small and import-safe.

export type NotebookLayer =
  | "Setup"
  | "Bronze"
  | "Silver"
  | "Gold"
  | "Semantic"
  | "Quality"
  | "AI"
  | "Dashboard";

export interface NotebookHighlight {
  label: string;
  lineStart: number; // 1-indexed
  lineEnd: number;
}

export interface Notebook {
  id: string;
  filename: string;
  title: string;
  layer: NotebookLayer;
  layerColor: string; // Tailwind bg-* token for the layer badge
  description: string;
  pageMapping: string[]; // supply-chain page slugs that reference this notebook
  highlights: NotebookHighlight[];
}

export const NOTEBOOKS: Notebook[] = [
  {
    id: "00_setup",
    filename: "00_setup.py",
    title: "Environment Setup & Data Seeding",
    layer: "Setup",
    layerColor: "bg-slate-500",
    description:
      "Creates catalog and schemas, seeds 10K POs, 20K shipments, and 90 days of inventory snapshots with deliberate dirtiness.",
    pageMapping: ["architecture"],
    highlights: [
      { label: "Catalog bootstrap", lineStart: 32, lineEnd: 53 },
      { label: "PO dirtiness", lineStart: 119, lineEnd: 148 },
      { label: "Write bronze", lineStart: 189, lineEnd: 200 },
    ],
  },
  {
    id: "01_bronze_ingest",
    filename: "01_bronze_ingest.py",
    title: "Bronze Ingestion Patterns",
    layer: "Bronze",
    layerColor: "bg-amber-600",
    description:
      "Documents JDBC batch, Auto Loader, REST polling, and Kafka streaming patterns. Demonstrates CDC append with 50 delta PO rows.",
    pageMapping: ["source-systems"],
    highlights: [
      { label: "JDBC batch (SAP ECC)", lineStart: 36, lineEnd: 55 },
      { label: "Auto Loader (WMS)", lineStart: 57, lineEnd: 76 },
      { label: "CDC append demo", lineStart: 117, lineEnd: 160 },
    ],
  },
  {
    id: "02_silver_transform",
    filename: "02_silver_transform.py",
    title: "Silver Transformation",
    layer: "Silver",
    layerColor: "bg-sky-600",
    description:
      "DLT-style expectations with plain-Spark fallback. Deduplicates by po_number, quarantines negative qty and null dates, enriches shipments with supplier join.",
    pageMapping: ["medallion"],
    highlights: [
      { label: "DLT expectations (optional)", lineStart: 56, lineEnd: 69 },
      { label: "Positive qty guard", lineStart: 72, lineEnd: 78 },
      { label: "OTIF flag computed", lineStart: 126, lineEnd: 136 },
    ],
  },
  {
    id: "03_gold_kpis",
    filename: "03_gold_kpis.py",
    title: "Gold KPI Computation",
    layer: "Gold",
    layerColor: "bg-yellow-500",
    description:
      "Computes OTIF, Fill Rate, Days of Supply, Supplier Scorecard, and Inventory Turns. Grain: supplier × month for OTIF; SKU × month for fill rate.",
    pageMapping: ["medallion", "data-products"],
    highlights: [
      { label: "OTIF definition", lineStart: 48, lineEnd: 72 },
      { label: "Fill Rate", lineStart: 89, lineEnd: 112 },
      { label: "Scorecard composite", lineStart: 158, lineEnd: 185 },
    ],
  },
  {
    id: "04_semantic_views",
    filename: "04_semantic_views.sql",
    title: "Semantic Layer Views",
    layer: "Semantic",
    layerColor: "bg-emerald-600",
    description:
      "Five views with COMMENT ON VIEW on every metric. Single source of truth for Genie, BI tools, APIs, and the AI NL→SQL layer.",
    pageMapping: ["data-products"],
    highlights: [
      { label: "OTIF view + comment", lineStart: 28, lineEnd: 54 },
      { label: "Fill rate status tiers", lineStart: 56, lineEnd: 83 },
      { label: "Supplier scorecard formula", lineStart: 112, lineEnd: 135 },
    ],
  },
  {
    id: "05_data_quality",
    filename: "05_data_quality.py",
    title: "Data Quality Framework",
    layer: "Quality",
    layerColor: "bg-rose-600",
    description:
      "Completeness, validity, and duplicate checks. Results written to quality_results Delta table. Failed rows routed to *_quarantine tables.",
    pageMapping: ["governance"],
    highlights: [
      { label: "Result schema", lineStart: 36, lineEnd: 56 },
      { label: "Null rate check", lineStart: 88, lineEnd: 101 },
      { label: "Duplicate check", lineStart: 134, lineEnd: 147 },
    ],
  },
  {
    id: "06_ai_layer",
    filename: "06_ai_layer.py",
    title: "AI NL→SQL Layer",
    layer: "AI",
    layerColor: "bg-violet-600",
    description:
      "Foundation Model API (Llama 3.1 70B) with deterministic fallback router. Guardrails block DDL, restrict table refs to semantic schema, validate before execution.",
    pageMapping: ["ai-sdlc", "genie"],
    highlights: [
      { label: "Guardrail validator", lineStart: 66, lineEnd: 98 },
      { label: "Fallback router patterns", lineStart: 100, lineEnd: 145 },
      { label: "Foundation Model call", lineStart: 173, lineEnd: 205 },
    ],
  },
  {
    id: "07_dashboard",
    filename: "07_dashboard.sql",
    title: "Dashboard Queries",
    layer: "Dashboard",
    layerColor: "bg-cyan-600",
    description:
      "5 NL→SQL worked examples plus 5 production-ready dashboard panel queries. All against supply_chain_demo.semantic.*",
    pageMapping: ["genie"],
    highlights: [
      { label: "NL→SQL: OTIF below 85%", lineStart: 10, lineEnd: 22 },
      { label: "NL→SQL: stockout risk top 10", lineStart: 31, lineEnd: 45 },
      { label: "MoM OTIF improvement (LAG)", lineStart: 76, lineEnd: 90 },
    ],
  },
];

export const getNotebookById = (id: string): Notebook | undefined =>
  NOTEBOOKS.find((n) => n.id === id);

export const getNotebooksForPage = (slug: string): Notebook[] =>
  NOTEBOOKS.filter((n) => n.pageMapping.includes(slug));
