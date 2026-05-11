"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";

import {
  BottomBand,
  DetailDrawer,
  DualAreaChart,
  KPIBar,
  MoMBars,
  RightRail,
  StackedBar,
  StatusBar,
  ViewSwitcher,
  WorkTable,
  fmtUSD,
} from "@/components/operator/command-desk";
import type { KPITile, ViewSwitcherView } from "@/components/operator/command-desk";
import { LeftSidebar } from "@/components/operator/command-desk/layout/LeftSidebar";
import { consultingSidebarSections } from "@/app/lab/env/[envId]/operator/_sidebar";
import type {
  NvARAging,
  NvAISoftwareSummary,
  NvBalanceSnapshot,
  NvCashMovementTrend,
  NvExpenseCategoryTrend,
  NvFinancialSnapshot,
  NvIncomeStatement,
  NvInvoiceRow,
  NvKPIBar,
  NvQueue,
  NvQueueItem,
  NvReceiptIntakeList,
  NvSubscriptionLedgerList,
  NvSubscriptionRow,
  NvTransactionRow,
} from "@/types/nv-accounting";
import {
  getNvAccountingQueue,
  getNvAiSoftwareSummary,
  getNvArAging,
  getNvBalanceSnapshot,
  getNvCashMovementTrend,
  getNvExpenseCategoryTrend,
  getNvFinancialSnapshot,
  getNvIncomeStatement,
  getNvInvoices,
  getNvKpis,
  getNvReceiptIntake,
  getNvSubscriptionLedger,
  getNvTransactions,
  nvQueueAction,
  nvUploadReceipt,
} from "@/lib/bos-api";
import { useDomainEnv } from "@/components/domain/DomainEnvProvider";

import {
  invoicesColumns,
  makeNeedsColumns,
  receiptsColumns,
  subscriptionsColumns,
  txnsColumns,
} from "./columns";
import { DrawerBody, DrawerFooter } from "./DrawerBody";
import { ReceiptIntakePanel, RevenueWatchPanel, SubscriptionWatchPanel } from "./rail";
import { SnapshotStrip } from "./SnapshotStrip";
import { StatementsView } from "./StatementsView";
import { SetupChecklistPanel } from "./SetupChecklist";
import { AccountingTopBar } from "./AccountingTopBar";
import { TodayStrip } from "./TodayStrip";
import { EmptyState } from "./EmptyState";
import {
  VendorIntelligencePanel,
  countUnclassifiedVendors,
} from "./VendorIntelligencePanel";
import type { InboxDisposition } from "./InboxRowActions";

type View = "needs" | "txns" | "recs" | "invs" | "subs" | "stmts";

const winstonBrand = (
  <span
    style={{
      fontFamily: "var(--font-display, var(--font-sans))",
      fontSize: 13,
      fontWeight: 700,
      letterSpacing: "0.14em",
      color: "var(--sidebar-item-active, #ffffff)",
    }}
  >
    NOVENDOR
  </span>
);

