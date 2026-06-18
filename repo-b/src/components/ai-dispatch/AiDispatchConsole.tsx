"use client";

import { useEffect, useState, type ReactNode } from "react";

import {
  getEvals,
  getProviders,
  getRuns,
  type EvalsResponse,
  type ProvidersResponse,
  type RunsResponse,
} from "@/lib/ai-dispatch/api";
import {
  C,
  dispatchStatusColor,
  EmptyState,
  ErrorState,
  Loading,
  PageHeading,
  Panel,
  Tag,
  Td,
  Th,
} from "@/components/ai-dispatch/primitives";

type Load<T> = { state: "loading" } | { state: "error"; message: string } | { state: "ok"; data: T };

function useLoad<T>(fn: () => Promise<T>): Load<T> {
  const [v, setV] = useState<Load<T>>({ state: "loading" });
  useEffect(() => {
    let alive = true;
    fn()
      .then((data) => alive && setV({ state: "ok", data }))
      .catch((e) => alive && setV({ state: "error", message: e instanceof Error ? e.message : String(e) }));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return v;
}

function CapabilityBanner({ providers }: { providers: ProvidersResponse | null }) {
  const notConfigured = (providers?.providers || []).filter((p) => !p.available);
  return (
    <Panel title="Capability — honest posture" style={{ marginBottom: 16 }}>
      <div style={{ display: "grid", gap: 10 }}>
        <Line color={C.green} head="Available now">
          governed provider registry · policy-based routing (mode / risk / privacy) · per-call receipts
          (ai_decision_audit_log) · deterministic routing evals
        </Line>
        <Line color={C.amber} head="Not configured yet">
          {notConfigured.length === 0
            ? "all registered providers are configured"
            : notConfigured
                .map((p) => `${p.display_name}${p.missing_env.length ? ` (needs ${p.missing_env.join(", ")})` : " (adapter not wired)"}`)
                .join(" · ")}
        </Line>
        <Line color={C.faint} head="Write capability">
          provider execution (POST /run) is intentionally disabled in this build — this panel is read-only
        </Line>
      </div>
    </Panel>
  );
}

function Line({ color, head, children }: { color: string; head: string; children: ReactNode }) {
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "baseline" }}>
      <span style={{ minWidth: 130 }}><Tag color={color}>{head}</Tag></span>
      <span style={{ fontFamily: C.sans, fontSize: 13, color: C.dim, lineHeight: 1.5 }}>{children}</span>
    </div>
  );
}

