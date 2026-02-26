"use client";

import { useEffect, useRef } from "react";
import type { CommandMessage, CommandContextKey } from "@/lib/commandbar/store";
import type { RunStatus } from "@/lib/commandbar/types";
import { Badge } from "@/components/ui/Badge";

type RecentRun = {
  runId: string;
  planId: string;
  status: RunStatus;
  createdAt: number;
};

const STATUS_VARIANT: Record<RunStatus, "default" | "accent" | "success" | "warning" | "danger"> = {
  pending: "default",
  running: "accent",
  completed: "success",
  failed: "danger",
  cancelled: "warning",
  needs_clarification: "warning",
  blocked: "danger",
};

function formatContextBadge(contextKey: CommandContextKey) {
  if (contextKey === "global") return "Global";
  return contextKey;
}

export default function ConversationPane({
  contextKey,
  messages,
  examples,
  recentRuns,
}: {
  contextKey: CommandContextKey;
  messages: CommandMessage[];
  examples: string[];
  recentRuns: RecentRun[];
}) {
  const transcriptRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!transcriptRef.current) return;
    transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
  }, [messages]);

  return (
    <div className="flex h-full min-h-0 flex-col p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="bm-section-label">Conversation · {formatContextBadge(contextKey)}</p>
      </div>

      <div
        ref={transcriptRef}
        data-testid="global-commandbar-output"
        className="mt-2 min-h-0 flex-1 overflow-y-auto rounded-lg border border-bm-border/65 bg-bm-bg/45 p-3"
      >
        {messages.length === 0 ? (
          <div className="bm-command-empty rounded-lg p-3">
            <p className="text-sm text-bm-muted">
              Winston plans every request first, then waits for your confirmation.
            </p>
            <p className="mt-3 bm-section-label">Examples</p>
            <ul className="mt-2 space-y-1 text-sm text-bm-text">
              {examples.map((example) => (
                <li key={example}>{example}</li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="space-y-2">
            {messages.map((message) => (
              <article key={message.id} className="rounded-lg border border-bm-border/55 bg-bm-surface/30 p-2">
                <p className="bm-section-label">{message.role}</p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-bm-text">{message.content}</p>
              </article>
            ))}
          </div>
        )}
      </div>

      <div className="mt-3 rounded-lg border border-bm-border/65 bg-bm-surface/25 p-3">
        <p className="bm-section-label">Recent Runs</p>
        {recentRuns.length ? (
          <ul className="mt-2 space-y-2 text-xs">
            {recentRuns.map((run) => (
              <li key={run.runId} className="flex items-center justify-between gap-2">
                <div>
                  <p className="font-mono text-bm-text">{run.runId}</p>
                  <p className="text-bm-muted">{new Date(run.createdAt).toLocaleTimeString()}</p>
                </div>
                <Badge variant={STATUS_VARIANT[run.status]}>{run.status.replace("_", " ")}</Badge>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-xs text-bm-muted">No command runs yet in this workspace.</p>
        )}
      </div>
    </div>
  );
}
