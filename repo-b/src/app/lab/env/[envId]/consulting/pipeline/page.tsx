"use client";

import { useEffect, useState, useCallback, useMemo, useRef, type ReactNode } from "react";
import { Search, X as XIcon, ChevronLeft, ChevronRight } from "lucide-react";
import { useConsultingEnv } from "@/components/consulting/ConsultingEnvProvider";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import { useToast } from "@/components/ui/Toast";
import {
  fetchExecutionBoard,
  advanceOpportunityStage,
  fetchPipelineStages,
  fetchSchemaHealth,
  type ExecutionBoard,
  type ExecutionBoardColumn,
  type ExecutionCard,
  type SchemaHealth,
  type PipelineStage,
} from "@/lib/cro-api";
import AddDealDrawer from "@/components/consulting/AddDealDrawer";
import { DealSidePanel } from "@/components/consulting/DealSidePanel";
import PipelineLaneView, {
  PipelineCommandBand,
  LaneCardOverlay,
  GroupedBoardView,
  BoardViewToggle,
  type LaneMode,
} from "@/components/consulting/PipelineLaneView";
import { PIPELINE_GROUPS, type BoardViewMode } from "@/components/consulting/pipeline-groups";
import PipelineActionPanel, {
  type ActiveSlice,
} from "@/components/consulting/PipelineActionPanel";
import {
  computeInsight,
  healthLabel,
  momentumArrow,
  type StageRow,
} from "@/components/consulting/pipeline-insight";
import {
  industryToVertical,
  VERTICAL_ORDER,
  VERTICAL_COLORS,
  type ColorMode,
} from "@/components/consulting/pipeline-verticals";
import { LeftSidebar } from "@/components/operator/command-desk";
import { consultingSidebarSections } from "../../operator/_sidebar";
import {
  TodayMovesPanel,
  PipelineRisksPanel,
  OutreachEnginePanel,
  RecentActivityPanel,
  WinsLossesPanel,
  FinanceSnapshotPanel,
} from "@/app/lab/env/[envId]/operator/pipeline/rail";
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


function formatError(err: unknown): string {
  if (!(err instanceof Error)) {
    return "Consulting API unreachable. Backend service is not available.";
  }
  const msg = err.message.replace(/\s*\(req:\s*[a-zA-Z0-9_-]+\)\s*$/, "");
  if (msg.includes("Network error")) {
    return "Consulting API unreachable. Backend service is not available.";
  }
  return msg || "Consulting API unreachable. Backend service is not available.";
}

function mapExecutionColumnToStage(columnKey: string): string {
  const mapping: Record<string, string> = {
    target_identified: "identified",
    outreach: "contacted",
    engaged: "engaged",
    discovery_scheduled: "meeting",
    demo_completed: "qualified",
    proposal: "proposal",
    closed_won: "closed_won",
    closed_lost: "closed_lost",
  };
  return mapping[columnKey] || columnKey;
}

function isSchemaError(msg: string | null): boolean {
  if (!msg) return false;
  return msg.includes("schema not migrated") || msg.includes("SCHEMA_NOT_MIGRATED");
}

