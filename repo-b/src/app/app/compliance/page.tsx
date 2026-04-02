"use client";

import { useEffect, useState } from "react";

type Control = {
  control_id: string;
  description: string;
  control_type: string;
  system_component: string;
  evidence_generated: string;
  frequency: string;
  status: string;
};

type EventRow = {
  id: string;
  timestamp: string;
  user_id: string | null;
  entity_type: string;
  entity_id: string;
  action_type: string;
};

const API_BASE = ""; // Same-origin — routes through /bos proxy

export default function CompliancePage() {
  const [controls, setControls] = useState<Control[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [cRes, eRes] = await Promise.all([
          fetch(`${API_BASE}/api/compliance/controls`),
          fetch(`${API_BASE}/api/compliance/event-log?limit=25`),
        ]);
        setControls(await cRes.json());
        setEvents(await eRes.json());
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) return <div className="text-sm text-bm-muted">Loading compliance evidence…</div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Compliance Layer</h1>
        <p className="text-sm text-bm-muted">SOC 2 control registry + evidence explorer.</p>
      </div>

      <section className="space-y-2">
        <h2 className="text-lg font-medium">Control Registry</h2>
        <div className="rounded border border-bm-border overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-bm-surface">
              <tr>
                <th className="p-2 text-left">ID</th>
                <th className="p-2 text-left">Description</th>
                <th className="p-2 text-left">Type</th>
                <th className="p-2 text-left">Status</th>
              </tr>
            </thead>
            <tbody>
              {controls.map((c) => (
                <tr key={c.control_id} className="border-t border-bm-border/60">
                  <td className="p-2 font-mono">{c.control_id}</td>
                  <td className="p-2">{c.description}</td>
                  <td className="p-2">{c.control_type}</td>
                  <td className="p-2">{c.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-medium">Audit Log Explorer</h2>
        <div className="rounded border border-bm-border overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-bm-surface">
              <tr>
                <th className="p-2 text-left">Timestamp</th>
                <th className="p-2 text-left">User</th>
                <th className="p-2 text-left">Entity</th>
                <th className="p-2 text-left">Action</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.id} className="border-t border-bm-border/60">
                  <td className="p-2">{new Date(e.timestamp).toLocaleString()}</td>
                  <td className="p-2">{e.user_id || "system"}</td>
                  <td className="p-2">{e.entity_type}:{e.entity_id}</td>
                  <td className="p-2">{e.action_type}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
