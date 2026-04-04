/**
 * Timeline data model — the single source of truth for the compounding capability engine.
 *
 * Three entity types:
 *   1. TimelineEvent  — a career phase with start/end, company, systems built, metrics
 *   2. Capability     — a skill (Python, Databricks, SQL, …) with active date ranges
 *   3. System         — a real system that was built, tied to capabilities and metrics
 *
 * Everything on the page is driven from these objects — no hardcoded UI strings.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CompanyId = "jll" | "kayne" | "winston";

export interface TimelineMetric {
  label: string;
  value: string;
}

export interface TimelineEvent {
  id: string;
  start_date: string; // ISO
  end_date: string | null;
  company: CompanyId;
  company_label: string;
  phase: number; // 1, 2, 3
  title: string;
  role: string;
  description: string;
  problem: string;
  outcome: string;
  systems_built: string[]; // references System.id
  capabilities_used: string[]; // references Capability.id
  metrics: TimelineMetric[];
}

export interface Capability {
  id: string;
  name: string;
  icon: string; // lucide icon name or custom key
  category: "data" | "analytics" | "ai" | "cloud" | "modeling";
  color: string;
  /** Date ranges when this capability was actively used */
  active_ranges: Array<{ start: string; end: string; company: CompanyId }>;
}

export interface System {
  id: string;
  name: string;
  company: CompanyId;
  company_label: string;
  date: string; // when it was completed / shipped
  description: string;
  why_it_matters: string;
  how_it_works: string;
  capabilities_used: string[];
  metrics: TimelineMetric[];
  /** Cumulative capability value at this point — used to plot on curve */
  curve_value: number;
}

// ---------------------------------------------------------------------------
// Company colors
// ---------------------------------------------------------------------------

export const COMPANY_COLORS: Record<CompanyId, { primary: string; fill: string; label: string }> = {
  jll: { primary: "#DC2626", fill: "rgba(220,38,38,0.12)", label: "JLL" },
  kayne: { primary: "#2563EB", fill: "rgba(37,99,235,0.12)", label: "Kayne Anderson" },
  winston: { primary: "#737373", fill: "rgba(115,115,115,0.08)", label: "Winston" },
};

// ---------------------------------------------------------------------------
// Capabilities
// ---------------------------------------------------------------------------

export const CAPABILITIES: Capability[] = [
  {
    id: "sql",
    name: "SQL",
    icon: "database",
    category: "data",
    color: "#336791",
    active_ranges: [
      { start: "2014-08-01", end: "2018-01-31", company: "jll" },
      { start: "2018-02-01", end: "2025-03-31", company: "kayne" },
      { start: "2025-04-01", end: "2026-04-01", company: "jll" },
    ],
  },
  {
    id: "tableau",
    name: "Tableau",
    icon: "bar-chart-3",
    category: "analytics",
    color: "#E97627",
    active_ranges: [
      { start: "2014-08-01", end: "2018-01-31", company: "jll" },
    ],
  },
  {
    id: "python",
    name: "Python",
    icon: "code",
    category: "modeling",
    color: "#3776AB",
    active_ranges: [
      { start: "2018-02-01", end: "2025-03-31", company: "kayne" },
      { start: "2025-04-01", end: "2026-04-01", company: "jll" },
    ],
  },
  {
    id: "databricks",
    name: "Databricks",
    icon: "layers",
    category: "data",
    color: "#FF3621",
    active_ranges: [
      { start: "2019-06-01", end: "2025-03-31", company: "kayne" },
      { start: "2025-04-01", end: "2026-04-01", company: "jll" },
    ],
  },
  {
    id: "power_bi",
    name: "Power BI",
    icon: "pie-chart",
    category: "analytics",
    color: "#F2C811",
    active_ranges: [
      { start: "2019-06-01", end: "2025-03-31", company: "kayne" },
    ],
  },
  {
    id: "azure",
    name: "Azure",
    icon: "cloud",
    category: "cloud",
    color: "#0078D4",
    active_ranges: [
      { start: "2018-02-01", end: "2025-03-31", company: "kayne" },
    ],
  },
  {
    id: "openai",
    name: "OpenAI",
    icon: "brain",
    category: "ai",
    color: "#412991",
    active_ranges: [
      { start: "2025-04-01", end: "2026-04-01", company: "jll" },
    ],
  },
];

