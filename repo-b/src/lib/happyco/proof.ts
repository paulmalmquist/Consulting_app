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
    trigger: "recruiter/job context",
    tool: "HappyCo prompt stack + Codex planning",
    output: "role-specific proof scope and active implementation plan",
    control: "human-approved scope; no private recruiter content committed",
  },
  {
    status: "Ready",
    trigger: "deterministic data fixture",
    tool: "canonical fixture generator + operator service",
    output: "property, unit, inspection, work-order, vendor, benchmark, and recommendation spine",
    control: "synthetic data only; API payloads carry demo metadata and caveats",
  },
  {
    status: "Completed",
    trigger: "weather/property risk feature pipeline",
    tool: "Databricks bundle/job",
    output: "maintenance-risk predictions + MLflow metrics + run receipt",
    control: "public weather + synthetic ops only; receipt-backed claim; no serving endpoint",
  },
  {
    status: "Ready",
    trigger: "operator APIs",
    tool: "FastAPI operator routes",
    output: "entities, graph, benchmarks, recommendations, and ML-risk JSON",
    control: "demo_mode/data_source/caveat fields on product-facing responses",
  },
  {
    status: "Generated local",
    trigger: "Excel workbook",
    tool: "workbook generator",
    output: "canonical entities, benchmark, vendor, recommendation, and ML tabs",
    control: "local/private artifact; no public static URL",
  },
  {
    status: "Generated local",
    trigger: "PowerPoint deck",
    tool: "deck generator",
    output: "90-day strategy, architecture, ML proof, risks, and controls",
    control: "local/private artifact; no public static URL",
  },
  {
    status: "Template ready",
    trigger: "Outlook follow-up workflow",
    tool: "WinCOM params templates",
    output: "draft-only recruiter follow-up workflow template",
    control: "no send without explicit local confirmation",
  },
  {
    status: "Ready",
    trigger: "gated deployment",
    tool: "Next.js invite-code route + deployment env vars",
    output: "private proof package at /happyco",
    control: "invite-gated access; invite code remains server-side",
  },
  {
    status: "Ready",
    trigger: "smoke-test receipts",
    tool: "pytest, typecheck, browser smoke, Databricks receipt validation",
    output: "validation trail for the proof package",
    control: "claim only what receipts support",
  },
];
