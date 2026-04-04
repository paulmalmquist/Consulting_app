"use client";

import {
  createContext,
  startTransition,
  useContext,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  archiveConversation,
  createConversation,
  fetchContextSnapshot,
  getConversation,
  listConversations,
  streamAi,
  type AskAiDebug,
  type AssistantApiTrace,
  type ConversationDetail,
  type ConversationSummary,
} from "@/lib/commandbar/assistantApi";
import {
  readAssistantAppContext,
  subscribeAssistantAppContext,
} from "@/lib/commandbar/appContextBridge";
import { buildAssistantContextEnvelope } from "@/lib/commandbar/contextEnvelope";
import { makeMessage, type CommandMessage } from "@/lib/commandbar/store";
import type { AssistantContextEnvelope, AssistantSelectedEntity, ContextSnapshot } from "@/lib/commandbar/types";
import {
  completeUpload,
  computeSha256,
  getDevPortfolio,
  initUpload,
  listAllModels,
  listCapitalCalls,
  listInvestors,
  listReV1Funds,
  listReV2Assets,
  listReV2InvestmentsFiltered,
} from "@/lib/bos-api";
import { cn } from "@/lib/cn";
import {
  buildCompanionContext,
  shouldRaiseWinstonLauncher,
  shouldShowWinstonCompanion,
  type WinstonCompanionContext,
  type WinstonLane,
} from "@/lib/winston-companion/context";
import type { CopilotAttachment } from "@/components/copilot/types";

type SearchResult = {
  id: string;
  label: string;
  description: string;
  href: string;
  kind: string;
  source: string;
};

type LaneBinding = {
  scopeKey: string;
  scopeType: string;
  scopeId: string | null;
  scopeLabel: string;
  envId: string | null;
  businessId: string | null;
  businessName: string | null;
  contextSummary: string | null;
  lastRoute: string | null;
};

/** Terminal state for every assistant turn. */
type TerminalState = "complete" | "awaiting_confirmation" | "blocked_missing_info" | "failed" | null;

type LaneState = {
  conversationId: string | null;
  draft: string;
  messages: CommandMessage[];
  attachments: CopilotAttachment[];
  binding: LaneBinding | null;
  thinking: boolean;
  thinkingStatus?: string;
  terminalState: TerminalState;
  trace: AssistantApiTrace | null;
  debug: AskAiDebug | null;
  /** Last assistant message text if it ended with a question (pending clarification). */
  pendingQuestion: string | null;
};

type WinstonCompanionContextValue = {
  open: boolean;
  shouldRender: boolean;
  launcherRaised: boolean;
  activeLane: WinstonLane;
  currentContext: WinstonCompanionContext | null;
  contextualBinding: LaneBinding | null;
  activeBinding: LaneBinding | null;
  activeState: LaneState;
  generalState: LaneState;
  contextualState: LaneState;
  contextSnapshot: ContextSnapshot | null;
  contextEnvelope: AssistantContextEnvelope | null;
  conversations: ConversationSummary[];
  recentConversations: ConversationSummary[];
  exploreQuery: string;
  exploreResults: SearchResult[];
  exploreLoading: boolean;
  needsContextAdoption: boolean;
  openDrawer: (lane?: WinstonLane) => void;
  closeDrawer: () => void;
  toggleDrawer: () => void;
  setActiveLane: (lane: WinstonLane) => void;
  setDraft: (lane: WinstonLane, value: string) => void;
  sendPrompt: (lane?: WinstonLane, promptOverride?: string) => Promise<void>;
  loadConversation: (conversationId: string, lane?: WinstonLane) => Promise<void>;
  resetLane: (lane: WinstonLane) => void;
  archiveConversationById: (conversationId: string) => Promise<void>;
  adoptCurrentContext: () => void;
  setExploreQuery: (value: string) => void;
  uploadAttachment: (lane: WinstonLane, file: File) => Promise<void>;
  removeAttachment: (lane: WinstonLane, attachmentId: string) => void;
  openFullWorkspace: () => void;
  hydrateFromQuery: (conversationId: string | null, lane?: WinstonLane | null) => Promise<void>;
};

const WinstonCompanionContextStore = createContext<WinstonCompanionContextValue | null>(null);

const EMPTY_LANE: LaneState = {
  conversationId: null,
  draft: "",
  messages: [],
  attachments: [],
  binding: null,
  thinking: false,
  thinkingStatus: undefined,
  terminalState: null,
  trace: null,
  debug: null,
  pendingQuestion: null,
};

