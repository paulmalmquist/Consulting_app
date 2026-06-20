export const HAPPYCO_COOKIE_NAME = "happyco_demo_access";

export const HAPPYCO_DEMO_ENV_ID = process.env.NEXT_PUBLIC_HAPPYCO_DEMO_ENV_ID || "happyco-demo";

export const HAPPYCO_DATABRICKS_RECEIPT = {
  title: "Weather-aware maintenance risk Databricks run",
  jobId: "172758362681895",
  runId: "924781458483845",
  data: "public weather + synthetic property operations",
  output: "predictions, metrics, MLflow run metadata, validated receipt",
  claim: "Databricks ML training run executed on public weather and synthetic property operations data.",
  caveat: "Not HappyCo production data; not a production model; no serving endpoint.",
};

export const HAPPYCO_AUTOMATION_ROWS = [
  {
    status: "Ready",
    trigger: "Role / stakeholder brief",
    tool: "stakeholder brief intake",
    output: "role-specific proof scope tied to the Head of Data requirements",
    control: "human-approved scope; no private sensitive content committed",
    evidence: "Session Brief + ADO work item",
  },
  {
    status: "Ready",
    trigger: "Codex / Claude planning",
    tool: "Codex + Claude multi-PR planning",
    output: "sequenced execution plan and scoped tickets",
    control: "plan reviewed and approved before any code is written",
    evidence: "approved plan + ADO Epic/Story tree",
  },
  {
    status: "Ready",
    trigger: "Deterministic data fixture",
    tool: "canonical fixture generator + operator service",
    output: "property, unit, inspection, work-order, vendor, benchmark, and recommendation spine",
    control: "synthetic data only; API payloads carry demo metadata and caveats",
    evidence: "fixture seed + API demo_mode fields",
  },
  {
    status: "Completed",
    trigger: "Databricks weather-risk pipeline",
    tool: "Databricks bundle / job",
    output: "maintenance-risk predictions + MLflow metrics + run receipt",
    control: "public weather + synthetic ops only; receipt-backed claim; no serving endpoint",
    evidence: "run receipt + MLflow run IDs",
  },
  {
    status: "Ready",
    trigger: "Operator APIs",
    tool: "FastAPI operator routes",
    output: "entities, graph, benchmarks, recommendations, and ML-risk JSON",
    control: "demo_mode / data_source / caveat fields on every product-facing response",
    evidence: "API responses with caveat metadata",
  },
  {
    status: "Ready",
    trigger: "Frontend demo",
    tool: "Next.js HappyCo demo route",
    output: "clean invite-gated presentation with no Winston shell",
    control: "invite-gated; no production-data or production-model claims",
    evidence: "typecheck + browser smoke",
  },
  {
    status: "Generated local",
    trigger: "Excel workbook",
    tool: "workbook generator",
    output: "canonical entities, benchmark, vendor, recommendation, and ML tabs",
    control: "local / private artifact; no public static URL",
    evidence: "generated .xlsx + required-sheet validation",
  },
  {
    status: "Generated local",
    trigger: "PowerPoint deck",
    tool: "deck generator",
    output: "90-day strategy, architecture, ML proof, risks, and controls",
    control: "local / private artifact; no public static URL",
    evidence: "generated .pptx + slide-count check",
  },
  {
    status: "Template ready",
    trigger: "Outlook WinCOM draft workflow",
    tool: "WinCOM params templates",
    output: "draft-only follow-up workflow template",
    control: "no send without explicit local confirmation",
    evidence: "draft params dry-run receipt",
  },
  {
    status: "Ready",
    trigger: "Gated deployment",
    tool: "Next.js invite-code route + deployment env vars",
    output: "private proof package at /happyco",
    control: "invite-gated access; invite code stays server-side",
    evidence: "route smoke (locked + unlocked states)",
  },
  {
    status: "Ready",
    trigger: "Smoke-test receipts",
    tool: "pytest, typecheck, browser smoke, Databricks receipt validation",
    output: "a validation trail for the whole proof package",
    control: "claim only what receipts support",
    evidence: "test output + dated receipts in the runbook",
  },
];
