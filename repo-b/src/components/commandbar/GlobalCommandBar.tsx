"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import AssistantShell, { type AssistantStage } from "@/components/commandbar/AssistantShell";
import AdvancedDrawer from "@/components/commandbar/AdvancedDrawer";
import ActiveContextBar from "@/components/commandbar/ActiveContextBar";
import ConfirmPanel from "@/components/commandbar/ConfirmPanel";
import ConversationPane from "@/components/commandbar/ConversationPane";
import ExecutePanel from "@/components/commandbar/ExecutePanel";
import PlanPanel from "@/components/commandbar/PlanPanel";
import QuickActions, { type QuickAction } from "@/components/commandbar/QuickActions";
import { Textarea } from "@/components/ui/Textarea";
import { useToast } from "@/components/ui/Toast";
import {
  type AskAiDebug,
  type AssistantApiError,
  type AssistantApiTrace,
  type ConversationSummary,
  type DiagnosticsCheck,
  askAi,
  buildExecutionSummary,
  cancelRun,
  confirmPlan,
  createConversation,
  createPlan,
  fetchContextSnapshot,
  getAssistantFeatureFlags,
  getRunStatus,
  executePlan,
  listConversations,
  runDiagnostics,
} from "@/lib/commandbar/assistantApi";
import { buildAssistantContextEnvelope } from "@/lib/commandbar/contextEnvelope";
import {
  type CommandContextKey,
  type CommandMessage,
  type StructuredResult,
  type StructuredResultAction,
  loadHistory,
  makeMessage,
  persistHistory,
  resolveCommandContext,
} from "@/lib/commandbar/store";
import type { CommandContext, CommandRun, ContextSnapshot } from "@/lib/commandbar/types";
import { ContractValidationError, type AssistantPlan } from "@/lib/commandbar/schemas";

type PlanOverrides = {
  envId: string;
  businessId: string;
  name: string;
  industry: string;
  notes: string;
};

const FEATURE_FLAGS = getAssistantFeatureFlags();

function readRouteEnvId(pathname: string): string | null {
  const match = pathname.match(/^\/lab\/env\/([^/]+)/);
  return match?.[1] || null;
}

function readContextFromBrowser(pathname: string): CommandContext {
  if (typeof window === "undefined") return { route: pathname || "/" };

  const envFromRoute = readRouteEnvId(pathname);
  const envFromStorage = window.localStorage.getItem("demo_lab_env_id");
  const businessId = window.localStorage.getItem("bos_business_id");
  const selected = window.getSelection?.()?.toString().trim() || "";

  return {
    currentEnvId: envFromRoute || envFromStorage || null,
    currentBusinessId: businessId || null,
    route: pathname || window.location.pathname,
    selection: selected || null,
  };
}

function overridesFromPlan(plan: AssistantPlan): PlanOverrides {
  return {
    envId: String(plan.intent.parameters.envId || plan.context.currentEnvId || ""),
    businessId: String(plan.intent.parameters.businessId || plan.context.currentBusinessId || ""),
    name: String(plan.intent.parameters.name || ""),
    industry: String(plan.intent.parameters.industry || ""),
    notes: String(plan.intent.parameters.notes || ""),
  };
}

function workspaceFromContext(snapshot: ContextSnapshot | null, fallback: CommandContext) {
  const base: { env: string; business: string; route: string; [key: string]: string } = {
    env: snapshot?.selectedEnv?.client_name || fallback.currentEnvId || "none",
    business: snapshot?.business?.name || fallback.currentBusinessId || "none",
    route: snapshot?.route || fallback.route || "/",
  };

  // Inject asset-level context when on an asset page
  const route = fallback.route || "";
  const assetMatch = route.match(/\/re\/assets\/([^/]+)/);
  if (assetMatch) {
    base.assetId = assetMatch[1];
    base.context = "asset";
  }
  const fundMatch = route.match(/\/re\/funds\/([^/]+)/);
  if (fundMatch && !route.includes("/new")) {
    base.fundId = fundMatch[1];
    base.context = base.context || "fund";
  }

  return base;
}

