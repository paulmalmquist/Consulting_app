// SEED DATA — replace with API calls in next pass.
// All content is deterministic, demo-only, and intentionally specific so the
// surface reads like a real architect's working notes, not generic AI prose.

export type IngestionPattern = "CDC" | "Batch" | "Streaming" | "API" | "File Drop";
export type Trust = "certified" | "in_review" | "draft" | "deprecated";
export type Health = "green" | "amber" | "red";

// ───────────────────────────────────────────────────────────────────────
// Command Center

export type Kpi = {
  key: string;
  label: string;
  value: string;
  delta?: string;
  deltaTone?: "up" | "down" | "flat";
  caption: string;
};

export const COMMAND_CENTER_KPIS: Kpi[] = [
  {
    key: "maturity",
    label: "Platform Maturity",
    value: "Lvl 2 / 5",
    delta: "+1 this quarter",
    deltaTone: "up",
    caption: "Bronze + Silver in flight; Gold on slate",
  },
  {
    key: "source-coverage",
    label: "Source Coverage",
    value: "6 / 9",
    delta: "+2 this month",
    deltaTone: "up",
    caption: "ERP, WMS, TMS, MES wired; supplier portal pending",
  },
  {
    key: "pipeline-health",
    label: "Pipeline Health",
    value: "94%",
    delta: "−1.2pp",
    deltaTone: "down",
    caption: "23 of 24 DLT pipelines green over 7 days",
  },
  {
    key: "data-quality",
    label: "Data Quality",
    value: "97.1%",
    delta: "+0.6pp",
    deltaTone: "up",
    caption: "Expectation pass rate across silver tables",
  },
  {
    key: "governance",
    label: "Governance Readiness",
    value: "78%",
    delta: "+12pp",
    deltaTone: "up",
    caption: "Unity Catalog rollout, 14 PII fields tagged",
  },
  {
    key: "ai-lift",
    label: "AI Acceleration",
    value: "3.4× SDLC",
    delta: "+0.6×",
    deltaTone: "up",
    caption: "Avg story cycle compressed from 11d to 3.2d",
  },
];

export type RiskItem = {
  id: string;
  title: string;
  severity: Health;
  owner: string;
  detail: string;
};

export const OPEN_RISKS: RiskItem[] = [
  {
    id: "risk-1",
    title: "Manhattan WMS CDC lag intermittently > 30 min",
    severity: "amber",
    owner: "Platform · Petra L.",
    detail: "Likely Kafka consumer lag during 02:00 batch window; needs partition rebalance.",
  },
  {
    id: "risk-2",
    title: "Two suppliers missing freight tenders > 24h",
    severity: "red",
    owner: "Supply Chain Ops · Diego R.",
    detail: "OTIF dropped to 86% in lane DFW→ATL; Genie surfaced root cause from fact_shipment_event.",
  },
  {
    id: "risk-3",
    title: "Unity Catalog PII tagging incomplete on supplier_master",
    severity: "amber",
    owner: "Governance · Aisha K.",
    detail: "10 of 14 sensitive columns tagged; remaining 4 need legal review before promotion.",
  },
  {
    id: "risk-4",
    title: "MES timestamps drift between sites BR-03 and BR-07",
    severity: "amber",
    owner: "Data · Mateo V.",
    detail: "NTP drift up to 4s; affects production_throughput_summary cycle time.",
  },
];

export type NextMove = {
  id: string;
  title: string;
  detail: string;
  size: "S" | "M" | "L";
  eta: string;
};

export const NEXT_MOVES: NextMove[] = [
  {
    id: "next-1",
    title: "Ship Gold supplier_otif_scorecard v1",
    detail: "Last mile is the fact_shipment_event late-binding fix; one Genie demo set already drafted.",
    size: "M",
    eta: "Week of May 5",
  },
  {
    id: "next-2",
    title: "Asset Bundle CI/CD for Bronze ingestion",
    detail: "Promote bronze.raw_purchase_orders bundle from dev to prod; build green for 11 of 12 jobs.",
    size: "S",
    eta: "Week of Apr 28",
  },
  {
    id: "next-3",
    title: "Demand forecast pilot — top 200 SKUs",
    detail: "Feature store keys defined; baseline against statsforecast before promoting to Mosaic AI.",
    size: "L",
    eta: "Week of May 12",
  },
];

// ───────────────────────────────────────────────────────────────────────
// Architecture

export type CapabilityCard = {
  key: string;
  title: string;
  blurb: string;
  status: "live" | "in_flight" | "planned";
};

