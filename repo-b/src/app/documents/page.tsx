"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useBusinessContext } from "@/lib/business-context";
import DocumentsView from "@/components/bos/DocumentsView";
import { buttonVariants } from "@/components/ui/buttonVariants";
import { cn } from "@/lib/cn";

function DocumentsContent() {
  const searchParams = useSearchParams();
  const departmentId = searchParams.get("department") || undefined;
  const { businessId, departments } = useBusinessContext();

  if (!businessId) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
        <h2 className="text-xl font-semibold mb-2">No Business Configured</h2>
        <p className="text-bm-muted text-sm mb-6">Set up your business to manage documents.</p>
        <a
          href="/onboarding"
          className={buttonVariants({ variant: "primary" })}
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
      <p className="text-sm text-bm-muted mb-6">
        {dept ? `Filtered to: ${dept.label}` : "All business documents"}
      </p>

      {/* Department filter */}
      {departments.length > 1 && (
        <div className="flex flex-wrap gap-2 mb-6">
          <a
            href="/documents"
            className={cn(
              "text-xs px-3 py-1.5 rounded-lg transition border",
              !departmentId
                ? "bg-bm-accent/12 text-bm-text border-bm-accent/30 shadow-bm-glow"
                : "bg-bm-surface/50 text-bm-muted border-bm-border/70 hover:bg-bm-surface2/50"
            )}
          >
            All
          </a>
          {departments.map((d) => (
            <a
              key={d.department_id}
              href={`/documents?department=${d.department_id}`}
              className={cn(
                "text-xs px-3 py-1.5 rounded-lg transition border",
                departmentId === d.department_id
                  ? "bg-bm-accent/12 text-bm-text border-bm-accent/30 shadow-bm-glow"
                  : "bg-bm-surface/50 text-bm-muted border-bm-border/70 hover:bg-bm-surface2/50"
              )}
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
    <Suspense
      fallback={
        <div className="animate-pulse h-64 bg-bm-surface/60 border border-bm-border/60 rounded-lg" />
      }
    >
      <DocumentsContent />
    </Suspense>
  );
}
