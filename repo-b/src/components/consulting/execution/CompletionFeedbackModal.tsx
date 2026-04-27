"use client";

import { useState } from "react";
import { X } from "lucide-react";
import type { ExecutionTask, ExecutionTaskOutcome } from "@/lib/cro-api";

const OPTIONS: { value: ExecutionTaskOutcome; label: string; tone: "good" | "ok" | "bad" }[] = [
  { value: "moved_deal", label: "Moved a deal", tone: "good" },
  { value: "got_response", label: "Got a response", tone: "good" },
  { value: "no_effect", label: "No effect", tone: "ok" },
  { value: "blocked", label: "Hit a blocker", tone: "bad" },
];

const TONE_COLOR: Record<string, { color: string; border: string; bg: string }> = {
  good: { color: "rgba(52,211,153,0.95)", border: "rgba(52,211,153,0.40)", bg: "rgba(52,211,153,0.08)" },
  ok: { color: "rgba(220,230,240,0.78)", border: "rgba(255,255,255,0.10)", bg: "transparent" },
  bad: { color: "#FCA5A5", border: "rgba(239,68,68,0.40)", bg: "rgba(239,68,68,0.08)" },
};

export function CompletionFeedbackModal({
  task,
  onClose,
  onSubmit,
}: {
  task: ExecutionTask;
  onClose: () => void;
  onSubmit: (outcome: ExecutionTaskOutcome, note: string | null) => void | Promise<void>;
}) {
  const [outcome, setOutcome] = useState<ExecutionTaskOutcome | null>(null);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(value: ExecutionTaskOutcome) {
    setOutcome(value);
    setSubmitting(true);
    await onSubmit(value, note.trim() || null);
    setSubmitting(false);
  }

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 70 }}>
      <button
        type="button"
        aria-label="Skip feedback"
        onClick={onClose}
        style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.55)", border: 0 }}
      />
      <div
        role="dialog"
        aria-label="Feedback"
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          transform: "translate(-50%, -50%)",
          width: 440,
          maxWidth: "92vw",
          background: "#0A0E15",
          border: "1px solid rgba(255,255,255,0.10)",
          borderRadius: 6,
          padding: 18,
          color: "#dce6f0",
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span
            style={{
              fontSize: 12,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: "rgba(0,220,255,0.95)",
              fontFamily: "var(--font-mono, 'JetBrains Mono', monospace)",
            }}
          >
            Did this work?
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Skip"
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

        <div style={{ fontSize: 13, color: "rgba(220,230,240,0.85)" }}>
          {task.title}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          {OPTIONS.map((o) => {
            const tone = TONE_COLOR[o.tone];
            const active = outcome === o.value;
            return (
              <button
                key={o.value}
                type="button"
                onClick={() => submit(o.value)}
                disabled={submitting}
                style={{
                  padding: "10px 12px",
                  borderRadius: 3,
                  border: `1px solid ${active ? tone.color : tone.border}`,
                  background: active ? tone.bg : "transparent",
                  color: tone.color,
                  fontSize: 11,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  cursor: submitting ? "not-allowed" : "pointer",
                  fontFamily: "var(--font-mono, 'JetBrains Mono', monospace)",
                  textAlign: "left",
                }}
              >
                {o.label}
              </button>
            );
          })}
        </div>

        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Optional note — what came back?"
          rows={2}
          style={{
            padding: "8px 10px",
            borderRadius: 3,
            border: "1px solid rgba(255,255,255,0.10)",
            background: "rgba(255,255,255,0.03)",
            color: "#dce6f0",
            fontSize: 12,
            resize: "vertical",
            fontFamily: "inherit",
          }}
        />

        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: "6px 12px",
              fontSize: 11,
              borderRadius: 3,
              border: "1px solid rgba(255,255,255,0.10)",
              background: "transparent",
              color: "rgba(220,230,240,0.55)",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              cursor: "pointer",
              fontFamily: "var(--font-mono, 'JetBrains Mono', monospace)",
            }}
          >
            Skip
          </button>
        </div>
      </div>
    </div>
  );
}
