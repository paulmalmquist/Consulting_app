// Static, typed source of truth for the telemetry "How This Works" system-architecture map.
// Pure data — no React, no palette import — so it is trivially unit-testable and the honesty
// invariants (telemetryArchitectureData.test.ts) can assert against it directly.
//
// Ported from the standalone "Winston Telemetry Architecture" diagram (an interactive SVG node
// graph): four tabbed views over eight pipeline lanes, each node carrying a plain-English story,
// a status (independent of layer), a serving-tech tag, and — where a real telemetry surface
// exists — an env-scoped deep-link slug. Status colors resolve against palette C in the component.
//
// Honesty model: a node's `status` is its truth class, NOT a completeness boast.
//   live       — real source AND live processing
//   synth      — real processing on a synthetic source ("real over synthetic")
//   evidence   — committed snapshot / evidence artifact (not a live query)
//   optional   — optional integration; degrades / fails closed when unavailable
//   planned    — planned or not implemented (no live surface, no slug)
//   limitation — a node whose path is incomplete/unverified (the `warn` flag); carries a note
// A node may only carry a `slug` if it has a real live surface — planned/limitation nodes never do.

export type ArchStatus = "live" | "synth" | "evidence" | "optional" | "planned";
export type NodeShape = "cloud" | "cylinder" | "rect" | "diamond" | "doc" | "screen";
export type EdgeKind = "norm" | "optional" | "synth" | "warn" | "committed" | "evidence";
export type TechKey =
  | "dbx" | "sb" | "kafka" | "flink" | "api" | "mlf" | "uc" | "oai" | "gem"
  | "hf" | "gh" | "nasa" | "iss";

export interface TechMark {
  code: string;
  name: string;
  /** Brand color kept as a literal — these are brand marks, not theme tokens. */
  color: string;
}

// Serving-tech legend — which system actually runs a node. Ported verbatim from the source.
export const TECH: Record<TechKey, TechMark> = {
  dbx: { code: "DBX", name: "Databricks", color: "#FF3621" },
  sb: { code: "SB", name: "Supabase / Postgres", color: "#3ECF8E" },
  kafka: { code: "KAFKA", name: "Confluent / Kafka", color: "#6E7BF2" },
  flink: { code: "FLINK", name: "Apache Flink", color: "#E6526F" },
  api: { code: "API", name: "FastAPI service", color: "#06B6A8" },
  mlf: { code: "MLF", name: "MLflow", color: "#0194E2" },
  uc: { code: "UC", name: "Unity Catalog", color: "#FF6F42" },
  oai: { code: "OAI", name: "OpenAI", color: "#19C37D" },
  gem: { code: "GEM", name: "Vertex AI / Gemma", color: "#4285F4" },
  hf: { code: "HF", name: "Hugging Face", color: "#FFD21E" },
  gh: { code: "GH", name: "GitHub mirror", color: "#9AA4B2" },
  nasa: { code: "NASA", name: "NASA / JPL", color: "#5B8DEF" },
  iss: { code: "ISS", name: "ISS Lightstreamer", color: "#37C7E6" },
};

// Order the tech legend renders in.
export const TECH_ORDER: TechKey[] = [
  "dbx", "sb", "kafka", "flink", "api", "mlf", "uc", "oai", "gem", "hf", "nasa", "iss",
];

export const STATUS_LABEL: Record<ArchStatus, string> = {
  live: "REAL · LIVE",
  synth: "REAL OVER SYNTHETIC",
  evidence: "COMMITTED / EVIDENCE",
  optional: "OPTIONAL · FAILS CLOSED",
  planned: "PLANNED / NOT IMPLEMENTED",
};

export const STATUS_HINT: Record<ArchStatus, string> = {
  live: "Real source and live processing",
  synth: "Real processing on a synthetic source",
  evidence: "Snapshot or evidence artifact",
  optional: "Optional integration; degrades safely",
  planned: "Planned or not implemented",
};

export const SHAPE_LABEL: Record<NodeShape, string> = {
  cloud: "External source / service",
  cylinder: "Table / topic / store / registry",
  rect: "Service / script / pipeline",
  diamond: "Validation / promotion gate",
  doc: "Committed JSON / evidence",
  screen: "Dashboard / UI",
};

export interface ArchNode {
  id: string;
  /** 1-based column (pipeline stage) for the master view; 0-based grid column for detail views. */
  col: number;
  /** Lane index (master) or grid row (detail). */
  row: number;
  shape: NodeShape;
  status: ArchStatus;
  label: string; // may contain \n for multi-line
  warn: boolean; // a known limitation on this node's path
  yOffset: number; // fine vertical nudge within a lane (master only)
  note: string; // technical caveat (may be "")
  plain: string; // plain-English story — never empty
  tech: TechKey | null;
  width?: number; // explicit node width override
  /** Real telemetry surface for this node, env-scoped via telemetryHref. Must be a TELEMETRY_NAV slug.
   *  Only live/synth/evidence nodes that genuinely render somewhere carry one. */
  slug?: string;
}

export interface ArchEdge {
  from: string;
  to: string;
  label: string;
  kind: EdgeKind;
}

export interface LaneInfo {
  key: string; // A..H
  name: string;
  color: string; // lane accent (literal — matches the source lane palette)
  summary: string;
  tech: TechKey[];
}

export interface BandInfo {
  label: string;
  color: string;
  row0: number;
  row1: number;
}

export interface ViewLayout {
  ox: number;
  oy: number;
  colGap: number;
  rowGap: number;
  nw: number;
}

export interface ArchView {
  id: "master" | "nasa" | "stream" | "factory";
  label: string;
  title: string;
  isMaster: boolean;
  layout: ViewLayout;
  nodes: ArchNode[];
  edges: ArchEdge[];
  bands: BandInfo[];
}

// Pipeline-stage column headers (master view), 1..10.
export const MASTER_COLUMNS: string[] = [
  "Data Sources", "Ingestion / Generation", "Bronze / Raw", "Silver / Conformed",
  "Gold / Features", "ML Training & Eval", "Registry / Promotion", "Operational Serving",
  "APIs & Governance", "User Interfaces",
];

