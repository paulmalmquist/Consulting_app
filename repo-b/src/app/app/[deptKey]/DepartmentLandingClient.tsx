"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useBusinessContext } from "@/lib/business-context";
import { listDocuments, listExecutions, DocumentItem, ExecutionItem } from "@/lib/bos-api";
import { Badge } from "@/components/ui/Badge";

export default function DepartmentLandingClient({ deptKey }: { deptKey: string }) {
  const { businessId, departments, capabilities, loadingCapabilities } = useBusinessContext();

  const [docs, setDocs] = useState<DocumentItem[]>([]);
  const [executions, setExecutions] = useState<ExecutionItem[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [loadingExec, setLoadingExec] = useState(false);

  const dept = departments.find((d) => d.key === deptKey);
  const deptId = dept?.department_id;

  useEffect(() => {
    if (!businessId || !deptId) return;

    setLoadingDocs(true);
    listDocuments(businessId, deptId)
      .then((d) => setDocs(d.slice(0, 5)))
      .catch(() => setDocs([]))
      .finally(() => setLoadingDocs(false));

    setLoadingExec(true);
    listExecutions(businessId, deptId)
      .then((e) => setExecutions(e.slice(0, 5)))
      .catch(() => setExecutions([]))
      .finally(() => setLoadingExec(false));
  }, [businessId, deptId]);

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

  const actionCaps = capabilities.filter((c) => c.kind === "action");

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-xl font-bold">{dept.label}</h1>
        <p className="text-sm text-bm-muted">Department overview and quick actions</p>
      </div>

      {!loadingCapabilities && actionCaps.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-bm-muted2 uppercase tracking-[0.14em] mb-3">
            Quick Actions
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {actionCaps.map((cap) => (
              <Link
                key={cap.key}
                href={`/app/${deptKey}/capability/${cap.key}`}
                className="bm-glass-interactive rounded-xl p-4"
              >
                <p className="font-medium text-sm">{cap.label}</p>
                <p className="text-xs text-bm-muted2 mt-1">
                  {cap.kind === "action" ? "Run action" : cap.kind}
                </p>
              </Link>
            ))}
          </div>
        </section>
      )}

      {loadingCapabilities && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="h-20 bg-bm-surface/60 border border-bm-border/60 rounded-lg animate-pulse" />
          <div className="h-20 bg-bm-surface/60 border border-bm-border/60 rounded-lg animate-pulse" />
        </div>
      )}

      <section>
        <h2 className="text-sm font-semibold text-bm-muted2 uppercase tracking-[0.14em] mb-3">
          Recent Runs
        </h2>
        {loadingExec ? (
          <div className="space-y-2">
            <div className="h-12 bg-bm-surface/60 border border-bm-border/60 rounded-lg animate-pulse" />
            <div className="h-12 bg-bm-surface/60 border border-bm-border/60 rounded-lg animate-pulse" />
          </div>
        ) : executions.length === 0 ? (
          <p className="text-sm text-bm-muted2 bm-glass rounded-lg p-4">
            No runs yet. Use a quick action above to create one.
          </p>
        ) : (
          <div className="space-y-2">
            {executions.map((exec) => (
              <div
                key={exec.execution_id}
                className="bm-glass rounded-lg px-4 py-3 flex items-center justify-between"
              >
                <div>
                  <p className="text-sm font-medium">{exec.execution_id.slice(0, 8)}...</p>
                  <p className="text-xs text-bm-muted2">
                    {new Date(exec.created_at).toLocaleString()}
                  </p>
                </div>
                <Badge
                  variant={
                    exec.status === "completed"
                      ? "success"
                      : exec.status === "failed"
                        ? "danger"
                        : "warning"
                  }
                >
                  {exec.status}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-bm-muted2 uppercase tracking-[0.14em]">
            Recent Documents
          </h2>
          <Link
            href={`/documents?department=${dept.department_id}`}
            className="text-xs text-bm-accent hover:text-bm-accent2"
          >
            View all
          </Link>
        </div>
        {loadingDocs ? (
          <div className="space-y-2">
            <div className="h-12 bg-bm-surface/60 border border-bm-border/60 rounded-lg animate-pulse" />
          </div>
        ) : docs.length === 0 ? (
          <p className="text-sm text-bm-muted2 bm-glass rounded-lg p-4">No documents yet.</p>
        ) : (
          <div className="space-y-2">
            {docs.map((doc) => (
              <div
                key={doc.document_id}
                className="bm-glass rounded-lg px-4 py-3 flex items-center justify-between"
              >
                <div>
                  <p className="text-sm font-medium">{doc.title}</p>
                  <p className="text-xs text-bm-muted2">
                    v{doc.latest_version_number || 1} &middot; {doc.status}
                  </p>
                </div>
                <span className="text-xs text-bm-muted2">
                  {new Date(doc.created_at).toLocaleDateString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
