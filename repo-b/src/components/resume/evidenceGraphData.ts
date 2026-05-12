/**
 * Evidence Graph dataset and KPI scoring math.
 *
 * Honesty rules enforced by data review (and the verification grep step):
 *   - Production status → relatedExperience must be Kayne Anderson and/or JLL PDS, never Novendor/Winston
 *   - Winston status → relatedExperience must be Novendor/Winston, never Kayne/JLL
 *   - Prototype/Advisory/Gap → relatedExperience is "—" or scoped accurately
 */

export type EvidenceStatus = "Production" | "Winston" | "Prototype" | "Advisory" | "Gap";

export type RoleTarget =
  | "REPE-DataPlatform"
  | "AI-Engineering"
  | "Data-Engineering"
  | "Finance-Analytics"
  | "BI-Leadership";

export type Domain =
  | "RealEstatePE"
  | "Finance"
  | "AI"
  | "DataEngineering"
  | "BI"
  | "DevOps"
  | "Governance";

export type Confidence = 1 | 2 | 3 | 4 | 5;

export type OperationalControls = {
  governance?: boolean;
  observability?: boolean;
  cicd?: boolean;
  authSecurity?: boolean;
  evalCoverage?: boolean;
  multiTenancy?: boolean;
  auditability?: boolean;
};

export type Capability = {
  id: string;
  capability: string;
  whyItMatters: string;
  evidenceSource: string;
  status: EvidenceStatus;
  relatedExperience: string;
  winstonSurface: string | null;
  confidence: Confidence;
  interviewTalkingPoint: string;
  gapNextAction: string | null;
  domain: Domain[];
  roleTargets: RoleTarget[];
  linkedSystemId?: string;
  linkedSkillIds?: string[];
  operationalControls?: OperationalControls;
  lastTouched?: string;
  demoable?: boolean;
};

export type GapItem = {
  id: string;
  capability: string;
  currentLevel: string;
  plannedWinstonImpl: string;
  proofArtifactNeeded: string;
  status: "Planned" | "In Progress" | "Blocked";
};

export type ProofArtifact = {
  id: string;
  title: string;
  summary: string;
  linkedSystemId?: string;
  status: EvidenceStatus;
  href?: string;
};

export const ROLE_TARGET_LABELS: Record<RoleTarget, string> = {
  "REPE-DataPlatform": "REPE Data Platform",
  "AI-Engineering": "AI Engineering",
  "Data-Engineering": "Data Engineering",
  "Finance-Analytics": "Finance Analytics",
  "BI-Leadership": "BI Leadership",
};

export const DOMAIN_LABELS: Record<Domain, string> = {
  RealEstatePE: "Real Estate PE",
  Finance: "Finance",
  AI: "AI",
  DataEngineering: "Data Engineering",
  BI: "BI",
  DevOps: "DevOps",
  Governance: "Governance",
};

export const STATUS_LABELS: Record<EvidenceStatus, string> = {
  Production: "Production",
  Winston: "Winston",
  Prototype: "Prototype",
  Advisory: "Advisory",
  Gap: "Gap",
};

// ---------------------------------------------------------------------------
// Capability dataset
// ---------------------------------------------------------------------------

