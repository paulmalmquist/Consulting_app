"use client";

// Model Registry & Promotion Control console (RS Demo PR 2) — port of rs_jsx/ModelRegistryConsole.jsx
// onto REAL tel_model_runs data (incl. the Track A honest_gate / affiliation / conformal keys) and
// REAL PSI drift history. DISPLAY-ONLY: the API has no mutation routes; the promote/rollback buttons
// are permanently disabled — promotion is an alias update through the governed Databricks flow.
import { useEffect, useMemo, useState } from "react";
import { Area, AreaChart, ReferenceLine, ResponsiveContainer, XAxis, YAxis } from "recharts";

import {
  getRegistry, type RegistryModel, type RegistryResponse,
  TELEMETRY_DEMO_BUSINESS_ID, TELEMETRY_DEMO_ENV_ID,
} from "@/lib/telemetry/api";
import { RS, RS_MONO, RS_SANS, RsChip, RsPanel } from "./rsTokens";

const PSI_WARN = 0.15;

export interface GateRow { rule: string; observed: string; pass: boolean }

/** Pure mapper: the REAL Track A honest_gate jsonb (+ the legacy declared gate) → checklist rows. */
export function mapGateRows(model: RegistryModel): GateRow[] {
  const rows: GateRow[] = [];
  const m = (model.metrics ?? {}) as Record<string, unknown>;
  const hg = m.honest_gate as {
    thresholds?: Record<string, number>; values?: Record<string, number>;
    checks?: Record<string, boolean>;
  } | undefined;
  if (hg?.thresholds) {
    for (const [key, thr] of Object.entries(hg.thresholds)) {
      const val = hg.values?.[key];
      rows.push({
        rule: `${key} >= ${thr}`,
        observed: val != null ? String(val) : "not recorded",
        pass: hg.checks?.[key] === true,
      });
    }
  }
  const gate = (model.gate ?? {}) as Record<string, unknown>;
  if (gate.metric != null && gate.threshold != null) {
    rows.push({
      rule: `legacy ${String(gate.metric)} >= ${String(gate.threshold)} (reference only)`,
      observed: `decision: ${String(gate.decision ?? "—")}`,
      pass: gate.decision === "promoted",
    });
  }
  return rows;
}