export const ARCHITECTURE_CAPABILITIES: CapabilityCard[] = [
  {
    key: "dlt",
    title: "Delta Live Tables",
    blurb: "Declarative pipelines with built-in expectations for every Bronze and Silver table.",
    status: "live",
  },
  {
    key: "uc",
    title: "Unity Catalog",
    blurb: "Single catalog across ERP/WMS/TMS data with table-level grants and row filters per business unit.",
    status: "live",
  },
  {
    key: "workflows",
    title: "Workflows",
    blurb: "Scheduled jobs with task-level retries; SLA monitoring through job dashboards.",
    status: "live",
  },
  {
    key: "bundles",
    title: "Asset Bundles",
    blurb: "Source-controlled deploys with environment overlays for dev / staging / prod.",
    status: "in_flight",
  },
  {
    key: "vector",
    title: "Vector Search",
    blurb: "Embeddings over supplier contracts and SOPs; powers Genie context for procurement queries.",
    status: "in_flight",
  },
  {
    key: "mosaic",
    title: "Mosaic AI",
    blurb: "Hosted serving for forecasting and anomaly models with model registry promotion gates.",
    status: "planned",
  },
  {
    key: "feature-store",
    title: "Feature Store",
    blurb: "Reusable lag/window features for demand, lead-time, and freight cost models.",
    status: "in_flight",
  },
  {
    key: "genie",
    title: "Genie",
    blurb: "Natural-language BI grounded on certified Gold tables with metric definitions enforced.",
    status: "in_flight",
  },
];

export const ARCHITECTURE_FLOW = {
  sources: [
    "SAP ECC ERP",
    "Oracle Procurement",
    "Manhattan WMS",
    "Blue Yonder Planning",
    "MercuryGate TMS",
    "Rockwell MES",
  ],
  bronze: [
    "raw_purchase_orders",
    "raw_inventory_snapshots",
    "raw_shipments",
    "raw_production_events",
    "raw_supplier_master",
    "raw_demand_plans",
  ],
  silver: [
    "dim_supplier",
    "dim_location",
    "dim_item",
    "fact_inventory_position",
    "fact_order_cycle",
    "fact_shipment_event",
    "fact_production_output",
  ],
  gold: [
    "supplier_otif_scorecard",
    "inventory_risk_daily",
    "demand_supply_gap",
    "logistics_cost_to_serve",
    "production_throughput_summary",
  ],
  consumers: [
    "Genie / Natural-language BI",
    "Forecast & ML serving",
    "Power BI / Tableau dashboards",
    "REST APIs for ops apps",
  ],
};

// ───────────────────────────────────────────────────────────────────────
// Source Systems

export type SourceSystem = {
  id: string;
  name: string;
  vendor: string;
  domain: "ERP" | "Procurement" | "WMS" | "Planning" | "TMS" | "MES" | "Supplier Portal";
  ingestionPattern: IngestionPattern;
  cadence: string;
  entities: string[];
  freshness: string;
  owner: string;
  qualityIssues: string[];
  aiProfile: string;
  health: Health;
};

export const SOURCE_SYSTEMS: SourceSystem[] = [
  {
    id: "sap-ecc",
    name: "SAP ECC",
    vendor: "SAP",
    domain: "ERP",
    ingestionPattern: "CDC",
    cadence: "Near-real-time via SLT",
    entities: ["MARA (Material)", "EKKO/EKPO (Purchase Order)", "MSEG (Material Movement)", "VBAK/VBAP (Sales Order)"],
    freshness: "≤ 5 min",
    owner: "ERP Platform · Lara M.",
    qualityIssues: [
      "MARA.MEINS unit-of-measure inconsistencies on 2.1% of rows",
      "Late-arriving EKPO line items on month-end close",
    ],
    aiProfile: "Auto-profiled 412 fields; flagged 38 high-cardinality nulls and 14 foreign-key gaps.",
    health: "green",
  },
  {
    id: "oracle-procurement",
    name: "Oracle Procurement Cloud",
    vendor: "Oracle",
    domain: "Procurement",
    ingestionPattern: "API",
    cadence: "Hourly REST pull",
    entities: ["Suppliers", "Sourcing Awards", "Contracts", "Catalog Items"],
    freshness: "≤ 60 min",
    owner: "Procurement IT · Henrik B.",
    qualityIssues: [
      "Supplier_id collision with SAP LFA1 on 7 vendors",
      "Catalog UoM uses imperial; needs unification with Manhattan metric",
    ],
    aiProfile: "Inferred dim_supplier conformed key against SAP LFA1; 93% match confidence.",
    health: "amber",
  },
  {
    id: "manhattan-wms",
    name: "Manhattan Active WMS",
    vendor: "Manhattan",
    domain: "WMS",
    ingestionPattern: "CDC",
    cadence: "Kafka stream",
    entities: ["Inventory Position", "Receipt", "Pick", "Pack", "Ship Confirm"],
    freshness: "≤ 30 sec target; 30 min observed lag",
    owner: "DC Ops · Petra L.",
    qualityIssues: [
      "Consumer lag during 02:00 batch window",
      "LPN nesting events sometimes arrive out of order",
    ],
    aiProfile: "Detected duplicate ShipConfirm events at 0.4% rate; recommended idempotent merge.",
    health: "amber",
  },
  {
    id: "blue-yonder",
    name: "Blue Yonder Demand Planning",
    vendor: "Blue Yonder",
    domain: "Planning",
    ingestionPattern: "Batch",
    cadence: "Daily 03:00 UTC",
    entities: ["Demand Plan", "Statistical Forecast", "Promo Calendar", "DC Allocation"],
    freshness: "≤ 24 h",
    owner: "Planning · Yvonne T.",
    qualityIssues: [
      "Plan version churn; 3–4 versions per day with no clear winner flag",
      "Promo calendar overlaps cause double-count in demand_supply_gap",
    ],
    aiProfile: "Generated dim_plan_version table with auto-detected canonical version per day.",
    health: "amber",
  },
  {
    id: "tms-mercurygate",
    name: "MercuryGate TMS",
    vendor: "MercuryGate",
    domain: "TMS",
    ingestionPattern: "API",
    cadence: "15 min poll",
    entities: ["Shipment", "Tender", "Stop", "Charge", "Carrier"],
    freshness: "≤ 15 min",
    owner: "Logistics · Diego R.",
    qualityIssues: [
      "Carrier SCAC mapping incomplete for 6 regional LTLs",
      "Charge codes inconsistent across tenants",
    ],
    aiProfile: "Generated proposed mapping from Charge.code to canonical cost_bucket with 88% acceptance.",
    health: "green",
  },
  {
    id: "mes-rockwell",
    name: "Rockwell FactoryTalk MES",
    vendor: "Rockwell Automation",
    domain: "MES",
    ingestionPattern: "Streaming",
    cadence: "MQTT to Kafka, 1 sec",
    entities: ["Production Event", "Downtime Code", "Quality Sample", "Operator Shift"],
    freshness: "≤ 5 sec",
    owner: "Plant IT · Mateo V.",
    qualityIssues: [
      "NTP drift between BR-03 and BR-07 up to 4 sec",
      "Downtime codes free-text on 12% of events",
    ],
    aiProfile: "Clustered downtime free-text into 9 canonical reason codes; 84% mapping confidence.",
    health: "amber",
  },
];