function readRouteEnvId(pathname: string | null): string | null {
  return pathname?.match(/^\/lab\/env\/([^/]+)/)?.[1] || null;
}

function readBrowserContext(pathname: string | null, options: { clientReady?: boolean } = {}) {
  const route = pathname || (typeof window !== "undefined" ? window.location.pathname : "/");
  const routeEnvId = readRouteEnvId(route);

  if (typeof window === "undefined" || !options.clientReady) {
    return {
      currentEnvId: routeEnvId,
      currentBusinessId: null,
      route,
      selection: null,
      surface: null,
      activeModule: null,
      pageEntityType: null,
      pageEntityId: null,
      schemaName: null,
      industry: null,
    };
  }

  const appContext = readAssistantAppContext();
  const selected = window.getSelection?.()?.toString().trim() || "";

  return {
    currentEnvId: appContext?.environment.active_environment_id || routeEnvId || window.localStorage.getItem("demo_lab_env_id"),
    currentBusinessId: appContext?.environment.active_business_id || window.localStorage.getItem("bos_business_id"),
    route,
    selection: selected || null,
    surface: appContext?.page.surface || null,
    activeModule: appContext?.page.active_module || null,
    pageEntityType: appContext?.page.page_entity_type || null,
    pageEntityId: appContext?.page.page_entity_id || null,
    schemaName: appContext?.environment.schema_name || null,
    industry: appContext?.environment.industry || null,
  };
}

function mapConversationMessages(
  messages: ConversationDetail["messages"] | undefined,
): CommandMessage[] {
  return (messages || [])
    .filter((message) => message.role === "user" || message.role === "assistant" || message.role === "system")
    .map((message) => ({
      id: message.message_id,
      role: message.role as CommandMessage["role"],
      content: message.content,
      createdAt: message.created_at ? new Date(message.created_at).getTime() : Date.now(),
      responseBlocks: message.response_blocks || [],
      messageMeta: message.message_meta || {},
    }));
}

function laneBindingFromContext(context: WinstonCompanionContext | null): LaneBinding | null {
  if (!context) return null;
  return {
    scopeKey: context.scopeKey,
    scopeType: context.scopeType,
    scopeId: context.scopeId,
    scopeLabel: context.scopeLabel,
    envId: context.envId,
    businessId: context.businessId,
    businessName: context.businessName,
    contextSummary: context.currentNarrative,
    lastRoute: context.route,
  };
}

function laneBindingFromConversation(detail: ConversationDetail | ConversationSummary): LaneBinding | null {
  const scopeType = detail.scope_type || (detail.thread_kind === "general" ? "business" : "environment");
  const scopeId = detail.scope_id || detail.env_id || null;
  const scopeLabel = detail.scope_label || detail.title || detail.context_summary || "Conversation";
  const businessId = "business_id" in detail ? detail.business_id : null;
  return {
    scopeKey: `${scopeType}:${scopeId || "global"}`,
    scopeType,
    scopeId,
    scopeLabel,
    envId: detail.env_id || null,
    businessId,
    businessName: null,
    contextSummary: detail.context_summary || null,
    lastRoute: detail.last_route || null,
  };
}

function generalBindingFromContext(context: WinstonCompanionContext | null): LaneBinding | null {
  const businessId = context?.businessId || null;
  const businessName = context?.businessName || null;
  return {
    scopeKey: businessId ? `business:${businessId}` : "global:global",
    scopeType: businessId ? "business" : "global",
    scopeId: businessId,
    scopeLabel: businessName || "General",
    envId: context?.envId || null,
    businessId,
    businessName,
    contextSummary: context?.currentNarrative || "General Winston conversation",
    lastRoute: context?.route || null,
  };
}

function conversationSortValue(conversation: ConversationSummary) {
  return conversation.updated_at ? new Date(conversation.updated_at).getTime() : 0;
}

function conversationLabel(conversation: ConversationSummary) {
  return conversation.title || conversation.scope_label || conversation.context_summary || "Untitled conversation";
}

function filterVisibleDataResults(context: WinstonCompanionContext | null, query: string): SearchResult[] {
  if (!context) return [];
  const normalized = query.trim().toLowerCase();
  const pools = Object.entries(context.visibleData || {}).filter(([, value]) => Array.isArray(value));
  const results: SearchResult[] = [];

  for (const [group, items] of pools) {
    for (const item of items as Array<Record<string, unknown>>) {
      const label = String(item.name || item.entity_id || "");
      if (!label) continue;
      if (normalized && !label.toLowerCase().includes(normalized)) continue;
      const entityType = String(item.entity_type || group);
      const entityId = String(item.entity_id || "");
      const href = resolveEntityHref(context, entityType, entityId);
      if (!href) continue;
      results.push({
        id: `visible-${entityType}-${entityId}`,
        label,
        description: `${entityType.replaceAll("_", " ")} from current page`,
        href,
        kind: entityType,
        source: "visible_data",
      });
    }
  }

  return results;
}

