"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  getGovernance, getEvals, getUsefulness, getMcpTools,
  type GovernanceSummary, type EvalResults, type UsefulnessSummary, type ArmMeasures,
  type SecurityPosture, type PostureControl, type McpToolsResponse,
} from "@/lib/telemetry/copilot-api";
import {
  C, Tag, Panel, MetricCard, Loading, ErrorState, PageHeading, DisclosureFooter,
  StatGrid, SplitGrid, ScrollTable, ResponsiveSwap, RowCard,
} from "./primitives";

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
  const [u, setU] = useState<UsefulnessSummary | null>(null);
  const [mcp, setMcp] = useState<McpToolsResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      getGovernance(),
      getEvals().catch(() => null),
      getUsefulness().catch(() => null),
      getMcpTools().catch(() => null),
    ])
      .then(([gov, ev, use, tools]) => { setG(gov); setE(ev); setU(use); setMcp(tools); })
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

      {/* security & access posture — enforced controls vs honest boundaries */}
      <PosturePanel p={g.security_posture} />

      {/* telemetry MCP tools (read-only) + scope-denial policy */}
      <McpToolsPanel m={mcp} />

      {/* metric strip */}
      <StatGrid cols={4} style={{ marginTop: 16 }}>
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
      </StatGrid>

      {/* operator usefulness (within-reviewer A/B) */}
      <UsefulnessPanel u={u} />

      {/* evals + production smoke */}
      <SplitGrid variant="main-side" style={{ marginTop: 16 }}>
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
      </SplitGrid>

      {/* recent interactions */}
      <Panel title="Recent interactions" right={<Tag color={C.cyan}>{g.recent_interactions.length} shown</Tag>} style={{ marginTop: 16 }}>
        <ResponsiveSwap
          mobile={
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {g.recent_interactions.map((r, i) => (
                <RowCard key={i}
                  title={<span style={{ fontWeight: 400, color: C.dim }}>{r.question || "—"}</span>}
                  tags={<Tag color={r.is_refusal ? C.amber : C.dim}>{r.is_refusal ? "refusal" : (r.intent || "—")}</Tag>}
                  fields={[
                    { label: "When", value: r.created_at ? r.created_at.replace("T", " ").slice(0, 19) : "—" },
                    { label: "ms", value: r.elapsed_ms ?? "—" },
                    { label: "Source", value: `${r.answer_source}${r.fallback_reason ? `:${r.fallback_reason}` : ""}` },
                  ]} />
              ))}
            </div>
          }
          desktop={
            <>
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
            </>
          } />
      </Panel>

      {/* refusal + blocked examples */}
      <SplitGrid variant="halves" style={{ marginTop: 16 }}>
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
              None recorded — every live answer had its ids and numbers traced to evidence.
            </span>
          ) : g.unsupported_blocked_examples.map((r, i) => (
            <div key={i} style={{ fontFamily: C.mono, fontSize: 11, color: C.dim, padding: "5px 0", borderBottom: `1px solid ${C.border}`, lineHeight: 1.4 }}>
              <span style={{ color: C.red }}>blocked</span> — {r.question}
            </div>
          ))}
        </Panel>
      </SplitGrid>

      <DisclosureFooter />
    </>
  );
}

