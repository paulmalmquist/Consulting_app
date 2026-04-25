"use client";

import { useEffect, useState } from "react";
import { RailModule } from "@/components/operator/command-desk";

const ITEMS = [
  "Connect bank account (import transactions)",
  "Upload Apple billing receipts",
  "Confirm each vendor in Subscription Ledger",
  "Set business relevance for all AI tools",
  "Create invoices for active engagements",
  "Record capital purchases (computers, equipment)",
  "Record home office expenses (Q1)",
  "Match unreconciled transactions to receipts",
  "Review low-confidence receipt scans",
  "Mark period as reviewed (Q1 2026)",
];

function storageKey(envId: string) {
  return `nv_setup_checklist_${envId}`;
}

function loadChecked(envId: string): boolean[] {
  try {
    const raw = localStorage.getItem(storageKey(envId));
    if (!raw) return ITEMS.map(() => false);
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length === ITEMS.length) return parsed;
  } catch {
    // ignore
  }
  return ITEMS.map(() => false);
}

function saveChecked(envId: string, checked: boolean[]) {
  try {
    localStorage.setItem(storageKey(envId), JSON.stringify(checked));
  } catch {
    // ignore
  }
}

type Props = { envId: string };

export function SetupChecklistPanel({ envId }: Props) {
  const [checked, setChecked] = useState<boolean[]>(() => ITEMS.map(() => false));
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setChecked(loadChecked(envId));
    setMounted(true);
  }, [envId]);

  const done = checked.filter(Boolean).length;
  const allDone = done === ITEMS.length;

  if (!mounted || allDone) return null;

  function toggle(i: number) {
    const next = [...checked];
    next[i] = !next[i];
    setChecked(next);
    saveChecked(envId, next);
  }

  return (
    <RailModule
      title="SETUP CHECKLIST"
      accent="var(--neon-cyan)"
      caption={`${done}/${ITEMS.length} complete`}
    >
      <div style={{ display: "flex", flexDirection: "column" }}>
        {ITEMS.map((label, i) => (
          <div
            key={i}
            onClick={() => toggle(i)}
            style={{
              display: "grid",
              gridTemplateColumns: "20px 1fr",
              gap: 8,
              padding: "7px 12px",
              borderBottom: i < ITEMS.length - 1 ? "1px solid var(--line-1)" : "none",
              cursor: "pointer",
              alignItems: "center",
              background: checked[i] ? "rgba(0,220,255,0.03)" : "transparent",
            }}
          >
            <div
              style={{
                width: 14,
                height: 14,
                border: `1px solid ${checked[i] ? "var(--neon-cyan)" : "var(--line-3)"}`,
                borderRadius: 2,
                background: checked[i] ? "rgba(0,220,255,0.15)" : "transparent",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              {checked[i] && (
                <span style={{ color: "var(--neon-cyan)", fontSize: 9, lineHeight: 1 }}>✓</span>
              )}
            </div>
            <span
              style={{
                fontFamily: "var(--font-sans)",
                fontSize: 12,
                color: checked[i] ? "var(--fg-3)" : "var(--fg-2)",
                textDecoration: checked[i] ? "line-through" : "none",
              }}
            >
              {label}
            </span>
          </div>
        ))}
      </div>
    </RailModule>
  );
}
