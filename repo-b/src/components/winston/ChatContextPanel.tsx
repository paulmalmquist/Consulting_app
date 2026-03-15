"use client";

import React from "react";
import type { AssistantToolActivityItem, AssistantCitationItem } from "@/lib/commandbar/types";
import type { WinstonTrace } from "@/lib/commandbar/assistantApi";

export type ContextPanelState = {
  envName?: string | null;
  businessName?: string | null;
  scopeType?: string | null;
  entityName?: string | null;
  entityType?: string | null;
  tools: AssistantToolActivityItem[];
  citations: AssistantCitationItem[];
  trace?: WinstonTrace | null;
};

export default function ChatContextPanel({ state }: { state: ContextPanelState }) {
  const hasScope = state.envName || state.businessName || state.entityName;
  const hasTools = state.tools.length > 0;
  const hasCitations = state.citations.length > 0;
  const hasTrace = !!state.trace;

  if (!hasScope && !hasTools && !hasCitations && !hasTrace) {
    return (
      <div className="flex h-full items-center justify-center p-4">
        <p className="text-[12px] text-bm-muted text-center">
          Context will appear here during conversations
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4 overflow-y-auto" style={{ scrollbarWidth: "thin", scrollbarColor: "hsl(var(--bm-border)/0.5) transparent" }}>
      {/* Scope */}
      {hasScope && (
        <div>
          <p className="text-[11px] text-bm-muted uppercase tracking-wider font-medium mb-2">Workspace</p>
          <div className="space-y-1.5">
            {state.businessName && (
              <div className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-bm-accent" />
                <span className="text-[12px] text-bm-text">{state.businessName}</span>
              </div>
            )}
            {state.envName && (
              <div className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                <span className="text-[12px] text-bm-text">{state.envName}</span>
              </div>
            )}
            {state.entityName && (
              <div className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-sky-400" />
                <span className="text-[12px] text-bm-text">
                  {state.entityType && <span className="text-bm-muted">{state.entityType}: </span>}
                  {state.entityName}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tools */}
      {hasTools && (
        <div>
          <p className="text-[11px] text-bm-muted uppercase tracking-wider font-medium mb-2">
            Tools ({state.tools.length})
          </p>
          <div className="space-y-1">
            {state.tools.slice(-10).map((tool, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between rounded-md border border-bm-border/20 bg-bm-surface/10 px-2.5 py-1.5"
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  <span
                    className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${
                      tool.status === "completed"
                        ? "bg-emerald-400"
                        : tool.status === "failed"
                          ? "bg-red-400"
                          : "bg-sky-400 animate-pulse"
                    }`}
                  />
                  <span className="text-[11px] text-bm-text font-mono truncate">
                    {tool.tool_name}
                  </span>
                </div>
                {typeof tool.duration_ms === "number" && (
                  <span className="text-[10px] text-bm-muted flex-shrink-0 ml-2">
                    {tool.duration_ms}ms
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Citations */}
      {hasCitations && (
        <div>
          <p className="text-[11px] text-bm-muted uppercase tracking-wider font-medium mb-2">
            Sources ({state.citations.length})
          </p>
          <div className="space-y-1">
            {state.citations.slice(-8).map((cite, idx) => (
              <div
                key={idx}
                className="rounded-md border border-bm-border/20 bg-bm-surface/10 px-2.5 py-1.5"
              >
                <p className="text-[11px] text-bm-text font-medium truncate">
                  {cite.section_heading || cite.label || `Source ${idx + 1}`}
                </p>
                {cite.snippet && (
                  <p className="text-[10px] text-bm-muted line-clamp-2 mt-0.5">
                    {cite.snippet}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Trace */}
      {hasTrace && state.trace && (
        <div>
          <p className="text-[11px] text-bm-muted uppercase tracking-wider font-medium mb-2">Trace</p>
          <div className="space-y-1 text-[11px]">
            <div className="flex justify-between">
              <span className="text-bm-muted">Path</span>
              <span className="text-bm-text">{state.trace.execution_path}</span>
            </div>
            {state.trace.lane && (
              <div className="flex justify-between">
                <span className="text-bm-muted">Lane</span>
                <span className="text-bm-text">{state.trace.lane}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-bm-muted">Elapsed</span>
              <span className="text-bm-text">{state.trace.elapsed_ms}ms</span>
            </div>
            <div className="flex justify-between">
              <span className="text-bm-muted">Tools</span>
              <span className="text-bm-text">{state.trace.tool_call_count}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-bm-muted">Tokens</span>
              <span className="text-bm-text">{state.trace.total_tokens.toLocaleString()}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
