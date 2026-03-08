"use client";

import { useSearchParams } from "next/navigation";
import { useReEnv } from "@/components/repe/workspace/ReEnvProvider";
import ReportRenderer from "@/components/repe/reports/ReportRenderer";

export default function ReportViewerPage({
  params,
}: {
  params: { envId: string; reportKey: string };
}) {
  const searchParams = useSearchParams();
  const { businessId } = useReEnv();

  const entityType =
    (searchParams.get("entity_type") as "asset" | "investment" | "fund") || "asset";
  const entityId = searchParams.get("entity_id") || "";
  const quarter = searchParams.get("quarter") || "";

  if (!entityId || !quarter) {
    return (
      <div className="mx-auto max-w-4xl px-6 py-12">
        <div className="rounded-xl border border-bm-border/50 bg-bm-surface/20 p-8 text-center">
          <h2 className="text-lg font-semibold">Report Viewer</h2>
          <p className="mt-2 text-sm text-bm-muted2">
            Missing required parameters. Pass <code>entity_id</code> and{" "}
            <code>quarter</code> as query parameters.
          </p>
          <p className="mt-4 text-xs text-bm-muted2">
            Example: <code>?entity_type=asset&entity_id=UUID&quarter=2025Q3</code>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <ReportRenderer
        reportKey={params.reportKey}
        entityType={entityType}
        entityId={entityId}
        envId={params.envId}
        businessId={businessId}
        quarter={quarter}
      />
    </div>
  );
}
