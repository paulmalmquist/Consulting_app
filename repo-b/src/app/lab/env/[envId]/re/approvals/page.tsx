"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useRepeContext, useRepeBasePath } from "@/lib/repe-context";
import { publishAssistantPageContext, resetAssistantPageContext } from "@/lib/commandbar/appContextBridge";
import { KpiStrip, type KpiDef } from "@/components/repe/asset-cockpit/KpiStrip";
import { StateCard } from "@/components/ui/StateCard";

interface Approval {
  id: string;
  step_label: string;
  actor: string;
  status: string;
  notes: string | null;
  due_date: string | null;
  created_at: string;
  updated_at: string | null;
  workflow_name: string;
  entity_type: string;
  entity_id: string;
  transition_label: string | null;
  outcome: string | null;
}

const STATUS_OPTIONS = ["All", "pending", "approved", "rejected", "in_progress"] as const;

function statusBadgeClass(status: string): string {
  switch (status) {
    case "pending":
      return "bg-yellow-500/15 text-yellow-400 border-yellow-500/30";
    case "approved":
      return "bg-green-500/15 text-green-400 border-green-500/30";
    case "rejected":
      return "bg-red-500/15 text-red-400 border-red-500/30";
    case "in_progress":
      return "bg-blue-500/15 text-blue-400 border-blue-500/30";
    default:
      return "bg-bm-surface/40 text-bm-muted2 border-bm-border/30";
  }
}

function formatDate(d: string | null): string {
  if (!d) return "\u2014";
  return d.slice(0, 10);
}

