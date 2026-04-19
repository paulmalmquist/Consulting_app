"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import {
  BottomBand,
  Button,
  CommandDeskShell,
  DetailDrawer,
  DualAreaChart,
  FilterStrip,
  KPIBar,
  MoMBars,
  RightRail,
  StackedBar,
  StatusBar,
  TopControlBar,
  ViewSwitcher,
  WorkTable,
  fmtUSD,
} from "@/components/operator/command-desk";
import type {
  FilterPillDef,
  KPITile,
  ViewSwitcherView,
} from "@/components/operator/command-desk";
import type {
  NvARAging,
  NvAISoftwareSummary,
  NvCashMovementTrend,
  NvExpenseCategoryTrend,
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
  getNvCashMovementTrend,
  getNvExpenseCategoryTrend,
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
  needsColumns,
  receiptsColumns,
  subscriptionsColumns,
  txnsColumns,
} from "./columns";
import { DrawerBody, DrawerFooter } from "./DrawerBody";
import {
  ReceiptIntakePanel,
  RevenueWatchPanel,
  SubscriptionWatchPanel,
} from "./rail";

type View = "needs" | "txns" | "recs" | "invs" | "subs";

export default function AccountingDeskPage() {
  const params = useParams<{ envId: string }>();
  const envId = params.envId;
  const router = useRouter();
  const { businessId } = useDomainEnv();

  const [view, setView] = useState<View>("needs");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [unresolvedOnly, setUnresolvedOnly] = useState(true);
  const [kpiFilter, setKpiFilter] = useState<string | null>(null);
  const [query, setQuery] = useState("");

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

  const [refreshTick, setRefreshTick] = useState(0);
  const bumpRefresh = useCallback(() => setRefreshTick((t) => t + 1), []);

  const queryInputRef = useRef<HTMLInputElement>(null);

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
    ])
      .then(([k, ar, ec, cm, intake, sub, summary]) => {
        if (cancelled) return;
        setKpis(k);
        setArAging(ar);
        setExpCat(ec);
        setCashMove(cm);
        setReceipts(intake);
        setLedger(sub);
        setAiSummary(summary ?? null);
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
        queryInputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const selectedQueueItem: NvQueueItem | null = useMemo(() => {
    if (view !== "needs" || !selectedId || !queue) return null;
    return queue.items.find((it) => it.id === selectedId) ?? null;
  }, [view, selectedId, queue]);

  const views: ViewSwitcherView[] = useMemo(() => {
    const c = queue?.counts;
    return [
      { key: "needs", label: "Needs Attention", count: c?.needs ?? 0, accent: "var(--neon-amber)" },
      { key: "txns",  label: "Transactions",    count: c?.txns  ?? 0, accent: "var(--neon-cyan)"  },
      { key: "recs",  label: "Receipts",        count: c?.recs  ?? 0, accent: "var(--neon-cyan)"  },
      { key: "invs",  label: "Invoices",        count: c?.invs  ?? 0, accent: "var(--neon-cyan)"  },
      { key: "subs",  label: "Subscriptions",   count: c?.subs  ?? 0, accent: "var(--neon-magenta)" },
    ];
  }, [queue]);

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

  const filterPills: FilterPillDef[] = [
    { key: "range", label: "RANGE",    value: "last 30d" },
    { key: "client", label: "CLIENT",  value: "all" },
    { key: "eng",    label: "ENGAGEMENT", value: "all" },
    { key: "status", label: "STATUS",  value: "active" },
    { key: "owner",  label: "ASSIGNEE", value: "me" },
  ];

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

  const uploadInputRef = useRef<HTMLInputElement>(null);
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

  const primaryActions = (
    <>
      <Button kind="secondary" size="sm">Import txns</Button>
      <Button kind="secondary" size="sm">+ Invoice</Button>
      <Button kind="secondary" size="sm">+ Expense</Button>
      <Button kind="primary" size="sm" onClick={handleUploadClick}>↑ Upload receipt</Button>
      <input
        ref={uploadInputRef}
        type="file"
        style={{ display: "none" }}
        onChange={handleUploadChange}
      />
    </>
  );

  const statusCounts = useMemo(() => {
    if (!queue) return undefined;
    const overdue = queue.items.filter((i) => i.type === "overdue-invoice").length;
    return {
      synced: queue.counts.txns + queue.counts.recs,
      needsAction: queue.counts.needs,
      overdue,
    };
  }, [queue]);

  const topBar = (
    <TopControlBar
      title="Command Desk"
      product="NOVENDOR / ACCOUNTING"
      descriptor={kpis?.as_of ? `as of ${kpis.as_of}` : undefined}
      statusCounts={statusCounts}
      onBack={() => router.push(`/lab/env/${envId}/operator`)}
      primaryActions={primaryActions}
    />
  );

  const filterStrip = (
    <FilterStrip
      pills={filterPills}
      unresolvedOnly={unresolvedOnly}
      onToggleUnresolved={() => setUnresolvedOnly((v) => !v)}
      query={query}
      onQuery={setQuery}
      queryInputRef={queryInputRef}
    />
  );

  const kpiStrip = kpiTiles.length > 0 ? (
    <KPIBar tiles={kpiTiles} activeKey={kpiFilter} onSelect={setKpiFilter} />
  ) : null;

  const activeTable = (() => {
    if (view === "needs") {
      return (
        <WorkTable<NvQueueItem>
          rows={queue?.items ?? []}
          columns={needsColumns}
          rowKey={(r) => r.id}
          selectedId={selectedId}
          onSelect={(r) => setSelectedId(r.id)}
          rowAccent={(r) =>
            r.glow
              ? { borderLeft: "2px solid var(--sem-error)", glow: true }
              : undefined
          }
          emptyState="Queue clear. All caught up."
        />
      );
    }
    if (view === "txns") {
      return (
        <WorkTable<NvTransactionRow>
          rows={txns}
          columns={txnsColumns}
          rowKey={(r) => r.id}
          emptyState="No transactions."
        />
      );
    }
    if (view === "invs") {
      return (
        <WorkTable<NvInvoiceRow>
          rows={invoices}
          columns={invoicesColumns}
          rowKey={(r) => r.id}
          rowAccent={(r) =>
            r.glow ? { borderLeft: "2px solid var(--sem-error)", glow: true } : undefined
          }
          emptyState="No invoices."
        />
      );
    }
    if (view === "recs") {
      return (
        <WorkTable
          rows={receipts?.rows ?? []}
          columns={receiptsColumns}
          rowKey={(r) => r.id}
          emptyState="No receipts."
        />
      );
    }
    return (
      <WorkTable<NvSubscriptionRow>
        rows={ledger?.rows ?? []}
        columns={subscriptionsColumns}
        rowKey={(r) => r.id}
        emptyState="No subscriptions detected."
      />
    );
  })();

  const left = (
    <>
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
          accent={selectedQueueItem.state_tone === "error" ? "var(--sem-error)" : "var(--neon-cyan)"}
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
          body: expCat && expCat.slices.length > 0 ? (
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
      ]}
    />
  );

  const statusBar = (
    <StatusBar
      version="novendor/acct 0.1"
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

  return (
    <CommandDeskShell
      topBar={topBar}
      filterStrip={filterStrip}
      kpiStrip={kpiStrip}
      left={left}
      rightRail={rightRail}
      bottomBand={bottomBand}
      statusBar={statusBar}
    />
  );
}