// Eight master lanes (A..H).
export const MASTER_LANES: LaneInfo[] = [
  { key: "A", name: "NASA Batch Telemetry", color: "#00E5A0", tech: ["nasa", "dbx", "mlf", "sb"],
    summary: "Real NASA engine & spacecraft telemetry, trained into anomaly + remaining-life models on Databricks, then published to the live serving database." },
  { key: "B", name: "Operational Telemetry Serving", color: "#00E5A0", tech: ["sb", "api"],
    summary: "The always-on Postgres data of record plus the lightweight FastAPI layer the live app reads from." },
  { key: "C", name: "ISS Live Streaming", color: "#00E5FF", tech: ["iss", "api", "sb"],
    summary: "Real (and recorded) Space-Station telemetry streamed through a medallion pipeline to the Mission Control stream." },
  { key: "D", name: "Stargate Kafka Streaming", color: "#FF2E9A", tech: ["kafka", "flink", "api"],
    summary: "Synthetic 3D-printer telemetry streamed through Kafka & Flink, served live from memory; a durable Kafka→Postgres path is only partly built." },
  { key: "E", name: "RS Factory Digital Thread", color: "#00E5FF", tech: ["dbx"],
    summary: "A deterministic synthetic factory dataset — orders, machines, tests — loaded into Databricks." },
  { key: "F", name: "Factory ML", color: "#00E5FF", tech: ["dbx", "mlf"],
    summary: "Print-quality models trained on Databricks; the dashboard reads exported JSON snapshots, not live queries." },
  { key: "G", name: "NCR Intelligence", color: "#9EFF00", tech: ["dbx", "sb"],
    summary: "Synthetic quality-incident text, clustered and forecast with real ML, mirrored to the serving DB." },
  { key: "H", name: "AI Copilot & Control Tower", color: "#B07CFF", tech: ["oai", "gem", "sb", "api"],
    summary: "LLM copilots and a signed, auditable decision \"control tower\" sitting over the telemetry data." },
];

