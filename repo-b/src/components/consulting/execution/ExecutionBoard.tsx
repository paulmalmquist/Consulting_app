"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
  createExecutionTask,
  type ExecutionTaskBoard as ExecutionBoardData,
  type ExecutionTask,
  type ExecutionTaskStatus,
  type ExecutionTaskType,
  type ExecutionRevenueTag,
  type ExecutionTaskOutcome,
} from "@/lib/cro-api";
import { ExecutionColumn } from "./ExecutionColumn";
import { ExecutionTaskDrawer } from "./ExecutionTaskDrawer";
import { GenerateActionsModal } from "./GenerateActionsModal";
import { CompletionFeedbackModal } from "./CompletionFeedbackModal";

type ColumnKey = Exclude<ExecutionTaskStatus, never>;

const COLUMNS: { key: ColumnKey; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "this_week", label: "This Week" },
  { key: "waiting", label: "Waiting" },
  { key: "done", label: "Done" },
];

const TYPE_OPTIONS: { value: "" | ExecutionTaskType; label: string }[] = [
  { value: "", label: "All types" },
  { value: "outreach", label: "Outreach" },
  { value: "follow_up", label: "Follow-up" },
  { value: "proof_asset", label: "Proof asset" },
  { value: "research", label: "Research" },
  { value: "product", label: "Product" },
];

const REVENUE_OPTIONS: { value: "" | ExecutionRevenueTag; label: string }[] = [
  { value: "", label: "All revenue" },
  { value: "high", label: "$$$" },
  { value: "mid", label: "$$" },
  { value: "low", label: "$" },
];

