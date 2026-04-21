"use client";

import { useEffect, useRef, useState } from "react";
import { createNextAction } from "@/lib/cro-api";
import { Button, Caps, fmtUSDK } from "@/components/operator/command-desk";

type QuickCreateNextActionProps = {
  envId: string;
  businessId: string;
  card: {
    crm_opportunity_id: string;
    account_name: string | null;
    stage_key: string | null;
    amount: number | null;
  };
  onClose: () => void;
  onSaved: (payload: {
    description: string;
    action_type: string;
    due_date: string;
  }) => void;
};

const ACTION_TYPES = [
  "email",
  "call",
  "meeting",
  "research",
  "follow_up",
  "proposal",
  "linkedin",
  "task",
] as const;
type ActionType = (typeof ACTION_TYPES)[number];

function defaultActionType(stageKey: string | null): ActionType {
  switch (stageKey) {
    case "contacted":
    case "outreach":
      return "email";
    case "engaged":
      return "call";
    case "meeting":
    case "qualified":
      return "meeting";
    case "proposal":
      return "follow_up";
    default:
      return "task";
  }
}

function defaultPlaceholder(type: ActionType): string {
  switch (type) {
    case "email": return "Send intro email";
    case "call": return "Book intro call";
    case "meeting": return "Schedule discovery meeting";
    case "research": return "Research account signals";
    case "follow_up": return "Follow up on proposal";
    case "proposal": return "Draft proposal";
    case "linkedin": return "LinkedIn outreach";
    default: return "Define next action";
  }
}