// ── Master view nodes. Lane index: A=0 … H=7. Column is 1-based pipeline stage. ──
const MASTER_NODES: ArchNode[] = [
  // Lane A — NASA batch telemetry
  n("A_src", 1, 0, "cloud", "live", "NASA C-MAPSS\nSMAP · MSL", -30, "C-MAPSS via GitHub mirror; SMAP/MSL via Hugging Face mirror.", "Real flight-test data from NASA jet engines and spacecraft. Downloaded once from public mirrors.", "nasa"),
  n("A_ims", 1, 0, "cloud", "optional", "IMS bearing\narchive", 34, "Archive provenance verified; vibration extraction is not built.", "A real bearing-wear dataset we have filed and verified — but the vibration analysis on it has not been built yet.", "nasa", { warn: true }),
  n("A_ncm", 2, 0, "cloud", "planned", "N-CMAPSS", -34, "Planned; not downloaded or implemented.", "A newer NASA dataset we plan to use later. Not downloaded yet.", "nasa", { warn: true }),
  n("A_ing", 2, 0, "rect", "live", "Databricks Files API\n→ UC raw volume", 30, "", "Uploads the raw files into Databricks so the pipeline can process them.", "dbx"),
  n("A_bz", 3, 0, "cylinder", "live", "bronze_cmapss · _rul\nbronze_smap_msl · ims", 0, "", "The raw data, landed in Databricks exactly as received.", "dbx"),
  n("A_sv", 4, 0, "cylinder", "live", "silver_*\nconformed", 0, "", "The same data, cleaned and standardized.", "dbx"),
  n("A_gd", 5, 0, "cylinder", "live", "gold features ·\nwindows · fused", 0, "", "Analysis-ready feature tables the models train on.", "dbx"),
  n("A_tr", 6, 0, "rect", "live", "train_anomaly · _rul\nfused_state_vector", 0, "", "Trains the models that flag anomalies and predict how much useful life a part has left.", "dbx"),
  n("A_rg", 7, 0, "cylinder", "live", "MLflow → Unity Catalog\nchampion aliases", 0, "", "Keeps every trained model and tags the best one as the \"champion\".", "mlf"),
  n("A_serve", 8, 0, "cylinder", "live", "Supabase tel_predictions\ntel_model_runs", 0, "Backfilled by 13_backfill_serving.py from champion-scored tables.", "The winning model's predictions, copied into the live database the app reads.", "sb", { slug: "model-performance" }),
  n("A_api", 9, 0, "rect", "live", "Telemetry REST · scoring\nregistry · metadata", 0, "FastAPI — does not import Spark or the full MLflow training stack.", "Lightweight web services that hand predictions to the dashboards.", "api"),
  n("A_ui", 10, 0, "screen", "live", "Mission Summary · Runs\nModel Performance", 0, "", "The screens the team actually looks at: mission summary, run explorer, model performance.", null, { slug: "model-performance" }),

  // Lane B — operational serving
  n("B_db", 8, 1, "cylinder", "live", "Supabase / Postgres\noperational serving", 0, "The operational serving system of record.", "The always-on database of record. Everything the live app shows comes from here.", "sb"),
  n("B_api", 9, 1, "rect", "live", "FastAPI services", 0, "Does not import Spark or the full MLflow training stack.", "The web-service layer. Deliberately lightweight — it never runs the heavy training engine.", "api"),
  n("B_ui", 10, 1, "screen", "live", "Monitoring · Registry\nSystem Health", 0, "", "Operational dashboards: monitoring, model registry, system health.", null, { slug: "monitoring" }),

  // Lane C — ISS live streaming
  n("C_iss", 1, 2, "cloud", "optional", "ISS Lightstreamer\n(live)", -30, "Optional; fails closed when unavailable.", "A live feed of real telemetry from the International Space Station. Nice to have — if it drops, the system keeps working.", "iss"),
  n("C_cap", 1, 2, "cloud", "live", "Recorded ISS\ncapture", 34, "Dependable proof path.", "A saved recording of ISS telemetry — the reliable way to demo the live pipeline.", "iss"),
  n("C_open", 2, 2, "cloud", "optional", "OpenSky ADS-B\nfallback", -34, "", "A backup live feed (aircraft positions) used if the ISS feed is down.", null),
  n("C_ing", 2, 2, "rect", "live", "telemetry_stream_ingest", 30, "", "Takes each incoming reading and stores it.", "api"),
  n("C_bz", 3, 2, "cylinder", "live", "tel_stream_readings\n_bronze", 0, "", "Raw streamed readings, as they arrive.", "sb", { slug: "stream" }),
  n("C_sv", 4, 2, "cylinder", "live", "tel_stream_readings\ntel_stream_minute_agg", 0, "", "Cleaned readings plus per-minute summaries.", "sb", { slug: "monitoring" }),
  n("C_ev", 8, 2, "cylinder", "live", "tel_anomaly_events\ntel_dq_assertions", 0, "", "Flagged anomalies and data-quality checks.", "sb"),
  n("C_api", 9, 2, "rect", "live", "/stream/live\n/stream/health", 0, "", "Endpoints the live-stream dashboards poll.", "api"),
  n("C_ui", 10, 2, "screen", "live", "Mission Control Stream\nSystem Health", 0, "", "The live Mission Control stream and system-health screens.", null, { slug: "stream" }),

  // Lane D — Stargate Kafka streaming
  n("D_gen", 1, 3, "cloud", "synth", "RS Factory\nwaveform sim", -30, "Synthetic source; processing and predicates are real.", "A made-up but realistic 3D-printer telemetry generator. The data is synthetic; the processing on it is real.", null),
  n("D_rep", 1, 3, "cloud", "live", "Recorded replay\ncapture", 34, "Railway-safe fallback proof path.", "A saved recording used when the live Kafka setup is not available.", null),
  n("D_sr", 2, 3, "rect", "optional", "Printer sim → protobuf\nSchema Registry", 0, "Cloud mode requires Confluent.", "Packages each reading and registers its format so consumers can read it.", "kafka"),
  n("D_top", 3, 3, "cylinder", "optional", "stargate.printer\n.telemetry.v1", 0, "", "The Kafka topic carrying the printer live telemetry.", "kafka"),
  n("D_flink", 6, 3, "rect", "synth", "Flink agg5s · anomaly\nDLQ routing", 0, "", "Real-time processing: 5-second averages, anomaly checks, and a dead-letter path for bad records.", "flink"),
  n("D_br", 8, 3, "rect", "synth", "Stargate bridge\nin-memory rings", -32, "Live bridge is in-memory; durable Kafka→Postgres schema is separate.", "Serves the live stream from fast in-memory buffers.", "api", { slug: "stargate" }),
  n("D_dur", 8, 3, "cylinder", "optional", "Durable consumer →\ntel_stream_kafka_rows", 36, "Migration refers to telemetry_stream_consumer.py, which is not present in the repository.", "Meant to save the Kafka stream into Postgres permanently — but the consumer code it references is not in the repo.", "kafka", { warn: true }),
  n("D_api", 9, 3, "rect", "live", "/stargate health · snapshot\ndlq · /stream SSE", 0, "", "Endpoints feeding the Stargate Live dashboard.", "api"),
  n("D_ui", 10, 3, "screen", "live", "Stargate Live", 0, "", "The Stargate Live dashboard.", null, { slug: "stargate" }),

  // Lane E — RS Factory digital thread
  n("E_seed", 1, 4, "cloud", "synth", "RS Factory seed\ng01–g11", 0, "Deterministic synthetic artifacts, not live company data.", "A deterministic synthetic factory dataset — orders, machines, tests. Not real company data.", null),
  n("E_load", 2, 4, "rect", "synth", "load_to_databricks.py", 0, "", "Loads the synthetic factory files into Databricks.", "dbx"),
  n("E_bz", 3, 4, "cylinder", "synth", "bronze_<seed tables>", 0, "", "Raw factory tables, as loaded.", "dbx"),
  n("E_sv", 4, 4, "cylinder", "synth", "silver_layer_features\nprint_aggregates", 0, "", "Cleaned factory feature tables.", "dbx"),
  n("E_gd", 5, 4, "cylinder", "synth", "gold_print_quality_train\nreadiness · heatmap", 0, "", "Analysis-ready tables for the print-quality models.", "dbx"),

  // Lane F — Factory ML
  n("F_tr", 6, 5, "rect", "synth", "04_train_print_quality", 0, "", "Trains the 3D-print quality models.", "dbx"),
  n("F_rg", 7, 5, "cylinder", "synth", "MLflow / Unity Catalog\nrs_print_*", -30, "", "Stores the trained print models.", "mlf"),
  n("F_json", 7, 5, "doc", "evidence", "export_dashboard_json\n→ committed JSON", 42, "Committed JSON exports, not live Databricks queries.", "Exports the results to static JSON files that get committed to the repo.", null),
  n("F_ui", 10, 5, "screen", "synth", "Factory ML Console", 0, "Dashboard reads committed JSON, not a live Databricks query.", "The Factory ML console. It reads those committed JSON files — not a live Databricks query.", null, { warn: true, slug: "factory-ml" }),

  // Lane G — NCR intelligence
  n("G_corp", 1, 6, "cloud", "synth", "Synthetic NCR\ncorpus", 0, "Source text synthetic; clustering and forecasting runs are real.", "Made-up quality-incident write-ups. The text is synthetic; the analysis run on it is real.", null),
  n("G_gd", 5, 6, "cylinder", "synth", "ncr_records · points\nclusters · backlog", 0, "", "The clustered incidents and weekly backlog tables.", "dbx"),
  n("G_ml", 6, 6, "rect", "synth", "ncr_clustering · backlog\nMiniLM·UMAP·HDBSCAN", 0, "", "Real ML that groups similar incidents and forecasts the backlog.", "dbx"),
  n("G_serve", 8, 6, "cylinder", "synth", "mirror → tel_ncr_*", 0, "", "Copies the results into the live database.", "sb"),
  n("G_ui", 10, 6, "screen", "synth", "Factory & NCR\nIntelligence", 0, "", "The Factory & NCR intelligence screens.", null, { slug: "factory" }),

  // Lane H — AI copilot & control tower
  n("H_oai", 1, 7, "cloud", "optional", "OpenAI API", -30, "Deterministic fallback when unavailable.", "OpenAI models, used for the copilot. Falls back to a canned response if unavailable.", "oai"),
  n("H_gem", 1, 7, "cloud", "optional", "Vertex AI / Gemma\nprivate tier", 34, "Probe / warm / teardown lifecycle via tel_ct_gemma_state/job.", "Google private Gemma models, spun up and down on demand.", "gem"),
  n("H_gov", 7, 7, "doc", "evidence", "tel_ct_decision → Ed25519\nSHA-256 → tel_ct_receipt", 0, "Signed, hash-chained governance receipts.", "Every AI decision is signed and hash-chained into a tamper-evident receipt.", "sb", { slug: "governance" }),
  n("H_mcp", 9, 7, "rect", "live", "Telemetry MCP · Copilot\nControl Tower", -30, "", "The tools and copilot services that read telemetry and answer questions in plain language.", "api", { slug: "copilot" }),
  n("H_route", 9, 7, "rect", "optional", "OpenAI / Anthropic / Gemma\nsensitivity router", 38, "", "Routes each request to the right model based on how sensitive the data is.", null),
  n("H_ui", 10, 7, "screen", "live", "Copilot · AI Governance\nAgent Control Tower", -30, "", "Copilot, AI-governance, and Agent Control Tower screens.", null, { slug: "control-tower" }),
  n("H_prog", 10, 7, "screen", "planned", "Program Control\nTower", 40, "No implemented data source.", "A planned \"Program Control Tower\" screen — but it has no data source yet.", null, { warn: true }),
];

