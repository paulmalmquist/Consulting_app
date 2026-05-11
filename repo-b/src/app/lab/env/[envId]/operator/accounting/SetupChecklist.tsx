"use client";

import { useEffect, useMemo, useState } from "react";
import { RailModule } from "@/components/operator/command-desk";
import type { NvSubscriptionLedgerList } from "@/types/nv-accounting";

export type ChecklistStatus =
  | "not_started"
  | "connected"
  | "needs_review"
  | "active"
  | "disabled";

export type ChecklistSourceType =
  | "manual"
  | "bank"
  | "processor"
  | "software"
  | "destination";

export type ChecklistItem = {
  key: string;
  label: string;
  source_type: ChecklistSourceType;
  status: ChecklistStatus;
  next_action: string;
  owner: "Paul";
  route?: string;
  last_sync_at?: string;
  sync_health?: "ok" | "stale" | "error";
  imported_count_30d?: number;
  stale_threshold_hours?: number;
};

type Group = { label: string; key: ChecklistSourceType; items: ChecklistItem[] };

const SEED_ITEMS: ChecklistItem[] = [
  // Manual sources
  { key: "manual-receipt",     label: "Manual receipt upload",       source_type: "manual", status: "active",       next_action: "Upload receipt", owner: "Paul" },
  { key: "manual-invoice",     label: "Manual invoice entry",        source_type: "manual", status: "active",       next_action: "+ Invoice", owner: "Paul" },
  { key: "manual-expense",     label: "Manual expense entry",        source_type: "manual", status: "active",       next_action: "+ Expense", owner: "Paul" },
  { key: "manual-reimburse",   label: "Reimbursement draft entry",   source_type: "manual", status: "not_started",  next_action: "Draft reimbursement", owner: "Paul" },
  { key: "manual-capital",     label: "Capital purchase entry",      source_type: "manual", status: "not_started",  next_action: "Log capital purchase", owner: "Paul" },
  { key: "manual-home-office", label: "Home office / owner expense", source_type: "manual", status: "not_started",  next_action: "Add home-office line", owner: "Paul" },

  // Banking / cards
  { key: "bank-checking",   label: "Business checking import",  source_type: "bank", status: "not_started", next_action: "Connect", owner: "Paul" },
  { key: "bank-cc",         label: "Business credit card import", source_type: "bank", status: "not_started", next_action: "Connect", owner: "Paul" },
  { key: "bank-personal",   label: "Personal card reimbursement",  source_type: "bank", status: "not_started", next_action: "Set up workflow", owner: "Paul" },
  { key: "bank-csv",        label: "CSV transaction import",       source_type: "bank", status: "active",      next_action: "Import CSV", owner: "Paul" },
  { key: "bank-statement",  label: "Statement upload / reconcile", source_type: "bank", status: "not_started", next_action: "Upload statement", owner: "Paul" },

  // Payment processors
  { key: "proc-paypal", label: "PayPal API",       source_type: "processor", status: "not_started", next_action: "Connect", owner: "Paul" },
  { key: "proc-stripe", label: "Stripe API",       source_type: "processor", status: "not_started", next_action: "Connect", owner: "Paul" },
  { key: "proc-chase",  label: "Chase / Amex feed", source_type: "processor", status: "not_started", next_action: "Connect", owner: "Paul" },
  { key: "proc-venmo",  label: "Venmo / Cash App", source_type: "processor", status: "disabled",    next_action: "Skip unless needed", owner: "Paul" },
  { key: "proc-ach",    label: "ACH / wire manual log", source_type: "processor", status: "not_started", next_action: "Log payment", owner: "Paul" },

  // Software vendors
  { key: "sw-apple",      label: "Apple subscriptions",   source_type: "software", status: "needs_review", next_action: "Confirm relevance", owner: "Paul" },
  { key: "sw-google",     label: "Google Workspace",      source_type: "software", status: "needs_review", next_action: "Confirm relevance", owner: "Paul" },
  { key: "sw-openai",     label: "OpenAI",                source_type: "software", status: "needs_review", next_action: "Confirm relevance", owner: "Paul" },
  { key: "sw-anthropic",  label: "Anthropic / Claude",    source_type: "software", status: "needs_review", next_action: "Confirm relevance", owner: "Paul" },
  { key: "sw-vercel",     label: "Vercel",                source_type: "software", status: "needs_review", next_action: "Confirm relevance", owner: "Paul" },
  { key: "sw-railway",    label: "Railway",               source_type: "software", status: "needs_review", next_action: "Confirm relevance", owner: "Paul" },
  { key: "sw-supabase",   label: "Supabase",              source_type: "software", status: "needs_review", next_action: "Confirm relevance", owner: "Paul" },
  { key: "sw-github",     label: "GitHub",                source_type: "software", status: "needs_review", next_action: "Confirm relevance", owner: "Paul" },
  { key: "sw-microsoft",  label: "Microsoft / Azure",     source_type: "software", status: "not_started",  next_action: "Add if used", owner: "Paul" },
  { key: "sw-databricks", label: "Databricks",            source_type: "software", status: "needs_review", next_action: "Confirm relevance", owner: "Paul" },
  { key: "sw-domain",     label: "Domain / hosting / SaaS", source_type: "software", status: "needs_review", next_action: "List remaining tools", owner: "Paul" },

  // Accounting destinations
  { key: "dest-quickbooks",  label: "QuickBooks export",          source_type: "destination", status: "not_started", next_action: "Connect", owner: "Paul" },
  { key: "dest-csv-export",  label: "CSV export",                 source_type: "destination", status: "active",      next_action: "Export", owner: "Paul" },
  { key: "dest-cpa-packet",  label: "CPA packet export",          source_type: "destination", status: "not_started", next_action: "Generate packet", owner: "Paul" },
  { key: "dest-tax-map",     label: "Tax category mapping",       source_type: "destination", status: "not_started", next_action: "Map categories", owner: "Paul" },
  { key: "dest-1099",        label: "1099 / vendor classification", source_type: "destination", status: "not_started", next_action: "Classify vendors", owner: "Paul" },
  { key: "dest-reimb-flag",  label: "Reimbursable vs non-reimb.", source_type: "destination", status: "not_started", next_action: "Flag rules", owner: "Paul" },
  { key: "dest-engagement",  label: "Client / engagement attribution", source_type: "destination", status: "not_started", next_action: "Attribute engagements", owner: "Paul" },
];

