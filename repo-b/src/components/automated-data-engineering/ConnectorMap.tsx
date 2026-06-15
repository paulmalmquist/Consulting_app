"use client";

import { useEffect, useState } from "react";
import {
  getConnectorLifecycle, type ConnectorLifecycleResponse, type ConnectorLifecycleRow,
} from "@/lib/automated-data-engineering/api";
import {
  C, Panel, Tag, PageHeading, Loading, ErrorState, EmptyState, UnavailableState,
  statusColor, lifecycleColor, Drawer, DrawerRow,
} from "./primitives";

// Connector map driven by the read-only lifecycle endpoint. Each card shows the
// declared status (live|stub|script|missing — the PR 1 source of truth) AND the
// derived lifecycle state. A connector is read_validated only when a safe
// read-only validator actually ran and returned ok; that fact lives in the
// receipt, which the drawer shows in full. Nothing here probes a provider or
// reads credentials beyond what a registered safe validator does.

const STATE_LABEL: Record<string, string> = {
  declared: "Declared",
  discovered: "Discovered",
  credential_pending: "Credential pending",
  validating: "Validating",
  read_validated: "Read-validated",
  degraded: "Degraded",
  blocked: "Blocked",
  retired: "Retired",
};

export default function ConnectorMap() {
  const [data, setData] = useState<ConnectorLifecycleResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<ConnectorLifecycleRow | null>(null);

  useEffect(() => {
    getConnectorLifecycle(true).then(setData).catch((e) => setError(String(e)));
  }, []);

  const heading = (
    <PageHeading eyebrow="Inventory" title="Connector Map"
      blurb="Every provider the fabric knows about, with its declared status and derived lifecycle state. Read-validated means a safe read-only validator actually ran and confirmed reachability — open a card to see the receipt. No provider is written to; states with no validator stay at their declared floor and say why." />
  );

  if (error) return <>{heading}<ErrorState message={error} /></>;
  if (!data) return <>{heading}<Loading label="Deriving connector lifecycle…" /></>;
  if (data.null_reason) return <>{heading}<UnavailableState nullReason={data.null_reason} /></>;
  if (data.connectors.length === 0) {
    return <>{heading}<EmptyState label="No connectors declared" hint="The lifecycle responded but contains no entries." /></>;
  }

  return (
    <>
      {heading}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {data.connectors.map((c) => {
          const sColor = statusColor(c.declared_status);
          const lColor = lifecycleColor(c.state);
          const notAvailable = c.state === "declared" || c.state === "discovered" || c.state === "retired";
          return (
            <button key={c.provider} type="button" onClick={() => setSelected(c)}
              style={{ textAlign: "left", cursor: "pointer", padding: 0, background: "none", border: "none" }}>
              <Panel pad={16} style={{ height: "100%" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                  <span style={{ fontFamily: C.sans, fontSize: 14, fontWeight: 600, color: C.text }}>{c.provider}</span>
                  <Tag color={sColor}>{c.declared_status}</Tag>
                </div>

                {/* Lifecycle state — the PR 2 signal */}
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12 }}>
                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: lColor, flexShrink: 0 }} />
                  <span style={{ fontFamily: C.sans, fontSize: 13, fontWeight: 600, color: lColor }}>
                    {STATE_LABEL[c.state] ?? c.state}
                  </span>
                  <span style={{ marginLeft: "auto" }}>
                    <Tag color={C.faint}>risk · {c.risk_tier}</Tag>
                  </span>
                </div>

                <div style={{ fontFamily: C.mono, fontSize: 10, letterSpacing: "0.08em", color: C.faint,
                  textTransform: "uppercase", marginTop: 10 }}>
                  mode · {c.mode}
                </div>

                {c.state === "read_validated" && c.receipt ? (
                  <p style={{ fontFamily: C.mono, fontSize: 11, color: C.green, lineHeight: 1.55, marginTop: 8 }}>
                    ✓ {c.receipt.detail ?? "validated"}
                  </p>
                ) : notAvailable ? (
                  <p style={{ fontFamily: C.mono, fontSize: 11, color: C.dim, lineHeight: 1.55, marginTop: 8 }}>
                    Not validated — {c.null_reason ?? c.reason}
                  </p>
                ) : (
                  <p style={{ fontFamily: C.mono, fontSize: 11, color: lColor, lineHeight: 1.55, marginTop: 8 }}>
                    {c.null_reason ?? c.reason}
                  </p>
                )}

                <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px solid ${C.border}` }}>
                  <div style={{ fontFamily: C.mono, fontSize: 10, color: C.faint }}>
                    evidence: {c.evidence_path ?? "none"}
                  </div>
                </div>
              </Panel>
            </button>
          );
        })}
      </div>

      <p style={{ fontFamily: C.mono, fontSize: 11, color: C.faint, lineHeight: 1.6,
        borderTop: `1px solid ${C.border}`, paddingTop: 16, marginTop: 18 }}>
        Lifecycle is derived read-only: declared floor, then a safe validator may move a connector to
        read_validated, credential_pending, degraded, or blocked. No credential creation, no writes,
        no cloud mutation. Connectors with no safe validator stay at their declared floor.
      </p>

      {selected && (
        <Drawer eyebrow="Connector lifecycle" title={selected.provider} onClose={() => setSelected(null)}>
          <DrawerRow label="Declared" value={<Tag color={statusColor(selected.declared_status)}>{selected.declared_status}</Tag>} />
          <DrawerRow label="State" value={<span style={{ color: lifecycleColor(selected.state) }}>{STATE_LABEL[selected.state] ?? selected.state}</span>} />
          <DrawerRow label="Risk tier" value={selected.risk_tier} />
          <DrawerRow label="Mode" value={selected.mode} />
          <DrawerRow label="Evidence" value={selected.evidence_path ?? "none"} />
          <DrawerRow label="Reason" value={selected.reason} />
          {selected.null_reason && <DrawerRow label="null_reason" value={selected.null_reason} />}

          <div style={{ marginTop: 18 }}>
            <div style={{ fontFamily: C.mono, fontSize: 10, letterSpacing: "0.14em", color: C.accent,
              textTransform: "uppercase", marginBottom: 8 }}>Validation receipt</div>
            {selected.receipt ? (
              <>
                <DrawerRow label="Outcome" value={selected.receipt.outcome} />
                <DrawerRow label="Checked" value={selected.receipt.checked ?? "—"} />
                <DrawerRow label="Detail" value={selected.receipt.detail ?? "—"} />
              </>
            ) : (
              <p style={{ fontFamily: C.mono, fontSize: 11, color: C.faint, lineHeight: 1.55 }}>
                No validation attempt — this connector has no safe read-only validator registered.
                It stays at its declared floor ({STATE_LABEL[selected.state] ?? selected.state}).
              </p>
            )}
          </div>
        </Drawer>
      )}
    </>
  );
}
