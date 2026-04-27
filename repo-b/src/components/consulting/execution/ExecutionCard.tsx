"use client";

import { useState } from "react";
import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import type {
  ExecutionTask,
  ExecutionTaskStatus,
  ExecutionAutoSource,
} from "@/lib/cro-api";

const TYPE_LABEL: Record<string, string> = {
  outreach: "Outreach",
  follow_up: "Follow-up",
  proof_asset: "Proof",
  research: "Research",
  product: "Product",
};

const TYPE_COLOR: Record<string, string> = {
  outreach: "rgba(0,220,255,0.85)",
  follow_up: "rgba(251,146,60,0.85)",
  proof_asset: "rgba(167,139,250,0.85)",
  research: "rgba(251,191,36,0.85)",
  product: "rgba(52,211,153,0.85)",
};

const REVENUE_GLYPH: Record<string, string> = {
  high: "$$$",
  mid: "$$",
  low: "$",
};

const AUTO_LABEL: Record<ExecutionAutoSource, string> = {
  pipeline_no_next_action: "auto: no next move",
  pipeline_stale_3d: "auto: stale 3d",
  outreach_no_reply_2d: "auto: no reply 2d",
  proof_backlog_top: "auto: backlog top",
  manual: "",
  ai_generated: "ai",
};

const STATUS_OPTIONS: { value: ExecutionTaskStatus; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "this_week", label: "This Week" },
  { value: "waiting", label: "Waiting" },
  { value: "done", label: "Done" },
];

function dueLabel(due: string | null): { text: string; tone: "over" | "today" | "later" | "none" } {
  if (!due) return { text: "no due date", tone: "none" };
  const d = new Date(due);
  d.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((d.getTime() - today.getTime()) / 86_400_000);
  if (diff < 0) return { text: `${-diff}d overdue`, tone: "over" };
  if (diff === 0) return { text: "today", tone: "today" };
  if (diff === 1) return { text: "tomorrow", tone: "later" };
  return { text: `in ${diff}d`, tone: "later" };
}

const DUE_TONE: Record<string, { color: string; bg: string; border: string }> = {
  over: { color: "#FCA5A5", bg: "rgba(239,68,68,0.10)", border: "rgba(239,68,68,0.40)" },
  today: { color: "rgba(0,220,255,0.95)", bg: "rgba(0,220,255,0.08)", border: "rgba(0,220,255,0.30)" },
  later: { color: "rgba(220,230,240,0.72)", bg: "transparent", border: "rgba(255,255,255,0.10)" },
  none: { color: "rgba(251,191,36,0.85)", bg: "rgba(251,191,36,0.08)", border: "rgba(251,191,36,0.30)" },
};

