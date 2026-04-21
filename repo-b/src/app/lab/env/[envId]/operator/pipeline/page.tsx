"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import {
  Button,
  Caps,
  FilterStrip,
  LeftSidebar,
  OperatingSurfaceShell,
  RightRail,
  StatusBar,
  TopControlBar,
  ViewSwitcher,
  fmtUSDK,
} from "@/components/operator/command-desk";
import type { FilterPillDef } from "@/components/operator/command-desk";
import {
  ConsultingEnvProvider,
  useConsultingEnv,
} from "@/components/consulting/ConsultingEnvProvider";
import {
  fetchExecutionBoard,
  type ExecutionBoard,
  type ExecutionCard,
} from "@/lib/cro-api";
import {
  getConsultingPipelineTodayMoves,
  getConsultingPipelineRisks,
  getConsultingPipelineRecentActivity,
  getConsultingPipelineRecentCloses,
  getConsultingPipelineOutreachBrief,
  getNvKpis,
} from "@/lib/bos-api";
import type {
  TodayMoveRow,
  PipelineRisksOut,
  RecentActivityRow,
  RecentClosesOut,
  OutreachBriefOut,
} from "@/types/pipeline-rail";
import type { NvKPIBar } from "@/types/nv-accounting";

import { operatorSidebarSections } from "../_sidebar";
import { PipelineKanban } from "./kanban";
import { toActionViewColumns } from "./board";
import {
  FinanceSnapshotPanel,
  OutreachEnginePanel,
  PipelineRisksPanel,
  RecentActivityPanel,
  TodayMovesPanel,
  WinsLossesPanel,
} from "./rail";
import { QuickCreateNextAction } from "@/components/consulting/QuickCreateNextAction";

type View = "stage" | "action";

export default function OperatorPipelineRoute() {
  const params = useParams<{ envId: string }>();
  const envId = params?.envId;
  if (!envId) return null;
  return (
    <ConsultingEnvProvider envId={envId}>
      <PipelineInner envId={envId} />
    </ConsultingEnvProvider>
  );
}

