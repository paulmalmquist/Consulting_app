/** Skill definitions derived from real resume content — proof of execution, not definitions. */

export type SkillId =
  | "python"
  | "pyspark"
  | "sql"
  | "databricks"
  | "azure"
  | "power_bi"
  | "tableau"
  | "tabular_editor"
  | "snowflake"
  | "openai"
  | "langchain";

export interface SkillBullet {
  /** [action] + [system built] + [outcome] */
  text: string;
}

export interface SkillDefinition {
  id: SkillId;
  name: string;
  /** Short label for the icon grid */
  shortName: string;
  /** Capability layer IDs from the timeline this skill maps to */
  capabilityTags: string[];
  /** Timeline milestone IDs this skill is linked to */
  linkedMilestoneIds: string[];
  /** Phase IDs where this skill was primarily used */
  linkedPhaseIds: string[];
  /** Resume-derived bullets: [action] + [system built] + [outcome] */
  bullets: SkillBullet[];
  /** Icon color for the grid */
  color: string;
}

export const SKILLS: SkillDefinition[] = [
  {
    id: "python",
    name: "Python",
    shortName: "Python",
    capabilityTags: ["financial_modeling", "automation_workflow", "ai_agentic"],
    linkedMilestoneIds: ["milestone-waterfall-engine", "milestone-winston-ai-platform"],
    linkedPhaseIds: ["phase-kayne-2018-2025", "phase-jll-2025-present"],
    bullets: [
      { text: "Built deterministic waterfall engine replacing Excel — near-instant LP/GP distribution runtime" },
      { text: "Automated 500+ property ingestion pipelines — 160 hrs/month reduced to 30 minutes" },
      { text: "Engineered 83-tool MCP platform — domain-specific REPE actions with audit trails" },
      { text: "Created scenario analysis engine — reusable allocation logic across fund structures" },
    ],
    color: "#3776AB",
  },
  {
    id: "pyspark",
    name: "PySpark",
    shortName: "PySpark",
    capabilityTags: ["data_platform", "automation_workflow"],
    linkedMilestoneIds: ["milestone-kayne-ingestion-automation", "milestone-kayne-warehouse-semantic"],
    linkedPhaseIds: ["phase-kayne-2018-2025"],
    bullets: [
      { text: "Built medallion ETL pipelines on Databricks — bronze/silver/gold architecture across $4B+ AUM" },
      { text: "Automated partner accounting transforms — replaced manual flat-file reconciliation" },
      { text: "Processed 500+ property data feeds — validation gates at every ingestion stage" },
      { text: "Unified DealCloud, MRI, and Yardi sources — single governed data lineage" },
    ],
    color: "#E25A1C",
  },
  {
    id: "sql",
    name: "SQL",
    shortName: "SQL",
    capabilityTags: ["data_platform", "bi_reporting", "financial_modeling"],
    linkedMilestoneIds: ["milestone-kayne-warehouse-semantic", "milestone-expanded-bi-scope"],
    linkedPhaseIds: ["phase-jll-2014-2018", "phase-kayne-2018-2025", "phase-jll-2025-present"],
    bullets: [
      { text: "Designed semantic layer across 6 business units — single source of truth for all reporting" },
      { text: "Built validation layer for ingestion pipelines — error rates dropped to near zero" },
      { text: "Engineered gold tables powering DDQ workflows — 50% faster investor turnaround" },
      { text: "Created governed data contracts — 10+ client accounts standardized" },
    ],
    color: "#336791",
  },
  {
    id: "databricks",
    name: "Databricks",
    shortName: "Databricks",
    capabilityTags: ["data_platform", "automation_workflow", "ai_agentic"],
    linkedMilestoneIds: ["milestone-kayne-warehouse-semantic", "milestone-rejoined-jll-2025"],
    linkedPhaseIds: ["phase-kayne-2018-2025", "phase-jll-2025-present"],
    bullets: [
      { text: "Architected $4B+ AUM lakehouse — unified investment, property, and operational data" },
      { text: "Built medallion architecture — governed bronze/silver/gold pipeline across all source systems" },
      { text: "Deployed semantic models via Unity Catalog — self-serve analytics for portfolio ops" },
      { text: "Scaled platform to JLL PDS Americas — 10+ client accounts on same foundation" },
    ],
    color: "#FF3621",
  },
  {
    id: "azure",
    name: "Azure",
    shortName: "Azure",
    capabilityTags: ["data_platform", "automation_workflow"],
    linkedMilestoneIds: ["milestone-kayne-ingestion-automation", "milestone-kayne-warehouse-semantic"],
    linkedPhaseIds: ["phase-kayne-2018-2025"],
    bullets: [
      { text: "Deployed Azure Logic Apps file watchers — automated partner accounting across 500+ properties" },
      { text: "Built Azure Data Lake storage layer — centralized raw and curated data zones" },
      { text: "Integrated Azure with Databricks compute — seamless ETL orchestration at scale" },
      { text: "Implemented governed ingestion contracts — 160 hrs/month manual entry eliminated" },
    ],
    color: "#0078D4",
  },
  {
    id: "power_bi",
    name: "Power BI",
    shortName: "Power BI",
    capabilityTags: ["bi_reporting", "executive_decision_support"],
    linkedMilestoneIds: ["milestone-kayne-acquisition-vba", "milestone-kayne-warehouse-semantic"],
    linkedPhaseIds: ["phase-kayne-2018-2025"],
    bullets: [
      { text: "Delivered governed dashboards for 500+ assets — first executive programmatic reporting" },
      { text: "Reduced ad hoc reporting requests by 50% — self-serve analytics for leadership" },
      { text: "Built acquisition tracking dashboards — 40+ deals/week visualized in real time" },
      { text: "Enabled portfolio-level drill-through — fund to asset transparency" },
    ],
    color: "#F2C811",
  },
  {
    id: "tableau",
    name: "Tableau",
    shortName: "Tableau",
    capabilityTags: ["bi_reporting", "executive_decision_support"],
    linkedMilestoneIds: ["milestone-expanded-bi-scope"],
    linkedPhaseIds: ["phase-jll-2014-2018"],
    bullets: [
      { text: "Built JLL's first BI service line for JPMC — repeatable dashboard delivery established" },
      { text: "Created executive-ready reporting systems — national account analytics capability" },
      { text: "Replaced fragmented manual pulls — governed data extracts with SQL validation" },
    ],
    color: "#E97627",
  },
  {
    id: "tabular_editor",
    name: "Tabular Editor",
    shortName: "Tabular",
    capabilityTags: ["bi_reporting", "data_platform"],
    linkedMilestoneIds: ["milestone-kayne-warehouse-semantic"],
    linkedPhaseIds: ["phase-kayne-2018-2025"],
    bullets: [
      { text: "Engineered semantic models for lakehouse — business logic layer across 6 units" },
      { text: "Built reusable DAX measures — standardized KPI calculations firm-wide" },
      { text: "Enabled self-serve exploration — analysts query governed models directly" },
    ],
    color: "#6DB33F",
  },
  {
    id: "snowflake",
    name: "Snowflake",
    shortName: "Snowflake",
    capabilityTags: ["data_platform", "bi_reporting"],
    linkedMilestoneIds: ["milestone-rejoined-jll-2025"],
    linkedPhaseIds: ["phase-jll-2025-present"],
    bullets: [
      { text: "Extended governed data delivery to Snowflake environments — multi-cloud readiness" },
      { text: "Built cross-platform semantic contracts — portable across Databricks and Snowflake" },
      { text: "Enabled client-specific data zones — tenant isolation with shared governance" },
    ],
    color: "#29B5E8",
  },
  {
    id: "openai",
    name: "OpenAI",
    shortName: "OpenAI",
    capabilityTags: ["ai_agentic", "executive_decision_support"],
    linkedMilestoneIds: ["milestone-winston-ai-platform", "milestone-rejoined-jll-2025"],
    linkedPhaseIds: ["phase-jll-2025-present"],
    bullets: [
      { text: "Built conversational analytics layer — business users query governed data directly" },
      { text: "Deployed 83 MCP tools with OpenAI orchestration — domain REPE actions with structured outputs" },
      { text: "Engineered RAG pipelines for investment documents — DDQ and LP reporting accelerated" },
      { text: "Created AI query orchestration for PDS — 10+ client accounts served" },
    ],
    color: "#412991",
  },
  {
    id: "langchain",
    name: "LangChain",
    shortName: "LangChain",
    capabilityTags: ["ai_agentic", "executive_decision_support"],
    linkedMilestoneIds: ["milestone-winston-ai-platform"],
    linkedPhaseIds: ["phase-jll-2025-present"],
    bullets: [
      { text: "Orchestrated multi-step agent workflows — tool selection, memory, and audit chains" },
      { text: "Built streaming AI interfaces — real-time response rendering for complex queries" },
      { text: "Implemented retrieval-augmented generation — corpus-grounded answers with citation chains" },
      { text: "Designed prompt routing architecture — model dispatch based on task complexity" },
    ],
    color: "#1C3C3C",
  },
];

/** Get skills relevant to a given capability layer */
export function getSkillsByCapabilityTag(tag: string): SkillDefinition[] {
  return SKILLS.filter((s) => s.capabilityTags.includes(tag));
}

/** Get skills linked to a specific milestone */
export function getSkillsByMilestoneId(milestoneId: string): SkillDefinition[] {
  return SKILLS.filter((s) => s.linkedMilestoneIds.includes(milestoneId));
}

/** Get skills linked to a specific phase */
export function getSkillsByPhaseId(phaseId: string): SkillDefinition[] {
  return SKILLS.filter((s) => s.linkedPhaseIds.includes(phaseId));
}
