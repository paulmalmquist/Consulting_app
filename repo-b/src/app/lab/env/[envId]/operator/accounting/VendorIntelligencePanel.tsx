"use client";

import { useEffect, useMemo, useState } from "react";
import type { NvSubscriptionLedgerList, NvSubscriptionRow } from "@/types/nv-accounting";
import {
  RELEVANCE_LABELS,
  RELEVANCE_ORDER,
  getVendorIntel,
  listVendorIntel,
  setVendorIntel,
  type VendorIntelligence,
  type VendorRelevance,
} from "@/lib/vendor-intelligence-store";

const TONE: Record<VendorRelevance, string> = {
  core: "var(--sem-up)",
  supporting: "var(--neon-cyan)",
  personal: "var(--neon-violet)",
  redundant: "var(--sem-warn)",
  unknown: "var(--fg-3)",
};

function vendorName(row: NvSubscriptionRow): string {
  return row.vendor_normalized || row.service_name || "unknown";
}

function fmtUsd(n: number | null | undefined): string {
  if (n == null) return "—";
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

type Props = {
  envId: string;
  ledger: NvSubscriptionLedgerList | null;
};

export function VendorIntelligencePanel({ envId, ledger }: Props) {
  // refresh tick to re-read from localStorage after writes
  const [tick, setTick] = useState(0);

  // hydration safety
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // `tick` is the manual re-read trigger after a write; it intentionally
  // invalidates the memo so listVendorIntel re-runs against localStorage.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const all = useMemo(() => (mounted ? listVendorIntel(envId) : {}), [envId, mounted, tick]);

  const rows = useMemo(() => {
    if (!ledger?.rows?.length) return [];
    return ledger.rows.map((r) => {
      const name = vendorName(r);
      const intel: VendorIntelligence | null = mounted
        ? all[name.toLowerCase()] ?? getVendorIntel(envId, name)
        : null;
      return {
        row: r,
        name,
        intel: intel ?? {
          business_relevance: (r.business_relevance as VendorRelevance) || "unknown",
          replaceable_by_winston: false,
        } as VendorIntelligence,
        classified: !!intel,
      };
    });
  }, [ledger, envId, mounted, all]);

  function setRelevance(name: string, rel: VendorRelevance) {
    setVendorIntel(envId, name, { business_relevance: rel, classified_by: "user", classification_confidence: 1 });
    setTick((t) => t + 1);
  }

  function setReplaceable(name: string, replaceable: boolean) {
    setVendorIntel(envId, name, { replaceable_by_winston: replaceable, classified_by: "user" });
    setTick((t) => t + 1);
  }

  function setWorkflow(name: string, workflow: string) {
    setVendorIntel(envId, name, { linked_workflow: workflow, classified_by: "user" });
    setTick((t) => t + 1);
  }

  if (!mounted) return <div style={{ color: "var(--fg-3)", padding: 12 }}>Loading…</div>;
  if (rows.length === 0) {
    return (
      <div style={{ color: "var(--fg-3)", padding: 12, fontSize: 12 }}>
        No tracked vendors yet. Import card transactions to auto-detect subscriptions.
      </div>
    );
  }

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr",
        gap: 4,
        maxHeight: 200,
        overflowY: "auto",
      }}
    >
      {rows.map(({ row, name, intel }) => (
        <div
          key={row.id}
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0,1.4fr) minmax(0,1fr) auto auto",
            gap: 8,
            alignItems: "center",
            padding: "6px 10px",
            borderBottom: "1px solid var(--line-1)",
            fontSize: 11,
          }}
        >
          <div style={{ minWidth: 0, display: "flex", flexDirection: "column" }}>
            <span style={{ color: "var(--fg-1)", fontSize: 12, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {name}
            </span>
            <span style={{ color: "var(--fg-3)", fontSize: 10, whiteSpace: "nowrap" }}>
              {row.cadence} · {fmtUsd(row.expected_amount)}
            </span>
          </div>
          <select
            value={intel.business_relevance}
            onChange={(e) => setRelevance(name, e.target.value as VendorRelevance)}
            style={{
              background: "var(--bg-panel)",
              color: TONE[intel.business_relevance],
              border: "1px solid var(--line-2)",
              borderRadius: 3,
              padding: "2px 6px",
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              minWidth: 0,
            }}
          >
            {RELEVANCE_ORDER.map((r) => (
              <option key={r} value={r}>
                {RELEVANCE_LABELS[r]}
              </option>
            ))}
          </select>
          <input
            type="text"
            placeholder="workflow"
            defaultValue={intel.linked_workflow ?? ""}
            onBlur={(e) => {
              const v = e.target.value.trim();
              if (v !== (intel.linked_workflow ?? "")) setWorkflow(name, v);
            }}
            style={{
              width: 100,
              background: "transparent",
              border: "1px solid var(--line-2)",
              borderRadius: 3,
              color: "var(--fg-2)",
              padding: "2px 6px",
              fontSize: 10,
              fontFamily: "var(--font-sans)",
            }}
          />
          <label
            title="Replaceable by Winston"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              color: intel.replaceable_by_winston ? "var(--neon-cyan)" : "var(--fg-3)",
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            <input
              type="checkbox"
              checked={intel.replaceable_by_winston}
              onChange={(e) => setReplaceable(name, e.target.checked)}
              style={{ accentColor: "var(--neon-cyan)" }}
            />
            Winston
          </label>
        </div>
      ))}
    </div>
  );
}

export function countUnclassifiedVendors(envId: string, ledger: NvSubscriptionLedgerList | null): number {
  if (typeof window === "undefined" || !ledger?.rows?.length) return 0;
  const intel = listVendorIntel(envId);
  return ledger.rows.filter((r) => {
    const name = vendorName(r).toLowerCase();
    const classified = intel[name];
    if (classified && classified.business_relevance !== "unknown") return false;
    return !r.business_relevance || r.business_relevance === "unknown";
  }).length;
}