// ── Security & access posture — enforced controls vs honest boundaries (never styled as failures) ──
function PostureList({ items, kind }: { items: PostureControl[]; kind: "enforced" | "gap" }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {items.map((it, i) => {
        const dot = kind === "enforced" ? C.green : it.status === "not_applicable" ? C.faint : C.amber;
        return (
          <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
            <span style={{ width: 6, height: 6, borderRadius: 999, background: dot, boxShadow: `0 0 6px ${dot}`, marginTop: 5, flexShrink: 0 }} />
            <div>
              <div style={{ fontFamily: C.mono, fontSize: 12, color: C.text }}>
                {it.control}
                {kind === "gap" && it.status ? (
                  <span style={{ color: it.status === "not_applicable" ? C.faint : C.amber, fontSize: 10, marginLeft: 6 }}>
                    {it.status === "not_applicable" ? "N/A" : "not enforced"}
                  </span>
                ) : null}
              </div>
              <div style={{ fontFamily: C.mono, fontSize: 10.5, color: C.faint, lineHeight: 1.45 }}>{it.detail}</div>
              <div style={{ fontFamily: C.mono, fontSize: 9.5, color: C.faint, opacity: 0.8, marginTop: 2 }}>↳ {it.evidence}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

const SubHead = ({ children }: { children: ReactNode }) => (
  <div style={{ fontFamily: C.mono, fontSize: 10, color: C.faint, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 8 }}>{children}</div>
);

function PosturePanel({ p }: { p?: SecurityPosture | null }) {
  if (!p) {
    return (
      <Panel title="Security & access posture" style={{ marginTop: 16 }}>
        <span style={{ fontFamily: C.mono, fontSize: 12, color: C.amber }}>Not available.</span>
      </Panel>
    );
  }
  return (
    <Panel title="Security & access posture" style={{ marginTop: 16 }}
      right={<Tag color={C.green}>{p.rls_enabled_count}/{p.tel_table_count} tel_* RLS</Tag>}>
      <div style={{ fontFamily: C.mono, fontSize: 10.5, color: C.faint, marginBottom: 12, lineHeight: 1.5 }}>
        What protects tenant data on this surface — and what it explicitly does not claim. Honest
        boundaries are not failures: they mark where a capability is out of scope or enforced elsewhere.
      </div>
      <SplitGrid variant="halves">
        <div>
          <SubHead>Enforced controls</SubHead>
          <PostureList items={p.enforced} kind="enforced" />
        </div>
        <div>
          <SubHead>Not enforced / not applicable</SubHead>
          <PostureList items={p.not_enforced} kind="gap" />
        </div>
      </SplitGrid>
    </Panel>
  );
}

// ── Operator usefulness (within-reviewer A/B) — human metrics are honest-null until real sessions ──
const NOT_MEASURED = "not yet measured (N=0)";

function armCell(a: ArmMeasures | undefined, fld: keyof ArmMeasures, kind: "ms" | "pct" | "num"): string {
  if (!a || a.n === 0) return NOT_MEASURED;
  const v = a[fld];
  if (v == null) return NOT_MEASURED;
  if (kind === "ms") return `${v}ms`;
  if (kind === "pct") return `${Math.round((v as number) * 100)}%`;
  return String(v);
}

function UsefulnessPanel({ u }: { u: UsefulnessSummary | null }) {
  const asg = u?.arms?.assisted;
  const una = u?.arms?.unassisted;
  const measured = u?.status === "measured";
  const ROWS: { label: string; fld: keyof ArmMeasures; kind: "ms" | "pct" | "num" }[] = [
    { label: "Median time-to-verdict", fld: "median_ttv_ms", kind: "ms" },
    { label: "Agreement vs label", fld: "agreement_rate", kind: "pct" },
    { label: "Override rate", fld: "override_rate", kind: "pct" },
    { label: "Override precision (vs label)", fld: "override_precision", kind: "pct" },
    { label: "Evidence-open rate", fld: "evidence_open_rate", kind: "pct" },
    { label: "Mean confidence (1–5)", fld: "mean_confidence", kind: "num" },
  ];
  const delta = u?.delta?.ttv_pct_faster;
  return (
    <Panel title="Operator usefulness (within-reviewer A/B)" style={{ marginTop: 16 }}
      right={<Tag color={measured ? C.green : C.faint}>{measured ? "measured" : "awaiting sessions"}</Tag>}>
      <div style={{ fontFamily: C.sans, fontSize: 14, color: delta != null ? C.green : C.faint, fontWeight: 600, marginBottom: 4 }}>
        {delta != null ? `Time-to-verdict ${delta}% faster with the copilot` : "Time-to-verdict delta — awaiting sessions in both arms"}
      </div>
      <div style={{ fontFamily: C.mono, fontSize: 10.5, color: C.faint, marginBottom: 12, lineHeight: 1.5 }}>
        Human-outcome measures populate from real recorded review sessions (Copilot tab → “Record your review”).
        Until then they read “not measured”, never a placeholder zero. Deterministic anchors below are live now.
      </div>
      {/* six measures × two arms, N in the header */}
      <ScrollTable minWidth={560}>
        <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr 1fr", gap: 8, fontFamily: C.mono,
          fontSize: 10, color: C.faint, letterSpacing: "0.06em", textTransform: "uppercase", paddingBottom: 6 }}>
          <span>Measure</span>
          <span>assisted (N={asg?.n ?? 0})</span>
          <span>unassisted (N={una?.n ?? 0})</span>
        </div>
        <div style={{ borderTop: `1px solid ${C.border}` }}>
          {ROWS.map((row) => (
            <div key={row.label} style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr 1fr", gap: 8,
              fontFamily: C.mono, fontSize: 11.5, color: C.text, padding: "7px 0", borderBottom: `1px solid ${C.border}` }}>
              <span style={{ color: C.dim }}>{row.label}</span>
              <Cell v={armCell(asg, row.fld, row.kind)} />
              <Cell v={armCell(una, row.fld, row.kind)} />
            </div>
          ))}
        </div>
      </ScrollTable>
      {/* deterministic anchors — real now, not self-reported */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 16, marginTop: 12, paddingTop: 10, borderTop: `1px solid ${C.border}` }}>
        <Anchor k="Unsupported claims blocked" v={u ? String(u.anchors.postvalidator_block_count) : "—"} col={C.red} />
        <Anchor k="Refusal rate" v={pct(u?.anchors.refusal_rate) ?? "—"} col={C.amber} />
        <Anchor k="Grounded rate" v={pct(u?.anchors.grounded_rate) ?? "—"} col={C.green} />
        <span style={{ fontFamily: C.mono, fontSize: 10, color: C.faint, alignSelf: "center" }}>
          deterministic anchors — measured from the audit log (tel_copilot_interactions), not self-reported
        </span>
      </div>
    </Panel>
  );
}

function Cell({ v }: { v: string }) {
  const dim = v === NOT_MEASURED;
  return <span style={{ color: dim ? C.faint : C.text, fontWeight: dim ? 400 : 600 }}>{v}</span>;
}

function Anchor({ k, v, col }: { k: string; v: string; col: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <span style={{ fontFamily: C.mono, fontSize: 9.5, letterSpacing: "0.08em", color: C.faint, textTransform: "uppercase" }}>{k}</span>
      <span style={{ fontFamily: C.sans, fontSize: 16, fontWeight: 600, color: col }}>{v}</span>
    </div>
  );
}
