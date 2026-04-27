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

export function ExecutionColumn({
  columnKey,
  label,
  tasks,
  onSelectTask,
  onMobileMove,
  highlightSeqGroup,
}: {
  columnKey: ExecutionTaskStatus;
  label: string;
  tasks: ExecutionTask[];
  onSelectTask: (task: ExecutionTask) => void;
  onMobileMove: (task: ExecutionTask, next: ExecutionTaskStatus) => void;
  highlightSeqGroup: string | null;
}) {
  const { isOver, setNodeRef } = useDroppable({ id: `col:${columnKey}` });

  return (
    <div
      ref={setNodeRef}
      style={{
        flex: "0 0 280px",
        minWidth: 280,
        display: "flex",
        flexDirection: "column",
        borderRadius: 4,
        border: `1px solid ${isOver ? ACCENT[columnKey] : "rgba(255,255,255,0.07)"}`,
        background: isOver ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.02)",
        transition: "border-color 120ms, background 120ms",
        overflow: "hidden",
      }}
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
        }}
      >
        <span>{label}</span>
        <span style={{ color: "rgba(220,230,240,0.55)" }}>{tasks.length}</span>
      </div>

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
            }}
          >
            No actions
          </div>
        ) : null}
        {tasks.map((task) => (
          <ExecutionCard
            key={task.id}
            task={task}
            onSelect={onSelectTask}
            onMobileMove={onMobileMove}
            highlight={
              highlightSeqGroup != null && task.sequence_group === highlightSeqGroup
            }
          />
        ))}
      </div>
    </div>
  );
}
