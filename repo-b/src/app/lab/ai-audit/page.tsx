"use client";

import { useEffect, useState } from "react";
import { useEnv } from "@/components/EnvProvider";
import EnvGate from "@/components/EnvGate";
import { apiFetch } from "@/lib/api";
import { Card, CardContent, CardTitle, CardDescription } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/cn";

type AuditEvent = {
  audit_event_id: string;
  actor: string;
  action: string;
  tool_name: string;
  success: boolean;
  latency_ms: number;
  error_message: string | null;
  created_at: string;
  input_redacted: Record<string, unknown>;
  output_redacted: Record<string, unknown>;
};

export default function AiAuditPage() {
  const { selectedEnv } = useEnv();
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedEnv) return;
    setLoading(true);
    apiFetch<{ events: AuditEvent[] }>("/v1/audit/events?limit=100")
      .then((r) => setEvents(r.events || []))
      .catch(() => setEvents([]))
      .finally(() => setLoading(false));
  }, [selectedEnv]);

  const filtered = events.filter(
    (e) =>
      !filter ||
      e.tool_name?.toLowerCase().includes(filter.toLowerCase()) ||
      e.action?.toLowerCase().includes(filter.toLowerCase()) ||
      e.actor?.toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <EnvGate>
      <div className="space-y-4">
        <Card>
          <CardContent>
            <CardTitle className="text-xl">AI Audit Log</CardTitle>
            <CardDescription>
              Every AI gateway call and MCP tool invocation — redacted, immutable, compliant.
            </CardDescription>
            <Input
              className="mt-4"
              placeholder="Filter by tool, action, actor..."
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
          </CardContent>
        </Card>

        {loading ? (
          <p className="text-sm text-bm-muted">Loading audit events...</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-bm-border">
            <table className="w-full text-sm">
              <thead className="bg-bm-surface text-bm-muted text-left">
                <tr>
                  <th className="px-3 py-2">Time</th>
                  <th className="px-3 py-2">Actor</th>
                  <th className="px-3 py-2">Action</th>
                  <th className="px-3 py-2">Tool</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Latency</th>
                  <th className="px-3 py-2">Error</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((event) => (
                  <>
                    <tr
                      key={event.audit_event_id}
                      className={cn(
                        "border-t border-bm-border hover:bg-bm-surface/40 cursor-pointer",
                        expandedId === event.audit_event_id && "bg-bm-surface/60"
                      )}
                      onClick={() =>
                        setExpandedId(
                          expandedId === event.audit_event_id ? null : event.audit_event_id
                        )
                      }
                    >
                      <td className="px-3 py-2 text-bm-muted2 whitespace-nowrap">
                        {new Date(event.created_at).toLocaleTimeString()}
                      </td>
                      <td className="px-3 py-2">{event.actor}</td>
                      <td className="px-3 py-2 font-mono text-xs">{event.action}</td>
                      <td className="px-3 py-2 font-mono text-xs">{event.tool_name}</td>
                      <td className="px-3 py-2">
                        <span
                          className={cn(
                            "px-1.5 py-0.5 rounded text-xs font-medium",
                            event.success
                              ? "bg-green-500/20 text-green-400"
                              : "bg-red-500/20 text-red-400"
                          )}
                        >
                          {event.success ? "ok" : "fail"}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-bm-muted2">{event.latency_ms}ms</td>
                      <td className="px-3 py-2 text-red-400 text-xs truncate max-w-xs">
                        {event.error_message || "—"}
                      </td>
                    </tr>
                    {expandedId === event.audit_event_id ? (
                      <tr key={`${event.audit_event_id}-detail`}>
                        <td colSpan={7} className="px-4 py-3 bg-bm-surface/30 border-t border-bm-border/50">
                          <div className="grid grid-cols-2 gap-4 text-xs">
                            <div>
                              <p className="font-semibold text-bm-muted mb-1">Input (redacted)</p>
                              <pre className="bg-bm-bg/50 p-2 rounded overflow-x-auto max-h-40">
                                {JSON.stringify(event.input_redacted, null, 2)}
                              </pre>
                            </div>
                            <div>
                              <p className="font-semibold text-bm-muted mb-1">Output (redacted)</p>
                              <pre className="bg-bm-bg/50 p-2 rounded overflow-x-auto max-h-40">
                                {JSON.stringify(event.output_redacted, null, 2)}
                              </pre>
                            </div>
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </>
                ))}
              </tbody>
            </table>
            {filtered.length === 0 ? (
              <p className="text-center text-sm text-bm-muted2 py-8">
                No audit events found.
              </p>
            ) : null}
          </div>
        )}
      </div>
    </EnvGate>
  );
}
