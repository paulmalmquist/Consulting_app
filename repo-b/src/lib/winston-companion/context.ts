import type { AssistantContextEnvelope, AssistantSelectedEntity, AssistantVisibleData, ContextSnapshot } from "@/lib/commandbar/types";

export type WinstonLane = "contextual" | "general";

export type WinstonQuickLink = {
  id: string;
  label: string;
  href: string;
  description: string;
};

export type WinstonSuggestion = {
  id: string;
  label: string;
  prompt: string;
};

export type WinstonCompanionContext = {
  businessId: string | null;
  businessName: string | null;
  envId: string | null;
  envName: string | null;
  route: string | null;
  routeLabel: string;
  activeModule: string | null;
  surface: string | null;
  scopeType: string;
  scopeId: string | null;
  scopeKey: string;
  scopeLabel: string;
  currentNarrative: string;
  selectedEntities: AssistantSelectedEntity[];
  visibleData: AssistantVisibleData | null;
  quickLinks: WinstonQuickLink[];
  suggestions: WinstonSuggestion[];
  searchPlaceholder: string;
};

const SUPPRESSED_ROUTE_PATTERNS = [
  /^\/$/,
  /^\/login(?:\/|$)/,
  /^\/onboarding(?:\/|$)/,
  /^\/public(?:\/|$)/,
  /^\/upload(?:\/|$)/,
  /^\/psychrag(?:\/|$)/,
];

const MOBILE_NAV_ROUTE_PATTERNS = [
  /^\/lab\/env\/[^/]+\/re(?:\/|$)/,
  /^\/lab\/env\/[^/]+\/ecc(?:\/|$)/,
  /^\/lab\/env\/[^/]+\/consulting(?:\/|$)/,
];

