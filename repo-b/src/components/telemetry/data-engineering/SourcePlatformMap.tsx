"use client";

import { useEffect, useState } from "react";

import {
  getConnectorLifecycle,
  type ConnectorLifecycleResponse,
  type ConnectorLifecycleRow,
} from "@/lib/automated-data-engineering/api";
import {
  C,
  EmptyState,
  InlineCode,
  Loading,
  PageHeading,
  Panel,
  StatusDot,
  Tag,
  TelemetryStatusBanner,
} from "../primitives";

// Source & Platform Map — the providers the fabric knows about, what ROLE each plays, and its declared
// status + derived lifecycle state. Reuses /api/ade/connector-lifecycle (declared inventory + real
// read-only validators). No fake validation: a provider only reads "read-validated" when a validator
// actually ran; everything else shows its declared floor and the reason.

// One-line role per provider — explains WHY it's in the fabric, not just its status.
function roleFor(provider: string): string {
  const p = provider.toLowerCase();
  if (p.includes("kafka") || p.includes("confluent")) return "Streaming telemetry ingestion";
  if (p.includes("supabase") || p.includes("postgres")) return "Serving · audit · metadata store";
  if (p.includes("databricks")) return "Model training · feature engineering · notebooks";
  if (p.includes("github")) return "Pull requests · evidence";
  if (p.includes("azure devops") || p.includes("devops")) return "Ticket / work-item intake";
  if (p.includes("vercel")) return "Frontend app hosting";
  if (p.includes("railway")) return "Backend service hosting";
  if (p.includes("bigquery") || p.includes("google cloud")) return "Warehouse export target";
  if (p.includes("openai") || p.includes("claude") || p.includes("gemma") || p.includes("model provider")) return "AI model runtime";
  if (p.includes("microsoft graph") || p.includes("outlook")) return "Email / calendar sync";
  if (p.includes("git ")) return "Local repository tools";
  return "Platform connector";
}

function statusColor(status: string): string {
  if (status === "live") return C.green;
  if (status === "script") return C.amber;
  if (status === "stub") return C.cyan;
  return C.red; // missing
}

function stateColor(state: string): string {
  if (state === "read_validated") return C.green;
  if (state === "credential_pending" || state === "validating") return C.cyan;
  if (state === "degraded") return C.amber;
  if (state === "blocked") return C.red;
  if (state === "retired") return C.faint;
  return C.dim; // declared, discovered
}

function ConnectorCard({ row }: { row: ConnectorLifecycleRow }) {
  return (
    <Panel pad={15}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: C.sans, fontSize: 15, fontWeight: 600, color: C.text }}>{row.provider}</div>
          <div style={{ fontFamily: C.mono, fontSize: 11, color: C.cyan, marginTop: 4 }}>{roleFor(row.provider)}</div>
        </div>
        <Tag color={statusColor(row.declared_status)}>{row.declared_status}</Tag>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12 }}>
        <StatusDot color={stateColor(row.state)} size={7} />
        <span style={{ fontFamily: C.mono, fontSize: 11, color: stateColor(row.state) }}>{row.state.replace(/_/g, " ")}</span>
        <span style={{ marginLeft: "auto" }}><Tag color={C.faint}>risk · {row.risk_tier}</Tag></span>
      </div>

      {row.receipt ? (
        <div style={{ marginTop: 10, fontFamily: C.mono, fontSize: 11, color: row.receipt.outcome === "ok" ? C.green : C.amber, lineHeight: 1.5 }}>
          {row.receipt.outcome === "ok" ? "✓ " : "• "}{row.receipt.detail ?? row.receipt.outcome}
          {row.receipt.checked && <div style={{ color: C.faint, fontSize: 10, marginTop: 3 }}>{row.receipt.checked}</div>}
        </div>
      ) : row.null_reason ? (
        <div style={{ marginTop: 10, fontFamily: C.mono, fontSize: 11, color: C.dim }}>
          Not validated — {row.null_reason}
        </div>
      ) : null}

      <div style={{ marginTop: 12, fontFamily: C.mono, fontSize: 10.5, color: C.faint, lineHeight: 1.5 }}>
        mode · {row.mode}
      </div>
      <div style={{ fontFamily: C.mono, fontSize: 10.5, color: C.dim, lineHeight: 1.5, marginTop: 5 }}>{row.reason}</div>
      {row.evidence_path && (
        <div style={{ marginTop: 8 }}>
          <InlineCode color={C.faint}>evidence: {row.evidence_path}</InlineCode>
        </div>
      )}
    </Panel>
  );
}

export default function SourcePlatformMap({ envId }: { envId: string }) {
  void envId;
  const [data, setData] = useState<ConnectorLifecycleResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    getConnectorLifecycle(true)
      .then((d) => { if (live) setData(d); })
      .catch((e) => { if (live) setError(e instanceof Error ? e.message : String(e)); });
    return () => { live = false; };
  }, []);

  const heading = (
    <PageHeading
      eyebrow="Inventory · Source & Platform"
      title="Source & Platform Map"
      blurb="Every source and platform the fabric depends on, with the role it plays and its declared status. A safe read-only validator may promote a connector to read-validated; connectors with no validator stay at their declared floor and say why. No provider is written to."
    />
  );

  if (error && !data) {
    return <>{heading}<TelemetryStatusBanner tone="error">Connector inventory unavailable — {error}.</TelemetryStatusBanner></>;
  }
  if (!data) return <>{heading}<Loading label="Loading source & platform map…" /></>;
  if (data.null_reason) {
    return <>{heading}<EmptyState label="Connector inventory unavailable" hint={`null_reason: ${data.null_reason}`} /></>;
  }

  return (
    <>
      {heading}
      <TelemetryStatusBanner tone="info">
        Status is declared (live · script · stub · missing); lifecycle state is derived read-only.
        Read-validated means a safe validator actually ran — not an inference from configuration.
      </TelemetryStatusBanner>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3" style={{ marginTop: 16 }}>
        {data.connectors.map((row) => (
          <ConnectorCard key={row.provider} row={row} />
        ))}
      </div>
    </>
  );
}
