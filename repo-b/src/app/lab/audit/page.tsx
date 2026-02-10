"use client";

import { useEffect, useState } from "react";
import { useEnv } from "@/components/EnvProvider";
import EnvGate from "@/components/EnvGate";
import { apiFetch } from "@/lib/api";
import { Card, CardContent, CardDescription, CardTitle } from "@/components/ui/Card";

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
    <EnvGate>
      <div className="space-y-6">
        <Card>
          <CardContent>
            <CardTitle className="text-xl">Audit Log</CardTitle>
            <CardDescription>
              Every action is recorded with actor and details.
            </CardDescription>
          </CardContent>
        </Card>
        <Card className="overflow-auto">
          <CardContent>
            <table className="min-w-full text-sm">
              <thead className="text-bm-muted text-xs uppercase border-b border-bm-border/70">
                <tr>
                  <th className="text-left py-2">Time</th>
                  <th className="text-left py-2">Actor</th>
                  <th className="text-left py-2">Action</th>
                  <th className="text-left py-2">Entity</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="border-b border-bm-border/60 hover:bg-bm-surface/30 transition">
                    <td className="py-2 text-bm-muted">{item.at}</td>
                    <td className="py-2">{item.actor}</td>
                    <td className="py-2">{item.action}</td>
                    <td className="py-2 text-bm-muted">
                      {item.entity_type} · {item.entity_id}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {items.length === 0 ? (
              <p className="text-sm text-bm-muted2 mt-4">No audit events yet.</p>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </EnvGate>
  );
}