// ───────────────────────────────────────────────────────────────────────
// Medallion pipelines

export type PipelineTable = {
  name: string;
  layer: "Bronze" | "Silver" | "Gold";
  source: string;
  expectations: string[];
  lastRun: string;
  lastRunStatus: Health;
  rowCount: string;
  owner: string;
  notes?: string;
};

export const PIPELINE_TABLES: PipelineTable[] = [
  // Bronze
  {
    name: "raw_purchase_orders",
    layer: "Bronze",
    source: "SAP ECC · EKKO/EKPO via SLT",
    expectations: ["po_number IS NOT NULL", "vendor_id IS NOT NULL"],
    lastRun: "12 min ago",
    lastRunStatus: "green",
    rowCount: "184M",
    owner: "ERP Platform",
  },
  {
    name: "raw_inventory_snapshots",
    layer: "Bronze",
    source: "Manhattan WMS · Kafka",
    expectations: ["snapshot_ts IS NOT NULL", "lpn_id IS NOT NULL"],
    lastRun: "3 min ago",
    lastRunStatus: "amber",
    rowCount: "2.1B",
    owner: "DC Ops",
    notes: "Consumer lag spike during 02:00 batch window.",
  },
  {
    name: "raw_shipments",
    layer: "Bronze",
    source: "MercuryGate TMS · API",
    expectations: ["shipment_id IS NOT NULL", "tender_status IN ('TENDERED','ACCEPTED','REJECTED')"],
    lastRun: "8 min ago",
    lastRunStatus: "green",
    rowCount: "47M",
    owner: "Logistics",
  },
  {
    name: "raw_production_events",
    layer: "Bronze",
    source: "Rockwell MES · MQTT",
    expectations: ["event_ts IS NOT NULL", "site_id IN VALUES_OF dim_site"],
    lastRun: "1 min ago",
    lastRunStatus: "green",
    rowCount: "9.4B",
    owner: "Plant IT",
  },
  {
    name: "raw_supplier_master",
    layer: "Bronze",
    source: "SAP LFA1 + Oracle Suppliers",
    expectations: ["supplier_natural_key IS NOT NULL"],
    lastRun: "2 h ago",
    lastRunStatus: "green",
    rowCount: "47K",
    owner: "Procurement IT",
  },
  {
    name: "raw_demand_plans",
    layer: "Bronze",
    source: "Blue Yonder · daily file drop",
    expectations: ["plan_version IS NOT NULL", "plan_horizon_weeks BETWEEN 1 AND 104"],
    lastRun: "5 h ago",
    lastRunStatus: "amber",
    rowCount: "312M",
    owner: "Planning",
    notes: "Plan version churn flagged 3 candidate versions today.",
  },
  // Silver
  {
    name: "dim_supplier",
    layer: "Silver",
    source: "raw_supplier_master + dq match",
    expectations: ["supplier_id IS UNIQUE", "country_code MATCHES ISO-3166"],
    lastRun: "27 min ago",
    lastRunStatus: "green",
    rowCount: "31K",
    owner: "Procurement IT",
  },
  {
    name: "dim_location",
    layer: "Silver",
    source: "SAP T001W + Manhattan facilities",
    expectations: ["location_id IS UNIQUE", "lat/lon NOT NULL for owned DCs"],
    lastRun: "27 min ago",
    lastRunStatus: "green",
    rowCount: "1.2K",
    owner: "Network Design",
  },
  {
    name: "dim_item",
    layer: "Silver",
    source: "MARA + Manhattan SKU master",
    expectations: ["item_id IS UNIQUE", "uom IS NOT NULL", "uom IN canonical set"],
    lastRun: "27 min ago",
    lastRunStatus: "amber",
    rowCount: "412K",
    owner: "Master Data",
    notes: "2.1% UoM mismatch between SAP and WMS.",
  },
  {
    name: "fact_inventory_position",
    layer: "Silver",
    source: "raw_inventory_snapshots conformed",
    expectations: ["qty_on_hand >= 0", "snapshot_date IS NOT NULL"],
    lastRun: "9 min ago",
    lastRunStatus: "green",
    rowCount: "1.8B",
    owner: "DC Ops",
  },
  {
    name: "fact_order_cycle",
    layer: "Silver",
    source: "EKKO/EKPO + VBAK/VBAP joined to receipts",
    expectations: ["po_to_receipt_days >= 0", "supplier_id IN dim_supplier"],
    lastRun: "32 min ago",
    lastRunStatus: "green",
    rowCount: "184M",
    owner: "ERP Platform",
  },
  {
    name: "fact_shipment_event",
    layer: "Silver",
    source: "raw_shipments conformed",
    expectations: ["event_type IN canonical set", "tender_to_pickup_hours >= 0"],
    lastRun: "11 min ago",
    lastRunStatus: "amber",
    rowCount: "47M",
    owner: "Logistics",
    notes: "Late-binding fix in flight for missing tender events.",
  },
  {
    name: "fact_production_output",
    layer: "Silver",
    source: "raw_production_events aggregated to job",
    expectations: ["job_id IS NOT NULL", "good_units >= 0", "scrap_units >= 0"],
    lastRun: "4 min ago",
    lastRunStatus: "green",
    rowCount: "82M",
    owner: "Plant IT",
  },
  // Gold
  {
    name: "supplier_otif_scorecard",
    layer: "Gold",
    source: "fact_order_cycle + fact_shipment_event",
    expectations: ["otif_pct BETWEEN 0 AND 1", "score_window_days = 30"],
    lastRun: "1 h ago",
    lastRunStatus: "green",
    rowCount: "31K",
    owner: "Supply Chain Ops",
  },
  {
    name: "inventory_risk_daily",
    layer: "Gold",
    source: "fact_inventory_position + demand_supply_gap",
    expectations: ["risk_score BETWEEN 0 AND 100", "horizon_days IN (7,14,28)"],
    lastRun: "1 h ago",
    lastRunStatus: "green",
    rowCount: "412K",
    owner: "Planning",
  },
  {
    name: "demand_supply_gap",
    layer: "Gold",
    source: "raw_demand_plans canonical + fact_inventory_position",
    expectations: ["gap_units >= -1e9", "plan_version IS canonical"],
    lastRun: "1 h ago",
    lastRunStatus: "amber",
    rowCount: "312M",
    owner: "Planning",
    notes: "Promo calendar overlap fix pending.",
  },
  {
    name: "logistics_cost_to_serve",
    layer: "Gold",
    source: "fact_shipment_event + charge mapping",
    expectations: ["total_cost >= 0", "lane_id IS NOT NULL"],
    lastRun: "1 h ago",
    lastRunStatus: "green",
    rowCount: "8.2M",
    owner: "Logistics",
  },
  {
    name: "production_throughput_summary",
    layer: "Gold",
    source: "fact_production_output",
    expectations: ["oee BETWEEN 0 AND 1", "shift_id IS NOT NULL"],
    lastRun: "30 min ago",
    lastRunStatus: "green",
    rowCount: "1.4M",
    owner: "Plant IT",
  },
];