const MASTER_EDGES: ArchEdge[] = [
  e("A_src", "A_ing", "downloads", "norm"), e("A_ing", "A_bz", "batch loads", "norm"), e("A_ims", "A_bz", "provenance only", "optional"),
  e("A_bz", "A_sv", "cleans", "norm"), e("A_sv", "A_gd", "aggregates", "norm"), e("A_gd", "A_tr", "creates features", "norm"),
  e("A_tr", "A_rg", "trains", "norm"), e("A_rg", "A_serve", "promotes", "norm"), e("A_serve", "A_api", "serves", "norm"), e("A_api", "A_ui", "renders", "norm"),
  e("A_serve", "B_db", "persists", "norm"), e("B_db", "B_api", "serves", "norm"), e("B_api", "B_ui", "renders", "norm"),
  e("C_iss", "C_ing", "streams", "optional"), e("C_cap", "C_ing", "replays", "norm"), e("C_open", "C_ing", "fallback", "optional"),
  e("C_ing", "C_bz", "persists", "norm"), e("C_bz", "C_sv", "aggregates", "norm"), e("C_sv", "C_ev", "scores", "norm"), e("C_ev", "C_api", "serves", "norm"), e("C_api", "C_ui", "renders", "norm"), e("C_ev", "B_db", "persists", "norm"),
  e("D_gen", "D_sr", "streams", "synth"), e("D_rep", "D_br", "replays", "norm"), e("D_sr", "D_top", "serializes", "optional"), e("D_top", "D_flink", "streams", "optional"), e("D_flink", "D_br", "serves", "norm"), e("D_top", "D_dur", "intended", "warn"), e("D_br", "D_api", "serves", "norm"), e("D_api", "D_ui", "renders", "norm"),
  e("E_seed", "E_load", "batch loads", "synth"), e("E_load", "E_bz", "persists", "norm"), e("E_bz", "E_sv", "cleans", "norm"), e("E_sv", "E_gd", "creates features", "norm"),
  e("E_gd", "F_tr", "trains", "norm"), e("F_tr", "F_rg", "promotes", "norm"), e("F_rg", "F_json", "exports", "evidence"), e("F_json", "F_ui", "renders", "committed"),
  e("G_corp", "G_ml", "clusters", "synth"), e("G_ml", "G_gd", "persists", "norm"), e("G_gd", "G_serve", "mirrors", "norm"), e("G_serve", "B_db", "mirrors", "norm"), e("G_serve", "G_ui", "renders", "norm"),
  e("B_db", "H_mcp", "supplies context", "norm"), e("H_oai", "H_route", "supplies", "optional"), e("H_gem", "H_route", "supplies", "optional"), e("H_mcp", "H_route", "routes", "norm"), e("H_route", "H_gov", "audits", "evidence"), e("H_gov", "H_ui", "renders", "committed"), e("H_mcp", "H_ui", "renders", "norm"),
];

