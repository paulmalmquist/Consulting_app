"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import AssistantShell, { type AssistantStage } from "@/components/commandbar/AssistantShell";
import AdvancedDrawer from "@/components/commandbar/AdvancedDrawer";
import ActiveContextBar from "@/components/commandbar/ActiveContextBar";
import ConfirmPanel from "@/components/commandbar/ConfirmPanel";
import ConversationPane from "@/components/commandbar/ConversationPane";
import ExecutePanel from "@/components/commandbar/ExecutePanel";
import PlanPanel from "@/components/commandbar/PlanPanel";
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
  type WaterfallRunSummary,
  loadHistoryState,
  makeMessage,
  persistHistoryState,
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

function derivePlaceholder(pathname: string): string {
  const isAssetPage = /\/re\/assets\/[^/]+/.test(pathname);
  const isFundPage = /\/re\/funds\/[^/]+/.test(pathname) && !pathname.includes("/new");
  const isInvestmentPage = /\/re\/investments\/[^/]+/.test(pathname);

  if (isAssetPage || isInvestmentPage) {
    return "Analyze this asset, run scenario, model returns...";
  }
  if (isFundPage) {
    return "Run waterfall, stress test, model scenarios...";
  }
  return "Ask Winston or run a command...";
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
  const [waterfallRuns, setWaterfallRuns] = useState<WaterfallRunSummary[]>([]);
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
  const [attachedFile, setAttachedFile] = useState<{ name: string; content: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const autoResize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, []);

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
      const history = loadHistoryState(next);
      setMessages(history.messages);
      setWaterfallRuns(history.waterfallRuns);
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
    persistHistoryState(contextKey, { messages, waterfallRuns });
  }, [contextKey, messages, waterfallRuns]);

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
    setWaterfallRuns([]);
    persistHistoryState(contextKey, { messages: [], waterfallRuns: [] });
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
    const base = (message || prompt).trim();
    if (!base) return;
    const next = attachedFile
      ? `${base}\n\n[Attached file: ${attachedFile.name}]\n${attachedFile.content}`
      : base;

    appendMessage("user", attachedFile ? `${base}\n📎 ${attachedFile.name}` : base);
    setPrompt("");
    setAttachedFile(null);
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
        const sr = structuredResults[0];

        // Dashboard results: store spec in localStorage for the dashboard page
        if (sr.result_type === "dynamic_dashboard" && (sr as Record<string, unknown>).dashboard_spec) {
          const specKey = `winston_dashboard_${Date.now()}`;
          try {
            localStorage.setItem(specKey, JSON.stringify((sr as Record<string, unknown>).dashboard_spec));
          } catch { /* quota exceeded — still show card */ }
          // Inject specKey into action params so the card's buttons can navigate
          if (sr.card?.actions) {
            for (const action of sr.card.actions) {
              if (action.params) {
                (action.params as Record<string, string>).spec_key = specKey;
              }
            }
          }
        }

        const msg = makeMessage("assistant", result.answer);
        msg.structuredResult = sr;
        setMessages((prev) => [...prev, msg]);
        const card = sr.card;
        const scenarioRows = card.scenarios ?? [];
        const sessionRuns = card.session_waterfall_runs ?? [];
        if (
          sr.result_type.startsWith("waterfall") ||
          sr.result_type === "session_waterfall_summary"
        ) {
          const nextRuns =
            sessionRuns.length > 0
              ? sessionRuns
              : scenarioRows.map((row) => ({
                  run_id: String(row.scenario_id || `wf_${Date.now()}`),
                  scenario_name: String(row.scenario_id || ""),
                  key_metrics: {
                    irr: row.gross_irr,
                    tvpi: row.tvpi,
                    carry: row.dpi,
                    nav: row.nav,
                  },
                }));
          if (nextRuns.length > 0) {
            setWaterfallRuns((prev) => {
              const merged = [...prev];
              for (const run of nextRuns) {
                const idx = merged.findIndex((item) => item.run_id === run.run_id);
                if (idx >= 0) {
                  merged[idx] = run;
                } else {
                  merged.push(run);
                }
              }
              return merged.slice(-20);
            });
          }
        }
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
          <div className="flex h-full min-h-0">
            {/* Analytical sessions sidebar */}
            <div className="flex w-60 flex-shrink-0 flex-col border-r border-bm-border/40 bg-bm-bg/40">
              <div className="flex items-center justify-between px-3 py-2.5 border-b border-bm-border/30">
                <span className="text-[10px] font-semibold uppercase tracking-widest text-bm-muted2">Sessions</span>
                <button
                  type="button"
                  onClick={startNewConversation}
                  className="rounded-md p-1 text-bm-muted hover:text-bm-accent hover:bg-bm-accent/10 transition-colors"
                  title="New session"
                >
                  <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none">
                    <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto py-1" style={{ scrollbarWidth: "thin", scrollbarColor: "hsl(var(--bm-border)/0.5) transparent" }}>
                {conversations.length === 0 ? (
                  <div className="px-3 py-6 text-center">
                    <p className="text-[11px] text-bm-muted2 leading-relaxed">No previous sessions</p>
                    <p className="text-[10px] text-bm-muted2/60 mt-1">Analyses will appear here</p>
                  </div>
                ) : (
                  conversations.map((c) => (
                    <button
                      key={c.conversation_id}
                      type="button"
                      onClick={async () => {
                        setConversationId(c.conversation_id);
                        setShowConversationList(false);
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
                          // Fall through
                        }
                      }}
                      className={`w-full text-left px-3 py-2.5 transition-colors border-l-2 ${
                        c.conversation_id === conversationId
                          ? "border-bm-accent text-bm-text bg-bm-accent/8"
                          : "border-transparent text-bm-muted hover:bg-bm-surface/40 hover:text-bm-text"
                      }`}
                    >
                      <div className="truncate text-[12px] font-medium leading-tight">{c.title || "Untitled Session"}</div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-[10px] text-bm-muted2">{c.message_count} turn{c.message_count !== 1 ? "s" : ""}</span>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>

            {/* AI Workspace */}
            <div className="flex min-w-0 flex-1 flex-col">
              <ActiveContextBar
                workspace={workspace}
                resolvedScope={assistantDebug?.resolvedScope as { resolved_scope_type?: string; entity_type?: string; entity_name?: string; environment_id?: string } | null}
              />

              <div className="min-h-0 flex-1 overflow-hidden">
                <ConversationPane
                  contextKey={contextKey}
                  messages={messages}
                  examples={EMPTY_EXAMPLES}
                  recentRuns={recentRuns}
                  thinking={planning}
                  thinkingStatus={thinkingStatus}
                  onAction={(action: StructuredResultAction) => {
                    if (action.action === "open_dashboard" || action.action === "edit_dashboard") {
                      const specKey = (action.params as Record<string, string>)?.spec_key;
                      const envId = context.currentEnvId;
                      if (envId && specKey) {
                        window.open(`/lab/env/${envId}/re/dashboards?from_winston=${specKey}`, "_blank");
                      }
                      return;
                    }
                    const prompt = `${action.label} for fund ${(action.params as Record<string, string>)?.fund_id || "this fund"}`;
                    void onSend(prompt);
                  }}
                  onExampleClick={(example: string) => void onSend(example)}
                />
              </div>

              <div className="border-t border-bm-border/40 px-4 py-3">
                {/* File attachment preview */}
                {attachedFile && (
                  <div className="mb-2 flex items-center gap-1.5 rounded-md border border-bm-border/40 bg-bm-surface/40 px-2 py-1">
                    <svg className="h-3.5 w-3.5 flex-shrink-0 text-bm-accent" viewBox="0 0 16 16" fill="none">
                      <path d="M9 2H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V6L9 2z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
                      <path d="M9 2v4h4" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
                    </svg>
                    <span className="min-w-0 flex-1 truncate text-[11px] text-bm-text">{attachedFile.name}</span>
                    <button
                      type="button"
                      onClick={() => setAttachedFile(null)}
                      className="text-bm-muted2 hover:text-bm-text transition-colors"
                      title="Remove attachment"
                    >
                      <svg className="h-3 w-3" viewBox="0 0 12 12" fill="none">
                        <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                      </svg>
                    </button>
                  </div>
                )}

                <div className="flex items-end gap-2 rounded-lg border border-bm-border/50 bg-bm-bg/60 px-3 py-2 transition-colors focus-within:border-bm-accent/40 focus-within:shadow-[0_0_0_1px_hsl(var(--bm-accent)/0.15)]">
                  <textarea
                    ref={textareaRef}
                    data-testid="global-commandbar-input"
                    value={prompt}
                    onChange={(event) => {
                      setPrompt(event.target.value);
                      autoResize();
                    }}
                    rows={1}
                    placeholder={derivePlaceholder(pathname)}
                    aria-label="Command input"
                    className="flex-1 border-0 bg-transparent shadow-none ring-0 outline-none resize-none text-sm p-0 min-h-[24px] max-h-[120px] placeholder:text-bm-muted2 text-bm-text leading-relaxed"
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        void onSend();
                      }
                    }}
                  />
                  <div className="flex items-center gap-1 flex-shrink-0 pb-0.5">
                    {/* File attach button */}
                    <input
                      ref={fileInputRef}
                      type="file"
                      className="hidden"
                      accept=".txt,.csv,.json,.md,.pdf"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        const reader = new FileReader();
                        reader.onload = (ev) => {
                          const text = (ev.target?.result as string) || "";
                          setAttachedFile({ name: file.name, content: text.slice(0, 8000) });
                        };
                        reader.readAsText(file);
                        e.target.value = "";
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="rounded p-1 text-bm-muted2 transition-colors hover:text-bm-text"
                      title="Attach file"
                    >
                      <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none">
                        <path d="M13.5 8.5l-6 6a4 4 0 0 1-5.657-5.657l6.5-6.5a2.5 2.5 0 0 1 3.536 3.536l-6.5 6.5a1 1 0 0 1-1.414-1.414L10 5.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </button>
                    {messages.length > 0 && (
                      <button
                        type="button"
                        onClick={clearHistory}
                        className="rounded p-1 text-bm-muted2 transition-colors hover:text-bm-text"
                        title="Clear session"
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