// ───────────────────────────────────────────────────────────────────────
// Data Products

export type DataProduct = {
  id: string;
  name: string;
  domain: "Inventory" | "Supplier" | "Forecast" | "Logistics" | "Production" | "Working Capital";
  businessOwner: string;
  dataOwner: string;
  sla: string;
  certifiedMetrics: string[];
  consumers: string[];
  trust: Trust;
  refreshCadence: string;
};

export const DATA_PRODUCTS: DataProduct[] = [
  {
    id: "inventory-availability",
    name: "Inventory Availability",
    domain: "Inventory",
    businessOwner: "VP Supply Chain · Renee A.",
    dataOwner: "DC Ops · Petra L.",
    sla: "Refreshed every 15 min, 99.5% on-time",
    certifiedMetrics: ["on_hand_units", "available_to_promise", "days_of_supply", "stockout_risk_score"],
    consumers: ["Order Promising", "Customer Service", "Allocation Planning"],
    trust: "certified",
    refreshCadence: "Every 15 min",
  },
  {
    id: "supplier-performance",
    name: "Supplier Performance",
    domain: "Supplier",
    businessOwner: "CPO · Henrik B.",
    dataOwner: "Procurement IT",
    sla: "Daily by 06:00 local, rolling 90-day window",
    certifiedMetrics: ["otif_pct", "lead_time_days_p50", "lead_time_days_p95", "ppv_dollars"],
    consumers: ["Sourcing", "QBR Decks", "Risk Scoring"],
    trust: "certified",
    refreshCadence: "Daily",
  },
  {
    id: "demand-forecast-accuracy",
    name: "Demand Forecast Accuracy",
    domain: "Forecast",
    businessOwner: "Director Demand Planning · Yvonne T.",
    dataOwner: "Planning",
    sla: "Daily after BY plan publish, by 04:00 UTC",
    certifiedMetrics: ["mape_28d", "bias_pct", "wmape_by_dc", "forecast_value_add"],
    consumers: ["S&OP", "Supply Planning", "Mosaic AI training"],
    trust: "in_review",
    refreshCadence: "Daily",
  },
  {
    id: "logistics-cost-to-serve",
    name: "Logistics Cost to Serve",
    domain: "Logistics",
    businessOwner: "Director Transportation · Diego R.",
    dataOwner: "Logistics",
    sla: "Hourly during operating window",
    certifiedMetrics: ["cost_per_shipment", "cost_per_unit", "cost_per_lane", "accessorial_pct"],
    consumers: ["Carrier Negotiation", "Lane Optimization", "Finance Allocation"],
    trust: "certified",
    refreshCadence: "Hourly",
  },
  {
    id: "production-throughput",
    name: "Production Throughput",
    domain: "Production",
    businessOwner: "Plant Director · Sami N.",
    dataOwner: "Plant IT",
    sla: "Streaming; 5 min staleness alert",
    certifiedMetrics: ["units_per_hour", "oee", "first_pass_yield", "downtime_minutes"],
    consumers: ["Plant Floor MES", "Continuous Improvement", "Capacity Planning"],
    trust: "certified",
    refreshCadence: "Streaming",
  },
  {
    id: "working-capital-inventory-turns",
    name: "Working Capital · Inventory Turns",
    domain: "Working Capital",
    businessOwner: "CFO · Marcus W.",
    dataOwner: "Finance + DC Ops",
    sla: "Daily after close, by 07:00 local",
    certifiedMetrics: ["inventory_turns", "days_inventory_outstanding", "slow_moving_pct", "obsolete_at_risk_dollars"],
    consumers: ["Finance Reporting", "Board Pack", "Supply Plan Review"],
    trust: "draft",
    refreshCadence: "Daily",
  },
];

