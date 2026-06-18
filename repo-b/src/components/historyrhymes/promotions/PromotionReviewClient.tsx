"use client";

import { useCallback, useEffect, useState } from "react";

import { HrSubNav } from "@/components/historyrhymes/HrSubNav";
import {
  approveCandidate, getCandidate, linkPromotedEpisode, listCandidates,
  markNeedsEvidence, markNeedsReview, rejectCandidate, supersedeCandidate,
  type CandidateFilters, type PromotionActionResult, type PromotionCandidate,
} from "@/lib/historyrhymes/promotions";

import type { ActionHandlers } from "./PromotionActionBar";
import { PromotionActionBar } from "./PromotionActionBar";
import { PromotionCandidateDetail } from "./PromotionCandidateDetail";
import { PromotionCandidateQueue } from "./PromotionCandidateQueue";

const STATUS_OPTIONS = ["", "draft", "needs_evidence", "needs_review", "approved", "rejected", "superseded", "promoted"];

export function PromotionReviewClient({ envId }: { envId: string }) {
  const [filters, setFilters] = useState<CandidateFilters>({});
  const [items, setItems] = useState<PromotionCandidate[]>([]);
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const [detail, setDetail] = useState<PromotionCandidate | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionResult, setActionResult] = useState<PromotionActionResult | null>(null);

  const loadQueue = useCallback(async () => {
    setLoading(true);
    const res = await listCandidates(filters);
    setItems(res.items);
    setSelectedId((cur) => cur ?? res.items[0]?.candidate_id);
    setLoading(false);
  }, [filters]);

  const loadDetail = useCallback(async (cid: string) => {
    setDetail(await getCandidate(cid));
  }, []);

  useEffect(() => { void loadQueue(); }, [loadQueue]);
  useEffect(() => { if (selectedId) void loadDetail(selectedId); }, [selectedId, loadDetail]);

  const refresh = useCallback(() => {
    void loadQueue();
    if (selectedId) void loadDetail(selectedId);
  }, [loadQueue, loadDetail, selectedId]);

  const onResult = useCallback((r: PromotionActionResult) => {
    setActionResult(r);
    if (r.kind === "ok") refresh();
  }, [refresh]);

  const handlers: ActionHandlers | null = selectedId ? {
    needsEvidence: () => markNeedsEvidence(selectedId),
    needsReview: () => markNeedsReview(selectedId),
    approve: (b) => approveCandidate(selectedId, b),
    reject: (b) => rejectCandidate(selectedId, b),
    supersede: (b) => supersedeCandidate(selectedId, b),
    linkEpisode: (b) => linkPromotedEpisode(selectedId, b),
    refresh,
  } : null;

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 p-4">
      <HrSubNav envId={envId} />
      <header className="mb-3">
        <h1 className="text-lg font-semibold text-neutral-100">Promotion review — the airlock</h1>
        <p className="text-xs text-neutral-500">
          Review feature-store observation candidates. This surface operates the airlock only — it does not create historical episodes and does not write episode embeddings.
        </p>
      </header>

      {/* filters */}
      <div className="flex flex-wrap gap-2 mb-3">
        <select aria-label="Filter by status" className="text-xs bg-neutral-900 border border-neutral-800 rounded px-2 py-1 text-neutral-300"
          value={filters.approval_status ?? ""}
          onChange={(e) => setFilters((f) => ({ ...f, approval_status: e.target.value || undefined }))}>
          {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s || "all statuses"}</option>)}
        </select>
        <label className="flex items-center gap-1 text-xs text-neutral-400">
          <input type="checkbox" checked={filters.has_blocked_reasons ?? false}
            onChange={(e) => setFilters((f) => ({ ...f, has_blocked_reasons: e.target.checked || undefined }))} />
          has blocked reasons
        </label>
      </div>

      {actionResult?.kind === "blocked" && (
        <div data-testid="action-blocked" className="mb-3 rounded border border-rose-500/40 bg-rose-500/10 p-2">
          <p className="text-[11px] text-rose-200 mb-1">Blocked ({actionResult.data.current_status ?? "—"}):</p>
          <ul className="space-y-0.5">
            {actionResult.data.blocked_reasons.map((r) => <li key={r}><code className="text-xs text-rose-200">{r}</code></li>)}
          </ul>
        </div>
      )}
      {actionResult?.kind === "error" && (
        <div data-testid="action-error" className="mb-3 rounded border border-neutral-700 bg-neutral-900 p-2 text-xs text-neutral-300">
          {actionResult.httpStatus === 401 ? "Sign in required."
            : actionResult.httpStatus === 403 ? "Admin access required."
            : `Request failed (${actionResult.httpStatus}).`}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div>
          {loading ? <p className="text-xs text-neutral-500">Loading candidates…</p>
            : <PromotionCandidateQueue candidates={items} selectedId={selectedId} onSelect={setSelectedId} />}
        </div>
        <div className="space-y-3">
          {detail && handlers ? (
            <>
              <PromotionActionBar candidate={detail} handlers={handlers} onResult={onResult} />
              <PromotionCandidateDetail candidate={detail} />
            </>
          ) : (
            <p className="text-xs text-neutral-500">{items.length ? "Select a candidate." : ""}</p>
          )}
        </div>
      </div>
    </div>
  );
}