// Metric display sets per model_kind: [key, label, higherIsBetter]
const METRIC_SETS: Record<string, [string, string, boolean][]> = {
  anomaly: [
    ["affiliation_f1", "Affiliation F1 (range-aware)", true],
    ["f1_pointwise", "F1 (point-wise — honest)", true],
    ["event_recall", "Event recall", true],
    ["alarm_precision", "Alarm precision", true],
    ["vus_pr", "VUS-PR", true],
    ["f1", "F1 (point-adjusted — inflated legacy)", true],
  ],
  rul: [
    ["rmse", "RMSE (cycles)", false],
    ["phm", "NASA PHM08 score", false],
    ["conformal_calib_coverage", "Conformal coverage", true],
  ],
};

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function MetricBars({ label, higherBetter, champ, chall }: {
  label: string; higherBetter: boolean; champ: number | null; chall: number | null;
}) {
  if (champ == null && chall == null) return null;
  const max = Math.max(Math.abs(champ ?? 0), Math.abs(chall ?? 0)) || 1;
  const challBetter = champ != null && chall != null
    ? (higherBetter ? chall >= champ : chall <= champ) : null;
  return (
    <div style={{ padding: "8px 12px", borderBottom: `1px solid ${RS.line}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{ fontSize: 11, color: RS.text, fontFamily: RS_SANS }}>
          {label}
          <span style={{ color: RS.faint, fontSize: 10, marginLeft: 8 }}>
            {higherBetter ? "higher is better" : "lower is better"}
          </span>
        </span>
        {challBetter != null && (
          <span style={{ fontFamily: RS_MONO, fontSize: 11, color: challBetter ? RS.green : RS.red }}>
            {challBetter ? "challenger ahead" : "champion ahead"}
          </span>
        )}
      </div>
      {[{ lbl: "champion", v: champ, color: RS.teal },
        { lbl: "challenger", v: chall, color: RS.violet }].map((row) => (
        <div key={row.lbl} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <span style={{ width: 76, fontFamily: RS_MONO, fontSize: 10, color: RS.faint }}>{row.lbl}</span>
          <div style={{ flex: 1, height: 8, borderRadius: 4, background: RS.panelAlt }}>
            {row.v != null && (
              <div style={{ height: 8, borderRadius: 4, width: `${(Math.abs(row.v) / max) * 100}%`,
                background: row.color }} />
            )}
          </div>
          <span style={{ width: 70, textAlign: "right", fontFamily: RS_MONO, fontSize: 11,
            color: row.v != null ? RS.text : RS.faint }}>
            {row.v != null ? row.v.toFixed(4) : "n/a"}
          </span>
        </div>
      ))}
    </div>
  );
}

function DriftCard({ channel, series }: {
  channel: string; series: { psi: number | null; computed_at: string }[];
}) {
  const pts = series.filter((s) => s.psi != null)
    .map((s, i) => ({ i, psi: s.psi as number }));
  const latest = pts.length ? pts[pts.length - 1].psi : null;
  const warn = latest != null && latest >= PSI_WARN;
  return (
    <div style={{ background: RS.panelAlt, borderRadius: 4, padding: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontFamily: RS_MONO,
        fontSize: 10, marginBottom: 4 }}>
        <span style={{ color: RS.dim }}>{channel}</span>
        <span style={{ color: warn ? RS.amber : RS.green }}>
          PSI {latest != null ? latest.toFixed(2) : "—"}{warn ? " · watch" : ""}
        </span>
      </div>
      {pts.length >= 2 ? (
        <ResponsiveContainer width="100%" height={40}>
          <AreaChart data={pts} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
            <XAxis dataKey="i" hide />
            <YAxis domain={[0, Math.max(0.25, ...pts.map((p) => p.psi))]} hide />
            <ReferenceLine y={PSI_WARN} stroke={RS.amber} strokeOpacity={0.5} strokeDasharray="3 3" />
            <Area dataKey="psi" stroke={warn ? RS.amber : RS.teal}
              fill={warn ? RS.amber : RS.teal} fillOpacity={0.15} strokeWidth={1.2}
              isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      ) : (
        <div style={{ fontFamily: RS_MONO, fontSize: 10, color: RS.faint }}>
          single observation — history accrues as drift jobs run (no fabricated curve)
        </div>
      )}
    </div>
  );
}

export default function RegistryConsole() {
  const [data, setData] = useState<RegistryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [kind, setKind] = useState<string>("anomaly");

  useEffect(() => {
    getRegistry(TELEMETRY_DEMO_ENV_ID, TELEMETRY_DEMO_BUSINESS_ID)
      .then(setData).catch((e) => setError(String(e)));
  }, []);

  const byKind = useMemo(() => {
    const out: Record<string, RegistryModel[]> = {};
    for (const m of data?.models ?? []) (out[m.model_kind] ??= []).push(m);
    return out;
  }, [data]);

  const kinds = Object.keys(byKind);
  const models = byKind[kind] ?? [];
  const champion = models.filter((m) => m.promotion_state === "promoted").at(-1) ?? null;
  const challenger = models.filter((m) => m.promotion_state !== "promoted").at(-1) ?? null;
  const gateRows = champion ? mapGateRows(champion) : [];
  const gatePass = gateRows.length > 0 && gateRows.every((g) => g.pass);
  const vusStatus = champion ? (champion.metrics as Record<string, unknown>).vus_status : null;

  return (
    <div style={{ minHeight: "100vh", width: "100%", padding: 12, background: RS.bg,
      fontFamily: RS_SANS, color: RS.text }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12, padding: "0 4px 12px" }}>
        <div>
          <div style={{ color: RS.faint, fontSize: 11, letterSpacing: "0.18em" }}>TELEMETRY LAB</div>
          <div style={{ fontSize: 13, letterSpacing: "0.14em" }}>MODEL REGISTRY · PROMOTION CONTROL</div>
        </div>
        <RsChip color={RS.cyan}>registry: unity_catalog · novendor_1.telemetry</RsChip>
        <RsChip color={RS.teal}>aliases: champion / challenger</RsChip>
        <div style={{ marginLeft: "auto", fontFamily: RS_MONO, fontSize: 11, color: RS.faint }}>
          promotion = alias update · fail closed · display-only console
        </div>
      </div>

      {error && (
        <RsPanel><div style={{ padding: 16, fontFamily: RS_MONO, fontSize: 12, color: RS.red }}>
          Could not load the registry: {error}
        </div></RsPanel>
      )}
      {data && data.models.length === 0 && (
        <RsPanel><div style={{ padding: 16, fontFamily: RS_MONO, fontSize: 12, color: RS.amber }}>
          Not available — {data.null_reason ?? "no model rows"}. Nothing is rendered in its place.
        </div></RsPanel>
      )}

      {data && data.models.length > 0 && (
        <div style={{ display: "grid", gap: 12,
          gridTemplateColumns: "230px minmax(0,2fr) minmax(0,1.4fr)" }}>
          {/* Model list */}
          <RsPanel title="REGISTERED MODELS">
            {kinds.map((k) => {
              const champ = byKind[k].find((m) => m.promotion_state === "promoted");
              const active = k === kind;
              return (
                <button key={k} type="button" onClick={() => setKind(k)}
                  style={{ width: "100%", textAlign: "left", display: "block", padding: 12,
                    background: active ? RS.panelAlt : "transparent", cursor: "pointer",
                    border: "none", borderBottom: `1px solid ${RS.line}`,
                    borderLeft: `2px solid ${active ? RS.violet : "transparent"}` }}>
                  <div style={{ fontFamily: RS_MONO, fontSize: 11,
                    color: active ? RS.text : RS.dim, marginBottom: 4 }}>
                    {champ?.model_name ?? byKind[k][0].model_name}
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <RsChip color={RS.teal}>{k}</RsChip>
                    {champ && <RsChip color={RS.green}>v{champ.model_version} champion</RsChip>}
                  </div>
                </button>
              );
            })}
            <div style={{ padding: 12, fontSize: 10.5, color: RS.faint, lineHeight: 1.6 }}>
              Anomaly quality is reported range-aware (affiliation F1) beside the honest point-wise
              metrics; the point-adjusted legacy F1 is shown last and labeled inflated.
              {typeof vusStatus === "string" && vusStatus.startsWith("pending") && (
                <> VUS-PR/ROC: <span style={{ color: RS.amber }}>{vusStatus}</span> — shown only when a
                vetted library computes them.</>
              )}
            </div>
          </RsPanel>

          {/* Champion vs challenger + drift */}
          <RsPanel title={champion
            ? `CHAMPION v${champion.model_version}${challenger ? ` VS CHALLENGER (${challenger.model_name})` : ""}`
            : "NO PROMOTED CHAMPION"}>
            {champion && (
              <div style={{ padding: "8px 12px", borderBottom: `1px solid ${RS.line}`,
                display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8,
                fontFamily: RS_MONO, fontSize: 10, color: RS.faint }}>
                <div>
                  <div style={{ color: RS.teal }}>champion: {champion.model_name} v{champion.model_version}</div>
                  <div>mlflow {champion.mlflow_run_id}</div>
                </div>
                <div>
                  {challenger ? (
                    <>
                      <div style={{ color: RS.violet }}>challenger: {challenger.model_name} v{challenger.model_version}</div>
                      <div>mlflow {challenger.mlflow_run_id}</div>
                    </>
                  ) : (
                    <div style={{ color: RS.faint }}>no challenger registered for this kind</div>
                  )}
                </div>
              </div>
            )}
            {(METRIC_SETS[kind] ?? []).map(([key, label, higher]) => (
              <MetricBars key={key} label={label} higherBetter={higher}
                champ={num((champion?.metrics as Record<string, unknown> | undefined)?.[key])}
                chall={num((challenger?.metrics as Record<string, unknown> | undefined)?.[key])} />
            ))}
            <div style={{ padding: "8px 12px" }}>
              <div style={{ fontSize: 10, color: RS.faint, letterSpacing: "0.1em", marginBottom: 8 }}>
                SERVING DRIFT · REAL PSI HISTORY PER CHANNEL
              </div>
              {Object.keys(data.drift).length === 0 ? (
                <div style={{ fontFamily: RS_MONO, fontSize: 11, color: RS.faint }}>
                  No PSI history recorded for this scope.
                </div>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  {Object.entries(data.drift).map(([channel, series]) => (
                    <DriftCard key={channel} channel={channel} series={series} />
                  ))}
                </div>
              )}
            </div>
          </RsPanel>

          {/* Gates + decision + lifecycle */}
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <RsPanel title={`PROMOTION GATES · ${gateRows.filter((g) => g.pass).length}/${gateRows.length} PASS`}>
              {gateRows.length === 0 ? (
                <div style={{ padding: 12, fontFamily: RS_MONO, fontSize: 11, color: RS.faint }}>
                  No declared gate recorded for this model.
                </div>
              ) : gateRows.map((g) => (
                <div key={g.rule} style={{ display: "flex", gap: 8, padding: "8px 12px",
                  borderBottom: `1px solid ${RS.line}` }}>
                  <span style={{ color: g.pass ? RS.green : RS.red, fontFamily: RS_MONO, fontSize: 11 }}>
                    {g.pass ? "✓" : "✕"}
                  </span>
                  <div>
                    <div style={{ fontFamily: RS_MONO, fontSize: 11, color: RS.text }}>{g.rule}</div>
                    <div style={{ fontSize: 10, color: RS.faint }}>{g.observed}</div>
                  </div>
                </div>
              ))}
              <div style={{ padding: 12 }}>
                {gateRows.length > 0 && (
                  <div style={{ borderRadius: 4, padding: 10, fontSize: 11, lineHeight: 1.5,
                    border: `1px solid ${(gatePass ? RS.green : RS.amber)}55`,
                    background: `${gatePass ? RS.green : RS.amber}10` }}>
                    <span style={{ fontWeight: 700, fontFamily: RS_MONO, marginRight: 8,
                      color: gatePass ? RS.green : RS.amber }}>
                      {gatePass ? "GATES PASS" : "GATES INCOMPLETE"}
                    </span>
                    The declared honest gate was fixed before recompute (fail-closed). Promotion
                    requires reviewer approval; the alias update is the only mutation.
                  </div>
                )}
                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  <button type="button" disabled
                    style={{ flex: 1, fontFamily: RS_MONO, fontSize: 11, padding: "8px 0",
                      borderRadius: 4, color: RS.faint, background: RS.panelAlt,
                      border: `1px solid ${RS.line}`, cursor: "not-allowed" }}>
                    Promote — requires reviewer approval
                  </button>
                  <button type="button" disabled
                    style={{ flex: 1, fontFamily: RS_MONO, fontSize: 11, padding: "8px 0",
                      borderRadius: 4, color: RS.faint, background: "transparent",
                      border: `1px solid ${RS.line}`, cursor: "not-allowed" }}>
                    Roll back — requires reviewer approval
                  </button>
                </div>
                <div style={{ fontSize: 10, color: RS.faint, marginTop: 8, lineHeight: 1.5 }}>
                  This console never mutates aliases. Promotion is performed through the governed
                  Databricks flow (notebooks/promote_models.py) and the API exposes no write routes.
                </div>
              </div>
            </RsPanel>

            <RsPanel title="LIFECYCLE EVENTS (derived from registry rows)">
              <div style={{ padding: 12 }}>
                {data.lifecycle.filter((e) => e.model_kind === kind).map((e, i, arr) => (
                  <div key={i} style={{ display: "flex", gap: 10, paddingBottom: 10 }}>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                      <span style={{ width: 7, height: 7, borderRadius: 999, marginTop: 3,
                        background: i === arr.length - 1 ? RS.cyan : RS.faint }} />
                      {i < arr.length - 1 && <span style={{ flex: 1, width: 1, background: RS.line, marginTop: 3 }} />}
                    </div>
                    <div style={{ fontSize: 11 }}>
                      <span style={{ fontFamily: RS_MONO, color: RS.faint }}>
                        {e.ts ? e.ts.slice(0, 10) : "—"}
                      </span>
                      <span style={{ marginLeft: 8, color: RS.dim }}>{e.text}</span>
                    </div>
                  </div>
                ))}
              </div>
            </RsPanel>
          </div>
        </div>
      )}

      <div style={{ paddingTop: 12, textAlign: "center", fontSize: 11, color: RS.faint, lineHeight: 1.6 }}>
        All numbers are read live from tel_model_runs / tel_drift_metrics — the same registry rows the
        serving API uses. Nothing on this page is hardcoded; absent data renders as not available.
      </div>
    </div>
  );
}
