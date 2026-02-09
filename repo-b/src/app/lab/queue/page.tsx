"use client";

import { useEffect, useState } from "react";
import { useEnv } from "@/components/EnvProvider";
import { apiFetch } from "@/lib/api";

type QueueItem = {
  id: string;
  created_at: string;
  status: string;
  risk_level: string;
  requested_action: Record<string, unknown>;
};

export default function QueuePage() {
  const { selectedEnv } = useEnv();
  const [items, setItems] = useState<QueueItem[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  const loadQueue = async () => {
    if (!selectedEnv) return;
    try {
      const data = await apiFetch<{ items: QueueItem[] }>("/v1/queue", {
        params: { env_id: selectedEnv.env_id }
      });
      setItems(data.items || []);
    } catch {
      setItems([]);
    }
  };

  useEffect(() => {
    loadQueue();
  }, [selectedEnv?.env_id]);

  const decide = async (id: string, decision: "approve" | "deny") => {
    setMessage(null);
    try {
      await apiFetch(`/v1/queue/${id}/decision`, {
        method: "POST",
        body: JSON.stringify({ decision, reason: "Reviewed in demo" })
      });
      setMessage(`Decision recorded (${decision}).`);
      await loadQueue();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Decision failed";
      setMessage(message);
    }
  };

  return (
    <div className="space-y-6">
      <section className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
        <h1 className="text-xl font-semibold">HITL Queue</h1>
        <p className="text-sm text-slate-400 mt-2">
          Demo Approver reviews medium/high risk actions.
        </p>
        {message ? <p className="mt-3 text-sm text-emerald-300">{message}</p> : null}
      </section>
      <section className="space-y-3">
        {items.map((item) => (
          <div
            key={item.id}
            className="bg-slate-900 border border-slate-800 rounded-2xl p-6"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold">
                  {typeof item.requested_action.type === "string"
                    ? item.requested_action.type
                    : "Requested action"}
                </p>
                <p className="text-xs text-slate-500">
                  {item.risk_level} risk · {item.status}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => decide(item.id, "approve")}
                  className="px-3 py-1 rounded-lg bg-emerald-400 text-slate-900 text-sm font-semibold"
                >
                  Approve
                </button>
                <button
                  onClick={() => decide(item.id, "deny")}
                  className="px-3 py-1 rounded-lg border border-slate-700 text-sm"
                >
                  Deny
                </button>
              </div>
            </div>
            <pre className="mt-4 text-xs text-slate-400 bg-slate-950 p-3 rounded-lg overflow-auto">
{JSON.stringify(item.requested_action, null, 2)}
            </pre>
          </div>
        ))}
        {items.length === 0 ? (
          <p className="text-sm text-slate-500">No pending approvals.</p>
        ) : null}
      </section>
    </div>
  );
}