// ───────────────────────────────────────────────────────────────────────
// Governance

export type GovernanceField = {
  field: string;
  pii: boolean;
  classification: "Public" | "Internal" | "Confidential" | "Restricted";
  rule?: string;
};

export type GovernanceTable = {
  catalog: string;
  schema: string;
  table: string;
  certified: Trust;
  rowFilter?: string;
  columnRule?: string;
  fields: GovernanceField[];
};

export const GOVERNANCE_TABLES: GovernanceTable[] = [
  {
    catalog: "supply_chain_prod",
    schema: "silver",
    table: "dim_supplier",
    certified: "certified",
    rowFilter: "business_unit IN current_user_groups()",
    columnRule: "tax_id masked unless role IN ('finance_admin','tax_ops')",
    fields: [
      { field: "supplier_id", pii: false, classification: "Internal" },
      { field: "supplier_name", pii: false, classification: "Internal" },
      { field: "tax_id", pii: true, classification: "Restricted", rule: "Masked by default" },
      { field: "primary_contact_email", pii: true, classification: "Confidential" },
      { field: "country_code", pii: false, classification: "Public" },
    ],
  },
  {
    catalog: "supply_chain_prod",
    schema: "silver",
    table: "fact_shipment_event",
    certified: "certified",
    rowFilter: "lane_region IN current_user_regions()",
    fields: [
      { field: "shipment_id", pii: false, classification: "Internal" },
      { field: "carrier_scac", pii: false, classification: "Internal" },
      { field: "driver_name", pii: true, classification: "Confidential", rule: "Masked outside Logistics" },
      { field: "consignee_zip", pii: false, classification: "Internal" },
      { field: "event_ts", pii: false, classification: "Internal" },
    ],
  },
  {
    catalog: "supply_chain_prod",
    schema: "gold",
    table: "supplier_otif_scorecard",
    certified: "in_review",
    rowFilter: "business_unit IN current_user_groups()",
    fields: [
      { field: "supplier_id", pii: false, classification: "Internal" },
      { field: "otif_pct", pii: false, classification: "Internal" },
      { field: "ppv_dollars", pii: false, classification: "Confidential" },
      { field: "score_window_days", pii: false, classification: "Public" },
    ],
  },
];

export const GOVERNANCE_ACCESS_GROUPS: { group: string; description: string; tableCount: number }[] = [
  { group: "supply_chain_readers", description: "Read access to certified Gold tables", tableCount: 12 },
  { group: "supply_chain_engineers", description: "Read+write across Bronze and Silver in dev/staging", tableCount: 47 },
  { group: "finance_admin", description: "Sees unmasked PPV and tax fields", tableCount: 8 },
  { group: "logistics_ops", description: "Sees driver and lane PII fields", tableCount: 6 },
];

export const LINEAGE_EXAMPLE = {
  target: "supplier_otif_scorecard",
  upstream: [
    "fact_order_cycle (silver)",
    "fact_shipment_event (silver)",
    "dim_supplier (silver)",
  ],
  upstreamSources: ["raw_purchase_orders (bronze)", "raw_shipments (bronze)", "raw_supplier_master (bronze)"],
  downstream: ["Power BI: Supplier QBR", "Genie · supplier-performance space", "Sourcing API /v1/supplier/score"],
};

// ───────────────────────────────────────────────────────────────────────
// AI SDLC

