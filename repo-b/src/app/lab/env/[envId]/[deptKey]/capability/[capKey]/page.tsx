"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import {
  LAB_DEPARTMENT_BY_KEY,
  type LabDepartmentKey,
} from "@/lib/lab/DepartmentRegistry";
import { getCapabilityByKey } from "@/lib/lab/CapabilityRegistry";
import { Card, CardContent, CardDescription, CardTitle } from "@/components/ui/Card";

type Metrics = {
  uploads_count: number;
  tickets_count: number;
  pending_approvals: number;
  approval_rate: number;
  override_rate: number;
  avg_time_to_decision_sec: number;
};

export default function LabCapabilityPage({
  params,
}: {
  params: { envId: string; deptKey: string; capKey: string };
}) {
  const deptKey = params.deptKey as LabDepartmentKey;
  const department = LAB_DEPARTMENT_BY_KEY[deptKey];
  const capability = getCapabilityByKey(deptKey, params.capKey);

  const [metrics, setMetrics] = useState<Metrics | null>(null);

  useEffect(() => {
    if (params.capKey !== "metrics") return;
    apiFetch<Metrics>("/v1/metrics", { params: { env_id: params.envId } })
      .then((data) => setMetrics(data))
      .catch(() => setMetrics(null));
  }, [params.capKey, params.envId]);

  const metricCards = useMemo(() => {
    if (!metrics) return [];
    return [
      { label: "Uploads", value: metrics.uploads_count },
      { label: "Tickets", value: metrics.tickets_count },
      { label: "Pending approvals", value: metrics.pending_approvals },
      { label: "Approval rate", value: `${(metrics.approval_rate * 100).toFixed(1)}%` },
      { label: "Override rate", value: `${(metrics.override_rate * 100).toFixed(1)}%` },
      {
        label: "Avg time to decision",
        value: `${metrics.avg_time_to_decision_sec.toFixed(0)} sec`,
      },
    ];
  }, [metrics]);

  const reBase = `/lab/env/${params.envId}/re`;
  const financeRouteByCapability: Record<string, string> = {
    repe_waterfalls: `${reBase}/waterfalls`,
    underwriting: `${reBase}/deals`,
    scenario_lab: "/app/finance/scenarios",
    legal_economics: "/app/finance/legal",
    healthcare_mso: "/app/finance/healthcare",
    construction_finance: "/app/finance/construction",
    security_acl: "/app/finance/security",
  };
  const financeRoute = deptKey === "finance" ? financeRouteByCapability[params.capKey] : undefined;

  if (!department || !capability) {
    return (
      <Card>
        <CardContent>
          <CardTitle className="text-xl">Capability Not Found</CardTitle>
          <CardDescription>
            This capability is not configured for the selected department.
          </CardDescription>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent>
          <CardTitle className="text-xl">{capability.label}</CardTitle>
          <CardDescription>
            {department.label} capability for environment {params.envId.slice(0, 8)}.
          </CardDescription>
        </CardContent>
      </Card>

      {financeRoute ? (
        <Card>
          <CardContent className="space-y-2">
            <p className="text-sm text-bm-muted">
              This capability runs in the dedicated finance workspace.
            </p>
            <Link
              href={financeRoute}
              className="inline-flex rounded-lg border border-bm-border px-3 py-2 text-sm hover:bg-bm-surface/50"
              data-testid="open-finance-workspace"
            >
              Open {capability.label}
            </Link>
          </CardContent>
        </Card>
      ) : null}

      {params.capKey === "metrics" ? (
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {metricCards.map((card) => (
            <Card key={card.label}>
              <CardContent>
                <p className="text-xs uppercase tracking-[0.12em] text-bm-muted2">{card.label}</p>
                <p className="mt-1 text-2xl font-semibold">{card.value}</p>
              </CardContent>
            </Card>
          ))}
          {!metricCards.length ? (
            <Card>
              <CardContent>
                <p className="text-sm text-bm-muted">Metrics data is not available yet.</p>
              </CardContent>
            </Card>
          ) : null}
        </section>
      ) : (
        <Card>
          <CardContent>
            {/* Server should provide capability-specific data models in a later phase. */}
            <p className="text-sm text-bm-muted">{capability.description}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
