"use client";

import { useEffect, useState } from "react";
import { getConnectors, type ConnectorsResponse } from "@/lib/automated-data-engineering/api";
import {
  C, Panel, Tag, PageHeading, Loading, ErrorState, EmptyState, UnavailableState, statusColor,
} from "./primitives";

// Provider cards rendering declared statuses only. The backend never probes a
// provider or reads credentials to compute these; status is a code-backed
// declaration with an evidence path. Vocabulary: live | stub | script | missing.

export default function ConnectorMap() {
  const [data, setData] = useState<ConnectorsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getConnectors().then(setData).catch((e) => setError(String(e)));
  }, []);

  const heading = (
    <PageHeading eyebrow="Inventory" title="Connector Map"
      blurb="Every provider the fabric knows about, with its declared status. Nothing here is probed: live means working code exists at the evidence path, stub means a placeholder, script means an offline generator, missing means roadmap only." />
  );

  if (error) return <>{heading}<ErrorState message={error} /></>;
  if (!data) return <>{heading}<Loading label="Loading connector inventory…" /></>;
  if (data.null_reason) return <>{heading}<UnavailableState nullReason={data.null_reason} /></>;
  if (data.connectors.length === 0) {
    return <>{heading}<EmptyState label="No connectors declared" hint="The inventory responded but contains no entries." /></>;
  }

  return (
    <>
      {heading}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {data.connectors.map((c) => {
          const color = statusColor(c.status);
          const unavailable = c.status === "missing" || c.status === "stub";
          return (
            <Panel key={c.provider} pad={16}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                <span style={{ fontFamily: C.sans, fontSize: 14, fontWeight: 600, color: C.text }}>{c.provider}</span>
                <Tag color={color}>{c.status}</Tag>
              </div>
              <div style={{ fontFamily: C.mono, fontSize: 10, letterSpacing: "0.08em", color: C.faint,
                textTransform: "uppercase", marginTop: 10 }}>
                mode · {c.mode}
              </div>
              {unavailable ? (
                <p style={{ fontFamily: C.mono, fontSize: 11, color: C.dim, lineHeight: 1.55, marginTop: 8 }}>
                  Not available — {c.reason}
                </p>
              ) : (
                <p style={{ fontFamily: C.sans, fontSize: 12, color: C.dim, lineHeight: 1.55, marginTop: 8 }}>
                  {c.reason}
                </p>
              )}
              <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px solid ${C.border}` }}>
                <div style={{ fontFamily: C.mono, fontSize: 10, color: C.faint }}>
                  evidence: {c.evidence_path ?? "none"}
                </div>
                {c.tool_count > 0 && (
                  <div style={{ fontFamily: C.mono, fontSize: 10, color: C.faint, marginTop: 4 }}>
                    {c.tool_count} registered skill{c.tool_count === 1 ? "" : "s"}
                  </div>
                )}
              </div>
            </Panel>
          );
        })}
      </div>
      <p style={{ fontFamily: C.mono, fontSize: 11, color: C.faint, lineHeight: 1.6,
        borderTop: `1px solid ${C.border}`, paddingTop: 16, marginTop: 18 }}>
        Status is declaration-backed, not probed. No credential validation, no env-var inference,
        no cloud calls. When the inventory changes, the declaration in the backend changes with it.
      </p>
    </>
  );
}
