"use client";

import { useCallback, useEffect, useState } from "react";

import {
  C,
  EmptyState,
  ErrorState,
  Loading,
  MetricCard,
  Panel,
  SplitGrid,
  StatGrid,
  Tag,
  verdictColor,
  DisclosureFooter,
} from "./primitives";
import {
  Decision,
  GemmaState,
  Receipt,
  VerifyResult,
  getGemmaState,
  listDecisions,
  probeGemma,
  resolveDecision,
  scoreAndGate,
  teardownGemma,
  verifyReceipt,
  warmGemma,
} from "@/lib/telemetry/controlTower-api";
import { TelemetryPageHeader } from "./TelemetryPageHeader";

// Truth label: every panel says where its data comes from. Never imply live execution over a fixture.
function TruthLabel({ kind }: { kind: "fixture" | "staged" | "live" | "cold" | "unavailable" }) {
  const map = {
    fixture: { c: C.amber, t: "simulated fixture" },
    staged: { c: C.cyan, t: "staged real backend" },
    live: { c: C.green, t: "live gemma" },
    cold: { c: C.dim, t: "cold" },
    unavailable: { c: C.faint, t: "unavailable" },
  }[kind];
  return <Tag color={map.c}>{map.t}</Tag>;
}

const GEMMA_STATUS_COLOR: Record<string, string> = {
  live: C.green, warming: C.amber, warming_requested: C.amber, tearing_down: C.amber,
  teardown_requested: C.amber, torn_down: C.dim, cold: C.dim, failed: C.red, unavailable: C.faint,
};

// Deterministic sample windows so the demo is controllable: nominal -> GO, anomaly -> spike -> gate.
function sampleWindow(kind: "nominal" | "anomaly"): { t: number; value: number }[] {
  const w: { t: number; value: number }[] = [];
  for (let t = 0; t < 60; t++) {
    let v = 1.0 + ((t % 5) - 2) * 0.002; // tiny deterministic ripple around 1.0
    if (kind === "anomaly" && t >= 55) v = 1.0 + (t - 54) * 0.6; // ramp into a redline breach
    w.push({ t, value: Number(v.toFixed(4)) });
  }
  return w;
}

