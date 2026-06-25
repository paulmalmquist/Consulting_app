"use client";

import { useEffect, useState } from "react";
import {
  askCopilot, explainVerdict, getGovernance, draftReport, recordDisposition,
  type CopilotResponse, type EvidenceItem, type ToolTraceItem, type GovernanceSummary,
  type DraftReportResponse, type DispositionResult,
} from "@/lib/telemetry/copilot-api";
import { C, Tag, Panel, Loading } from "./primitives";
import { TelemetryPageHeader } from "./TelemetryPageHeader";

export interface ReportContext { runKey: string; fireTick: number; channel?: string }

// ── source / status colors ────────────────────────────────────────────────────
const sourceColor = (s?: string) =>
  s === "live_llm" ? C.green : s === "refusal" ? C.amber : C.cyan;
const statusColor = (s: string) =>
  s === "success" ? C.green : s === "error" ? C.red : C.faint;

function fmt(v: unknown): string {
  if (v == null) return "—";
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : v.toFixed(6).replace(/0+$/, "").replace(/\.$/, "");
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

// ── Evidence card (one grounded fact, real id) ─────────────────────────────────
export function EvidenceCard({ e, onOpen }: { e: EvidenceItem; onOpen?: () => void }) {
  const [open, setOpen] = useState(false);
  const meta = Object.entries(e.metadata || {}).filter(([, v]) => v != null);
  const toggle = () => setOpen((o) => { if (!o) onOpen?.(); return !o; });
  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: 12, background: C.panel }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <Tag color={C.cyan}>{e.type}</Tag>
        {e.value != null && (
          <span style={{ fontFamily: C.sans, fontSize: 18, fontWeight: 600, color: C.text }}>{fmt(e.value)}</span>
        )}
      </div>
      <div style={{ fontFamily: C.mono, fontSize: 11, color: C.dim, marginTop: 7 }}>{e.label}</div>
      {e.id && (
        <div style={{ fontFamily: C.mono, fontSize: 11, color: C.faint, marginTop: 4, wordBreak: "break-all" }}>{e.id}</div>
      )}
      {meta.length > 0 && (
        <>
          <button type="button" onClick={toggle}
            style={{ fontFamily: C.mono, fontSize: 10, color: C.cyan, background: "transparent",
              border: "none", padding: 0, marginTop: 8, cursor: "pointer" }}>
            {open ? "− hide" : "+ details"}
          </button>
          {open && (
            <div style={{ marginTop: 6, display: "grid", gridTemplateColumns: "auto 1fr", gap: "3px 10px" }}>
              {meta.map(([k, v]) => (
                <Fragmentish key={k} k={k} v={fmt(v)} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Fragmentish({ k, v }: { k: string; v: string }) {
  return (
    <>
      <span style={{ fontFamily: C.mono, fontSize: 10, color: C.faint }}>{k}</span>
      <span style={{ fontFamily: C.mono, fontSize: 10, color: C.dim, wordBreak: "break-all" }}>{v}</span>
    </>
  );
}

// ── Tool trace row (the evidence trail) ────────────────────────────────────────
export function ToolTraceRow({ t }: { t: ToolTraceItem }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 9, padding: "7px 0",
      borderBottom: `1px solid ${C.border}` }}>
      <span style={{ width: 6, height: 6, borderRadius: 999, background: statusColor(t.status),
        marginTop: 5, flexShrink: 0, boxShadow: `0 0 6px ${statusColor(t.status)}` }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
          <span style={{ fontFamily: C.mono, fontSize: 11.5, color: C.text }}>{t.tool_name}</span>
          <span style={{ fontFamily: C.mono, fontSize: 10, color: C.faint }}>{t.duration_ms}ms</span>
        </div>
        <div style={{ fontFamily: C.mono, fontSize: 10.5, color: C.dim, marginTop: 2 }}>
          <span style={{ color: statusColor(t.status) }}>{t.status}</span> · {t.result_summary}
        </div>
      </div>
    </div>
  );
}

// ── Governance strip (reads only the response — one source of truth) ───────────
export function GovernanceStrip({ r }: { r: CopilotResponse }) {
  const cells: [string, string, string][] = [
    ["answer source", r.answer_source, sourceColor(r.answer_source)],
    ["grounded", r.is_refusal ? "refused" : `${r.evidence.length} evidence`, r.is_refusal ? C.amber : C.green],
    ["null reason", r.null_reason || "none", r.null_reason ? C.amber : C.faint],
    ["prompt", r.prompt_version, C.dim],
    ["model", r.model, C.dim],
  ];
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 14, padding: "10px 12px",
      border: `1px solid ${C.border}`, borderRadius: 8, background: C.rail }}>
      {cells.map(([k, v, col]) => (
        <div key={k} style={{ display: "flex", flexDirection: "column" }}>
          <span style={{ fontFamily: C.mono, fontSize: 9.5, letterSpacing: "0.1em", color: C.faint, textTransform: "uppercase" }}>{k}</span>
          <span style={{ fontFamily: C.mono, fontSize: 11, color: col }}>{v}</span>
        </div>
      ))}
    </div>
  );
}

// ── Answer block (renders the markdown-ish prose simply) ───────────────────────
function AnswerBody({ r }: { r: CopilotResponse }) {
  const col = r.is_refusal ? C.amber : C.text;
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <Tag color={sourceColor(r.answer_source)}>{r.is_refusal ? "refused" : r.answer_source}</Tag>
        {!r.is_refusal && <span style={{ fontFamily: C.mono, fontSize: 10, color: C.faint }}>assistant-generated draft — human review required</span>}
      </div>
      <p style={{ fontFamily: C.sans, fontSize: 13.5, color: col, lineHeight: 1.6, whiteSpace: "pre-wrap", margin: 0 }}>
        {r.answer}
      </p>
    </div>
  );
}

// ── Draft test report (Phase 7) — the reviewable artifact ──────────────────────
function downloadMarkdown(name: string, md: string) {
  const blob = new Blob([md], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}

export function DraftReportCard({ report }: { report: DraftReportResponse }) {
  if (report.null_reason && !report.generated_markdown) {
    return (
      <Panel title="Draft test report" right={<Tag color={C.amber}>{report.null_reason}</Tag>}>
        <span style={{ fontFamily: C.mono, fontSize: 12, color: C.amber }}>
          Cannot draft a report: no grounded evidence for this run ({report.null_reason}). Fail-closed —
          nothing was generated or stored.
        </span>
      </Panel>
    );
  }
  const md = report.generated_markdown || "";
  return (
    <Panel title="Draft test report"
      right={<Tag color={C.amber}>requires human review</Tag>}>
      <div style={{ border: `1px solid ${C.amber}55`, background: C.amber + "12", borderRadius: 8,
        padding: "8px 12px", marginBottom: 12 }}>
        <span style={{ fontFamily: C.mono, fontSize: 11, color: C.amber, letterSpacing: "0.04em" }}>
          ASSISTANT-GENERATED DRAFT — REQUIRES HUMAN REVIEW
        </span>
      </div>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 12 }}>
        <Meta k="report receipt" v={report.report_id || "—"} />
        <Meta k="run" v={report.run_key || "—"} />
        <Meta k="prediction receipt" v={report.receipt_id || "—"} />
        <Meta k="prompt" v={report.prompt_version} />
      </div>
      <pre style={{ fontFamily: C.mono, fontSize: 11.5, color: C.text, lineHeight: 1.55,
        whiteSpace: "pre-wrap", wordBreak: "break-word", background: C.bg, border: `1px solid ${C.border}`,
        borderRadius: 8, padding: 14, margin: 0, maxHeight: 460, overflow: "auto" }}>{md}</pre>
      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <button type="button" onClick={() => downloadMarkdown(`test-report-${report.run_key || "run"}.md`, md)}
          style={{ fontFamily: C.mono, fontSize: 12, color: C.bg, background: C.cyan, border: "none",
            borderRadius: 7, padding: "8px 14px", cursor: "pointer" }}>
          Download .md
        </button>
      </div>
    </Panel>
  );
}

function Meta({ k, v }: { k: string; v: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <span style={{ fontFamily: C.mono, fontSize: 9.5, letterSpacing: "0.1em", color: C.faint, textTransform: "uppercase" }}>{k}</span>
      <span style={{ fontFamily: C.mono, fontSize: 11, color: C.dim, wordBreak: "break-all" }}>{v}</span>
    </div>
  );
}

// ── Full result (answer + evidence + trail + governance + draft-report action) ──
export function CopilotResult({ r, reportContext }: { r: CopilotResponse; reportContext?: ReportContext }) {
  const [report, setReport] = useState<DraftReportResponse | null>(null);
  const [drafting, setDrafting] = useState(false);
  const [evidenceOpened, setEvidenceOpened] = useState(0);
  const canDraft = !!reportContext && !r.is_refusal && r.evidence.length > 0;

  const onDraft = () => {
    if (!reportContext) return;
    setDrafting(true); setReport(null);
    draftReport({ run_key: reportContext.runKey, fire_tick: reportContext.fireTick, channel: reportContext.channel })
      .then(setReport)
      .catch((e) => setReport({ report_id: null, review_status: null, null_reason: String(e),
        generated_markdown: null, evidence: [], prompt_version: "" }))
      .finally(() => setDrafting(false));
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <Panel title="Answer"><AnswerBody r={r} /></Panel>
      {r.evidence.length > 0 && (
        <Panel title={`Evidence (${r.evidence.length})`}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 10 }}>
            {r.evidence.map((e, i) => <EvidenceCard key={i} e={e} onOpen={() => setEvidenceOpened((n) => n + 1)} />)}
          </div>
        </Panel>
      )}
      {r.tool_trace.length > 0 && (
        <Panel title="Evidence trail (tool calls)">
          {r.tool_trace.map((t, i) => <ToolTraceRow key={i} t={t} />)}
        </Panel>
      )}
      <GovernanceStrip r={r} />
      {canDraft && !report && (
        <button type="button" onClick={onDraft} disabled={drafting}
          style={{ alignSelf: "flex-start", fontFamily: C.mono, fontSize: 12, fontWeight: 600,
            color: C.bg, background: C.amber, border: "none", borderRadius: 8, padding: "9px 16px",
            cursor: drafting ? "default" : "pointer", opacity: drafting ? 0.6 : 1 }}>
          {drafting ? "Drafting report…" : "Draft test report →"}
        </button>
      )}
      {report && <DraftReportCard report={report} />}
      {report?.report_id && (
        // key on report_id so a freshly drafted report REMOUNTS the controls — never inherits a
        // previous report's started timer or recorded result (the "Start review didn't respond" bug).
        <DispositionControls key={report.report_id} reportId={report.report_id}
          modelVerdict={report.verdict ?? null}
          fireTick={reportContext?.fireTick ?? null} evidenceOpened={evidenceOpened} />
      )}
    </div>
  );
}

