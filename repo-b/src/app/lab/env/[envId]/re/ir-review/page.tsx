"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useRepeContext } from "@/lib/repe-context";

interface Draft {
  id: string;
  fund_id: string;
  fund_name: string | null;
  quarter: string;
  draft_type: string;
  status: string;
  narrative_text: string | null;
  content_json: Record<string, unknown>;
  generated_by: string;
  reviewed_by: string | null;
  review_notes: string | null;
  created_at: string;
  updated_at: string;
}

const STATUS_TABS = ["All", "draft", "pending_review", "approved", "rejected"] as const;

function statusBadge(status: string) {
  const map: Record<string, string> = {
    draft: "bg-blue-500/15 text-blue-400 border-blue-500/30",
    pending_review: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
    approved: "bg-green-500/15 text-green-400 border-green-500/30",
    rejected: "bg-red-500/15 text-red-400 border-red-500/30",
  };
  return map[status] || "bg-bm-surface/40 text-bm-muted2 border-bm-border/30";
}

export default function IrReviewPage() {
  const { businessId, environmentId, loading } = useRepeContext();
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("All");
  const [selectedDraft, setSelectedDraft] = useState<Draft | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!businessId) return;
    try {
      const url = new URL("/api/re/v2/ir-drafts", window.location.origin);
      url.searchParams.set("business_id", businessId);
      if (statusFilter !== "All") url.searchParams.set("status", statusFilter);
      const res = await fetch(url.toString());
      if (!res.ok) throw new Error("Failed to load drafts");
      const data = await res.json();
      setDrafts(data.drafts || []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    }
  }, [businessId, statusFilter]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleAction = async (draftId: string, action: "approve" | "reject", notes = "") => {
    setActionLoading(true);
    try {
      const res = await fetch(`/api/re/v2/ir-drafts/${draftId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, notes }),
      });
      if (!res.ok) throw new Error("Action failed");
      const updated = await res.json();
      setDrafts((prev) => prev.map((d) => (d.id === draftId ? { ...d, ...updated } : d)));
      if (selectedDraft?.id === draftId) {
        setSelectedDraft({ ...selectedDraft, ...updated });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px] text-bm-muted2">
        Loading...
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold text-bm-white">Investor Relations Review</h1>
        <p className="text-bm-muted2 mt-1">
          Review and approve AI-drafted LP letters and capital statements.
        </p>
      </div>

      {/* Status Tabs */}
      <div className="flex gap-2">
        {STATUS_TABS.map((t) => (
          <button
            key={t}
            onClick={() => setStatusFilter(t)}
            className={`px-3 py-1.5 rounded text-sm border transition-colors ${
              statusFilter === t
                ? "bg-bm-accent/20 text-bm-accent border-bm-accent/40"
                : "bg-bm-surface/40 text-bm-muted2 border-bm-border/30 hover:bg-bm-surface/60"
            }`}
          >
            {t === "All" ? "All" : t.replace("_", " ")}
          </button>
        ))}
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded p-3 text-red-400 text-sm">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Draft List */}
        <div className="lg:col-span-1 space-y-2">
          {drafts.length === 0 && (
            <div className="text-bm-muted2 text-sm p-4">No drafts found.</div>
          )}
          {drafts.map((d) => (
            <button
              key={d.id}
              onClick={() => setSelectedDraft(d)}
              className={`w-full text-left p-4 rounded border transition-colors ${
                selectedDraft?.id === d.id
                  ? "bg-bm-accent/10 border-bm-accent/40"
                  : "bg-bm-surface/20 border-bm-border/30 hover:bg-bm-surface/40"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-bm-white font-medium text-sm">
                  {d.fund_name || "Unknown Fund"}
                </span>
                <span
                  className={`text-xs px-2 py-0.5 rounded border ${statusBadge(d.status)}`}
                >
                  {d.status.replace("_", " ")}
                </span>
              </div>
              <div className="text-bm-muted2 text-xs mt-1">
                {d.quarter} &middot; {d.draft_type.replace("_", " ")} &middot;{" "}
                {new Date(d.created_at).toLocaleDateString()}
              </div>
            </button>
          ))}
        </div>

        {/* Draft Detail */}
        <div className="lg:col-span-2">
          {selectedDraft ? (
            <div className="bg-bm-surface/20 border border-bm-border/30 rounded-lg p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-bm-white">
                    {selectedDraft.fund_name} — {selectedDraft.quarter}
                  </h2>
                  <p className="text-bm-muted2 text-sm">
                    {selectedDraft.draft_type.replace("_", " ")} &middot; Generated by{" "}
                    {selectedDraft.generated_by}
                  </p>
                </div>
                <span
                  className={`text-sm px-3 py-1 rounded border ${statusBadge(selectedDraft.status)}`}
                >
                  {selectedDraft.status.replace("_", " ")}
                </span>
              </div>

              {/* Narrative */}
              {selectedDraft.narrative_text && (
                <div className="bg-bm-bg/50 rounded p-4 text-bm-white text-sm whitespace-pre-wrap leading-relaxed">
                  {selectedDraft.narrative_text}
                </div>
              )}

              {/* Review Notes */}
              {selectedDraft.review_notes && (
                <div className="bg-yellow-500/5 border border-yellow-500/20 rounded p-3 text-yellow-300 text-sm">
                  <span className="font-medium">Review notes:</span>{" "}
                  {selectedDraft.review_notes}
                </div>
              )}

              {/* Actions */}
              {["draft", "pending_review"].includes(selectedDraft.status) && (
                <div className="flex gap-3 pt-2">
                  <button
                    disabled={actionLoading}
                    onClick={() => handleAction(selectedDraft.id, "approve")}
                    className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded text-sm transition-colors disabled:opacity-50"
                  >
                    Approve
                  </button>
                  <button
                    disabled={actionLoading}
                    onClick={() => {
                      const reason = prompt("Rejection reason:");
                      if (reason !== null) handleAction(selectedDraft.id, "reject", reason);
                    }}
                    className="px-4 py-2 bg-red-600/80 hover:bg-red-700 text-white rounded text-sm transition-colors disabled:opacity-50"
                  >
                    Reject
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-center min-h-[300px] text-bm-muted2 text-sm">
              Select a draft to preview.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