function PipelineInner({ envId }: { envId: string }) {
  const router = useRouter();
  const { businessId, error, loading: envLoading, ready } = useConsultingEnv();

  const [board, setBoard] = useState<ExecutionBoard | null>(null);
  const [boardLoading, setBoardLoading] = useState(true);
  const [boardError, setBoardError] = useState<string | null>(null);

  const [view, setView] = useState<View>("stage");
  const [selectedCard, setSelectedCard] = useState<ExecutionCard | null>(null);
  const [quickCreateCard, setQuickCreateCard] = useState<ExecutionCard | null>(null);
  const [unresolvedOnly, setUnresolvedOnly] = useState(false);
  const [kpiFilter, setKpiFilter] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const queryRef = useRef<HTMLInputElement>(null);
  const [refreshTick, setRefreshTick] = useState(0);

  // Rail data
  const [moves, setMoves] = useState<TodayMoveRow[] | null>(null);
  const [risks, setRisks] = useState<PipelineRisksOut | null>(null);
  const [activity, setActivity] = useState<RecentActivityRow[] | null>(null);
  const [closes, setCloses] = useState<RecentClosesOut | null>(null);
  const [outreach, setOutreach] = useState<OutreachBriefOut | null>(null);
  const [kpis, setKpis] = useState<NvKPIBar | null>(null);

  const refresh = useCallback(() => setRefreshTick((t) => t + 1), []);

  useEffect(() => {
    if (!ready || !businessId) return;
    let cancelled = false;
    setBoardLoading(true);
    setBoardError(null);
    fetchExecutionBoard(envId, businessId)
      .then((b) => {
        if (!cancelled) setBoard(b);
      })
      .catch((err: unknown) => {
        if (!cancelled) setBoardError(err instanceof Error ? err.message : "Failed to load pipeline");
      })
      .finally(() => {
        if (!cancelled) setBoardLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [envId, businessId, ready, refreshTick]);

  useEffect(() => {
    if (!ready || !businessId) return;
    let cancelled = false;
    Promise.all([
      getConsultingPipelineTodayMoves(envId, businessId).catch(() => [] as TodayMoveRow[]),
      getConsultingPipelineRisks(envId, businessId).catch(() => null),
      getConsultingPipelineRecentActivity(envId, businessId).catch(() => [] as RecentActivityRow[]),
      getConsultingPipelineRecentCloses(envId, businessId).catch(() => null),
      getConsultingPipelineOutreachBrief(envId, businessId).catch(() => null),
      getNvKpis(envId, businessId).catch(() => null),
    ]).then(([m, rk, act, cl, ob, k]) => {
      if (cancelled) return;
      setMoves(m);
      setRisks(rk);
      setActivity(act);
      setCloses(cl);
      setOutreach(ob);
      setKpis(k);
    });
    return () => {
      cancelled = true;
    };
  }, [envId, businessId, ready, refreshTick]);

  // ⌘K focuses search
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        queryRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const columns = useMemo(() => {
    if (!board) return [];
    const all = board.columns;
    const filtered = all.map((col) => ({
      ...col,
      cards: col.cards.filter((c) => {
        if (unresolvedOnly && c.next_action_description) return false;
        if (query) {
          const needle = query.toLowerCase();
          const hay = [c.account_name, c.name, c.next_action_description, c.industry].join(" ").toLowerCase();
          if (!hay.includes(needle)) return false;
        }
        return true;
      }),
    }));
    return view === "action" ? toActionViewColumns(filtered) : filtered;
  }, [board, view, unresolvedOnly, query]);

  const counts = useMemo(() => {
    if (!board) return { open: 0, stale: 0, critical: 0, noAction: 0, atRisk: 0, pipeline: 0, weighted: 0 };
    const allOpen = board.columns
      .filter((c) => !["closed_won", "closed_lost"].includes(c.execution_column_key))
      .flatMap((c) => c.cards);
    return {
      open: allOpen.length,
      stale: allOpen.filter((c) => c.risk_flags.includes("stalled_7d") || c.risk_flags.includes("inactive_3d")).length,
      critical: allOpen.filter((c) => c.execution_pressure === "critical").length,
      noAction: allOpen.filter((c) => !c.next_action_description).length,
      atRisk: allOpen.filter((c) => c.deal_drift_status === "at_risk").length,
      pipeline: board.total_pipeline,
      weighted: board.weighted_pipeline,
    };
  }, [board]);

  const viewSwitcher = [
    { key: "stage",  label: "Stage View",  count: counts.open, accent: "var(--neon-cyan)" },
    { key: "action", label: "Action View", count: counts.noAction, accent: "var(--neon-amber)" },
  ];

  const filterPills: FilterPillDef[] = [
    { key: "vertical", label: "VERTICAL", value: "all" },
    { key: "segment",  label: "SEGMENT",  value: "all" },
    { key: "owner",    label: "OWNER",    value: "me" },
  ];

  const handleCardSelect = useCallback((card: ExecutionCard) => {
    setSelectedCard(card);
  }, []);

  const handleDefineNextAction = useCallback((card: ExecutionCard) => {
    setQuickCreateCard(card);
  }, []);

  const handleSavedAction = useCallback(() => {
    setQuickCreateCard(null);
    refresh();
  }, [refresh]);

  const topBar = (
    <TopControlBar
      title="Pipeline"
      product="NOVENDOR / REVENUE"
      descriptor={
        board ? `${fmtUSDK(counts.pipeline)} open · ${fmtUSDK(counts.weighted)} weighted` : undefined
      }
      statusCounts={{
        synced: counts.open,
        needsAction: counts.noAction,
        overdue: counts.atRisk,
      }}
      onBack={() => router.push(`/lab/env/${envId}/operator`)}
      primaryActions={
        <>
          <Button kind="secondary" size="sm">+ Opportunity</Button>
          <Button kind="primary" size="sm">Run outreach</Button>
        </>
      }
    />
  );

  const filterStrip = (
    <FilterStrip
      pills={filterPills}
      unresolvedOnly={unresolvedOnly}
      onToggleUnresolved={() => setUnresolvedOnly((v) => !v)}
      query={query}
      onQuery={setQuery}
      queryInputRef={queryRef}
    />
  );

  const left = (
    <>
      <ViewSwitcher
        views={viewSwitcher}
        value={view}
        onChange={(k) => setView(k as View)}
        sortLabel="priority"
        groupLabel={view === "action" ? "bucket" : "stage"}
      />
      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", position: "relative" }}>
        {envLoading || boardLoading ? (
          <div style={{ padding: 40, color: "var(--fg-3)", fontFamily: "var(--font-mono)", fontSize: 11 }}>
            Loading pipeline…
          </div>
        ) : error ? (
          <div style={{ padding: 40, color: "var(--sem-down)", fontFamily: "var(--font-mono)", fontSize: 11 }}>
            {error}
          </div>
        ) : boardError ? (
          <div style={{ padding: 40, color: "var(--sem-down)", fontFamily: "var(--font-mono)", fontSize: 11 }}>
            {boardError}
          </div>
        ) : columns.length === 0 ? (
          <div style={{ padding: 40, color: "var(--fg-3)" }}>
            No deals in pipeline. Add opportunities to populate.
          </div>
        ) : (
          <PipelineKanban
            columns={columns}
            selectedCardId={selectedCard?.crm_opportunity_id ?? null}
            onSelectCard={handleCardSelect}
            onDefineNextAction={handleDefineNextAction}
            view={view}
          />
        )}
        {quickCreateCard && businessId && (
          <QuickCreateNextAction
            envId={envId}
            businessId={businessId}
            card={{
              crm_opportunity_id: quickCreateCard.crm_opportunity_id,
              account_name: quickCreateCard.account_name,
              stage_key: quickCreateCard.stage_key,
              amount: quickCreateCard.amount,
            }}
            onClose={() => setQuickCreateCard(null)}
            onSaved={handleSavedAction}
          />
        )}
      </div>
    </>
  );

  const rightRail = (
    <RightRail>
      <TodayMovesPanel moves={moves} />
      <PipelineRisksPanel data={risks} />
      <OutreachEnginePanel data={outreach} />
      <RecentActivityPanel rows={activity} />
      <WinsLossesPanel data={closes} />
      <FinanceSnapshotPanel kpis={kpis} envId={envId} />
    </RightRail>
  );

  const statusBar = (
    <StatusBar
      version="novendor/pipeline 0.1"
      syncState="live"
      hotkeys={[
        { keys: "⌘K", label: "search" },
        { keys: "N", label: "next action" },
      ]}
      right={ready ? "" : "env resolving…"}
    />
  );

  return (
    <OperatingSurfaceShell
      leftSidebar={
        <LeftSidebar
          brand={
            <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.1 }}>
              <Caps size={9} color="var(--fg-3)">NOVENDOR</Caps>
              <Caps size={9} color="var(--neon-cyan)">OPERATOR</Caps>
            </div>
          }
          sections={operatorSidebarSections(envId)}
          activeKey="pipeline"
          onBack={() => router.push(`/lab/env/${envId}/operator`)}
        />
      }
      topBar={topBar}
      filterStrip={filterStrip}
      left={left}
      rightRail={rightRail}
      statusBar={statusBar}
    />
  );
}