// ── Track B: capture the human's disposition (within-reviewer paired A/B) ───────
export function DispositionControls({ reportId, modelVerdict, fireTick, evidenceOpened }: {
  reportId: string; modelVerdict: string | null; fireTick: number | null; evidenceOpened: number;
}) {
  const [arm, setArm] = useState<"assisted" | "unassisted">("assisted");
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [confidence, setConfidence] = useState<number | null>(null);
  const [result, setResult] = useState<DispositionResult | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pairId] = useState<string>(() =>
    (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `pair-${Date.now()}`));

  // Defense in depth alongside the key= remount: if this instance is ever reused for a different
  // report, clear all per-review state so the timer/verdict can't inherit a stale started/result.
  useEffect(() => {
    setStartedAt(null);
    setResult(null);
    setConfidence(null);
    setErr(null);
    setArm("assisted");
  }, [reportId]);

  // Robust clock: some agent/browser harnesses break performance.now — fall back to Date.now so the
  // Start button can never silently dead-end (timing stays measured either way).
  const nowMs = () =>
    (typeof performance !== "undefined" && typeof performance.now === "function"
      ? performance.now() : Date.now());

  const startTimer = () => {
    try {
      setErr(null);
      setStartedAt(nowMs());
    } catch (e) {
      setErr(`Could not start the timer: ${String(e)}`);
    }
  };

  const submit = (human_verdict: "GO" | "NO_GO" | "DEFER") => {
    if (startedAt == null) {
      // Visible feedback instead of a silent no-op (the timer keeps TTV measured, never estimated).
      setErr("Start the timer first — time-to-verdict is measured.");
      return;
    }
    const time_to_verdict_ms = Math.round(nowMs() - startedAt);
    setErr(null);
    recordDisposition(reportId, {
      arm, human_verdict, fire_tick: fireTick, confidence, time_to_verdict_ms,
      evidence_opened: arm === "assisted" ? evidenceOpened : 0, pair_id: pairId,
    }).then(setResult).catch((e) => setErr(String(e)));
  };

  const armBtn = (a: "assisted" | "unassisted") => (
    <button type="button" data-testid={`disposition-arm-${a}`} onClick={() => setArm(a)} disabled={!!result}
      style={{ fontFamily: C.mono, fontSize: 11, padding: "5px 11px", borderRadius: 999, cursor: result ? "default" : "pointer",
        color: arm === a ? C.bg : C.dim, background: arm === a ? C.cyan : "transparent",
        border: `1px solid ${arm === a ? C.cyan : C.border}` }}>{a}</button>
  );
  const verdictBtn = (label: string, hv: "GO" | "NO_GO" | "DEFER", col: string) => (
    <button type="button"
      data-testid={`disposition-verdict-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")}`}
      onClick={() => submit(hv)} disabled={!!result}
      style={{ fontFamily: C.mono, fontSize: 12, fontWeight: 600, padding: "8px 13px", borderRadius: 7,
        color: C.bg, background: col, border: "none",
        cursor: result ? "default" : "pointer", opacity: startedAt == null || result ? 0.5 : 1 }}>
      {label}</button>
  );
  // Agree submits the model's literal verdict, so it only exists for GO/NO_GO; a REVIEW (or unknown)
  // model verdict has no "agree" target — the reviewer must explicitly choose GO/NO_GO/Defer.
  const canAgree = modelVerdict === "GO" || modelVerdict === "NO_GO";

  return (
    <Panel title="Record your review (operator usefulness A/B)"
      right={<Tag color={C.cyan}>measured, not self-reported</Tag>}>
      {result ? (
        <span style={{ fontFamily: C.mono, fontSize: 12, color: C.green }}>
          Recorded ({result.arm}{result.is_override ? " · override" : ""}). This disposition feeds the
          usefulness panel on the Governance tab.
        </span>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontFamily: C.mono, fontSize: 10, color: C.faint, textTransform: "uppercase", letterSpacing: "0.08em" }}>arm</span>
            {armBtn("assisted")}{armBtn("unassisted")}
            <span style={{ fontFamily: C.mono, fontSize: 10.5, color: C.faint }}>
              {arm === "unassisted" ? "decide from the raw verdict + chart only (the copilot help above is recorded as not used)" : "you used the copilot explanation + evidence"}
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <button type="button" data-testid="disposition-start" onClick={startTimer} disabled={startedAt != null}
              style={{ fontFamily: C.mono, fontSize: 12, fontWeight: 600, color: C.bg, background: startedAt != null ? C.faint : C.green,
                border: "none", borderRadius: 7, padding: "8px 13px", cursor: startedAt != null ? "default" : "pointer" }}>
              {startedAt != null ? "timing…" : "Start review (timer)"}
            </button>
            <span style={{ fontFamily: C.mono, fontSize: 10, color: C.faint }}>model verdict: {modelVerdict ?? "—"}</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontFamily: C.mono, fontSize: 10, color: C.faint, textTransform: "uppercase", letterSpacing: "0.08em" }}>confidence</span>
            {[1, 2, 3, 4, 5].map((c) => (
              <button key={c} type="button" data-testid={`disposition-confidence-${c}`}
                onClick={() => setConfidence(c)}
                style={{ fontFamily: C.mono, fontSize: 11, width: 40, height: 40, borderRadius: 6, cursor: "pointer",
                  color: confidence === c ? C.bg : C.dim, background: confidence === c ? C.cyan : "transparent",
                  border: `1px solid ${confidence === c ? C.cyan : C.border}` }}>{c}</button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {canAgree && verdictBtn(`Agree (${modelVerdict})`, modelVerdict as "GO" | "NO_GO", C.green)}
            {verdictBtn("Override → GO", "GO", C.cyan)}
            {verdictBtn("Override → NO_GO", "NO_GO", C.amber)}
            {verdictBtn("Defer", "DEFER", C.faint)}
          </div>
          {startedAt == null && (
            <span style={{ fontFamily: C.mono, fontSize: 10, color: C.faint }}>Start the timer to enable a verdict (time-to-verdict is measured, never estimated).</span>
          )}
          {err && <span style={{ fontFamily: C.mono, fontSize: 11, color: C.red }}>{err}</span>}
        </div>
      )}
    </Panel>
  );
}

