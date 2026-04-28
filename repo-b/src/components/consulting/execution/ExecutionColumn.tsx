"use client";

import { useDroppable } from "@dnd-kit/core";
import type { ExecutionTask, ExecutionTaskStatus } from "@/lib/cro-api";
import { ExecutionCard } from "./ExecutionCard";

const ACCENT: Record<string, string> = {
  today: "rgba(0,220,255,0.85)",
  this_week: "rgba(251,191,36,0.85)",
  waiting: "rgba(167,139,250,0.85)",
  done: "rgba(52,211,153,0.85)",
};

const EMPTY_COPY: Record<ExecutionTaskStatus, string> = {
  today: "Inbox zero. Pull from THIS WEEK or generate from a deal.",
  this_week: "Nothing scheduled. Quick-capture above.",
  waiting: "No blocked items.",
  done: "Nothing completed in the last 7 days.",
};

export function ExecutionColumn({
  columnKey,
  label,
  tasks,
  onSelectTask,
  onMobileMove,
  onQuickDone,
  highlightSeqGroup,
  pressureLevel = "ok",
  isFull = false,
  collapsed = false,
  onToggleCollapsed,
}: {
  columnKey: ExecutionTaskStatus;
  label: string;
  tasks: ExecutionTask[];
  onSelectTask: (task: ExecutionTask) => void;
  onMobileMove: (task: ExecutionTask, next: ExecutionTaskStatus) => void;
  onQuickDone?: (task: ExecutionTask) => void;
  highlightSeqGroup: string | null;
  // TODAY-column-specific. "warn" = >=5, "full" = >=8.
  pressureLevel?: "ok" | "warn" | "full";
  // True when this column rejects new drops (TODAY at cap).
  isFull?: boolean;
  // DONE column collapse toggle.
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
}) {
  const { isOver, setNodeRef } = useDroppable({ id: `col:${columnKey}` });

  // Border tone is driven by pressure level on TODAY, otherwise the default accent.
  const baseBorder =
    pressureLevel === "full"
      ? "rgba(239,68,68,0.55)"
      : pressureLevel === "warn"
        ? "rgba(251,146,60,0.45)"
        : "rgba(255,255,255,0.07)";
  const overBorder = isFull && isOver ? "rgba(239,68,68,0.85)" : ACCENT[columnKey];

  return (
    <div
      ref={setNodeRef}
      style={{
        flex: "0 0 280px",
        minWidth: 280,
        display: "flex",
        flexDirection: "column",
        borderRadius: 4,
        border: `1px solid ${isOver ? overBorder : baseBorder}`,
        background: isOver
          ? isFull
            ? "rgba(239,68,68,0.06)"
            : "rgba(255,255,255,0.04)"
          : "rgba(255,255,255,0.02)",
        transition: "border-color 120ms, background 120ms",
        overflow: "hidden",
      }}
      title={isFull ? "TODAY is full. Move something out first." : undefined}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "8px 12px",
          borderBottom: "1px solid rgba(255,255,255,0.07)",
          fontSize: 11,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: ACCENT[columnKey],
          fontFamily: "var(--font-mono, 'JetBrains Mono', monospace)",
          cursor: onToggleCollapsed ? "pointer" : "default",
        }}
        onClick={onToggleCollapsed}
      >
        <span>
          {onToggleCollapsed ? (collapsed ? "▸ " : "▾ ") : null}
          {label}
        </span>
        <span style={{ color: "rgba(220,230,240,0.55)" }}>{tasks.length}</span>
      </div>

      {collapsed ? null : (
        <div
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: "auto",
            padding: 8,
            display: "flex",
            flexDirection: "column",
            gap: 6,
          }}
        >
          {tasks.length === 0 ? (
            <div
              style={{
                fontSize: 11,
                color: "rgba(220,230,240,0.30)",
                padding: "8px 4px",
                fontStyle: "italic",
                lineHeight: 1.4,
              }}
            >
              {EMPTY_COPY[columnKey]}
            </div>
          ) : null}
          {tasks.map((task) => (
            <ExecutionCard
              key={task.id}
              task={task}
              onSelect={onSelectTask}
              onMobileMove={onMobileMove}
              onQuickDone={onQuickDone}
              highlight={
                highlightSeqGroup != null && task.sequence_group === highlightSeqGroup
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}
