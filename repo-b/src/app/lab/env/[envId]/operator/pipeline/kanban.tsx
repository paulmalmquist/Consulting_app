"use client";

import { useMemo, useState } from "react";
import { Badge, Caps, fmtUSD, fmtUSDK } from "@/components/operator/command-desk";
import type { ExecutionBoardColumn, ExecutionCard } from "@/lib/cro-api";

type KanbanProps = {
  columns: ExecutionBoardColumn[];
  selectedCardId: string | null;
  onSelectCard: (card: ExecutionCard) => void;
  onDefineNextAction: (card: ExecutionCard) => void;
  view: "stage" | "action";
};

const STAGE_ACCENT: Record<string, string> = {
  target_identified: "var(--fg-3)",
  outreach: "var(--neon-cyan)",
  engaged: "var(--neon-cyan)",
  discovery_scheduled: "var(--neon-cyan)",
  demo_completed: "var(--neon-violet)",
  proposal: "var(--neon-amber)",
  closed_won: "var(--sem-up)",
  closed_lost: "var(--sem-down)",
  today: "var(--neon-cyan)",
  overdue: "var(--sem-error)",
  this_week: "var(--neon-amber)",
  waiting: "var(--neon-violet)",
  blocked: "var(--fg-3)",
};

const ACTION_TYPE_GLYPH: Record<string, string> = {
  email: "✉",
  call: "☏",
  meeting: "◆",
  research: "?",
  follow_up: "↻",
  proposal: "§",
  linkedin: "in",
  task: "·",
};

function relActivity(iso: string | null): string {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  const now = Date.now();
  const mins = Math.max(1, Math.round((now - then) / 60_000));
  if (mins < 60) return `${mins}m`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.round(hrs / 24);
  return `${days}d`;
}

function dueLabel(due: string | null): { text: string; tone: "over" | "today" | "later" | "none" } {
  if (!due) return { text: "—", tone: "none" };
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(due);
  d.setHours(0, 0, 0, 0);
  const diff = Math.round((d.getTime() - today.getTime()) / 86_400_000);
  if (diff < 0) return { text: `${-diff}d overdue`, tone: "over" };
  if (diff === 0) return { text: "Today", tone: "today" };
  if (diff === 1) return { text: "Tomorrow", tone: "later" };
  return { text: `in ${diff}d`, tone: "later" };
}

export function PipelineKanban({
  columns,
  selectedCardId,
  onSelectCard,
  onDefineNextAction,
  view,
}: KanbanProps) {
  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        overflowX: "auto",
        overflowY: "hidden",
        display: "flex",
        gap: 2,
        padding: 2,
        background: "var(--bg-base)",
      }}
    >
      {columns.map((col) => (
        <KanbanColumn
          key={col.execution_column_key}
          column={col}
          selectedCardId={selectedCardId}
          onSelectCard={onSelectCard}
          onDefineNextAction={onDefineNextAction}
          view={view}
        />
      ))}
    </div>
  );
}

function KanbanColumn({
  column,
  selectedCardId,
  onSelectCard,
  onDefineNextAction,
  view,
}: {
  column: ExecutionBoardColumn;
  selectedCardId: string | null;
  onSelectCard: (card: ExecutionCard) => void;
  onDefineNextAction: (card: ExecutionCard) => void;
  view: "stage" | "action";
}) {
  const accent = STAGE_ACCENT[column.execution_column_key] ?? "var(--fg-3)";
  const count = column.cards.length;
  const valueSum = column.cards.reduce((s, c) => s + (c.amount || 0), 0);

  return (
    <div
      style={{
        flex: "none",
        width: 240,
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        background: "var(--bg-panel)",
        border: "1px solid var(--line-2)",
        borderRadius: 3,
        overflow: "hidden",
      }}
    >
      <div style={{ height: 2, background: `linear-gradient(90deg, ${accent}, transparent)` }} />
      <div
        style={{
          padding: "8px 10px",
          background: "var(--bg-panel-2)",
          borderBottom: "1px solid var(--line-2)",
          display: "flex",
          flexDirection: "column",
          gap: 2,
          flex: "none",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <Caps color={accent}>{column.execution_column_label}</Caps>
          <span
            style={{
              fontSize: 10,
              padding: "1px 6px",
              borderRadius: 2,
              background: count > 0 ? accent : "var(--bg-inset)",
              color: count > 0 ? "var(--bg-void)" : "var(--fg-3)",
              border: `1px solid ${count > 0 ? accent : "var(--line-2)"}`,
              fontWeight: 600,
              fontFamily: "var(--font-mono)",
            }}
          >
            {count}
          </span>
        </div>
        {valueSum > 0 && (
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              color: "var(--fg-3)",
              letterSpacing: ".04em",
            }}
          >
            {fmtUSDK(valueSum)}
          </span>
        )}
      </div>
      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          padding: 4,
          display: "flex",
          flexDirection: "column",
          gap: 4,
        }}
      >
        {column.cards.length === 0 ? (
          <div
            style={{
              padding: 12,
              color: "var(--fg-3)",
              fontSize: 11,
              textAlign: "center",
              fontFamily: "var(--font-mono)",
            }}
          >
            {view === "action" ? "—" : "no deals"}
          </div>
        ) : (
          column.cards.map((card) => (
            <DealCard
              key={card.crm_opportunity_id}
              card={card}
              active={selectedCardId === card.crm_opportunity_id}
              onSelect={() => onSelectCard(card)}
              onDefineNextAction={() => onDefineNextAction(card)}
            />
          ))
        )}
      </div>
    </div>
  );
}

