"use client";

import { useEffect, useState } from "react";

import {
  getSkills, getRuns, runSkill,
  type SkillsResponse, type RunsResponse, type RunResult, type OpsSkill,
} from "@/lib/ade-ops/api";
import {
  C, Panel, Tag, PageHeading, Loading, ErrorState, EmptyState, UnavailableState,
  statusColor, tierColor,
} from "./primitives";

// Demo tenant for the read-only console; any env can pass its own business id later.
const ADE_OPS_DEMO_BUSINESS_ID = "7e1eb000-0000-4000-a000-000000000001";

export default function AdeOpsConsole({ envId }: { envId: string }) {
  const [skills, setSkills] = useState<SkillsResponse | null>(null);
  const [runs, setRuns] = useState<RunsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RunResult | null>(null);
  const [running, setRunning] = useState<string | null>(null);

  useEffect(() => {
    getSkills().then(setSkills).catch((e) => setError(String(e)));
    getRuns(ADE_OPS_DEMO_BUSINESS_ID, envId).then(setRuns).catch(() => setRuns({ runs: [], null_reason: "runs_read_unavailable" }));
  }, [envId]);

  async function onRun(skill: OpsSkill) {
    setRunning(skill.name);
    setResult(null);
    try {
      const inputs = skill.name === "ade.lineage.trust_number" ? { metric_name: "NOI" } : {};
      const r = await runSkill(skill.name, inputs, ADE_OPS_DEMO_BUSINESS_ID, envId);
      setResult(r);
    } catch (e) {
      setResult(null);
      setError(String(e));
    } finally {
      setRunning(null);
    }
  }

  const heading = (
    <PageHeading eyebrow="Agentic Data Engineering" title="ADE Ops Orchestrator"
      blurb="A governed supervisor-of-skills: Observe → Diagnose → Recommend → Plan → Approve → Execute → Watch. PR 1 is read-only — recommendations only, no writes. Every result is real evidence or an explicit null_reason; nothing is fabricated." />
  );

  if (error) return <div style={{ background: C.bg, minHeight: "100vh", padding: 28 }}>{heading}<ErrorState message={error} /></div>;
  if (!skills) return <div style={{ background: C.bg, minHeight: "100vh", padding: 28 }}>{heading}<Loading label="Loading skill catalog…" /></div>;

  const lanes = Array.from(new Set(skills.skills.map((s) => s.lane)));

  return (
    <div style={{ background: C.bg, minHeight: "100vh", padding: 28 }}>
      {heading}

      {/* Capability claim — brutally honest about what is and isn't wired. */}
      <Panel title="Capability claim" right={<Tag color={C.amber}>honest scope</Tag>} style={{ marginBottom: 16 }}>
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          <div>
            <div style={{ fontFamily: C.mono, fontSize: 11, color: C.green, textTransform: "uppercase", letterSpacing: "0.1em" }}>Available now</div>
            <p style={{ fontFamily: C.sans, fontSize: 12, color: C.dim, marginTop: 6, lineHeight: 1.5 }}>Governed ops inventory · MCP skill registry · execution receipts · trust signals (from the decision log).</p>
          </div>
          <div>
            <div style={{ fontFamily: C.mono, fontSize: 11, color: C.amber, textTransform: "uppercase", letterSpacing: "0.1em" }}>Not configured yet</div>
            <p style={{ fontFamily: C.sans, fontSize: 12, color: C.dim, marginTop: 6, lineHeight: 1.5 }}>Cloud freshness · cloud cost · cloud right-sizing (Snowflake/Databricks/GCP/AWS adapters land in later PRs). These fail closed with a null_reason.</p>
          </div>
          <div>
            <div style={{ fontFamily: C.mono, fontSize: 11, color: C.red, textTransform: "uppercase", letterSpacing: "0.1em" }}>Write capability</div>
            <p style={{ fontFamily: C.sans, fontSize: 12, color: C.dim, marginTop: 6, lineHeight: 1.5 }}>Intentionally disabled. Tier ≥2 skills are visible but cannot execute in PR 1.</p>
          </div>
        </div>
      </Panel>

      {/* Last run result */}
      {result && (
        <Panel title={`Result · ${result.name}`} right={<Tag color={statusColor(result.status)}>{result.status}</Tag>} style={{ marginBottom: 16 }}>
          {result.recommendation && <p style={{ fontFamily: C.sans, fontSize: 13, color: C.text, lineHeight: 1.55 }}>{result.recommendation}</p>}
          {result.null_reason && <div style={{ fontFamily: C.mono, fontSize: 11, color: C.amber, marginTop: 8 }}>null_reason: {result.null_reason}</div>}
          {result.evidence.length > 0 && (
            <div style={{ marginTop: 10 }}>
              {result.evidence.map((e, i) => (
                <div key={i} style={{ fontFamily: C.mono, fontSize: 11, color: C.dim, padding: "4px 0", borderTop: `1px solid ${C.border}` }}>
                  <span style={{ color: C.text }}>{e.label}</span> = {String(e.value)} <span style={{ color: C.faint }}>· src: {e.source}</span>
                </div>
              ))}
            </div>
          )}
          <div style={{ fontFamily: C.mono, fontSize: 10, color: C.faint, marginTop: 10 }}>receipt: {result.receipt_status}{result.receipt_id ? ` (${result.receipt_id})` : ""}</div>
        </Panel>
      )}

      {/* Skill catalog grouped by lane (the 10 ops lanes) */}
      {lanes.map((lane) => (
        <Panel key={lane} title={lane} style={{ marginBottom: 12 }}>
          <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
            {skills.skills.filter((s) => s.lane === lane).map((s) => (
              <div key={s.name} style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: 12 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <span style={{ fontFamily: C.mono, fontSize: 12, color: C.text }}>{s.name}</span>
                  <Tag color={tierColor(s.risk_tier)}>tier {s.risk_tier}</Tag>
                </div>
                <p style={{ fontFamily: C.sans, fontSize: 12, color: C.dim, marginTop: 6, lineHeight: 1.5 }}>{s.description}</p>
                <div style={{ marginTop: 8 }}>
                  {s.executable ? (
                    <button type="button" onClick={() => onRun(s)} disabled={running === s.name}
                      style={{ fontFamily: C.mono, fontSize: 11, color: C.accent, background: C.accent + "18",
                        border: `1px solid ${C.accent}40`, borderRadius: 6, padding: "4px 10px", cursor: "pointer" }}>
                      {running === s.name ? "Running…" : "Run (read-only)"}
                    </button>
                  ) : (
                    <Tag color={C.red}>Not available — write capability not enabled</Tag>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Panel>
      ))}

      {/* Receipts feed */}
      <Panel title="Execution receipts" style={{ marginTop: 16 }}>
        {!runs ? <Loading label="Loading receipts…" />
          : runs.null_reason ? <UnavailableState nullReason={runs.null_reason} />
          : runs.runs.length === 0 ? <EmptyState label="No receipts yet" hint="Run a read-only command above to produce the first governed receipt." />
          : (
            <div>
              {runs.runs.map((r, i) => (
                <div key={i} style={{ fontFamily: C.mono, fontSize: 11, color: C.dim, padding: "6px 0", borderTop: `1px solid ${C.border}` }}>
                  <span style={{ color: C.text }}>{r.skill}</span> · {r.success ? "ok" : "not-ok"} · {r.actor} · {r.created_at}
                </div>
              ))}
            </div>
          )}
      </Panel>
    </div>
  );
}
