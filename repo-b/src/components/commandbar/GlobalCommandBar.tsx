"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import AssistantShell, { type AssistantStage } from "@/components/commandbar/AssistantShell";
import AdvancedDrawer from "@/components/commandbar/AdvancedDrawer";
import ConfirmPanel from "@/components/commandbar/ConfirmPanel";
import ConversationPane from "@/components/commandbar/ConversationPane";
import ExecutePanel from "@/components/commandbar/ExecutePanel";
import PlanPanel from "@/components/commandbar/PlanPanel";
import QuickActions, { type QuickAction } from "@/components/commandbar/QuickActions";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Textarea";
import { useToast } from "@/components/ui/Toast";
import {
  type AssistantApiError,
  type AssistantApiTrace,
  type DiagnosticsCheck,
  buildExecutionSummary,
  cancelRun,
  confirmPlan,
  createPlan,
  fetchContextSnapshot,
  getAssistantFeatureFlags,
  getRunStatus,
  executePlan,
  runDiagnostics,
} from "@/lib/commandbar/assistantApi";
import {
  type CommandContextKey,
  type CommandMessage,
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
  return {
    env: snapshot?.selectedEnv?.client_name || fallback.currentEnvId || "none",
    business: snapshot?.business?.name || fallback.currentBusinessId || "none",
    route: snapshot?.route || fallback.route || "/",
  };
}

function toFriendlyError(error: unknown): string {
  if (error instanceof ContractValidationError) {
    return "Winston received an unexpected response format. Review Advanced / Debug for raw payload details.";
  }
  if (error instanceof Error) return error.message;
  return "Unknown assistant error";
}

function deriveQuickActions(pathname: string, context: ContextSnapshot | null): QuickAction[] {
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
  const [prompt, setPrompt] = useState("");
  const [contextSnapshot, setContextSnapshot] = useState<ContextSnapshot | null>(null);
  const [authState, setAuthState] = useState<"unknown" | "authenticated" | "unauthenticated">("unknown");
  const [planning, setPlanning] = useState(false);
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

  const clearHistory = () => {
    setMessages([]);
    persistHistory(contextKey, []);
    setActivePlan(null);
    setRun(null);
    setPrompt("");
    setRaw({});
    setStage("plan");
  };

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
    void requestPlan(next);
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

  const canSend = authenticated && !planning && !(run && run.status === "running");

  return (
    <>
      <button
        type="button"
        data-testid="global-commandbar-toggle"
        onClick={() => setIsOpen((prev) => !prev)}
        className="fixed bottom-5 right-5 z-[55] inline-flex h-11 items-center justify-center rounded-full border border-bm-border/70 bg-bm-surface/85 px-4 text-sm font-medium text-bm-text shadow-bm-card backdrop-blur-md hover:bg-bm-surface"
        aria-label="Open Winston command center"
        title="Winston Commands"
      >
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
        leftPane={
          <div className="flex h-full min-h-0 flex-col">
            <div className="border-b border-bm-border/60 p-3">
              {authenticated ? null : (
                <div className="mb-3 rounded-lg border border-bm-warning/40 bg-bm-warning/10 p-2 text-xs text-bm-text">
                  Authentication required to run commands. Sign in, then reopen this panel.
                </div>
              )}
              <QuickActions
                actions={quickActions}
                disabled={!authenticated}
                onSelect={(action) => {
                  appendMessage("user", action.prompt);
                  void requestPlan(action.prompt);
                }}
              />
            </div>

            <div className="min-h-0 flex-1 overflow-hidden">
              <ConversationPane
                contextKey={contextKey}
                messages={messages}
                examples={EMPTY_EXAMPLES}
                recentRuns={recentRuns}
              />
            </div>

            <div className="border-t border-bm-border/60 p-3">
              <Textarea
                data-testid="global-commandbar-input"
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                rows={3}
                placeholder="Tell Winston what you want to do..."
                aria-label="Command input"
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void onSend();
                  }
                }}
                disabled={!canSend}
              />
              <div className="mt-2 flex items-center justify-between gap-2">
                <Button type="button" size="sm" variant="secondary" onClick={clearHistory}>
                  Clear
                </Button>
                <Button
                  type="button"
                  data-testid="global-commandbar-send"
                  size="sm"
                  disabled={!canSend || !prompt.trim()}
                  onClick={() => void onSend()}
                >
                  Plan Command
                </Button>
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
              onRunDiagnostics={() => void onRunDiagnostics()}
            />
          </div>
        }
      />
    </>
  );
}