export const CAPABILITY_MAP = new Map(CAPABILITIES.map((c) => [c.id, c]));

// ---------------------------------------------------------------------------
// Timeline Events (career phases)
// ---------------------------------------------------------------------------

export const TIMELINE_EVENTS: TimelineEvent[] = [
  {
    id: "phase-jll-2014-2018",
    start_date: "2014-08-01",
    end_date: "2018-01-31",
    company: "jll",
    company_label: "JLL",
    phase: 1,
    title: "JLL — JPMC Account",
    role: "Senior Analyst, Data Engineering & Analytics",
    description:
      "Built JLL's first dedicated BI and data engineering service line for the JPMC national account. Established the reporting foundation, governance patterns, and dashboard delivery capability that proved analytics could be systematized — not just ad hoc.",
    problem:
      "No reusable analytics backbone existed. Reporting was manual, fragmented, and request-driven with no repeatable delivery model.",
    outcome:
      "Created repeatable BI delivery, executive-ready reporting, and SQL-validated data extracts. Proved that a small team could build a governed analytics capability from scratch.",
    systems_built: ["sys-bi-service-line"],
    capabilities_used: ["sql", "tableau"],
    metrics: [
      { label: "Systems replaced", value: "2" },
      { label: "Stakeholders served", value: "50+" },
      { label: "BI capability", value: "Established from zero" },
    ],
  },
  {
    id: "phase-kayne-2018-2025",
    start_date: "2018-02-01",
    end_date: "2025-03-31",
    company: "kayne",
    company_label: "Kayne Anderson",
    phase: 2,
    title: "Kayne Anderson — Investment Data Platform",
    role: "Vice President, Data Platform Engineering & FP&A",
    description:
      "Major acceleration phase. Built the full data platform: ingestion automation, governed warehouse, semantic layer, waterfall engine. Took a fragmented Excel-and-email operation and turned it into a governed, automated system managing $4B+ AUM.",
    problem:
      "DealCloud, MRI, Yardi, and Excel models were fragmented. Partner accounting required 160+ hours/month of manual entry. Reporting took weeks. Waterfall distributions were Excel-driven and fragile.",
    outcome:
      "Unified 6+ source systems into a governed lakehouse. Automated ingestion to 30 minutes. Reduced DDQ turnaround by 50%. Cut reporting cycles by 10 days. Replaced Excel waterfall with a deterministic Python engine.",
    systems_built: [
      "sys-ingestion-automation",
      "sys-warehouse",
      "sys-semantic-layer",
      "sys-waterfall-engine",
      "sys-governance-framework",
    ],
    capabilities_used: ["sql", "python", "databricks", "azure", "power_bi"],
    metrics: [
      { label: "Properties integrated", value: "500+" },
      { label: "Hours/month automated", value: "160" },
      { label: "DDQ turnaround", value: "↓ 50%" },
      { label: "Reporting cycle", value: "↓ 10 days" },
      { label: "AUM platform", value: "$4B+" },
    ],
  },
  {
    id: "phase-jll-2025-present",
    start_date: "2025-04-01",
    end_date: null,
    company: "jll",
    company_label: "JLL",
    phase: 3,
    title: "JLL — AI Data Platform & Analytics (Return)",
    role: "Director, AI Data Platform & Analytics",
    description:
      "Returned to JLL at director level to scale the full warehouse + AI playbook across PDS Americas. Building governed 'Gold Layer' in Databricks, standardizing enterprise methodologies, and shipping an AI-enabled analytics platform that shifts teams from analyst workflows to system-driven pipelines.",
    problem:
      "Reporting consistency and methodology standardization broke down across 10+ client accounts. Analytics remained analyst-driven rather than system-driven. No AI query layer existed.",
    outcome:
      "Delivered governed data delivery across PDS Americas. Standardized 10+ client accounts on the same foundation. Shipped a conversational analytics layer — business users query governed data directly via Databricks Genie + OpenAI.",
    systems_built: ["sys-gold-layer", "sys-ai-platform"],
    capabilities_used: ["sql", "python", "databricks", "openai"],
    metrics: [
      { label: "Client accounts standardized", value: "10+" },
      { label: "Analytics model", value: "AI-enabled, self-serve" },
      { label: "Pipeline shift", value: "Analyst → system-driven" },
    ],
  },
];