// ── Replay-page panel: explain a NO-GO verdict ─────────────────────────────────
export function CopilotExplanationPanel({ runKey, fireTick, channel }: {
  runKey: string; fireTick: number; channel?: string;
}) {
  const [r, setR] = useState<CopilotResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setR(null); setError(null);
    explainVerdict({ run_key: runKey, fire_tick: fireTick, channel })
      .then((res) => { if (live) setR(res); })
      .catch((e) => { if (live) setError(String(e)); });
    return () => { live = false; };
  }, [runKey, fireTick, channel]);

  if (error) return <Panel title="Explain this verdict"><span style={{ fontFamily: C.mono, fontSize: 12, color: C.red }}>Could not load: {error}</span></Panel>;
  if (!r) return <Loading label="Grounding the explanation in real run evidence…" />;
  return <CopilotResult r={r} reportContext={{ runKey, fireTick, channel }} />;
}

// ── Dedicated /copilot workbench page ──────────────────────────────────────────
const CHIPS: { label: string; q: string; refusal?: boolean }[] = [
  { label: "Why NO-GO?", q: "Why did smap_msl:D-4:test flip to NO_GO at t=728?" },
  { label: "Which channel?", q: "Which channel drove the anomaly?" },
  { label: "What model?", q: "What model made this decision?" },
  { label: "Model performance", q: "How did the champion model perform out of sample (F1)?" },
  { label: "Point vs contextual?", q: "Was this a point or contextual anomaly per the labels?" },
  { label: "Show evidence", q: "Show the evidence and prediction receipt that supports this verdict." },
  { label: "Human follow-up", q: "What should a human reviewer inspect next?" },
  { label: "⛔ What caused it? (refusal demo)", q: "What physically caused the D-4 anomaly?", refusal: true },
];