export type AISDLCPhase = {
  id: string;
  number: string;
  title: string;
  human: string;
  aiAccelerates: string[];
  artifact: string;
  gate: string;
};

export const AI_SDLC_PHASES: AISDLCPhase[] = [
  {
    id: "discovery",
    number: "01",
    title: "Discovery & Design",
    human: "Architect interviews source-system owners, captures domain language, decides scope.",
    aiAccelerates: [
      "Source profiling summary (schema, cardinality, null patterns) generated from a connection string",
      "Inferred data dictionary draft with field-level descriptions for review",
      "Conformed dimension proposal with confidence scores per join key",
    ],
    artifact: "supplier_master_profile.md + dim_supplier_proposal.sql",
    gate: "Architect signs off on conformed key strategy before any pipeline code is written.",
  },
  {
    id: "modeling",
    number: "02",
    title: "Data Modeling",
    human: "Approves canonical model, sets grain and SCD strategy for each dimension and fact.",
    aiAccelerates: [
      "Generates SCD2 DDL with effective/end dates and surrogate keys",
      "Suggests partition columns based on query workload patterns",
      "Drafts referential-integrity expectations per fact-to-dim relationship",
    ],
    artifact: "ddl_silver_dim_supplier.sql + expectations.yaml",
    gate: "Data steward reviews grain and SCD choice; sign-off recorded in Unity Catalog.",
  },
  {
    id: "build",
    number: "03",
    title: "Pipeline Build",
    human: "Reviews and edits pipeline code; sets non-obvious business rules.",
    aiAccelerates: [
      "Generates PySpark / DLT skeleton from the modeling artifact",
      "Auto-wires expectations from the DQ contract",
      "Suggests window and watermark settings for streaming inputs",
    ],
    artifact: "dlt_silver_dim_supplier.py + dlt_pipeline.json",
    gate: "PR review with at least one human approver; expectations must compile.",
  },
  {
    id: "testing",
    number: "04",
    title: "Testing & QA",
    human: "Designs scenarios that catch business-rule failures the AI cannot infer.",
    aiAccelerates: [
      "Generates unit tests from expectation set and sample data",
      "Synthesizes adversarial rows (nulls, dupes, late-arriving)",
      "Suggests reconciliation queries against source-of-truth counts",
    ],
    artifact: "tests/silver/test_dim_supplier.py + recon_queries.sql",
    gate: "100% expectation pass on canary slice + reconciliation within 0.1%.",
  },
  {
    id: "deploy",
    number: "05",
    title: "Deploy & Operate",
    human: "Owns the prod release decision and the on-call rotation.",
    aiAccelerates: [
      "Asset Bundle deployment checklist auto-generated per pipeline change",
      "Detects anomalies in run duration, row counts, and DQ pass rates",
      "Suggests self-healing actions (replay, repartition, late-bind retry)",
    ],
    artifact: "asset_bundle.yml overlays + ops_runbook.md",
    gate: "Bundle dry-run clean in staging + anomaly baseline established before prod.",
  },
  {
    id: "consume",
    number: "06",
    title: "Consume & Insights",
    human: "Defines the question set and the certified metric definitions.",
    aiAccelerates: [
      "Drafts Genie space prompts and metric grounding rules",
      "Generates dashboard skeletons from data-product cards",
      "Surfaces follow-up questions based on prior session patterns",
    ],
    artifact: "genie_space_supplier_perf.json + dashboard_skeleton.json",
    gate: "Metric definitions match the data-product card; Genie sandbox test set passes.",
  },
];

// ───────────────────────────────────────────────────────────────────────
// Forecasting / ML

export type MlModel = {
  id: string;
  name: string;
  target: string;
  features: string[];
  retrain: string;
  drivers: string[];
  confidence: string;
  caveats: string;
};