// ── NASA / Databricks medallion detail view ──
const NASA_LAYOUT: ViewLayout = { ox: 160, oy: 150, colGap: 232, rowGap: 84, nw: 180 };
const NASA_NODES: ArchNode[] = [
  d("cmapss", 0, 0, "cloud", "live", "NASA C-MAPSS\nFD001–FD004", "Real engine telemetry: train/test runs plus the true remaining-life answer. Downloaded from a GitHub mirror.", "nasa"),
  d("smap", 0, 1.4, "cloud", "live", "SMAP / MSL\ntelemetry", "Real spacecraft telemetry arrays plus labeled anomaly windows. Downloaded from a Hugging Face mirror.", "hf"),
  d("ims", 0, 2.8, "cloud", "optional", "IMS bearing\narchive", "A real bearing run-to-failure archive — filed and verified, but the vibration analysis on it is not built.", "nasa", { warn: true }),
  d("ncm", 0, 4.0, "cloud", "planned", "N-CMAPSS", "A newer NASA dataset, planned but not downloaded yet.", "nasa", { warn: true }),
  d("auth", 1, -0.4, "rect", "live", "auth_gate.py", "Checks credentials before any pipeline step runs.", "dbx"),
  d("schema", 1, 0.5, "rect", "live", "01_create_schema.py", "Sets up the empty Databricks tables the pipeline fills.", "dbx"),
  d("bc", 1, 1.4, "rect", "live", "02_bronze_cmapss.py", "Loads the raw engine data into Databricks.", "dbx"),
  d("bs", 1, 2.3, "rect", "live", "03_bronze_smap_msl.py", "Loads the raw spacecraft data into Databricks.", "dbx"),
  d("bi", 1, 3.2, "rect", "optional", "04_bronze_ims.py", "Loads the bearing archive — optional, since downstream analysis is not built.", "dbx"),
  d("files", 1, 4.1, "cylinder", "live", "Files API → UC\nraw volume", "The landing area in Databricks where uploaded files arrive.", "dbx"),
  d("bronze", 2, 1.7, "cylinder", "live", "BRONZE\nbronze_cmapss · _rul\nbronze_smap_msl_telemetry\n_labels · bronze_ims", "The raw data, landed exactly as received.", "dbx", { width: 214 }),
  d("silver_s", 3, 0.7, "rect", "live", "05_silver.py", "Cleans and standardizes the raw tables.", "dbx"),
  d("silver", 3, 2.2, "cylinder", "live", "SILVER\nsilver_cmapss · _rul\nsilver_smap_msl · _labels\nsilver_ims", "The cleaned, conformed data.", "dbx", { width: 200 }),
  d("gold_s", 4, 0.7, "rect", "live", "06_gold.py", "Builds the analysis-ready feature tables.", "dbx"),
  d("gold", 4, 2.5, "cylinder", "live", "GOLD\ngold_cmapss_features\ngold_smap_msl_windows\ngold_replay_feed\ngold_fused_state_vectors\ngold_fused_feature_manifest", "Feature tables the models train and score on.", "dbx", { width: 214 }),
  d("t_an", 5, 0.5, "rect", "live", "08_train_anomaly.py\nMAD · PCA recon", "Trains the anomaly detector, with honest train-only thresholds.", "dbx"),
  d("t_rul", 5, 1.9, "rect", "live", "09_train_rul.py\nlinear · GBM", "Trains the remaining-life model, with leakage controls and late-prediction checks.", "dbx"),
  d("t_fz", 5, 3.3, "rect", "live", "14_fused_state_vector.py\nPCA256 · autoencoder", "Builds a 256-number \"fused state\" summary of each machine, with per-channel error attribution.", "dbx"),
  d("m_an", 6, 0.5, "cylinder", "live", "anomaly_baseline_mad\nanomaly_pca_recon", "The trained anomaly models.", "dbx"),
  d("m_rul", 6, 1.9, "cylinder", "live", "rul_linear_baseline\nrul_gbm", "The trained remaining-life models.", "dbx"),
  d("m_fz", 6, 3.3, "cylinder", "live", "fused_pca_256\nfused_autoencoder_256", "The trained fused-state models.", "dbx"),
  d("mlflow", 7, 0.3, "cylinder", "live", "MLflow experiment\n3740651530987773", "The log of every training run and its metrics.", "mlf"),
  d("promote", 7, 1.4, "rect", "live", "10_promote_models.py", "Reads the metrics and decides which models are good enough to ship.", "dbx"),
  d("gate", 7, 2.4, "diamond", "live", "promotion\ngate", "The pass/fail bar a model must clear to become champion.", "dbx", { width: 124 }),
  d("uc", 7, 3.5, "cylinder", "live", "Unity Catalog registry\ntel_anomaly_detector@champion\ntel_rul_regressor@champion", "The official registry; the \"champion\" tag points to the model in production.", "uc", { width: 210 }),
  d("evid", 7, 4.9, "doc", "evidence", "model cards · metrics\ncalibration evidence", "Saved proof of how each model was evaluated.", null),
  d("score", 8, 0.3, "rect", "live", "11_score_replay_feed.py", "Runs the champion anomaly model over a fixed replay feed.", "dbx"),
  d("scored", 8, 1.3, "cylinder", "live", "gold_replay_feed_scored", "The scored replay results.", "dbx"),
  d("export", 8, 2.3, "rect", "live", "12_export_replay_fixture.py", "Freezes those results into a fixed file for the demo UI.", "dbx"),
  d("fixture", 8, 3.3, "doc", "evidence", "committed replay fixture", "A committed snapshot exported from real champion-scored data — what the Replay console reads.", null),
  d("backfill", 8, 4.3, "rect", "live", "13_backfill_serving.py", "Copies predictions into the live serving database.", "dbx"),
  d("supa", 8, 5.4, "cylinder", "live", "Supabase tel_predictions\ntel_model_runs · anomaly_events", "The live database the dashboards read.", "sb", { width: 210 }),
  d("nb_base", 5, 4.9, "rect", "evidence", "telemetry_calibration\n_baseline.py", "A research notebook that measures how trustworthy the model uncertainty is (PICP, MPIW, CRPS).", "dbx"),
  d("nb_chal", 6, 4.9, "rect", "evidence", "telemetry_calibration\n_challenger_cnnlstm.py", "A neural-net challenger model evaluated against the same bar before it could graduate.", "dbx"),
  d("nb_trust", 7, 6.0, "rect", "evidence", "telemetry_trust_gate0\n_distance_error.py", "A falsification test: does \"looks unfamiliar\" actually predict \"model is wrong\"? No new model is shipped.", "dbx"),
  d("ui_perf", 9, 0.3, "screen", "live", "Model Performance", "The screen showing how well models score.", null, { slug: "model-performance" }),
  d("ui_reg", 9, 1.4, "screen", "live", "Model Registry", "The screen listing models and champions.", null, { slug: "registry" }),
  d("ui_cal", 9, 2.5, "screen", "live", "RUL Calibration", "The screen on remaining-life calibration.", null, { slug: "calibration" }),
  d("ui_replay", 9, 3.6, "screen", "evidence", "Replay Console", "Plays back the committed fixture exported from real champion-scored data.", null, { slug: "replay" }),
  d("ui_gov", 9, 5.0, "screen", "evidence", "AI Governance /\nTrust Center", "The screen that surfaces the evidence and audit trail.", null, { slug: "governance" }),
];
const NASA_EDGES: ArchEdge[] = [
  e("cmapss", "bc", "downloads", "norm"), e("smap", "bs", "downloads", "norm"), e("ims", "bi", "provenance", "optional"),
  e("auth", "schema", "", "norm"), e("bc", "bronze", "persists", "norm"), e("bs", "bronze", "persists", "norm"), e("bi", "bronze", "persists", "optional"), e("files", "bronze", "uploads", "norm"), e("schema", "bronze", "creates", "norm"),
  e("bronze", "silver_s", "", "norm"), e("silver_s", "silver", "cleans", "norm"), e("silver", "gold_s", "", "norm"), e("gold_s", "gold", "aggregates", "norm"),
  e("gold", "t_an", "creates features", "norm"), e("gold", "t_rul", "", "norm"), e("gold", "t_fz", "", "norm"),
  e("t_an", "m_an", "trains", "norm"), e("t_rul", "m_rul", "trains", "norm"), e("t_fz", "m_fz", "trains", "norm"),
  e("m_an", "mlflow", "logs", "norm"), e("m_rul", "mlflow", "logs", "norm"), e("m_fz", "mlflow", "logs", "norm"),
  e("mlflow", "promote", "reads", "norm"), e("promote", "gate", "", "norm"), e("gate", "uc", "registers", "norm"), e("uc", "evid", "", "evidence"),
  e("uc", "score", "champion", "norm"), e("score", "scored", "scores", "norm"), e("scored", "export", "", "norm"), e("export", "fixture", "exports", "evidence"),
  e("uc", "backfill", "champion", "norm"), e("scored", "backfill", "", "norm"), e("backfill", "supa", "persists", "norm"),
  e("fixture", "ui_replay", "renders", "committed"), e("supa", "ui_perf", "serves", "norm"), e("supa", "ui_reg", "serves", "norm"), e("supa", "ui_cal", "serves", "norm"),
  e("gold", "nb_base", "evaluates", "norm"), e("nb_base", "nb_chal", "", "evidence"), e("uc", "nb_trust", "frozen champion", "norm"),
  e("evid", "ui_gov", "audits", "committed"), e("nb_trust", "ui_gov", "", "evidence"), e("nb_chal", "ui_gov", "", "evidence"),
];