function resolveEntityHref(context: Pick<WinstonCompanionContext, "envId" | "activeModule">, entityType: string, entityId: string) {
  const envId = context.envId;
  if (!envId) return null;
  if (context.activeModule === "re") {
    const base = `/lab/env/${envId}/re`;
    if (entityType === "fund") return `${base}/funds/${entityId}`;
    if (entityType === "investment" || entityType === "deal") return `${base}/investments/${entityId}`;
    if (entityType === "asset") return `${base}/assets/${entityId}`;
    if (entityType === "model") return `${base}/models/${entityId}`;
    if (entityType === "investor") return `${base}/investors/${entityId}`;
    if (entityType === "capital_call") return `${base}/capital-calls/${entityId}`;
    if (entityType === "distribution") return `${base}/distributions/${entityId}`;
    if (entityType === "development_project") return `${base}/development/${entityId}`;
  }
  return null;
}

function dedupeSearchResults(results: SearchResult[]) {
  const seen = new Set<string>();
  return results.filter((result) => {
    if (seen.has(result.href)) return false;
    seen.add(result.href);
    return true;
  });
}

function withBinding(envelope: AssistantContextEnvelope, binding: LaneBinding | null): AssistantContextEnvelope {
  if (!binding) return envelope;

  const next: AssistantContextEnvelope = {
    session: { ...envelope.session },
    ui: {
      ...envelope.ui,
      selected_entities: [...envelope.ui.selected_entities],
    },
    thread: {
      ...envelope.thread,
      scope_type: binding.scopeType,
      scope_id: binding.scopeId,
    },
  };

  if (
    binding.scopeId &&
    binding.scopeType !== "business" &&
    binding.scopeType !== "global" &&
    !next.ui.selected_entities.some(
      (entity) => entity.entity_type === binding.scopeType && entity.entity_id === binding.scopeId,
    )
  ) {
    const boundEntity: AssistantSelectedEntity = {
      entity_type: binding.scopeType,
      entity_id: binding.scopeId,
      name: binding.scopeLabel,
      source: "thread",
    };
    next.ui.selected_entities = [boundEntity, ...next.ui.selected_entities];
  }

  if (binding.envId) next.ui.active_environment_id = binding.envId;
  if (binding.businessId) {
    next.ui.active_business_id = binding.businessId;
    next.session.org_id = binding.businessId;
  }
  if (binding.businessName && !next.ui.active_business_name) {
    next.ui.active_business_name = binding.businessName;
  }

  return next;
}