const GROUP_LABELS: Record<ChecklistSourceType, string> = {
  manual: "MANUAL SOURCES",
  bank: "BANKING / CARDS",
  processor: "PAYMENT PROCESSORS",
  software: "SOFTWARE VENDORS",
  destination: "ACCOUNTING DESTINATIONS",
};

function statusColor(status: ChecklistStatus): string {
  switch (status) {
    case "active": return "var(--sem-up)";
    case "connected": return "var(--neon-cyan)";
    case "needs_review": return "var(--sem-warn)";
    case "disabled": return "var(--fg-4)";
    case "not_started":
    default: return "var(--fg-3)";
  }
}

function healthColor(h: ChecklistItem["sync_health"]): string {
  switch (h) {
    case "ok": return "var(--sem-up)";
    case "stale": return "var(--sem-warn)";
    case "error": return "var(--sem-error)";
    default: return "var(--fg-4)";
  }
}

function deriveFromLedger(items: ChecklistItem[], ledger: NvSubscriptionLedgerList | null): ChecklistItem[] {
  if (!ledger?.rows?.length) return items;
  const seen = new Set(
    ledger.rows
      .flatMap((r) => [r.vendor_normalized ?? "", r.service_name ?? "", r.billing_platform ?? ""])
      .map((s) => s.toLowerCase().trim())
      .filter(Boolean),
  );
  const has = (...names: string[]) => names.some((n) => seen.has(n.toLowerCase()));
  return items.map((it) => {
    if (it.source_type !== "software") return it;
    let matched = false;
    if (it.key === "sw-openai" && has("openai")) matched = true;
    else if (it.key === "sw-anthropic" && has("anthropic", "claude")) matched = true;
    else if (it.key === "sw-vercel" && has("vercel")) matched = true;
    else if (it.key === "sw-railway" && has("railway")) matched = true;
    else if (it.key === "sw-supabase" && has("supabase")) matched = true;
    else if (it.key === "sw-github" && has("github")) matched = true;
    else if (it.key === "sw-google" && has("google", "google workspace")) matched = true;
    else if (it.key === "sw-apple" && has("apple", "app store")) matched = true;
    else if (it.key === "sw-databricks" && has("databricks")) matched = true;
    return matched
      ? {
          ...it,
          status: "active" as ChecklistStatus,
          sync_health: "ok" as const,
          last_sync_at: new Date().toISOString(),
          next_action: "Confirm relevance",
        }
      : it;
  });
}

