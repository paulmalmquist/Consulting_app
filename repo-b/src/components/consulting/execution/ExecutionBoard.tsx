"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  fetchExecutionTaskBoard,
  updateExecutionTask,
  completeExecutionTask,
  quickCaptureTask,
  type ExecutionTaskBoard as ExecutionBoardData,
  type ExecutionTask,
  type ExecutionTaskStatus,
  type ExecutionTaskOutcome,
} from "@/lib/cro-api";
import { useConsultingEnv } from "@/components/consulting/ConsultingEnvProvider";
import { ExecutionColumn } from "./ExecutionColumn";
import { ExecutionTaskDrawer } from "./ExecutionTaskDrawer";
import { GenerateActionsModal } from "./GenerateActionsModal";
import { MorningBriefPanel } from "./MorningBriefPanel";
import { CompletionFeedbackModal } from "./CompletionFeedbackModal";

type ColumnKey = Exclude<ExecutionTaskStatus, never>;

const COLUMNS: { key: ColumnKey; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "this_week", label: "This Week" },
  { key: "waiting", label: "Waiting" },
  { key: "done", label: "Done" },
];

// Soft warning at 5, hard cap at 8 — server-enforced (returns 422 today_full).
const TODAY_WARN = 5;
const TODAY_HARD_CAP = 8;

const REVENUE_RANK: Record<string, number> = { high: 0, mid: 1, low: 2 };

// Controlled operating domains (seeded by migration 10003). Local fallback
// label map so domain grouping never blocks on a label API; the board API
// also returns domain_label when the reference row resolves.
const DOMAIN_FILTERS: { key: string; label: string }[] = [
  { key: "all", label: "All" },
  { key: "web_properties", label: "Web Properties" },
  { key: "outreach_crm", label: "Outreach / CRM" },
  { key: "coding_platform", label: "Coding / Winston Platform" },
  { key: "novendor_web", label: "Novendor Web / Industry Sections" },
  { key: "admin_ops", label: "Admin / Accounting / Operations" },
  { key: "ungrouped", label: "Ungrouped" },
];

// Per-card "Domain → Initiative" crumb lives in ExecutionCard.tsx. The
// filter strip uses DOMAIN_FILTERS (above) for its labels.

function isOverdue(t: ExecutionTask): boolean {
  if (!t.due_date) return false;
  return new Date(t.due_date) < startOfToday();
}

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function isoDay(offset: number): string {
  const d = startOfToday();
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
}

// User-asked sort: overdue first, revenue=high next, impact desc, auto-source first.
function sortToday(a: ExecutionTask, b: ExecutionTask): number {
  const aOver = isOverdue(a) ? 0 : 1;
  const bOver = isOverdue(b) ? 0 : 1;
  if (aOver !== bOver) return aOver - bOver;
  const aRev = REVENUE_RANK[a.revenue_tag] ?? 3;
  const bRev = REVENUE_RANK[b.revenue_tag] ?? 3;
  if (aRev !== bRev) return aRev - bRev;
  if (a.impact !== b.impact) return b.impact - a.impact;
  const aAuto = a.auto_source && a.auto_source !== "manual" && a.auto_source !== "quick_capture" ? 0 : 1;
  const bAuto = b.auto_source && b.auto_source !== "manual" && b.auto_source !== "quick_capture" ? 0 : 1;
  if (aAuto !== bAuto) return aAuto - bAuto;
  return a.created_at.localeCompare(b.created_at);
}

