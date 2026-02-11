"use client";

import { useRouter } from "next/navigation";
import { useBusinessContext } from "@/lib/business-context";
import { getCapabilityMeta } from "@/lib/CapabilityRegistry";
import ExecutionSurface from "@/components/bos/ExecutionSurface";
import DocumentsView from "@/components/bos/DocumentsView";
import HistoryView from "@/components/bos/HistoryView";
import DataGridStub from "@/components/bos/capabilities/DataGridStub";
import DashboardStub from "@/components/bos/capabilities/DashboardStub";
import KanbanStub from "@/components/bos/capabilities/KanbanStub";
import TimelineStub from "@/components/bos/capabilities/TimelineStub";
import TreeStub from "@/components/bos/capabilities/TreeStub";
import FormStub from "@/components/bos/capabilities/FormStub";
import { Button } from "@/components/ui/Button";

export default function CapabilityPageClient({
  deptKey,
  capKey,
}: {
  deptKey: string;
  capKey: string;
}) {
  const router = useRouter();
  const { businessId, departments, capabilities, loadingCapabilities } = useBusinessContext();

  const dept = departments.find((d) => d.key === deptKey);
  const cap = capabilities.find((c) => c.key === capKey);

  if (!dept) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] text-center px-4">
        <h2 className="text-xl font-semibold mb-2">Not Provisioned</h2>
        <p className="text-bm-muted text-sm">
          The department &ldquo;{deptKey}&rdquo; is not enabled for this business.
        </p>
      </div>
    );
  }

  if (loadingCapabilities) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-8 w-48 bg-bm-surface/60 border border-bm-border/60 rounded" />
        <div className="h-64 bg-bm-surface/60 border border-bm-border/60 rounded-lg" />
      </div>
    );
  }

  if (!cap) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] text-center px-4">
        <h2 className="text-xl font-semibold mb-2">Capability Not Found</h2>
        <p className="text-bm-muted text-sm mb-4">
          &ldquo;{capKey}&rdquo; is not enabled for {dept.label}.
        </p>
        <Button
          variant="ghost"
          onClick={() => router.push(`/app/${deptKey}`)}
        >
          Back to {dept.label}
        </Button>
      </div>
    );
  }

  // Registry is authoritative for kind; fall back to DB kind
  const registryMeta = getCapabilityMeta(deptKey, capKey);
  const effectiveKind = registryMeta?.kind || cap.kind;

  switch (effectiveKind) {
    case "document_view":
      return (
        <div className="max-w-4xl">
          <h1 className="text-xl font-bold mb-1">{cap.label}</h1>
          <p className="text-sm text-bm-muted mb-6">{dept.label} documents</p>
          <DocumentsView businessId={businessId!} departmentId={dept.department_id} />
        </div>
      );

    case "history":
      return (
        <div className="max-w-4xl">
          <h1 className="text-xl font-bold mb-1">{cap.label}</h1>
          <p className="text-sm text-bm-muted mb-6">{dept.label} execution history</p>
          <HistoryView businessId={businessId!} departmentId={dept.department_id} />
        </div>
      );

    case "data_grid":
      return <DataGridStub deptKey={deptKey} capKey={capKey} capLabel={cap.label} />;

    case "dashboard":
      return <DashboardStub deptKey={deptKey} capKey={capKey} capLabel={cap.label} />;

    case "kanban":
      return <KanbanStub deptKey={deptKey} capKey={capKey} capLabel={cap.label} />;

    case "timeline":
      return <TimelineStub deptKey={deptKey} capKey={capKey} capLabel={cap.label} />;

    case "tree":
      return <TreeStub deptKey={deptKey} capKey={capKey} capLabel={cap.label} />;

    case "form":
      return <FormStub deptKey={deptKey} capKey={capKey} capLabel={cap.label} />;

    case "action":
    default:
      return (
        <div className="max-w-4xl">
          <Button
            variant="ghost"
            onClick={() => router.push(`/app/${deptKey}`)}
            className="mb-4"
          >
            &larr; {dept.label}
          </Button>
          <h1 className="text-xl font-bold mb-1">{cap.label}</h1>
          <p className="text-sm text-bm-muted mb-6">Execute action</p>
          <ExecutionSurface
            businessId={businessId!}
            departmentId={dept.department_id}
            capabilityId={cap.capability_id}
            metadataJson={cap.metadata_json as Record<string, unknown>}
          />
        </div>
      );
  }
}