export const ML_MODELS: MlModel[] = [
  {
    id: "demand-forecast",
    name: "Demand Forecast (top 200 SKUs)",
    target: "weekly units by SKU × DC, 28-week horizon",
    features: ["lagged_sales_4w", "lagged_sales_52w", "promo_calendar", "weather_index", "holiday_flag", "price_elasticity_band"],
    retrain: "Weekly Sunday 02:00 UTC",
    drivers: ["Promo lift dominates short horizon; price elasticity dominates medium horizon."],
    confidence: "MAPE 14.2% on holdout · WMAPE 11.8% by DC",
    caveats: "Long-tail SKUs (bottom 80%) still on baseline statsforecast.",
  },
  {
    id: "stockout-risk",
    name: "Inventory Stockout Risk",
    target: "binary stockout in next 14 days",
    features: ["days_of_supply", "lead_time_p95", "open_po_qty", "demand_forecast_28d", "supplier_otif_pct"],
    retrain: "Daily 03:30 UTC",
    drivers: ["Supplier OTIF and lead-time variance contribute > 40% of model SHAP."],
    confidence: "AUC 0.86 · precision-at-top-decile 0.71",
    caveats: "Underperforms on new-launch SKUs with < 8 weeks of history.",
  },
  {
    id: "supplier-delay",
    name: "Supplier Delay Prediction",
    target: "PO delivered late by > 3 days",
    features: ["supplier_id", "ship_from_country", "incoterm", "carrier_scac", "lane_distance_km", "supplier_otif_30d"],
    retrain: "Weekly Monday 02:00 UTC",
    drivers: ["Origin country and carrier are the top two SHAP features."],
    confidence: "AUC 0.81",
    caveats: "Sparse history for new suppliers degrades calibration.",
  },
  {
    id: "freight-anomaly",
    name: "Freight Cost Anomaly Detection",
    target: "shipment cost outside expected band",
    features: ["lane_id", "weight_lbs", "service_level", "fuel_surcharge_index", "tender_lead_time_h"],
    retrain: "Daily 04:00 UTC",
    drivers: ["Fuel surcharge index and tender lead time explain most variance."],
    confidence: "Catches 92% of audit-confirmed billing errors at 7% false-positive rate",
    caveats: "Tuned for North American LTL; international ocean still on rules.",
  },
  {
    id: "production-bottleneck",
    name: "Production Bottleneck Prediction",
    target: "downtime > 30 min in next 8h shift",
    features: ["asset_id", "operator_shift_id", "vibration_index", "temperature_c", "scheduled_pm_overdue"],
    retrain: "Weekly",
    drivers: ["Overdue PM and vibration index dominate; site-specific patterns also strong."],
    confidence: "AUC 0.78 · recall-at-50% 0.66",
    caveats: "Two greenfield sites have < 90 days of telemetry.",
  },
  {
    id: "working-capital",
    name: "Working Capital Optimization",
    target: "recommended target days-of-supply per SKU × DC",
    features: ["demand_volatility", "lead_time_variability", "service_level_target", "holding_cost_pct", "stockout_cost_pct"],
    retrain: "Monthly",
    drivers: ["Service-level target and lead-time variance dominate the recommendation."],
    confidence: "Backtested 4.1% inventory reduction at constant service level",
    caveats: "Requires CFO sign-off on cost parameters before deploy per BU.",
  },
];

// ───────────────────────────────────────────────────────────────────────
// Genie / Natural-Language BI

export type GenieAnswer = {
  id: string;
  question: string;
  narrative: string;
  metrics: { label: string; value: string }[];
  sourceTables: string[];
  freshness: string;
  confidence: "High" | "Medium" | "Low";
  followUps: string[];
};

export const GENIE_QA: GenieAnswer[] = [
  {
    id: "q-otif",
    question: "Which suppliers are driving OTIF deterioration this month?",
    narrative:
      "Three suppliers account for 71% of the 4.2pp OTIF drop. Brightline Components missed 28% of tenders by > 24h on the DFW→ATL lane; Pinnacle Polymers has held PO acknowledgement for > 5 days on 18% of orders; Northstar Logistics shows lead-time inflation on Asia origin.",
    metrics: [
      { label: "OTIF (last 30d)", value: "86.4%" },
      { label: "vs. prior 30d", value: "−4.2pp" },
      { label: "Suppliers contributing", value: "3 of 412" },
    ],
    sourceTables: ["supplier_otif_scorecard", "fact_order_cycle", "fact_shipment_event"],
    freshness: "Refreshed 47 min ago",
    confidence: "High",
    followUps: [
      "Show me the lanes where Brightline is failing",
      "Compare OTIF for these suppliers vs. their YTD baseline",
      "Open a sourcing note for the CPO",
    ],
  },
  {
    id: "q-stockout",
    question: "Where are we at risk of stockouts in the next 14 days?",
    narrative:
      "62 SKU × DC pairs cross the high-risk band. Concentration is in DC-DFW (24 pairs) and DC-ATL (17 pairs). The driver in 73% of cases is supplier delay risk, not demand spike — Pinnacle Polymers PO 78901 is the single largest exposure.",
    metrics: [
      { label: "High-risk pairs", value: "62" },
      { label: "Forecast units at risk", value: "1.4M" },
      { label: "Top-1 PO exposure", value: "$840K" },
    ],
    sourceTables: ["inventory_risk_daily", "demand_supply_gap", "fact_inventory_position"],
    freshness: "Refreshed 1 h ago",
    confidence: "High",
    followUps: [
      "Show only DC-DFW",
      "What expedite would cost me to clear the top 10",
      "Open a planning note for tomorrow's S&OP",
    ],
  },
  {
    id: "q-cost-to-serve",
    question: "Which lanes have the worst cost-to-serve variance?",
    narrative:
      "The DFW→ATL and ORD→MIA lanes are 18–22% above their 90-day baseline. Fuel surcharge explains 9pp; the rest is accessorial spend on detention. Both lanes share Brightline as the primary shipper-of-record.",
    metrics: [
      { label: "Lanes > 15% over baseline", value: "7" },
      { label: "DFW→ATL variance", value: "+22%" },
      { label: "Accessorial pct (worst lane)", value: "14.3%" },
    ],
    sourceTables: ["logistics_cost_to_serve", "fact_shipment_event"],
    freshness: "Refreshed 12 min ago",
    confidence: "High",
    followUps: [
      "Break down accessorial codes for DFW→ATL",
      "Compare to last quarter",
      "Suggest carrier alternatives for these lanes",
    ],
  },
  {
    id: "q-slow-movers",
    question: "Show inventory tied up in slow-moving SKUs.",
    narrative:
      "$8.4M sits in SKUs with < 0.5 turns. Two product categories — Industrial Adhesives and Seasonal Apparel — drive 64% of the value. 312 SKUs cross the obsolete-at-risk threshold based on the working-capital model.",
    metrics: [
      { label: "Slow-moving inventory $", value: "$8.4M" },
      { label: "SKUs flagged", value: "1,847" },
      { label: "Obsolete-at-risk $", value: "$1.6M" },
    ],
    sourceTables: ["fact_inventory_position", "supplier_otif_scorecard", "demand_supply_gap"],
    freshness: "Refreshed 3 h ago",
    confidence: "Medium",
    followUps: [
      "Filter to Industrial Adhesives",
      "Show the obsolete-at-risk subset",
      "Draft a markdown plan for the top 50",
    ],
  },
];

