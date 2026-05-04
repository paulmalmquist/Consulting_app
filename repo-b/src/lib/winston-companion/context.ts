import type { AssistantContextEnvelope, AssistantSelectedEntity, AssistantVisibleData, ContextSnapshot } from "@/lib/commandbar/types";
import type { WidgetContext, WidgetContextAdapter } from "./widget-adapters/types";

export type WinstonLane = "contextual" | "general";

export type WinstonQuickLink = {
  id: string;
  label: string;
  href: string;
  description: string;
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
  searchPlaceholder: string;
};

const SUPPRESSED_ROUTE_PATTERNS = [
  /^\/$/,
  /^\/login(?:\/|$)/,
  /^\/onboarding(?:\/|$)/,
  /^\/public(?:\/|$)/,
  /^\/upload(?:\/|$)/,
  /^\/psychrag(?:\/|$)/,
  /^\/paul(?:\/|$)/,
  /^\/richard(?:\/|$)/,
];

const MOBILE_NAV_ROUTE_PATTERNS = [
  /^\/lab\/env\/[^/]+\/re(?:\/|$)/,
  /^\/lab\/env\/[^/]+\/ecc(?:\/|$)/,
  /^\/lab\/env\/[^/]+\/consulting(?:\/|$)/,
  /^\/lab\/env\/[^/]+\/operator(?:\/|$)/,
  /^\/lab\/env\/[^/]+\/resume(?:\/|$)/,
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

  if (scopeLabel !== "General") return scopeLabel;
  if (businessName) return businessName;
  if (envName) return envName;
  return routeLabel;
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

  if (activeModule === "resume") {
    const base = `/lab/env/${envId}/resume`;
    return [
      { id: "resume-home", label: "Visual Resume", href: base, description: "Interactive visual resume workspace" },
      { id: "resume-env-home", label: "Environment Home", href: `/lab/env/${envId}`, description: "Return to the environment overview" },
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

  if (activeModule === "operator") {
    const base = `/lab/env/${envId}/operator`;
    return [
      { id: "operator-home", label: "Executive", href: base, description: "Cross-entity command center" },
      { id: "operator-projects", label: "Projects", href: `${base}/projects`, description: "Budget, risk, and delivery drilldowns" },
      { id: "operator-vendors", label: "Vendors", href: `${base}/vendors`, description: "Spend aggregation and consolidation" },
      { id: "operator-close", label: "Close", href: `${base}/close`, description: "Blockers and late workflow tasks" },
    ];
  }

  return [];
}

export function shouldShowWinstonCompanion(pathname: string | null) {
  if (!pathname) return false;
  return !SUPPRESSED_ROUTE_PATTERNS.some((pattern) => pattern.test(pathname));
}

export function shouldRaiseWinstonLauncher(pathname: string | null) {
  if (!pathname) return false;
  return MOBILE_NAV_ROUTE_PATTERNS.some((pattern) => pattern.test(pathname));
}

function labRouteEnvId(pathname: string | null) {
  return pathname?.match(/^\/lab\/env\/([^/]+)/)?.[1] || null;
}

export function shouldBootWinstonCompanion(
  pathname: string | null,
  context: Pick<WinstonCompanionContext, "businessId" | "envId" | "scopeId" | "scopeType"> | null,
) {
  if (!shouldShowWinstonCompanion(pathname)) return false;
  const routeEnvId = labRouteEnvId(pathname);
  if (!routeEnvId) return true;
  if (!context?.businessId || !context.envId || !context.scopeId) return false;
  if (context.envId !== routeEnvId) return false;
  return context.scopeType !== "global";
}

/** Merge widget adapter captures into the visible_data envelope. */
function _mergeWidgetContexts(
  visibleData: AssistantVisibleData | null,
  adapters: WidgetContextAdapter[] | undefined,
): AssistantVisibleData | null {
  if (!adapters?.length) return visibleData;
  const widgets: WidgetContext[] = adapters
    .map((a) => a.capture())
    .filter((w): w is WidgetContext => w !== null);
  if (!widgets.length) return visibleData;
  return { ...(visibleData ?? {}), widgets };
}

export function buildCompanionContext(params: {
  envelope: AssistantContextEnvelope;
  snapshot: ContextSnapshot | null;
  /** Optional widget adapters that publish concise context about visible UI elements. */
  adapters?: WidgetContextAdapter[];
}): WinstonCompanionContext {
  const { envelope, adapters } = params;
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
    visibleData: _mergeWidgetContexts(envelope.ui.visible_data || null, adapters),
    quickLinks: buildQuickLinks(envelope),
    searchPlaceholder: `Search beyond ${scopeLabel === "General" ? routeLabel : scopeLabel}...`,
  };
}
