"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import {
  updateExecutionTask,
  deleteExecutionTask,
  type ExecutionTask,
  type ExecutionTaskStatus,
  type ExecutionTaskType,
  type ExecutionRevenueTag,
  type ExecutionTaskUpdate,
} from "@/lib/cro-api";

const TYPES: ExecutionTaskType[] = [
  "outreach",
  "follow_up",
  "proof_asset",
  "research",
  "product",
];

const STATUSES: ExecutionTaskStatus[] = ["today", "this_week", "waiting", "done"];

const REVENUE: ExecutionRevenueTag[] = ["high", "mid", "low"];

export function ExecutionTaskDrawer({
  task,
  envId,
  businessId,
  onClose,
  onUpdated,
  onDeleted,
}: {
  task: ExecutionTask;
  envId: string;
  businessId: string;
  onClose: () => void;
  onUpdated: (taskId: string) => void;
  onDeleted: () => void;
}) {
  void envId;
  void businessId;
  const [title, setTitle] = useState(task.title);
  const [nextAction, setNextAction] = useState(task.next_action);
  const [whyNow, setWhyNow] = useState(task.why_now);
  const [description, setDescription] = useState(task.description ?? "");
  const [expectedOutcome, setExpectedOutcome] = useState(task.expected_outcome ?? "");
  const [type, setType] = useState<ExecutionTaskType>(task.type);
  const [status, setStatus] = useState<ExecutionTaskStatus>(task.status);
  const [impact, setImpact] = useState(task.impact);
  const [revenueTag, setRevenueTag] = useState<ExecutionRevenueTag>(task.revenue_tag);
  const [dueDate, setDueDate] = useState(task.due_date ?? "");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setTitle(task.title);
    setNextAction(task.next_action);
    setWhyNow(task.why_now);
    setDescription(task.description ?? "");
    setExpectedOutcome(task.expected_outcome ?? "");
    setType(task.type);
    setStatus(task.status);
    setImpact(task.impact);
    setRevenueTag(task.revenue_tag);
    setDueDate(task.due_date ?? "");
  }, [task.id, task.title, task.next_action, task.why_now, task.description, task.expected_outcome, task.type, task.status, task.impact, task.revenue_tag, task.due_date]);

  const canSave =
    title.trim().length > 0 &&
    nextAction.trim().length > 0 &&
    whyNow.trim().length > 0 &&
    !saving;

  async function save() {
    if (!canSave) return;
    setSaving(true);
    setErr(null);
    try {
      const body: ExecutionTaskUpdate = {
        title: title.trim(),
        next_action: nextAction.trim(),
        why_now: whyNow.trim(),
        description: description.trim() || null,
        expected_outcome: expectedOutcome.trim() || null,
        type,
        status,
        impact,
        revenue_tag: revenueTag,
        due_date: dueDate || null,
      };
      await updateExecutionTask(task.id, body);
      onUpdated(task.id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function destroy() {
    if (!confirm("Delete this task?")) return;
    setSaving(true);
    try {
      await deleteExecutionTask(task.id);
      onDeleted();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Delete failed");
      setSaving(false);
    }
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 50,
      }}
    >
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        style={{
          position: "absolute",
          inset: 0,
          background: "rgba(0,0,0,0.55)",
          border: 0,
        }}
      />
      <div
        role="dialog"
        aria-label="Edit task"
        style={{
          position: "absolute",
          right: 0,
          top: 0,
          bottom: 0,
          width: 480,
          maxWidth: "92vw",
          background: "#0A0E15",
          borderLeft: "1px solid rgba(255,255,255,0.10)",
          color: "#dce6f0",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "12px 16px",
            borderBottom: "1px solid rgba(255,255,255,0.07)",
          }}
        >
          <span
            style={{
              fontSize: 12,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: "rgba(220,230,240,0.72)",
              fontFamily: "var(--font-mono, 'JetBrains Mono', monospace)",
            }}
          >
            Edit task
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              border: "1px solid rgba(255,255,255,0.10)",
              background: "transparent",
              color: "rgba(220,230,240,0.72)",
              borderRadius: 3,
              width: 28,
              height: 28,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
            }}
          >
            <X size={14} />
          </button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
          <Field label="Title" required>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              style={inputStyle}
            />
          </Field>

          <Field label="Next action" required hint="One concrete move. The card lives or dies on this.">
            <textarea
              value={nextAction}
              onChange={(e) => setNextAction(e.target.value)}
              rows={2}
              style={textareaStyle}
            />
          </Field>

          <Field label="Why now" required hint="What makes this urgent — not what the task is.">
            <textarea
              value={whyNow}
              onChange={(e) => setWhyNow(e.target.value)}
              rows={2}
              style={textareaStyle}
            />
          </Field>

          <Field label="Expected outcome">
            <textarea
              value={expectedOutcome}
              onChange={(e) => setExpectedOutcome(e.target.value)}
              rows={2}
              style={textareaStyle}
            />
          </Field>

          <Field label="Description">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              style={textareaStyle}
            />
          </Field>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="Type">
              <select value={type} onChange={(e) => setType(e.target.value as ExecutionTaskType)} style={inputStyle}>
                {TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </Field>
            <Field label="Status">
              <select value={status} onChange={(e) => setStatus(e.target.value as ExecutionTaskStatus)} style={inputStyle}>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </Field>
            <Field label="Impact (1–5)">
              <input
                type="number"
                min={1}
                max={5}
                value={impact}
                onChange={(e) => setImpact(Math.max(1, Math.min(5, parseInt(e.target.value || "3", 10))))}
                style={inputStyle}
              />
            </Field>
            <Field label="Revenue">
              <select value={revenueTag} onChange={(e) => setRevenueTag(e.target.value as ExecutionRevenueTag)} style={inputStyle}>
                {REVENUE.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </Field>
            <Field label="Due date">
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                style={inputStyle}
              />
            </Field>
          </div>

          {task.linked_deal_id && task.deal_name ? (
            <div style={{ fontSize: 11, color: "rgba(220,230,240,0.55)" }}>
              Linked to deal: <span style={{ color: "rgba(220,230,240,0.85)" }}>{task.deal_name}</span>
            </div>
          ) : null}

          {err ? (
            <div
              style={{
                padding: "6px 10px",
                fontSize: 12,
                borderRadius: 3,
                border: "1px solid rgba(239,68,68,0.30)",
                background: "rgba(239,68,68,0.08)",
                color: "#FCA5A5",
              }}
            >
              {err}
            </div>
          ) : null}
        </div>

        <div
          style={{
            display: "flex",
            gap: 8,
            padding: 12,
            borderTop: "1px solid rgba(255,255,255,0.07)",
          }}
        >
          <button
            type="button"
            onClick={destroy}
            disabled={saving}
            style={{
              padding: "8px 12px",
              fontSize: 11,
              borderRadius: 3,
              border: "1px solid rgba(239,68,68,0.30)",
              background: "transparent",
              color: "#FCA5A5",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              cursor: "pointer",
              fontFamily: "var(--font-mono, 'JetBrains Mono', monospace)",
            }}
          >
            Delete
          </button>
          <span style={{ flex: 1 }} />
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: "8px 12px",
              fontSize: 11,
              borderRadius: 3,
              border: "1px solid rgba(255,255,255,0.10)",
              background: "transparent",
              color: "rgba(220,230,240,0.72)",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              cursor: "pointer",
              fontFamily: "var(--font-mono, 'JetBrains Mono', monospace)",
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={!canSave}
            style={{
              padding: "8px 14px",
              fontSize: 11,
              borderRadius: 3,
              border: "1px solid rgba(0,220,255,0.40)",
              background: canSave ? "rgba(0,220,255,0.10)" : "rgba(255,255,255,0.04)",
              color: canSave ? "rgba(0,220,255,0.95)" : "rgba(220,230,240,0.40)",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              cursor: canSave ? "pointer" : "not-allowed",
              fontFamily: "var(--font-mono, 'JetBrains Mono', monospace)",
            }}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span
        style={{
          fontSize: 10,
          letterSpacing: "0.10em",
          textTransform: "uppercase",
          color: "rgba(220,230,240,0.55)",
          fontFamily: "var(--font-mono, 'JetBrains Mono', monospace)",
        }}
      >
        {label}{required ? <span style={{ color: "#FCA5A5" }}> *</span> : null}
      </span>
      {children}
      {hint ? (
        <span style={{ fontSize: 10, color: "rgba(220,230,240,0.40)" }}>{hint}</span>
      ) : null}
    </label>
  );
}

const inputStyle: React.CSSProperties = {
  padding: "8px 10px",
  borderRadius: 3,
  border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(255,255,255,0.03)",
  color: "#dce6f0",
  fontSize: 13,
  outline: "none",
};

const textareaStyle: React.CSSProperties = {
  ...inputStyle,
  resize: "vertical",
  fontFamily: "inherit",
  lineHeight: 1.4,
};
