"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useToast } from "@/components/ui/Toast";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Textarea } from "@/components/ui/Textarea";
import { Input } from "@/components/ui/Input";
import PlanCard from "@/components/commandbar/PlanCard";
import ExecutionTimeline from "@/components/commandbar/ExecutionTimeline";
import VerificationCard from "@/components/commandbar/VerificationCard";
import {
  type CommandContextKey,
  type CommandMessage,
  loadHistory,
  makeMessage,
  persistHistory,
  resolveCommandContext,
} from "@/lib/commandbar/store";
import type {
  CommandAuditEvent,
  CommandContext,
  CommandRun,
  ExecutionPlan,
  PlanResponse,
} from "@/lib/commandbar/types";

type RunStatusResponse = {
  run: CommandRun;
  plan: {
    plan_id: string;
    risk: string;
    read_only: boolean;
    intent_summary: string;
    impacted_entities: string[];
    mutations: string[];
    requires_double_confirmation: boolean;
    double_confirmation_phrase: string | null;
  } | null;
  audit_events: CommandAuditEvent[];
};

type PlanEdits = {
  envId: string;
  businessId: string;
  name: string;
  industry: string;
  notes: string;
};

function formatContextBadge(contextKey: CommandContextKey) {
  if (contextKey === "global") return "Global";
  return contextKey;
}

function readRouteEnvId(pathname: string): string | null {
  const m = pathname.match(/^\/lab\/env\/([^/]+)/);
  return m?.[1] || null;
}

function readContextFromBrowser(): CommandContext {
  if (typeof window === "undefined") return {};
  const route = window.location.pathname;
  const envFromRoute = readRouteEnvId(route);
  const envFromStorage = window.localStorage.getItem("demo_lab_env_id");
  const businessId = window.localStorage.getItem("bos_business_id");
  const selected = window.getSelection?.()?.toString().trim() || "";

  return {
    currentEnvId: envFromRoute || envFromStorage || null,
    currentBusinessId: businessId || null,
    route,
    selection: selected || null,
  };
}

function planEditsFromPlan(plan: ExecutionPlan): PlanEdits {
  return {
    envId: String(plan.intent.parameters.envId || plan.context.currentEnvId || ""),
    businessId: String(plan.intent.parameters.businessId || plan.context.currentBusinessId || ""),
    name: String(plan.intent.parameters.name || ""),
    industry: String(plan.intent.parameters.industry || ""),
    notes: String(plan.intent.parameters.notes || ""),
  };
}

function formatRunSummary(run: CommandRun): string {
  if (run.status === "completed") return "Execution completed with verification.";
  if (run.status === "failed") return "Execution failed. Review step errors and logs.";
  if (run.status === "cancelled") return "Execution was cancelled.";
  if (run.status === "needs_clarification") return "Execution paused: clarification required.";
  if (run.status === "blocked") return "Execution was blocked.";
  return "Execution in progress.";
}