function SchemaErrorBanner({ envId, onRetry }: { envId: string; onRetry: () => void }) {
  const [health, setHealth] = useState<SchemaHealth | null>(null);
  const [loading, setLoading] = useState(false);
  const [checked, setChecked] = useState<string | null>(null);

  const checkHealth = useCallback(async () => {
    setLoading(true);
    try {
      const h = await fetchSchemaHealth();
      setHealth(h);
      setChecked(new Date().toLocaleTimeString());
      if (h.schema_ready) {
        onRetry();
      }
    } catch {
      setHealth(null);
    } finally {
      setLoading(false);
    }
  }, [onRetry]);

  useEffect(() => { checkHealth(); }, [checkHealth]);

  return (
    <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-5 py-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-amber-400">
            Consulting environment not initialized
          </h3>
          <p className="text-xs text-bm-muted2 mt-1">
            Required database migrations have not been applied. The consulting module cannot load until the schema is ready.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => { checkHealth().then(() => onRetry()); }}
            disabled={loading}
            className="rounded-lg border border-amber-500/30 px-3 py-1.5 text-xs font-medium text-amber-400 hover:bg-amber-500/10 disabled:opacity-50"
          >
            {loading ? "Checking..." : "Retry"}
          </button>
        </div>
      </div>

      {health ? (
        <div className="mt-3 space-y-2">
          <div className="flex items-center gap-2 text-xs">
            <span className={`h-2 w-2 rounded-full ${health.schema_ready ? "bg-emerald-500" : "bg-red-500"}`} />
            <span className="text-bm-text">
              Schema: {health.total_found}/{health.total_required} tables present
            </span>
            {checked ? (
              <span className="text-bm-muted2 ml-auto">
                Last check: {checked}
              </span>
            ) : null}
          </div>
          {health.migrations_needed.length > 0 ? (
            <div className="rounded-lg bg-bm-surface/20 border border-bm-border/30 px-3 py-2">
              <p className="text-[10px] font-bold uppercase tracking-wider text-bm-muted2 mb-1">
                Missing Migrations
              </p>
              <ul className="space-y-0.5">
                {health.migrations_needed.map((m, i) => (
                  <li key={i} className="text-xs text-red-400/80 font-mono">{m}</li>
                ))}
              </ul>
              <p className="text-[10px] text-bm-muted2 mt-2">
                Run: <code className="text-bm-accent/80">make db:migrate</code> or <code className="text-bm-accent/80">cd repo-b && node db/schema/apply.js</code>
              </p>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}


export default function PipelinePage({
  params,
}: {
  params: { envId: string };
}) {
  const {
    businessId,
    error: contextError,
    loading: contextLoading,
    ready,
  } = useConsultingEnv();
  const [kanban, setKanban] = useState<ExecutionBoard | null>(null);
  const [loading, setLoading] = useState(true);
  const [dataError, setDataError] = useState<string | null>(null);
  const [activeCard, setActiveCard] = useState<ExecutionCard | null>(null);
  const [advanceError, setAdvanceError] = useState<string | null>(null);
  const [selectedDealId, setSelectedDealId] = useState<string | null>(null);
  const [closeDialog, setCloseDialog] = useState<{
    opportunityId: string;
    stageKey: string;
  } | null>(null);
  const [closeReason, setCloseReason] = useState("");
  const [addDealOpen, setAddDealOpen] = useState(false);
  const [stages, setStages] = useState<PipelineStage[]>([]);

  const { push } = useToast();

  const [selectedIndustries, setSelectedIndustries] = useState<Set<string>>(
    () => new Set(),
  );
  const [selectedVertical, setSelectedVertical] = useState<string | null>(null);
  const [colorMode, setColorMode] = useState<ColorMode>("vertical");
  const [focusedStage, setFocusedStage] = useState<string | null>(null);
  const [activeSlice, setActiveSlice] = useState<ActiveSlice | null>(null);
  const [chartMode, setChartMode] = useState<LaneMode>("count");
  const [boardViewMode, setBoardViewMode] = useState<BoardViewMode>("groups");
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => new Set());
  const columnRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // Search
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Right rail collapse — persisted to localStorage
  const [railOpen, setRailOpen] = useState<boolean>(true);

  // Rail data
  const [moves, setMoves] = useState<TodayMoveRow[] | null>(null);
  const [risks, setRisks] = useState<PipelineRisksOut | null>(null);
  const [activity, setActivity] = useState<RecentActivityRow[] | null>(null);
  const [closes, setCloses] = useState<RecentClosesOut | null>(null);
  const [outreach, setOutreach] = useState<OutreachBriefOut | null>(null);
  const [kpis, setKpis] = useState<NvKPIBar | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  const loadData = useCallback(() => {
    if (!ready || !businessId) {
      if (ready && !businessId) setLoading(false);
      return;
    }
    setLoading(true);
    setDataError(null);
    fetchExecutionBoard(params.envId, businessId)
      .then((result) => {
        setKanban(result);
      })
      .catch((err) => {
        setKanban(null);
        setDataError(formatError(err));
      })
      .finally(() => setLoading(false));
  }, [businessId, params.envId, ready]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (!ready || !businessId) return;
    let cancelled = false;
    Promise.all([
      getConsultingPipelineTodayMoves(params.envId, businessId).catch(() => [] as TodayMoveRow[]),
      getConsultingPipelineRisks(params.envId, businessId).catch(() => null),
      getConsultingPipelineRecentActivity(params.envId, businessId).catch(() => [] as RecentActivityRow[]),
      getConsultingPipelineRecentCloses(params.envId, businessId).catch(() => null),
      getConsultingPipelineOutreachBrief(params.envId, businessId).catch(() => null),
      getNvKpis(params.envId, businessId).catch(() => null),
    ]).then(([m, rk, act, cl, ob, k]) => {
      if (cancelled) return;
      setMoves(m);
      setRisks(rk);
      setActivity(act);
      setCloses(cl);
      setOutreach(ob);
      setKpis(k);
    });
    return () => { cancelled = true; };
  }, [params.envId, businessId, ready]);

  useEffect(() => {
    if (!ready || !businessId) return;
    fetchPipelineStages(businessId)
      .then((result) => setStages(result))
      .catch(() => setStages([]));
  }, [businessId, ready]);

  const handleDealCreated = useCallback(() => {
    loadData();
    push({
      title: "Deal created",
      description: "The new deal was added to the pipeline.",
      variant: "success",
    });
  }, [loadData, push]);

  // Debounce search query
  useEffect(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => setDebouncedQuery(searchQuery), 200);
    return () => { if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current); };
  }, [searchQuery]);

  // Init rail state from localStorage + collapse on narrow viewports
  useEffect(() => {
    const stored = localStorage.getItem("nv_rail_open");
    if (stored !== null) {
      setRailOpen(stored !== "false");
    } else if (typeof window !== "undefined" && window.innerWidth < 1024) {
      setRailOpen(false);
    }
    const bvm = localStorage.getItem("nv_board_view_mode");
    if (bvm === "groups" || bvm === "stages") setBoardViewMode(bvm);
    const groupsRaw = localStorage.getItem("nv_expanded_groups");
    if (groupsRaw) {
      try {
        const parsed = JSON.parse(groupsRaw);
        if (Array.isArray(parsed)) {
          setExpandedGroups(new Set(parsed.filter((k): k is string => typeof k === "string")));
        }
      } catch {
        // Ignore malformed payloads
      }
    } else {
      // One-time migration from the old single-key state
      const legacy = localStorage.getItem("nv_expanded_group");
      if (legacy) {
        setExpandedGroups(new Set([legacy]));
        localStorage.setItem("nv_expanded_groups", JSON.stringify([legacy]));
        localStorage.removeItem("nv_expanded_group");
      }
    }
  }, []);

  // Derive all cards from kanban for Today Panel and Action Bar
  const allCards = useMemo(() => {
    if (!kanban) return [];
    return kanban.columns
      .filter((c) => !["closed_won", "closed_lost"].includes(c.execution_column_key))
      .flatMap((c) => c.cards);
  }, [kanban]);

  const staleCards = useMemo(
    () => allCards.filter((c) => c.risk_flags.includes("stalled_7d") || c.risk_flags.includes("inactive_3d")),
    [allCards],
  );
  const noActionCards = useMemo(
    () => allCards.filter((c) => !c.next_action_description),
    [allCards],
  );
  const revenueAtRisk = useMemo(
    () => staleCards.reduce((sum, c) => sum + (c.amount || 0), 0),
    [staleCards],
  );

  // Stable industry list (from unfiltered board) so chips don't flicker
  const industries = useMemo(() => {
    const s = new Set<string>();
    allCards.forEach((c) => {
      const key = (c.industry || "Other").trim() || "Other";
      s.add(key);
    });
    return Array.from(s).sort();
  }, [allCards]);

  // Closed stages are removed from the active board — they live in the rail (wins/losses)
  const CLOSED_KEYS = new Set(["closed_won", "closed_lost"]);

  // Vertical + industry + search filtered columns — drives BOTH kanban render and chart
  // Closed stages are excluded entirely from the active kanban.
  const filteredColumns = useMemo((): ExecutionBoardColumn[] => {
    if (!kanban) return [];
    const q = debouncedQuery.trim().toLowerCase();
    const isTriageNoAction = q === "no action";
    const isTriageNoContact = q === "no contact";
    const isTriageNoOutreach = q === "no outreach";
    return kanban.columns
      .filter((col) => !CLOSED_KEYS.has(col.execution_column_key))
      .map((col) => ({
        ...col,
        cards: col.cards.filter((c) => {
          const ind = (c.industry || "Other").trim() || "Other";
          if (selectedVertical && industryToVertical(ind) !== selectedVertical) return false;
          if (selectedIndustries.size > 0 && !selectedIndustries.has(ind)) return false;
          // Triage keywords — use real counts from backend payload
          if (isTriageNoAction) return !c.next_action_description;
          if (isTriageNoContact) return c.contact_count === 0;
          if (isTriageNoOutreach) return c.outreach_count === 0;
          // General search
          if (q) {
            const haystack = [
              c.account_name ?? "",
              c.name ?? "",
              c.industry ?? "",
              c.next_action_description ?? "",
              c.pain_hypothesis ?? "",
              (c.personas ?? []).join(" "),
            ].join(" ").toLowerCase();
            if (!haystack.includes(q)) return false;
          }
          return true;
        }),
      }));
  }, [kanban, selectedVertical, selectedIndustries, debouncedQuery]);

  // Verticals present in the full board (stable — not affected by filters)
  const availableVerticals = useMemo(() => {
    const counts: Record<string, number> = {};
    allCards.forEach((c) => {
      const v = industryToVertical((c.industry || "Other").trim() || "Other");
      counts[v] = (counts[v] || 0) + 1;
    });
    return VERTICAL_ORDER.filter((v) => (counts[v] || 0) > 0).map((v) => ({
      name: v,
      count: counts[v] || 0,
    }));
  }, [allCards]);

  // Industry tags within the selected vertical (for sub-vertical chips)
  const subVerticals = useMemo(() => {
    if (!selectedVertical) return [];
    const s = new Set<string>();
    allCards.forEach((c) => {
      const ind = (c.industry || "Other").trim() || "Other";
      if (industryToVertical(ind) === selectedVertical) s.add(ind);
    });
    return Array.from(s).sort();
  }, [allCards, selectedVertical]);

  // Chart segment keys — verticals or raw industry tags depending on colorMode
  const chartGroupKeys = useMemo(() => {
    if (colorMode === "vertical") {
      const present = new Set<string>();
      allCards.forEach((c) => {
        present.add(industryToVertical((c.industry || "Other").trim() || "Other"));
      });
      return VERTICAL_ORDER.filter((v) => present.has(v));
    }
    return industries;
  }, [colorMode, allCards, industries]);

  // Chart color map — vertical colors or industry colors
  const chartColorMap = useMemo((): Record<string, string> => {
    const m: Record<string, string> = {};
    if (colorMode === "vertical") {
      chartGroupKeys.forEach((v) => { m[v] = VERTICAL_COLORS[v] ?? "#6B7280"; });
    }
    return m;
  }, [colorMode, chartGroupKeys]);

  // Chart rows — one per non-closed stage
  const chartData = useMemo((): StageRow[] => {
    const now = Date.now();
    return filteredColumns
      .filter((c) => !["closed_won", "closed_lost"].includes(c.execution_column_key))
      .map((col) => {
        const row: StageRow = {
          stage_key: col.execution_column_key,
          stage_label: col.execution_column_label,
          _total: 0,
          _noAction: 0,
          _stale: 0,
          _hot: 0,
          _moved24h: 0,
        };
        chartGroupKeys.forEach((key) => { row[key] = 0; });
        for (const c of col.cards) {
          const ind = (c.industry || "Other").trim() || "Other";
          const segKey = colorMode === "vertical" ? industryToVertical(ind) : ind;
          const contrib = chartMode === "count" ? 1 : c.amount || 0;
          row[segKey] = (Number(row[segKey]) || 0) + contrib;
          row._total += 1;
          if (!c.next_action_description) row._noAction += 1;
          if (c.risk_flags.includes("inactive_3d") || c.risk_flags.includes("stalled_7d")) {
            row._stale += 1;
          }
          if (c.momentum_status === "increasing") row._hot += 1;
          if (c.last_activity_at && now - new Date(c.last_activity_at).getTime() < 86_400_000) {
            row._moved24h += 1;
          }
        }
        row._healthLabel = healthLabel(row);
        row._momentum = momentumArrow(row);
        return row;
      });
  }, [filteredColumns, chartGroupKeys, colorMode, chartMode]);

  const insight = useMemo(
    () => computeInsight(filteredColumns),
    [filteredColumns],
  );

  const hasActiveFilters =
    selectedIndustries.size > 0 ||
    selectedVertical !== null ||
    focusedStage !== null ||
    activeSlice !== null;

  // Focused segment key for bar segment dimming (vertical key or industry key)
  const focusedSegKey =
    colorMode === "vertical"
      ? (selectedVertical ?? null)
      : (activeSlice?.industry ?? null);

  const handleToggleIndustry = useCallback((industry: string) => {
    setSelectedIndustries((prev) => {
      const next = new Set(prev);
      if (next.has(industry)) next.delete(industry);
      else next.add(industry);
      return next;
    });
  }, []);

  const handleSelectVertical = useCallback((vertical: string) => {
    setSelectedVertical((prev) => {
      const next = prev === vertical ? null : vertical;
      if (!next) {
        // Clearing vertical: also clear sub-industry selection
        setSelectedIndustries(new Set());
        setActiveSlice(null);
        setFocusedStage(null);
      } else {
        // Switching vertical: clear sub-industry selection
        setSelectedIndustries(new Set());
        setActiveSlice(null);
      }
      return next;
    });
  }, []);

  const handleToggleColorMode = useCallback(() => {
    setColorMode((m) => (m === "vertical" ? "industry" : "vertical"));
    // Reset all filter state when switching color modes
    setSelectedVertical(null);
    setSelectedIndustries(new Set());
    setFocusedStage(null);
    setActiveSlice(null);
  }, []);

  const scrollToColumn = useCallback((stageKey: string) => {
    const el = columnRefs.current[stageKey];
    if (el) {
      el.scrollIntoView({
        behavior: "smooth",
        inline: "center",
        block: "nearest",
      });
    }
  }, []);

  // Toggle stage focus: clicking the same bar twice clears everything.
  // Both focusedStage and activeSlice are cleared together to avoid divergence.
  const handleSelectStage = useCallback(
    (stageKey: string) => {
      setFocusedStage((prev) => {
        const next = prev === stageKey ? null : stageKey;
        setActiveSlice(next === null ? null : { stage: stageKey });
        return next;
      });
      scrollToColumn(stageKey);
    },
    [scrollToColumn],
  );

  // Toggle segment: behavior depends on colorMode.
  // Vertical mode: segment key is a vertical — sets selectedVertical.
  // Industry mode: segment key is an industry tag — sets selectedIndustries (original behavior).
  const handleSelectSegment = useCallback(
    (stageKey: string, segKey: string) => {
      if (colorMode === "vertical") {
        const isSame = focusedStage === stageKey && selectedVertical === segKey;
        if (isSame) {
          setSelectedVertical(null);
          setSelectedIndustries(new Set());
          setFocusedStage(null);
          setActiveSlice(null);
        } else {
          setSelectedVertical(segKey);
          setSelectedIndustries(new Set());
          setFocusedStage(stageKey);
          setActiveSlice({ stage: stageKey });
          scrollToColumn(stageKey);
        }
      } else {
        if (focusedStage === stageKey && activeSlice?.industry === segKey) {
          setSelectedIndustries(new Set());
          setFocusedStage(null);
          setActiveSlice(null);
        } else {
          setSelectedIndustries(new Set([segKey]));
          setFocusedStage(stageKey);
          setActiveSlice({ stage: stageKey, industry: segKey });
          scrollToColumn(stageKey);
        }
      }
    },
    [colorMode, focusedStage, selectedVertical, activeSlice, scrollToColumn],
  );

  const handleInsightAction = useCallback(() => {
    const rec = insight.recommendation;
    if (rec.focusIndustry) {
      setSelectedIndustries(new Set([rec.focusIndustry]));
    }
    if (rec.focusStage) {
      setFocusedStage(rec.focusStage);
      setActiveSlice({
        stage: rec.focusStage,
        industry: rec.focusIndustry ?? undefined,
      });
      scrollToColumn(rec.focusStage);
    }
  }, [insight, scrollToColumn]);

  const handleClearFilters = useCallback(() => {
    setSelectedIndustries(new Set());
    setSelectedVertical(null);
    setFocusedStage(null);
    setActiveSlice(null);
  }, []);

  const handleToggleMode = useCallback(() => {
    setChartMode((m) => (m === "count" ? "value" : "count"));
  }, []);

  const handleBoardViewMode = useCallback((m: BoardViewMode) => {
    setBoardViewMode(m);
    localStorage.setItem("nv_board_view_mode", m);
    if (m === "stages") {
      setExpandedGroups(new Set());
      localStorage.removeItem("nv_expanded_groups");
    }
  }, []);

  const persistExpandedGroups = useCallback((next: Set<string>) => {
    if (next.size === 0) localStorage.removeItem("nv_expanded_groups");
    else localStorage.setItem("nv_expanded_groups", JSON.stringify(Array.from(next)));
  }, []);

  const handleToggleGroup = useCallback((key: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      persistExpandedGroups(next);
      return next;
    });
  }, [persistExpandedGroups]);

  const handleExpandAllGroups = useCallback(() => {
    const next = new Set(PIPELINE_GROUPS.map((g) => g.key));
    setExpandedGroups(next);
    persistExpandedGroups(next);
  }, [persistExpandedGroups]);

  const handleCollapseAllGroups = useCallback(() => {
    setExpandedGroups(new Set());
    persistExpandedGroups(new Set());
  }, [persistExpandedGroups]);

  // Stable per-key ref callbacks cached so LaneColumn doesn't see new
  // function references on every render (avoids unnecessary dnd-kit re-registration).
  const columnRefCallbackCache = useRef<
    Record<string, (el: HTMLDivElement | null) => void>
  >({});
  const makeColumnRef = useCallback((stageKey: string) => {
    if (!columnRefCallbackCache.current[stageKey]) {
      columnRefCallbackCache.current[stageKey] = (el: HTMLDivElement | null) => {
        columnRefs.current[stageKey] = el;
      };
    }
    return columnRefCallbackCache.current[stageKey];
  }, []);

  function handleDragStart(event: DragStartEvent) {
    const card = event.active.data.current?.card as ExecutionCard | undefined;
    if (card) setActiveCard(card);
  }

  async function handleDragEnd(event: DragEndEvent) {
    setActiveCard(null);
    const { active, over } = event;
    if (!over || !businessId) return;

    const oppId = active.id as string;
    const targetColumnId = over.id as string;
    if (!targetColumnId.startsWith("column-")) return;

    const targetStageKey = targetColumnId.replace("column-", "");

    const currentColumn = kanban?.columns.find((col) =>
      col.cards.some((c) => c.crm_opportunity_id === oppId),
    );
    if (!currentColumn || currentColumn.execution_column_key === targetStageKey) return;

    if (targetStageKey === "closed_won" || targetStageKey === "closed_lost") {
      setCloseDialog({ opportunityId: oppId, stageKey: targetStageKey });
      return;
    }

    try {
      setAdvanceError(null);
      await advanceOpportunityStage({
        env_id: params.envId,
        business_id: businessId,
        opportunity_id: oppId,
        to_stage_key: mapExecutionColumnToStage(targetStageKey),
      });
      loadData();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to advance stage";
      setAdvanceError(msg);
    }
  }

  async function handleCloseConfirm() {
    if (!closeDialog || !businessId) return;
    try {
      await advanceOpportunityStage({
        env_id: params.envId,
        business_id: businessId,
        opportunity_id: closeDialog.opportunityId,
        to_stage_key: mapExecutionColumnToStage(closeDialog.stageKey),
        close_reason: closeReason || undefined,
      });
      setCloseDialog(null);
      setCloseReason("");
      loadData();
    } catch (err) {
      console.error("Failed to close deal:", err);
    }
  }

  function handleSelectCard(id: string) {
    setSelectedDealId(id);
  }

  const bannerMessage = contextError
    ? contextError === "Environment not bound to a business."
      ? "This environment is not bound to a business, so CRM data cannot be loaded."
      : contextError
    : dataError;
  const isLoading = contextLoading || (ready && loading);
  const openDeals = allCards.length;

  const winstonBrand: ReactNode = (
    <span
      className="font-command"
      style={{ fontSize: "1rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#ffffff", textShadow: "0 0 12px rgba(255,255,255,0.07)" }}
    >
      WINSTON
    </span>
  );

  if (isLoading) {
    return (
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "240px minmax(0, 1fr) 40px",
          gridTemplateRows: "52px minmax(0, 1fr)",
          height: "100%",
          minHeight: "100%",
          background: "#05070B",
        }}
      >
        <LeftSidebar mode="brand" brand={winstonBrand} sections={consultingSidebarSections(params.envId)} activeKey="pipeline" />
        <div style={{ height: 52, borderBottom: "1px solid rgba(255,255,255,0.07)" }} />
        <div style={{ height: 52, borderLeft: "1px solid rgba(255,255,255,0.08)", borderBottom: "1px solid rgba(255,255,255,0.07)" }} />
        <LeftSidebar mode="nav" sections={consultingSidebarSections(params.envId)} activeKey="pipeline" />
        <div className="flex gap-0.5 overflow-x-auto px-4 pt-4 pb-4">
          {[1, 2, 3, 4, 5, 6, 7].map((i) => (
            <div key={i} className="shrink-0 w-[150px] sm:w-[206px] h-[480px] bg-bm-surface/40 rounded animate-pulse" />
          ))}
        </div>
        <div style={{ borderLeft: "1px solid rgba(255,255,255,0.08)" }} />
      </div>
    );
  }

  const totalVisible = filteredColumns.reduce((sum, col) => sum + col.cards.length, 0);

  const railWidth = railOpen ? 400 : 40;

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `240px minmax(0, 1fr) ${railWidth}px`,
        gridTemplateRows: "52px auto",
        minHeight: "100dvh",
        background: "#05070B",
        transition: "grid-template-columns 200ms ease",
      }}
    >
      {/* Row 1, Col 1 — WINSTON brand block (sticky) */}
      <div style={{ position: "sticky", top: 0, zIndex: 10 }}>
        <LeftSidebar
          mode="brand"
          brand={winstonBrand}
          sections={consultingSidebarSections(params.envId)}
          activeKey="pipeline"
        />
      </div>

      {/* Row 1, Col 2 — Search bar (52px, sticky) */}
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 10,
          height: 52,
          display: "flex",
          alignItems: "center",
          padding: "0 16px",
          gap: 8,
          background: "#05070B",
          borderBottom: "1px solid rgba(255,255,255,0.07)",
          flexShrink: 0,
          minWidth: 0,
        }}
      >
        <Search size={14} style={{ color: "rgba(220,230,240,0.40)", flexShrink: 0 }} />
        <input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search deals, verticals… or type: no action / no contact / no outreach"
          style={{
            flex: 1,
            background: "transparent",
            border: "none",
            outline: "none",
            color: "#dce6f0",
            fontSize: 13,
            fontFamily: "inherit",
          }}
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery("")}
            style={{ color: "rgba(220,230,240,0.50)", background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center" }}
          >
            <XIcon size={12} />
          </button>
        )}
        <button
          onClick={() => setAddDealOpen(true)}
          className="hidden lg:inline-flex rounded-lg bg-bm-accent px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-bm-bg hover:bg-bm-accent/90"
          style={{ flexShrink: 0 }}
        >
          + Add Deal
        </button>
        <span style={{ fontSize: 11, color: "rgba(220,230,240,0.40)", flexShrink: 0, whiteSpace: "nowrap" }}>
          {kanban ? `${totalVisible} deal${totalVisible !== 1 ? "s" : ""}` : ""}
          {debouncedQuery ? ` · "${debouncedQuery}"` : ""}
        </span>
      </div>

      {/* Row 1, Col 3 — Rail toggle (always visible, even when collapsed) */}
      <button
        data-command-desk
        onClick={() => {
          const next = !railOpen;
          setRailOpen(next);
          localStorage.setItem("nv_rail_open", String(next));
        }}
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
          padding: railOpen ? "0 12px" : "0",
          background: "rgba(6,9,14,0.98)",
          border: "none",
          borderLeft: "1px solid rgba(255,255,255,0.08)",
          borderBottom: "1px solid rgba(255,255,255,0.07)",
          cursor: "pointer",
          color: "rgba(220,230,240,0.40)",
        }}
      >
        {railOpen ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
      </button>

      {/* Row 2, Col 1 — Sidebar nav (sticky so it stays visible when board scrolls) */}
      <div style={{ position: "sticky", top: 0, height: "100dvh", overflowY: "auto" }}>
        <LeftSidebar
          mode="nav"
          sections={consultingSidebarSections(params.envId)}
          activeKey="pipeline"
        />
      </div>

      {/* Row 2, Col 2 — Banners + command band + board */}
      <div style={{ minWidth: 0, display: "flex", flexDirection: "column" }}>
        {bannerMessage ? (
          <div className="mx-4 mt-3">
            {isSchemaError(bannerMessage) ? (
              <SchemaErrorBanner envId={params.envId} onRetry={loadData} />
            ) : (
              <div className="rounded-lg border border-bm-danger/35 bg-bm-danger/10 px-4 py-3 text-sm text-bm-text">
                {bannerMessage}
              </div>
            )}
          </div>
        ) : null}

        {advanceError ? (
          <div className="mx-4 mt-2 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm text-red-400 flex items-center justify-between">
            <span>{advanceError}</span>
            <button onClick={() => setAdvanceError(null)} className="text-red-400/60 hover:text-red-400 ml-2 text-xs">dismiss</button>
          </div>
        ) : null}

        {kanban && openDeals === 0 ? (
          <div className="mx-4 mt-3 rounded-lg border border-bm-border/40 bg-bm-surface/20 px-4 py-5 text-sm text-bm-muted2">
            No open opportunities in the active pipeline.{" "}
            <a href={`/lab/env/${params.envId}/consulting/pipeline/lost`} style={{ color: "rgba(220,230,240,0.50)", textDecoration: "underline" }}>
              View lost deals →
            </a>
          </div>
        ) : null}

        {/* Empty search state */}
        {kanban && debouncedQuery && totalVisible === 0 ? (
          <div style={{ padding: "32px 16px", textAlign: "center", color: "rgba(220,230,240,0.40)", fontSize: 13 }}>
            No matching deals.{" "}
            <button
              onClick={() => setSearchQuery("")}
              style={{ color: "#00DCFF", background: "none", border: "none", cursor: "pointer", fontSize: 13 }}
            >
              Clear search
            </button>{" "}
            to see all.
          </div>
        ) : null}

        {kanban && !(debouncedQuery && totalVisible === 0) ? (
          <div style={{ display: "flex", flexDirection: "column" }}>
            <PipelineCommandBand
              insight={insight}
              industries={industries}
              selectedIndustries={selectedIndustries}
              availableVerticals={availableVerticals}
              subVerticals={subVerticals}
              selectedVertical={selectedVertical}
              colorMode={colorMode}
              mode={chartMode}
              hasActiveFilters={hasActiveFilters}
              openDeals={openDeals}
              staleCount={staleCards.length}
              criticalCount={kanban.critical_deals.length}
              noActionCount={noActionCards.length}
              revenueAtRisk={revenueAtRisk}
              totalPipeline={kanban.total_pipeline ?? 0}
              weightedPipeline={kanban.weighted_pipeline ?? 0}
              onToggleIndustry={handleToggleIndustry}
              onSelectVertical={handleSelectVertical}
              onToggleColorMode={handleToggleColorMode}
              onInsightAction={handleInsightAction}
              onToggleMode={handleToggleMode}
              onClearFilters={handleClearFilters}
              boardViewToggle={
                <BoardViewToggle mode={boardViewMode} onChange={handleBoardViewMode} />
              }
            />
            {boardViewMode === "groups" ? (
              <GroupedBoardView
                columns={filteredColumns}
                chartData={chartData}
                chartGroupKeys={chartGroupKeys}
                chartColorMap={chartColorMap}
                colorMode={colorMode}
                focusedSegKey={focusedSegKey}
                focusedStage={focusedStage}
                mode={chartMode}
                expandedGroups={expandedGroups}
                onToggleGroup={handleToggleGroup}
                onExpandAll={handleExpandAllGroups}
                onCollapseAll={handleCollapseAllGroups}
                onSelectStage={handleSelectStage}
                onSelectSegment={handleSelectSegment}
                onSelectCard={handleSelectCard}
                makeColumnRef={makeColumnRef}
                dndSensors={sensors}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
                activeCard={activeCard}
              />
            ) : (
              <DndContext
                sensors={sensors}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
              >
                <PipelineLaneView
                  columns={filteredColumns}
                  chartData={chartData}
                  chartGroupKeys={chartGroupKeys}
                  chartColorMap={chartColorMap}
                  colorMode={colorMode}
                  focusedSegKey={focusedSegKey}
                  focusedStage={focusedStage}
                  mode={chartMode}
                  onSelectStage={handleSelectStage}
                  onSelectSegment={handleSelectSegment}
                  onSelectCard={handleSelectCard}
                  makeColumnRef={makeColumnRef}
                />
                <DragOverlay>
                  {activeCard ? <LaneCardOverlay card={activeCard} /> : null}
                </DragOverlay>
              </DndContext>
            )}
          </div>
        ) : null}

        {kanban ? (
          <PipelineActionPanel
            slice={activeSlice}
            columns={filteredColumns}
            envId={params.envId}
            businessId={businessId || ""}
            onExecuted={loadData}
            onOpenDeal={handleSelectCard}
            onDismiss={() => setActiveSlice(null)}
          />
        ) : null}

        {kanban ? (
          <button
            onClick={() => setAddDealOpen(true)}
            className="lg:hidden"
            style={{
              position: "fixed",
              right: 20,
              bottom: 24,
              zIndex: 60,
              background: "#00E5FF",
              color: "#05070B",
              border: "none",
              borderRadius: 999,
              padding: "14px 18px",
              fontWeight: 700,
              letterSpacing: "0.08em",
              boxShadow: "0 20px 45px rgba(0, 229, 255, 0.22)",
              cursor: "pointer",
            }}
          >
            + Add Deal
          </button>
        ) : null}

        {selectedDealId ? (
          <DealSidePanel
            dealId={selectedDealId}
            envId={params.envId}
            businessId={businessId || ""}
            onClose={() => setSelectedDealId(null)}
            onDataChange={loadData}
          />
        ) : null}

        {addDealOpen ? (
          <AddDealDrawer
            envId={params.envId}
            businessId={businessId!}
            stages={stages}
            onClose={() => setAddDealOpen(false)}
            onCreated={handleDealCreated}
          />
        ) : null}
      </div>

      {/* Row 2, Col 3 — Right rail panels (sticky so it stays visible when board scrolls) */}
      <div
        data-command-desk
        style={{
          position: "sticky",
          top: 0,
          height: "100dvh",
          minWidth: 0,
          borderLeft: "1px solid rgba(255,255,255,0.08)",
          background: "rgba(6,9,14,0.98)",
          overflowY: railOpen ? "auto" : "hidden",
          overflowX: "hidden",
          display: "flex",
          flexDirection: "column",
          gap: 0,
        }}
      >
        {railOpen && (
          <>
            <TodayMovesPanel moves={moves} />
            <PipelineRisksPanel data={risks} />
            <OutreachEnginePanel data={outreach} />
            <RecentActivityPanel rows={activity} />
            <WinsLossesPanel data={closes} envId={params.envId} />
            <FinanceSnapshotPanel kpis={kpis} envId={params.envId} />
          </>
        )}
      </div>

      {/* Close Deal Dialog */}
      {closeDialog ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="w-full max-w-sm rounded-xl border border-bm-border bg-bm-bg p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-bm-text">
              {closeDialog.stageKey === "closed_won" ? "Close as Won" : "Close as Lost"}
            </h3>
            <p className="mt-2 text-sm text-bm-muted2">
              {closeDialog.stageKey === "closed_won"
                ? "Add a reason for closing this deal as won."
                : "Add a reason for losing this deal."}
            </p>
            <textarea
              className="mt-3 w-full rounded-lg border border-bm-border bg-bm-surface/20 px-3 py-2 text-sm text-bm-text placeholder:text-bm-muted2 focus:outline-none focus:ring-1 focus:ring-bm-accent"
              placeholder="Reason (optional)"
              value={closeReason}
              onChange={(e) => setCloseReason(e.target.value)}
              rows={3}
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => {
                  setCloseDialog(null);
                  setCloseReason("");
                }}
                className="rounded-lg border border-bm-border px-4 py-2 text-sm text-bm-text hover:bg-bm-surface/30"
              >
                Cancel
              </button>
              <button
                onClick={() => void handleCloseConfirm()}
                className={`rounded-lg px-4 py-2 text-sm font-medium text-white ${
                  closeDialog.stageKey === "closed_won"
                    ? "bg-emerald-600 hover:bg-emerald-700"
                    : "bg-rose-600 hover:bg-rose-700"
                }`}
              >
                {closeDialog.stageKey === "closed_won" ? "Mark as Won" : "Mark as Lost"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