function toFriendlyError(error: unknown): string {
  if (error instanceof ContractValidationError) {
    return "Winston received an unexpected response format. Review Advanced / Debug for raw payload details.";
  }
  if (error instanceof Error) return error.message;
  return "Unknown assistant error";
}

function deriveQuickActions(pathname: string, context: ContextSnapshot | null): QuickAction[] {
  // Context-aware prompts for asset/fund pages — REPE workflow starters
  const isAssetPage = /\/re\/assets\/[^/]+/.test(pathname);
  const isFundPage = /\/re\/funds\/[^/]+/.test(pathname) && !pathname.includes("/new");
  const isInvestmentPage = /\/re\/investments\/[^/]+/.test(pathname);

  if (isAssetPage || isInvestmentPage) {
    return [
      { id: "sale-scenario", label: "Run Sale Scenario", prompt: "Model a sale of this asset at current market cap rate and show the fund impact.", description: "Hypothetical sale analysis with IRR/TVPI impact" },
      { id: "stress-cap", label: "Stress Exit Cap +50bps", prompt: "What happens if exit cap rate expands by 50 basis points?", description: "Cap rate sensitivity analysis" },
      { id: "investment-irr", label: "Show Investment IRR", prompt: "Show gross and net IRR for this investment.", description: "Investment return metrics" },
      { id: "run-waterfall", label: "Run Waterfall", prompt: "Run waterfall distribution including this asset's contribution.", description: "LP/GP distribution calculation" },
      { id: "compare-base", label: "Compare to Base", prompt: "Compare current scenario to base case.", description: "Scenario comparison with deltas" },
    ];
  }

  if (isFundPage) {
    return [
      { id: "fund-waterfall", label: "Run Waterfall", prompt: "Run the waterfall distribution for this fund.", description: "LP/GP distribution with carry calculation" },
      { id: "fund-metrics", label: "Fund Performance", prompt: "Show IRR, TVPI, DPI, and RVPI for this fund.", description: "Fund-level performance metrics" },
      { id: "portfolio-stress", label: "Portfolio Stress", prompt: "Stress all assets with 75bps cap rate expansion and show fund NAV impact.", description: "Portfolio-wide cap rate stress test" },
      { id: "lp-summary", label: "LP Summary", prompt: "Show capital accounts and partner returns.", description: "LP capital accounts and waterfall allocations" },
      { id: "scenario-compare", label: "Compare Scenarios", prompt: "Compare base case to most recent stress scenario.", description: "Side-by-side scenario comparison" },
    ];
  }

  const defaults: QuickAction[] = [
    {
      id: "list-environments",
      label: "List Environments",
      prompt: "List environments and highlight any needing attention.",
      description: "Read-only environment overview",
    },
    {
      id: "run-health",
      label: "Workspace Health",
      prompt: "Run a workspace health check and summarize issues.",
      description: "Health check with no mutations",
    },
    {
      id: "recent-docs",
      label: "Recent Documents",
      prompt: "List recent documents for the current workspace.",
      description: "Read-only document discovery",
    },
  ];

  if (pathname.startsWith("/tasks")) {
    defaults.unshift({
      id: "tasks-summary",
      label: "Task Summary",
      prompt: "Summarize high-priority tasks for this workspace.",
      description: "Read-only task report",
    });
  }

  if (context?.selectedEnv?.env_id) {
    defaults.unshift({
      id: "env-context",
      label: "Current Env Snapshot",
      prompt: `Summarize environment ${context.selectedEnv.env_id} with active modules and recent run context.`,
      description: "Read-only summary tied to current environment",
    });
  }

  return defaults.slice(0, 5);
}