function RunConsole() {
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [gemma, setGemma] = useState<GemmaState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // run controls
  const [runKey, setRunKey] = useState("");
  const [channel, setChannel] = useState("D-4");
  const [itar, setItar] = useState(true);
  const [sample, setSample] = useState<"nominal" | "anomaly">("anomaly");

  // gate controls
  const [rationale, setRationale] = useState("");
  const [evidence, setEvidence] = useState("");

  // receipt panel
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [verify, setVerify] = useState<VerifyResult | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const [d, g] = await Promise.all([listDecisions(), getGemmaState()]);
      setDecisions(d.decisions);
      setGemma(g);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const run = async () => {
    if (!runKey.trim()) {
      setError("Enter a run_key from the Test Runs page to score.");
      return;
    }
    setBusy("run");
    setError(null);
    try {
      await scoreAndGate({
        run_key: runKey.trim(), channel_name: channel.trim() || "D-4",
        window: sampleWindow(sample), itar_tagged: itar,
      });
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const resolve = async (d: Decision, decision: string) => {
    setBusy(`resolve:${d.id}:${decision}`);
    setError(null);
    try {
      const res = await resolveDecision(d.id, {
        human_decision: decision, rationale: rationale || undefined,
        requested_evidence: decision === "request_more_evidence" ? evidence || undefined : undefined,
      });
      if (res.receipt) {
        setReceipt(res.receipt);
        setVerify(null);
      }
      setRationale("");
      setEvidence("");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const doVerify = async () => {
    if (!receipt) return;
    setBusy("verify");
    try {
      setVerify(await verifyReceipt(receipt.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const gemmaAction = async (action: "probe" | "warm" | "teardown") => {
    setBusy(`gemma:${action}`);
    setError(null);
    try {
      if (action === "probe") {
        setGemma(await probeGemma());
      } else {
        const token = action === "warm" ? gemma?.confirm_tokens.warm : gemma?.confirm_tokens.teardown;
        await (action === "warm" ? warmGemma(token || "") : teardownGemma(token || ""));
        await refresh();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  if (loading) return <div style={{ padding: 24, background: C.bg, minHeight: "100%" }}><Loading /></div>;

  const open = decisions.filter((d) => d.status === "pending_approval" || d.status === "needs_more_evidence");
  const latest = decisions[0] || null;
  const gemmaStatus = gemma?.status ?? "unavailable";
  const gemmaTruth: "live" | "cold" | "unavailable" =
    gemmaStatus === "live" ? "live" : gemmaStatus === "unavailable" ? "unavailable" : "cold";

  const lbl = { fontFamily: C.mono, fontSize: 10, letterSpacing: "0.1em", color: C.faint, textTransform: "uppercase" as const };
  const inputStyle = {
    background: C.bg, border: `1px solid ${C.border}`, borderRadius: 6, color: C.text,
    fontFamily: C.mono, fontSize: 12, padding: "7px 10px", width: "100%",
  };
  const btn = (accent: string, disabled?: boolean) => ({
    background: accent + "1a", border: `1px solid ${accent}55`, color: accent,
    fontFamily: C.mono, fontSize: 12, borderRadius: 6, padding: "7px 12px",
    cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1,
  });

  return (
    <div style={{ padding: 24, background: C.bg, minHeight: "100%", color: C.text }}>
      <TelemetryPageHeader
        variant="compact"
        eyebrow="Telemetry · Go/No-Go"
        title="Agent Control Tower"
        description="Test-telemetry go/no-go with a sensitivity-aware model router, an enforced human approval gate, and a tamper-evident signed decision receipt. Sensitive / ITAR-demo-tagged triage routes only to the in-boundary Gemma private tier (or fails closed) — an ITAR-aware routing posture, not a compliance claim."
        actions={<TruthLabel kind="staged" />}
      />

      {error && <div style={{ marginBottom: 16 }}><ErrorState message={error} /></div>}

      {/* 1 — VERDICT + run control */}
      <SplitGrid variant="halves" style={{ marginBottom: 16 }}>
        <Panel title="1 · Verdict" right={<TruthLabel kind="staged" />}>
          {latest ? (
            <>
              <StatGrid cols={3}>
                <MetricCard label="Verdict" value={latest.verdict} accent={verdictColor(latest.verdict)} />
                <MetricCard label="Anomaly score" value={latest.anomaly_score ?? "—"} sub={`threshold ${latest.threshold ?? "—"}`} />
                <MetricCard label="Status" value={latest.status} />
              </StatGrid>
              <div style={{ ...lbl, marginTop: 14 }}>run · channel</div>
              <div style={{ fontFamily: C.mono, fontSize: 12, color: C.dim, marginTop: 4 }}>
                {latest.run_key} · {latest.channel_name}
              </div>
            </>
          ) : (
            <EmptyState label="No decisions yet" hint="Run a go/no-go below. Use a run_key that exists on the Test Runs page; the migration (10016) must be applied." />
          )}
        </Panel>

        <Panel title="Run go/no-go" right={<Tag color={C.cyan}>operator</Tag>}>
          <div style={{ display: "grid", gap: 10 }}>
            <div>
              <div style={lbl}>run_key</div>
              <input style={inputStyle} value={runKey} onChange={(e) => setRunKey(e.target.value)} placeholder="e.g. FD001-test-001" />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div>
                <div style={lbl}>channel</div>
                <input style={inputStyle} value={channel} onChange={(e) => setChannel(e.target.value)} />
              </div>
              <div>
                <div style={lbl}>sample window</div>
                <select style={inputStyle} value={sample} onChange={(e) => setSample(e.target.value as "nominal" | "anomaly")}>
                  <option value="anomaly">anomaly (spike → gate)</option>
                  <option value="nominal">nominal (→ GO)</option>
                </select>
              </div>
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: C.mono, fontSize: 12, color: C.dim }}>
              <input type="checkbox" checked={itar} onChange={(e) => setItar(e.target.checked)} />
              sensitive / ITAR-demo-tagged (route to in-boundary Gemma private tier)
            </label>
            <button type="button" style={btn(C.cyan, busy === "run")} disabled={busy === "run"} onClick={run}>
              {busy === "run" ? "Scoring…" : "Score & open gate"}
            </button>
          </div>
        </Panel>
      </SplitGrid>

      {/* 2 — ROUTING + 5 GEMMA */}
      <SplitGrid variant="halves" style={{ marginBottom: 16 }}>
        <Panel title="2 · Routing decision" right={<TruthLabel kind="staged" />}>
          {latest && latest.verdict !== "GO" && latest.verdict !== "NOT_AVAILABLE" ? (
            <>
              <StatGrid cols={3}>
                <MetricCard label="Provider" value={latest.dispatch_provider ?? "— (fail closed)"}
                  accent={latest.dispatch_provider === "gemma_gcp" ? C.green : C.cyan} />
                <MetricCard label="Privacy tier" value={latest.privacy ?? "—"} />
                <MetricCard label="Est. token cost" value={latest.triage_cost_usd != null ? `$${latest.triage_cost_usd}` : "—"} />
              </StatGrid>
              <div style={{ ...lbl, marginTop: 14 }}>routing reason</div>
              <div style={{ fontFamily: C.mono, fontSize: 12, color: C.dim, marginTop: 4, lineHeight: 1.5 }}>{latest.routing_reason}</div>
              {latest.routing_rejected && Object.keys(latest.routing_rejected).length > 0 && (
                <>
                  <div style={{ ...lbl, marginTop: 14 }}>rejected providers (why each lost)</div>
                  <div style={{ display: "grid", gap: 6, marginTop: 6 }}>
                    {Object.entries(latest.routing_rejected).map(([p, why]) => (
                      <div key={p} style={{ display: "flex", justifyContent: "space-between", fontFamily: C.mono, fontSize: 11 }}>
                        <span style={{ color: C.text }}>{p}</span>
                        <span style={{ color: C.red }}>{why}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </>
          ) : (
            <EmptyState label="No routing yet" hint="A REVIEW or NO_GO verdict runs sensitivity-routed triage. GO short-circuits with no routing." />
          )}
        </Panel>

        <Panel
          title="5 · Gemma private tier"
          right={<TruthLabel kind={gemmaTruth} />}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
            <Tag color={GEMMA_STATUS_COLOR[gemmaStatus] ?? C.dim}>{gemmaStatus}</Tag>
            {gemma && !gemma.lifecycle_enabled && <Tag color={C.faint}>lifecycle disabled</Tag>}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 14px" }}>
            {[
              ["endpoint", gemma?.endpoint_id || "—"],
              ["model", gemma?.model_id || "—"],
              ["region", gemma?.region || "—"],
              ["deployed models", String(gemma?.deployed_model_count ?? 0)],
              ["est. active cost", `$${gemma?.est_active_cost_usd ?? 0}`],
              ["teardown verify", gemma?.teardown_verification || "—"],
              ["last warmed", gemma?.last_warmed_at || "—"],
              ["last teardown", gemma?.last_teardown_at || "—"],
            ].map(([k, v]) => (
              <div key={k}>
                <div style={lbl}>{k}</div>
                <div style={{ fontFamily: C.mono, fontSize: 12, color: C.dim, marginTop: 3, wordBreak: "break-all" }}>{v}</div>
              </div>
            ))}
          </div>
          {gemma?.last_error && (
            <div style={{ fontFamily: C.mono, fontSize: 11, color: C.red, marginTop: 10 }}>{gemma.last_error}</div>
          )}
          <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
            <button type="button" style={btn(C.cyan, busy === "gemma:probe")} disabled={busy === "gemma:probe"} onClick={() => gemmaAction("probe")}>Probe</button>
            <button type="button" style={btn(C.amber, busy === "gemma:warm")} disabled={busy === "gemma:warm"} onClick={() => gemmaAction("warm")}>Warm</button>
            <button type="button" style={btn(C.red, busy === "gemma:teardown")} disabled={busy === "gemma:teardown"} onClick={() => gemmaAction("teardown")}>Teardown</button>
            <button type="button" style={btn(C.green, busy === "gemma:probe")} disabled={busy === "gemma:probe"} onClick={() => gemmaAction("probe")}>Verify</button>
          </div>
          <div style={{ fontFamily: C.mono, fontSize: 10, color: C.faint, marginTop: 10, lineHeight: 1.5 }}>
            Warm/Teardown are async, operator-only, and gated by CONTROL_TOWER_GEMMA_LIFECYCLE_ENABLED. Teardown undeploys the model (stops GPU billing) but keeps the endpoint for fast re-warm; Vertex deployedModels is the source of truth.
          </div>
        </Panel>
      </SplitGrid>

      {/* 3 — GATE */}
      <Panel title="3 · Approval gate (enforced)" right={<TruthLabel kind="staged" />} style={{ marginBottom: 16 }}>
        {open.length === 0 ? (
          <EmptyState label="No open gates" hint="REVIEW/NO_GO verdicts open a gate here. GO auto-passes; NOT_AVAILABLE fails closed." />
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div>
                <div style={lbl}>rationale (recorded on the receipt)</div>
                <input style={inputStyle} value={rationale} onChange={(e) => setRationale(e.target.value)} placeholder="why this go/no-go" />
              </div>
              <div>
                <div style={lbl}>requested evidence (for hold)</div>
                <input style={inputStyle} value={evidence} onChange={(e) => setEvidence(e.target.value)} placeholder="e.g. vibration spectra for t=55–60" />
              </div>
            </div>
            {open.map((d) => (
              <div key={d.id} style={{ border: `1px solid ${C.border}`, borderRadius: 9, padding: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <span style={{ fontFamily: C.mono, fontSize: 12, color: C.text }}>
                    {d.run_key} · {d.channel_name} · <span style={{ color: verdictColor(d.verdict) }}>{d.verdict}</span>
                    {d.itar_tagged && <> · <Tag color={C.amber}>itar-demo</Tag></>}
                  </span>
                  <Tag color={d.status === "needs_more_evidence" ? C.amber : C.cyan}>{d.status}</Tag>
                </div>
                {d.triage_summary && (
                  <div style={{ fontFamily: C.sans, fontSize: 13, color: C.dim, marginTop: 8, lineHeight: 1.5 }}>{d.triage_summary}</div>
                )}
                <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                  <button type="button" style={btn(C.green, busy?.startsWith(`resolve:${d.id}`))} disabled={!!busy} onClick={() => resolve(d, "approve")}>Approve</button>
                  <button type="button" style={btn(C.red, busy?.startsWith(`resolve:${d.id}`))} disabled={!!busy} onClick={() => resolve(d, "reject")}>Reject</button>
                  <button type="button" style={btn(C.amber, busy?.startsWith(`resolve:${d.id}`))} disabled={!!busy} onClick={() => resolve(d, "request_more_evidence")}>Request more evidence</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>

      {/* 4 — RECEIPT */}
      <Panel title="4 · Signed receipt" right={<TruthLabel kind="staged" />} style={{ marginBottom: 16 }}>
        {receipt ? (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 14px" }}>
              {[
                ["receipt id", receipt.id],
                ["chain seq", String(receipt.chain_seq)],
                ["prev hash", receipt.prev_receipt_hash || "(genesis)"],
                ["payload hash", receipt.payload_hash],
                ["public key id", receipt.public_key_id],
                ["algo", receipt.algo],
              ].map(([k, v]) => (
                <div key={k}>
                  <div style={lbl}>{k}</div>
                  <div style={{ fontFamily: C.mono, fontSize: 11, color: C.dim, marginTop: 3, wordBreak: "break-all" }}>{v}</div>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 14, flexWrap: "wrap" }}>
              <button type="button" style={btn(C.cyan, busy === "verify")} disabled={busy === "verify"} onClick={doVerify}>
                {busy === "verify" ? "Verifying…" : "Verify receipt"}
              </button>
              {verify && (
                <Tag color={verify.valid ? C.green : C.red}>
                  {verify.valid ? "VALID · chain intact" : `INVALID · ${verify.chain_reason || verify.reason || "tampered"}`}
                </Tag>
              )}
            </div>
            {verify && (
              <div style={{ display: "flex", gap: 14, marginTop: 10, flexWrap: "wrap", fontFamily: C.mono, fontSize: 11, color: C.dim }}>
                <span>hash: {String(verify.hash_valid)}</span>
                <span>signature: {String(verify.signature_valid)}</span>
                <span>key match: {String(verify.key_matches)}</span>
                <span>chain: {String(verify.chain_intact)}</span>
              </div>
            )}
            <div style={{ fontFamily: C.mono, fontSize: 10, color: C.faint, marginTop: 12, lineHeight: 1.5 }}>
              Ed25519-signed, SHA-256 hash-chained, signed server-side outside the agent boundary. Tamper-evident, not suppression-proof (an append-only/witnessed log is the next step).
            </div>
          </>
        ) : (
          <EmptyState label="No receipt selected" hint="Approve or Reject a gate above to sign a hash-chained receipt, then verify it here." />
        )}
      </Panel>

      <DisclosureFooter />
    </div>
  );
}

type TopLevelTab = "run-console" | ControlTowerTab;

const CONTROL_TOWER_TABS: Array<{ id: TopLevelTab; label: string }> = [
  { id: "run-console", label: "Run Console" },
  { id: "builder", label: "Agent Builder" },
  { id: "registry", label: "Agent Registry" },
  { id: "history", label: "Run History" },
  { id: "tools", label: "Tool Registry" },
  { id: "evals", label: "Evals" },
];

export default function ControlTower() {
  const [tab, setTab] = useState<TopLevelTab>("run-console");
  return (
    <div style={{ background: C.bg, minHeight: "100%" }}>
      <div
        role="tablist"
        aria-label="Agent Control Tower modes"
        style={{
          display: "flex",
          gap: 4,
          padding: "12px 24px 0",
          borderBottom: `1px solid ${C.border}`,
          overflowX: "auto",
        }}
      >
        {CONTROL_TOWER_TABS.map((item) => {
          const active = item.id === tab;
          return (
            <button
              type="button"
              role="tab"
              aria-selected={active}
              key={item.id}
              onClick={() => setTab(item.id)}
              style={{
                border: 0,
                borderBottom: `2px solid ${active ? C.cyan : "transparent"}`,
                background: "transparent",
                color: active ? C.text : C.dim,
                padding: "9px 12px",
                fontFamily: C.mono,
                fontSize: 11,
                whiteSpace: "nowrap",
                cursor: "pointer",
              }}
            >
              {item.label}
            </button>
          );
        })}
      </div>
      {tab === "run-console" ? (
        <RunConsole />
      ) : (
        <AgentBuilder tab={tab} onOpenBuilder={() => setTab("builder")} />
      )}
    </div>
  );
}