// ── ISS + Stargate streaming detail view ──
const STREAM_LAYOUT: ViewLayout = { ox: 160, oy: 120, colGap: 222, rowGap: 82, nw: 178 };
const STREAM_BANDS: BandInfo[] = [
  { label: "ISS LIVE STREAMING", color: "#00E5FF", row0: -0.7, row1: 2.7 },
  { label: "STARGATE KAFKA STREAMING", color: "#FF2E9A", row0: 3.1, row1: 7.6 },
];
const STREAM_NODES: ArchNode[] = [
  d("iss_ls", 0, 0, "cloud", "optional", "ISS Lightstreamer", "A live public feed from the Space Station. Optional — if it drops the system keeps running.", "iss"),
  d("iss_cap", 0, 1, "cloud", "live", "Recorded ISS capture", "A saved recording — the reliable proof path.", "iss"),
  d("iss_os", 0, 2, "cloud", "optional", "OpenSky ADS-B\nfallback", "A backup live feed used when ISS is unavailable.", "iss"),
  d("adapter", 1, 1, "rect", "live", "Source Adapter", "Normalizes whichever source is active into one format.", "api"),
  d("s_ing", 2, 1, "rect", "live", "telemetry_stream_ingest", "Stores each incoming reading.", "api"),
  d("s_bz", 3, 1, "cylinder", "live", "tel_stream_readings\n_bronze", "Raw streamed readings, as received.", "sb", { slug: "stream" }),
  d("s_etl", 4, 1, "rect", "live", "telemetry_stream_etl", "Cleans the readings and rolls them up.", "api"),
  d("s_rd", 5, 0.4, "cylinder", "live", "tel_stream_readings", "The cleaned per-reading table.", "sb"),
  d("s_agg", 5, 1.6, "cylinder", "live", "tel_stream_minute_agg", "Per-minute summaries.", "sb", { slug: "monitoring" }),
  d("s_state", 6, 1, "cylinder", "live", "tel_anomaly_events · dq_assertions\netl_watermarks · pipeline_status", "Anomalies, data-quality checks, and pipeline bookkeeping.", "sb", { width: 214 }),
  d("s_api", 7, 1, "rect", "live", "/api/telemetry/stream\n/live · /health", "Endpoints the live dashboards poll.", "api"),
  d("s_ui", 8, 1, "screen", "live", "Mission Control Stream\nSystem Health", "The live ISS stream and health screens.", null, { slug: "stream" }),
  d("sg_gen", 0, 4, "cloud", "synth", "RS Factory waveform\ngenerator", "A synthetic 3D-printer signal generator. Data is made-up; the processing is real.", null),
  d("sg_mal", 0, 5.5, "cloud", "synth", "Malformed records\n(DLQ test)", "Deliberately broken records, used to test the bad-record path.", null),
  d("sg_sim", 1, 4, "rect", "synth", "Stargate printer\nsimulator", "Plays the generator as if it were a real printer.", null),
  d("sg_pb", 2, 4, "rect", "synth", "Protobuf serializer", "Packs each reading into a compact wire format.", null),
  d("sg_sr", 2, 5, "cylinder", "optional", "Confluent Schema\nRegistry", "Registers the message format. Needed only in cloud mode.", "kafka"),
  d("sg_top", 3, 4.4, "cylinder", "optional", "stargate.printer\n.telemetry.v1", "The Kafka topic carrying the live printer stream.", "kafka"),
  d("sg_f5", 4, 3.4, "rect", "synth", "Flink 5s aggregation", "Computes rolling 5-second averages in real time.", "flink"),
  d("sg_a5", 5, 3.4, "cylinder", "synth", "stargate.printer\n.telemetry.agg5s.v1", "The 5-second aggregate topic.", "kafka"),
  d("sg_fan", 4, 4.6, "rect", "synth", "Flink anomaly predicate", "Flags anomalies in real time.", "flink"),
  d("sg_an", 5, 4.6, "cylinder", "synth", "stargate.printer\n.anomalies.v1", "The anomalies topic.", "kafka"),
  d("sg_df", 4, 5.8, "diamond", "synth", "decode\nfailure", "The check that catches unreadable records.", "flink", { width: 124 }),
  d("sg_dlq", 5, 5.8, "cylinder", "synth", "stargate.printer\n.dlq.v1", "The dead-letter topic for bad records.", "kafka"),
  d("sg_bridge", 6, 4, "rect", "synth", "Stargate bridge", "Reads the topics and serves them live. Holds data in memory only.", "api"),
  d("sg_rings", 7, 4, "rect", "synth", "in-memory telemetry/agg\nanomaly / DLQ rings", "Fast in-memory buffers of the most recent data.", "api"),
  d("sg_sse", 8, 4, "rect", "live", "/stargate health · snapshot\ndlq · /stream SSE", "Endpoints that push live updates to the browser.", "api", { width: 186 }),
  d("sg_live", 9, 4, "screen", "live", "Stargate Live", "The Stargate Live dashboard.", null, { slug: "stargate" }),
  d("sg_jsonl", 6, 5.5, "doc", "live", "replay_capture.jsonl", "A saved recording for the offline fallback.", null),
  d("sg_capbr", 7, 5.5, "rect", "live", "capture-mode bridge", "Replays the recording when Kafka is not available.", "api"),
  d("sg_local", 8, 5.5, "rect", "live", "local 5s agg ·\nanomaly routing", "Does the aggregation and anomaly routing locally in fallback mode.", "api"),
  d("sg_cons", 6, 6.9, "rect", "optional", "telemetry_stream\n_consumer.py", "The durable consumer this migration refers to is not present in the repository.", "kafka", { warn: true }),
  d("sg_krows", 7, 6.9, "cylinder", "optional", "tel_stream_kafka_rows", "The Postgres table meant to hold the durable Kafka rows.", "sb"),
  d("sg_koff", 8, 6.9, "cylinder", "optional", "tel_stream_consumer\n_offsets", "Tracks how far the durable consumer has read.", "sb"),
];
const STREAM_EDGES: ArchEdge[] = [
  e("iss_ls", "adapter", "streams", "optional"), e("iss_cap", "adapter", "replays", "norm"), e("iss_os", "adapter", "fallback", "optional"),
  e("adapter", "s_ing", "", "norm"), e("s_ing", "s_bz", "persists", "norm"), e("s_bz", "s_etl", "", "norm"), e("s_etl", "s_rd", "cleans", "norm"), e("s_etl", "s_agg", "aggregates", "norm"), e("s_rd", "s_state", "", "norm"), e("s_agg", "s_state", "scores", "norm"), e("s_state", "s_api", "serves", "norm"), e("s_api", "s_ui", "renders", "norm"),
  e("sg_gen", "sg_sim", "generates", "synth"), e("sg_sim", "sg_pb", "", "norm"), e("sg_pb", "sg_sr", "registers", "optional"), e("sg_pb", "sg_top", "serializes", "optional"), e("sg_sr", "sg_top", "validates", "optional"),
  e("sg_top", "sg_f5", "streams", "synth"), e("sg_f5", "sg_a5", "aggregates", "norm"), e("sg_top", "sg_fan", "", "synth"), e("sg_fan", "sg_an", "", "norm"), e("sg_mal", "sg_df", "malformed", "synth"), e("sg_top", "sg_df", "decode", "synth"), e("sg_df", "sg_dlq", "routes", "norm"),
  e("sg_a5", "sg_bridge", "", "norm"), e("sg_an", "sg_bridge", "", "norm"), e("sg_top", "sg_bridge", "streams", "norm"), e("sg_bridge", "sg_rings", "", "norm"), e("sg_rings", "sg_sse", "serves", "norm"), e("sg_sse", "sg_live", "renders", "norm"),
  e("sg_jsonl", "sg_capbr", "replays", "norm"), e("sg_capbr", "sg_local", "", "norm"), e("sg_local", "sg_sse", "serves", "norm"),
  e("sg_top", "sg_cons", "intended", "warn"), e("sg_cons", "sg_krows", "persists", "optional"), e("sg_krows", "sg_koff", "", "optional"),
];