export function CopilotWorkbench({ envId }: { envId: string }) {
  const [q, setQ] = useState("");
  const [r, setR] = useState<CopilotResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [gov, setGov] = useState<GovernanceSummary | null>(null);

  const refreshGov = () => getGovernance().then(setGov).catch(() => {});
  useEffect(() => { refreshGov(); }, []);

  const run = (question: string) => {
    setQ(question); setLoading(true); setR(null);
    askCopilot(question, { run_key: "smap_msl:D-4:test", fire_tick: 728, channel: "D-4" })
      .then((res) => setR(res))
      .catch((e) => setR({ answer: String(e), evidence: [], tool_trace: [], null_reason: "error",
        is_refusal: false, intent: null, answer_source: "fallback_template", prompt_version: "",
        model: "", draft_report_md: null, request_id: "" }))
      .finally(() => { setLoading(false); refreshGov(); });
  };

  return (
    <>
      <TelemetryPageHeader
        variant="standard"
        eyebrow="Test Intelligence"
        title="Test Intelligence Copilot"
        description={
          <>
            Grounded AI analysis over telemetry runs, model outputs, prediction receipts, and monitoring
            evidence. Not an open-ended chatbot — a fixed set of supported questions, answered only from
            recorded platform evidence, with refusals enforced before the model is called. Public NASA
            aerospace analog data. Answers are draft analysis for human review.
          </>
        }
      />

      <Panel title="Ask about this run" right={<Tag color={C.cyan}>run smap_msl:D-4:test</Tag>}>
        <div style={{ display: "flex", gap: 8 }}>
          <input value={q} onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && q.trim()) run(q.trim()); }}
            placeholder="Ask about this telemetry run, anomaly, model decision, or monitoring evidence…"
            style={{ flex: 1, fontFamily: C.mono, fontSize: 12.5, color: C.text, background: C.bg,
              border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 12px", outline: "none" }} />
          <button type="button" onClick={() => q.trim() && run(q.trim())} disabled={loading || !q.trim()}
            style={{ fontFamily: C.mono, fontSize: 12.5, fontWeight: 600, color: C.bg, background: C.cyan,
              border: "none", borderRadius: 8, padding: "10px 18px", cursor: loading ? "default" : "pointer", opacity: loading || !q.trim() ? 0.6 : 1 }}>
            {loading ? "…" : "Ask"}
          </button>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginTop: 12 }}>
          {CHIPS.map((c) => (
            <button type="button" key={c.label} onClick={() => run(c.q)} disabled={loading}
              style={{ fontFamily: C.mono, fontSize: 11, color: c.refusal ? C.amber : C.dim,
                background: "transparent", border: `1px solid ${c.refusal ? C.amber + "55" : C.border}`,
                borderRadius: 999, padding: "5px 11px", cursor: loading ? "default" : "pointer" }}>
              {c.label}
            </button>
          ))}
        </div>
      </Panel>

      <div style={{ marginTop: 16 }}>
        {loading && <Loading label="Classifying intent, running allow-listed tools, grounding the answer…" />}
        {!loading && r && <CopilotResult r={r} reportContext={{ runKey: "smap_msl:D-4:test", fireTick: 728, channel: "D-4" }} />}
        {!loading && !r && (
          <Panel><span style={{ fontFamily: C.mono, fontSize: 12, color: C.dim }}>
            Pick a question above. Try the refusal demo chip to see the copilot decline an
            out-of-scope (physical root cause) question before any model call.
          </span></Panel>
        )}
      </div>

      {gov && (
        <Panel title="AI governance" right={<Tag color={C.cyan}>{gov.total_interactions} logged</Tag>} style={{ marginTop: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 12 }}>
            <Gov k="grounded rate" v={pct(gov.grounded_rate)} col={C.green} />
            <Gov k="refusal rate" v={pct(gov.refusal_rate)} col={C.amber} />
            <Gov k="p50 latency" v={gov.p50_ms != null ? `${gov.p50_ms}ms` : "—"} col={C.dim} />
            <Gov k="p95 latency" v={gov.p95_ms != null ? `${gov.p95_ms}ms` : "—"} col={C.dim} />
            <Gov k="allowed tools" v={String(gov.allow_list.length)} col={C.cyan} />
            <Gov k="refusal rules" v={String(gov.refusal_rule_count)} col={C.cyan} />
            <Gov k="active prompt" v={gov.active_prompt_version} col={C.dim} />
            <Gov k="model" v={gov.active_model} col={C.dim} />
          </div>
          <div style={{ fontFamily: C.mono, fontSize: 10.5, color: C.faint, marginTop: 12, lineHeight: 1.5 }}>
            answer sources: {Object.entries(gov.answer_source_mix).map(([k, v]) => `${k} ${v}`).join(" · ") || "—"}
            {" · "}null reasons: {Object.entries(gov.null_reason_breakdown).map(([k, v]) => `${k} ${v}`).join(" · ") || "—"}
          </div>
          <div style={{ fontFamily: C.mono, fontSize: 10.5, color: C.faint, marginTop: 6 }}>
            All numbers are aggregates of real logged interactions (tel_copilot_interactions) — none hardcoded.
          </div>
        </Panel>
      )}
    </>
  );
}

function Gov({ k, v, col }: { k: string; v: string; col: string }) {
  return (
    <div>
      <div style={{ fontFamily: C.mono, fontSize: 9.5, letterSpacing: "0.1em", color: C.faint, textTransform: "uppercase" }}>{k}</div>
      <div style={{ fontFamily: C.sans, fontSize: 17, fontWeight: 600, color: col, marginTop: 4, wordBreak: "break-all" }}>{v}</div>
    </div>
  );
}

function pct(x: number | null): string {
  return x == null ? "—" : `${Math.round(x * 100)}%`;
}