function titleCase(value: string) {
  return value
    .replaceAll(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function routeLabelFromSurface(surface: string | null, route: string | null) {
  if (surface) {
    return titleCase(
      surface
        .replace(/_workspace$/g, "")
        .replace(/_detail$/g, "")
        .replace(/_/g, " "),
    );
  }
  if (!route) return "Current Page";
  const segments = route.split("/").filter(Boolean);
  return titleCase(segments.slice(-2).join(" "));
}

function primaryEntityLabel(selectedEntities: AssistantSelectedEntity[]) {
  const primary = selectedEntities[0];
  if (!primary) return null;
  return primary.name || `${titleCase(String(primary.entity_type || "entity"))} ${primary.entity_id.slice(0, 8)}`;
}

function scopeLabelFromEnvelope(envelope: AssistantContextEnvelope) {
  const selectedLabel = primaryEntityLabel(envelope.ui.selected_entities);
  if (selectedLabel) return selectedLabel;
  if (envelope.ui.page_entity_name) return envelope.ui.page_entity_name;
  if (envelope.ui.active_environment_name) return envelope.ui.active_environment_name;
  if (envelope.ui.active_business_name) return envelope.ui.active_business_name;
  return "General";
}

function buildNarrative(envelope: AssistantContextEnvelope, routeLabel: string, scopeLabel: string) {
  const envName = envelope.ui.active_environment_name || envelope.ui.active_environment_id;
  const businessName = envelope.ui.active_business_name || envelope.ui.active_business_id;

  if (scopeLabel !== "General" && envName) {
    return `You're in ${envName} -> ${scopeLabel}`;
  }
  if (businessName && routeLabel) {
    return `You're viewing ${routeLabel} in ${businessName}`;
  }
  if (envName && routeLabel) {
    return `You're on ${routeLabel} for ${envName}`;
  }
  return `You're on ${routeLabel}`;
}

function buildQuickLinks(envelope: AssistantContextEnvelope): WinstonQuickLink[] {
  const envId = envelope.ui.active_environment_id;
  const activeModule = envelope.ui.active_module;
  if (!envId) return [];

  if (activeModule === "re") {
    const base = `/lab/env/${envId}/re`;
    return [
      { id: "re-funds", label: "Funds", href: base, description: "Portfolio and fund views" },
      { id: "re-models", label: "Models", href: `${base}/models`, description: "Scenarios and assumptions" },
      { id: "re-investors", label: "Investors", href: `${base}/investors`, description: "Investor operations" },
      { id: "re-capital-calls", label: "Capital Calls", href: `${base}/capital-calls`, description: "Contribution operations" },
    ];
  }

  if (activeModule === "pds") {
    const base = `/lab/env/${envId}/pds`;
    return [
      { id: "pds-home", label: "Home", href: base, description: "PDS command home" },
      { id: "pds-projects", label: "Projects", href: `${base}/projects`, description: "Delivery and project health" },
      { id: "pds-financials", label: "Financials", href: `${base}/financials`, description: "Revenue and plan" },
    ];
  }

  if (activeModule === "consulting") {
    const base = `/lab/env/${envId}/consulting`;
    return [
      { id: "consulting-home", label: "Home", href: base, description: "Command center" },
      { id: "consulting-events", label: "Events", href: `${base}/events`, description: "Operations and check-in" },
      { id: "consulting-contacts", label: "Contacts", href: `${base}/contacts`, description: "CRM and outreach" },
    ];
  }

  if (activeModule === "credit") {
    const base = `/lab/env/${envId}/credit`;
    return [
      { id: "credit-home", label: "Home", href: base, description: "Credit workspace" },
      { id: "credit-cases", label: "Cases", href: `${base}/cases`, description: "Case workflow" },
      { id: "credit-docs", label: "Doc Completion", href: `${base}/doc-completion`, description: "Document completion" },
    ];
  }

  return [];
}

function buildSuggestions(envelope: AssistantContextEnvelope, routeLabel: string, scopeLabel: string): WinstonSuggestion[] {
  const activeModule = envelope.ui.active_module;
  const selected = primaryEntityLabel(envelope.ui.selected_entities);

  if (activeModule === "re") {
    if (envelope.ui.page_entity_type === "fund") {
      return [
        { id: "fund-summary", label: "Summarize this fund", prompt: `Summarize ${scopeLabel} and flag the biggest operating and capital risks.` },
        { id: "fund-assets", label: "Related assets", prompt: `From ${scopeLabel}, show the assets and investments I should inspect next.` },
        { id: "fund-scenarios", label: "Compare scenarios", prompt: `Compare the key scenarios, assumptions, and valuation sensitivities for ${scopeLabel}.` },
      ];
    }
    if (envelope.ui.page_entity_type === "asset" || envelope.ui.page_entity_type === "investment") {
      return [
        { id: "asset-summary", label: "Explain this asset", prompt: `Explain the current status, risks, and next actions for ${scopeLabel}.` },
        { id: "asset-related", label: "Related fund context", prompt: `From ${scopeLabel}, take me to the related fund and summarize the connection.` },
        { id: "asset-scenarios", label: "Assumption checks", prompt: `Show the scenarios and assumptions that matter most for ${scopeLabel}.` },
      ];
    }
    if (envelope.ui.page_entity_type === "model" || routeLabel.toLowerCase().includes("model")) {
      return [
        { id: "model-scenarios", label: "Scenario compare", prompt: `Compare the active scenarios and key assumption changes for ${scopeLabel}.` },
        { id: "model-assets", label: "Linked assets", prompt: `Which assets and funds are linked to ${scopeLabel}, and where should I drill next?` },
        { id: "model-risks", label: "Model risks", prompt: `What is stale, missing, or risky in ${scopeLabel}?` },
      ];
    }
    if (routeLabel.toLowerCase().includes("capital")) {
      return [
        { id: "call-status", label: "Call status", prompt: `Summarize the outstanding capital call exposure and the investors that need attention.` },
        { id: "call-investors", label: "Inspect an investor", prompt: "Help me inspect a specific investor or contribution exception from this capital call context." },
        { id: "call-docs", label: "Related docs", prompt: "Show the related documents, approvals, and context I should review next." },
      ];
    }
    return [
      { id: "re-summary", label: "Summarize page", prompt: `Summarize what matters on the ${routeLabel} page.` },
      { id: "re-next", label: "Next actions", prompt: `What should I inspect next from the ${routeLabel} context?` },
      { id: "re-entities", label: "Explore elsewhere", prompt: `From ${selected || routeLabel}, show related entities and the best next drill paths.` },
    ];
  }

  if (activeModule === "pds") {
    return [
      { id: "pds-summary", label: "Summarize operations", prompt: `Summarize the current PDS operating picture from ${routeLabel}.` },
      { id: "pds-risks", label: "Delivery risks", prompt: "Show the biggest delivery, staffing, and revenue risks from this PDS context." },
      { id: "pds-next", label: "Next actions", prompt: "What should leadership inspect next from this PDS page?" },
    ];
  }

  if (activeModule === "consulting") {
    return [
      { id: "consulting-summary", label: "Summarize CRM", prompt: `Summarize the consulting workspace from ${routeLabel}.` },
      { id: "consulting-events", label: "Upcoming events", prompt: "What events, contacts, and follow-ups need attention next?" },
      { id: "consulting-explore", label: "Explore elsewhere", prompt: "Take me from this consulting page to the most relevant events, contacts, or reports." },
    ];
  }

  return [
    { id: "general-summary", label: "Summarize page", prompt: `Summarize the current context from ${routeLabel}.` },
    { id: "general-next", label: "Next actions", prompt: "What should I do next from this page?" },
    { id: "general-explore", label: "Explore elsewhere", prompt: "Help me navigate to the most relevant related areas from here." },
  ];
}

export function shouldShowWinstonCompanion(pathname: string | null) {
  if (!pathname) return false;
  return !SUPPRESSED_ROUTE_PATTERNS.some((pattern) => pattern.test(pathname));
}

export function shouldRaiseWinstonLauncher(pathname: string | null) {
  if (!pathname) return false;
  return MOBILE_NAV_ROUTE_PATTERNS.some((pattern) => pattern.test(pathname));
}

export function buildCompanionContext(params: {
  envelope: AssistantContextEnvelope;
  snapshot: ContextSnapshot | null;
}): WinstonCompanionContext {
  const { envelope } = params;
  const routeLabel = routeLabelFromSurface(envelope.ui.surface || null, envelope.ui.route || null);
  const scopeType = String(envelope.thread.scope_type || envelope.ui.page_entity_type || "global");
  const scopeId = envelope.thread.scope_id || envelope.ui.page_entity_id || envelope.ui.active_environment_id || envelope.ui.active_business_id || null;
  const scopeLabel = scopeLabelFromEnvelope(envelope);
  const scopeKey = `${scopeType}:${scopeId || "global"}`;

  return {
    businessId: envelope.ui.active_business_id || envelope.session.org_id || null,
    businessName: envelope.ui.active_business_name || null,
    envId: envelope.ui.active_environment_id || null,
    envName: envelope.ui.active_environment_name || null,
    route: envelope.ui.route || null,
    routeLabel,
    activeModule: envelope.ui.active_module || null,
    surface: envelope.ui.surface || null,
    scopeType,
    scopeId,
    scopeKey,
    scopeLabel,
    currentNarrative: buildNarrative(envelope, routeLabel, scopeLabel),
    selectedEntities: envelope.ui.selected_entities,
    visibleData: envelope.ui.visible_data || null,
    quickLinks: buildQuickLinks(envelope),
    suggestions: buildSuggestions(envelope, routeLabel, scopeLabel),
    searchPlaceholder: `Search beyond ${scopeLabel === "General" ? routeLabel : scopeLabel}...`,
  };
}