export const CAPABILITIES: Capability[] = [
  {
    id: "cap-repe-data-modeling",
    capability: "Real estate private equity data modeling",
    whyItMatters: "Fund-level analytics depend on a model that ties properties, deals, partners, and capital events into one queryable shape.",
    evidenceSource: "Databricks medallion lakehouse modeling DealCloud + MRI + Yardi entities across $4B+ AUM",
    status: "Production",
    relatedExperience: "Kayne Anderson",
    winstonSurface: "REPE lab environment (sanitized schema)",
    confidence: 5,
    interviewTalkingPoint: "I modeled the canonical REPE entity graph at Kayne — funds, partners, properties, capital events, distributions — and made it queryable for IR and deal teams.",
    gapNextAction: null,
    domain: ["RealEstatePE", "DataEngineering"],
    roleTargets: ["REPE-DataPlatform", "Data-Engineering", "Finance-Analytics"],
    linkedSystemId: "sys-warehouse",
    operationalControls: { governance: true, auditability: true, observability: true },
    lastTouched: "2025-06",
    demoable: true,
  },
  {
    id: "cap-yardi-mri-dealcloud",
    capability: "Yardi / MRI / DealCloud integration",
    whyItMatters: "These are the three systems of record across REPE; integrating them is the difference between manual reporting and governed analytics.",
    evidenceSource: "Azure Logic Apps + PySpark ingestion pipelines across 500+ properties at Kayne Anderson",
    status: "Production",
    relatedExperience: "Kayne Anderson",
    winstonSurface: "—",
    confidence: 5,
    interviewTalkingPoint: "I built and operated the ingestion path from DealCloud, MRI, and Yardi into a governed lakehouse — including validation gates, error reconciliation, and downstream contract enforcement.",
    gapNextAction: null,
    domain: ["RealEstatePE", "DataEngineering"],
    roleTargets: ["REPE-DataPlatform", "Data-Engineering"],
    linkedSystemId: "sys-ingestion-automation",
    operationalControls: { governance: true, observability: true, cicd: true, auditability: true },
    lastTouched: "2025-03",
  },
  {
    id: "cap-databricks-medallion",
    capability: "Databricks medallion architecture",
    whyItMatters: "Bronze/silver/gold is the standard for governed, reproducible analytics on a lakehouse.",
    evidenceSource: "Production medallion lakehouse at Kayne Anderson; gold layer powers DDQ + investor reporting",
    status: "Production",
    relatedExperience: "Kayne Anderson",
    winstonSurface: "historyrhymes Databricks notebooks (research)",
    confidence: 5,
    interviewTalkingPoint: "I designed the bronze/silver/gold layout, the Unity Catalog governance model, and the gold-table contracts that the semantic layer reads from.",
    gapNextAction: null,
    domain: ["DataEngineering"],
    roleTargets: ["Data-Engineering", "REPE-DataPlatform"],
    linkedSystemId: "sys-warehouse",
    linkedSkillIds: ["databricks", "pyspark"],
    operationalControls: { governance: true, observability: true, auditability: true },
    lastTouched: "2025-04",
    demoable: true,
  },
  {
    id: "cap-pyspark-etl",
    capability: "PySpark ETL",
    whyItMatters: "Distributed transforms at AUM scale require Spark fluency, not just SQL.",
    evidenceSource: "Bronze-to-silver and silver-to-gold transforms across 500+ property feeds at Kayne Anderson",
    status: "Production",
    relatedExperience: "Kayne Anderson",
    winstonSurface: "—",
    confidence: 5,
    interviewTalkingPoint: "I wrote the PySpark transforms that turn raw source-system extracts into governed gold tables, including window functions, watermarks, and reconciliation joins.",
    gapNextAction: null,
    domain: ["DataEngineering"],
    roleTargets: ["Data-Engineering", "REPE-DataPlatform"],
    linkedSkillIds: ["pyspark"],
    operationalControls: { observability: true, cicd: true, evalCoverage: true },
    lastTouched: "2025-04",
  },
  {
    id: "cap-azure-data-lake",
    capability: "Azure Data Lake",
    whyItMatters: "Storage tier underneath the lakehouse — affects cost, security, and lineage.",
    evidenceSource: "ADLS Gen2 storage backing the Kayne lakehouse; tenant-isolated containers",
    status: "Production",
    relatedExperience: "Kayne Anderson",
    winstonSurface: "—",
    confidence: 4,
    interviewTalkingPoint: "I owned the ADLS layout — containers, paths, access controls, and the lifecycle policies that kept storage cost in check.",
    gapNextAction: null,
    domain: ["DataEngineering", "DevOps"],
    roleTargets: ["Data-Engineering", "REPE-DataPlatform"],
    operationalControls: { governance: true, authSecurity: true },
    lastTouched: "2025-02",
  },
  {
    id: "cap-power-bi-semantic",
    capability: "Power BI semantic modeling",
    whyItMatters: "A shared semantic layer is what turns ad-hoc reports into a governed reporting platform.",
    evidenceSource: "Tabular semantic layer at Kayne Anderson serving 6 business units; 10-day reporting acceleration",
    status: "Production",
    relatedExperience: "Kayne Anderson, JLL PDS",
    winstonSurface: "—",
    confidence: 5,
    interviewTalkingPoint: "I built the Tabular semantic layer that consolidated fund, deal, and property reporting onto one model — cut quarterly close reporting time in half.",
    gapNextAction: null,
    domain: ["BI"],
    roleTargets: ["BI-Leadership", "Finance-Analytics"],
    linkedSystemId: "sys-semantic-layer",
    linkedSkillIds: ["power_bi", "tabular_editor"],
    operationalControls: { governance: true, authSecurity: true, auditability: true },
    lastTouched: "2025-05",
    demoable: true,
  },
  {
    id: "cap-tabular-dax-rls",
    capability: "Tabular Editor / DAX / RLS",
    whyItMatters: "Row-level security and DAX measures are how you ship a multi-tenant BI layer that finance and IR will trust.",
    evidenceSource: "Tabular Editor-managed model at Kayne with DAX measures and RLS enforced by AAD groups",
    status: "Production",
    relatedExperience: "Kayne Anderson",
    winstonSurface: "—",
    confidence: 5,
    interviewTalkingPoint: "I wrote the DAX library, version-controlled the model in Tabular Editor, and enforced RLS so each business unit only sees its own slice.",
    gapNextAction: null,
    domain: ["BI", "Governance"],
    roleTargets: ["BI-Leadership"],
    linkedSkillIds: ["tabular_editor"],
    operationalControls: { governance: true, authSecurity: true, auditability: true, cicd: true },
    lastTouched: "2025-04",
  },
  {
    id: "cap-fund-investor-reporting",
    capability: "Fund and investor reporting",
    whyItMatters: "If IR can't pull the numbers in a week, the AUM machine slows down.",
    evidenceSource: "DDQ workflow cut 50% at Kayne via governed gold tables + Power BI reports",
    status: "Production",
    relatedExperience: "Kayne Anderson",
    winstonSurface: "—",
    confidence: 5,
    interviewTalkingPoint: "I rebuilt the fund and investor reporting layer so IR could answer DDQs in days instead of weeks, with full lineage back to source.",
    gapNextAction: null,
    domain: ["RealEstatePE", "Finance", "BI"],
    roleTargets: ["BI-Leadership", "Finance-Analytics", "REPE-DataPlatform"],
    operationalControls: { governance: true, auditability: true },
    lastTouched: "2025-04",
    demoable: true,
  },
  {
    id: "cap-waterfall-scenario",
    capability: "Distribution waterfall / scenario modeling",
    whyItMatters: "Waterfall math drives LP/GP economics; getting it deterministic and auditable is non-trivial.",
    evidenceSource: "Deterministic waterfall engine replacing Excel at Kayne — near-instant scenario runtime",
    status: "Production",
    relatedExperience: "Kayne Anderson",
    winstonSurface: "Investment engine module (Novendor)",
    confidence: 4,
    interviewTalkingPoint: "I replaced the Excel waterfall with a deterministic Python engine — LP/GP splits, hurdles, catch-up, carry — with snapshotting so a number can always be reconstructed.",
    gapNextAction: null,
    domain: ["RealEstatePE", "Finance"],
    roleTargets: ["REPE-DataPlatform", "Finance-Analytics"],
    linkedSystemId: "sys-waterfall-engine",
    operationalControls: { auditability: true, evalCoverage: true },
    lastTouched: "2025-03",
    demoable: true,
  },
  {
    id: "cap-portfolio-analytics",
    capability: "Portfolio analytics",
    whyItMatters: "NOI, IRR, TVPI, MOIC — the metrics CFOs and IC chairs ask about daily.",
    evidenceSource: "Gold tables powering portfolio-level KPIs across $4B+ AUM at Kayne",
    status: "Production",
    relatedExperience: "Kayne Anderson",
    winstonSurface: "REPE lab environment",
    confidence: 4,
    interviewTalkingPoint: "I built the portfolio analytics layer that surfaces NOI, IRR, TVPI, and concentration metrics — and the lineage so anyone can drill back to the property and deal.",
    gapNextAction: null,
    domain: ["RealEstatePE", "Finance"],
    roleTargets: ["REPE-DataPlatform", "Finance-Analytics"],
    operationalControls: { governance: true, auditability: true },
    lastTouched: "2025-04",
    demoable: true,
  },
  {
    id: "cap-data-quality-reconciliation",
    capability: "Data quality and reconciliation",
    whyItMatters: "Garbage-in is the single biggest risk to investor-facing reporting.",
    evidenceSource: "SQL validation gates and reconciliation jobs at every ingestion stage at Kayne",
    status: "Production",
    relatedExperience: "Kayne Anderson",
    winstonSurface: "Reconciliation engine (investment engine module)",
    confidence: 5,
    interviewTalkingPoint: "I built the validation-gate pattern that catches break conditions before they reach the gold layer, plus the reconciliation runs that hold source systems to the same number.",
    gapNextAction: null,
    domain: ["DataEngineering", "Governance"],
    roleTargets: ["Data-Engineering", "REPE-DataPlatform"],
    operationalControls: { governance: true, observability: true, evalCoverage: true, auditability: true },
    lastTouched: "2025-03",
  },
  {
    id: "cap-ai-assisted-analytics",
    capability: "AI-assisted analytics",
    whyItMatters: "LLM-driven Q&A over governed data is the next layer above BI — but only useful if it's grounded.",
    evidenceSource: "Winston AI gateway + assistant blocks; routed answers cite source rows",
    status: "Winston",
    relatedExperience: "Novendor / Winston platform",
    winstonSurface: "Winston chat workspace, dashboard composition",
    confidence: 4,
    interviewTalkingPoint: "I built the AI-assisted analytics surface in Winston — query, chart, and table responses grounded in real tenant data with provenance.",
    gapNextAction: "Public sanitized demo with documented eval results and retrieval-quality metrics.",
    domain: ["AI", "BI"],
    roleTargets: ["AI-Engineering", "BI-Leadership"],
    linkedSystemId: "sys-ai-platform",
    operationalControls: { governance: true, authSecurity: true, multiTenancy: true, auditability: true },
    lastTouched: "2026-05",
    demoable: true,
  },
  {
    id: "cap-rag",
    capability: "RAG architecture",
    whyItMatters: "Retrieval-grounded generation is the standard for enterprise LLM features; the architectural choices are what separate a toy from a system.",
    evidenceSource: "Winston AI gateway and retrieval workflows (Novendor internal platform)",
    status: "Winston",
    relatedExperience: "Novendor / Winston platform",
    winstonSurface: "Winston AI gateway, credit decisioning walled garden",
    confidence: 4,
    interviewTalkingPoint: "I built and tested retrieval-grounded AI workflows in Winston. I can explain the architecture, the constraints, and what would need to change for enterprise production — it is not yet deployed in a Fortune 500 production setting.",
    gapNextAction: "Add public demo with sanitized corpus, eval results, and retrieval-quality metrics.",
    domain: ["AI"],
    roleTargets: ["AI-Engineering"],
    linkedSystemId: "sys-ai-platform",
    operationalControls: { governance: true, authSecurity: true, evalCoverage: false, auditability: true },
    lastTouched: "2026-05",
    demoable: true,
  },
  {
    id: "cap-retrieval-grounding",
    capability: "Retrieval grounding and citations",
    whyItMatters: "Citations are the difference between a recruiter demo and a finance-team-trusted answer.",
    evidenceSource: "Winston assistant blocks emit per-answer source rows and snapshot ids",
    status: "Winston",
    relatedExperience: "Novendor / Winston platform",
    winstonSurface: "Winston chat workspace, REPE authoritative state",
    confidence: 4,
    interviewTalkingPoint: "Every answer Winston gives carries the row-level provenance and the snapshot id it was computed against — so a CFO can audit the response.",
    gapNextAction: "Formalize citation evaluation with a golden-set harness.",
    domain: ["AI", "Governance"],
    roleTargets: ["AI-Engineering"],
    operationalControls: { governance: true, auditability: true, evalCoverage: false },
    lastTouched: "2026-04",
    demoable: true,
  },
  {
    id: "cap-structured-llm-outputs",
    capability: "Structured LLM outputs",
    whyItMatters: "JSON-typed responses are the only way to ship LLM features into existing systems without glue code.",
    evidenceSource: "Winston tool-use registry with JSONSchema-typed inputs and outputs",
    status: "Winston",
    relatedExperience: "Novendor / Winston platform",
    winstonSurface: "Winston MCP registry, dashboard composition",
    confidence: 4,
    interviewTalkingPoint: "Winston's tool layer constrains LLM outputs to typed schemas so downstream code doesn't have to parse free text.",
    gapNextAction: null,
    domain: ["AI"],
    roleTargets: ["AI-Engineering"],
    operationalControls: { evalCoverage: true, auditability: true },
    lastTouched: "2026-05",
  },
  {
    id: "cap-fastapi",
    capability: "FastAPI backend services",
    whyItMatters: "Python-first APIs are the standard for AI-adjacent backends.",
    evidenceSource: "Winston backend (60+ FastAPI services in Novendor)",
    status: "Winston",
    relatedExperience: "Novendor / Winston platform",
    winstonSurface: "Winston backend services",
    confidence: 4,
    interviewTalkingPoint: "I wrote the FastAPI service layer that fronts the Winston platform — auth, MCP, AI gateway, REPE reads, accounting writes.",
    gapNextAction: null,
    domain: ["AI", "DataEngineering"],
    roleTargets: ["AI-Engineering", "Data-Engineering"],
    operationalControls: { authSecurity: true, multiTenancy: true, observability: true, cicd: true },
    lastTouched: "2026-05",
  },
  {
    id: "cap-react-next",
    capability: "React / Next.js frontend delivery",
    whyItMatters: "Modern AI products need a real frontend — not just a notebook.",
    evidenceSource: "Winston shared Next.js app (repo-b) with 250+ pages",
    status: "Winston",
    relatedExperience: "Novendor / Winston platform",
    winstonSurface: "Winston web app",
    confidence: 4,
    interviewTalkingPoint: "I shipped the Next.js frontend for Winston — App Router, server components, the chat workspace, the lab environment shell.",
    gapNextAction: null,
    domain: ["AI"],
    roleTargets: ["AI-Engineering"],
    operationalControls: { cicd: true, authSecurity: true },
    lastTouched: "2026-05",
  },
  {
    id: "cap-cicd",
    capability: "CI/CD pipelines",
    whyItMatters: "Without a deploy pipeline you can't ship reliably.",
    evidenceSource: "GitHub Actions on Winston repos; Vercel + Railway deploy automation",
    status: "Winston",
    relatedExperience: "Novendor / Winston platform",
    winstonSurface: "Novendor deploy pipeline",
    confidence: 4,
    interviewTalkingPoint: "I wired the CI/CD path on Winston — GitHub Actions, Vercel for the web app, Railway for the backend, with pre-merge gates.",
    gapNextAction: null,
    domain: ["DevOps"],
    roleTargets: ["AI-Engineering", "Data-Engineering"],
    operationalControls: { cicd: true, observability: true, evalCoverage: true },
    lastTouched: "2026-05",
  },
  {
    id: "cap-github-actions",
    capability: "GitHub Actions",
    whyItMatters: "The default CI tool for most modern stacks.",
    evidenceSource: "Active workflows across Winston/Novendor repositories",
    status: "Winston",
    relatedExperience: "Novendor / Winston platform",
    winstonSurface: "—",
    confidence: 4,
    interviewTalkingPoint: "I run the GitHub Actions workflows for lint, type-check, test, and deploy across the Winston stack.",
    gapNextAction: null,
    domain: ["DevOps"],
    roleTargets: ["AI-Engineering", "Data-Engineering"],
    operationalControls: { cicd: true, evalCoverage: true },
    lastTouched: "2026-05",
  },
  {
    id: "cap-azure-devops",
    capability: "Azure DevOps",
    whyItMatters: "The deploy and PR tool of choice in enterprise Azure shops.",
    evidenceSource: "Pipelines for Databricks notebook deploys and BI publish at Kayne Anderson",
    status: "Production",
    relatedExperience: "Kayne Anderson",
    winstonSurface: "—",
    confidence: 4,
    interviewTalkingPoint: "I owned the Azure DevOps pipelines that pushed Databricks notebooks and Power BI artifacts into prod at Kayne.",
    gapNextAction: null,
    domain: ["DevOps"],
    roleTargets: ["Data-Engineering"],
    operationalControls: { cicd: true },
    lastTouched: "2025-02",
  },
  {
    id: "cap-jira-delivery",
    capability: "Jira-to-delivery workflow automation",
    whyItMatters: "Closing the loop from ticket to deployed change is where AI-assisted engineering actually compounds.",
    evidenceSource: "Winston orchestration scripts that take a Jira-style task and produce a deployed change",
    status: "Prototype",
    relatedExperience: "Novendor / Winston (internal)",
    winstonSurface: "Winston orchestration",
    confidence: 3,
    interviewTalkingPoint: "I have a working ticket-to-deploy loop in Winston — same-day to multi-day prototype cadence. Not yet hardened for an enterprise change-management process.",
    gapNextAction: "Add approvals, audit trail, and rollback hooks before calling this enterprise-ready.",
    domain: ["DevOps", "AI"],
    roleTargets: ["AI-Engineering"],
    operationalControls: { cicd: true, auditability: false },
    lastTouched: "2026-04",
    demoable: true,
  },
  {
    id: "cap-multi-tenant-arch",
    capability: "Multi-tenant application architecture",
    whyItMatters: "Any SaaS-shaped AI product needs tenant isolation from day one.",
    evidenceSource: "Winston environment / env_id model; Supabase RLS-enforced tenancy",
    status: "Winston",
    relatedExperience: "Novendor / Winston platform",
    winstonSurface: "Winston lab environments, REPE workspaces",
    confidence: 4,
    interviewTalkingPoint: "Winston is multi-tenant by design — env_id partitioning, Supabase RLS policies, scoped MCP tool registries. Kayne was single-tenant internal, so this is Winston-only.",
    gapNextAction: null,
    domain: ["AI", "Governance"],
    roleTargets: ["AI-Engineering"],
    operationalControls: { multiTenancy: true, authSecurity: true, auditability: true },
    lastTouched: "2026-05",
  },
  {
    id: "cap-supabase-postgres-rls",
    capability: "Supabase / Postgres / RLS",
    whyItMatters: "Row-level security is the cheapest way to enforce multi-tenant isolation in Postgres.",
    evidenceSource: "Winston schema with env_id-scoped RLS policies across 270+ migrations",
    status: "Winston",
    relatedExperience: "Novendor / Winston platform",
    winstonSurface: "Winston Supabase project",
    confidence: 4,
    interviewTalkingPoint: "Every tenant-scoped table in Winston has an RLS policy keyed on env_id; the policy is enforced by Supabase regardless of the calling client.",
    gapNextAction: null,
    domain: ["DataEngineering", "Governance"],
    roleTargets: ["AI-Engineering", "Data-Engineering"],
    operationalControls: { authSecurity: true, multiTenancy: true, governance: true },
    lastTouched: "2026-05",
  },
  {
    id: "cap-mcp-tool-registry",
    capability: "MCP / tool registry concepts",
    whyItMatters: "Typed tool registries are how LLMs become useful in real backends.",
    evidenceSource: "Winston MCP registry (80+ tools) with audit, permissions, and JSONSchema contracts",
    status: "Winston",
    relatedExperience: "Novendor / Winston platform",
    winstonSurface: "Winston MCP registry",
    confidence: 4,
    interviewTalkingPoint: "I built the Winston MCP registry — typed tool schemas, scoped permissions, audit hooks, and the planner / tool-context contract.",
    gapNextAction: null,
    domain: ["AI"],
    roleTargets: ["AI-Engineering"],
    operationalControls: { authSecurity: true, auditability: true, evalCoverage: true },
    lastTouched: "2026-05",
    demoable: true,
  },
  {
    id: "cap-ai-governance",
    capability: "AI governance and auditability",
    whyItMatters: "Finance and REPE buyers will not deploy LLM features they can't audit.",
    evidenceSource: "Winston audit trail on every MCP write; snapshot-locked authoritative state for REPE reads",
    status: "Winston",
    relatedExperience: "Novendor / Winston platform",
    winstonSurface: "REPE authoritative-state contract, MCP audit surface",
    confidence: 4,
    interviewTalkingPoint: "Winston enforces a snapshot-locked authoritative state for released REPE periods and audits every MCP write. That's the governance pattern I'd carry into an enterprise rollout.",
    gapNextAction: "Surface a customer-facing audit dashboard.",
    domain: ["AI", "Governance"],
    roleTargets: ["AI-Engineering", "BI-Leadership"],
    operationalControls: { governance: true, auditability: true, authSecurity: true },
    lastTouched: "2026-05",
  },
  {
    id: "cap-microsoft-fabric",
    capability: "Microsoft Fabric",
    whyItMatters: "Microsoft is positioning Fabric as the successor to the Synapse + Power BI stack — a real gap if you target enterprise Azure shops.",
    evidenceSource: "—",
    status: "Gap",
    relatedExperience: "—",
    winstonSurface: null,
    confidence: 2,
    interviewTalkingPoint: "I have not built on Fabric. My medallion + Tabular experience translates directly, but I'm honest that I haven't shipped on the platform.",
    gapNextAction: "Stand up a Fabric workspace, port one Winston dataset, document the gap delta versus Databricks.",
    domain: ["DataEngineering", "BI"],
    roleTargets: ["Data-Engineering", "BI-Leadership"],
    lastTouched: undefined,
  },
  {
    id: "cap-cosmos-vector",
    capability: "Cosmos DB / vector search",
    whyItMatters: "Vector search on Cosmos is one of the standard Azure-native AI patterns.",
    evidenceSource: "—",
    status: "Gap",
    relatedExperience: "—",
    winstonSurface: null,
    confidence: 2,
    interviewTalkingPoint: "I've used pgvector in Winston, not Cosmos DB. I can explain the trade-offs but haven't shipped Cosmos.",
    gapNextAction: "Build a Cosmos-backed RAG variant of the Winston knowledge tool and publish the comparison.",
    domain: ["AI", "DataEngineering"],
    roleTargets: ["AI-Engineering"],
  },
  {
    id: "cap-graph-data-modeling",
    capability: "Graph data modeling",
    whyItMatters: "Entity relationships in REPE and credit are natively graph-shaped.",
    evidenceSource: "—",
    status: "Gap",
    relatedExperience: "—",
    winstonSurface: null,
    confidence: 2,
    interviewTalkingPoint: "I've modeled relational graphs in Postgres but haven't shipped a real graph DB. I'd reach for it for ownership-graph or counterparty-network problems.",
    gapNextAction: "Prototype a graph layer over Winston entities; document the queries that get easier.",
    domain: ["DataEngineering", "AI"],
    roleTargets: ["AI-Engineering", "Data-Engineering"],
  },
];