function addDays(iso: string, days: number): string {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function defaultDue(stageKey: string | null): string {
  const t = todayISO();
  switch (stageKey) {
    case "proposal":
      return addDays(t, 3);
    case "engaged":
    case "meeting":
      return addDays(t, 1);
    default:
      return t;
  }
}

export function QuickCreateNextAction({
  envId,
  businessId,
  card,
  onClose,
  onSaved,
}: QuickCreateNextActionProps) {
  const [actionType, setActionType] = useState<ActionType>(defaultActionType(card.stage_key));
  const [description, setDescription] = useState("");
  const [due, setDue] = useState<string>(defaultDue(card.stage_key));
  const [priority, setPriority] = useState<"low" | "normal" | "high" | "urgent">("normal");
  const [advanced, setAdvanced] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const descRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    descRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function save() {
    if (saving) return;
    setSaving(true);
    setError(null);
    const resolvedDue = due || defaultDue(card.stage_key);
    const resolvedDesc = description.trim() || defaultPlaceholder(actionType);
    try {
      await createNextAction({
        env_id: envId,
        business_id: businessId,
        entity_type: "opportunity",
        entity_id: card.crm_opportunity_id,
        action_type: actionType,
        description: resolvedDesc,
        due_date: resolvedDue,
        priority,
      });
      onSaved({
        description: resolvedDesc,
        action_type: actionType,
        due_date: resolvedDue,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save action — try again");
      setSaving(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={(e) => e.stopPropagation()}
      style={{
        position: "absolute",
        top: 0,
        right: 0,
        width: 320,
        maxHeight: "90vh",
        overflow: "auto",
        background: "var(--bg-panel)",
        border: "1px solid var(--line-3)",
        borderRadius: 3,
        boxShadow: "-12px 0 32px rgba(0,0,0,.55)",
        zIndex: 60,
        fontFamily: "var(--font-sans)",
      }}
    >
      <div style={{ height: 2, background: "linear-gradient(90deg, var(--sem-error), transparent)" }} />
      <div
        style={{
          padding: "10px 12px",
          borderBottom: "1px solid var(--line-2)",
          background: "var(--bg-panel-2)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
        }}
      >
        <div style={{ minWidth: 0 }}>
          <Caps color="var(--sem-error)">DEFINE NEXT ACTION</Caps>
          <div
            style={{
              fontFamily: "var(--font-sans)",
              fontSize: 13,
              color: "var(--fg-1)",
              fontWeight: 600,
              marginTop: 2,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {card.account_name ?? "Deal"}
          </div>
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              color: "var(--fg-3)",
              marginTop: 1,
            }}
          >
            {card.stage_key ?? "—"} · {card.amount ? fmtUSDK(card.amount) : "—"}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          style={{
            background: "transparent",
            border: 0,
            color: "var(--fg-3)",
            fontSize: 16,
            cursor: "pointer",
            padding: "0 4px",
          }}
        >
          ×
        </button>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
        style={{ padding: 12, display: "flex", flexDirection: "column", gap: 10 }}
      >
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <Caps>ACTION TYPE</Caps>
          <select
            value={actionType}
            onChange={(e) => setActionType(e.target.value as ActionType)}
            style={{
              background: "var(--bg-inset)",
              border: "1px solid var(--line-2)",
              borderRadius: 3,
              color: "var(--fg-1)",
              fontFamily: "var(--font-mono)",
              fontSize: 12,
              padding: "6px 8px",
              height: 28,
            }}
          >
            {ACTION_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <Caps>DESCRIPTION</Caps>
          <input
            ref={descRef}
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={defaultPlaceholder(actionType)}
            style={{
              background: "var(--bg-inset)",
              border: "1px solid var(--line-2)",
              borderRadius: 3,
              color: "var(--fg-1)",
              fontFamily: "var(--font-sans)",
              fontSize: 13,
              padding: "6px 8px",
              height: 28,
            }}
          />
        </label>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <Caps>DUE</Caps>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <button
              type="button"
              onClick={() => setDue(todayISO())}
              style={quickDueBtn(due === todayISO())}
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => setDue(addDays(todayISO(), 1))}
              style={quickDueBtn(due === addDays(todayISO(), 1))}
            >
              Tomorrow
            </button>
            <input
              type="date"
              value={due}
              onChange={(e) => setDue(e.target.value)}
              style={{
                flex: 1,
                background: "var(--bg-inset)",
                border: "1px solid var(--line-2)",
                borderRadius: 3,
                color: "var(--fg-1)",
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                padding: "4px 6px",
                height: 28,
              }}
            />
          </div>
        </div>
        {advanced ? (
          <>
            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <Caps>PRIORITY</Caps>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as typeof priority)}
                style={{
                  background: "var(--bg-inset)",
                  border: "1px solid var(--line-2)",
                  borderRadius: 3,
                  color: "var(--fg-1)",
                  fontFamily: "var(--font-mono)",
                  fontSize: 12,
                  padding: "6px 8px",
                  height: 28,
                }}
              >
                <option value="low">low</option>
                <option value="normal">normal</option>
                <option value="high">high</option>
                <option value="urgent">urgent</option>
              </select>
            </label>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setAdvanced(true)}
            style={{
              background: "transparent",
              border: 0,
              color: "var(--fg-3)",
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              letterSpacing: ".08em",
              textTransform: "uppercase",
              cursor: "pointer",
              textAlign: "left",
              padding: 0,
            }}
          >
            + advanced
          </button>
        )}
        {error && (
          <div
            style={{
              color: "var(--sem-down)",
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              padding: "4px 6px",
              border: "1px solid var(--sem-down)",
              borderRadius: 2,
            }}
          >
            {error}
          </div>
        )}
        <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
          <Button kind="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button kind="primary" size="sm" type="submit" disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </form>
    </div>
  );
}

function quickDueBtn(active: boolean) {
  return {
    background: active ? "rgba(0,229,255,.08)" : "var(--bg-inset)",
    border: `1px solid ${active ? "var(--neon-cyan)" : "var(--line-2)"}`,
    color: active ? "var(--neon-cyan)" : "var(--fg-2)",
    fontFamily: "var(--font-mono)" as const,
    fontSize: 10,
    letterSpacing: ".08em",
    textTransform: "uppercase" as const,
    padding: "4px 8px",
    borderRadius: 2,
    cursor: "pointer",
    height: 22,
  };
}
