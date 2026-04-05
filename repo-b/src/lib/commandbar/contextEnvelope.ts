import { readAssistantAppContext } from "@/lib/commandbar/appContextBridge";
import { matchWinstonLaunchSurface } from "@/lib/winston-companion/launchSurfaces";
import type {
  AssistantContextEnvelope,
  AssistantEntityType,
  AssistantScopeType,
  AssistantSelectedEntity,
  CommandContext,
  ContextSnapshot,
} from "@/lib/commandbar/types";

type RouteDescriptor = {
  surface: string | null;
  activeModule: string | null;
  pageEntityType: AssistantEntityType | string | null;
  pageEntityId: string | null;
};

function parseSessionCookie(): { role?: string; env_id?: string } | null {
  if (typeof document === "undefined") return null;
  const parts = document.cookie.split(";").map((part) => part.trim());
  const bos = parts.find((part) => part.startsWith("bos_session="));
  if (bos) {
    try {
      return JSON.parse(decodeURIComponent(bos.slice("bos_session=".length)));
    } catch {
      return null;
    }
  }
  const legacy = parts.find((part) => part.startsWith("demo_lab_session="));
  if (legacy && legacy.endsWith("active")) {
    return { role: "env_user" };
  }
  return null;
}

function normalizeName(value: string | null | undefined) {
  return (value || "").trim().toLowerCase();
}

function routeDescriptor(route: string | null): RouteDescriptor {
  if (!route) {
    return {
      surface: null,
      activeModule: null,
      pageEntityType: null,
      pageEntityId: null,
    };
  }

  const supportedSurface = matchWinstonLaunchSurface(route);
  if (supportedSurface) {
    const entityId =
      supportedSurface.scope_type === "environment" || supportedSurface.scope_type === "business"
        ? null
        : route.split("/").filter(Boolean).at(-1) || null;

    return {
      surface: supportedSurface.surface,
      activeModule:
        supportedSurface.surface === "re_workspace" || supportedSurface.surface === "fund_detail"
          ? "re"
          : null,
      pageEntityType: supportedSurface.scope_type,
      pageEntityId: entityId,
    };
  }

  const patterns: Array<{ re: RegExp; surface: string; activeModule: string; pageEntityType: AssistantEntityType | string | null }> = [
    { re: /^\/lab\/env\/[^/]+\/re\/funds\/([^/]+)/, surface: "fund_detail", activeModule: "re", pageEntityType: "fund" },
    { re: /^\/lab\/env\/[^/]+\/re\/funds$/, surface: "fund_portfolio", activeModule: "re", pageEntityType: "environment" },
    { re: /^\/lab\/env\/[^/]+\/re\/assets\/([^/]+)/, surface: "asset_detail", activeModule: "re", pageEntityType: "asset" },
    { re: /^\/lab\/env\/[^/]+\/re\/assets$/, surface: "asset_portfolio", activeModule: "re", pageEntityType: "environment" },
    { re: /^\/lab\/env\/[^/]+\/re\/investments\/([^/]+)/, surface: "investment_detail", activeModule: "re", pageEntityType: "investment" },
    { re: /^\/lab\/env\/[^/]+\/re\/investors\/([^/]+)/, surface: "investor_detail", activeModule: "re", pageEntityType: "investor" },
    { re: /^\/lab\/env\/[^/]+\/re\/investors$/, surface: "investor_list", activeModule: "re", pageEntityType: "environment" },
    { re: /^\/lab\/env\/[^/]+\/re\/capital-calls\/([^/]+)/, surface: "capital_call_detail", activeModule: "re", pageEntityType: "capital_call" },
    { re: /^\/lab\/env\/[^/]+\/re\/capital-calls$/, surface: "capital_call_operations", activeModule: "re", pageEntityType: "environment" },
    { re: /^\/lab\/env\/[^/]+\/re\/distributions\/([^/]+)/, surface: "distribution_detail", activeModule: "re", pageEntityType: "distribution" },
    { re: /^\/lab\/env\/[^/]+\/re\/distributions$/, surface: "distribution_operations", activeModule: "re", pageEntityType: "environment" },
    { re: /^\/lab\/env\/[^/]+\/re\/deals\/([^/]+)/, surface: "investment_detail", activeModule: "re", pageEntityType: "investment" },
    { re: /^\/lab\/env\/[^/]+\/re\/deals$/, surface: "investment_portfolio", activeModule: "re", pageEntityType: "environment" },
    { re: /^\/lab\/env\/[^/]+\/re\/models\/([^/]+)/, surface: "model_detail", activeModule: "re", pageEntityType: "model" },
    { re: /^\/lab\/env\/[^/]+\/re\/models$/, surface: "models_workspace", activeModule: "re", pageEntityType: "environment" },
    { re: /^\/lab\/env\/[^/]+\/re\/development\/([^/]+)/, surface: "development_project_detail", activeModule: "re", pageEntityType: "development_project" },
    { re: /^\/lab\/env\/[^/]+\/re\/development$/, surface: "development_workspace", activeModule: "re", pageEntityType: "environment" },
    { re: /^\/lab\/env\/[^/]+\/re\/pipeline\/([^/]+)/, surface: "pipeline_detail", activeModule: "re", pageEntityType: "pipeline_deal" },
    { re: /^\/lab\/env\/[^/]+\/re\/pipeline$/, surface: "pipeline_workspace", activeModule: "re", pageEntityType: "environment" },
    { re: /^\/lab\/env\/([^/]+)\/resume(?:\/|$)/, surface: "resume_workspace", activeModule: "resume", pageEntityType: "environment" },
    { re: /^\/lab\/env\/[^/]+\/copilot(?:\/|$)/, surface: "winston_workspace", activeModule: "copilot", pageEntityType: "environment" },
    { re: /^\/lab\/env\/[^/]+\/pds(?:\/|$)/, surface: "pds_workspace", activeModule: "pds", pageEntityType: "environment" },
    { re: /^\/lab\/env\/[^/]+\/consulting(?:\/|$)/, surface: "consulting_workspace", activeModule: "consulting", pageEntityType: "environment" },
    { re: /^\/lab\/env\/[^/]+\/credit(?:\/|$)/, surface: "credit_workspace", activeModule: "credit", pageEntityType: "environment" },
    { re: /^\/lab\/env\/[^/]+\/re/, surface: "re_workspace", activeModule: "re", pageEntityType: "environment" },
    { re: /^\/app\/winston(?:\/|$)/, surface: "winston_workspace", activeModule: "bos", pageEntityType: "business" },
    { re: /^\/lab\/env\/([^/]+)/, surface: "environment_workspace", activeModule: "lab", pageEntityType: "environment" },
  ];

  for (const pattern of patterns) {
    const match = route.match(pattern.re);
    if (match) {
      return {
        surface: pattern.surface,
        activeModule: pattern.activeModule,
        pageEntityType: pattern.pageEntityType,
        pageEntityId: match[1] || null,
      };
    }
  }

  return {
    surface: route.split("/").filter(Boolean).slice(0, 3).join("_") || null,
    activeModule: route.startsWith("/app") ? "bos" : route.startsWith("/lab") ? "lab" : null,
    pageEntityType: null,
    pageEntityId: null,
  };
}