export const EVENT_MAP = new Map(TIMELINE_EVENTS.map((e) => [e.id, e]));

// ---------------------------------------------------------------------------
// Systems (the real things that were built)
// ---------------------------------------------------------------------------

export const SYSTEMS: System[] = [
  {
    id: "sys-bi-service-line",
    name: "BI Service Line & Reporting Platform",
    company: "jll",
    company_label: "JLL",
    date: "2017-03-01",
    description:
      "JLL's first dedicated BI capability for the JPMC national account — repeatable dashboards, SQL-validated data extracts, and executive-ready reporting.",
    why_it_matters:
      "Proved that analytics could be systematized and delivered as a service, not just ad hoc reports. This was the foundation for everything that followed.",
    how_it_works:
      "Tableau dashboards backed by SQL validation layers and optimized data extracts. Replaced fragmented manual pulls with a governed delivery pipeline.",
    capabilities_used: ["sql", "tableau"],
    metrics: [
      { label: "Systems replaced", value: "2" },
      { label: "Stakeholders served", value: "50+" },
    ],
    curve_value: 48,
  },
  {
    id: "sys-ingestion-automation",
    name: "Partner Accounting Ingestion Automation",
    company: "kayne",
    company_label: "Kayne Anderson",
    date: "2019-06-01",
    description:
      "Replaced 160+ hours/month of manual partner accounting data entry with governed Azure Logic Apps and PySpark pipelines across 500+ properties.",
    why_it_matters:
      "This was the forcing function. Once ingestion was automated, every downstream system — warehouse, semantic layer, reporting — could be built on reliable data.",
    how_it_works:
      "Azure Logic Apps file watchers detect incoming partner accounting feeds. PySpark transforms clean, validate, and load into the data lake. SQL validation gates ensure data quality at every stage.",
    capabilities_used: ["python", "databricks", "azure", "sql"],
    metrics: [
      { label: "Manual entry eliminated", value: "160 hrs/month → 30 min" },
      { label: "Properties covered", value: "500+" },
      { label: "Error reduction", value: "Near-zero with validation gates" },
    ],
    curve_value: 107,
  },
  {
    id: "sys-warehouse",
    name: "Real Estate Data Warehouse",
    company: "kayne",
    company_label: "Kayne Anderson",
    date: "2022-06-01",
    description:
      "Unified investment, property, and operational data from 6+ source systems into a governed Databricks lakehouse serving $4B+ AUM.",
    why_it_matters:
      "Transformed reporting from fragmented requests into a trusted operating system. Every number traces back to a single source of truth.",
    how_it_works:
      "Databricks medallion architecture (bronze/silver/gold) with Azure Data Lake storage. DealCloud, MRI, Yardi, and Excel models consolidated into governed tables with full lineage.",
    capabilities_used: ["databricks", "azure", "sql", "python"],
    metrics: [
      { label: "Source systems unified", value: "6+" },
      { label: "AUM governed", value: "$4B+" },
      { label: "DDQ turnaround", value: "↓ 50%" },
    ],
    curve_value: 210,
  },
  {
    id: "sys-semantic-layer",
    name: "Semantic Layer (Power BI / Tabular)",
    company: "kayne",
    company_label: "Kayne Anderson",
    date: "2023-07-01",
    description:
      "Business logic layer translating governed warehouse tables into executive-ready metrics, KPIs, and drill-through reporting across 6 business units.",
    why_it_matters:
      "Eliminated the gap between raw data and business decisions. Analysts and executives query the same governed definitions — no more conflicting numbers.",
    how_it_works:
      "Tabular models on top of Databricks gold tables. Standardized DAX measures for KPIs. Power BI dashboards with fund-to-asset drill-through.",
    capabilities_used: ["power_bi", "sql", "databricks"],
    metrics: [
      { label: "Reporting cycle", value: "↓ 10 days" },
      { label: "Business units served", value: "6" },
      { label: "Ad hoc requests reduced", value: "50%" },
    ],
    curve_value: 268,
  },
  {
    id: "sys-governance-framework",
    name: "SQL-Driven Governance Framework",
    company: "kayne",
    company_label: "Kayne Anderson",
    date: "2023-01-01",
    description:
      "Data quality and governance system ensuring every table, metric, and report traces back to validated source contracts.",
    why_it_matters:
      "Without governance, a data warehouse is just a bigger mess. This framework made the platform trustworthy enough for investor-facing reporting.",
    how_it_works:
      "SQL validation layers at ingestion, transformation, and reporting stages. Automated quality checks with alerting. Data contracts between source systems and consumers.",
    capabilities_used: ["sql", "databricks"],
    metrics: [
      { label: "Validation coverage", value: "100% of investor-facing data" },
      { label: "Data contracts", value: "All major source systems" },
    ],
    curve_value: 240,
  },
  {
    id: "sys-waterfall-engine",
    name: "Waterfall Distribution Engine (Python)",
    company: "kayne",
    company_label: "Kayne Anderson",
    date: "2024-02-01",
    description:
      "Deterministic Python engine replacing fragile Excel waterfall models for LP/GP distribution analysis across fund structures.",
    why_it_matters:
      "Waterfall calculations are the highest-stakes numbers in private equity. Moving them from Excel to software meant reliability, auditability, and speed.",
    how_it_works:
      "Python runtime with reusable allocation logic. Governed investment inputs feed deterministic distribution calculations. Scenario analysis runs in seconds instead of minutes.",
    capabilities_used: ["python", "sql"],
    metrics: [
      { label: "Scenario runtime", value: "5 min → near-instant" },
      { label: "Excel models replaced", value: "1 critical process" },
      { label: "Auditability", value: "Full input-to-output trace" },
    ],
    curve_value: 320,
  },
  {
    id: "sys-gold-layer",
    name: "Governed Gold Layer (Databricks)",
    company: "jll",
    company_label: "JLL",
    date: "2025-06-01",
    description:
      "Enterprise-standard governed data layer in Databricks with Unity Catalog, standardizing methodologies across PDS Americas client accounts.",
    why_it_matters:
      "Scaled the same data architecture principles from one firm to an enterprise with 10+ client accounts — proving the approach is transferable, not bespoke.",
    how_it_works:
      "Databricks Delta Lake with Unity Catalog for governance. Medallion architecture adapted for multi-tenant client delivery. Standardized semantic contracts across accounts.",
    capabilities_used: ["databricks", "sql", "python"],
    metrics: [
      { label: "Client accounts", value: "10+ standardized" },
      { label: "Methodology", value: "Enterprise-wide" },
    ],
    curve_value: 400,
  },
  {
    id: "sys-ai-platform",
    name: "AI Analytics Platform (Genie + OpenAI)",
    company: "jll",
    company_label: "JLL",
    date: "2025-09-01",
    description:
      "Conversational analytics layer enabling business users to query governed project and financial data directly, shifting from analyst-driven to system-driven insights.",
    why_it_matters:
      "The final shift: from building systems that analysts use, to building systems that replace the analyst workflow entirely. Business users get answers, not reports.",
    how_it_works:
      "Databricks Genie for natural language querying of governed tables. OpenAI orchestration for complex multi-step analysis. Semantic models as the query foundation.",
    capabilities_used: ["openai", "databricks", "python", "sql"],
    metrics: [
      { label: "Query model", value: "Conversational, self-serve" },
      { label: "Pipeline shift", value: "Analyst → system-driven" },
      { label: "Stakeholders served", value: "25+" },
    ],
    curve_value: 490,
  },
];

