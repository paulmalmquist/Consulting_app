"use client";

import React, { useEffect, useState } from "react";
import { useDomainEnv } from "@/components/domain/DomainEnvProvider";

const API_BASE = process.env.NEXT_PUBLIC_BOS_API_URL || "http://localhost:8000";

type CaseFeedItem = {
  item_id: string;
  title: string;
  summary: string | null;
  industry: string | null;
  draft_body: string | null;
  status: string;
  source_type: string | null;
  generated_from_pattern: string | null;
  approved_by: string | null;
  approved_at: string | null;
  published_at: string | null;
  created_at: string;
  linked_patterns: string[] | null;
};

function fmtDate(d?: string | null): string {
  if (!d) return "\u2014";
  try {
    return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return d;
  }
}

function statusBadge(status: string) {
  const base = "inline-block rounded-full px-2 py-0.5 text-xs font-medium";
  const colors: Record<string, string> = {
    draft: "bg-blue-500/15 text-blue-400",
    pending_review: "bg-amber-500/15 text-amber-400",
    approved: "bg-green-500/15 text-green-400",
    published: "bg-teal-500/15 text-teal-400",
    rejected: "bg-red-500/15 text-red-400",
  };
  return <span className={`${base} ${colors[status] || "bg-bm-surface/40 text-bm-muted2"}`}>{status.replace("_", " ")}</span>;
}

export default function CaseFeedPage() {
  const { envId } = useDomainEnv();
  const [items, setItems] = useState<CaseFeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [approving, setApproving] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams();
      if (statusFilter) qs.set("status", statusFilter);
      const res = await fetch(`${API_BASE}/api/pattern-intel/v1/case-feed?${qs}`);
      if (!res.ok) throw new Error(`Case feed: ${res.status}`);
      setItems(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load case feed");
    } finally {
      setLoading(false);
    }
  }

  async function handleApprove(itemId: string) {
    setApproving(itemId);
    try {
      const res = await fetch(`${API_BASE}/api/pattern-intel/v1/case-feed/${itemId}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approved_by: "current_user" }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || `Approve failed: ${res.status}`);
      }
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to approve");
    } finally {
      setApproving(null);
    }
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  return (
    <section className="space-y-5" data-testid="pattern-intel-case-feed">
      <div>
        <h2 className="text-2xl font-semibold">Case Feed</h2>
        <p className="text-sm text-bm-muted2">Approval queue for case-study drafts generated from high-confidence patterns and successful implementations.</p>
      </div>

      {/* Filter */}
      <div className="flex gap-2">
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm">
          <option value="">All Statuses</option>
          <option value="draft">Draft</option>
          <option value="pending_review">Pending Review</option>
          <option value="approved">Approved</option>
          <option value="published">Published</option>
          <option value="rejected">Rejected</option>
        </select>
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => void refresh()} className="ml-4 text-xs underline">Retry</button>
        </div>
      )}

      {loading ? (
        <div className="rounded-xl border border-bm-border/70 p-5 text-sm text-bm-muted2">Loading case feed...</div>
      ) : !items.length ? (
        <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-5 text-sm text-bm-muted2">
          No case-feed items yet. Drafts are generated from approved high-confidence patterns.
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <div key={item.item_id} className="rounded-xl border border-bm-border/70 bg-bm-surface/20 overflow-hidden">
              <button
                type="button"
                className="w-full text-left px-4 py-3 flex items-center justify-between hover:bg-bm-surface/30"
                onClick={() => setExpanded(expanded === item.item_id ? null : item.item_id)}
              >
                <div className="flex items-center gap-3">
                  <h3 className="text-sm font-semibold">{item.title}</h3>
                  {statusBadge(item.status)}
                  {item.industry && <span className="text-xs text-bm-muted2">{item.industry}</span>}
                  {item.linked_patterns?.length ? (
                    <span className="text-xs text-bm-muted2">{item.linked_patterns.length} linked patterns</span>
                  ) : null}
                </div>
                <span className="text-xs text-bm-muted2">{fmtDate(item.created_at)}</span>
              </button>

              {expanded === item.item_id && (
                <div className="border-t border-bm-border/40 px-4 py-3 space-y-3">
                  {item.summary && (
                    <div>
                      <p className="text-xs uppercase tracking-[0.1em] text-bm-muted2 mb-1">Summary</p>
                      <p className="text-sm">{item.summary}</p>
                    </div>
                  )}

                  {item.draft_body && (
                    <div>
                      <p className="text-xs uppercase tracking-[0.1em] text-bm-muted2 mb-1">Draft</p>
                      <div className="text-sm text-bm-muted2 whitespace-pre-wrap max-h-60 overflow-y-auto rounded-lg border border-bm-border/30 bg-bm-surface/10 p-3">
                        {item.draft_body}
                      </div>
                    </div>
                  )}

                  {item.approved_by && (
                    <p className="text-xs text-bm-muted2">Approved by {item.approved_by} on {fmtDate(item.approved_at)}</p>
                  )}

                  {(item.status === "draft" || item.status === "pending_review") && (
                    <button
                      onClick={() => void handleApprove(item.item_id)}
                      disabled={approving === item.item_id}
                      className="rounded-lg border border-green-500/40 bg-green-500/10 px-3 py-2 text-sm text-green-400 hover:bg-green-500/20 disabled:opacity-50"
                    >
                      {approving === item.item_id ? "Approving..." : "Approve"}
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
