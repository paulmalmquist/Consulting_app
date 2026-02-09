"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useBusinessContext } from "@/lib/business-context";
import DocumentsView from "@/components/bos/DocumentsView";

function DocumentsContent() {
  const searchParams = useSearchParams();
  const departmentId = searchParams.get("department") || undefined;
  const { businessId, departments } = useBusinessContext();

  if (!businessId) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
        <h2 className="text-xl font-semibold mb-2">No Business Configured</h2>
        <p className="text-slate-400 text-sm mb-6">Set up your business to manage documents.</p>
        <a
          href="/onboarding"
          className="bg-sky-600 hover:bg-sky-500 text-white font-medium px-6 py-2.5 rounded-lg text-sm transition-colors"
        >
          Start Setup
        </a>
      </div>
    );
  }

  const dept = departmentId
    ? departments.find((d) => d.department_id === departmentId)
    : null;

  return (
    <div className="max-w-4xl">
      <h1 className="text-xl font-bold mb-1">Documents</h1>
      <p className="text-sm text-slate-400 mb-6">
        {dept ? `Filtered to: ${dept.label}` : "All business documents"}
      </p>

      {/* Department filter */}
      {departments.length > 1 && (
        <div className="flex flex-wrap gap-2 mb-6">
          <a
            href="/documents"
            className={`text-xs px-3 py-1.5 rounded-lg transition-colors ${
              !departmentId
                ? "bg-sky-600 text-white"
                : "bg-slate-800 text-slate-300 hover:bg-slate-700"
            }`}
          >
            All
          </a>
          {departments.map((d) => (
            <a
              key={d.department_id}
              href={`/documents?department=${d.department_id}`}
              className={`text-xs px-3 py-1.5 rounded-lg transition-colors ${
                departmentId === d.department_id
                  ? "bg-sky-600 text-white"
                  : "bg-slate-800 text-slate-300 hover:bg-slate-700"
              }`}
            >
              {d.label}
            </a>
          ))}
        </div>
      )}

      <DocumentsView businessId={businessId} departmentId={departmentId} />
    </div>
  );
}

export default function GlobalDocumentsPage() {
  return (
    <Suspense fallback={<div className="animate-pulse h-64 bg-slate-800 rounded-lg" />}>
      <DocumentsContent />
    </Suspense>
  );
}
