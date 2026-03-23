"use client";

import React, { useEffect, useState } from "react";
import { listLegalGovernance, LegalGovernanceItem } from "@/lib/bos-api";
import { useDomainEnv } from "@/components/domain/DomainEnvProvider";

function fmtDate(d?: string | null): string {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return d;
  }
}

const TYPE_LABELS: Record<string, string> = {
  board_meeting: "Board Meeting",
  resolution: "Resolution",
  entity_filing: "Entity Filing",
  corporate_action: "Corporate Action",
};

type TypeTab = "all" | "board_meeting" | "resolution" | "entity_filing" | "corporate_action";

const TABS: { key: TypeTab; label: string }[] = [
  { key: "all", label: "All" },
  { key: "board_meeting", label: "Board Meetings" },
  { key: "resolution", label: "Resolutions" },
  { key: "entity_filing", label: "Entity Filings" },
  { key: "corporate_action", label: "Corporate Actions" },
];

function statusBadge(status: string) {
  const base = "inline-block rounded-full px-2 py-0.5 text-xs font-medium";
  if (status === "completed") return <span className={`${base} bg-green-500/15 text-green-400`}>Completed</span>;
  if (status === "in_progress") return <span className={`${base} bg-blue-500/15 text-blue-400`}>In Progress</span>;
  return <span className={`${base} bg-amber-500/15 text-amber-400`}>Pending</span>;
}

export default function LegalGovernancePage() {
  const { envId, businessId } = useDomainEnv();
  const [items, setItems] = useState<LegalGovernanceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TypeTab>("all");

  useEffect(() => {
    setLoading(true);
    setError(null);
    listLegalGovernance(envId, businessId || undefined)
      .then(setItems)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load governance items"))
      .finally(() => setLoading(false));
  }, [envId, businessId]);

  const filtered = tab === "all" ? items : items.filter((i) => i.item_type === tab);

  const tabCounts: Record<TypeTab, number> = {
    all: items.length,
    board_meeting: items.filter((i) => i.item_type === "board_meeting").length,
    resolution: items.filter((i) => i.item_type === "resolution").length,
    entity_filing: items.filter((i) => i.item_type === "entity_filing").length,
    corporate_action: items.filter((i) => i.item_type === "corporate_action").length,
  };

  return (
    <section className="space-y-5" data-testid="legal-governance">
      <div>
        <h2 className="text-2xl font-semibold">Governance</h2>
        <p className="text-sm text-bm-muted2">Board meetings, resolutions, entity filings, and corporate actions.</p>
      </div>

      {/* Type tabs */}
      <div className="flex gap-1 overflow-x-auto border-b border-bm-border/50">
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`shrink-0 px-3 py-2 text-sm font-medium transition-colors ${
              tab === key
                ? "border-b-2 border-bm-accent text-bm-accent"
                : "text-bm-muted2 hover:text-bm-foreground"
            }`}
          >
            {label}
            <span className="ml-1.5 text-xs opacity-70">({tabCounts[key]})</span>
          </button>
        ))}
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">{error}</div>
      )}

      <div className="rounded-xl border border-bm-border/70 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-bm-surface/30 border-b border-bm-border/50 text-left text-xs uppercase tracking-[0.1em] text-bm-muted2">
              <th className="px-4 py-3 font-medium">Type</th>
              <th className="px-4 py-3 font-medium">Title</th>
              <th className="px-4 py-3 font-medium">Entity</th>
              <th className="px-4 py-3 font-medium">Scheduled</th>
              <th className="px-4 py-3 font-medium">Owner</th>
              <th className="px-4 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-bm-border/40">
            {loading ? (
              <tr><td className="px-4 py-6 text-bm-muted2" colSpan={6}>Loading governance items...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td className="px-4 py-6 text-bm-muted2" colSpan={6}>
                {tab === "all"
                  ? "No governance items yet. Seed demo data to populate board meetings and resolutions."
                  : `No ${TYPE_LABELS[tab] ?? tab} items.`}
              </td></tr>
            ) : (
              filtered.map((item) => (
                <tr key={item.governance_item_id} className="hover:bg-bm-surface/20">
                  <td className="px-4 py-3 text-bm-muted2">{TYPE_LABELS[item.item_type] ?? item.item_type}</td>
                  <td className="px-4 py-3 font-medium">{item.title}</td>
                  <td className="px-4 py-3 text-bm-muted2">{item.entity_name || "—"}</td>
                  <td className="px-4 py-3 text-bm-muted2">{fmtDate(item.scheduled_date)}</td>
                  <td className="px-4 py-3 text-bm-muted2">{item.owner || "—"}</td>
                  <td className="px-4 py-3">{statusBadge(item.status)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