export const SYSTEM_MAP = new Map(SYSTEMS.map((s) => [s.id, s]));

// ---------------------------------------------------------------------------
// Cumulative curve data — pre-computed growth curve
// ---------------------------------------------------------------------------

export interface CurvePoint {
  date: string;
  ts: number;
  value: number;
  company: CompanyId | null;
  event_id: string | null;
}

// ---------------------------------------------------------------------------
// Stacked capability chart data — per-skill layer points
// ---------------------------------------------------------------------------

export interface StackedPoint {
  ts: number;
  date: string;
  company: CompanyId | null;
  event_id: string | null;
  /** One key per capability id — value = capability depth at this point (0..100) */
  [capabilityId: string]: number | string | CompanyId | null;
}

/**
 * Anchor definitions per skill: { ts, value } pairs.
 * Values represent relative depth of that skill at that date (0–100 scale).
 * Skills accumulate — once learned, they don't drop to zero.
 */
const SKILL_ANCHORS: Record<string, Array<{ date: string; value: number }>> = {
  sql: [
    { date: "2014-08-01", value: 5 },
    { date: "2015-06-01", value: 18 },
    { date: "2016-06-01", value: 32 },
    { date: "2017-03-01", value: 42 },
    { date: "2018-01-31", value: 50 },
    { date: "2019-06-01", value: 62 },
    { date: "2021-06-01", value: 74 },
    { date: "2023-01-01", value: 84 },
    { date: "2025-04-01", value: 88 },
    { date: "2026-04-01", value: 92 },
  ],
  tableau: [
    { date: "2014-08-01", value: 4 },
    { date: "2015-06-01", value: 14 },
    { date: "2016-06-01", value: 24 },
    { date: "2017-03-01", value: 32 },
    { date: "2018-01-31", value: 36 },
    { date: "2019-06-01", value: 36 }, // holds — no longer primary
    { date: "2026-04-01", value: 36 },
  ],
  python: [
    { date: "2014-08-01", value: 0 },
    { date: "2018-02-01", value: 4 },
    { date: "2019-06-01", value: 16 },
    { date: "2020-06-01", value: 30 },
    { date: "2022-06-01", value: 46 },
    { date: "2024-02-01", value: 64 },
    { date: "2025-04-01", value: 70 },
    { date: "2026-04-01", value: 78 },
  ],
  azure: [
    { date: "2014-08-01", value: 0 },
    { date: "2018-02-01", value: 4 },
    { date: "2019-06-01", value: 18 },
    { date: "2021-06-01", value: 32 },
    { date: "2023-07-01", value: 44 },
    { date: "2025-03-31", value: 48 },
    { date: "2026-04-01", value: 48 }, // holds — primary at Kayne
  ],
  databricks: [
    { date: "2014-08-01", value: 0 },
    { date: "2019-06-01", value: 8 },
    { date: "2020-06-01", value: 22 },
    { date: "2021-06-01", value: 38 },
    { date: "2022-06-01", value: 54 },
    { date: "2023-07-01", value: 66 },
    { date: "2024-02-01", value: 74 },
    { date: "2025-06-01", value: 84 },
    { date: "2026-04-01", value: 90 },
  ],
  power_bi: [
    { date: "2014-08-01", value: 0 },
    { date: "2019-06-01", value: 6 },
    { date: "2020-06-01", value: 18 },
    { date: "2022-06-01", value: 32 },
    { date: "2023-07-01", value: 46 },
    { date: "2025-03-31", value: 52 },
    { date: "2026-04-01", value: 52 }, // holds
  ],
  openai: [
    { date: "2014-08-01", value: 0 },
    { date: "2024-10-01", value: 0 },
    { date: "2025-04-01", value: 8 },
    { date: "2025-09-01", value: 28 },
    { date: "2026-04-01", value: 46 },
  ],
};

