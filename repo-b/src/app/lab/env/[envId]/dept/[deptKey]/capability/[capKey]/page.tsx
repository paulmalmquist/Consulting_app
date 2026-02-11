"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { useEnv } from "@/components/EnvProvider";
import {
  LAB_DEPARTMENT_BY_KEY,
  type LabDepartmentKey,
} from "@/lib/lab/DepartmentRegistry";
import { getCapabilityByKey } from "@/lib/lab/CapabilityRegistry";
import {
  filterCapabilitiesByRole,
  getStoredLabRole,
  isDepartmentAllowed,
  type LabRole,
} from "@/lib/lab/rbac";
import { Card, CardContent, CardDescription, CardTitle } from "@/components/ui/Card";
import CrmCompanies from "@/components/lab/crm/CrmCompanies";
import CrmContacts from "@/components/lab/crm/CrmContacts";
import CrmInteractions from "@/components/lab/crm/CrmInteractions";
import { deptRoute, resolveDepartmentForEnv, setStoredLastDept } from "@/lib/lab/deptRouting";

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
  const router = useRouter();
  const { selectedEnv } = useEnv();
  const [role, setRole] = useState<LabRole>(() => getStoredLabRole());
  const deptKey = params.deptKey as LabDepartmentKey;
  const department = LAB_DEPARTMENT_BY_KEY[deptKey];
  const industry =
    selectedEnv?.env_id === params.envId ? selectedEnv.industry : undefined;
  const capability = getCapabilityByKey(deptKey, params.capKey, { industry });
  const deptAllowed = !!department && isDepartmentAllowed(role, deptKey);
  const capAllowed = capability
    ? filterCapabilitiesByRole(role, [capability]).length > 0
    : false;
  const resolvedDept = useMemo(
    () => resolveDepartmentForEnv(params.envId, industry, role),
    [params.envId, industry, role]
  );

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

  useEffect(() => {
    if (!department || !capability) return;
    document.title = `${capability.label} | ${department.label} | Lab Environments`;
  }, [department, capability]);

  useEffect(() => {
    const syncRole = () => setRole(getStoredLabRole());
    window.addEventListener("storage", syncRole);
    return () => window.removeEventListener("storage", syncRole);
  }, []);

  useEffect(() => {
    if (deptAllowed) {
      setStoredLastDept(params.envId, deptKey);
      return;
    }
    router.replace(deptRoute(params.envId, resolvedDept));
  }, [deptAllowed, params.envId, deptKey, resolvedDept, router]);

  if (!deptAllowed) {
    return (
      <Card>
        <CardContent>
          <CardTitle className="text-xl">Loading department</CardTitle>
          <CardDescription>Redirecting to the environment default department.</CardDescription>
        </CardContent>
      </Card>
    );
  }

  if (capability && !capAllowed) {
    return (
      <Card>
        <CardContent>
          <CardTitle className="text-xl">Access Restricted</CardTitle>
          <CardDescription>
            Your role does not have access to this capability.
          </CardDescription>
        </CardContent>
      </Card>
    );
  }

  if (!capability) {
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

  // CRM capability dispatch
  if (deptKey === "crm") {
    if (params.capKey === "companies") return <CrmCompanies envId={params.envId} />;
    if (params.capKey === "contacts") return <CrmContacts envId={params.envId} />;
    if (params.capKey === "interactions") return <CrmInteractions envId={params.envId} />;
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
            <p className="text-sm text-bm-muted">{capability.description}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