function assistantMode(surface: string | null, pageEntityType: AssistantEntityType | string | null) {
  if (surface?.includes("fund") || pageEntityType === "fund") return "fund_copilot";
  if (surface?.includes("asset") || pageEntityType === "asset") return "asset_copilot";
  if (surface?.includes("investment") || pageEntityType === "investment") return "investment_copilot";
  if (surface?.includes("model") || pageEntityType === "model") return "model_copilot";
  if (surface?.includes("capital_call")) return "capital_call_copilot";
  if (surface?.includes("distribution")) return "distribution_copilot";
  if (surface?.includes("development")) return "development_copilot";
  if (surface?.includes("consulting")) return "consulting_copilot";
  if (surface?.includes("resume")) return "resume_copilot";
  if (surface?.includes("pds")) return "pds_copilot";
  if (surface?.includes("credit")) return "credit_copilot";
  if (surface?.includes("winston")) return "winston_companion";
  if (surface?.includes("pipeline")) return "pipeline_copilot";
  return "environment_copilot";
}

function defaultScopeType(pageEntityType: AssistantEntityType | string | null, envId: string | null, businessId: string | null): AssistantScopeType | string {
  if (pageEntityType && pageEntityType !== "unknown") return pageEntityType;
  if (envId) return "environment";
  if (businessId) return "business";
  return "global";
}