function DealCard({
  card,
  active,
  onSelect,
  onDefineNextAction,
}: {
  card: ExecutionCard;
  active: boolean;
  onSelect: () => void;
  onDefineNextAction: () => void;
}) {
  const [hover, setHover] = useState(false);
  const hasNoAction = !card.next_action_description;
  // Missing next action is a soft signal — only true critical pressure paints red.
  const isCritical = card.execution_pressure === "critical";
  const due = dueLabel(card.next_action_due);

  return (
    <div
      onClick={onSelect}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      tabIndex={0}
      style={{
        background: active ? "var(--bg-row-active)" : hover ? "var(--bg-row-hover)" : "var(--bg-inset)",
        border: `1px solid ${active ? "var(--neon-cyan)" : "var(--line-2)"}`,
        borderLeft: isCritical
          ? "2px solid var(--sem-error)"
          : active
          ? "2px solid var(--neon-cyan)"
          : "2px solid transparent",
        borderRadius: 3,
        padding: "7px 8px 8px",
        cursor: "pointer",
        fontFamily: "var(--font-sans)",
        fontSize: 11,
        boxShadow: "none",
        display: "flex",
        flexDirection: "column",
        gap: 3,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 6 }}>
        <span
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: "var(--fg-1)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            flex: 1,
            minWidth: 0,
          }}
        >
          {card.account_name ?? "Unknown"}
        </span>
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            color: "var(--fg-1)",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {card.amount ? fmtUSDK(card.amount) : "—"}
        </span>
      </div>
      {card.name && card.name !== card.account_name && (
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            color: "var(--fg-3)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {card.name}
        </div>
      )}
      {hasNoAction ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDefineNextAction();
          }}
          style={{
            background: "transparent",
            border: "1px solid var(--line-2)",
            borderRadius: 2,
            padding: "3px 6px",
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            letterSpacing: ".06em",
            color: "var(--fg-3)",
            cursor: "pointer",
            textAlign: "left",
          }}
        >
          + Action
        </button>
      ) : (
        <>
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              color: "var(--fg-1)",
              display: "flex",
              gap: 4,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            <span style={{ color: "var(--fg-3)" }}>NEXT:</span>
            <span style={{ color: "var(--neon-cyan)" }}>
              {card.next_action_type ? ACTION_TYPE_GLYPH[card.next_action_type] ?? "·" : "·"}{" "}
              {card.next_action_description}
            </span>
          </div>
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              display: "flex",
              justifyContent: "space-between",
              color: "var(--fg-3)",
            }}
          >
            <span>
              <span style={{ color: "var(--fg-3)" }}>DUE:</span>{" "}
              <span
                style={{
                  color:
                    due.tone === "over"
                      ? "var(--sem-down)"
                      : due.tone === "today"
                      ? "var(--neon-cyan)"
                      : "var(--fg-2)",
                }}
              >
                {due.text}
              </span>
              {card.next_action_type && (
                <>
                  <span style={{ color: "var(--line-3)" }}> · </span>
                  <span style={{ color: "var(--fg-2)" }}>
                    {card.next_action_type.toUpperCase()}
                  </span>
                </>
              )}
            </span>
            <span style={{ color: "var(--fg-2)" }}>· {relActivity(card.last_activity_at)}</span>
          </div>
        </>
      )}
      {card.risk_flags.length > 0 && !hasNoAction && (
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 2 }}>
          {card.risk_flags.slice(0, 2).map((f) => (
            <Badge key={f} tone={f.includes("stalled") ? "error" : "warn"} size="sm">
              {f.replaceAll("_", " ")}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