type Props = {
  envId: string;
  ledger?: NvSubscriptionLedgerList | null;
  onOpenAll?: () => void;
};

export function SetupChecklistPanel({ envId, ledger, onOpenAll }: Props) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const items = useMemo(() => deriveFromLedger(SEED_ITEMS, ledger ?? null), [ledger]);
  const groups: Group[] = useMemo(() => {
    const order: ChecklistSourceType[] = ["manual", "bank", "processor", "software", "destination"];
    return order.map((key) => ({
      key,
      label: GROUP_LABELS[key],
      items: items.filter((i) => i.source_type === key),
    }));
  }, [items]);

  const total = items.length;
  const done = items.filter((i) => i.status === "active" || i.status === "connected").length;

  // Suppress unused warning for envId — kept on the props for future backend swap.
  void envId;

  if (!mounted) return null;

  return (
    <RailModule
      title="ACCOUNTING SOURCE SETUP"
      accent="var(--neon-cyan)"
      caption={`${done}/${total} active`}
      action={onOpenAll ? { label: "View all", onClick: onOpenAll } : undefined}
    >
      <div style={{ display: "flex", flexDirection: "column" }}>
        {groups.map((group) => {
          const isCollapsed = collapsed[group.key] ?? group.key !== "software";
          const activeInGroup = group.items.filter((i) => i.status === "active" || i.status === "connected").length;
          return (
            <div key={group.key} style={{ borderBottom: "1px solid var(--line-1)" }}>
              <button
                type="button"
                onClick={() => setCollapsed((c) => ({ ...c, [group.key]: !isCollapsed }))}
                style={{
                  width: "100%",
                  background: "transparent",
                  border: "none",
                  padding: "8px 12px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  cursor: "pointer",
                  color: "var(--fg-2)",
                  fontFamily: "var(--font-mono)",
                  fontSize: 10,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                }}
              >
                <span>
                  {isCollapsed ? "▸" : "▾"} {group.label}
                </span>
                <span style={{ color: "var(--fg-3)" }}>
                  {activeInGroup}/{group.items.length}
                </span>
              </button>
              {!isCollapsed && (
                <div>
                  {group.items.map((item) => (
                    <div
                      key={item.key}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "8px 1fr auto",
                        columnGap: 8,
                        padding: "6px 12px",
                        alignItems: "center",
                        borderTop: "1px solid var(--line-1)",
                      }}
                    >
                      <span
                        title={item.status}
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: 999,
                          background: statusColor(item.status),
                        }}
                      />
                      <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                        <span
                          style={{
                            fontFamily: "var(--font-sans)",
                            fontSize: 12,
                            color: item.status === "disabled" ? "var(--fg-4)" : "var(--fg-1)",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {item.label}
                        </span>
                        <span
                          style={{
                            fontFamily: "var(--font-mono)",
                            fontSize: 10,
                            color: "var(--fg-3)",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {item.next_action}
                        </span>
                      </div>
                      {item.sync_health && (
                        <span
                          title={item.last_sync_at ? `Last sync ${item.last_sync_at}` : ""}
                          style={{
                            width: 6,
                            height: 6,
                            borderRadius: 999,
                            background: healthColor(item.sync_health),
                            justifySelf: "end",
                          }}
                        />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </RailModule>
  );
}