export default function ApprovalsPage() {
  const { businessId, environmentId, loading, contextError, initializeWorkspace } = useRepeContext();
  const basePath = useRepeBasePath();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [error, setError] = useState<string | null>(null);

  const statusFilter = searchParams.get("status") || "All";

  const setFilter = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value === "All" || value === "") {
      params.delete(key);
    } else {
      params.set(key, value);
    }
    const qs = params.toString();
    router.replace(qs ? `?${qs}` : "?", { scroll: false });
  };

  const refreshApprovals = useCallback(async () => {
    if (!environmentId) return;
    try {
      const url = new URL("/api/re/v2/approvals", window.location.origin);
      url.searchParams.set("env_id", environmentId);
      if (businessId) url.searchParams.set("business_id", businessId);
      const res = await fetch(url.toString());
      if (!res.ok) throw new Error("Failed to load approvals");
      const data = await res.json();
      setApprovals(data.approvals || []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load approvals");
    }
  }, [businessId, environmentId]);

  useEffect(() => {
    void refreshApprovals();
  }, [refreshApprovals]);

  const filteredApprovals = useMemo(() => {
    return approvals.filter((a) => {
      if (statusFilter !== "All" && a.status !== statusFilter) return false;
      return true;
    });
  }, [approvals, statusFilter]);

  const pendingCount = useMemo(() => approvals.filter((a) => a.status === "pending").length, [approvals]);
  const approvedCount = useMemo(() => approvals.filter((a) => a.status === "approved").length, [approvals]);
  const rejectedCount = useMemo(() => approvals.filter((a) => a.status === "rejected").length, [approvals]);

  const kpis = useMemo<KpiDef[]>(
    () => [
      { label: "Pending", value: String(pendingCount) },
      { label: "Approved", value: String(approvedCount) },
      { label: "Rejected", value: String(rejectedCount) },
    ],
    [pendingCount, approvedCount, rejectedCount]
  );

  useEffect(() => {
    publishAssistantPageContext({
      route: environmentId ? `/lab/env/${environmentId}/re/approvals` : basePath + "/approvals",
      surface: "approval_list",
      active_module: "re",
      page_entity_type: "environment",
      page_entity_id: environmentId || null,
      page_entity_name: null,
      selected_entities: [],
      visible_data: {
        approvals: filteredApprovals.map((a) => ({
          entity_type: a.entity_type,
          entity_id: a.entity_id,
          name: a.step_label,
          metadata: {
            status: a.status,
            workflow_name: a.workflow_name,
            actor: a.actor,
          },
        })),
        metrics: {
          pending: pendingCount,
          approved: approvedCount,
          rejected: rejectedCount,
        },
        notes: ["Approval gates dashboard"],
      },
    });
    return () => resetAssistantPageContext();
  }, [basePath, environmentId, filteredApprovals, pendingCount, approvedCount, rejectedCount]);

  if (!businessId) {
    if (loading) return <StateCard state="loading" />;
    return (
      <StateCard
        state="error"
        title="REPE workspace not initialized"
        message={contextError || "Unable to resolve workspace context."}
        onRetry={() => void initializeWorkspace()}
      />
    );
  }

  return (
    <section className="flex flex-col gap-4" data-testid="re-approvals-list">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-xl font-semibold text-bm-text">Approval Gates</h2>
          <p className="mt-1 text-sm text-bm-muted2">Workflow approval items across the platform.</p>
        </div>
      </div>

      <KpiStrip kpis={kpis} />

      <div className="flex flex-wrap items-center gap-2">
        <label className="text-xs uppercase tracking-[0.1em] text-bm-muted2">
          Status
          <select
            className="mt-1 block h-8 w-36 cursor-pointer appearance-none rounded-md border border-bm-border/30 bg-bm-surface/40 px-2 text-xs"
            value={statusFilter}
            onChange={(e) => setFilter("status", e.target.value)}
            data-testid="filter-status"
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s === "All" ? "All Statuses" : s === "in_progress" ? "In Progress" : s.charAt(0).toUpperCase() + s.slice(1)}
              </option>
            ))}
          </select>
        </label>

        {statusFilter !== "All" && (
          <button
            type="button"
            onClick={() => router.replace("?", { scroll: false })}
            className="rounded-md border border-bm-border/30 px-3 py-1.5 text-xs text-bm-muted transition-colors duration-100 hover:bg-bm-surface/20 hover:text-bm-text"
          >
            Clear Filters
          </button>
        )}
      </div>

      {error && <StateCard state="error" title="Failed to load approvals" message={error} />}

      {filteredApprovals.length === 0 && !error ? (
        statusFilter !== "All" ? (
          <div className="rounded-lg border border-bm-border/20 p-6 text-center text-sm text-bm-muted2">
            No approvals match the current filter.
          </div>
        ) : (
          <StateCard
            state="empty"
            title="No approval items"
            message="Approval gate items are created by workflow transitions."
          />
        )
      ) : (
        <div className="overflow-x-auto rounded-xl border border-bm-border/30">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-bm-border/20 bg-bm-surface/30 text-left text-xs uppercase tracking-wider text-bm-muted2">
                <th className="px-4 py-2.5 font-medium">Step</th>
                <th className="px-4 py-2.5 font-medium">Workflow</th>
                <th className="px-4 py-2.5 font-medium">Entity</th>
                <th className="px-4 py-2.5 font-medium">Actor</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 font-medium">Due Date</th>
                <th className="px-4 py-2.5 font-medium">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-bm-border/10">
              {filteredApprovals.map((a) => (
                <tr
                  key={a.id}
                  className="transition-colors duration-75 hover:bg-bm-surface/20"
                  data-testid={`approval-row-${a.id}`}
                >
                  <td className="px-4 py-3 font-medium text-bm-text">{a.step_label}</td>
                  <td className="px-4 py-3 text-bm-muted2">{a.workflow_name}</td>
                  <td className="px-4 py-3 text-bm-muted2">
                    <span className="text-xs">{a.entity_type}</span>
                    {a.entity_id ? (
                      <span className="ml-1 text-xs text-bm-muted2">{a.entity_id.slice(0, 8)}...</span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-bm-muted2">{a.actor}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] capitalize ${statusBadgeClass(a.status)}`}>
                      {a.status === "in_progress" ? "In Progress" : a.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 tabular-nums text-bm-muted2">{formatDate(a.due_date)}</td>
                  <td className="px-4 py-3 tabular-nums text-bm-muted2">{formatDate(a.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
