"use client";

import { useEffect, useState } from "react";
import {
  getGovernance, getEvals,
  type GovernanceSummary, type EvalResults,
} from "@/lib/telemetry/copilot-api";
import { C, Tag, Panel, MetricCard, Loading, ErrorState, PageHeading, DisclosureFooter } from "./primitives";

const pct = (x: number | null | undefined) => (x == null ? null : `${Math.round(x * 100)}%`);
const ms = (x: number | null | undefined) => (x == null ? null : `${x}ms`);

// Render a metric, or an explicit "Not available" (never a misleading zero) when the value is null.
function GovMetric({ label, value, sub, accent }: { label: string; value: string | null; sub?: string; accent?: string }) {
  const unavailable = value == null;
  return (
    <MetricCard label={label} value={unavailable ? "Not available" : value}
      sub={sub} accent={unavailable ? C.faint : accent} />
  );
}

const PROVES: { k: string; v: string }[] = [
  { k: "Fixed intent planning", v: "questions classify to one of a frozen intent set; the LLM never plans" },
  { k: "Allow-listed tools", v: "a tool not in the allow-list cannot run; the LLM cannot select tools" },
  { k: "Pre-tool refusals", v: "root-cause / safety / proprietary questions refused before any tool or model call" },
  { k: "Post-generation validation", v: "every id/number in a live answer must trace to evidence, else fall back" },
  { k: "Audit receipts", v: "every interaction + report is a logged row with prompt-version provenance" },
  { k: "Human review required", v: "every drafted report is labeled requires_human_review" },
];