// ── Factory ML + NCR intelligence detail view ──
const FACTORY_LAYOUT: ViewLayout = { ox: 160, oy: 140, colGap: 228, rowGap: 84, nw: 178 };
const FACTORY_BANDS: BandInfo[] = [
  { label: "FACTORY ML — DATABRICKS LAKEHOUSE (synthetic source)", color: "#00E5FF", row0: -0.5, row1: 3.4 },
  { label: "NCR INTELLIGENCE (synthetic text · real clustering & forecasting)", color: "#B07CFF", row0: 4.3, row1: 5.7 },
];
const FACTORY_NODES: ArchNode[] = [
  d("f_seed", 0, 1, "cloud", "synth", "RS Factory seed\ng01–g11", "A deterministic synthetic factory dataset (orders, machines, tests). Not real company data.", null),
  d("f_pq", 0, 2.2, "doc", "synth", "RS Factory Parquet\nartifacts", "The generated files the loader reads.", null),
  d("f_load", 1, 1.5, "rect", "synth", "load_to_databricks.py", "Loads the synthetic files into Databricks.", "dbx"),
  d("f_bz", 2, 1.5, "cylinder", "synth", "BRONZE\nbronze_fact_process_feature_window\nraw_iot_telemetry_samples · raw_test_runs\nraw_qms_inspection_results · raw_qms_ncrs\ndim_serialized_item · dim_part", "The raw factory tables, as loaded.", "dbx", { width: 242 }),
  d("f_silv", 3, 0.4, "rect", "synth", "02_silver_features.py", "Cleans and shapes the factory features.", "dbx"),
  d("f_sv", 3, 1.9, "cylinder", "synth", "silver_layer_features\nsilver_print_aggregates\nsilver_run_waveform_stats", "The cleaned factory feature tables.", "dbx", { width: 202 }),
  d("f_golds", 4, 0.4, "rect", "synth", "03_gold_feature_store.py", "Builds the model-ready tables.", "dbx"),
  d("f_gd", 4, 2.0, "cylinder", "synth", "gold_print_quality_train\ngold_layer_heatmap\ngold_readiness_summary\ngold_feature_importance", "The model-ready factory tables.", "dbx", { width: 206 }),
  d("f_train", 5, 1.0, "rect", "synth", "04_train_print_quality.py", "Trains the print-quality models.", "dbx"),
  d("f_mdl", 5, 2.5, "cylinder", "synth", "rs_print_strength · passfail\nrs_run_failure · Ridge · LogReg\nXGBoost · SHAP", "The trained models plus their explainability outputs.", "dbx", { width: 206 }),
  d("f_mlf", 6, 0.6, "cylinder", "synth", "MLflow / Unity Catalog", "Stores the trained factory models.", "mlf"),
  d("f_exp", 6, 1.9, "rect", "synth", "export_dashboard_json.py", "Exports results to static JSON files.", "dbx"),
  d("f_json", 7, 1.9, "doc", "evidence", "committed JSON\ntrain_metadata · readiness\nncr_clusters · model_registry\nlayer_heatmap · feature_importance", "The committed JSON snapshots the dashboard reads — not a live query.", null, { width: 208 }),
  d("f_ui", 8, 1.9, "screen", "synth", "Factory ML Console", "Reads the committed JSON files, not a live Databricks query.", null, { warn: true, slug: "factory-ml" }),
  d("n_corp", 0, 5, "rect", "synth", "ncr_corpus.py", "Generates deterministic synthetic quality-incident write-ups.", null),
  d("n_rec", 1, 5, "cylinder", "synth", "ncr_records", "The synthetic incident records.", "dbx"),
  d("n_clu", 2, 5, "rect", "synth", "ncr_clustering.py\nMiniLM·UMAP·HDBSCAN·c-TF-IDF", "Real ML that groups similar incidents and labels the clusters.", "dbx", { width: 206 }),
  d("n_pts", 3, 5, "cylinder", "synth", "ncr_points\nncr_clusters", "The clustered incidents.", "dbx"),
  d("n_fc", 4, 5, "rect", "synth", "ncr_backlog_forecast.py\nwalk-forward + intervals", "Forecasts the incident backlog, with honest intervals.", "dbx", { width: 200 }),
  d("n_bw", 5, 5, "cylinder", "synth", "ncr_backlog_weekly", "The weekly backlog forecast.", "dbx"),
  d("n_run", 6, 5, "rect", "synth", "15_run_ncr_pipeline.py\n16_mirror_ncr_serving.py", "Runs the NCR pipeline and mirrors results to serving.", "dbx", { width: 200 }),
  d("n_supa", 7, 5, "cylinder", "live", "Supabase tel_ncr_records\ntel_ncr_clusters · backlog_weekly", "The live database the NCR screens read.", "sb", { width: 208 }),
  d("n_ui", 8, 5, "screen", "synth", "Factory & NCR\nIntelligence", "The Factory & NCR intelligence screens.", null, { slug: "factory" }),
];
const FACTORY_EDGES: ArchEdge[] = [
  e("f_seed", "f_load", "batch loads", "synth"), e("f_pq", "f_load", "", "norm"), e("f_load", "f_bz", "persists", "norm"), e("f_bz", "f_silv", "", "norm"), e("f_silv", "f_sv", "cleans", "norm"), e("f_sv", "f_golds", "", "norm"), e("f_golds", "f_gd", "creates features", "norm"), e("f_gd", "f_train", "trains", "norm"), e("f_train", "f_mdl", "", "norm"), e("f_mdl", "f_mlf", "registers", "norm"), e("f_mlf", "f_exp", "", "norm"), e("f_exp", "f_json", "exports", "evidence"), e("f_json", "f_ui", "renders", "committed"),
  e("n_corp", "n_rec", "generates", "synth"), e("n_rec", "n_clu", "", "norm"), e("n_clu", "n_pts", "clusters", "norm"), e("n_pts", "n_fc", "", "norm"), e("n_fc", "n_bw", "forecasts", "norm"), e("n_bw", "n_run", "", "norm"), e("n_run", "n_supa", "mirrors", "norm"), e("n_supa", "n_ui", "renders", "norm"),
];

