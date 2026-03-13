"use client";

import React from "react";
import Link from "next/link";
import type { AssistantCitationItem, AssistantResponseBlock, AssistantToolActivityItem } from "@/lib/commandbar/types";
import type { CopilotAttachment } from "@/components/copilot/types";

function latestBlocks(blocks: AssistantResponseBlock[], type: AssistantResponseBlock["type"]) {
  return blocks.filter((block) => block.type === type);
}

export default function ContextPanel({
  environmentName,
  envId,
  businessId,
  mode,
  filters,
  selectedContext,
  blocks,
  attachments,
  status,
}: {
  environmentName?: string | null;
  envId: string;
  businessId?: string | null;
  mode: string;
  filters: Record<string, unknown>;
  selectedContext?: { label: string; value: string | null | undefined }[];
  blocks: AssistantResponseBlock[];
  attachments: CopilotAttachment[];
  status?: string;
}) {
  const citations = latestBlocks(blocks, "citations").flatMap((block) => (block as Extract<AssistantResponseBlock, { type: "citations" }>).items) as AssistantCitationItem[];
  const toolActivity = latestBlocks(blocks, "tool_activity").flatMap((block) => (block as Extract<AssistantResponseBlock, { type: "tool_activity" }>).items) as AssistantToolActivityItem[];
  const workflow = latestBlocks(blocks, "workflow_result").slice(-1)[0] as Extract<AssistantResponseBlock, { type: "workflow_result" }> | undefined;

  return (
    <aside className="flex h-full min-h-0 w-full max-w-sm flex-col border-l border-bm-border/50 bg-bm-surface/20">
      <div className="border-b border-bm-border/40 px-5 py-4">
        <div className="text-[11px] uppercase tracking-[0.18em] text-bm-muted2">Context</div>
        <h2 className="mt-2 text-lg font-semibold text-bm-text">{environmentName || "Active workspace"}</h2>
        <div className="mt-2 space-y-1 text-xs text-bm-muted2">
          <div>Environment: {envId}</div>
          {businessId ? <div>Business: {businessId}</div> : null}
          <div>Mode: {mode}</div>
          {status ? <div>Status: {status}</div> : null}
        </div>
      </div>

      <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5">
        <section className="space-y-2">
          <h3 className="text-[11px] uppercase tracking-[0.18em] text-bm-muted2">Selected context</h3>
          <div className="space-y-2 rounded-2xl border border-bm-border/50 bg-bm-bg/30 p-3">
            {(selectedContext || []).map((item) => (
              <div key={item.label} className="text-sm text-bm-text">
                <span className="text-bm-muted2">{item.label}:</span> {item.value || "—"}
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-2">
          <h3 className="text-[11px] uppercase tracking-[0.18em] text-bm-muted2">Filters</h3>
          <div className="flex flex-wrap gap-2">
            {Object.entries(filters).length ? (
              Object.entries(filters).map(([key, value]) => (
                <span key={key} className="rounded-full border border-bm-border/50 px-2 py-1 text-xs text-bm-text">
                  {key}: {String(value)}
                </span>
              ))
            ) : (
              <span className="text-sm text-bm-muted2">No active filters</span>
            )}
          </div>
        </section>

        <section className="space-y-2">
          <h3 className="text-[11px] uppercase tracking-[0.18em] text-bm-muted2">Attachments</h3>
          <div className="space-y-2">
            {attachments.length ? attachments.map((attachment) => (
              <div key={attachment.id} className="rounded-2xl border border-bm-border/50 bg-bm-bg/30 p-3">
                <div className="text-sm font-medium text-bm-text">{attachment.name}</div>
                <div className="mt-1 text-xs text-bm-muted2">{attachment.status}</div>
                {attachment.error ? <div className="mt-1 text-xs text-red-400">{attachment.error}</div> : null}
              </div>
            )) : <div className="text-sm text-bm-muted2">No attached documents yet.</div>}
          </div>
        </section>

        <section className="space-y-2">
          <h3 className="text-[11px] uppercase tracking-[0.18em] text-bm-muted2">Workflow</h3>
          {workflow ? (
            <div className="rounded-2xl border border-bm-border/50 bg-bm-bg/30 p-3">
              <div className="text-sm font-medium text-bm-text">{workflow.title}</div>
              <div className="mt-1 text-xs text-bm-muted">{workflow.summary}</div>
            </div>
          ) : (
            <div className="text-sm text-bm-muted2">No active workflow result.</div>
          )}
        </section>

        <section className="space-y-2">
          <h3 className="text-[11px] uppercase tracking-[0.18em] text-bm-muted2">Sources</h3>
          <div className="space-y-2">
            {citations.length ? citations.slice(-6).map((citation, index) => (
              <div key={`${citation.chunk_id || citation.doc_id || index}`} className="rounded-2xl border border-bm-border/50 bg-bm-bg/30 p-3">
                {citation.href ? (
                  <Link href={citation.href} className="text-sm font-medium text-bm-accent hover:underline">
                    {citation.label}
                  </Link>
                ) : (
                  <div className="text-sm font-medium text-bm-text">{citation.label}</div>
                )}
                {citation.snippet ? <div className="mt-1 text-xs text-bm-muted">{citation.snippet}</div> : null}
              </div>
            )) : <div className="text-sm text-bm-muted2">No grounded citations yet.</div>}
          </div>
        </section>

        <section className="space-y-2">
          <h3 className="text-[11px] uppercase tracking-[0.18em] text-bm-muted2">Tool log</h3>
          <div className="space-y-2">
            {toolActivity.length ? toolActivity.slice(-8).map((item, index) => (
              <div key={`${item.tool_name}-${index}`} className="rounded-2xl border border-bm-border/50 bg-bm-bg/30 p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-medium text-bm-text">{item.tool_name}</div>
                  <div className="text-[11px] uppercase tracking-[0.14em] text-bm-muted2">{item.status}</div>
                </div>
                <div className="mt-1 text-xs text-bm-muted">{item.summary}</div>
              </div>
            )) : <div className="text-sm text-bm-muted2">Tools will appear here as Winston works.</div>}
          </div>
        </section>
      </div>
    </aside>
  );
}