function selectedEntitiesFromBridge(params: {
  bridgeSelected: AssistantSelectedEntity[] | undefined;
  pageEntityType: AssistantEntityType | string | null;
  pageEntityId: string | null;
  pageEntityName: string | null;
}): AssistantSelectedEntity[] {
  const selected = [...(params.bridgeSelected || [])];
  if (params.pageEntityType && params.pageEntityId) {
    const exists = selected.some(
      (item) => item.entity_type === params.pageEntityType && item.entity_id === params.pageEntityId,
    );
    if (!exists) {
      selected.unshift({
        entity_type: params.pageEntityType,
        entity_id: params.pageEntityId,
        name: params.pageEntityName,
        source: "page",
      });
    }
  }
  return selected;
}

export function buildAssistantContextEnvelope(params: {
  context: CommandContext;
  snapshot: ContextSnapshot | null;
  conversationId?: string | null;
  launchSource?: string;
}): AssistantContextEnvelope {
  const bridge = readAssistantAppContext();
  const route = bridge?.page.route || params.context.route || params.snapshot?.route || null;
  const parsed = routeDescriptor(route);
  const session = parseSessionCookie();

  const activeEnvironmentId = bridge?.environment.active_environment_id
    || params.context.currentEnvId
    || params.snapshot?.selectedEnv?.env_id
    || session?.env_id
    || null;
  const activeBusinessId = bridge?.environment.active_business_id
    || params.context.currentBusinessId
    || params.snapshot?.business?.business_id
    || params.snapshot?.selectedEnv?.business_id
    || null;
  const pageEntityType = bridge?.page.page_entity_type || params.context.pageEntityType || parsed.pageEntityType || null;
  const pageEntityId = bridge?.page.page_entity_id || params.context.pageEntityId || parsed.pageEntityId || null;
  const pageEntityName = bridge?.page.page_entity_name || null;
  const selectedEntities = selectedEntitiesFromBridge({
    bridgeSelected: bridge?.page.selected_entities,
    pageEntityType,
    pageEntityId,
    pageEntityName,
  });
  const scopeType = defaultScopeType(pageEntityType, activeEnvironmentId, activeBusinessId);
  const scopeId = pageEntityId || activeEnvironmentId || activeBusinessId || null;

  return {
    session: {
      user_id: null,
      org_id: activeBusinessId,
      actor: null,
      roles: session?.role ? [session.role] : [],
      session_env_id: session?.env_id || null,
    },
    ui: {
      route,
      surface: bridge?.page.surface || params.context.surface || parsed.surface,
      active_module: bridge?.page.active_module || params.context.activeModule || parsed.activeModule,
      active_environment_id: activeEnvironmentId,
      active_environment_name: bridge?.environment.active_environment_name || params.snapshot?.selectedEnv?.client_name || null,
      active_business_id: activeBusinessId,
      active_business_name: bridge?.environment.active_business_name || params.snapshot?.business?.name || null,
      schema_name: bridge?.environment.schema_name || params.context.schemaName || params.snapshot?.selectedEnv?.schema_name || null,
      industry: bridge?.environment.industry || params.context.industry || params.snapshot?.selectedEnv?.industry || params.snapshot?.selectedEnv?.industry_type || null,
      page_entity_type: pageEntityType,
      page_entity_id: pageEntityId,
      page_entity_name: pageEntityName,
      selected_entities: selectedEntities,
      visible_data: bridge?.page.visible_data || null,
    },
    thread: {
      thread_id: params.conversationId || null,
      assistant_mode: assistantMode(bridge?.page.surface || parsed.surface, pageEntityType),
      scope_type: scopeType,
      scope_id: scopeId,
      launch_source: params.launchSource || "winston_commandbar",
    },
  };
}

export function findVisibleEntityByName(
  envelope: AssistantContextEnvelope,
  name: string,
): AssistantSelectedEntity | null {
  const lookup = normalizeName(name);
  if (!lookup) return null;
  const visible = envelope.ui.visible_data;
  const pools = [visible?.funds || [], visible?.investments || [], visible?.assets || [], visible?.models || [], visible?.pipeline_items || []];
  for (const pool of pools) {
    const match = pool.find((item) => normalizeName(item.name) === lookup);
    if (match) {
      return {
        entity_type: match.entity_type,
        entity_id: match.entity_id,
        name: match.name,
        source: "visible_data",
        parent_entity_type: match.parent_entity_type || null,
        parent_entity_id: match.parent_entity_id || null,
      };
    }
  }
  return null;
}