function ProvidersPanel({ load }: { load: Load<ProvidersResponse> }) {
  return (
    <Panel title="Provider inventory">
      {load.state === "loading" && <Loading label="Loading providers…" />}
      {load.state === "error" && <ErrorState message={load.message} />}
      {load.state === "ok" && (load.data.providers.length === 0 ? (
        <EmptyState label="No providers registered" hint="The dispatch registry returned no entries." />
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr><Th>Provider</Th><Th>Status</Th><Th>Max risk</Th><Th>Max privacy</Th><Th>Modes</Th><Th>Config</Th></tr>
            </thead>
            <tbody>
              {load.data.providers.map((p) => (
                <tr key={p.name}>
                  <Td>
                    <div style={{ color: C.text }}>{p.display_name}</div>
                    <div style={{ color: C.faint, fontSize: 11 }}>{p.default_model}</div>
                  </Td>
                  <Td>
                    {p.available
                      ? <Tag color={C.green}>available</Tag>
                      : p.implemented
                        ? <Tag color={C.amber}>not configured</Tag>
                        : <Tag color={C.faint}>fail-closed</Tag>}
                  </Td>
                  <Td>{p.max_risk}</Td>
                  <Td>{p.max_privacy}</Td>
                  <Td style={{ maxWidth: 320, whiteSpace: "normal" }}>
                    <span style={{ color: C.dim, fontSize: 11 }}>{p.allowed_modes.join(", ")}</span>
                  </Td>
                  <Td>
                    {p.missing_env.length === 0
                      ? <span style={{ color: C.faint }}>—</span>
                      : <span style={{ color: C.amber, fontSize: 11 }}>needs {p.missing_env.join(", ")}</span>}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </Panel>
  );
}

function EvalsPanel({ load }: { load: Load<EvalsResponse> }) {
  const summary = load.state === "ok"
    ? <Tag color={load.data.failed === 0 ? C.green : C.red}>{load.data.passed}/{load.data.total} pass</Tag>
    : null;
  return (
    <Panel title="Routing eval suite" right={summary}>
      {load.state === "loading" && <Loading label="Running routing evals…" />}
      {load.state === "error" && <ErrorState message={load.message} />}
      {load.state === "ok" && (
        <>
          <div style={{ fontFamily: C.mono, fontSize: 11, color: C.faint, marginBottom: 10 }}>{load.data.note}</div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr><Th>Case</Th><Th>Expected</Th><Th>Got</Th><Th>Result</Th></tr>
              </thead>
              <tbody>
                {load.data.cases.map((c) => (
                  <tr key={c.name}>
                    <Td style={{ maxWidth: 360, whiteSpace: "normal" }}>{c.name}</Td>
                    <Td><span style={{ color: C.dim }}>{c.expect_status}{c.expect_null_reason ? ` · ${c.expect_null_reason}` : ""}</span></Td>
                    <Td><span style={{ color: dispatchStatusColor(c.got_status) }}>{c.got_status}{c.got_null_reason ? ` · ${c.got_null_reason}` : ""}</span></Td>
                    <Td>{c.passed ? <Tag color={C.green}>pass</Tag> : <Tag color={C.red}>fail</Tag>}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Panel>
  );
}

function RunsPanel({ load }: { load: Load<RunsResponse> }) {
  return (
    <Panel title="Recent dispatch runs">
      {load.state === "loading" && <Loading label="Loading runs…" />}
      {load.state === "error" && <ErrorState message={load.message} />}
      {load.state === "ok" && (load.data.runs.length === 0 ? (
        <EmptyState
          label="No governed dispatch runs yet"
          hint="Provider execution (POST /run) is disabled in this build, so no receipts have been written. Read-only routing and inspection remain available above."
        />
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr><Th>When</Th><Th>Tool</Th><Th>Model</Th><Th>Result</Th><Th>Tags</Th></tr>
            </thead>
            <tbody>
              {load.data.runs.map((r, i) => (
                <tr key={r.id || i}>
                  <Td><span style={{ color: C.faint, fontSize: 11 }}>{r.created_at || "—"}</span></Td>
                  <Td>{r.tool_name || "—"}</Td>
                  <Td>{r.model_used || "—"}</Td>
                  <Td>{r.success === false ? <Tag color={C.red}>failed</Tag> : <Tag color={C.green}>ok</Tag>}</Td>
                  <Td style={{ maxWidth: 280, whiteSpace: "normal" }}>
                    <span style={{ color: C.dim, fontSize: 11 }}>{(r.tags || []).join(", ") || "—"}</span>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </Panel>
  );
}

export default function AiDispatchConsole() {
  const providers = useLoad<ProvidersResponse>(getProviders);
  const evals = useLoad<EvalsResponse>(getEvals);
  const runs = useLoad<RunsResponse>(() => getRuns());

  return (
    <div style={{ background: C.bg, minHeight: "100vh", padding: "28px 32px" }}>
      <div style={{ maxWidth: 1040, margin: "0 auto" }}>
        <PageHeading
          eyebrow="Platform · AI Provider Dispatch"
          title="Provider Dispatch"
          blurb="Read-only view of the standalone model router: which providers are registered and configured, how requests route by mode / risk / privacy, the routing eval suite, and recent governed dispatch receipts. This panel never triggers a provider call."
        />
        <CapabilityBanner providers={providers.state === "ok" ? providers.data : null} />
        <div style={{ display: "grid", gap: 16 }}>
          <ProvidersPanel load={providers} />
          <EvalsPanel load={evals} />
          <RunsPanel load={runs} />
        </div>
      </div>
    </div>
  );
}