export default function GovernanceDashboard() {
  const [g, setG] = useState<GovernanceSummary | null>(null);
  const [e, setE] = useState<EvalResults | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([getGovernance(), getEvals().catch(() => null)])
      .then(([gov, ev]) => { setG(gov); setE(ev); })
      .catch((x) => setErr(String(x)));
  }, []);

  const head = (
    <PageHeading eyebrow="AI Governance"
      title="Can we trust the AI layer — and how do we know?"
      blurb="Every number on this page is aggregated from real logged copilot interactions and a real eval run. Nothing is hardcoded. Where a metric isn't available, it says so." />
  );
  if (err) return <>{head}<ErrorState message={err} /></>;
  if (!g) return <>{head}<Loading label="Loading governance metrics…" /></>;

  const sm = g.production_smoke || { status: "not_available" };
  const tool = g.tool_call_stats || {};
  const toolTotal = Object.values(tool).reduce((a, b) => a + b, 0);
  const toolErr = tool.error || 0;

  return (
    <>
      {head}

      {/* What this proves */}
      <Panel title="What this proves">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 10 }}>
          {PROVES.map((p) => (
            <div key={p.k} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
              <span style={{ width: 6, height: 6, borderRadius: 999, background: C.green, boxShadow: `0 0 6px ${C.green}`, marginTop: 5, flexShrink: 0 }} />
              <div>
                <div style={{ fontFamily: C.mono, fontSize: 12, color: C.text }}>{p.k}</div>
                <div style={{ fontFamily: C.mono, fontSize: 10.5, color: C.faint, lineHeight: 1.45 }}>{p.v}</div>
              </div>
            </div>
          ))}
        </div>
      </Panel>

      {/* metric strip */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginTop: 16 }}>
        <GovMetric label="Grounded answer rate" value={pct(g.grounded_rate)} accent={C.green}
          sub={`${g.total_interactions} logged interactions`} />
        <GovMetric label="Refusal rate" value={pct(g.refusal_rate)} accent={C.amber}
          sub={`${g.refusal_rule_count} refusal rules`} />
        <GovMetric label="Fallback (template) rate" value={pct(g.fallback_rate)} accent={C.cyan}
          sub={`live-LLM ${pct(g.live_llm_rate) ?? "—"}`} />
        <GovMetric label="Post-validator blocks" value={String(g.postvalidator_block_count)} accent={C.red}
          sub="ungrounded answers caught" />
        <GovMetric label="p50 latency" value={ms(g.p50_ms)} />
        <GovMetric label="p95 latency" value={ms(g.p95_ms)} />
        <GovMetric label="Tool calls" value={toolTotal ? `${toolTotal}` : null} accent={C.green}
          sub={`${tool.success || 0} ok · ${toolErr} error · ${tool.skipped || 0} skipped`} />
        <GovMetric label="Active model" value={g.active_model || null}
          sub={`prompt ${g.active_prompt_version}`} />
      </div>

      {/* evals + production smoke */}
      <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr", gap: 16, marginTop: 16 }}>
        <Panel title="Eval suite"
          right={e?.summary ? <Tag color={e.summary.passed === e.summary.total ? C.green : C.red}>{e.summary.passed}/{e.summary.total} pass</Tag> : <Tag color={C.faint}>not available</Tag>}>
          {!e || !e.available ? (
            <span style={{ fontFamily: C.mono, fontSize: 12, color: C.amber }}>
              Not available{e?.null_reason ? ` (${e.null_reason})` : ""}.
            </span>
          ) : (
            <>
              {e.cases.map((c) => (
                <div key={c.key} style={{ display: "flex", alignItems: "flex-start", gap: 9, padding: "7px 0", borderBottom: `1px solid ${C.border}` }}>
                  <span style={{ width: 7, height: 7, borderRadius: 999, marginTop: 5, flexShrink: 0,
                    background: c.status === "pass" ? C.green : C.red, boxShadow: `0 0 6px ${c.status === "pass" ? C.green : C.red}` }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontFamily: C.mono, fontSize: 12, color: C.text }}>{c.title}</div>
                    <div style={{ fontFamily: C.mono, fontSize: 10, color: C.faint }}>{c.key} · {c.pytest_summary || ""}</div>
                  </div>
                  <Tag color={c.status === "pass" ? C.green : C.red}>{c.status}</Tag>
                </div>
              ))}
              <div style={{ fontFamily: C.mono, fontSize: 10.5, color: C.faint, marginTop: 10 }}>
                last run {e.generated_at} · source {e.source}
              </div>
            </>
          )}
        </Panel>

        <Panel title="Production smoke"
          right={<Tag color={sm.status === "pass" ? C.green : C.amber}>{sm.status}</Tag>}>
          {sm.status === "not_available" ? (
            <span style={{ fontFamily: C.mono, fontSize: 12, color: C.amber }}>
              Not available{sm.null_reason ? ` (${sm.null_reason})` : ""}.
            </span>
          ) : (
            <>
              <div style={{ fontFamily: C.mono, fontSize: 11, color: C.dim, marginBottom: 8 }}>
                last recorded {sm.recorded_at} · {sm.automated ? "automated" : "manual"} · backend {sm.deployed_backend_sha}
              </div>
              {(sm.checks || []).map((ck, i) => (
                <div key={i} style={{ display: "flex", gap: 7, padding: "4px 0", fontFamily: C.mono, fontSize: 10.5 }}>
                  <span style={{ color: ck.result === "pass" ? C.green : C.red }}>{ck.result === "pass" ? "✓" : "✗"}</span>
                  <span style={{ color: C.dim }}>{ck.name}</span>
                </div>
              ))}
              <div style={{ fontFamily: C.mono, fontSize: 10, color: C.faint, marginTop: 8, lineHeight: 1.4 }}>{sm.source}</div>
            </>
          )}
        </Panel>
      </div>

      {/* recent interactions */}
      <Panel title="Recent interactions" right={<Tag color={C.cyan}>{g.recent_interactions.length} shown</Tag>} style={{ marginTop: 16 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1.1fr 0.8fr 0.9fr 0.5fr 1.6fr", gap: 8, fontFamily: C.mono,
          fontSize: 10, color: C.faint, letterSpacing: "0.06em", textTransform: "uppercase", paddingBottom: 6 }}>
          <span>When</span><span>Intent</span><span>Source</span><span>ms</span><span>Question</span>
        </div>
        <div style={{ borderTop: `1px solid ${C.border}` }}>
          {g.recent_interactions.map((r, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "1.1fr 0.8fr 0.9fr 0.5fr 1.6fr", gap: 8,
              fontFamily: C.mono, fontSize: 11, color: C.text, padding: "6px 0", borderBottom: `1px solid ${C.border}` }}>
              <span style={{ color: C.dim }}>{r.created_at ? r.created_at.replace("T", " ").slice(0, 19) : "—"}</span>
              <span style={{ color: r.is_refusal ? C.amber : C.dim }}>{r.is_refusal ? "refusal" : (r.intent || "—")}</span>
              <span style={{ color: r.answer_source === "live_llm" ? C.green : r.answer_source === "refusal" ? C.amber : C.cyan }}>
                {r.answer_source}{r.fallback_reason ? `:${r.fallback_reason}` : ""}
              </span>
              <span style={{ color: C.faint }}>{r.elapsed_ms ?? "—"}</span>
              <span style={{ color: C.dim, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.question || "—"}</span>
            </div>
          ))}
        </div>
      </Panel>

      {/* refusal + blocked examples */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 16 }}>
        <Panel title="Recent refusals (out-of-scope)">
          {g.recent_refusals.length === 0 ? (
            <span style={{ fontFamily: C.mono, fontSize: 11, color: C.faint }}>None recorded.</span>
          ) : g.recent_refusals.map((r, i) => (
            <div key={i} style={{ fontFamily: C.mono, fontSize: 11, color: C.dim, padding: "5px 0", borderBottom: `1px solid ${C.border}`, lineHeight: 1.4 }}>
              <span style={{ color: C.amber }}>⛔ {r.null_reason}</span> — {r.question}
            </div>
          ))}
        </Panel>
        <Panel title="Unsupported claims blocked (post-validator)">
          {g.unsupported_blocked_examples.length === 0 ? (
            <span style={{ fontFamily: C.mono, fontSize: 11, color: C.faint }}>
              None recorded — every live answer's ids/numbers traced to evidence.
            </span>
          ) : g.unsupported_blocked_examples.map((r, i) => (
            <div key={i} style={{ fontFamily: C.mono, fontSize: 11, color: C.dim, padding: "5px 0", borderBottom: `1px solid ${C.border}`, lineHeight: 1.4 }}>
              <span style={{ color: C.red }}>blocked</span> — {r.question}
            </div>
          ))}
        </Panel>
      </div>

      <DisclosureFooter />
    </>
  );
}
