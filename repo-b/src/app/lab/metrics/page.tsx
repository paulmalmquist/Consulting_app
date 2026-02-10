"use client";

import { useEffect, useState } from "react";
import { useEnv } from "@/components/EnvProvider";
import EnvGate from "@/components/EnvGate";
import { apiFetch } from "@/lib/api";
import { Card, CardContent, CardDescription, CardTitle } from "@/components/ui/Card";

type Metrics = {
  uploads_count: number;
  tickets_count: number;
  pending_approvals: number;
  approval_rate: number;
  override_rate: number;
  avg_time_to_decision_sec: number;
};

export default function MetricsPage() {
  const { selectedEnv } = useEnv();
  const [metrics, setMetrics] = useState<Metrics | null>(null);

  useEffect(() => {
    if (!selectedEnv) return;
    apiFetch<Metrics>("/v1/metrics", {
      params: { env_id: selectedEnv.env_id }
    })
      .then((data) => setMetrics(data))
      .catch(() => setMetrics(null));
  }, [selectedEnv?.env_id]);

  const cards = [
    { label: "Uploads", value: metrics?.uploads_count ?? 0 },
    { label: "Tickets", value: metrics?.tickets_count ?? 0 },
    { label: "Pending approvals", value: metrics?.pending_approvals ?? 0 },
    { label: "Approval rate", value: `${((metrics?.approval_rate ?? 0) * 100).toFixed(1)}%` },
    { label: "Override rate", value: `${((metrics?.override_rate ?? 0) * 100).toFixed(1)}%` },
    {
      label: "Avg time to decision",
      value: `${(metrics?.avg_time_to_decision_sec ?? 0).toFixed(0)} sec`
    }
  ];

  return (
    <EnvGate>
      <div className="space-y-6">
        <Card>
          <CardContent>
            <CardTitle className="text-xl">Metrics</CardTitle>
            <CardDescription>Track throughput and HITL performance.</CardDescription>
          </CardContent>
        </Card>
        <section className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {cards.map((card) => (
            <Card key={card.label}>
              <CardContent>
                <p className="text-xs text-bm-muted2 uppercase tracking-[0.14em]">
                  {card.label}
                </p>
                <p className="text-2xl font-semibold mt-2">{card.value}</p>
              </CardContent>
            </Card>
          ))}
        </section>
      </div>
    </EnvGate>
  );
}