// ---------------------------------------------------------------------------
// Gap tracker — separate panel below the table
// ---------------------------------------------------------------------------

export const GAP_ITEMS: GapItem[] = [
  {
    id: "gap-fabric",
    capability: "Microsoft Fabric hands-on depth",
    currentLevel: "Conceptual — translated from Databricks + Tabular experience",
    plannedWinstonImpl: "Stand up a Fabric workspace; port one Winston dataset end-to-end",
    proofArtifactNeeded: "Sanitized walkthrough comparing Fabric to the Databricks medallion at Kayne",
    status: "Planned",
  },
  {
    id: "gap-cosmos-vector",
    capability: "Cosmos DB vector workloads",
    currentLevel: "pgvector in Winston; haven't shipped Cosmos",
    plannedWinstonImpl: "Build a Cosmos-backed RAG variant of the Winston knowledge tool",
    proofArtifactNeeded: "Comparison report: latency, recall, cost on the same eval set",
    status: "Planned",
  },
  {
    id: "gap-semantic-kernel-llamaindex",
    capability: "Semantic Kernel / LlamaIndex production experience",
    currentLevel: "Direct OpenAI + custom orchestration in Winston",
    plannedWinstonImpl: "Rebuild one Winston agent path on Semantic Kernel; publish the trade-off notes",
    proofArtifactNeeded: "Side-by-side eval and a written architectural comparison",
    status: "Planned",
  },
  {
    id: "gap-eval-harness",
    capability: "Formal LLM eval harnesses",
    currentLevel: "Ad-hoc smoke tests in Winston",
    plannedWinstonImpl: "Golden-set + LLM-judge harness over the Winston AI gateway, wired into CI",
    proofArtifactNeeded: "Eval dashboard and a public sample report",
    status: "In Progress",
  },
  {
    id: "gap-observability",
    capability: "Enterprise observability dashboards",
    currentLevel: "Vercel + Railway logs; per-call audit on the MCP layer",
    plannedWinstonImpl: "OpenTelemetry tracing across the Winston AI gateway and MCP runtime, fed to a Grafana view",
    proofArtifactNeeded: "Public Grafana board with sanitized Winston traces",
    status: "Planned",
  },
  {
    id: "gap-graph-intelligence",
    capability: "Graph intelligence layer",
    currentLevel: "Relational modeling in Postgres",
    plannedWinstonImpl: "Materialize a property-counterparty graph over the Winston REPE dataset",
    proofArtifactNeeded: "Demo queries that are clearly easier in graph than in SQL",
    status: "Planned",
  },
  {
    id: "gap-azure-openai-patterns",
    capability: "Azure OpenAI deployment patterns",
    currentLevel: "Direct OpenAI in Winston",
    plannedWinstonImpl: "Mirror one Winston AI workflow on Azure OpenAI with private networking and content filters",
    proofArtifactNeeded: "Deployment notes and a written security review",
    status: "Planned",
  },
];