export function ExecutionCard({
  task,
  onSelect,
  onMobileMove,
  highlight,
}: {
  task: ExecutionTask;
  onSelect: (task: ExecutionTask) => void;
  onMobileMove: (task: ExecutionTask, next: ExecutionTaskStatus) => void;
  highlight: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: task.id,
  });
  const [moveOpen, setMoveOpen] = useState(false);

  const due = dueLabel(task.due_date);
  const dueTone = DUE_TONE[due.tone];
  const typeColor = TYPE_COLOR[task.type] || "rgba(220,230,240,0.72)";
  const autoText = task.auto_source ? AUTO_LABEL[task.auto_source] : "";

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Translate.toString(transform),
        opacity: isDragging ? 0.5 : 1,
        cursor: "grab",
        borderRadius: 4,
        border: `1px solid ${highlight ? "rgba(0,220,255,0.55)" : "rgba(255,255,255,0.08)"}`,
        background: highlight ? "rgba(0,220,255,0.05)" : "rgba(255,255,255,0.025)",
        padding: 10,
        fontSize: 12,
        color: "#dce6f0",
        display: "flex",
        flexDirection: "column",
        gap: 6,
      }}
      {...attributes}
      {...listeners}
      onClick={(e) => {
        // dnd-kit's draggable swallows clicks via listeners — guard so a tap
        // without drag still opens the drawer.
        if (isDragging) return;
        e.stopPropagation();
        onSelect(task);
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 6 }}>
        <span
          style={{
            fontSize: 9,
            letterSpacing: "0.10em",
            textTransform: "uppercase",
            padding: "2px 6px",
            borderRadius: 2,
            border: `1px solid ${typeColor}`,
            color: typeColor,
            fontFamily: "var(--font-mono, 'JetBrains Mono', monospace)",
          }}
        >
          {TYPE_LABEL[task.type] || task.type}
        </span>
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: "rgba(52,211,153,0.85)",
            fontFamily: "var(--font-mono, 'JetBrains Mono', monospace)",
          }}
        >
          {REVENUE_GLYPH[task.revenue_tag]}
        </span>
        <ImpactDots value={task.impact} />
        <span style={{ flex: 1 }} />
        {task.sequence_position && task.sequence_group ? (
          <span
            style={{
              fontSize: 9,
              color: "rgba(167,139,250,0.85)",
              fontFamily: "var(--font-mono, 'JetBrains Mono', monospace)",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            Step {task.sequence_position}
          </span>
        ) : null}
      </div>

      <div style={{ fontWeight: 600, lineHeight: 1.3 }}>{task.title}</div>

      <div
        style={{
          fontSize: 11,
          color: "rgba(0,220,255,0.92)",
          lineHeight: 1.35,
          paddingLeft: 6,
          borderLeft: "2px solid rgba(0,220,255,0.45)",
        }}
      >
        → {task.next_action}
      </div>

      <div
        style={{
          fontSize: 10.5,
          fontStyle: "italic",
          color: "rgba(220,230,240,0.55)",
          lineHeight: 1.3,
        }}
      >
        Why: {task.why_now}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        <span
          style={{
            fontSize: 10,
            padding: "2px 6px",
            borderRadius: 2,
            border: `1px solid ${dueTone.border}`,
            background: dueTone.bg,
            color: dueTone.color,
            fontFamily: "var(--font-mono, 'JetBrains Mono', monospace)",
          }}
        >
          {due.text}
        </span>
        {task.deal_name ? (
          <span
            style={{
              fontSize: 10,
              padding: "2px 6px",
              borderRadius: 2,
              border: "1px solid rgba(255,255,255,0.10)",
              color: "rgba(220,230,240,0.72)",
            }}
          >
            ◆ {task.deal_name}
          </span>
        ) : null}
        {autoText ? (
          <span
            style={{
              fontSize: 9,
              padding: "2px 6px",
              borderRadius: 2,
              color: "rgba(251,146,60,0.85)",
              border: "1px solid rgba(251,146,60,0.30)",
              fontFamily: "var(--font-mono, 'JetBrains Mono', monospace)",
              letterSpacing: "0.04em",
              textTransform: "lowercase",
            }}
          >
            {autoText}
          </span>
        ) : null}
        <span style={{ flex: 1 }} />
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            setMoveOpen((v) => !v);
          }}
          style={{
            fontSize: 9,
            padding: "2px 6px",
            borderRadius: 2,
            border: "1px solid rgba(255,255,255,0.10)",
            background: "transparent",
            color: "rgba(220,230,240,0.55)",
            cursor: "pointer",
            fontFamily: "var(--font-mono, 'JetBrains Mono', monospace)",
            letterSpacing: "0.06em",
            textTransform: "uppercase",
          }}
        >
          Move
        </button>
      </div>

      {moveOpen ? (
        <div
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          style={{
            display: "flex",
            gap: 4,
            flexWrap: "wrap",
            paddingTop: 4,
            borderTop: "1px solid rgba(255,255,255,0.06)",
          }}
        >
          {STATUS_OPTIONS.filter((o) => o.value !== task.status).map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setMoveOpen(false);
                onMobileMove(task, o.value);
              }}
              style={{
                fontSize: 10,
                padding: "3px 8px",
                borderRadius: 2,
                border: "1px solid rgba(255,255,255,0.10)",
                background: "transparent",
                color: "rgba(220,230,240,0.72)",
                cursor: "pointer",
                fontFamily: "var(--font-mono, 'JetBrains Mono', monospace)",
              }}
            >
              {o.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ImpactDots({ value }: { value: number }) {
  const v = Math.max(1, Math.min(5, value));
  return (
    <span
      style={{
        display: "inline-flex",
        gap: 2,
        alignItems: "center",
      }}
    >
      {Array.from({ length: 5 }).map((_, i) => (
        <span
          key={i}
          style={{
            width: 5,
            height: 5,
            borderRadius: "50%",
            background: i < v ? "rgba(220,230,240,0.85)" : "rgba(220,230,240,0.18)",
          }}
        />
      ))}
    </span>
  );
}
