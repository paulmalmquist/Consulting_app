"use client";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import type { AssistantApiTrace, DiagnosticsCheck } from "@/lib/commandbar/assistantApi";
import type { ContextSnapshot } from "@/lib/commandbar/types";

function diagnosticsVariant(status: DiagnosticsCheck["status"]) {
  if (status === "ok") return "success" as const;
  if (status === "warning") return "warning" as const;
  return "danger" as const;
}

export default function AdvancedDrawer({
  open,
  context,
  traces,
  diagnostics,
  runningDiagnostics,
  raw,
  flags,
  onRunDiagnostics,
}: {
  open: boolean;
  context: ContextSnapshot | null;
  traces: AssistantApiTrace[];
  diagnostics: DiagnosticsCheck[];
  runningDiagnostics: boolean;
  raw: {
    contextSnapshot?: unknown;
    plan?: unknown;
    confirm?: unknown;
    execute?: unknown;
    run?: unknown;
    error?: unknown;
  };
  flags: {
    useCodexServer: boolean;
    useMocks: boolean;
  };
  onRunDiagnostics: () => void;
}) {
  if (!open) return null;

  return (
    <section
      id="winston-advanced-drawer"
      className="max-h-[300px] overflow-y-auto border-t border-bm-border/60 bg-bm-bg/65 p-3"
    >
      <div className="flex items-center justify-between gap-2">
        <p className="bm-section-label">Advanced / Debug</p>
        <Button type="button" size="sm" variant="secondary" onClick={onRunDiagnostics} disabled={runningDiagnostics}>
          {runningDiagnostics ? "Running Diagnostics..." : "Diagnostics"}
        </Button>
      </div>

      <div className="mt-2 grid grid-cols-1 gap-2 text-xs md:grid-cols-2">
        <div className="rounded-lg border border-bm-border/60 bg-bm-surface/20 p-2">
          <p className="bm-section-label">Context</p>
          <p className="mt-1 text-bm-muted font-mono">
            env_id: {context?.selectedEnv?.env_id || "none"}
            <br />
            business_id: {context?.business?.business_id || "none"}
            <br />
            route: {context?.route || "/"}
          </p>
          <p className="mt-2 text-bm-muted">
            flags: USE_CODEX_SERVER={String(flags.useCodexServer)} · USE_MOCKS={String(flags.useMocks)}
          </p>
        </div>

        <div className="rounded-lg border border-bm-border/60 bg-bm-surface/20 p-2">
          <p className="bm-section-label">Diagnostics</p>
          {diagnostics.length ? (
            <ul className="mt-1 space-y-1">
              {diagnostics.map((check) => (
                <li key={check.id} className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-bm-text">{check.label}</p>
                    <p className="text-bm-muted">{check.detail}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <p className="font-mono text-bm-muted">{check.latencyMs}ms</p>
                    <Badge variant={diagnosticsVariant(check.status)}>{check.status}</Badge>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-bm-muted">No diagnostics run yet.</p>
          )}
        </div>
      </div>

      <div className="mt-2 rounded-lg border border-bm-border/60 bg-bm-surface/20 p-2">
        <p className="bm-section-label">Client Traces</p>
        <ul className="mt-1 max-h-24 space-y-1 overflow-y-auto text-[11px] text-bm-muted font-mono">
          {traces.length ? (
            traces.map((trace) => (
              <li key={`${trace.requestId}_${trace.endpoint}`}>
                {trace.requestId} · {trace.method} {trace.endpoint} · {trace.status} · {trace.durationMs}ms
                {trace.runId ? ` · run:${trace.runId}` : ""}
              </li>
            ))
          ) : (
            <li>No client traces captured yet.</li>
          )}
        </ul>
      </div>

      <div className="mt-2 rounded-lg border border-bm-border/60 bg-bm-surface/20 p-2">
        <p className="bm-section-label">Raw Payloads</p>
        <pre className="mt-1 max-h-36 overflow-auto whitespace-pre-wrap text-[11px] text-bm-muted">
          {JSON.stringify(raw, null, 2)}
        </pre>
      </div>
    </section>
  );
}
