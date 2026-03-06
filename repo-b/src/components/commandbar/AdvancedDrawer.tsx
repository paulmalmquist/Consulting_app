"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import type {
  AssistantApiTrace,
  AskAiDebug,
  DiagnosticsCheck,
  SSEEvent,
  WinstonTrace,
  WinstonToolTimeline,
  WinstonDataSource,
} from "@/lib/commandbar/assistantApi";
import type { ContextSnapshot } from "@/lib/commandbar/types";

// ── Helpers ──────────────────────────────────────────────────────────────────

function diagnosticsVariant(status: DiagnosticsCheck["status"]) {
  if (status === "ok") return "success" as const;
  if (status === "warning") return "warning" as const;
  return "danger" as const;
}

function pathBadgeColor(path: string) {
  switch (path) {
    case "tool": return "bg-blue-500/20 text-blue-300 border-blue-500/30";
    case "rag": return "bg-purple-500/20 text-purple-300 border-purple-500/30";
    case "hybrid": return "bg-amber-500/20 text-amber-300 border-amber-500/30";
    default: return "bg-emerald-500/20 text-emerald-300 border-emerald-500/30";
  }
}

function laneBadgeColor(lane: string) {
  switch (lane) {
    case "A": return "bg-emerald-500/20 text-emerald-300 border-emerald-500/30";
    case "B": return "bg-sky-500/20 text-sky-300 border-sky-500/30";
    case "C": return "bg-amber-500/20 text-amber-300 border-amber-500/30";
    case "D": return "bg-red-500/20 text-red-300 border-red-500/30";
    default: return "bg-gray-500/20 text-gray-300 border-gray-500/30";
  }
}

function TimingBar({ label, ms, maxMs }: { label: string; ms: number; maxMs: number }) {
  const pct = maxMs > 0 ? Math.min((ms / maxMs) * 100, 100) : 0;
  return (
    <div className="flex items-center gap-2 py-0.5">
      <span className="text-[10px] text-bm-muted2 w-20 flex-shrink-0 text-right">{label}</span>
      <div className="flex-1 h-2 rounded-full bg-bm-surface/30 overflow-hidden">
        <div className="h-full rounded-full bg-bm-accent/60 transition-all" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[10px] font-mono text-bm-muted2 w-12 text-right">{ms}ms</span>
    </div>
  );
}

function CopyButton({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="text-[10px] text-bm-muted2 hover:text-bm-accent transition-colors"
      onClick={async () => {
        await navigator.clipboard.writeText(text).catch(() => {});
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? "Copied" : label || "Copy"}
    </button>
  );
}

function CollapsibleSection({
  title,
  defaultOpen = false,
  badge,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  badge?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-lg border border-bm-border/40 bg-bm-surface/15">
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        className="flex w-full items-center justify-between px-3 py-2 text-left"
      >
        <div className="flex items-center gap-2">
          <svg
            className={`h-3 w-3 text-bm-muted transition-transform ${open ? "rotate-90" : ""}`}
            viewBox="0 0 12 12"
            fill="none"
          >
            <path d="M4 2l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <span className="text-[11px] font-medium text-bm-text/80 uppercase tracking-wider">{title}</span>
        </div>
        {badge}
      </button>
      {open && <div className="border-t border-bm-border/30 px-3 py-2">{children}</div>}
    </div>
  );
}

function KV({ label, value, mono }: { label: string; value: string | number | null | undefined; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-0.5">
      <span className="text-[11px] text-bm-muted2 flex-shrink-0">{label}</span>
      <span className={`text-[11px] text-bm-text/80 text-right truncate ${mono ? "font-mono" : ""}`}>
        {value ?? "—"}
      </span>
    </div>
  );
}

// ── Tab definitions ──────────────────────────────────────────────────────────

type DebugTab = "overview" | "context" | "trace" | "events" | "data" | "runtime" | "raw";

const TABS: { id: DebugTab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "context", label: "Context" },
  { id: "trace", label: "Trace" },
  { id: "events", label: "Events" },
  { id: "data", label: "Data" },
  { id: "runtime", label: "Runtime" },
  { id: "raw", label: "Raw" },
];

