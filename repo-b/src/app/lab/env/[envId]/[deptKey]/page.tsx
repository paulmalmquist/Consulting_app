import Link from "next/link";
import { notFound } from "next/navigation";
import {
  LAB_DEPARTMENT_BY_KEY,
  type LabDepartmentKey,
} from "@/lib/lab/DepartmentRegistry";
import { getCapabilitiesForDepartment } from "@/lib/lab/CapabilityRegistry";
import { Card, CardContent, CardDescription, CardTitle } from "@/components/ui/Card";

export default async function LabDepartmentPage({
  params,
}: {
  params: Promise<{ envId: string; deptKey: string }>;
}) {
  const { envId, deptKey } = await params;
  const department = LAB_DEPARTMENT_BY_KEY[deptKey as LabDepartmentKey];
  if (!department) return notFound();

  const capabilities = getCapabilitiesForDepartment(deptKey as LabDepartmentKey);

  return (
    <div className="space-y-4">
      <Card>
        <CardContent>
          <CardTitle className="text-xl">{department.label}</CardTitle>
          <CardDescription>{department.description}</CardDescription>
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {capabilities.map((cap) => (
          <Link
            key={cap.key}
            href={`/lab/env/${envId}/${deptKey}/capability/${cap.key}`}
            data-testid={`cap-link-${cap.key}`}
            className="rounded-xl border border-bm-border/70 bg-bm-surface/35 p-4 transition hover:bg-bm-surface/50"
          >
            <p className="text-sm font-semibold text-bm-text">{cap.label}</p>
            <p className="mt-1 text-xs text-bm-muted">{cap.description}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
