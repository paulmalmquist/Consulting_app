"use client";

import React, { useEffect, useState } from "react";
import { listLegalRegulatory, LegalRegulatoryItem } from "@/lib/bos-api";
import { useDomainEnv } from "@/components/domain/DomainEnvProvider";

function fmtDate(d?: string | null): string {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return d;
  }
}

type StatusTab = "all" | "open" | "overdue" | "completed";

function isOverdue(item: LegalRegulatoryItem): boolean {
  if (item.status !== "open" || !item.deadline) return false;
  return new Date(item.deadline) < new Date();
}

function statusBadge(item: LegalRegulatoryItem) {
  const base = "inline-block rounded-full px-2 py-0.5 text-xs font-medium";
  if (item.status === "completed") return <span className={`${base} bg-green-500/15 text-green-400`}>Completed</span>;
  if (isOverdue(item)) return <span className={`${base} bg-red-500/15 text-red-400`}>Overdue</span>;
  if (item.status === "open") return <span className={`${base} bg-amber-500/15 text-amber-400`}>Open</span>;
  return <span className={`${base} bg-bm-surface/60 text-bm-muted2`}>{item.status}</span>;
}

const TABS: { key: StatusTab; label: string }[] = [
  { key: "all", label: "All" },
  { key: "open", label: "Open" },
  { key: "overdue", label: "Overdue" },
  { key: "completed", label: "Completed" },
];

export default function LegalCompliancePage() {
  const { envId, businessId } = useDomainEnv();
  const [items, setItems] = useState<LegalRegulatoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<StatusTab>("all");

  useEffect(() => {
    setLoading(true);
    setError(null);
    listLegalRegulatory(envId, businessId || undefined)
      .then(setItems)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load regulatory items"))
      .finally(() => setLoading(false));
  }, [envId, businessId]);

  const filtered = items.filter((item) => {
    if (tab === "all") return true;
    if (tab === "overdue") return isOverdue(item);
    if (tab === "open") return item.status === "open" && !isOverdue(item);
    if (tab === "completed") return item.status === "completed";
    return true;
  });

  const tabCounts: Record<StatusTab, number> = {
    all: items.length,
    open: items.filter((i) => i.status === "open" && !isOverdue(i)).length,
    overdue: items.filter(isOverdue).length,
    completed: items.filter((i) => i.status === "completed").length,
  };

  return (
    <section className="space-y-5" data-testid="legal-compliance">
      <div>
        <h2 className="text-2xl font-semibold">Compliance</h2>
        <p className="text-sm text-bm-muted2">Regulatory deadlines, filing obligations, and compliance programs.</p>
      </div>

      {/* Status tabs */}
      <div className="flex gap-1 border-b border-bm-border/50">
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-3 py-2 text-sm font-medium transition-colors ${
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
              <th className="px-4 py-3 font-medium">Agency</th>
              <th className="px-4 py-3 font-medium">Regulation</th>
              <th className="px-4 py-3 font-medium">Obligation</th>
              <th className="px-4 py-3 font-medium">Deadline</th>
              <th className="px-4 py-3 font-medium">Owner</th>
              <th className="px-4 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-bm-border/40">
            {loading ? (
              <tr><td className="px-4 py-6 text-bm-muted2" colSpan={6}>Loading regulatory items...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td className="px-4 py-6 text-bm-muted2" colSpan={6}>
                {tab === "all"
                  ? "No regulatory items yet. Seed demo data or add items manually."
                  : `No items with status "${tab}".`}
              </td></tr>
            ) : (
              filtered.map((item) => (
                <tr key={item.regulatory_item_id} className="hover:bg-bm-surface/20">
                  <td className="px-4 py-3 font-medium">{item.agency}</td>
                  <td className="px-4 py-3 text-bm-muted2">{item.regulation_ref || "—"}</td>
                  <td className="px-4 py-3 max-w-xs truncate">{item.obligation_text}</td>
                  <td className={`px-4 py-3 font-medium ${isOverdue(item) ? "text-red-400" : "text-bm-muted2"}`}>{fmtDate(item.deadline)}</td>
                  <td className="px-4 py-3 text-bm-muted2">{item.owner || "—"}</td>
                  <td className="px-4 py-3">{statusBadge(item)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
