"use client";

import { useEffect, useState } from "react";
import { useEnv } from "@/components/EnvProvider";
import { apiFetch } from "@/lib/api";

type AuditItem = {
  id: string;
  at: string;
  actor: string;
  action: string;
  entity_type: string;
  entity_id: string;
  details: Record<string, unknown>;
};

export default function AuditPage() {
  const { selectedEnv } = useEnv();
  const [items, setItems] = useState<AuditItem[]>([]);

  useEffect(() => {
    if (!selectedEnv) return;
    apiFetch<{ items: AuditItem[] }>("/v1/audit", {
      params: { env_id: selectedEnv.env_id }
    })
      .then((data) => setItems(data.items || []))
      .catch(() => setItems([]));
  }, [selectedEnv?.env_id]);

  return (
    <div className="space-y-6">
      <section className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
        <h1 className="text-xl font-semibold">Audit Log</h1>
        <p className="text-sm text-slate-400 mt-2">
          Every action is recorded with actor and details.
        </p>
      </section>
      <section className="bg-slate-900 border border-slate-800 rounded-2xl p-6 overflow-auto">
        <table className="min-w-full text-sm">
          <thead className="text-slate-400 text-xs uppercase border-b border-slate-800">
            <tr>
              <th className="text-left py-2">Time</th>
              <th className="text-left py-2">Actor</th>
              <th className="text-left py-2">Action</th>
              <th className="text-left py-2">Entity</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-b border-slate-800">
                <td className="py-2 text-slate-400">{item.at}</td>
                <td className="py-2">{item.actor}</td>
                <td className="py-2">{item.action}</td>
                <td className="py-2 text-slate-400">
                  {item.entity_type} · {item.entity_id}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {items.length === 0 ? (
          <p className="text-sm text-slate-500 mt-4">No audit events yet.</p>
        ) : null}
      </section>
    </div>
  );
}
