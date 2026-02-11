"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Textarea";
import {
  type CommandContextKey,
  type CommandMessage,
  loadHistory,
  makeMessage,
  persistHistory,
  resolveCommandContext,
} from "@/lib/commandbar/store";
import { getStoredLabRole, type LabRole } from "@/lib/lab/rbac";
import { logLabAuditEvent } from "@/lib/lab/clientAudit";

type HealthResponse = {
  ok: boolean;
  mode: string;
  message?: string;
};

function formatContextBadge(contextKey: CommandContextKey) {
  if (contextKey === "global") return "Global";
  return contextKey;
}

export default function GlobalCommandBar() {
  const [isOpen, setIsOpen] = useState(false);
  const [contextKey, setContextKey] = useState<CommandContextKey>("global");
  const [messages, setMessages] = useState<CommandMessage[]>([]);
  const [prompt, setPrompt] = useState("");
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [role, setRole] = useState<LabRole>(() => getStoredLabRole());
  const [running, setRunning] = useState(false);
  const [runId, setRunId] = useState<string | null>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const loggedConnectedRef = useRef(false);

  const publicAiMode = process.env.NEXT_PUBLIC_AI_MODE || "off";

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
    const syncRole = () => setRole(getStoredLabRole());
    window.addEventListener("storage", syncRole);
    return () => window.removeEventListener("storage", syncRole);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    fetch("/api/ai/codex/health")
      .then((r) => r.json())
      .then((payload: HealthResponse) => setHealth(payload))
      .catch(() =>
        setHealth({
          ok: false,
          mode: "off",
          message: "Unavailable",
        })
      );
  }, [isOpen]);

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
    persistHistory(contextKey, messages);
  }, [contextKey, messages]);

  useEffect(() => {
    if (!transcriptRef.current) return;
    transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
  }, [messages, isOpen]);

  useEffect(() => {
    if (health?.ok && !loggedConnectedRef.current) {
      // Explicitly confirm successful local AI connectivity in browser console.
      console.info("[Business OS] Local AI connected", {
        mode: health.mode,
        message: health.message || "Connected",
      });
      loggedConnectedRef.current = true;
    }
    if (!health?.ok) {
      loggedConnectedRef.current = false;
    }
  }, [health]);

  const statusLabel = useMemo(() => {
    if (!health) return "Checking";
    if (health.ok) return "Connected";
    if (publicAiMode !== "local") return "Local-only";
    return "Unavailable";
  }, [health, publicAiMode]);

  const canSend =
    publicAiMode === "local" && health?.ok === true && !running && role !== "viewer";

  const sendPrompt = async () => {
    const text = prompt.trim();
    if (!text || running) return;

    const userMessage = makeMessage("user", text);
    logLabAuditEvent("commandbar_submitted", {
      envId: contextKey.startsWith("env:") ? contextKey.slice(4) : undefined,
      details: {
        contextKey,
        role,
        promptLength: text.length,
      },
    });
    setMessages((prev) => [...prev, userMessage]);
    setPrompt("");
    setRunning(true);

    const assistantId =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `assistant_${Date.now()}`;
    setMessages((prev) => [...prev, makeMessage("assistant", "", assistantId)]);

    try {
      const runResponse = await fetch("/api/ai/codex/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contextKey, prompt: text }),
      });

      if (!runResponse.ok) {
        const err = await runResponse.json().catch(() => ({}));
        throw new Error(err.error || "Run failed");
      }

      const runPayload = (await runResponse.json()) as { runId?: string; answer?: string };
      if ("answer" in runPayload && typeof (runPayload as { answer?: unknown }).answer === "string") {
        const finalAnswer = (runPayload as { answer: string }).answer;
        setMessages((prev) =>
          prev.map((item) =>
            item.id === assistantId ? { ...item, content: finalAnswer } : item
          )
        );
        setRunning(false);
        setRunId(null);
        return;
      }
      if (!runPayload.runId) {
        throw new Error("Run started without runId.");
      }

      setRunId(runPayload.runId);

      const source = new EventSource(
        `/api/ai/codex/stream?runId=${encodeURIComponent(runPayload.runId)}`
      );

      source.addEventListener("token", (event) => {
        const data = JSON.parse((event as MessageEvent).data) as { text?: string };
        const chunk = data.text || "";
        if (!chunk) return;
        setMessages((prev) =>
          prev.map((item) =>
            item.id === assistantId ? { ...item, content: `${item.content}${chunk}` } : item
          )
        );
      });

      source.addEventListener("error", (event) => {
        const data = JSON.parse((event as MessageEvent).data || "{}") as { message?: string };
        setMessages((prev) => [
          ...prev,
          makeMessage("system", data.message || "Command stream error."),
        ]);
      });

      source.addEventListener("final", () => {
        source.close();
        setRunning(false);
        setRunId(null);
      });

      source.onerror = () => {
        source.close();
        setRunning(false);
        setRunId(null);
      };
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        makeMessage(
          "system",
          error instanceof Error ? error.message : "Command failed to start"
        ),
      ]);
      setRunning(false);
      setRunId(null);
    }
  };

  const clearHistory = () => {
    setMessages([]);
    persistHistory(contextKey, []);
  };

  const cancelRunRequest = async () => {
    if (!runId) return;
    await fetch("/api/ai/codex/cancel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ runId }),
    }).catch(() => null);
    setRunning(false);
    setRunId(null);
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
          <div className="absolute bottom-0 right-0 h-[82vh] w-full max-w-xl rounded-t-2xl border border-bm-border/70 bg-bm-bg p-4 shadow-bm-card md:right-4 md:top-4 md:h-auto md:rounded-2xl">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold">Commands</h2>
                <p className="text-xs text-bm-muted">Context: {formatContextBadge(contextKey)}</p>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className="rounded-full border border-bm-border/70 px-2 py-1 text-xs text-bm-muted"
                  data-testid="global-commandbar-status"
                >
                  {statusLabel}
                </span>
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

            <div
              ref={transcriptRef}
              data-testid="global-commandbar-output"
              className="h-[48vh] overflow-y-auto rounded-xl border border-bm-border/70 bg-bm-surface/35 p-3 md:h-80"
            >
              {messages.length === 0 ? (
                <p className="text-sm text-bm-muted">
                  {publicAiMode === "local"
                    ? "Ask a command to run against your local codex bridge."
                    : "Local Codex server is not connected. Set AI_MODE=local and run codex app-server."}
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

            <div className="mt-3 space-y-2">
              {role === "viewer" ? (
                <p className="text-xs text-bm-warning">
                  Viewer role can review transcripts but cannot submit commands.
                </p>
              ) : null}
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
                <div className="flex items-center gap-2">
                  {running ? (
                    <Button size="sm" variant="secondary" onClick={cancelRunRequest}>
                      Cancel
                    </Button>
                  ) : null}
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
        </div>
      ) : null}
    </>
  );
}