export default function AccountingDeskPage() {
  const params = useParams<{ envId: string }>();
  const envId = params.envId;
  const router = useRouter();
  const { businessId } = useDomainEnv();

  const [view, setView] = useState<View>("needs");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [unresolvedOnly] = useState(true);
  const [kpiFilter, setKpiFilter] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [railOpen, setRailOpen] = useState(true);
  const [resolvedIds, setResolvedIds] = useState<Set<string>>(new Set());

  const [queue, setQueue] = useState<NvQueue | null>(null);
  const [txns, setTxns] = useState<NvTransactionRow[]>([]);
  const [invoices, setInvoices] = useState<NvInvoiceRow[]>([]);
  const [receipts, setReceipts] = useState<NvReceiptIntakeList | null>(null);
  const [ledger, setLedger] = useState<NvSubscriptionLedgerList | null>(null);
  const [kpis, setKpis] = useState<NvKPIBar | null>(null);
  const [arAging, setArAging] = useState<NvARAging | null>(null);
  const [expCat, setExpCat] = useState<NvExpenseCategoryTrend | null>(null);
  const [cashMove, setCashMove] = useState<NvCashMovementTrend | null>(null);
  const [aiSummary, setAiSummary] = useState<NvAISoftwareSummary | null>(null);

  const [snapshot, setSnapshot] = useState<NvFinancialSnapshot | null>(null);
  const [incomeStmt, setIncomeStmt] = useState<NvIncomeStatement | null>(null);
  const [balanceSnap, setBalanceSnap] = useState<NvBalanceSnapshot | null>(null);

  const [refreshTick, setRefreshTick] = useState(0);
  const bumpRefresh = useCallback(() => setRefreshTick((t) => t + 1), []);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);

  // Persist rail open state.
  useEffect(() => {
    try {
      const stored = localStorage.getItem("nv_acct_rail_open");
      if (stored != null) setRailOpen(stored === "true");
    } catch {
      /* ignore */
    }
  }, []);

  // Fetch queue + counts every time filters change.
  useEffect(() => {
    if (!envId) return;
    let cancelled = false;
    getNvAccountingQueue(envId, businessId ?? undefined, {
      unresolved: unresolvedOnly,
      kpi_filter: kpiFilter,
      q: query || undefined,
    })
      .then((q) => !cancelled && setQueue(q))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [envId, businessId, unresolvedOnly, kpiFilter, query, refreshTick]);

  // Fetch the active view's data.
  useEffect(() => {
    if (!envId) return;
    let cancelled = false;
    (async () => {
      try {
        if (view === "txns") {
          const rows = await getNvTransactions(envId, businessId ?? undefined);
          if (!cancelled) setTxns(rows);
        } else if (view === "invs") {
          const rows = await getNvInvoices(envId, businessId ?? undefined);
          if (!cancelled) setInvoices(rows);
        } else if (view === "recs") {
          const data = await getNvReceiptIntake(envId, businessId ?? undefined, 50);
          if (!cancelled) setReceipts(data);
        } else if (view === "subs") {
          const data = await getNvSubscriptionLedger(envId, businessId ?? undefined);
          if (!cancelled) setLedger(data);
        } else if (view === "stmts") {
          const [inc, bal] = await Promise.all([
            getNvIncomeStatement(envId, businessId ?? undefined),
            getNvBalanceSnapshot(envId, businessId ?? undefined),
          ]);
          if (!cancelled) {
            setIncomeStmt(inc);
            setBalanceSnap(bal);
          }
        }
      } catch {
        /* errors surfaced as empty rows */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [envId, businessId, view, refreshTick]);

  // Fetch rail + KPI + trends on mount and on refresh.
  useEffect(() => {
    if (!envId) return;
    let cancelled = false;
    Promise.all([
      getNvKpis(envId, businessId ?? undefined),
      getNvArAging(envId, businessId ?? undefined),
      getNvExpenseCategoryTrend(envId, businessId ?? undefined),
      getNvCashMovementTrend(envId, businessId ?? undefined),
      getNvReceiptIntake(envId, businessId ?? undefined, 8),
      getNvSubscriptionLedger(envId, businessId ?? undefined),
      getNvAiSoftwareSummary(envId, businessId ?? undefined).catch(() => null),
      getNvFinancialSnapshot(envId, businessId ?? undefined).catch(() => null),
    ])
      .then(([k, ar, ec, cm, intake, sub, summary, snap]) => {
        if (cancelled) return;
        setKpis(k);
        setArAging(ar);
        setExpCat(ec);
        setCashMove(cm);
        setReceipts(intake);
        setLedger(sub);
        setAiSummary(summary ?? null);
        setSnapshot(snap ?? null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [envId, businessId, refreshTick]);

  // ⌘K → focus search field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Active-queue items, with locally-resolved rows hidden for snappy feedback
  // until the server reconciles on next refresh.
  const visibleQueueItems = useMemo(() => {
    if (!queue) return [];
    return queue.items.filter((i) => !resolvedIds.has(i.id));
  }, [queue, resolvedIds]);

  const selectedQueueItem: NvQueueItem | null = useMemo(() => {
    if (view !== "needs" || !selectedId) return null;
    return visibleQueueItems.find((it) => it.id === selectedId) ?? null;
  }, [view, selectedId, visibleQueueItems]);

  // Counts for ViewSwitcher (server counts minus optimistic-resolved items).
  const switcherCounts = useMemo(() => {
    if (!queue) return { needs: 0, txns: 0, recs: 0, invs: 0, subs: 0 };
    const removed = resolvedIds.size;
    return {
      ...queue.counts,
      needs: Math.max(0, queue.counts.needs - removed),
    };
  }, [queue, resolvedIds]);

  const views: ViewSwitcherView[] = useMemo(() => {
    return [
      { key: "needs", label: "Needs Attention", count: switcherCounts.needs, accent: "var(--neon-amber)" },
      { key: "txns", label: "Transactions", count: switcherCounts.txns, accent: "var(--neon-cyan)" },
      { key: "recs", label: "Receipts", count: switcherCounts.recs, accent: "var(--neon-cyan)" },
      { key: "invs", label: "Invoices", count: switcherCounts.invs, accent: "var(--neon-cyan)" },
      { key: "subs", label: "Subscriptions", count: switcherCounts.subs, accent: "var(--neon-magenta)" },
      { key: "stmts", label: "Statements", count: 0, accent: "var(--sem-up)" },
    ];
  }, [switcherCounts]);

  const kpiTiles: KPITile[] = useMemo(() => {
    if (!kpis) return [];
    return kpis.tiles.map((t) => ({
      key: t.key,
      label: t.label,
      value: t.value,
      delta: t.delta ?? undefined,
      deltaTone: t.delta_tone ?? undefined,
      source: t.source ?? undefined,
      accent: t.accent,
      sparkline: t.sparkline,
      sparkColor: t.spark_color ?? undefined,
    }));
  }, [kpis]);

  const handleQueueAction = useCallback(
    async (action: "accept" | "defer" | "reject", variant?: string) => {
      if (!selectedQueueItem || !envId) return;
      try {
        await nvQueueAction(action, selectedQueueItem.id, envId, businessId ?? undefined, {
          variant,
        });
      } finally {
        setSelectedId(null);
        bumpRefresh();
      }
    },
    [envId, businessId, selectedQueueItem, bumpRefresh],
  );

  // Row-level quick disposition. Optimistically hides the row, fires the
  // matching backend action, and refreshes counts. The drawer-level
  // accept/defer/reject still uses the existing handleQueueAction.
  const handleDisposition = useCallback(
    async (item: NvQueueItem, disposition: InboxDisposition) => {
      if (!envId) return;
      setResolvedIds((prev) => {
        const next = new Set(prev);
        next.add(item.id);
        return next;
      });
      let action: "accept" | "defer" | "reject" = "accept";
      let variant: string | undefined;
      switch (disposition) {
        case "snooze-1d":
        case "snooze-7d":
          action = "defer";
          variant = disposition;
          break;
        case "ignore":
          action = "reject";
          variant = "ignore";
          break;
        case "match":
        case "reimbursable":
        case "categorize":
        case "classify":
        case "resolve":
        default:
          action = "accept";
          variant = disposition;
          break;
      }
      try {
        await nvQueueAction(action, item.id, envId, businessId ?? undefined, { variant });
      } catch {
        /* on failure, the next refresh will restore the row */
      } finally {
        bumpRefresh();
      }
    },
    [envId, businessId, bumpRefresh],
  );

  const handleUploadClick = useCallback(() => uploadInputRef.current?.click(), []);
  const handleUploadChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file || !envId) return;
      try {
        await nvUploadReceipt(envId, businessId ?? undefined, file);
      } finally {
        e.target.value = "";
        bumpRefresh();
      }
    },
    [envId, businessId, bumpRefresh],
  );

  const toggleRail = useCallback(() => {
    setRailOpen((open) => {
      const next = !open;
      try {
        localStorage.setItem("nv_acct_rail_open", String(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  // Build columns with disposition handler bound.
  const inboxColumns = useMemo(() => makeNeedsColumns(handleDisposition), [handleDisposition]);

  // Unclassified vendor count for the Today strip.
  const unclassified = useMemo(() => countUnclassifiedVendors(envId, ledger), [envId, ledger]);

  const reimbursementPending = useMemo(() => {
    if (!queue) return null;
    const rows = queue.items.filter((i) => i.type === "reimbursable");
    if (rows.length === 0) return null;
    const total = rows.reduce((s, r) => s + Math.abs(r.amount ?? 0), 0);
    if (total <= 0) return null;
    return fmtUSD(total);
  }, [queue]);

  // ─── render pieces ──────────────────────────────────────────────────
  const sidebarSections = consultingSidebarSections(envId);
  const railWidth = railOpen ? 360 : 40;

  const activeTable = (() => {
    if (view === "needs") {
      if (visibleQueueItems.length === 0) {
        return (
          <EmptyState
            title="Queue clear. All caught up."
            description="When transactions need review or receipts need matching, they'll appear here as actionable items."
            actions={[
              { label: "Upload receipt", kind: "primary", onClick: handleUploadClick },
              { label: "Import CSV", kind: "secondary", onClick: () => setView("txns") },
            ]}
          />
        );
      }
      return (
        <WorkTable<NvQueueItem>
          rows={visibleQueueItems}
          columns={inboxColumns}
          rowKey={(r) => r.id}
          selectedId={selectedId}
          onSelect={(r) => setSelectedId(r.id)}
          rowAccent={(r) =>
            r.glow ? { borderLeft: "2px solid var(--sem-error)", glow: true } : undefined
          }
        />
      );
    }
    if (view === "txns") {
      if (txns.length === 0) {
        return (
          <EmptyState
            title="No transactions yet."
            description="Connect a bank feed, import a CSV, or upload a statement to get started."
            actions={[
              { label: "Import CSV", kind: "primary", onClick: () => {} },
              { label: "Open setup checklist", kind: "secondary", onClick: () => setRailOpen(true) },
            ]}
          />
        );
      }
      return (
        <WorkTable<NvTransactionRow>
          rows={txns}
          columns={txnsColumns}
          rowKey={(r) => r.id}
        />
      );
    }
    if (view === "invs") {
      if (invoices.length === 0) {
        return (
          <EmptyState
            title="No invoices yet."
            description="Add an invoice to track payments, due dates, and reminders."
            actions={[{ label: "Add invoice", kind: "primary", onClick: () => {} }]}
          />
        );
      }
      return (
        <WorkTable<NvInvoiceRow>
          rows={invoices}
          columns={invoicesColumns}
          rowKey={(r) => r.id}
          rowAccent={(r) =>
            r.glow ? { borderLeft: "2px solid var(--sem-error)", glow: true } : undefined
          }
        />
      );
    }
    if (view === "recs") {
      if (!receipts || receipts.rows.length === 0) {
        return (
          <EmptyState
            title="No receipts pending."
            description="Upload a receipt or forward emailed receipts to the intake address."
            actions={[
              { label: "Upload receipt", kind: "primary", onClick: handleUploadClick },
              { label: "Open setup checklist", kind: "secondary", onClick: () => setRailOpen(true) },
            ]}
          />
        );
      }
      return (
        <WorkTable
          rows={receipts.rows}
          columns={receiptsColumns}
          rowKey={(r) => r.id}
        />
      );
    }
    if (view === "subs") {
      if (!ledger || ledger.rows.length === 0) {
        return (
          <EmptyState
            title="No tracked subscriptions."
            description="Import card transactions to auto-detect recurring vendors and classify their business relevance."
            actions={[
              { label: "Open setup checklist", kind: "primary", onClick: () => setRailOpen(true) },
            ]}
          />
        );
      }
      return (
        <WorkTable<NvSubscriptionRow>
          rows={ledger.rows}
          columns={subscriptionsColumns}
          rowKey={(r) => r.id}
        />
      );
    }
    return <StatementsView income={incomeStmt} cash={cashMove} balance={balanceSnap} />;
  })();

  const left = (
    <>
      <SnapshotStrip snapshot={snapshot} />
      <TodayStrip
        queue={queue}
        arAging={arAging}
        unclassifiedVendors={unclassified}
        reimbursementPending={reimbursementPending}
        onJumpToView={(v) => {
          setView(v);
          setSelectedId(null);
        }}
        onFilterOverdue={() => {
          setView("invs");
        }}
      />
      <ViewSwitcher
        views={views}
        value={view}
        onChange={(k) => {
          setView(k as View);
          setSelectedId(null);
        }}
        sortLabel="priority"
        groupLabel="none"
      />
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>{activeTable}</div>
      {selectedQueueItem && (
        <DetailDrawer
          open={true}
          onClose={() => setSelectedId(null)}
          accent={
            selectedQueueItem.state_tone === "error"
              ? "var(--sem-error)"
              : "var(--neon-cyan)"
          }
          header={
            <div
              style={{
                position: "absolute",
                top: 8,
                right: 10,
                zIndex: 2,
                cursor: "pointer",
                color: "var(--fg-3)",
                fontSize: 16,
                padding: "0 6px",
              }}
              onClick={() => setSelectedId(null)}
              aria-label="Close drawer"
            >
              ×
            </div>
          }
          body={<DrawerBody item={selectedQueueItem} onAction={handleQueueAction} />}
          footer={<DrawerFooter item={selectedQueueItem} onAction={handleQueueAction} />}
        />
      )}
    </>
  );

  const rightRail = (
    <RightRail>
      <SetupChecklistPanel envId={envId} ledger={ledger} />
      <ReceiptIntakePanel data={receipts} />
      <SubscriptionWatchPanel ledger={ledger} summary={aiSummary} />
      <RevenueWatchPanel data={arAging} />
    </RightRail>
  );

  const bottomBand = (
    <BottomBand
      panels={[
        {
          key: "expense-category",
          title: "EXPENSE BY CATEGORY",
          caption: expCat ? `30d · ${fmtUSD(expCat.total_30d)}` : "—",
          accent: "var(--neon-cyan)",
          body: expCat ? (
            <StackedBar slices={expCat.slices} total={expCat.total_30d} />
          ) : (
            <div style={{ color: "var(--fg-3)" }}>Loading…</div>
          ),
        },
        {
          key: "tooling-spend",
          title: "TOOLING SPEND",
          caption: "6 month MoM",
          accent: "var(--neon-violet)",
          body:
            expCat && expCat.slices.length > 0 ? (
              <MoMBars
                months={[
                  { label: "Nov", amount: expCat.total_30d * 0.72 },
                  { label: "Dec", amount: expCat.total_30d * 0.78 },
                  { label: "Jan", amount: expCat.total_30d * 0.84 },
                  { label: "Feb", amount: expCat.total_30d * 0.91 },
                  { label: "Mar", amount: expCat.total_30d * 0.95 },
                  { label: "Apr", amount: expCat.total_30d },
                ]}
                momPct={5.3}
                summary="6 vendors · +1 new this Q"
              />
            ) : (
              <div style={{ color: "var(--fg-3)" }}>Loading…</div>
            ),
        },
        {
          key: "cash-movement",
          title: "CASH MOVEMENT",
          caption: "30-day inflow / outflow",
          accent: "var(--sem-up)",
          body: cashMove ? (
            <DualAreaChart
              inflow={cashMove.inflow}
              outflow={cashMove.outflow}
              net30d={cashMove.net_30d}
              in30d={cashMove.in_30d}
              out30d={cashMove.out_30d}
              axisLabels={cashMove.axis_labels}
            />
          ) : (
            <div style={{ color: "var(--fg-3)" }}>Loading…</div>
          ),
        },
        {
          key: "vendor-intel",
          title: "VENDOR INTELLIGENCE",
          caption: unclassified > 0 ? `${unclassified} unclassified` : "all classified",
          accent: "var(--neon-magenta)",
          body: <VendorIntelligencePanel envId={envId} ledger={ledger} />,
        },
      ]}
    />
  );

  const statusBar = (
    <StatusBar
      version="novendor/acct 0.2"
      syncState="live"
      hotkeys={[
        { keys: "⌘K", label: "search" },
        { keys: "U", label: "upload" },
        { keys: "I", label: "invoice" },
      ]}
      periodLocked={{ period: "Q1 2026", by: "j.park" }}
      right="perf · 14ms"
    />
  );

  // ─── shell ──────────────────────────────────────────────────────────
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `240px minmax(0, 1fr) ${railWidth}px`,
        gridTemplateRows: "52px minmax(0, 1fr) auto auto",
        minHeight: "100dvh",
        background: "var(--bg-base)",
        transition: "grid-template-columns 200ms ease",
      }}
      data-command-desk
    >
      {/* Row 1, Col 1 — brand */}
      <div style={{ position: "sticky", top: 0, zIndex: 10 }}>
        <LeftSidebar
          mode="brand"
          brand={winstonBrand}
          sections={sidebarSections}
          activeKey="accounting"
        />
      </div>

      {/* Row 1, Col 2 — top control bar */}
      <div style={{ position: "sticky", top: 0, zIndex: 10, minWidth: 0 }}>
        <AccountingTopBar
          envId={envId}
          query={query}
          onQuery={setQuery}
          onImportTxns={() => setView("txns")}
          onAddInvoice={() => setView("invs")}
          onAddExpense={() => {
            /* placeholder — wire to existing expense draft when handler lands */
          }}
          onUploadReceipt={handleUploadClick}
          uploadInputRef={uploadInputRef}
          onUploadChange={handleUploadChange}
          searchInputRef={searchInputRef}
        />
      </div>

      {/* Row 1, Col 3 — rail toggle (sticky to align with top bar) */}
      <button
        type="button"
        onClick={toggleRail}
        title={railOpen ? "Collapse rail" : "Expand rail"}
        style={{
          position: "sticky",
          top: 0,
          zIndex: 10,
          height: 52,
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: railOpen ? "flex-end" : "center",
          padding: railOpen ? "0 12px" : 0,
          background: "var(--bg-void)",
          border: "none",
          borderLeft: "1px solid var(--line-2)",
          borderBottom: "1px solid var(--line-2)",
          cursor: "pointer",
          color: "var(--fg-3)",
        }}
      >
        {railOpen ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
      </button>

      {/* Row 2, Col 1 — nav */}
      <div style={{ position: "sticky", top: 52, height: "calc(100dvh - 52px)" }}>
        <LeftSidebar
          mode="nav"
          sections={sidebarSections}
          activeKey="accounting"
          onBack={() => router.push(`/lab/env/${envId}/operator`)}
        />
      </div>

      {/* Row 2, Col 2 — KPI + table area */}
      <div style={{ display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0 }}>
        {kpiTiles.length > 0 && (
          <KPIBar tiles={kpiTiles} activeKey={kpiFilter} onSelect={setKpiFilter} />
        )}
        {left}
      </div>

      {/* Row 2, Col 3 — right rail */}
      {railOpen ? (
        <aside
          style={{
            borderLeft: "1px solid var(--line-2)",
            background: "var(--bg-void)",
            minHeight: 0,
            overflowY: "auto",
            padding: 10,
          }}
        >
          {rightRail}
        </aside>
      ) : (
        <div style={{ borderLeft: "1px solid var(--line-2)" }} />
      )}

      {/* Row 3 — bottom band spans middle + rail columns */}
      <div style={{ gridColumn: "2 / span 2", borderTop: "1px solid var(--line-2)" }}>
        {bottomBand}
      </div>

      {/* Row 4 — status bar spans middle + rail columns */}
      <div style={{ gridColumn: "2 / span 2", borderTop: "1px solid var(--line-1)" }}>
        {statusBar}
      </div>
    </div>
  );
}
