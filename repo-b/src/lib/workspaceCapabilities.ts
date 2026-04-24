export type WorkspaceCapabilityConfig = {
  capabilities: string[];
  dataPhrase: string;
  entryLabel: string;
};

const WORKSPACE_CAPABILITY_CONFIG: Record<string, WorkspaceCapabilityConfig> = {
  repe_workspace: {
    capabilities: [
      "Fund performance dashboards",
      "Asset-level KPIs",
      "Gross-to-net bridge",
      "Scenario modeling",
      "Audit-ready snapshots",
    ],
    dataPhrase: "Live fund and asset data",
    entryLabel: "Open REPE Workspace",
  },
  trading_platform: {
    capabilities: [
      "Market regime classification",
      "Daily decision build",
      "Position sizing",
      "Backtest library",
      "Paper trading ledger",
    ],
    dataPhrase: "Live market and model data",
    entryLabel: "Open Trading Platform",
  },
  pds_enterprise: {
    capabilities: [
      "AI query engine",
      "Property data analytics",
      "JLL data integration",
      "Executive briefing",
      "Bulk export",
    ],
    dataPhrase: "PDS data pipeline connected",
    entryLabel: "Open PDS Workspace",
  },
  credit_risk_hub: {
    capabilities: [
      "Loan underwriting policy",
      "DTI and LTV analysis",
      "Consumer credit decisioning",
      "Portfolio review",
      "Audit chain",
    ],
    dataPhrase: "Underwriting corpus loaded",
    entryLabel: "Open Credit Hub",
  },
  ecc_command: {
    capabilities: [
      "Executive dashboard",
      "Cross-entity KPIs",
      "Automated briefings",
      "Decision tracking",
      "Stakeholder reports",
    ],
    dataPhrase: "Executive data ready",
    entryLabel: "Open Command Center",
  },
  legal_ops_command: {
    capabilities: [
      "Matter management",
      "Contract intelligence",
      "Spend analytics",
      "Outside counsel tracking",
      "Risk dashboard",
    ],
    dataPhrase: "Legal ops data connected",
    entryLabel: "Open Legal Ops",
  },
  consulting_revenue_os: {
    capabilities: [
      "Revenue pipeline",
      "Engagement tracking",
      "Utilization analytics",
      "Proposal library",
      "Client intelligence",
    ],
    dataPhrase: "Revenue data ready",
    entryLabel: "Open Revenue OS",
  },
  discovery_lab: {
    capabilities: [
      "Execution discovery flows",
      "AI-assisted scoping",
      "Opportunity mapping",
      "Stakeholder intake",
      "Blueprint output",
    ],
    dataPhrase: "Discovery environment active",
    entryLabel: "Open Discovery Lab",
  },
  data_studio: {
    capabilities: [
      "Data ingestion pipeline",
      "Schema mapping",
      "Transformation rules",
      "Quality checks",
      "Export connectors",
    ],
    dataPhrase: "Data studio ready",
    entryLabel: "Open Data Studio",
  },
};

const GENERIC_CONFIG: WorkspaceCapabilityConfig = {
  capabilities: [
    "AI-assisted workflows",
    "Environment analytics",
    "Integrated data ops",
  ],
  dataPhrase: "Workspace data ready",
  entryLabel: "Enter Workspace",
};

export function getCapabilityConfig(
  templateKey: string | null | undefined,
  industryType?: string | null,
): WorkspaceCapabilityConfig {
  if (templateKey && WORKSPACE_CAPABILITY_CONFIG[templateKey]) {
    return WORKSPACE_CAPABILITY_CONFIG[templateKey];
  }
  const fallbackKey = (industryType || "").toLowerCase();
  if (fallbackKey && WORKSPACE_CAPABILITY_CONFIG[fallbackKey]) {
    return WORKSPACE_CAPABILITY_CONFIG[fallbackKey];
  }
  return GENERIC_CONFIG;
}
