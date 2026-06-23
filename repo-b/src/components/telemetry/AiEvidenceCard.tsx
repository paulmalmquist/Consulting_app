"use client";

import { useState } from "react";

import { askCopilot, type CopilotResponse } from "@/lib/telemetry/copilot-api";
import { C, Tag, Panel, EmptyState, ErrorState } from "./primitives";

// A repeatable AI evidence script. One button fires two FIXED copilot questions in sequence:
//   (1) a grounded, in-scope inventory question — should return a grounded answer with evidence[].
//   (2) an out-of-scope question — should be REFUSED (is_refusal === true).
// We render only what the API returns — no fabricated answers, numbers, or evidence. If the copilot
// API rejects, the offending sub-panel fails closed to an ErrorState. Clicking again re-runs.

const GROUNDED_Q =
  "How many predictions and test runs are in the telemetry inventory?";
const OUT_OF_SCOPE_Q = "What is the weather in Los Angeles tomorrow?";

// answer_source -> accent color for the source tag.
function sourceColor(source: string): string {
  if (source === "live_llm") return C.green;
  if (source === "fallback_template") return C.amber;
  if (source === "refusal") return C.red;
  return C.dim;
}

interface SubResult {
  response: CopilotResponse | null;
  error: string | null;
}

export default function AiEvidenceCard() {
  const [running, setRunning] = useState(false);
  const [ran, setRan] = useState(false);
  const [grounded, setGrounded] = useState<SubResult | null>(null);
  const [refusal, setRefusal] = useState<SubResult | null>(null);

  async function runScript() {
    setRunning(true);
    setRan(true);
    // Reset prior output so a re-run never shows stale panels.
    setGrounded(null);
    setRefusal(null);
    try {
      // Fire the two fixed questions in sequence so the audit log reads top-to-bottom in order.
      try {
        const r = await askCopilot(GROUNDED_Q);
        setGrounded({ response: r, error: null });
      } catch (e) {
        setGrounded({ response: null, error: String(e) });
      }
      try {
        const r = await askCopilot(OUT_OF_SCOPE_Q);
        setRefusal({ response: r, error: null });
      } catch (e) {
        setRefusal({ response: null, error: String(e) });
      }
    } finally {
      setRunning(false);
    }
  }

  return (
    <Panel
      title="AI evidence script"
      right={
        <button
          type="button"
          onClick={runScript}
          disabled={running}
          style={{
            fontFamily: C.mono,
            fontSize: 11,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            color: running ? C.faint : C.bg,
            background: running ? "transparent" : C.cyan,
            border: `1px solid ${running ? C.border : C.cyan}`,
            borderRadius: 6,
            padding: "6px 12px",
            cursor: running ? "default" : "pointer",
          }}
        >
          {running ? "Running…" : "Run AI evidence script"}
        </button>
      }
    >
      <p style={{ fontFamily: C.mono, fontSize: 11.5, color: C.faint, lineHeight: 1.6, margin: "0 0 14px" }}>
        The copilot cites evidence, refuses out-of-scope questions, and every interaction is logged to
        the governed audit table (tel_copilot_interactions).
      </p>

      {!ran && (
        <EmptyState
          label="Script idle"
          hint="Click Run AI evidence script to fire two fixed questions: a grounded inventory query that must cite evidence, and an out-of-scope query that must be refused."
        />
      )}

      {ran && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <SubPanel heading="1 · Grounded, in-scope" question={GROUNDED_Q} result={grounded} running={running} />
          <SubPanel heading="2 · Out-of-scope (expect refusal)" question={OUT_OF_SCOPE_Q} result={refusal} running={running} />
        </div>
      )}
    </Panel>
  );
}

function SubPanel({
  heading,
  question,
  result,
  running,
}: {
  heading: string;
  question: string;
  result: SubResult | null;
  running: boolean;
}) {
  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 9, padding: 14, background: C.panelHi }}>
      <div style={{ fontFamily: C.mono, fontSize: 10, letterSpacing: "0.11em", color: C.cyan, textTransform: "uppercase" }}>
        {heading}
      </div>
      <div style={{ fontFamily: C.sans, fontSize: 13.5, color: C.text, marginTop: 6, lineHeight: 1.5 }}>
        “{question}”
      </div>

      <div style={{ marginTop: 12 }}>
        {result === null ? (
          running ? (
            <span style={{ fontFamily: C.mono, fontSize: 12, color: C.dim }}>Asking copilot…</span>
          ) : (
            <span style={{ fontFamily: C.mono, fontSize: 12, color: C.faint }}>Pending…</span>
          )
        ) : result.error ? (
          <ErrorState message={result.error} />
        ) : result.response ? (
          <ResponseBody r={result.response} />
        ) : null}
      </div>
    </div>
  );
}

function ResponseBody({ r }: { r: CopilotResponse }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Tag color={sourceColor(r.answer_source)}>{r.answer_source}</Tag>
        <Tag color={r.is_refusal ? C.red : C.green}>{r.is_refusal ? "refused" : "answered"}</Tag>
        {r.intent && <Tag color={C.dim}>{r.intent}</Tag>}
      </div>

      <div style={{ fontFamily: C.sans, fontSize: 13.5, color: C.text, lineHeight: 1.6 }}>{r.answer}</div>

      {r.null_reason && (
        <div style={{ fontFamily: C.mono, fontSize: 11, color: C.amber }}>null_reason: {r.null_reason}</div>
      )}

      {/* Evidence — only what the API returned. Empty is shown honestly, not faked. */}
      <div>
        <div style={{ fontFamily: C.mono, fontSize: 9.5, letterSpacing: "0.1em", color: C.faint, textTransform: "uppercase", marginBottom: 6 }}>
          Evidence ({r.evidence.length})
        </div>
        {r.evidence.length === 0 ? (
          <span style={{ fontFamily: C.mono, fontSize: 11.5, color: C.faint }}>none cited</span>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {r.evidence.map((ev, i) => (
              <div
                key={`${ev.type}-${ev.id ?? "noid"}-${i}`}
                style={{ display: "flex", gap: 8, alignItems: "baseline", fontFamily: C.mono, fontSize: 11.5 }}
              >
                <span style={{ color: C.cyan }}>{ev.type}</span>
                <span style={{ color: C.text }}>{ev.label}</span>
                {ev.id && <span style={{ color: C.faint }}>#{ev.id}</span>}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Tool trace — the visible audit log. */}
      <div>
        <div style={{ fontFamily: C.mono, fontSize: 9.5, letterSpacing: "0.1em", color: C.faint, textTransform: "uppercase", marginBottom: 6 }}>
          Audit log · tool trace ({r.tool_trace.length})
        </div>
        {r.tool_trace.length === 0 ? (
          <span style={{ fontFamily: C.mono, fontSize: 11.5, color: C.faint }}>no tools called</span>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {r.tool_trace.map((t, i) => {
              const col = t.status === "success" ? C.green : t.status === "error" ? C.red : C.amber;
              return (
                <div
                  key={`${t.tool_name}-${i}`}
                  style={{ display: "flex", gap: 8, alignItems: "baseline", fontFamily: C.mono, fontSize: 11.5 }}
                >
                  <span style={{ color: col }}>{t.status}</span>
                  <span style={{ color: C.text }}>{t.tool_name}</span>
                  <span style={{ color: C.dim }}>{t.result_summary}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div style={{ fontFamily: C.mono, fontSize: 10, color: C.faint }}>
        model {r.model} · prompt {r.prompt_version} · req {r.request_id}
      </div>
    </div>
  );
}
