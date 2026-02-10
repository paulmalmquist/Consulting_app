"use client";

import { useState, useEffect } from "react";
import { listExecutions, ExecutionItem } from "@/lib/bos-api";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";

export default function HistoryView({
  businessId,
  departmentId,
}: {
  businessId: string;
  departmentId?: string;
}) {
  const [executions, setExecutions] = useState<ExecutionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    listExecutions(businessId, departmentId)
      .then(setExecutions)
      .catch(() => setExecutions([]))
      .finally(() => setLoading(false));
  }, [businessId, departmentId]);

  if (loading) {
    return (
      <div className="space-y-2">
        <div className="h-14 bg-bm-surface/60 border border-bm-border/60 rounded-lg animate-pulse" />
        <div className="h-14 bg-bm-surface/60 border border-bm-border/60 rounded-lg animate-pulse" />
        <div className="h-14 bg-bm-surface/60 border border-bm-border/60 rounded-lg animate-pulse" />
      </div>
    );
  }

  if (executions.length === 0) {
    return (
      <div className="bm-glass rounded-lg p-4 text-sm text-bm-muted2">
        No executions yet.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {executions.map((exec) => (
        <Card key={exec.execution_id} className="overflow-hidden">
          <button
            onClick={() =>
              setExpanded(expanded === exec.execution_id ? null : exec.execution_id)
            }
            className="w-full text-left px-4 py-3 flex items-center justify-between hover:bg-bm-surface/30 transition"
          >
            <div>
              <p className="text-sm font-medium font-mono">
                {exec.execution_id.slice(0, 8)}...
              </p>
              <p className="text-xs text-bm-muted2">
                {new Date(exec.created_at).toLocaleString()}
              </p>
            </div>
            <Badge
              variant={
                exec.status === "completed"
                  ? "success"
                  : exec.status === "failed"
                    ? "danger"
                    : "warning"
              }
            >
              {exec.status}
            </Badge>
          </button>
          {expanded === exec.execution_id && (
            <div className="border-t border-bm-border/70 bg-bm-bg/15">
              <CardContent className="px-4 py-3 space-y-2">
                <div>
                  <p className="text-xs font-mono text-bm-muted2 mb-1">Inputs:</p>
                  <pre className="text-xs bg-bm-bg/20 border border-bm-border/60 rounded p-2 overflow-x-auto">
                    {JSON.stringify(exec.inputs_json, null, 2)}
                  </pre>
                </div>
                <div>
                  <p className="text-xs font-mono text-bm-muted2 mb-1">Outputs:</p>
                  <pre className="text-xs bg-bm-bg/20 border border-bm-border/60 rounded p-2 overflow-x-auto">
                    {JSON.stringify(exec.outputs_json, null, 2)}
                  </pre>
                </div>
              </CardContent>
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}