export function ExecutionBoard({
  envId,
  businessId,
  onReload,
}: {
  envId: string;
  businessId: string;
  onReload?: () => void;
}) {
  const [data, setData] = useState<ExecutionBoardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<"" | ExecutionTaskType>("");
  const [revenueFilter, setRevenueFilter] = useState<"" | ExecutionRevenueTag>("");
  const [showArchived, setShowArchived] = useState(false);
  const [drawerTask, setDrawerTask] = useState<ExecutionTask | null>(null);
  const [generateOpen, setGenerateOpen] = useState(false);
  const [completionTask, setCompletionTask] = useState<ExecutionTask | null>(null);
  const [quickTitle, setQuickTitle] = useState("");
  const [autoBanner, setAutoBanner] = useState<string | null>(null);
  const [highlightSeqGroup, setHighlightSeqGroup] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await fetchExecutionTaskBoard(envId, businessId, {
        type: typeFilter || undefined,
        revenue_tag: revenueFilter || undefined,
        include_archived_done: showArchived,
      });
      setData(next);
      const total =
        next.auto_report.pipeline_no_next_action +
        next.auto_report.pipeline_stale_3d +
        next.auto_report.outreach_no_reply_2d +
        next.auto_report.proof_backlog_top;
      if (total > 0) {
        setAutoBanner(`Auto-added ${total} pressure task${total === 1 ? "" : "s"}`);
      } else {
        setAutoBanner(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load board");
    } finally {
      setLoading(false);
    }
  }, [envId, businessId, typeFilter, revenueFilter, showArchived]);

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
    for (const t of data.tasks) {
      out[t.status as ColumnKey].push(t);
    }
    return out;
  }, [data]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 8 } }),
  );

  const moveTask = useCallback(
    async (task: ExecutionTask, nextStatus: ColumnKey) => {
      if (task.status === nextStatus) return;

      if (nextStatus === "done") {
        // Optimistic: keep the card, but open the completion modal.
        setData((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            tasks: prev.tasks.map((t) =>
              t.id === task.id ? { ...t, status: "done" as ExecutionTaskStatus } : t,
            ),
          };
        });
        setCompletionTask(task);
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
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to update task");
        load();
      }
    },
    [load],
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
        setError(err instanceof Error ? err.message : "Failed to record completion");
      }
    },
    [load],
  );

  const onQuickAdd = useCallback(async () => {
    const title = quickTitle.trim();
    if (!title) return;
    try {
      await createExecutionTask({
        env_id: envId,
        business_id: businessId,
        title,
        next_action: title,
        why_now: "Captured quickly — refine in the drawer.",
        type: "outreach",
        status: "today",
        impact: 3,
        revenue_tag: "mid",
      });
      setQuickTitle("");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add task");
    }
  }, [quickTitle, envId, businessId, load]);

  const onTaskUpdated = useCallback(
    async (taskId: string) => {
      load();
      // refresh the drawer's view of the task too
      try {
        const next = await fetchExecutionTaskBoard(envId, businessId, {
          type: typeFilter || undefined,
          revenue_tag: revenueFilter || undefined,
          include_archived_done: showArchived,
        });
        const updated = next.tasks.find((t) => t.id === taskId) || null;
        setDrawerTask(updated);
        setData(next);
      } catch {
        // ignore — board reload above already updates UI
      }
    },
    [envId, businessId, typeFilter, revenueFilter, showArchived, load],
  );

  const summary = data?.summary;
  const todayLoaded = (summary?.today_count ?? 0) >= 5;

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
      {/* Sticky header */}
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 5,
          padding: "12px 16px",
          borderBottom: "1px solid rgba(255,255,255,0.07)",
          background: "#05070B",
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: 8,
        }}
      >
        <CountChip label="Today" value={summary?.today_count ?? 0} pressure={todayLoaded} />
        <CountChip label="This Week" value={summary?.this_week_count ?? 0} />
        <CountChip label="Waiting" value={summary?.waiting_count ?? 0} />
        {summary?.overdue_count ? (
          <CountChip label="Overdue" value={summary.overdue_count} danger />
        ) : null}

        <div style={{ flex: 1 }} />

        <input
          value={quickTitle}
          onChange={(e) => setQuickTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onQuickAdd();
          }}
          placeholder="Add an action — Enter to save"
          style={{
            flex: "1 1 240px",
            minWidth: 200,
            padding: "8px 10px",
            borderRadius: 4,
            border: "1px solid rgba(255,255,255,0.10)",
            background: "rgba(255,255,255,0.03)",
            color: "#dce6f0",
            fontSize: 13,
          }}
        />

        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as "" | ExecutionTaskType)}
          style={selectStyle}
        >
          {TYPE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>

        <select
          value={revenueFilter}
          onChange={(e) => setRevenueFilter(e.target.value as "" | ExecutionRevenueTag)}
          style={selectStyle}
        >
          {REVENUE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>

        <button
          type="button"
          onClick={() => setShowArchived((v) => !v)}
          style={ghostBtn}
        >
          {showArchived ? "Hide archived" : "Show archived"}
        </button>

        <button
          type="button"
          onClick={() => setGenerateOpen(true)}
          style={primaryBtn}
        >
          Generate
        </button>
      </div>

      {autoBanner ? (
        <div
          style={{
            padding: "6px 16px",
            fontSize: 12,
            color: "rgba(0,220,255,0.85)",
            borderBottom: "1px solid rgba(255,255,255,0.05)",
            background: "rgba(0,220,255,0.04)",
          }}
        >
          {autoBanner}
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
              highlightSeqGroup={highlightSeqGroup}
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

function CountChip({
  label,
  value,
  pressure,
  danger,
}: {
  label: string;
  value: number;
  pressure?: boolean;
  danger?: boolean;
}) {
  const tone = danger
    ? { color: "#FCA5A5", border: "rgba(239,68,68,0.45)", bg: "rgba(239,68,68,0.10)" }
    : pressure
      ? { color: "#FCA5A5", border: "rgba(239,68,68,0.45)", bg: "rgba(239,68,68,0.10)" }
      : { color: "rgba(220,230,240,0.78)", border: "rgba(255,255,255,0.10)", bg: "transparent" };
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "4px 10px",
        borderRadius: 3,
        border: `1px solid ${tone.border}`,
        background: tone.bg,
        color: tone.color,
        fontSize: 11,
        letterSpacing: "0.06em",
        textTransform: "uppercase",
        fontFamily: "var(--font-mono, 'JetBrains Mono', monospace)",
      }}
    >
      <span>{label}</span>
      <span style={{ fontWeight: 700 }}>{value}</span>
    </div>
  );
}

const selectStyle: React.CSSProperties = {
  padding: "6px 8px",
  borderRadius: 3,
  border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(255,255,255,0.03)",
  color: "#dce6f0",
  fontSize: 12,
};

const ghostBtn: React.CSSProperties = {
  padding: "6px 10px",
  borderRadius: 3,
  border: "1px solid rgba(255,255,255,0.10)",
  background: "transparent",
  color: "rgba(220,230,240,0.72)",
  fontSize: 11,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  cursor: "pointer",
  fontFamily: "var(--font-mono, 'JetBrains Mono', monospace)",
};

const primaryBtn: React.CSSProperties = {
  padding: "6px 12px",
  borderRadius: 3,
  border: "1px solid rgba(0,220,255,0.40)",
  background: "rgba(0,220,255,0.10)",
  color: "rgba(0,220,255,0.95)",
  fontSize: 11,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  cursor: "pointer",
  fontFamily: "var(--font-mono, 'JetBrains Mono', monospace)",
};