function derivePlaceholder(pathname: string): string {
  const isAssetPage = /\/re\/assets\/[^/]+/.test(pathname);
  const isFundPage = /\/re\/funds\/[^/]+/.test(pathname) && !pathname.includes("/new");
  const isInvestmentPage = /\/re\/investments\/[^/]+/.test(pathname);

  if (isAssetPage || isInvestmentPage) {
    return "Ask about this asset, run a scenario, or explain returns...";
  }
  if (isFundPage) {
    return "Ask about this fund, run waterfall, or model scenarios...";
  }
  return "Ask Winston anything...";
}

const EMPTY_EXAMPLES = [
  "List environments and summarize readiness.",
  "Run a health check for this workspace.",
  "Show the last successful command run and verification links.",
  "Plan a read-only review of recent documents.",
];

export default function GlobalCommandBar() {
  const pathname = usePathname();
  const { push } = useToast();

  const [isOpen, setIsOpen] = useState(false);
  const [stage, setStage] = useState<AssistantStage>("plan");
  const [contextKey, setContextKey] = useState<CommandContextKey>("global");
  const [messages, setMessages] = useState<CommandMessage[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [showConversationList, setShowConversationList] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [contextSnapshot, setContextSnapshot] = useState<ContextSnapshot | null>(null);
  const [authState, setAuthState] = useState<"unknown" | "authenticated" | "unauthenticated">("unknown");
  const [planning, setPlanning] = useState(false);
  const [thinkingStatus, setThinkingStatus] = useState<string | undefined>();
  const [confirming, setConfirming] = useState(false);
  const [activePlan, setActivePlan] = useState<AssistantPlan | null>(null);
  const [run, setRun] = useState<CommandRun | null>(null);
  const [overrides, setOverrides] = useState<PlanOverrides>({
    envId: "",
    businessId: "",
    name: "",
    industry: "",
    notes: "",
  });
  const [confirmText, setConfirmText] = useState("");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [assistantDebug, setAssistantDebug] = useState<AskAiDebug | null>(null);
  const [diagnostics, setDiagnostics] = useState<DiagnosticsCheck[]>([]);
  const [runningDiagnostics, setRunningDiagnostics] = useState(false);
  const [traces, setTraces] = useState<AssistantApiTrace[]>([]);
  const [recentRuns, setRecentRuns] = useState<ContextSnapshot["recentRuns"]>([]);
  const [raw, setRaw] = useState<{
    contextSnapshot?: unknown;
    plan?: unknown;
    confirm?: unknown;
    execute?: unknown;
    run?: unknown;
    assistant?: unknown;
    error?: unknown;
  }>({});

  const context = useMemo(() => readContextFromBrowser(pathname), [pathname]);
  const workspace = useMemo(() => workspaceFromContext(contextSnapshot, context), [contextSnapshot, context]);
  const quickActions = useMemo(() => deriveQuickActions(pathname, contextSnapshot), [pathname, contextSnapshot]);
  const authenticated = authState === "authenticated";

  const appendTrace = (trace: AssistantApiTrace) => {
    setTraces((prev) => [trace, ...prev].slice(0, 30));
  };

  const appendMessage = (role: CommandMessage["role"], content: string) => {
    setMessages((prev) => [...prev, makeMessage(role, content)]);
  };

  useEffect(() => {
    const syncContext = () => {
      const next = resolveCommandContext();
      setContextKey(next);
      setMessages(loadHistory(next));
    };

    syncContext();
    const interval = window.setInterval(syncContext, 1200);
    const onStorage = () => syncContext();

    window.addEventListener("storage", onStorage);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  useEffect(() => {
    persistHistory(contextKey, messages);
  }, [contextKey, messages]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const shortcut = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k";
      if (!shortcut) return;

      const target = event.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      const inInput = tag === "input" || tag === "textarea" || target?.isContentEditable;
      if (inInput) return;

      event.preventDefault();
      setIsOpen((prev) => !prev);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    const onPrefillPrompt = (event: Event) => {
      const custom = event as CustomEvent<{ prompt?: string }>;
      const nextPrompt = custom.detail?.prompt?.trim() || "";
      setIsOpen(true);
      setStage("plan");
      if (nextPrompt) setPrompt(nextPrompt);
    };

    window.addEventListener("winston-prefill-prompt", onPrefillPrompt as EventListener);
    return () => window.removeEventListener("winston-prefill-prompt", onPrefillPrompt as EventListener);
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    let cancelled = false;
    const refresh = async () => {
      try {
        const payload = await fetchContextSnapshot(context);
        if (cancelled) return;
        setContextSnapshot(payload.snapshot);
        setRecentRuns(payload.snapshot.recentRuns || []);
        setAuthState("authenticated");
        appendTrace(payload.trace);
        setRaw((prev) => ({ ...prev, contextSnapshot: payload.raw }));
      } catch (error) {
        if (cancelled) return;
        const isAuthError =
          typeof error === "object" &&
          error !== null &&
          "status" in error &&
          Number((error as AssistantApiError).status) === 401;
        setAuthState(isAuthError ? "unauthenticated" : "unknown");
        setRaw((prev) => ({ ...prev, error }));
      }
    };

    void refresh();
    return () => {
      cancelled = true;
    };
  }, [isOpen, context]);

  // Load conversation list and ensure active conversation when command bar opens
  useEffect(() => {
    if (!isOpen || !context.currentBusinessId) return;

    let cancelled = false;
    const loadConversations = async () => {
      try {
        const list = await listConversations(context.currentBusinessId!);
        if (cancelled) return;
        setConversations(list);
      } catch {
        // Non-fatal
      }
    };

    void loadConversations();
    return () => { cancelled = true; };
  }, [isOpen, context.currentBusinessId]);

  useEffect(() => {
    if (!run?.runId) return;
    if (!["running", "pending"].includes(run.status)) return;

    let cancelled = false;
    const poll = async () => {
      try {
        const payload = await getRunStatus(run.runId);
        if (cancelled) return;

        appendTrace(payload.trace);
        setRun(payload.run);
        setRaw((prev) => ({ ...prev, run: payload.raw }));

        if (!["running", "pending"].includes(payload.run.status)) {
          setRecentRuns((prev) => {
            const next = [
              {
                runId: payload.run.runId,
                planId: payload.run.planId,
                status: payload.run.status,
                createdAt: payload.run.createdAt,
              },
              ...prev.filter((item) => item.runId !== payload.run.runId),
            ];
            return next.slice(0, 8);
          });

          appendMessage("assistant", `Run ${payload.run.runId} finished with status ${payload.run.status}.`);
        }
      } catch (error) {
        if (cancelled) return;
        appendMessage("system", toFriendlyError(error));
      }
    };

    void poll();
    const id = window.setInterval(() => {
      void poll();
    }, 900);

    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [run?.runId, run?.status]);

  const startNewConversation = () => {
    setMessages([]);
    persistHistory(contextKey, []);
    setActivePlan(null);
    setRun(null);
    setPrompt("");
    setRaw({});
    setAssistantDebug(null);
    setStage("plan");
    setConversationId(null);
    setShowConversationList(false);
  };

  const clearHistory = startNewConversation;

  const ensureContextSnapshot = async () => {
    if (contextSnapshot) return contextSnapshot;
    const payload = await fetchContextSnapshot(context);
    setContextSnapshot(payload.snapshot);
    setRecentRuns(payload.snapshot.recentRuns || []);
    appendTrace(payload.trace);
    setRaw((prev) => ({ ...prev, contextSnapshot: payload.raw }));
    return payload.snapshot;
  };

  const requestPlan = async (message: string, contextOverride?: Partial<CommandContext>) => {
    if (!authenticated) {
      appendMessage("system", "Authentication required. Sign in to generate plans.");
      setAuthState("unauthenticated");
      return;
    }

    const content = message.trim();
    if (!content) return;

    setPlanning(true);
    setStage("plan");

    const nextContext: CommandContext = {
      ...context,
      ...(contextOverride || {}),
    };

    try {
      const snapshot = await ensureContextSnapshot();
      const response = await createPlan({
        message: content,
        context: nextContext,
        contextSnapshot: snapshot,
      });

      setActivePlan(response.plan);
      setOverrides(overridesFromPlan(response.plan));
      appendTrace(response.trace);
      setRaw((prev) => ({ ...prev, plan: response.raw }));
      appendMessage("assistant", "Plan drafted. Review details before confirmation.");
    } catch (error) {
      const friendly = toFriendlyError(error);
      setRaw((prev) => ({ ...prev, error }));
      appendMessage("system", friendly);
      push({ title: "Planning failed", description: friendly, variant: "danger" });
    } finally {
      setPlanning(false);
    }
  };

  const onSend = async (message?: string) => {
    const next = (message || prompt).trim();
    if (!next) return;

    appendMessage("user", next);
    setPrompt("");
    setRun(null);
    setPlanning(true);
    setThinkingStatus(undefined);

    try {
      const snapshot = await ensureContextSnapshot();
      const derivedBusinessId =
        context.currentBusinessId ||
        snapshot.business?.business_id ||
        snapshot.selectedEnv?.business_id ||
        null;
      const derivedEnvId =
        context.currentEnvId ||
        snapshot.selectedEnv?.env_id ||
        null;

      // Build the envelope first so effectiveBusinessId includes the app-context bridge
      // (bridge?.environment.active_business_id), which may be set even when localStorage is empty.
      const contextEnvelope = buildAssistantContextEnvelope({
        context: {
          ...context,
          currentBusinessId: derivedBusinessId,
          currentEnvId: derivedEnvId,
        },
        snapshot,
        conversationId: conversationId,
        launchSource: "winston_modal",
      });
      const effectiveBusinessId =
        contextEnvelope.ui.active_business_id ||
        contextEnvelope.session.org_id ||
        derivedBusinessId ||
        undefined;
      const effectiveEnvId =
        contextEnvelope.ui.active_environment_id ||
        contextEnvelope.session.session_env_id ||
        derivedEnvId ||
        undefined;

      // Auto-create conversation using effectiveBusinessId (includes bridge data, not just localStorage)
      let activeConvoId = conversationId;
      if (!activeConvoId && effectiveBusinessId) {
        try {
          const convo = await createConversation({
            business_id: effectiveBusinessId,
            env_id: effectiveEnvId || undefined,
          });
          activeConvoId = convo.conversation_id;
          setConversationId(activeConvoId);
          contextEnvelope.thread.thread_id = activeConvoId;
        } catch {
          // Non-fatal — proceed without conversation persistence
        }
      }

      setRaw((prev) => ({
        ...prev,
        assistant: {
          contextEnvelope,
          resolvedScope: null,
          toolCalls: [],
          toolResults: [],
        },
      }));

      const result = await askAi({
        message: next,
        workspace: workspace as Record<string, string>,
        business_id: effectiveBusinessId,
        env_id: effectiveEnvId,
        conversation_id: activeConvoId || undefined,
        context_envelope: contextEnvelope,
        onStatus: setThinkingStatus,
      });
      appendTrace(result.trace);
      setRaw((prev) => ({ ...prev, assistant: result.debug }));
      setAssistantDebug(result.debug);

      // Check for structured results from REPE fast-path
      const structuredResults = (result.debug as Record<string, unknown>).structuredResults as StructuredResult[] | undefined;
      if (structuredResults && structuredResults.length > 0) {
        const msg = makeMessage("assistant", result.answer);
        msg.structuredResult = structuredResults[0];
        setMessages((prev) => [...prev, msg]);
      } else {
        appendMessage("assistant", result.answer);
      }
    } catch (error) {
      const friendly = toFriendlyError(error);
      appendMessage("system", friendly);
    } finally {
      setPlanning(false);
      setThinkingStatus(undefined);
    }
  };

  const onConfirmExecute = async () => {
    if (!activePlan) return;
    if (!authenticated) {
      appendMessage("system", "Authentication required. Sign in to execute plans.");
      return;
    }

    setConfirming(true);
    setStage("confirm");

    try {
      const confirmed = await confirmPlan({
        planId: activePlan.planId,
        confirmationText: confirmText,
        overrides: {
          envId: overrides.envId || undefined,
          businessId: overrides.businessId || undefined,
          name: overrides.name || undefined,
          industry: overrides.industry || undefined,
          notes: overrides.notes || undefined,
        },
      });
      appendTrace(confirmed.trace);
      setRaw((prev) => ({ ...prev, confirm: confirmed.raw }));

      const effectivePlan = confirmed.plan || activePlan;
      setActivePlan(effectivePlan);

      const executed = await executePlan({
        planId: effectivePlan.planId,
        confirmToken: confirmed.confirmToken,
      });
      appendTrace(executed.trace);
      setRaw((prev) => ({ ...prev, execute: executed.raw }));

      const startedRun: CommandRun = {
        runId: executed.runId,
        planId: effectivePlan.planId,
        status: executed.status,
        createdAt: Date.now(),
        cancelled: false,
        logs: [
          `request_id=${executed.trace.requestId}`,
          `Run ${executed.runId} accepted.`,
        ],
        stepResults: [],
        verification: [],
      };

      setRun(startedRun);
      setStage("execute");
      setConfirmText("");
      appendMessage("assistant", `Execution started for run ${executed.runId}.`);
      push({
        title: "Execution started",
        description: `Run ${executed.runId}`,
        variant: "success",
      });
    } catch (error) {
      const friendly = toFriendlyError(error);
      setRaw((prev) => ({ ...prev, error }));
      appendMessage("system", friendly);
      push({ title: "Execution blocked", description: friendly, variant: "danger" });
    } finally {
      setConfirming(false);
    }
  };

  const onCancelRun = async () => {
    if (!run?.runId) return;
    try {
      const payload = await cancelRun(run.runId);
      appendTrace(payload.trace);
      setRun((prev) => (prev ? { ...prev, status: payload.status } : prev));
      appendMessage("assistant", `Run ${run.runId} cancelled.`);
    } catch (error) {
      appendMessage("system", toFriendlyError(error));
    }
  };

  const onRetry = () => {
    if (!activePlan) return;
    setStage("confirm");
    appendMessage("assistant", "Review confirmation details and run again.");
  };

  const onCopySummary = async () => {
    const summary = buildExecutionSummary(activePlan, run);
    try {
      await navigator.clipboard.writeText(summary);
      push({ title: "Summary copied", description: "Run summary copied to clipboard.", variant: "success" });
    } catch {
      push({ title: "Copy failed", description: "Clipboard permission is unavailable.", variant: "warning" });
    }
  };

  const onRunDiagnostics = async () => {
    setRunningDiagnostics(true);
    try {
      const checks = await runDiagnostics({ context, contextSnapshot });
      setDiagnostics(checks);
      const failed = checks.some((check) => !check.ok);
      push({
        title: failed ? "Diagnostics found issues" : "Diagnostics passed",
        description: failed ? "Review Advanced / Debug for details." : "All checks completed successfully.",
        variant: failed ? "warning" : "success",
      });
    } catch (error) {
      const friendly = toFriendlyError(error);
      appendMessage("system", friendly);
      push({ title: "Diagnostics failed", description: friendly, variant: "danger" });
    } finally {
      setRunningDiagnostics(false);
    }
  };

  const hasMutations = activePlan && activePlan.mutations.length > 0;

  return (
    <>
      <button
        type="button"
        data-testid="global-commandbar-toggle"
        onClick={() => setIsOpen((prev) => !prev)}
        className="fixed bottom-5 right-5 z-[55] inline-flex h-10 items-center justify-center gap-2 rounded-full border border-bm-border/50 bg-bm-surface/90 pl-3 pr-4 text-sm font-medium text-bm-text shadow-bm-card backdrop-blur-md transition-all duration-150 hover:border-bm-accent/40 hover:shadow-bm-glow"
        aria-label="Open Winston command center"
        title="Winston (Cmd+K)"
      >
        <svg className="h-4 w-4 text-bm-accent" viewBox="0 0 16 16" fill="none">
          <path
            d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.414 1.414M11.536 11.536l1.414 1.414M3.05 12.95l1.414-1.414M11.536 4.464l1.414-1.414"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
        Winston
      </button>

      <AssistantShell
        open={isOpen}
        onClose={() => setIsOpen(false)}
        stage={stage}
        authenticated={authState === "authenticated" ? true : authState === "unauthenticated" ? false : null}
        workspace={workspace}
        advancedOpen={advancedOpen}
        onToggleAdvanced={() => setAdvancedOpen((prev) => !prev)}
        showRightPane={Boolean(hasMutations) || advancedOpen}
        leftPane={
          <div className="flex h-full min-h-0 flex-col">
            <ActiveContextBar
              workspace={workspace}
              resolvedScope={assistantDebug?.resolvedScope as { resolved_scope_type?: string; entity_type?: string; entity_name?: string; environment_id?: string } | null}
            />
            <div className="border-b border-bm-border/60 p-2.5">
              <QuickActions
                actions={quickActions}
                disabled={false}
                onSelect={(action) => void onSend(action.prompt)}
              />
            </div>

            {/* Conversation header */}
            <div className="flex items-center justify-between border-b border-bm-border/30 px-3 py-1.5">
              <button
                type="button"
                onClick={() => setShowConversationList((prev) => !prev)}
                className="text-[11px] text-bm-muted2 hover:text-bm-text transition-colors"
                title="Show conversation history"
              >
                {conversationId ? (conversations.find((c) => c.conversation_id === conversationId)?.title || "Current conversation") : "New conversation"}
              </button>
              <button
                type="button"
                onClick={startNewConversation}
                className="text-[11px] text-bm-accent hover:text-bm-text transition-colors"
                title="Start new conversation"
              >
                + New
              </button>
            </div>

            {/* Conversation list dropdown */}
            {showConversationList && conversations.length > 0 && (
              <div className="border-b border-bm-border/30 max-h-40 overflow-y-auto">
                {conversations.map((c) => (
                  <button
                    key={c.conversation_id}
                    type="button"
                    onClick={async () => {
                      setConversationId(c.conversation_id);
                      setShowConversationList(false);
                      // Load messages from server
                      try {
                        const { getConversation: getConvo } = await import("@/lib/commandbar/assistantApi");
                        const detail = await getConvo(c.conversation_id);
                        if (detail?.messages) {
                          setMessages(
                            detail.messages
                              .filter((m: { role: string }) => m.role === "user" || m.role === "assistant")
                              .map((m: { message_id: string; role: string; content: string; created_at: string | null }) =>
                                makeMessage(m.role as "user" | "assistant", m.content, m.message_id),
                              ),
                          );
                        }
                      } catch {
                        // Fall through — conversation loads empty
                      }
                    }}
                    className={`w-full text-left px-3 py-1.5 text-[12px] hover:bg-bm-surface/60 transition-colors truncate ${
                      c.conversation_id === conversationId ? "text-bm-accent" : "text-bm-muted"
                    }`}
                  >
                    {c.title || "Untitled"} <span className="text-bm-muted2">({c.message_count})</span>
                  </button>
                ))}
              </div>
            )}

            <div className="min-h-0 flex-1 overflow-hidden">
              <ConversationPane
                contextKey={contextKey}
                messages={messages}
                examples={EMPTY_EXAMPLES}
                recentRuns={recentRuns}
                thinking={planning}
                thinkingStatus={thinkingStatus}
                onAction={(action: StructuredResultAction) => {
                  // Convert structured result action into a prompt
                  const prompt = `${action.label} for fund ${(action.params as Record<string, string>)?.fund_id || "this fund"}`;
                  void onSend(prompt);
                }}
              />
            </div>

            <div className="border-t border-bm-border/40 p-3">
              <div className="flex items-end gap-2 rounded-lg border border-bm-border/50 bg-bm-bg/60 px-3 py-2 transition-colors focus-within:border-bm-accent/40 focus-within:shadow-[0_0_0_1px_hsl(var(--bm-accent)/0.15)]">
                <Textarea
                  data-testid="global-commandbar-input"
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                  rows={1}
                  placeholder={derivePlaceholder(pathname)}
                  aria-label="Command input"
                  className="!border-0 !bg-transparent !shadow-none !ring-0 resize-none text-sm !p-0 !min-h-[24px] placeholder:text-bm-muted2"
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      void onSend();
                    }
                  }}
                />
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {messages.length > 0 && (
                    <button
                      type="button"
                      onClick={clearHistory}
                      className="rounded p-1 text-bm-muted2 transition-colors hover:text-bm-text"
                      title="Clear conversation"
                    >
                      <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none">
                        <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                      </svg>
                    </button>
                  )}
                  <button
                    type="button"
                    data-testid="global-commandbar-send"
                    disabled={!prompt.trim() || planning}
                    onClick={() => void onSend()}
                    className="flex h-7 w-7 items-center justify-center rounded-md bg-bm-accent text-bm-accentContrast transition-all disabled:opacity-30 disabled:cursor-not-allowed hover:brightness-110"
                    title="Send (Enter)"
                  >
                    <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none">
                      <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                </div>
              </div>
              <p className="mt-1.5 text-[10px] text-bm-muted2 text-center">Enter to send, Shift+Enter for new line</p>
            </div>
          </div>
        }
        rightPane={
          <div className="flex h-full min-h-0 flex-col overflow-hidden">
            <PlanPanel
              plan={activePlan}
              planning={planning}
              onNeedConfirm={() => setStage("confirm")}
              onReset={() => {
                setActivePlan(null);
                setRun(null);
                setStage("plan");
              }}
              onClarificationChoice={(value) => {
                if (!activePlan) return;
                appendMessage("user", `Clarification: ${value}`);
                void requestPlan(activePlan.intent.rawMessage, { currentEnvId: value });
              }}
            />

            <ConfirmPanel
              plan={activePlan}
              stageActive={stage === "confirm"}
              overrides={overrides}
              onOverrideChange={(key, value) =>
                setOverrides((prev) => ({
                  ...prev,
                  [key]: value,
                }))
              }
              confirmText={confirmText}
              onConfirmTextChange={setConfirmText}
              confirming={confirming}
              onBack={() => setStage("plan")}
              onConfirmExecute={() => void onConfirmExecute()}
            />

            <ExecutePanel
              plan={activePlan}
              run={run}
              running={Boolean(run && (run.status === "running" || run.status === "pending"))}
              onCancel={() => void onCancelRun()}
              onRetry={onRetry}
              onCopySummary={() => void onCopySummary()}
            />

            <AdvancedDrawer
              open={advancedOpen}
              context={contextSnapshot}
              traces={traces}
              diagnostics={diagnostics}
              runningDiagnostics={runningDiagnostics}
              raw={raw}
              flags={FEATURE_FLAGS}
              assistantDebug={assistantDebug}
              onRunDiagnostics={() => void onRunDiagnostics()}
            />
          </div>
        }
      />
    </>
  );
}
