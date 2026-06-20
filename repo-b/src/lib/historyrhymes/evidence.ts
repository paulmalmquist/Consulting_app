/**
 * Evidence payload builders for the cockpit drawer (Z6). Pure functions —
 * no React, no fetch. Every null field carries a nullReason so the drawer
 * shows why a value is absent instead of hiding the row. request_id rides
 * along whenever the source object carries one.
 */

import type { HrState, HrDecision, HrBrief } from "./client";
import type {
  RhymesMatchResponse,
  TopAnalog,
  StructuralAlert,
  ConfidenceMeta,
} from "./rhymesClient";
import type { NormalizedSignal } from "./signals";

export type EvidenceKind = "regime" | "signal" | "analog" | "alert" | "scenario" | "brief";

export interface EvidenceField {
  label: string;
  /** Stringified display value; null renders the nullReason instead. */
  value: string | null;
  nullReason?: string;
}

export interface EvidencePayload {
  kind: EvidenceKind;
  title: string;
  fields: EvidenceField[];
  requestId?: string | null;
  /** Raw source object, rendered collapsed in the drawer. */
  raw?: unknown;
}

function field(label: string, value: unknown, nullReason: string): EvidenceField {
  if (value === null || value === undefined) return { label, value: null, nullReason };
  return { label, value: String(value) };
}

export function signalEvidence(signal: NormalizedSignal, brief: HrBrief | null): EvidencePayload {
  return {
    kind: "signal",
    title: `${signal.label} (${signal.key})`,
    fields: [
      field("value", signal.value === null ? null : signal.formatted, signal.nullReason ?? "value absent"),
      field("delta vs previous", signal.delta, "no numeric previous value in the brief"),
      field("freshness label", signal.freshnessLabel, "brief carries no per-signal freshness for this key"),
      field("status", signal.status, "—"),
      field("source", signal.source === "brief" ? "weekly brief (static)" : "stream", "—"),
      field("streaming domain", signal.domain, "—"),
      field("brief published", brief?.published_at ?? null, "no weekly brief on record"),
    ],
    raw: { signal, latest_signals: brief?.parsed_json?.["latest_signals"] ?? null },
  };
}

export function analogEvidence(analog: TopAnalog, match: RhymesMatchResponse): EvidencePayload {
  return {
    kind: "analog",
    title: `#${analog.rank} ${analog.episode_name}`,
    fields: [
      field("rhyme score", analog.rhyme_score.toFixed(4), "—"),
      field("cosine similarity", analog.cosine.toFixed(4), "—"),
      field("dtw", analog.dtw, "not computed in v1 (reserved for FastDTW refinement)"),
      field("categorical match", analog.categorical.toFixed(2), "—"),
      field("era discount", `×${analog.era_discount.toFixed(2)}`, "—"),
      field("hoyt amplification", `×${analog.hoyt_amplification.toFixed(2)}`, "—"),
      field("episode start year", analog.episode_start_year, "—"),
      field("non-event", String(analog.is_non_event), "—"),
      field("tags", analog.tags.length ? analog.tags.join(", ") : null, "episode carries no tags"),
      field("as of", match.as_of_date, "—"),
    ],
    requestId: match.request_id,
    raw: analog,
  };
}

export function alertEvidence(alert: StructuralAlert): EvidencePayload {
  return {
    kind: "alert",
    title: `${alert.alert_type} (${alert.severity})`,
    fields: [
      field("narrative", alert.narrative, "alert shipped without a narrative"),
      field("hoyt position", alert.hoyt_position, "not a hoyt-cycle alert"),
      field("alert date", alert.alert_date, "—"),
      field("trigger signals",
        Object.keys(alert.trigger_signals).length ? JSON.stringify(alert.trigger_signals) : null,
        "no trigger signals recorded"),
    ],
    raw: alert,
  };
}

export function scenarioEvidence(
  scenarios: RhymesMatchResponse["scenarios"],
  meta: ConfidenceMeta,
  requestId: string,
  pending: boolean,
): EvidencePayload {
  return {
    kind: "scenario",
    title: pending ? "Scenario pressure (pending engine)" : "Scenario pressure",
    fields: [
      field("state", pending ? "placeholder — Stage 5 forecaster not live" : "live values", "—"),
      field("bull", pending ? null : `${(scenarios.bull.probability * 100).toFixed(0)}%`, "placeholder probability withheld"),
      field("base", pending ? null : `${(scenarios.base.probability * 100).toFixed(0)}%`, "placeholder probability withheld"),
      field("bear", pending ? null : `${(scenarios.bear.probability * 100).toFixed(0)}%`, "placeholder probability withheld"),
      field("sample size", meta.sample_size, "—"),
      field("data freshness (h)", meta.data_freshness_hours, "degraded — no state vector freshness"),
      field("agent agreement", meta.agent_agreement, "not yet computed (v1)"),
      field("permutation p-value", meta.permutation_p_value, "not yet computed (v1)"),
    ],
    requestId,
    raw: { scenarios, confidence_meta: meta },
  };
}

export function regimeEvidence(
  state: HrState | null,
  decision: HrDecision | null,
  brief: HrBrief | null,
): EvidencePayload {
  return {
    kind: "regime",
    title: "Regime state",
    fields: [
      field("regime", decision?.regime ?? state?.latest_regime ?? null, "no decision or brief on record"),
      field("confidence", decision?.confidence ?? state?.latest_confidence ?? null, "no source carries a confidence"),
      field("freshness verdict", state?.freshness_verdict ?? null, "state endpoint unreachable"),
      field("worst input age (h)",
        state == null ? null : state.worst_input_age_hours >= 9000 ? "no inputs on record" : state.worst_input_age_hours.toFixed(1),
        "state endpoint unreachable"),
      field("decision source", decision?.source ?? null, "no decision on record"),
      field("source brief", decision?.source_brief_id ?? null, "no decision on record"),
      field("source snapshot", decision?.source_snapshot_id ?? null, "no decision on record"),
      field("brief regime call", brief?.regime_call ?? null, "no weekly brief on record"),
    ],
    raw: { state, decision_summary: decision && { decision_id: decision.decision_id, regime: decision.regime, confidence: decision.confidence } },
  };
}

export function briefEvidence(brief: HrBrief | null): EvidencePayload {
  return {
    kind: "brief",
    title: "Weekly brief (archive evidence)",
    fields: [
      field("published", brief?.published_at ?? null, "no weekly brief on record"),
      field("regime call", brief?.regime_call ?? null, "brief carries no regime call"),
      field("confidence", brief?.confidence ?? null, "brief carries no confidence"),
      field("freshness score", brief?.freshness_score ?? null, "brief carries no freshness score"),
      field("markdown", brief?.markdown_uri ?? null, "brief has no markdown URI"),
      field("source", brief?.source ?? null, "no weekly brief on record"),
    ],
    raw: brief?.parsed_json ?? null,
  };
}
