"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import TopControlBar from "./TopControlBar";
import FilterStrip from "./FilterStrip";
import KPIStrip from "./KPIStrip";
import ViewSwitcher, { type AccountingView } from "./ViewSwitcher";
import ReceiptsTable from "./ReceiptsTable";
import NeedsAttentionTable from "./NeedsAttentionTable";
import SubscriptionsTable from "./SubscriptionsTable";
import SummaryPanel from "./SummaryPanel";
import EmptyStateTable from "./EmptyStateTable";
import DetailDrawer from "./DetailDrawer";
import ReceiptIntakePanel from "./rail/ReceiptIntakePanel";
import ReconcilePanel from "./rail/ReconcilePanel";
import RevenueWatchPanel from "./rail/RevenueWatchPanel";
import TrendsBand from "./TrendsBand";
import {
  detectRecurring,
  getIntake,
  listIntake,
  listReviewQueue,
  uploadReceipt,
  type IntakeDetail,
  type ReceiptIntakeRow,
  type ReviewItem,
} from "@/lib/accounting-api";

export type CommandDeskShellProps = {
  envId: string;
  businessId?: string;
};

export default function CommandDeskShell({ envId, businessId }: CommandDeskShellProps) {
  const [view, setView] = useState<AccountingView>("needs");
  const [selected, setSelected] = useState<string | null>(null);
  const [kpiFilter, setKpiFilter] = useState<string | null>(null);
  const [unresolvedOnly, setUnresolvedOnly] = useState(false);
  const [query, setQuery] = useState("");
  const [toast, setToast] = useState<string | null>(null);

  const [intakeRows, setIntakeRows] = useState<ReceiptIntakeRow[]>([]);
  const [reviewItems, setReviewItems] = useState<ReviewItem[]>([]);
  const [detail, setDetail] = useState<IntakeDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshQueues = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [intake, review] = await Promise.all([
        listIntake({ envId, businessId, limit: 200 }),
        listReviewQueue({ envId, businessId, status: "open", limit: 100 }),
      ]);
      setIntakeRows(intake.rows);
      setReviewItems(review.items);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [envId, businessId]);

  useEffect(() => {
    void refreshQueues();
  }, [refreshQueues]);

  useEffect(() => {
    if (!selected) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    getIntake({ envId, businessId, intakeId: selected })
      .then((d) => {
        if (!cancelled) setDetail(d);
      })
      .catch(() => {
        if (!cancelled) setDetail(null);
      });
    return () => {
      cancelled = true;
    };
  }, [selected, envId, businessId]);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2200);
  }, []);

  const onUpload = useCallback(
    async (files: File[]) => {
      if (!files.length) return;
      showToast(`Uploading ${files.length} receipt${files.length > 1 ? "s" : ""}…`);
      try {
        for (const file of files) {
          await uploadReceipt({ envId, businessId, file });
        }
        showToast(files.length === 1 ? "Receipt ingested" : `${files.length} receipts ingested`);
        await refreshQueues();
      } catch (err) {
        showToast(`Upload failed: ${(err as Error).message}`);
      }
    },
    [envId, businessId, refreshQueues, showToast],
  );

  const onDetectRecurring = useCallback(async () => {
    showToast("Scanning for recurring subscriptions…");
    try {
      const r = await detectRecurring({ envId, businessId });
      showToast(`Processed ${r.processed} receipts into ledger`);
      await refreshQueues();
    } catch (err) {
      showToast(`Detect failed: ${(err as Error).message}`);
    }
  }, [envId, businessId, refreshQueues, showToast]);

  const kpis = useMemo(() => {
    const unreviewed = intakeRows.filter(
      (r) => r.ingest_status === "parsed" && (Number(r.confidence_overall ?? 0) < 0.8),
    ).length;
    const appleThisMonth = intakeRows.filter(
      (r) =>
        r.billing_platform?.toLowerCase() === "apple" &&
        r.transaction_date &&
        r.transaction_date.slice(0, 7) === new Date().toISOString().slice(0, 7),
    );
    const appleSpend = appleThisMonth.reduce(
      (sum, r) => sum + Number(r.total ?? 0),
      0,
    );
    const ambiguous = reviewItems.filter((i) => i.reason === "apple_ambiguous").length;
    const uncategorized = reviewItems.filter((i) => i.reason === "uncategorized").length;
    const duplicates = intakeRows.filter((r) => r.ingest_status === "duplicate").length;
    return {
      unreviewed,
      appleSpend,
      ambiguous,
      uncategorized,
      duplicates,
      total: intakeRows.length,
    };
  }, [intakeRows, reviewItems]);

  const filteredRows = useMemo(() => {
    let rows = intakeRows;
    if (kpiFilter === "apple") {
      rows = rows.filter((r) => r.billing_platform?.toLowerCase() === "apple");
    } else if (kpiFilter === "unreviewed") {
      rows = rows.filter((r) => Number(r.confidence_overall ?? 0) < 0.8);
    } else if (kpiFilter === "uncategorized") {
      const ids = new Set(
        reviewItems.filter((i) => i.reason === "uncategorized").map((i) => i.intake_id),
      );
      rows = rows.filter((r) => ids.has(r.id));
    }
    if (unresolvedOnly) {
      rows = rows.filter((r) => r.ingest_status !== "duplicate");
    }
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      rows = rows.filter(
        (r) =>
          r.merchant_raw?.toLowerCase().includes(q) ||
          r.vendor_normalized?.toLowerCase().includes(q) ||
          r.service_name_guess?.toLowerCase().includes(q) ||
          r.original_filename?.toLowerCase().includes(q) ||
          r.id.toLowerCase().includes(q),
      );
    }
    return rows;
  }, [intakeRows, reviewItems, kpiFilter, unresolvedOnly, query]);

  return (
    <div
      className="flex h-full min-h-[calc(100vh-56px)] flex-col"
      data-testid="accounting-command-desk"
    >
      <TopControlBar
        statusCounts={{ synced: intakeRows.length, needsAction: reviewItems.length, overdue: 0 }}
        onUpload={onUpload}
        onDetectRecurring={onDetectRecurring}
      />
      <FilterStrip
        query={query}
        onQueryChange={setQuery}
        unresolvedOnly={unresolvedOnly}
        onToggleUnresolved={() => setUnresolvedOnly((v) => !v)}
      />
      <KPIStrip
        kpis={kpis}
        activeFilter={kpiFilter}
        onToggleFilter={(id) => setKpiFilter((cur) => (cur === id ? null : id))}
      />

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-0 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="relative flex min-h-0 flex-col border-r border-slate-800 bg-slate-950">
          <ViewSwitcher
            value={view}
            onChange={setView}
            counts={{
              needs: reviewItems.length,
              subs: 0,  // populated by SubscriptionsTable on render; badge is advisory
              recs: intakeRows.length,
              txns: 0,
              invs: 0,
            }}
          />
          {view === "subs" ? <SummaryPanel envId={envId} businessId={businessId} /> : null}
          <div className="flex-1 overflow-auto">
            {error ? (
              <div className="p-6 text-sm text-rose-300">Error: {error}</div>
            ) : loading && intakeRows.length === 0 ? (
              <div className="p-6 text-sm text-slate-400">Loading receipt intake…</div>
            ) : view === "needs" ? (
              <NeedsAttentionTable
                items={reviewItems}
                selectedId={selected}
                onSelect={(id) => setSelected(id)}
              />
            ) : view === "subs" ? (
              <SubscriptionsTable envId={envId} businessId={businessId} onToast={showToast} />
            ) : view === "recs" ? (
              <ReceiptsTable
                rows={filteredRows}
                selectedId={selected}
                onSelect={(id) => setSelected(id)}
              />
            ) : view === "txns" ? (
              <EmptyStateTable
                title="Transactions coming online"
                subtitle="Bank + CC transaction import lands in Phase 2."
              />
            ) : (
              <EmptyStateTable
                title="Invoices coming online"
                subtitle="AR + invoice issuing is Phase 2."
              />
            )}
          </div>
          <DetailDrawer
            detail={detail}
            onClose={() => setSelected(null)}
            onRefresh={refreshQueues}
            envId={envId}
            businessId={businessId}
          />
        </div>

        <aside className="flex min-h-0 flex-col gap-2.5 overflow-auto bg-slate-950 p-2.5">
          <ReceiptIntakePanel
            rows={intakeRows.slice(0, 12)}
            onSelect={(id) => {
              setView("recs");
              setSelected(id);
            }}
          />
          <ReconcilePanel />
          <RevenueWatchPanel />
        </aside>
      </div>

      <TrendsBand envId={envId} businessId={businessId} />

      <div className="flex h-[22px] items-center justify-between border-t border-slate-800 bg-slate-950 px-3 font-mono text-[10px] uppercase tracking-widest text-slate-500">
        <span>v0 · receipt-intake · sync ok</span>
        <span>⌘K · U upload · E expense · / search</span>
      </div>

      {toast ? (
        <div
          className="pointer-events-none fixed bottom-6 left-1/2 -translate-x-1/2 rounded-md border border-cyan-500/40 bg-slate-950/95 px-4 py-2 text-xs text-cyan-300 shadow-lg"
          data-testid="accounting-toast"
        >
          {toast}
        </div>
      ) : null}
    </div>
  );
}