// ---------------------------------------------------------------------------
// Proof artifacts — small cards below the gap tracker
// ---------------------------------------------------------------------------

export const PROOF_ARTIFACTS: ProofArtifact[] = [
  {
    id: "art-repe-analytics-env",
    title: "REPE analytics environment",
    summary: "Sanitized Winston lab environment with fund, property, and capital event schema; queryable analytics layer.",
    linkedSystemId: "sys-warehouse",
    status: "Winston",
  },
  {
    id: "art-nav-recon",
    title: "Fund snapshot / NAV reconciliation demo",
    summary: "Authoritative-state contract: locked snapshots, reconstructable NAV and P&L for any released period.",
    linkedSystemId: "sys-warehouse",
    status: "Winston",
  },
  {
    id: "art-ai-knowledge-platform",
    title: "AI knowledge platform demo",
    summary: "Retrieval-grounded answers over a sanitized corpus, with row-level citations and a typed tool registry.",
    linkedSystemId: "sys-ai-platform",
    status: "Winston",
  },
  {
    id: "art-jira-delivery",
    title: "Jira-to-delivery automation",
    summary: "Working ticket-to-deploy loop. Prototype maturity; needs approvals and audit trail for enterprise change management.",
    status: "Prototype",
  },
  {
    id: "art-accounting-desk",
    title: "Accounting command desk",
    summary: "Receipt intake, subscription ledger, expense drafts. Internal Novendor build; sanitized walkthrough available.",
    status: "Prototype",
  },
  {
    id: "art-crm-pipeline",
    title: "CRM pipeline command center",
    summary: "Pipeline + deal record CRUD over Supabase; integrates with the Winston AI gateway for enrichment.",
    status: "Prototype",
  },
  {
    id: "art-powerbi-semantic",
    title: "Power BI semantic layer story",
    summary: "Walkthrough of the Tabular model that consolidated 6 business units at Kayne — DAX, RLS, lineage.",
    linkedSystemId: "sys-semantic-layer",
    status: "Production",
  },
  {
    id: "art-databricks-medallion",
    title: "Databricks medallion story",
    summary: "Architecture walkthrough of the Kayne lakehouse — bronze/silver/gold, Unity Catalog, gold-table contracts.",
    linkedSystemId: "sys-warehouse",
    status: "Production",
  },
];