async function searchRemoteReEntities(params: {
  envId: string;
  businessId: string | null;
  query: string;
}): Promise<SearchResult[]> {
  const { envId, businessId, query } = params;
  const normalized = query.trim().toLowerCase();

  const [
    fundsResult,
    investmentsResult,
    assetsResult,
    modelsResult,
    investorsResult,
    callsResult,
    developmentResult,
  ] = await Promise.allSettled([
    listReV1Funds({ env_id: envId, business_id: businessId || undefined }),
    listReV2InvestmentsFiltered({ env_id: envId, q: query, limit: 8 }),
    listReV2Assets({ env_id: envId, q: query, limit: "8" }),
    listAllModels(envId),
    listInvestors({ env_id: envId, business_id: businessId || undefined }),
    listCapitalCalls({ env_id: envId, business_id: businessId || undefined }),
    getDevPortfolio(envId, businessId || undefined),
  ]);

  const results: SearchResult[] = [];

  if (fundsResult.status === "fulfilled") {
    results.push(
      ...fundsResult.value
        .filter((fund) => fund.name.toLowerCase().includes(normalized))
        .slice(0, 6)
        .map((fund) => ({
          id: `fund-${fund.fund_id}`,
          label: fund.name,
          description: "Fund",
          href: `/lab/env/${envId}/re/funds/${fund.fund_id}`,
          kind: "fund",
          source: "funds_api",
        })),
    );
  }

  if (investmentsResult.status === "fulfilled") {
    results.push(
      ...investmentsResult.value.slice(0, 6).map((investment) => ({
        id: `investment-${investment.investment_id}`,
        label: investment.name,
        description: investment.fund_name ? `Investment in ${investment.fund_name}` : "Investment",
        href: `/lab/env/${envId}/re/investments/${investment.investment_id}`,
        kind: "investment",
        source: "investments_api",
      })),
    );
  }

  if (assetsResult.status === "fulfilled") {
    results.push(
      ...assetsResult.value.slice(0, 6).map((asset) => ({
        id: `asset-${asset.asset_id}`,
        label: asset.name,
        description: asset.fund_name ? `Asset in ${asset.fund_name}` : "Asset",
        href: `/lab/env/${envId}/re/assets/${asset.asset_id}`,
        kind: "asset",
        source: "assets_api",
      })),
    );
  }

  if (modelsResult.status === "fulfilled") {
    results.push(
      ...modelsResult.value
        .filter((model) => model.name.toLowerCase().includes(normalized))
        .slice(0, 6)
        .map((model) => ({
          id: `model-${model.model_id}`,
          label: model.name,
          description: model.primary_fund_id ? "Scenario model" : "Cross-fund model",
          href: `/lab/env/${envId}/re/models/${model.model_id}`,
          kind: "model",
          source: "models_api",
        })),
    );
  }

  if (investorsResult.status === "fulfilled") {
    results.push(
      ...investorsResult.value.investors
        .filter((row) => String(row.name || "").toLowerCase().includes(normalized))
        .slice(0, 6)
        .map((row) => ({
          id: `investor-${String(row.partner_id)}`,
          label: String(row.name || "Investor"),
          description: String(row.partner_type || "Investor"),
          href: `/lab/env/${envId}/re/investors/${String(row.partner_id)}`,
          kind: "investor",
          source: "investors_api",
        })),
    );
  }

  if (callsResult.status === "fulfilled") {
    results.push(
      ...callsResult.value.capital_calls
        .filter((row) => `${String(row.call_name || row.reference_code || "")}`.toLowerCase().includes(normalized))
        .slice(0, 6)
        .map((row) => ({
          id: `capital-call-${String(row.call_id)}`,
          label: String(row.call_name || row.reference_code || "Capital Call"),
          description: String(row.status || "Capital call"),
          href: `/lab/env/${envId}/re/capital-calls/${String(row.call_id)}`,
          kind: "capital_call",
          source: "capital_calls_api",
        })),
    );
  }

  if (developmentResult.status === "fulfilled") {
    results.push(
      ...developmentResult.value.projects
        .filter((project) => {
          const text = `${project.project_name} ${project.asset_name}`.toLowerCase();
          return text.includes(normalized);
        })
        .slice(0, 6)
        .map((project) => ({
          id: `development-${project.link_id}`,
          label: project.project_name,
          description: project.asset_name ? `Development linked to ${project.asset_name}` : "Development project",
          href: `/lab/env/${envId}/re/development/${project.link_id}`,
          kind: "development_project",
          source: "development_api",
        })),
    );
  }

  return results;
}