/** Build stacked area chart data — one row per month, one key per skill. */
export function buildStackedCurveData(): StackedPoint[] {
  const startDate = new Date("2014-08-01T00:00:00Z");
  const endDate = new Date("2026-04-01T00:00:00Z");
  const cursor = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), 1));
  const events = TIMELINE_EVENTS;
  const points: StackedPoint[] = [];

  while (cursor <= endDate) {
    const ts = cursor.getTime();
    const dateStr = cursor.toISOString().slice(0, 10);

    let company: CompanyId | null = null;
    let eventId: string | null = null;
    for (const event of events) {
      const start = new Date(`${event.start_date}T00:00:00Z`).getTime();
      const end = event.end_date
        ? new Date(`${event.end_date}T00:00:00Z`).getTime()
        : new Date("2026-12-31T00:00:00Z").getTime();
      if (ts >= start && ts <= end) {
        company = event.company;
        eventId = event.id;
        break;
      }
    }

    const point: StackedPoint = { ts, date: dateStr, company, event_id: eventId };
    for (const [capId, anchors] of Object.entries(SKILL_ANCHORS)) {
      point[capId] = interpolate(ts, anchors);
    }
    points.push(point);
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }

  return points;
}

/**
 * Build the cumulative capability curve from anchor points.
 * Returns monthly data points with interpolated values.
 */
