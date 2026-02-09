"use client";

import { useParams, useRouter } from "next/navigation";
import { useBusinessContext } from "@/lib/business-context";
import ExecutionSurface from "@/components/bos/ExecutionSurface";
import DocumentsView from "@/components/bos/DocumentsView";
import HistoryView from "@/components/bos/HistoryView";

export default function CapabilityPage() {
  const params = useParams();
  const router = useRouter();
  const deptKey = params?.deptKey as string;
  const capKey = params?.capKey as string;
  const { businessId, departments, capabilities, loadingCapabilities } = useBusinessContext();

  const dept = departments.find((d) => d.key === deptKey);
  const cap = capabilities.find((c) => c.key === capKey);

  if (!dept) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] text-center px-4">
        <h2 className="text-xl font-semibold mb-2">Not Provisioned</h2>
        <p className="text-slate-400 text-sm">
          The department &ldquo;{deptKey}&rdquo; is not enabled for this business.
        </p>
      </div>
    );
  }

  if (loadingCapabilities) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-8 w-48 bg-slate-800 rounded" />
        <div className="h-64 bg-slate-800 rounded-lg" />
      </div>
    );
  }

  if (!cap) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] text-center px-4">
        <h2 className="text-xl font-semibold mb-2">Capability Not Found</h2>
        <p className="text-slate-400 text-sm mb-4">
          &ldquo;{capKey}&rdquo; is not enabled for {dept.label}.
        </p>
        <button
          onClick={() => router.push(`/app/${deptKey}`)}
          className="text-sky-400 hover:text-sky-300 text-sm"
        >
          Back to {dept.label}
        </button>
      </div>
    );
  }

  // Render based on capability kind
  if (cap.kind === "document_view") {
    return (
      <div className="max-w-4xl">
        <h1 className="text-xl font-bold mb-1">{cap.label}</h1>
        <p className="text-sm text-slate-400 mb-6">{dept.label} documents</p>
        <DocumentsView businessId={businessId!} departmentId={dept.department_id} />
      </div>
    );
  }

  if (cap.kind === "history") {
    return (
      <div className="max-w-4xl">
        <h1 className="text-xl font-bold mb-1">{cap.label}</h1>
        <p className="text-sm text-slate-400 mb-6">{dept.label} execution history</p>
        <HistoryView businessId={businessId!} departmentId={dept.department_id} />
      </div>
    );
  }

  // Default: action execution surface
  return (
    <div className="max-w-4xl">
      <button
        onClick={() => router.push(`/app/${deptKey}`)}
        className="text-sm text-slate-400 hover:text-slate-200 mb-4 block"
      >
        &larr; {dept.label}
      </button>
      <h1 className="text-xl font-bold mb-1">{cap.label}</h1>
      <p className="text-sm text-slate-400 mb-6">Execute action</p>
      <ExecutionSurface
        businessId={businessId!}
        departmentId={dept.department_id}
        capabilityId={cap.capability_id}
        metadataJson={cap.metadata_json as Record<string, unknown>}
      />
    </div>
  );
}
