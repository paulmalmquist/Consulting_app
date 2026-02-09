"use client";

import { useState, useEffect } from "react";
import { listExecutions, ExecutionItem } from "@/lib/bos-api";

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
        <div className="h-14 bg-slate-800 rounded-lg animate-pulse" />
        <div className="h-14 bg-slate-800 rounded-lg animate-pulse" />
        <div className="h-14 bg-slate-800 rounded-lg animate-pulse" />
      </div>
    );
  }

  if (executions.length === 0) {
    return (
      <p className="text-sm text-slate-500 bg-slate-900 rounded-lg p-4">
        No executions yet.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {executions.map((exec) => (
        <div key={exec.execution_id} className="border border-slate-800 rounded-lg overflow-hidden">
          <button
            onClick={() =>
              setExpanded(expanded === exec.execution_id ? null : exec.execution_id)
            }
            className="w-full text-left px-4 py-3 flex items-center justify-between hover:bg-slate-900 transition-colors"
          >
            <div>
              <p className="text-sm font-medium font-mono">
                {exec.execution_id.slice(0, 8)}...
              </p>
              <p className="text-xs text-slate-500">
                {new Date(exec.created_at).toLocaleString()}
              </p>
            </div>
            <span
              className={`text-xs px-2 py-0.5 rounded ${
                exec.status === "completed"
                  ? "bg-emerald-900 text-emerald-300"
                  : exec.status === "failed"
                    ? "bg-red-900 text-red-300"
                    : "bg-yellow-900 text-yellow-300"
              }`}
            >
              {exec.status}
            </span>
          </button>
          {expanded === exec.execution_id && (
            <div className="border-t border-slate-800 px-4 py-3 space-y-2 bg-slate-900/50">
              <div>
                <p className="text-xs font-mono text-slate-500 mb-1">Inputs:</p>
                <pre className="text-xs bg-slate-900 rounded p-2 overflow-x-auto">
                  {JSON.stringify(exec.inputs_json, null, 2)}
                </pre>
              </div>
              <div>
                <p className="text-xs font-mono text-slate-500 mb-1">Outputs:</p>
                <pre className="text-xs bg-slate-900 rounded p-2 overflow-x-auto">
                  {JSON.stringify(exec.outputs_json, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