export const ARCH_VIEWS: ArchView[] = [
  { id: "master", label: "Master System", title: "Winston Telemetry — full system map · 8 lanes",
    isMaster: true, layout: { ox: 0, oy: 0, colGap: 212, rowGap: 150, nw: 178 },
    nodes: MASTER_NODES, edges: MASTER_EDGES, bands: [] },
  { id: "nasa", label: "NASA · Databricks ML", title: "NASA / Databricks medallion · training lakehouse",
    isMaster: false, layout: NASA_LAYOUT, nodes: NASA_NODES, edges: NASA_EDGES, bands: [] },
  { id: "stream", label: "Streaming", title: "ISS + Stargate streaming · live, capture, durable",
    isMaster: false, layout: STREAM_LAYOUT, nodes: STREAM_NODES, edges: STREAM_EDGES, bands: STREAM_BANDS },
  { id: "factory", label: "Factory ML · NCR", title: "Factory ML lakehouse + NCR intelligence",
    isMaster: false, layout: FACTORY_LAYOUT, nodes: FACTORY_NODES, edges: FACTORY_EDGES, bands: FACTORY_BANDS },
];

// Consolidated known-limitations list — ported verbatim from the source diagram.
export const KNOWN_LIMITATIONS: string[] = [
  "IMS contains verified archive provenance only; vibration extraction is not built.",
  "N-CMAPSS is planned and not downloaded.",
  "Factory ML dashboard data is committed JSON, not a live Databricks query.",
  "Replay is a committed fixture exported from real champion-scored data.",
  "Fused vectors may be unseeded in the operational database.",
  "ISS live streaming is optional; recorded capture is the dependable proof path.",
  "Stargate cloud mode requires Confluent; capture mode is the Railway-safe fallback.",
  "Kafka provenance tables exist, but the referenced durable consumer implementation is absent.",
  "RS Factory seed outputs are synthetic.",
  "NCR source text is synthetic; clustering and forecasting runs are real.",
  "Program Control Tower has no implemented data source.",
  "Mission Readiness composite has no ratified formula.",
  "Metadata catalog has 100 reviewed nodes and 133 edges; newer Kafka provenance tables still need to be added.",
];

// ── tuple constructors (keep the data tables above terse and aligned) ──
interface NodeOpts { warn?: boolean; slug?: string; width?: number }
function n(
  id: string, col: number, row: number, shape: NodeShape, status: ArchStatus,
  label: string, yOffset: number, note: string, plain: string, tech: TechKey | null, opts: NodeOpts = {},
): ArchNode {
  return { id, col, row, shape, status, label, warn: !!opts.warn, yOffset, note, plain, tech, slug: opts.slug, width: opts.width };
}
function d(
  id: string, col: number, row: number, shape: NodeShape, status: ArchStatus,
  label: string, plain: string, tech: TechKey | null, opts: NodeOpts = {},
): ArchNode {
  return { id, col, row, shape, status, label, warn: !!opts.warn, yOffset: 0, note: "", plain, tech, slug: opts.slug, width: opts.width };
}
function e(from: string, to: string, label: string, kind: EdgeKind): ArchEdge {
  return { from, to, label, kind };
}
