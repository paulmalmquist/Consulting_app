"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { generateExecutionActions } from "@/lib/cro-api";

type DealOption = {
  crm_opportunity_id: string;
  name: string;
  account_name: string | null;
};

export function GenerateActionsModal({
  envId,
  businessId,
  defaultDealId,
  onClose,
  onGenerated,
}: {
  envId: string;
  businessId: string;
  defaultDealId?: string;
  onClose: () => void;
  onGenerated: (sequenceGroup: string) => void;
}) {
  const [mode, setMode] = useState<"deal" | "goal">(defaultDealId ? "deal" : "deal");
  const [dealId, setDealId] = useState(defaultDealId ?? "");
  const [goalText, setGoalText] = useState("");
  const [deals, setDeals] = useState<DealOption[]>([]);
  const [running, setRunning] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<{ columns: { cards: DealOption[] }[] }>(
      `/bos/api/consulting/pipeline/kanban?env_id=${encodeURIComponent(envId)}&business_id=${encodeURIComponent(businessId)}`,
    )
      .then((res) => {
        const all: DealOption[] = [];
        for (const col of res.columns || []) {
          for (const c of col.cards || []) {
            all.push({
              crm_opportunity_id: c.crm_opportunity_id,
              name: c.name,
              account_name: c.account_name,
            });
          }
        }
        setDeals(all);
      })
      .catch(() => {
        // non-fatal — user can use Goal mode
      });
  }, [envId, businessId]);

  async function run() {
    setErr(null);
    if (mode === "deal" && !dealId) {
      setErr("Pick a deal or switch to Goal.");
      return;
    }
    if (mode === "goal" && goalText.trim().length < 4) {
      setErr("Describe the goal in at least a few words.");
      return;
    }
    setRunning(true);
    try {
      const res = await generateExecutionActions({
        env_id: envId,
        business_id: businessId,
        deal_id: mode === "deal" ? dealId : null,
        goal_text: mode === "goal" ? goalText.trim() : null,
      });
      onGenerated(res.sequence_group);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Generation failed");
      setRunning(false);
    }
  }

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 60 }}>
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.55)", border: 0 }}
      />
      <div
        role="dialog"
        aria-label="Generate actions"
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          transform: "translate(-50%, -50%)",
          width: 480,
          maxWidth: "92vw",
          background: "#0A0E15",
          border: "1px solid rgba(255,255,255,0.10)",
          borderRadius: 6,
          color: "#dce6f0",
          padding: 18,
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
            Generate sequenced plan
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

        <div style={{ display: "flex", gap: 8 }}>
          <RadioBtn label="From deal" active={mode === "deal"} onClick={() => setMode("deal")} />
          <RadioBtn label="From goal" active={mode === "goal"} onClick={() => setMode("goal")} />
        </div>

        {mode === "deal" ? (
          <select
            value={dealId}
            onChange={(e) => setDealId(e.target.value)}
            style={{
              padding: "8px 10px",
              borderRadius: 3,
              border: "1px solid rgba(255,255,255,0.10)",
              background: "rgba(255,255,255,0.03)",
              color: "#dce6f0",
              fontSize: 13,
            }}
          >
            <option value="">— Select a deal —</option>
            {deals.map((d) => (
              <option key={d.crm_opportunity_id} value={d.crm_opportunity_id}>
                {d.account_name ? `${d.account_name} — ${d.name}` : d.name}
              </option>
            ))}
          </select>
        ) : (
          <textarea
            value={goalText}
            onChange={(e) => setGoalText(e.target.value)}
            rows={4}
            placeholder='e.g. "get 10 signups for CLAWD training by Friday"'
            style={{
              padding: "8px 10px",
              borderRadius: 3,
              border: "1px solid rgba(255,255,255,0.10)",
              background: "rgba(255,255,255,0.03)",
              color: "#dce6f0",
              fontSize: 13,
              resize: "vertical",
              fontFamily: "inherit",
            }}
          />
        )}

        <p style={{ fontSize: 11, color: "rgba(220,230,240,0.55)", margin: 0 }}>
          Returns 5–10 sequenced tasks. Today items go straight to the Today column;
          later items land in This Week.
        </p>

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

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button
            type="button"
            onClick={onClose}
            disabled={running}
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
            onClick={run}
            disabled={running}
            style={{
              padding: "8px 16px",
              fontSize: 11,
              borderRadius: 3,
              border: "1px solid rgba(0,220,255,0.40)",
              background: running ? "rgba(255,255,255,0.04)" : "rgba(0,220,255,0.10)",
              color: running ? "rgba(220,230,240,0.40)" : "rgba(0,220,255,0.95)",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              cursor: running ? "not-allowed" : "pointer",
              fontFamily: "var(--font-mono, 'JetBrains Mono', monospace)",
            }}
          >
            {running ? "Generating..." : "Generate"}
          </button>
        </div>
      </div>
    </div>
  );
}

function RadioBtn({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: "6px 12px",
        borderRadius: 3,
        border: `1px solid ${active ? "rgba(0,220,255,0.45)" : "rgba(255,255,255,0.10)"}`,
        background: active ? "rgba(0,220,255,0.08)" : "transparent",
        color: active ? "rgba(0,220,255,0.95)" : "rgba(220,230,240,0.72)",
        fontSize: 11,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        cursor: "pointer",
        fontFamily: "var(--font-mono, 'JetBrains Mono', monospace)",
      }}
    >
      {label}
    </button>
  );
}