// ───────────────────────────────────────────────────────────────────────
// Roadmap

export type RoadmapPhase = {
  id: string;
  weeks: string;
  title: string;
  goals: string[];
  deliverables: string[];
  risks: { risk: string; mitigation: string }[];
};

export const ROADMAP_PHASES: RoadmapPhase[] = [
  {
    id: "discovery",
    weeks: "Weeks 1–2",
    title: "Discovery, Profiling, Architecture",
    goals: [
      "Inventory source systems and confirm extraction patterns",
      "Auto-profile each source and produce a draft data dictionary",
      "Lock the conformed-dimension strategy and the catalog hierarchy",
    ],
    deliverables: [
      "Source-system register with ingestion pattern per system",
      "Profiling summary + auto-drafted data dictionary",
      "Architecture decision record (Bronze, Silver, Gold + tooling)",
      "90-day backlog with sequencing",
    ],
    risks: [
      { risk: "Source owners slow to grant access", mitigation: "Pre-stage read-only service principals before kickoff" },
      { risk: "Ambiguity on canonical supplier ID", mitigation: "AI proposes match keys; weekly steward review" },
    ],
  },
  {
    id: "bronze",
    weeks: "Weeks 3–5",
    title: "Bronze Ingestion Framework",
    goals: [
      "Stand up CDC and streaming ingestion patterns end-to-end",
      "Prove DLT expectations + Asset Bundle CI for one source",
      "Reach freshness SLAs on at least three priority sources",
    ],
    deliverables: [
      "DLT pipelines for SAP, Manhattan, MercuryGate, MES",
      "Asset Bundle pipelines from dev → staging",
      "First wave of expectations + Unity Catalog grants",
    ],
    risks: [
      { risk: "Manhattan WMS Kafka lag during batch window", mitigation: "Partition rebalance + alert on consumer lag" },
      { risk: "MES timestamp drift across sites", mitigation: "Centralize NTP + add event-time watermark guard" },
    ],
  },
  {
    id: "silver",
    weeks: "Weeks 6–8",
    title: "Silver Conformed Model",
    goals: [
      "Land the canonical supply-chain model: dim_supplier, dim_location, dim_item, key facts",
      "Wire referential integrity expectations across silver",
      "Establish reconciliation against source-of-truth counts",
    ],
    deliverables: [
      "Silver dimension and fact tables with SCD strategy",
      "Reconciliation runbook + dashboards",
      "Lineage published in Unity Catalog",
    ],
    risks: [
      { risk: "UoM drift between SAP and WMS", mitigation: "Mapping table reviewed by master-data steward weekly" },
      { risk: "Plan-version churn from Blue Yonder", mitigation: "AI-detected canonical version flag; steward override path" },
    ],
  },
  {
    id: "gold",
    weeks: "Weeks 9–10",
    title: "Gold Data Products",
    goals: [
      "Ship the first five certified data products",
      "Each product paired with an owner, an SLA, and a Genie space",
      "Stand up the metric registry and certification badge",
    ],
    deliverables: [
      "supplier_otif_scorecard, inventory_risk_daily, demand_supply_gap, logistics_cost_to_serve, production_throughput_summary",
      "Genie spaces grounded on certified Gold tables",
      "Dashboard skeletons for executive consumption",
    ],
    risks: [
      { risk: "Metric definition drift across BI tools", mitigation: "Single metric registry; BI cards read from registry" },
      { risk: "Trust gap on day-one Gold output", mitigation: "Beta tag + parallel-run vs. legacy reports for 2 weeks" },
    ],
  },
  {
    id: "hardening",
    weeks: "Weeks 11–12",
    title: "Governance, Genie, ML, Hardening",
    goals: [
      "Close out PII tagging and access groups across silver and gold",
      "Promote the demand forecast and stockout-risk pilots into prod",
      "Run a production-readiness review and on-call rotation drill",
    ],
    deliverables: [
      "Unity Catalog access matrix signed off by Legal and Security",
      "Mosaic AI serving for forecast + stockout-risk models",
      "On-call playbook + chaos drill report",
    ],
    risks: [
      { risk: "Late-arriving legal review on PII fields", mitigation: "Legal embedded in weekly governance standup from Week 6" },
      { risk: "Forecast adoption lag", mitigation: "Co-design with planners; embed in S&OP routine, not as a side dashboard" },
    ],
  },
];