export default function GlobalCommandBar() {
  const { push } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [contextKey, setContextKey] = useState<CommandContextKey>("global");
  const [messages, setMessages] = useState<CommandMessage[]>([]);
  const [prompt, setPrompt] = useState("");
  const [planning, setPlanning] = useState(false);
  const [activePlan, setActivePlan] = useState<ExecutionPlan | null>(null);
  const [editingPlan, setEditingPlan] = useState(false);
  const [planEdits, setPlanEdits] = useState<PlanEdits>({
    envId: "",
    businessId: "",
    name: "",
    industry: "",
    notes: "",
  });
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [run, setRun] = useState<CommandRun | null>(null);
  const [auditEvents, setAuditEvents] = useState<CommandAuditEvent[]>([]);
  const [showAudit, setShowAudit] = useState(false);
  const [logsOpen, setLogsOpen] = useState(false);
  const transcriptRef = useRef<HTMLDivElement>(null);

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
    if (!transcriptRef.current) return;
    transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
  }, [messages, isOpen]);

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
    if (!run?.runId) return;
    if (run.status !== "running" && run.status !== "pending") return;

    let cancelled = false;
    const poll = async () => {
      try {
        const response = await fetch(`/api/commands/runs/${encodeURIComponent(run.runId)}`, {
          cache: "no-store",
        });
        if (!response.ok) return;
        const payload = (await response.json()) as RunStatusResponse;
        if (cancelled) return;

        setRun(payload.run);
        setAuditEvents(payload.audit_events || []);

        if (payload.run.status === "completed" || payload.run.status === "failed" || payload.run.status === "cancelled") {
          setMessages((prev) => [...prev, makeMessage("assistant", formatRunSummary(payload.run))]);
        }
      } catch {
        // ignore polling blips
      }
    };

    void poll();
    const id = window.setInterval(() => {
      void poll();
    }, 800);

    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [run?.runId, run?.status]);

  const contextSnapshot = useMemo(() => readContextFromBrowser(), [isOpen, contextKey]);

  const canSend = !planning && !(run && run.status === "running");

  const clearHistory = () => {
    setMessages([]);
    persistHistory(contextKey, []);
    setActivePlan(null);
    setRun(null);
    setAuditEvents([]);
  };

  const submitPlanRequest = async (text: string) => {
    const response = await fetch("/api/commands/plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: text,
        context: readContextFromBrowser(),
      }),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || "Failed to build plan");
    }
    return (await response.json()) as PlanResponse;
  };

  const sendPrompt = async () => {
    const text = prompt.trim();
    if (!text || !canSend) return;

    setMessages((prev) => [...prev, makeMessage("user", text)]);
    setPrompt("");
    setPlanning(true);
    setRun(null);
    setAuditEvents([]);
    setShowAudit(false);

    try {
      const payload = await submitPlanRequest(text);
      setActivePlan(payload.plan);
      setPlanEdits(planEditsFromPlan(payload.plan));
      setEditingPlan(false);
      setMessages((prev) => [...prev, makeMessage("assistant", "Draft plan ready. Review and confirm to execute.")]);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Planning failed";
      setMessages((prev) => [...prev, makeMessage("system", message)]);
      push({ title: "Planning failed", description: message, variant: "danger" });
    } finally {
      setPlanning(false);
    }
  };

  const cancelDraftPlan = () => {
    setActivePlan(null);
    setEditingPlan(false);
    setConfirmOpen(false);
    setConfirmText("");
    setMessages((prev) => [...prev, makeMessage("system", "Plan cancelled. No changes were made.")]);
  };

  const stopRun = async () => {
    if (!run?.runId) return;
    await fetch(`/api/commands/runs/${encodeURIComponent(run.runId)}/cancel`, {
      method: "POST",
    }).catch(() => null);
  };

  const confirmAndRun = async () => {
    if (!activePlan) return;
    if (activePlan.clarification?.needed) {
      const reason =
        activePlan.clarification.reason ||
        "I couldn't resolve a unique target. Please edit the plan and retry.";
      setMessages((prev) => [...prev, makeMessage("system", reason)]);
      push({ title: "Needs clarification", description: reason, variant: "warning" });
      return;
    }
    setConfirming(true);

    const overrides = {
      envId: planEdits.envId || undefined,
      businessId: planEdits.businessId || undefined,
      name: planEdits.name || undefined,
      industry: planEdits.industry || undefined,
      notes: planEdits.notes || undefined,
    };

    try {
      const confirmResponse = await fetch("/api/commands/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan_id: activePlan.planId,
          confirmation_text: confirmText,
          overrides,
        }),
      });
      if (!confirmResponse.ok) {
        const err = await confirmResponse.json().catch(() => ({}));
        throw new Error(err.error || "Confirmation failed");
      }
      const confirmedPayload = (await confirmResponse.json()) as {
        confirm_token: string;
        plan?: ExecutionPlan;
      };

      const effectivePlan = confirmedPayload.plan || activePlan;
      setActivePlan(effectivePlan);

      const executeResponse = await fetch("/api/commands/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan_id: effectivePlan.planId,
          confirm_token: confirmedPayload.confirm_token,
        }),
      });
      if (!executeResponse.ok) {
        const err = await executeResponse.json().catch(() => ({}));
        throw new Error(err.error || "Execution failed to start");
      }
      const executePayload = (await executeResponse.json()) as { run_id: string; status: CommandRun["status"] };
      const startedRun: CommandRun = {
        runId: executePayload.run_id,
        planId: effectivePlan.planId,
        status: executePayload.status,
        createdAt: Date.now(),
        cancelled: false,
        logs: [],
        stepResults: [],
        verification: [],
      };
      setRun(startedRun);
      setConfirmOpen(false);
      setConfirmText("");
      setMessages((prev) => [...prev, makeMessage("assistant", "Execution started." )]);
      push({ title: "Execution started", description: `Run ${executePayload.run_id}`, variant: "success" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to execute plan";
      setMessages((prev) => [...prev, makeMessage("system", message)]);
      push({ title: "Execution blocked", description: message, variant: "danger" });
    } finally {
      setConfirming(false);
    }
  };

  return (
    <>
      <button
        type="button"
        data-testid="global-commandbar-toggle"
        onClick={() => setIsOpen((prev) => !prev)}
        className="fixed bottom-5 right-5 z-[55] inline-flex h-11 w-11 items-center justify-center rounded-full border border-bm-border/70 bg-bm-surface/80 text-bm-text shadow-bm-card backdrop-blur-md hover:bg-bm-surface"
        aria-label="Toggle command bar"
        title="Commands"
      >
        <span className="text-base">⌘</span>
      </button>

      {isOpen ? (
        <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true">
          <button
            type="button"
            className="absolute inset-0 bg-black/45"
            aria-label="Close command console"
            onClick={() => setIsOpen(false)}
          />

          <div className="absolute bottom-0 right-0 h-[90vh] w-full max-w-2xl rounded-t-2xl border border-bm-border/70 bg-bm-bg p-4 shadow-bm-card md:right-4 md:top-4 md:h-auto md:max-h-[92vh] md:rounded-2xl">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold">Commands</h2>
                <p className="text-xs text-bm-muted">Context: {formatContextBadge(contextKey)}</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="accent">Plan → Confirm → Execute</Badge>
                <Button
                  size="sm"
                  variant="ghost"
                  data-testid="global-commandbar-close"
                  onClick={() => setIsOpen(false)}
                >
                  Close
                </Button>
              </div>
            </div>

            <div className="mb-3 rounded-xl border border-bm-border/70 bg-bm-surface/35 p-3">
              <p className="text-[11px] uppercase tracking-[0.12em] text-bm-muted2">Context Header</p>
              <div className="mt-2 grid grid-cols-1 gap-2 text-xs text-bm-muted md:grid-cols-3">
                <p>
                  Env: <span className="text-bm-text">{contextSnapshot.currentEnvId || "none"}</span>
                </p>
                <p>
                  Business: <span className="text-bm-text">{contextSnapshot.currentBusinessId || "none"}</span>
                </p>
                <p>
                  Route: <span className="text-bm-text">{contextSnapshot.route || "/"}</span>
                </p>
              </div>
            </div>

            <div
              ref={transcriptRef}
              data-testid="global-commandbar-output"
              className="h-[26vh] overflow-y-auto rounded-xl border border-bm-border/70 bg-bm-surface/35 p-3 md:h-56"
            >
              {messages.length === 0 ? (
                <p className="text-sm text-bm-muted">
                  Type a command. The system will interpret, draft a plan, then wait for your confirmation before executing.
                </p>
              ) : (
                <div className="space-y-2">
                  {messages.map((message) => (
                    <div
                      key={message.id}
                      className="rounded-lg border border-bm-border/60 bg-bm-surface/30 p-2"
                    >
                      <p className="mb-1 text-[11px] uppercase tracking-[0.12em] text-bm-muted2">
                        {message.role}
                      </p>
                      <p className="whitespace-pre-wrap text-sm text-bm-text">{message.content}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-3 space-y-3 overflow-y-auto max-h-[42vh] pr-1">
              {planning ? (
                <div className="rounded-xl border border-bm-border/70 bg-bm-surface/25 p-3">
                  <p className="mb-2 text-sm text-bm-muted">Interpreting...</p>
                  <div className="space-y-2 animate-pulse">
                    <div className="h-3 rounded bg-bm-surface/80" />
                    <div className="h-3 rounded bg-bm-surface/60" />
                    <div className="h-3 w-2/3 rounded bg-bm-surface/60" />
                  </div>
                </div>
              ) : null}

              {activePlan && !run ? (
                <PlanCard
                  plan={activePlan}
                  onConfirm={() => setConfirmOpen(true)}
                  onCancel={cancelDraftPlan}
                  onToggleEdit={() => setEditingPlan((prev) => !prev)}
                  editing={editingPlan}
                  edits={planEdits}
                  onEditChange={(key, value) =>
                    setPlanEdits((prev) => ({
                      ...prev,
                      [key]: value,
                    }))
                  }
                  confirmDisabled={Boolean(activePlan.clarification?.needed)}
                />
              ) : null}

              {activePlan && run ? (
                <>
                  <ExecutionTimeline
                    run={run}
                    steps={activePlan.steps}
                    onStop={stopRun}
                    logsOpen={logsOpen}
                    onToggleLogs={() => setLogsOpen((prev) => !prev)}
                  />
                  <VerificationCard items={run.verification || []} />
                  <div className="rounded-xl border border-bm-border/70 bg-bm-surface/25 p-3">
                    <button
                      type="button"
                      className="text-xs text-bm-muted hover:text-bm-text"
                      onClick={() => setShowAudit((prev) => !prev)}
                    >
                      {showAudit ? "Hide audit details" : "View audit details"}
                    </button>
                    {showAudit ? (
                      <div className="mt-2 max-h-40 overflow-y-auto rounded-md bg-bm-bg/70 p-2 text-xs text-bm-muted">
                        {auditEvents.length ? (
                          <ul className="space-y-1">
                            {auditEvents.map((event) => (
                              <li key={event.id}>
                                {new Date(event.at).toLocaleTimeString()} - {event.kind}
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p>No audit records yet.</p>
                        )}
                      </div>
                    ) : null}
                  </div>
                </>
              ) : null}
            </div>

            <div className="mt-3 space-y-2">
              <Textarea
                data-testid="global-commandbar-input"
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                rows={3}
                placeholder="Type a command..."
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void sendPrompt();
                  }
                }}
                disabled={!canSend}
              />
              <div className="flex items-center justify-between gap-2">
                <Button size="sm" variant="secondary" onClick={clearHistory}>
                  Clear
                </Button>
                <Button
                  data-testid="global-commandbar-send"
                  size="sm"
                  onClick={() => void sendPrompt()}
                  disabled={!canSend || !prompt.trim()}
                >
                  Send
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <Dialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Confirm Plan Execution"
        description="No mutation steps will run until this is confirmed."
        footer={
          <>
            <Button size="sm" variant="secondary" onClick={() => setConfirmOpen(false)} disabled={confirming}>
              Back
            </Button>
            <Button
              size="sm"
              onClick={() => void confirmAndRun()}
              disabled={confirming || Boolean(activePlan?.clarification?.needed)}
            >
              {confirming ? "Starting..." : "Confirm & Run"}
            </Button>
          </>
        }
      >
        {activePlan ? (
          <div className="space-y-3 text-sm">
            <p>
              Risk level: <span className="font-medium">{activePlan.risk.toUpperCase()}</span>
            </p>
            <p>Mutations: {activePlan.mutations.length ? activePlan.mutations.join(", ") : "Read-only"}</p>
            {activePlan.clarification?.needed ? (
              <div className="rounded-lg border border-bm-warning/40 bg-bm-warning/10 p-3 text-sm">
                {activePlan.clarification.reason || "Clarification is required before execution."}
              </div>
            ) : null}
            {activePlan.requiresDoubleConfirmation ? (
              <div className="space-y-2 rounded-lg border border-bm-danger/40 bg-bm-danger/10 p-3">
                <p className="text-xs text-bm-muted">
                  High-risk action detected. Type <span className="font-semibold text-bm-text">{activePlan.doubleConfirmationPhrase}</span> to continue.
                </p>
                <Input
                  value={confirmText}
                  onChange={(event) => setConfirmText(event.target.value)}
                  placeholder={activePlan.doubleConfirmationPhrase || "CONFIRM DELETE"}
                />
              </div>
            ) : null}
          </div>
        ) : null}
      </Dialog>
    </>
  );
}