// ---------------------------------------------------------------------------
// KPI scoring — pure functions over a filtered Capability[]
// ---------------------------------------------------------------------------

const STATUS_WEIGHT: Record<EvidenceStatus, number> = {
  Production: 1.0,
  Winston: 0.85,
  Prototype: 0.6,
  Advisory: 0.5,
  Gap: 0.2,
};

function rowScore(row: Capability): number {
  const status = STATUS_WEIGHT[row.status];
  const conf = row.confidence / 5;
  const demoBoost = row.demoable ? 1.1 : 1.0;
  return Math.min(1.0, status * conf * demoBoost);
}

export function credibilityScore(rows: Capability[], gaps: GapItem[]): number {
  if (rows.length === 0) return 0;
  const base = rows.reduce((sum, r) => sum + rowScore(r), 0) / rows.length;
  const namedWithPlans = gaps.filter((g) => g.plannedWinstonImpl && g.proofArtifactNeeded).length;
  const bonus = gaps.length > 0 ? 0.1 * Math.min(1, namedWithPlans / gaps.length) : 0;
  return Math.min(5.0, base * 5 + bonus);
}

export type EnterpriseReadiness = {
  ratio: number;
  weakestControl: keyof OperationalControls | null;
};

const CONTROL_KEYS: (keyof OperationalControls)[] = [
  "governance",
  "observability",
  "cicd",
  "authSecurity",
  "evalCoverage",
  "multiTenancy",
  "auditability",
];