export function ExecutionBoard({
  envId,
  businessId: businessIdProp,
  onReload,
}: {
  envId: string;
  businessId?: string;
  onReload?: () => void;
}) {
  const { businessId: ctxBusinessId } = useConsultingEnv();
  const businessId = businessIdProp ?? ctxBusinessId ?? "";
  const [data, setData] = useState<ExecutionBoardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [drawerTask, setDrawerTask] = useState<ExecutionTask | null>(null);
  const [generateOpen, setGenerateOpen] = useState(false);
  const [completionTask, setCompletionTask] = useState<ExecutionTask | null>(null);
  const [quickTitle, setQuickTitle] = useState("");
  const [quickToast, setQuickToast] = useState<string | null>(null);
  const [highlightSeqGroup, setHighlightSeqGroup] = useState<string | null>(null);
  const [doneCollapsed, setDoneCollapsed] = useState(true);
  const [domainFilter, setDomainFilter] = useState<string>("all");
  const toastTimer = useRef<number | null>(null);

  const flashToast = useCallback((msg: string) => {
    setQuickToast(msg);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setQuickToast(null), 3500);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await fetchExecutionTaskBoard(envId, businessId);
      setData(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load board");
    } finally {
      setLoading(false);
    }
  }, [envId, businessId]);

  useEffect(() => {
    load();
  }, [load]);

  const tasksByColumn = useMemo(() => {
    const out: Record<ColumnKey, ExecutionTask[]> = {
      today: [],
      this_week: [],
      waiting: [],
      done: [],
    };
    if (!data) return out;
    const matchesDomain = (t: ExecutionTask): boolean => {
      if (domainFilter === "all") return true;
      if (domainFilter === "ungrouped") return !t.domain_key;
      return t.domain_key === domainFilter;
    };
    for (const t of data.tasks) {
      if (!matchesDomain(t)) continue;
      out[t.status as ColumnKey].push(t);
    }
    out.today.sort(sortToday);
    out.this_week.sort((a, b) => {
      if (a.due_date && b.due_date) return a.due_date.localeCompare(b.due_date);
      if (a.due_date) return -1;
      if (b.due_date) return 1;
      return b.impact - a.impact;
    });
    out.waiting.sort((a, b) => {
      if (a.re_engage_at && b.re_engage_at) return a.re_engage_at.localeCompare(b.re_engage_at);
      if (a.re_engage_at) return -1;
      if (b.re_engage_at) return 1;
      return a.created_at.localeCompare(b.created_at);
    });
    out.done.sort((a, b) => (b.completed_at ?? "").localeCompare(a.completed_at ?? ""));
    return out;
  }, [data, domainFilter]);

  // Domain counts for the filter strip (computed off the full set, not the
  // filtered view, so the chips always show true totals).
  const domainCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    let ungrouped = 0;
    for (const t of data?.tasks ?? []) {
      if (t.domain_key) counts[t.domain_key] = (counts[t.domain_key] ?? 0) + 1;
      else ungrouped += 1;
    }
    counts.all = data?.tasks.length ?? 0;
    counts.ungrouped = ungrouped;
    return counts;
  }, [data]);

  const summary = data?.summary;
  const todayCount = summary?.today_count ?? 0;
  const overdueCount = summary?.overdue_count ?? 0;
  const thisWeekCount = summary?.this_week_count ?? 0;
  const movedDeals = summary?.moved_deal_7d ?? 0;
  const completedRecent = summary?.completed_7d ?? 0;
  const movedPct =
    completedRecent > 0 ? Math.round((movedDeals / completedRecent) * 100) : null;
  const todayPressure: "ok" | "warn" | "full" =
    todayCount >= TODAY_HARD_CAP ? "full" : todayCount >= TODAY_WARN ? "warn" : "ok";

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 8 } }),
  );

  const handleApiError = useCallback(
    (err: unknown, fallback: string): string => {
      const message = err instanceof Error ? err.message : fallback;
      if (message.toLowerCase().includes("today_full")) {
        return `TODAY is full (${TODAY_HARD_CAP}). Move something out first.`;
      }
      return message;
    },
    [],
  );

  const moveTask = useCallback(
    async (task: ExecutionTask, nextStatus: ColumnKey) => {
      if (task.status === nextStatus) return;

      // Drag-to-DONE always opens completion modal — don't mutate yet.
      if (nextStatus === "done") {
        setCompletionTask(task);
        return;
      }

      // Drag-to-WAITING: open drawer pre-set to waiting so the user picks
      // re_engage_at and blocked_reason. We optimistically set the status to
      // waiting and store re_engage_at = today+3d as the default the user
      // can override before saving.
      if (nextStatus === "waiting") {
        setData((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            tasks: prev.tasks.map((t) =>
              t.id === task.id
                ? {
                    ...t,
                    status: "waiting" as ExecutionTaskStatus,
                    re_engage_at: t.re_engage_at ?? `${isoDay(3)}T00:00:00Z`,
                  }
                : t,
            ),
          };
        });
        try {
          const updated = await updateExecutionTask(task.id, {
            status: "waiting",
            re_engage_at: `${isoDay(3)}T00:00:00Z`,
          });
          setDrawerTask(updated);
        } catch (err) {
          setError(handleApiError(err, "Failed to move task"));
          load();
        }
        return;
      }

      // Cap guard: don't even try when target is TODAY and already at hard cap.
      if (nextStatus === "today" && todayCount >= TODAY_HARD_CAP) {
        setError(`TODAY is full (${TODAY_HARD_CAP}). Move something out first.`);
        return;
      }

      setData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          tasks: prev.tasks.map((t) =>
            t.id === task.id ? { ...t, status: nextStatus } : t,
          ),
        };
      });

      try {
        await updateExecutionTask(task.id, { status: nextStatus });
        load();
      } catch (err) {
        setError(handleApiError(err, "Failed to update task"));
        load();
      }
    },
    [load, todayCount, handleApiError],
  );

  const onDragEnd = useCallback(
    (e: DragEndEvent) => {
      const taskId = String(e.active.id);
      const overId = e.over?.id ? String(e.over.id) : null;
      if (!overId) return;
      const colKey = overId.startsWith("col:") ? (overId.slice(4) as ColumnKey) : null;
      if (!colKey) return;
      const task = data?.tasks.find((t) => t.id === taskId);
      if (!task) return;
      moveTask(task, colKey);
    },
    [data, moveTask],
  );

  const onMobileMove = useCallback(
    (task: ExecutionTask, nextStatus: ColumnKey) => moveTask(task, nextStatus),
    [moveTask],
  );

  const onComplete = useCallback(
    async (task: ExecutionTask, outcome: ExecutionTaskOutcome, note: string | null) => {
      try {
        await completeExecutionTask(task.id, { outcome, outcome_note: note });
        setCompletionTask(null);
        load();
      } catch (err) {
        setError(handleApiError(err, "Failed to record completion"));
      }
    },
    [load, handleApiError],
  );

  const onQuickDone = useCallback((task: ExecutionTask) => {
    // Outcome capture is mandatory — always open the modal.
    setCompletionTask(task);
  }, []);

  const onQuickCapture = useCallback(async () => {
    const text = quickTitle.trim();
    if (!text) return;
    try {
      const result = await quickCaptureTask({
        env_id: envId,
        business_id: businessId,
        text,
      });
      setQuickTitle("");
      const matched = result.matched_entity;
      const where = result.task.status === "today" ? "TODAY" : "THIS WEEK";
      flashToast(
        matched
          ? `Added to ${where} — linked to ${matched.name}`
          : `Added to ${where} — no entity match`,
      );
      load();
    } catch (err) {
      setError(handleApiError(err, "Failed to add task"));
    }
  }, [quickTitle, envId, businessId, load, flashToast, handleApiError]);

  const onTaskUpdated = useCallback(
    async (taskId: string) => {
      try {
        const next = await fetchExecutionTaskBoard(envId, businessId);
        const updated = next.tasks.find((t) => t.id === taskId) || null;
        setDrawerTask(updated);
        setData(next);
      } catch {
        load();
      }
    },
    [envId, businessId, load],
  );

  return (
    <div
      style={{
        minWidth: 0,
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        height: "100%",
      }}
    >
      {/* Top bar — leads with TODAY pressure, not generic KPIs */}
      <div
        style={{
          padding: "10px 16px 12px",
          borderBottom: "1px solid rgba(255,255,255,0.07)",
          background: "#05070B",
          display: "flex",
          flexWrap: "wrap",
          alignItems: "flex-start",
          gap: 12,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 200 }}>
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              gap: 8,
            }}
          >
            <span
              style={{
                fontSize: 11,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                color: "rgba(220,230,240,0.55)",
                fontFamily: "var(--font-mono, 'JetBrains Mono', monospace)",
              }}
            >
              Today
            </span>
            <span
              style={{
                fontSize: 22,
                fontWeight: 700,
                color:
                  todayPressure === "full"
                    ? "#FCA5A5"
                    : todayPressure === "warn"
                      ? "#FB923C"
                      : "#dce6f0",
                fontFamily: "var(--font-mono, 'JetBrains Mono', monospace)",
              }}
            >
              {todayCount}
              <span style={{ color: "rgba(220,230,240,0.45)", fontWeight: 500, fontSize: 16 }}>
                {" "}/ {TODAY_WARN}
              </span>
            </span>
            <span style={{ fontSize: 12, color: "rgba(220,230,240,0.55)" }}>
              tasks
            </span>
          </div>
          <div
            style={{
              fontSize: 11,
              color: "rgba(220,230,240,0.55)",
              fontFamily: "var(--font-mono, 'JetBrains Mono', monospace)",
              letterSpacing: "0.06em",
              display: "flex",
              gap: 12,
            }}
          >
            {overdueCount > 0 ? (
              <span style={{ color: "#FCA5A5" }}>{overdueCount} overdue</span>
            ) : null}
            <span>This week: {thisWeekCount}</span>
            {movedPct !== null ? (
              <span>
                Moved deals {movedDeals}/{completedRecent} ({movedPct}%)
              </span>
            ) : null}
          </div>
        </div>

        <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 8, minWidth: 280 }}>
          <input
            value={quickTitle}
            onChange={(e) => setQuickTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onQuickCapture();
            }}
            placeholder="Type a task… e.g. Send follow-up to Marcus Partners"
            style={{
              flex: 1,
              minWidth: 240,
              padding: "9px 12px",
              borderRadius: 4,
              border: "1px solid rgba(255,255,255,0.10)",
              background: "rgba(255,255,255,0.03)",
              color: "#dce6f0",
              fontSize: 13,
            }}
          />
          <button
            type="button"
            onClick={() => setGenerateOpen(true)}
            style={primaryBtn}
          >
            Generate
          </button>
        </div>
      </div>

      {/* Morning Brief — Ticket 6, read-only generated view above the lanes.
          Failure to load degrades to an in-panel error + Retry; the rest of
          the board still works. */}
      <MorningBriefPanel envId={envId} businessId={businessId} />

      {/* Domain grouping strip — display/filter only. Lanes below are
          unchanged; "All" (default) preserves the original flat board. */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 6,
          padding: "8px 16px",
          borderBottom: "1px solid rgba(255,255,255,0.07)",
          background: "#05070B",
        }}
      >
        {DOMAIN_FILTERS.map((d) => {
          const active = domainFilter === d.key;
          const count = domainCounts[d.key] ?? 0;
          return (
            <button
              key={d.key}
              type="button"
              onClick={() => setDomainFilter(d.key)}
              style={{
                padding: "5px 10px",
                borderRadius: 3,
                border: active
                  ? "1px solid rgba(0,220,255,0.45)"
                  : "1px solid rgba(255,255,255,0.10)",
                background: active
                  ? "rgba(0,220,255,0.12)"
                  : "rgba(255,255,255,0.03)",
                color: active ? "rgba(0,220,255,0.95)" : "rgba(220,230,240,0.66)",
                fontSize: 11,
                letterSpacing: "0.04em",
                cursor: "pointer",
                fontFamily: "var(--font-mono, 'JetBrains Mono', monospace)",
              }}
            >
              {d.label}
              <span
                style={{
                  marginLeft: 6,
                  color: active
                    ? "rgba(0,220,255,0.7)"
                    : "rgba(220,230,240,0.4)",
                }}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {todayPressure === "warn" ? (
        <div
          style={{
            padding: "6px 16px",
            fontSize: 12,
            color: "#FB923C",
            borderBottom: "1px solid rgba(251,146,60,0.20)",
            background: "rgba(251,146,60,0.06)",
            fontFamily: "var(--font-mono, 'JetBrains Mono', monospace)",
            letterSpacing: "0.04em",
          }}
        >
          You&apos;re at {todayCount}/{TODAY_WARN} for today. Anything more is avoidance — move some to THIS WEEK.
        </div>
      ) : null}

      {todayPressure === "full" ? (
        <div
          style={{
            padding: "6px 16px",
            fontSize: 12,
            color: "#FCA5A5",
            borderBottom: "1px solid rgba(239,68,68,0.30)",
            background: "rgba(239,68,68,0.08)",
            fontFamily: "var(--font-mono, 'JetBrains Mono', monospace)",
            letterSpacing: "0.04em",
          }}
        >
          TODAY is full ({todayCount}/{TODAY_HARD_CAP}). New adds land in THIS WEEK until you clear something.
        </div>
      ) : null}

      {quickToast ? (
        <div
          style={{
            padding: "6px 16px",
            fontSize: 12,
            color: "rgba(0,220,255,0.92)",
            borderBottom: "1px solid rgba(0,220,255,0.20)",
            background: "rgba(0,220,255,0.04)",
          }}
        >
          {quickToast}
        </div>
      ) : null}

      {error ? (
        <div
          style={{
            margin: 12,
            padding: "8px 12px",
            borderRadius: 4,
            border: "1px solid rgba(239,68,68,0.30)",
            background: "rgba(239,68,68,0.08)",
            color: "#FCA5A5",
            fontSize: 13,
          }}
        >
          {error}
          <button
            type="button"
            onClick={() => setError(null)}
            style={{
              float: "right",
              border: 0,
              background: "transparent",
              color: "#FCA5A5",
              cursor: "pointer",
            }}
          >
            ✕
          </button>
        </div>
      ) : null}

      {/* Columns */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflowX: "auto",
          overflowY: "hidden",
          display: "flex",
          gap: 8,
          padding: 12,
        }}
      >
        <DndContext sensors={sensors} onDragEnd={onDragEnd}>
          {COLUMNS.map((col) => (
            <ExecutionColumn
              key={col.key}
              columnKey={col.key}
              label={col.label}
              tasks={tasksByColumn[col.key]}
              onSelectTask={setDrawerTask}
              onMobileMove={onMobileMove}
              onQuickDone={col.key !== "done" ? onQuickDone : undefined}
              highlightSeqGroup={highlightSeqGroup}
              pressureLevel={col.key === "today" ? todayPressure : "ok"}
              isFull={col.key === "today" && todayPressure === "full"}
              collapsed={col.key === "done" ? doneCollapsed : false}
              onToggleCollapsed={col.key === "done" ? () => setDoneCollapsed((v) => !v) : undefined}
            />
          ))}
        </DndContext>
        {loading && !data ? (
          <div style={{ padding: 16, fontSize: 13, color: "rgba(220,230,240,0.55)" }}>
            Loading...
          </div>
        ) : null}
      </div>

      {drawerTask ? (
        <ExecutionTaskDrawer
          task={drawerTask}
          envId={envId}
          businessId={businessId}
          onClose={() => setDrawerTask(null)}
          onUpdated={onTaskUpdated}
          onDeleted={() => {
            setDrawerTask(null);
            load();
          }}
        />
      ) : null}

      {generateOpen ? (
        <GenerateActionsModal
          envId={envId}
          businessId={businessId}
          onClose={() => setGenerateOpen(false)}
          onGenerated={(seqGroup) => {
            setGenerateOpen(false);
            setHighlightSeqGroup(seqGroup);
            load();
            window.setTimeout(() => setHighlightSeqGroup(null), 4000);
            onReload?.();
          }}
        />
      ) : null}

      {completionTask ? (
        <CompletionFeedbackModal
          task={completionTask}
          onClose={() => {
            setCompletionTask(null);
            load();
          }}
          onSubmit={(outcome, note) => onComplete(completionTask, outcome, note)}
        />
      ) : null}
    </div>
  );
}

const primaryBtn: React.CSSProperties = {
  padding: "8px 14px",
  borderRadius: 3,
  border: "1px solid rgba(0,220,255,0.40)",
  background: "rgba(0,220,255,0.10)",
  color: "rgba(0,220,255,0.95)",
  fontSize: 11,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  cursor: "pointer",
  fontFamily: "var(--font-mono, 'JetBrains Mono', monospace)",
};