export function WinstonCompanionProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [activeLane, setActiveLane] = useState<WinstonLane>("contextual");
  const [contextSnapshot, setContextSnapshot] = useState<ContextSnapshot | null>(null);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [bridgeTick, setBridgeTick] = useState(0);
  const [clientReady, setClientReady] = useState(false);
  const [generalState, setGeneralState] = useState<LaneState>(EMPTY_LANE);
  const [contextualState, setContextualState] = useState<LaneState>(EMPTY_LANE);
  const [exploreQuery, setExploreQuery] = useState("");
  const [remoteExploreResults, setRemoteExploreResults] = useState<SearchResult[]>([]);
  const [exploreLoading, setExploreLoading] = useState(false);
  const activeLaneRef = useRef<WinstonLane>("contextual");
  const deferredExploreQuery = useDeferredValue(exploreQuery);

  useEffect(() => {
    activeLaneRef.current = activeLane;
  }, [activeLane]);

  useEffect(() => {
    setClientReady(true);
  }, []);

  useEffect(() => {
    return subscribeAssistantAppContext(() => {
      setBridgeTick((value) => value + 1);
    });
  }, []);

  const shouldRender = shouldShowWinstonCompanion(pathname);
  const launcherRaised = shouldRaiseWinstonLauncher(pathname);

  useEffect(() => {
    if (!shouldRender) setOpen(false);
  }, [shouldRender]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        return;
      }

      const shortcut = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k";
      if (!shortcut || !shouldRender) return;

      const target = event.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      const inInput = tag === "input" || tag === "textarea" || target?.isContentEditable;
      if (inInput) return;

      event.preventDefault();
      setOpen((value) => !value);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [shouldRender]);

  useEffect(() => {
    const onPrefillPrompt = (event: Event) => {
      const prompt = (event as CustomEvent<{ prompt?: string }>).detail?.prompt?.trim() || "";
      setOpen(true);
      setActiveLane((current) => (current === "general" ? "general" : "contextual"));
      if (!prompt) return;
      setContextualState((current) => ({ ...current, draft: prompt }));
      setGeneralState((current) => ({ ...current, draft: prompt }));
    };

    window.addEventListener("winston-prefill-prompt", onPrefillPrompt as EventListener);
    return () => window.removeEventListener("winston-prefill-prompt", onPrefillPrompt as EventListener);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const commandContext = readBrowserContext(pathname, { clientReady });
    void fetchContextSnapshot(commandContext)
      .then((result) => {
        if (!cancelled) setContextSnapshot(result.snapshot);
      })
      .catch(() => {
        if (!cancelled) setContextSnapshot(null);
      });
    return () => {
      cancelled = true;
    };
  }, [bridgeTick, clientReady, pathname]);

  const commandContext = useMemo(
    () => readBrowserContext(pathname, { clientReady }),
    [bridgeTick, clientReady, pathname],
  );

  const rawEnvelope = useMemo(
    () => buildAssistantContextEnvelope({
      context: commandContext,
      snapshot: contextSnapshot,
      conversationId: null,
      launchSource: "winston_companion",
    }),
    [commandContext, contextSnapshot],
  );

  const currentContext = useMemo(
    () => buildCompanionContext({ envelope: rawEnvelope, snapshot: contextSnapshot }),
    [rawEnvelope, contextSnapshot],
  );

  const contextualBinding = contextualState.binding || laneBindingFromContext(currentContext);
  const generalBinding = generalState.binding || generalBindingFromContext(currentContext);
  const activeState = activeLane === "general" ? generalState : contextualState;
  const activeBinding = activeLane === "general" ? generalBinding : contextualBinding;

  const activeConversationId = activeState.conversationId;

  const contextEnvelope = useMemo(
    () =>
      withBinding(
        buildAssistantContextEnvelope({
          context: commandContext,
          snapshot: contextSnapshot,
          conversationId: activeConversationId,
          launchSource: `winston_companion_${activeLane}`,
        }),
        activeBinding,
      ),
    [activeBinding, activeConversationId, activeLane, commandContext, contextSnapshot],
  );

  const needsContextAdoption = Boolean(
    activeLane === "contextual" &&
      currentContext &&
      contextualBinding &&
      contextualBinding.scopeKey !== currentContext.scopeKey,
  );

  useEffect(() => {
    const businessId = currentContext.businessId;
    if (!businessId) {
      setConversations([]);
      return;
    }

    let cancelled = false;
    void listConversations(businessId)
      .then((items) => {
        if (!cancelled) {
          setConversations(items.sort((left, right) => conversationSortValue(right) - conversationSortValue(left)));
        }
      })
      .catch(() => {
        if (!cancelled) setConversations([]);
      });

    return () => {
      cancelled = true;
    };
  }, [currentContext.businessId]);

  const exploreResults = useMemo(() => {
    const query = deferredExploreQuery.trim();
    const quickLinks = (currentContext?.quickLinks || [])
      .filter((link) => !query || `${link.label} ${link.description}`.toLowerCase().includes(query.toLowerCase()))
      .map((link) => ({
        id: link.id,
        label: link.label,
        description: link.description,
        href: link.href,
        kind: "navigation",
        source: "quick_link",
      }));

    const visible = filterVisibleDataResults(currentContext, query);
    return dedupeSearchResults([...quickLinks, ...visible, ...remoteExploreResults]).slice(0, 18);
  }, [currentContext, deferredExploreQuery, remoteExploreResults]);

  useEffect(() => {
    const query = deferredExploreQuery.trim();
    if (!query || !currentContext?.envId || currentContext.activeModule !== "re") {
      setRemoteExploreResults([]);
      setExploreLoading(false);
      return;
    }

    let cancelled = false;
    setExploreLoading(true);

    void searchRemoteReEntities({
      envId: currentContext.envId,
      businessId: currentContext.businessId,
      query,
    })
      .then((results) => {
        if (!cancelled) setRemoteExploreResults(dedupeSearchResults(results).slice(0, 12));
      })
      .catch(() => {
        if (!cancelled) setRemoteExploreResults([]);
      })
      .finally(() => {
        if (!cancelled) setExploreLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [currentContext?.activeModule, currentContext?.businessId, currentContext?.envId, deferredExploreQuery]);

  function setLaneState(lane: WinstonLane, updater: (current: LaneState) => LaneState) {
    if (lane === "general") {
      setGeneralState(updater);
      return;
    }
    setContextualState(updater);
  }

  function openDrawer(lane?: WinstonLane) {
    if (lane) setActiveLane(lane);
    setOpen(true);
  }

  function closeDrawer() {
    setOpen(false);
  }

  function toggleDrawer() {
    if (!shouldRender) return;
    setOpen((value) => !value);
  }

  function resetLane(lane: WinstonLane) {
    const binding = lane === "general" ? generalBindingFromContext(currentContext) : laneBindingFromContext(currentContext);
    setLaneState(lane, () => ({
      ...EMPTY_LANE,
      binding,
    }));
  }

  async function refreshConversations() {
    if (!currentContext.businessId) return;
    const items = await listConversations(currentContext.businessId);
    setConversations(items.sort((left, right) => conversationSortValue(right) - conversationSortValue(left)));
  }

  async function loadConversation(conversationId: string, lane?: WinstonLane) {
    const nextLane = lane || activeLaneRef.current;
    const detail = await getConversation(conversationId);
    if (!detail) return;
    setLaneState(nextLane, (current) => ({
      ...current,
      conversationId: detail.conversation_id,
      messages: mapConversationMessages(detail.messages),
      binding: laneBindingFromConversation(detail),
      trace: null,
      debug: null,
      thinking: false,
      thinkingStatus: undefined,
    }));
    setActiveLane(nextLane);
    setOpen(true);
  }

  async function hydrateFromQuery(conversationId: string | null, lane?: WinstonLane | null) {
    if (!conversationId) return;
    const targetLane = lane || activeLaneRef.current;
    const currentLaneState = targetLane === "general" ? generalState : contextualState;
    if (currentLaneState.conversationId === conversationId) return;
    await loadConversation(conversationId, targetLane);
  }

  async function archiveConversationById(conversationId: string) {
    await archiveConversation(conversationId);
    if (generalState.conversationId === conversationId) resetLane("general");
    if (contextualState.conversationId === conversationId) resetLane("contextual");
    await refreshConversations();
  }

  async function sendPrompt(lane: WinstonLane = activeLaneRef.current, promptOverride?: string) {
    const laneState = lane === "general" ? generalState : contextualState;
    const binding = lane === "general" ? generalBinding : contextualBinding;
    const message = (promptOverride ?? laneState.draft).trim();

    // Capture and clear any pending clarification question before this send
    const pendingQuestion = laneState.pendingQuestion;
    if (pendingQuestion) {
      setLaneState(lane, (current) => ({ ...current, pendingQuestion: null }));
    }
    const businessId = binding?.businessId || currentContext.businessId;
    const envId = binding?.envId || currentContext.envId;

    if (!message) return;
    if (!businessId) {
      setLaneState(lane, (current) => ({
        ...current,
        messages: [
          ...current.messages,
          makeMessage("assistant", "Winston needs a business context before this conversation can start."),
        ],
      }));
      return;
    }

    const userMessage = makeMessage("user", message);
    const assistantId =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `assistant_${Date.now()}`;

    setLaneState(lane, (current) => ({
      ...current,
      draft: promptOverride ? current.draft : "",
      thinking: true,
      thinkingStatus: "Grounding in the current workspace...",
      terminalState: null,
      messages: [
        ...current.messages,
        userMessage,
        {
          id: assistantId,
          role: "assistant",
          content: "",
          createdAt: Date.now(),
          responseBlocks: [],
        },
      ],
      binding: current.binding || binding,
    }));

    let conversationId = laneState.conversationId;
    let effectiveBinding = laneState.binding || binding;

    try {
      if (!conversationId) {
        const detail = await createConversation({
          business_id: businessId,
          env_id: envId || undefined,
          thread_kind: lane,
          scope_type: effectiveBinding?.scopeType || (lane === "general" ? "business" : currentContext.scopeType),
          scope_id: effectiveBinding?.scopeId || null,
          scope_label: effectiveBinding?.scopeLabel || currentContext.scopeLabel,
          launch_source: `winston_companion_${lane}`,
          context_summary: effectiveBinding?.contextSummary || currentContext.currentNarrative,
          last_route: pathname || currentContext.route || null,
        });
        conversationId = detail.conversation_id;
        effectiveBinding = laneBindingFromConversation(detail) || effectiveBinding;
        setLaneState(lane, (current) => ({
          ...current,
          conversationId: detail.conversation_id,
          binding: effectiveBinding,
        }));
        await refreshConversations();
      }

      const envelope = withBinding(
        buildAssistantContextEnvelope({
          context: commandContext,
          snapshot: contextSnapshot,
          conversationId,
          launchSource: `winston_companion_${lane}`,
        }),
        effectiveBinding,
      );

      const result = await streamAi({
        message,
        business_id: businessId,
        env_id: envId || undefined,
        conversation_id: conversationId || undefined,
        context_envelope: envelope,
        pending_continuation: pendingQuestion !== null,
        pending_question_text: pendingQuestion ?? undefined,
        onStatus: (status) => {
          setLaneState(lane, (current) => ({
            ...current,
            thinkingStatus: status,
          }));
        },
        onToken: (token) => {
          setLaneState(lane, (current) => {
            const messages = [...current.messages];
            const last = messages[messages.length - 1];
            if (last?.id === assistantId) {
              messages[messages.length - 1] = {
                ...last,
                content: `${last.content || ""}${token}`,
              };
            }
            return {
              ...current,
              messages,
            };
          });
        },
        onResponseBlock: (block) => {
          setLaneState(lane, (current) => {
            const messages = [...current.messages];
            const last = messages[messages.length - 1];
            if (last?.id === assistantId) {
              messages[messages.length - 1] = {
                ...last,
                responseBlocks: [...(last.responseBlocks || []), block],
              };
            }
            return {
              ...current,
              messages,
            };
          });
        },
        onDone: (payload) => {
          // Clear thinking immediately when backend sends 'done' event,
          // rather than waiting for post-stream persistence to close the HTTP stream.
          const terminalState = (payload as Record<string, unknown>)?.terminal_state as TerminalState || "complete";
          setLaneState(lane, (current) => {
            // Detect if the last assistant message ended with a question (pending clarification).
            const lastMsg = [...current.messages].reverse().find((m) => m.role === "assistant");
            const lastText = (lastMsg?.content ?? "").trim();
            const newPendingQuestion = lastText.endsWith("?") ? lastText : null;
            return {
              ...current,
              thinking: false,
              thinkingStatus: undefined,
              terminalState,
              pendingQuestion: newPendingQuestion,
            };
          });
        },
      });

      setLaneState(lane, (current) => ({
        ...current,
        conversationId: conversationId || current.conversationId,
        binding: effectiveBinding,
        // thinking already cleared by onDone callback when 'done' SSE event arrives
        trace: result.trace,
        debug: result.debug,
      }));
      await refreshConversations();
    } catch (error) {
      console.error("Winston companion request failed", {
        lane,
        businessId,
        envId,
        conversationId: conversationId || laneState.conversationId || null,
        error,
      });
      const userMessage =
        conversationId || laneState.conversationId
          ? "Winston ran into a response error. Please try again."
          : "Something went wrong starting the conversation. Please try again.";
      setLaneState(lane, (current) => ({
        ...current,
        thinking: false,
        thinkingStatus: undefined,
        terminalState: "failed",
        messages: current.messages.map((item) =>
          item.id === assistantId
            ? {
                ...item,
                content: userMessage,
              }
            : item,
        ),
      }));
    }
  }

  function adoptCurrentContext() {
    setContextualState(() => ({
      ...EMPTY_LANE,
      binding: laneBindingFromContext(currentContext),
    }));
    setActiveLane("contextual");
  }

  async function uploadAttachment(lane: WinstonLane, file: File) {
    const laneState = lane === "general" ? generalState : contextualState;
    const binding = lane === "general" ? generalBinding : contextualBinding;
    const businessId = binding?.businessId || currentContext.businessId;
    const envId = binding?.envId || currentContext.envId;

    if (!businessId || !envId) return;

    const id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `attachment_${Date.now()}`;

    setLaneState(lane, (current) => ({
      ...current,
      attachments: [...current.attachments, { id, name: file.name, status: "uploading" }],
    }));

    try {
      const init = await initUpload({
        business_id: businessId,
        filename: file.name,
        content_type: file.type || "application/octet-stream",
        title: file.name,
        virtual_path: `copilot/${envId}/${file.name.replaceAll("/", "_")}`,
        env_id: envId,
      });

      const uploadRes = await fetch(init.signed_upload_url, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type || "application/octet-stream" },
      });

      if (!uploadRes.ok) throw new Error(`Upload failed (${uploadRes.status})`);

      const sha256 = await computeSha256(file);
      await completeUpload({
        document_id: init.document_id,
        version_id: init.version_id,
        sha256,
        byte_size: file.size,
        env_id: envId,
      });

      setLaneState(lane, (current) => ({
        ...current,
        attachments: current.attachments.map((attachment) =>
          attachment.id === id
            ? {
                ...attachment,
                document_id: init.document_id,
                version_id: init.version_id,
                status: "indexing",
              }
            : attachment,
        ),
      }));

      await fetch("/api/ai/gateway/index", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          document_id: init.document_id,
          version_id: init.version_id,
          business_id: businessId,
          env_id: envId,
        }),
      });

      setLaneState(lane, (current) => ({
        ...current,
        attachments: current.attachments.map((attachment) =>
          attachment.id === id ? { ...attachment, status: "ready" } : attachment,
        ),
      }));
    } catch (error) {
      setLaneState(lane, (current) => ({
        ...current,
        attachments: current.attachments.map((attachment) =>
          attachment.id === id
            ? {
                ...attachment,
                status: "failed",
                error: error instanceof Error ? error.message : "Upload failed",
              }
            : attachment,
        ),
      }));
    }
  }

  function removeAttachment(lane: WinstonLane, attachmentId: string) {
    setLaneState(lane, (current) => ({
      ...current,
      attachments: current.attachments.filter((attachment) => attachment.id !== attachmentId),
    }));
  }

  function openFullWorkspace() {
    const preferredEnvId = activeBinding?.envId || currentContext.envId;
    const preferredConversationId = activeState.conversationId;
    const params = new URLSearchParams();
    if (preferredConversationId) params.set("conversation_id", preferredConversationId);
    params.set("lane", activeLane);
    const href = preferredEnvId ? `/lab/env/${preferredEnvId}/copilot` : "/app/winston";
    startTransition(() => {
      router.push(params.toString() ? `${href}?${params.toString()}` : href);
    });
  }

  const recentConversations = useMemo(() => {
    const laneKind = activeLane === "general" ? "general" : "contextual";
    return conversations
      .filter((conversation) => !conversation.archived && conversation.thread_kind === laneKind)
      .sort((left, right) => conversationSortValue(right) - conversationSortValue(left));
  }, [activeLane, conversations]);

  const value = useMemo<WinstonCompanionContextValue>(
    () => ({
      open,
      shouldRender,
      launcherRaised,
      activeLane,
      currentContext,
      contextualBinding,
      activeBinding,
      activeState,
      generalState,
      contextualState,
      contextSnapshot,
      contextEnvelope,
      conversations,
      recentConversations,
      exploreQuery,
      exploreResults,
      exploreLoading,
      needsContextAdoption,
      openDrawer,
      closeDrawer,
      toggleDrawer,
      setActiveLane,
      setDraft: (lane, value) => {
        setLaneState(lane, (current) => ({ ...current, draft: value }));
      },
      sendPrompt,
      loadConversation,
      resetLane,
      archiveConversationById,
      adoptCurrentContext,
      setExploreQuery,
      uploadAttachment,
      removeAttachment,
      openFullWorkspace,
      hydrateFromQuery,
    }),
    [
      activeBinding,
      activeLane,
      activeState,
      contextEnvelope,
      contextSnapshot,
      contextualBinding,
      contextualState,
      conversations,
      currentContext,
      exploreLoading,
      exploreQuery,
      exploreResults,
      generalState,
      launcherRaised,
      needsContextAdoption,
      open,
      recentConversations,
      shouldRender,
    ],
  );

  // Expose a test API for Playwright e2e eval tests.
  // Always expose when on localhost — no flag check needed.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const isLocal = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
    if (!isLocal) return;

    (window as any).__winston_test = {
      setDraft: (text: string) => {
        setLaneState(activeLane, (current) => ({ ...current, draft: text }));
      },
      sendPrompt: (text?: string) => sendPrompt(activeLane, text),
      getActiveLane: () => activeLane,
    };

    return () => {
      delete (window as any).__winston_test;
    };
  }, [activeLane, sendPrompt]);

  return (
    <WinstonCompanionContextStore.Provider value={value}>
      {children}
    </WinstonCompanionContextStore.Provider>
  );
}

export function useWinstonCompanion() {
  const context = useContext(WinstonCompanionContextStore);
  if (!context) {
    throw new Error("useWinstonCompanion must be used within WinstonCompanionProvider");
  }
  return context;
}

export function companionLauncherOffsetClass(raised: boolean) {
  return cn(
    "right-4 md:right-6",
    raised ? "bottom-[5.5rem] md:bottom-6" : "bottom-4 md:bottom-6",
  );
}