export function buildCurveData(): CurvePoint[] {
  // Anchor points — hand-tuned to produce a compounding (convex) shape
  const anchors: Array<{ date: string; value: number }> = [
    { date: "2014-08-01", value: 10 },
    { date: "2015-06-01", value: 24 },
    { date: "2016-06-01", value: 40 },
    { date: "2017-03-01", value: 48 },  // BI service line milestone
    { date: "2018-01-31", value: 58 },  // end JLL phase 1
    { date: "2018-02-01", value: 60 },  // start Kayne
    { date: "2019-06-01", value: 107 }, // ingestion automation
    { date: "2020-06-01", value: 147 },
    { date: "2021-06-01", value: 185 },
    { date: "2022-06-01", value: 210 }, // warehouse
    { date: "2023-01-01", value: 240 }, // governance framework
    { date: "2023-07-01", value: 268 }, // semantic layer
    { date: "2024-02-01", value: 320 }, // waterfall engine
    { date: "2024-10-01", value: 345 },
    { date: "2025-03-31", value: 370 }, // end Kayne
    { date: "2025-04-01", value: 375 }, // return to JLL
    { date: "2025-06-01", value: 400 }, // gold layer
    { date: "2025-09-01", value: 490 }, // AI platform
    { date: "2026-01-01", value: 530 },
    { date: "2026-04-01", value: 560 },
  ];

  const events = TIMELINE_EVENTS;
  const points: CurvePoint[] = [];

  // Generate monthly points
  const startDate = new Date("2014-08-01T00:00:00Z");
  const endDate = new Date("2026-04-01T00:00:00Z");
  const cursor = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), 1));

  while (cursor <= endDate) {
    const ts = cursor.getTime();
    const dateStr = cursor.toISOString().slice(0, 10);

    // Interpolate value from anchors
    const value = interpolate(ts, anchors);

    // Find which company phase this date falls in
    let company: CompanyId | null = null;
    let eventId: string | null = null;
    for (const event of events) {
      const start = new Date(`${event.start_date}T00:00:00Z`).getTime();
      const end = event.end_date
        ? new Date(`${event.end_date}T00:00:00Z`).getTime()
        : new Date("2026-12-31T00:00:00Z").getTime();
      if (ts >= start && ts <= end) {
        company = event.company;
        eventId = event.id;
        break;
      }
    }

    points.push({ date: dateStr, ts, value, company, event_id: eventId });
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }

  return points;
}

function interpolate(
  ts: number,
  anchors: Array<{ date: string; value: number }>,
): number {
  if (anchors.length === 0) return 0;
  const first = new Date(`${anchors[0].date}T00:00:00Z`).getTime();
  if (ts <= first) return anchors[0].value;
  const last = new Date(`${anchors[anchors.length - 1].date}T00:00:00Z`).getTime();
  if (ts >= last) return anchors[anchors.length - 1].value;

  for (let i = 0; i < anchors.length - 1; i++) {
    const a = new Date(`${anchors[i].date}T00:00:00Z`).getTime();
    const b = new Date(`${anchors[i + 1].date}T00:00:00Z`).getTime();
    if (ts >= a && ts <= b) {
      const ratio = b === a ? 1 : (ts - a) / (b - a);
      return anchors[i].value + ratio * (anchors[i + 1].value - anchors[i].value);
    }
  }
  return anchors[anchors.length - 1].value;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Check if a capability is active at a given timestamp */
export function isCapabilityActiveAt(capability: Capability, ts: number): boolean {
  return capability.active_ranges.some((range) => {
    const start = new Date(`${range.start}T00:00:00Z`).getTime();
    const end = new Date(`${range.end}T00:00:00Z`).getTime();
    return ts >= start && ts <= end;
  });
}

/** Get all systems for a given event */
export function getSystemsForEvent(eventId: string): System[] {
  const event = EVENT_MAP.get(eventId);
  if (!event) return [];
  return event.systems_built.map((sid) => SYSTEM_MAP.get(sid)).filter(Boolean) as System[];
}

/** Get all systems that use a given capability */
export function getSystemsForCapability(capabilityId: string): System[] {
  return SYSTEMS.filter((s) => s.capabilities_used.includes(capabilityId));
}

/** Get the event that contains a given system */
export function getEventForSystem(systemId: string): TimelineEvent | null {
  return TIMELINE_EVENTS.find((e) => e.systems_built.includes(systemId)) ?? null;
}

/** Get events where a capability was used */
export function getEventsForCapability(capabilityId: string): TimelineEvent[] {
  return TIMELINE_EVENTS.filter((e) => e.capabilities_used.includes(capabilityId));
}