// ── Tab panels ───────────────────────────────────────────────────────────────

function OverviewTab({
  winstonTrace,
  debug,
  diagnostics,
  runningDiagnostics,
  onRunDiagnostics,
}: {
  winstonTrace: WinstonTrace | null;
  debug: AskAiDebug | null;
  diagnostics: DiagnosticsCheck[];
  runningDiagnostics: boolean;
  onRunDiagnostics: () => void;
}) {
  return (
    <div className="space-y-2">
      {/* Execution summary */}
      <div className="flex flex-wrap items-center gap-2">
        {winstonTrace && (
          <>
            <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${pathBadgeColor(winstonTrace.execution_path)}`}>
              {winstonTrace.execution_path.toUpperCase()}
            </span>
            {winstonTrace.lane && (
              <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${laneBadgeColor(winstonTrace.lane)}`}>
                Lane {winstonTrace.lane}
              </span>
            )}
            <span className="text-[10px] text-bm-muted2">
              {winstonTrace.tool_call_count} tool{winstonTrace.tool_call_count !== 1 ? "s" : ""}
            </span>
            <span className="text-[10px] text-bm-muted2">
              {winstonTrace.elapsed_ms}ms
            </span>
            <span className="text-[10px] text-bm-muted2">
              {winstonTrace.total_tokens} tokens
            </span>
            {winstonTrace.rag_chunks_used > 0 && (
              <span className="text-[10px] text-purple-300">
                {winstonTrace.rag_chunks_used} doc chunks
              </span>
            )}
          </>
        )}
        {!winstonTrace && <span className="text-[10px] text-bm-muted2">No trace available for this response.</span>}
      </div>

      {/* Warnings */}
      {winstonTrace && winstonTrace.warnings.length > 0 && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1.5">
          {winstonTrace.warnings.map((w, i) => (
            <p key={i} className="text-[11px] text-amber-300">{w}</p>
          ))}
        </div>
      )}

      {/* Scope summary */}
      {debug?.resolvedScope && (
        <div className="rounded-md bg-bm-surface/20 px-2 py-1.5">
          <p className="text-[10px] text-bm-muted2 uppercase tracking-wider mb-1">Resolved Scope</p>
          <p className="text-[11px] text-bm-text/80">
            {debug.resolvedScope.resolved_scope_type}: {debug.resolvedScope.entity_name || debug.resolvedScope.entity_id || "—"}
          </p>
          <p className="text-[10px] text-bm-muted2">
            confidence {((debug.resolvedScope.confidence ?? 0) * 100).toFixed(0)}% via {debug.resolvedScope.source}
          </p>
        </div>
      )}

      {/* REPE metadata */}
      {winstonTrace?.repe && (
        <div className="rounded-md bg-bm-surface/20 px-2 py-1.5">
          <p className="text-[10px] text-bm-muted2 uppercase tracking-wider mb-1">Real Estate Context</p>
          <KV label="Rollup level" value={winstonTrace.repe.rollup_level} />
          <KV label="Schema" value={winstonTrace.repe.schema_name} mono />
          {winstonTrace.repe.fund_id && <KV label="Fund" value={winstonTrace.repe.fund_id} mono />}
          {winstonTrace.repe.asset_id && <KV label="Asset" value={winstonTrace.repe.asset_id} mono />}
          {winstonTrace.repe.deal_id && <KV label="Deal" value={winstonTrace.repe.deal_id} mono />}
        </div>
      )}

      {/* Diagnostics */}
      <CollapsibleSection
        title="Diagnostics"
        badge={
          <Button type="button" size="sm" variant="secondary" onClick={onRunDiagnostics} disabled={runningDiagnostics}>
            {runningDiagnostics ? "Running..." : "Run"}
          </Button>
        }
      >
        {diagnostics.length ? (
          <ul className="space-y-1">
            {diagnostics.map((check) => (
              <li key={check.id} className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-[11px] text-bm-text/80">{check.label}</p>
                  <p className="text-[10px] text-bm-muted2">{check.detail}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[10px] text-bm-muted2">{check.latencyMs}ms</span>
                  <Badge variant={diagnosticsVariant(check.status)}>{check.status}</Badge>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[10px] text-bm-muted2">No diagnostics run yet.</p>
        )}
      </CollapsibleSection>
    </div>
  );
}

function ContextTab({
  context,
  debug,
  flags,
}: {
  context: ContextSnapshot | null;
  debug: AskAiDebug | null;
  flags: { useCodexServer: boolean; useMocks: boolean };
}) {
  const envelope = debug?.contextEnvelope;
  const scope = debug?.resolvedScope;

  return (
    <div className="space-y-2">
      <div className="rounded-md bg-bm-surface/20 px-2 py-1.5">
        <p className="text-[10px] text-bm-muted2 uppercase tracking-wider mb-1">Application Context</p>
        <KV label="Route" value={envelope?.ui?.route || context?.route} mono />
        <KV label="Surface" value={envelope?.ui?.surface} />
        <KV label="Environment" value={envelope?.ui?.active_environment_name || envelope?.ui?.active_environment_id} />
        <KV label="Environment ID" value={envelope?.ui?.active_environment_id} mono />
        <KV label="Business ID" value={envelope?.ui?.active_business_id || envelope?.session?.org_id} mono />
        <KV label="Schema" value={envelope?.ui?.schema_name} mono />
        <KV label="Industry" value={envelope?.ui?.industry} />
        <KV label="Module" value={envelope?.ui?.active_module} />
      </div>

      <div className="rounded-md bg-bm-surface/20 px-2 py-1.5">
        <p className="text-[10px] text-bm-muted2 uppercase tracking-wider mb-1">Page Entity</p>
        <KV label="Type" value={envelope?.ui?.page_entity_type} />
        <KV label="ID" value={envelope?.ui?.page_entity_id} mono />
        <KV label="Name" value={envelope?.ui?.page_entity_name} />
      </div>

      {scope && (
        <div className="rounded-md bg-bm-surface/20 px-2 py-1.5">
          <p className="text-[10px] text-bm-muted2 uppercase tracking-wider mb-1">Resolved Scope</p>
          <KV label="Type" value={scope.resolved_scope_type} />
          <KV label="Entity" value={scope.entity_name || scope.entity_id} />
          <KV label="Confidence" value={`${((scope.confidence ?? 0) * 100).toFixed(0)}%`} />
          <KV label="Source" value={scope.source} />
          <KV label="Environment" value={scope.environment_id} mono />
          <KV label="Business" value={scope.business_id} mono />
        </div>
      )}

      {envelope?.ui?.selected_entities && envelope.ui.selected_entities.length > 0 && (
        <div className="rounded-md bg-bm-surface/20 px-2 py-1.5">
          <p className="text-[10px] text-bm-muted2 uppercase tracking-wider mb-1">Selected Entities</p>
          {envelope.ui.selected_entities.map((e, i) => (
            <p key={i} className="text-[11px] text-bm-text/80 font-mono">
              {e.entity_type}:{e.name || e.entity_id}
            </p>
          ))}
        </div>
      )}

      <div className="rounded-md bg-bm-surface/20 px-2 py-1.5">
        <p className="text-[10px] text-bm-muted2 uppercase tracking-wider mb-1">Flags</p>
        <KV label="Codex Server" value={String(flags.useCodexServer)} />
        <KV label="Mocks" value={String(flags.useMocks)} />
      </div>
    </div>
  );
}

function TraceTab({
  winstonTrace,
  debug,
  traces,
}: {
  winstonTrace: WinstonTrace | null;
  debug: AskAiDebug | null;
  traces: AssistantApiTrace[];
}) {
  const timeline: WinstonToolTimeline[] = winstonTrace?.tool_timeline || [];

  return (
    <div className="space-y-2">
      {/* Tool timeline */}
      {timeline.length > 0 ? (
        <div className="space-y-1.5">
          <p className="text-[10px] text-bm-muted2 uppercase tracking-wider">Tool Timeline</p>
          {timeline.map((entry) => (
            <CollapsibleSection
              key={entry.step}
              title={`${entry.step}. ${entry.tool_name}`}
              badge={
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono text-bm-muted2">{entry.duration_ms}ms</span>
                  {entry.row_count != null && (
                    <span className="text-[10px] text-bm-muted2">{entry.row_count} rows</span>
                  )}
                  <span className={`inline-flex h-4 w-4 items-center justify-center rounded-full text-[9px] ${
                    entry.success ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400"
                  }`}>
                    {entry.success ? "\u2713" : "\u2717"}
                  </span>
                </div>
              }
            >
              <div className="space-y-1">
                <p className="text-[10px] text-bm-muted2">{entry.purpose}</p>
                {entry.error && (
                  <p className="text-[10px] text-red-400">{entry.error}</p>
                )}
                <p className="text-[10px] text-bm-muted2">{entry.result_summary}</p>
              </div>
            </CollapsibleSection>
          ))}
        </div>
      ) : (
        <p className="text-[10px] text-bm-muted2">No tools were called for this response.</p>
      )}

      {/* Detailed tool calls with raw payloads */}
      {debug && debug.toolCalls.length > 0 && (
        <CollapsibleSection title="Tool Call Payloads">
          {debug.toolCalls.map((tc, i) => (
            <div key={i} className="mb-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] font-mono text-bm-text/80">{tc.tool_name}</span>
                  {tc.is_write && (
                    <span className="inline-flex items-center rounded px-1 py-0 text-[8px] font-medium bg-orange-500/20 text-orange-300 border border-orange-500/30">
                      WRITE
                    </span>
                  )}
                  {tc.pending_confirmation && (
                    <span className="inline-flex items-center rounded px-1 py-0 text-[8px] font-medium bg-yellow-500/20 text-yellow-300 border border-yellow-500/30">
                      PENDING
                    </span>
                  )}
                </div>
                <CopyButton text={JSON.stringify({ args: tc.args, result_preview: tc.result_preview }, null, 2)} label="Copy" />
              </div>
              <pre className="mt-0.5 max-h-24 overflow-auto text-[10px] text-bm-muted2 font-mono whitespace-pre-wrap">
                {JSON.stringify(tc.args, null, 2)}
              </pre>
            </div>
          ))}
        </CollapsibleSection>
      )}

      {/* Client HTTP traces */}
      {traces.length > 0 && (
        <CollapsibleSection title="Client HTTP Traces">
          <ul className="space-y-0.5">
            {traces.slice(0, 10).map((trace) => (
              <li key={`${trace.requestId}_${trace.endpoint}`} className="text-[10px] text-bm-muted2 font-mono">
                {trace.method} {trace.endpoint} {trace.status} {trace.durationMs}ms
                {trace.runId ? ` run:${trace.runId}` : ""}
              </li>
            ))}
          </ul>
        </CollapsibleSection>
      )}
    </div>
  );
}

function DataTab({
  winstonTrace,
  debug,
}: {
  winstonTrace: WinstonTrace | null;
  debug: AskAiDebug | null;
}) {
  const sources: WinstonDataSource[] = winstonTrace?.data_sources || [];
  const citations = winstonTrace?.citations || debug?.citations || [];

  return (
    <div className="space-y-2">
      {/* Data sources */}
      {sources.length > 0 ? (
        <div>
          <p className="text-[10px] text-bm-muted2 uppercase tracking-wider mb-1">Data Sources</p>
          {sources.map((src, i) => (
            <div key={i} className="flex items-center justify-between py-0.5">
              <div className="flex items-center gap-2">
                <span className={`inline-flex rounded px-1.5 py-0.5 text-[9px] font-medium border ${
                  src.source_type === "database"
                    ? "bg-blue-500/15 text-blue-300 border-blue-500/25"
                    : src.source_type === "document"
                      ? "bg-purple-500/15 text-purple-300 border-purple-500/25"
                      : "bg-gray-500/15 text-gray-300 border-gray-500/25"
                }`}>
                  {src.source_type}
                </span>
                <span className="text-[11px] text-bm-text/80 font-mono">{src.tool_name || src.doc_id || "unknown"}</span>
              </div>
              {src.row_count != null && (
                <span className="text-[10px] text-bm-muted2">{src.row_count} rows</span>
              )}
              {src.score != null && (
                <span className="text-[10px] text-bm-muted2">score {src.score.toFixed(3)}</span>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-[10px] text-bm-muted2">No data sources for this response.</p>
      )}

      {/* Citations */}
      {citations.length > 0 && (
        <CollapsibleSection title={`Citations (${citations.length})`}>
          {citations.map((cit, i) => {
            const c = cit as Record<string, unknown>;
            return (
              <div key={i} className="py-0.5 border-b border-bm-border/20 last:border-0">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono text-bm-text/80">{String(c.chunk_id || c.doc_id || `citation-${i}`)}</span>
                  <span className="flex items-center gap-1">
                    {c.retrieval_method && (
                      <span className="text-[9px] px-1 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30">{String(c.retrieval_method)}</span>
                    )}
                    {c.score != null && <span className="text-[10px] text-bm-muted2">{Number(c.score).toFixed(3)}</span>}
                  </span>
                </div>
                {c.source_filename ? <p className="text-[10px] text-bm-muted2">{String(c.source_filename)}</p> : null}
                {c.section_heading ? <p className="text-[10px] text-bm-muted2">{String(c.section_heading)}</p> : null}
                {c.snippet ? <p className="text-[10px] text-bm-muted2 line-clamp-2">{String(c.snippet)}</p> : null}
              </div>
            );
          })}
        </CollapsibleSection>
      )}

      {/* Visible context shortcut */}
      {winstonTrace?.visible_context_shortcut && (
        <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-1.5">
          <p className="text-[10px] text-emerald-300">
            Tools were disabled — visible UI data was sufficient for this response.
          </p>
        </div>
      )}
    </div>
  );
}

function eventBadgeColor(eventType: string) {
  switch (eventType) {
    case "context": return "bg-indigo-500/20 text-indigo-300 border-indigo-500/30";
    case "status": return "bg-sky-500/20 text-sky-300 border-sky-500/30";
    case "token": case "openai_token": return "bg-emerald-500/20 text-emerald-300 border-emerald-500/30";
    case "tool_call": return "bg-blue-500/20 text-blue-300 border-blue-500/30";
    case "tool_result": return "bg-teal-500/20 text-teal-300 border-teal-500/30";
    case "confirmation_required": return "bg-yellow-500/20 text-yellow-300 border-yellow-500/30";
    case "citation": return "bg-purple-500/20 text-purple-300 border-purple-500/30";
    case "done": return "bg-emerald-500/20 text-emerald-300 border-emerald-500/30";
    case "error": return "bg-red-500/20 text-red-300 border-red-500/30";
    case "parse_error": return "bg-red-500/20 text-red-300 border-red-500/30";
    default: return "bg-gray-500/20 text-gray-300 border-gray-500/30";
  }
}

function EventsTab({ debug }: { debug: AskAiDebug | null }) {
  const events: SSEEvent[] = debug?.eventLog || [];
  const [expandedSeq, setExpandedSeq] = useState<number | null>(null);

  if (events.length === 0) {
    return <p className="text-[10px] text-bm-muted2">No SSE events captured. Send a message to see the event stream.</p>;
  }

  // Summary stats
  const eventCounts: Record<string, number> = {};
  for (const evt of events) {
    eventCounts[evt.eventType] = (eventCounts[evt.eventType] || 0) + 1;
  }
  const totalMs = events.length > 0 ? events[events.length - 1].elapsedMs : 0;

  return (
    <div className="space-y-2">
      {/* Stats bar */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] text-bm-muted2">{events.length} events</span>
        <span className="text-[10px] text-bm-muted2">{totalMs}ms total</span>
        {Object.entries(eventCounts).map(([type, count]) => (
          <span
            key={type}
            className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[9px] font-medium ${eventBadgeColor(type)}`}
          >
            {type} ({count})
          </span>
        ))}
      </div>

      {/* Event timeline */}
      <div className="space-y-0.5">
        {events.map((evt) => (
          <div key={evt.seq} className="group">
            <button
              type="button"
              onClick={() => setExpandedSeq(expandedSeq === evt.seq ? null : evt.seq)}
              className="flex w-full items-center gap-1.5 px-1 py-0.5 rounded hover:bg-bm-surface/20 text-left"
            >
              {/* Sequence number */}
              <span className="text-[9px] font-mono text-bm-muted2 w-5 text-right flex-shrink-0">
                {evt.seq}
              </span>
              {/* Elapsed time */}
              <span className="text-[9px] font-mono text-bm-muted2 w-12 text-right flex-shrink-0">
                +{evt.elapsedMs}ms
              </span>
              {/* Event type badge */}
              <span className={`inline-flex items-center rounded border px-1 py-0 text-[8px] font-medium flex-shrink-0 ${eventBadgeColor(evt.eventType)}`}>
                {evt.eventType}
              </span>
              {/* Summary */}
              <span className="text-[10px] text-bm-text/70 truncate flex-1">
                {evt.summary}
              </span>
            </button>
            {/* Expanded payload */}
            {expandedSeq === evt.seq && (
              <div className="ml-[72px] mb-1">
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-[9px] text-bm-muted2">Payload</span>
                  <CopyButton text={JSON.stringify(evt.payload, null, 2)} label="Copy" />
                </div>
                <pre className="max-h-32 overflow-auto rounded bg-bm-bg/80 p-1.5 text-[9px] text-bm-muted2 font-mono whitespace-pre-wrap">
                  {JSON.stringify(evt.payload, null, 2)}
                </pre>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function RuntimeTab({
  winstonTrace,
  debug,
}: {
  winstonTrace: WinstonTrace | null;
  debug: AskAiDebug | null;
}) {
  return (
    <div className="space-y-2">
      <div className="rounded-md bg-bm-surface/20 px-2 py-1.5">
        <p className="text-[10px] text-bm-muted2 uppercase tracking-wider mb-1">Model</p>
        <KV label="Model" value={winstonTrace?.model} mono />
        <KV label="Prompt tokens" value={winstonTrace?.prompt_tokens} />
        <KV label="Completion tokens" value={winstonTrace?.completion_tokens} />
        <KV label="Total tokens" value={winstonTrace?.total_tokens} />
        <KV label="Latency" value={winstonTrace ? `${winstonTrace.elapsed_ms}ms` : undefined} />
      </div>

      <div className="rounded-md bg-bm-surface/20 px-2 py-1.5">
        <p className="text-[10px] text-bm-muted2 uppercase tracking-wider mb-1">Execution</p>
        <KV label="Path" value={winstonTrace?.execution_path} />
        <KV label="Lane" value={winstonTrace?.lane ? `Lane ${winstonTrace.lane}` : undefined} />
        <KV label="Tool calls" value={winstonTrace?.tool_call_count} />
        <KV label="RAG chunks" value={winstonTrace?.rag_chunks_used} />
        <KV label="Citations" value={winstonTrace?.citations?.length} />
      </div>

      {/* Timings breakdown */}
      {winstonTrace?.timings && Object.keys(winstonTrace.timings).length > 0 && (
        <div className="rounded-md bg-bm-surface/20 px-2 py-1.5">
          <p className="text-[10px] text-bm-muted2 uppercase tracking-wider mb-1">Timings</p>
          {(() => {
            const t = winstonTrace.timings!;
            const maxMs = t.total_ms || Math.max(...Object.values(t).filter((v): v is number => typeof v === "number"));
            const order: [string, string][] = [
              ["context_resolution_ms", "Context"],
              ["rag_search_ms", "RAG"],
              ["prompt_construction_ms", "Prompt"],
              ["ttft_ms", "TTFT"],
              ["model_ms", "Model"],
              ["total_ms", "Total"],
            ];
            return order
              .filter(([key]) => t[key] != null)
              .map(([key, label]) => (
                <TimingBar key={key} label={label} ms={t[key]!} maxMs={maxMs} />
              ));
          })()}
        </div>
      )}

      {/* RAG Quality */}
      {(winstonTrace as Record<string, unknown>)?.rag_quality && (() => {
        const rq = (winstonTrace as Record<string, unknown>).rag_quality as Record<string, unknown>;
        return (
          <div className="rounded-md bg-bm-surface/20 px-2 py-1.5">
            <p className="text-[10px] text-bm-muted2 uppercase tracking-wider mb-1">RAG Quality</p>
            <KV label="Retrieved" value={rq.chunks_retrieved as number} />
            <KV label="After threshold" value={rq.chunks_after_threshold as number} />
            <KV label="After rerank" value={rq.chunks_after_rerank as number} />
            <KV label="Rerank method" value={rq.rerank_method as string} />
            <KV label="Hybrid" value={rq.hybrid_used ? "Yes" : "No"} />
            {Array.isArray(rq.scores) && rq.scores.length > 0 && (
              <KV label="Score range" value={`${Math.min(...(rq.scores as number[])).toFixed(3)} – ${Math.max(...(rq.scores as number[])).toFixed(3)}`} />
            )}
          </div>
        );
      })()}

      {/* Cost */}
      {(winstonTrace as Record<string, unknown>)?.cost && (() => {
        const c = (winstonTrace as Record<string, unknown>).cost as Record<string, number>;
        return (
          <div className="rounded-md bg-bm-surface/20 px-2 py-1.5">
            <p className="text-[10px] text-bm-muted2 uppercase tracking-wider mb-1">Cost</p>
            <KV label="Model" value={`$${c.model_cost?.toFixed(5) ?? '0'}`} />
            <KV label="Embedding" value={`$${c.embedding_cost?.toFixed(5) ?? '0'}`} />
            <KV label="Rerank" value={`$${c.rerank_cost?.toFixed(5) ?? '0'}`} />
            <KV label="Total" value={`$${c.total_cost?.toFixed(5) ?? '0'}`} />
          </div>
        );
      })()}

      {/* Resolved scope IDs */}
      {debug?.resolvedScope && (
        <div className="rounded-md bg-bm-surface/20 px-2 py-1.5">
          <p className="text-[10px] text-bm-muted2 uppercase tracking-wider mb-1">Scope IDs</p>
          <KV label="Environment" value={debug.resolvedScope.environment_id} mono />
          <KV label="Business" value={debug.resolvedScope.business_id} mono />
          <KV label="Entity type" value={debug.resolvedScope.entity_type} />
          <KV label="Entity ID" value={debug.resolvedScope.entity_id} mono />
        </div>
      )}
    </div>
  );
}

function RawTab({
  debug,
  raw,
}: {
  debug: AskAiDebug | null;
  raw: Record<string, unknown>;
}) {
  const fullPayload = JSON.stringify({ debug, raw }, null, 2);
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-[10px] text-bm-muted2 uppercase tracking-wider">Full Debug Payload</p>
        <CopyButton text={fullPayload} label="Copy JSON" />
      </div>
      <pre className="max-h-[400px] overflow-auto rounded-md bg-bm-bg/80 p-2 text-[10px] text-bm-muted2 font-mono whitespace-pre-wrap">
        {fullPayload}
      </pre>
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

export default function AdvancedDrawer({
  open,
  context,
  traces,
  diagnostics,
  runningDiagnostics,
  raw,
  flags,
  assistantDebug,
  onRunDiagnostics,
}: {
  open: boolean;
  context: ContextSnapshot | null;
  traces: AssistantApiTrace[];
  diagnostics: DiagnosticsCheck[];
  runningDiagnostics: boolean;
  raw: Record<string, unknown>;
  flags: {
    useCodexServer: boolean;
    useMocks: boolean;
  };
  assistantDebug?: AskAiDebug | null;
  onRunDiagnostics: () => void;
}) {
  const [activeTab, setActiveTab] = useState<DebugTab>("overview");

  if (!open) return null;

  const debug = assistantDebug || null;
  const winstonTrace: WinstonTrace | null = debug?.trace || null;

  return (
    <section
      id="winston-advanced-drawer"
      className="flex flex-col border-t border-bm-border/60 bg-bm-bg/80 backdrop-blur-sm"
      style={{ maxHeight: "50vh" }}
    >
      {/* Tab bar */}
      <div className="flex items-center gap-0.5 border-b border-bm-border/40 px-2 pt-1.5 pb-0 overflow-x-auto scrollbar-hide">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`px-2.5 py-1.5 text-[10px] font-medium uppercase tracking-wider rounded-t transition-colors whitespace-nowrap ${
              activeTab === tab.id
                ? "text-bm-accent border-b-2 border-bm-accent bg-bm-surface/20"
                : "text-bm-muted2 hover:text-bm-text"
            }`}
          >
            {tab.label}
            {tab.id === "trace" && winstonTrace && winstonTrace.tool_call_count > 0 && (
              <span className="ml-1 inline-flex h-3.5 min-w-[14px] items-center justify-center rounded-full bg-bm-accent/20 px-1 text-[8px] text-bm-accent">
                {winstonTrace.tool_call_count}
              </span>
            )}
            {tab.id === "events" && debug && debug.eventLog.length > 0 && (
              <span className="ml-1 inline-flex h-3.5 min-w-[14px] items-center justify-center rounded-full bg-cyan-500/20 px-1 text-[8px] text-cyan-300">
                {debug.eventLog.length}
              </span>
            )}
            {tab.id === "data" && winstonTrace && winstonTrace.data_sources.length > 0 && (
              <span className="ml-1 inline-flex h-3.5 min-w-[14px] items-center justify-center rounded-full bg-purple-500/20 px-1 text-[8px] text-purple-300">
                {winstonTrace.data_sources.length}
              </span>
            )}
          </button>
        ))}

        {/* Execution path badge */}
        {winstonTrace && (
          <div className="ml-auto flex items-center gap-2 px-2">
            {winstonTrace.lane && (
              <span className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[9px] font-medium ${laneBadgeColor(winstonTrace.lane)}`}>
                {winstonTrace.lane}
              </span>
            )}
            <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[9px] font-medium ${pathBadgeColor(winstonTrace.execution_path)}`}>
              {winstonTrace.execution_path.toUpperCase()}
            </span>
            <span className="text-[9px] text-bm-muted2">{winstonTrace.elapsed_ms}ms</span>
          </div>
        )}
      </div>

      {/* Tab content */}
      <div className="min-h-0 flex-1 overflow-y-auto p-3 scrollbar-hide">
        {activeTab === "overview" && (
          <OverviewTab
            winstonTrace={winstonTrace}
            debug={debug}
            diagnostics={diagnostics}
            runningDiagnostics={runningDiagnostics}
            onRunDiagnostics={onRunDiagnostics}
          />
        )}
        {activeTab === "context" && (
          <ContextTab context={context} debug={debug} flags={flags} />
        )}
        {activeTab === "trace" && (
          <TraceTab winstonTrace={winstonTrace} debug={debug} traces={traces} />
        )}
        {activeTab === "events" && (
          <EventsTab debug={debug} />
        )}
        {activeTab === "data" && (
          <DataTab winstonTrace={winstonTrace} debug={debug} />
        )}
        {activeTab === "runtime" && (
          <RuntimeTab winstonTrace={winstonTrace} debug={debug} />
        )}
        {activeTab === "raw" && (
          <RawTab debug={debug} raw={raw} />
        )}
      </div>
    </section>
  );
}