const CONTROL_LABELS: Record<keyof OperationalControls, string> = {
  governance: "governance",
  observability: "observability",
  cicd: "CI/CD",
  authSecurity: "auth and security",
  evalCoverage: "eval coverage",
  multiTenancy: "multi-tenancy",
  auditability: "auditability",
};

export function enterpriseReadiness(rows: Capability[]): EnterpriseReadiness {
  const applicable = rows.filter((r) => r.operationalControls && Object.keys(r.operationalControls).length > 0);
  if (applicable.length === 0) return { ratio: 0, weakestControl: null };

  const perRow = applicable.map((r) => {
    const oc = r.operationalControls!;
    const keys = Object.keys(oc) as (keyof OperationalControls)[];
    const trueCount = keys.filter((k) => oc[k] === true).length;
    return trueCount / keys.length;
  });
  const ratio = perRow.reduce((a, b) => a + b, 0) / perRow.length;

  const controlScores: Record<keyof OperationalControls, { applied: number; satisfied: number }> = {
    governance: { applied: 0, satisfied: 0 },
    observability: { applied: 0, satisfied: 0 },
    cicd: { applied: 0, satisfied: 0 },
    authSecurity: { applied: 0, satisfied: 0 },
    evalCoverage: { applied: 0, satisfied: 0 },
    multiTenancy: { applied: 0, satisfied: 0 },
    auditability: { applied: 0, satisfied: 0 },
  };
  for (const r of applicable) {
    const oc = r.operationalControls!;
    for (const k of CONTROL_KEYS) {
      if (oc[k] !== undefined) {
        controlScores[k].applied++;
        if (oc[k] === true) controlScores[k].satisfied++;
      }
    }
  }
  let weakest: keyof OperationalControls | null = null;
  let weakestScore = 2;
  for (const k of CONTROL_KEYS) {
    const s = controlScores[k];
    if (s.applied === 0) continue;
    const cov = s.satisfied / s.applied;
    if (cov < weakestScore) {
      weakestScore = cov;
      weakest = k;
    }
  }
  return { ratio, weakestControl: weakest };
}

export function controlLabel(k: keyof OperationalControls): string {
  return CONTROL_LABELS[k];
}

export type EvidenceMix = Record<EvidenceStatus, number>;

export function evidenceMix(rows: Capability[]): EvidenceMix {
  const mix: EvidenceMix = { Production: 0, Winston: 0, Prototype: 0, Advisory: 0, Gap: 0 };
  for (const r of rows) mix[r.status]++;
  return mix;
}

export function demoableArtifactCount(rows: Capability[], artifacts: ProofArtifact[]): number {
  const seen = new Set<string>();
  let count = 0;
  for (const a of artifacts) {
    count++;
    if (a.linkedSystemId) seen.add(a.linkedSystemId);
  }
  for (const r of rows) {
    if (r.demoable && r.status !== "Gap") {
      const key = r.linkedSystemId ?? r.id;
      if (!seen.has(key)) {
        seen.add(key);
        count++;
      }
    }
  }
  return count;
}

export function namedGapsWithPlans(gaps: GapItem[]): { withPlans: number; total: number } {
  const withPlans = gaps.filter((g) => g.plannedWinstonImpl && g.proofArtifactNeeded).length;
  return { withPlans, total: gaps.length };
}
