// Relationship safety classifier (Phase 2A). Pure, deterministic, fail-closed.
//
// Derives a join-safety verdict for a metadata edge from ONLY the evidence the catalog actually
// carries: node grain, primary/foreign keys, freshness status, and the edge's typed relationship +
// confidence. There are NO join-key hints on edges, so safety is inferred — and the cardinal rule is:
// a "safe" verdict requires POSITIVE evidence. When the supporting metadata is absent, the verdict is
// "unverifiable" (with a null_reason), never "safe". This is what keeps a fake green verdict off the
// screen. No backend, no new endpoint — this reads the existing /api/telemetry/metadata/graph payload.

import type {
  MetadataConfidence,
  TelemetryMetadataEdge,
  TelemetryMetadataNode,
} from "./metadata";

export type SafetyVerdict = "safe" | "bridge_required" | "unsafe" | "unverifiable";

export type SafetyResult = {
  verdict: SafetyVerdict;
  /** Short, evidence-grounded explanations — every line traces to a real field. */
  reasons: string[];
  relationship: string;
  confidence: MetadataConfidence;
  sourceGrain: string | null;
  targetGrain: string | null;
  sourcePrimaryKey: string[] | null;
  targetPrimaryKey: string[] | null;
  /** e.g. "run_id → tel_test_runs.id" when source FK references the target table. */
  foreignKeyLink: string | null;
  /** Recommended bridge path when verdict === "bridge_required"; else null. */
  bridgePath: string | null;
  /** Set only when verdict === "unverifiable" — the honest reason no verdict can be made. */
  nullReason: string | null;
};

// Edge relationship categories. Only DIRECT_JOIN edges can ever be "safe"; TRANSFORM edges always
// require a bridge (grain changes by design); CONSUMPTION/QUALITY edges are not joins at all.
const DIRECT_JOIN = new Set(["references", "exports_to"]);
const TRANSFORM = new Set(["ingests_to", "cleans_to", "aggregates_to", "batch_loaded_from", "streamed_from"]);
const CONSUMPTION = new Set(["defines_metric", "feeds_model", "feeds_dashboard", "used_by_ai"]);
const QUALITY = new Set(["quality_checked_by", "quarantines_to"]);

function asStringArray(value: unknown): string[] | null {
  if (Array.isArray(value)) {
    const out = value.filter((v): v is string => typeof v === "string" && v.trim().length > 0);
    return out.length ? out : null;
  }
  if (typeof value === "string" && value.trim()) return [value];
  return null;
}

export function grainOf(node: TelemetryMetadataNode | undefined): string | null {
  const g = node?.metadata?.grain;
  return typeof g === "string" && g.trim() ? g.trim() : null;
}

export function primaryKeyOf(node: TelemetryMetadataNode | undefined): string[] | null {
  return asStringArray(node?.metadata?.primary_key);
}

/** Does source.foreign_keys reference the target table? Returns "col → table.col" or null. */
export function foreignKeyLink(
  source: TelemetryMetadataNode | undefined,
  target: TelemetryMetadataNode | undefined,
): string | null {
  const fks = source?.metadata?.foreign_keys;
  if (!fks || typeof fks !== "object" || Array.isArray(fks)) return null;
  const targetTable = target?.object_name ?? target?.schema ?? null;
  for (const [col, ref] of Object.entries(fks as Record<string, unknown>)) {
    if (typeof ref !== "string") continue;
    // ref looks like "tel_test_runs.id"; match against the target's object_name.
    if (targetTable && ref.split(".")[0] === targetTable) return `${col} → ${ref}`;
  }
  return null;
}

// A node is join-trustworthy only when its data is actually present.
function availability(node: TelemetryMetadataNode | undefined): "ok" | "blocked" | "degraded" {
  const s = node?.status;
  if (s === "missing" || s === "quarantined") return "blocked";
  if (s === "fresh") return "ok";
  return "degraded"; // stale | unknown | undefined — cannot confirm fresh
}

function bridgeText(rel: string, source: TelemetryMetadataNode, target: TelemetryMetadataNode, sg: string | null, tg: string | null): string {
  const grainNote = sg && tg
    ? ` Grain changes "${sg}" → "${tg}", so aggregate ${source.label} to ${target.label}'s grain before any row-level use.`
    : sg || tg
      ? ` One side declares grain (${sg ?? tg}) and the other does not — resolve the grain before joining.`
      : "";
  return `Connect through the ${rel.replace(/_/g, " ")} stage (${source.label} → ${target.label}), not a row-to-row join.${grainNote}`;
}

/**
 * Classify a single edge. `source`/`target` may be undefined if the graph is missing a node — that
 * is itself a fail-closed condition.
 */
export function classifyRelationship(
  edge: TelemetryMetadataEdge,
  source: TelemetryMetadataNode | undefined,
  target: TelemetryMetadataNode | undefined,
): SafetyResult {
  const rel = edge.relationship;
  const confidence = edge.confidence;
  const sg = grainOf(source);
  const tg = grainOf(target);
  const spk = primaryKeyOf(source);
  const tpk = primaryKeyOf(target);
  const fkLink = foreignKeyLink(source, target);
  const inferred = confidence !== "explicit";

  const base = {
    relationship: rel,
    confidence,
    sourceGrain: sg,
    targetGrain: tg,
    sourcePrimaryKey: spk,
    targetPrimaryKey: tpk,
    foreignKeyLink: fkLink,
    bridgePath: null as string | null,
    nullReason: null as string | null,
  };

  // 0. Missing nodes — cannot assess anything.
  if (!source || !target) {
    return { ...base, verdict: "unverifiable", reasons: ["One endpoint is missing from the catalog graph."], nullReason: "endpoint_node_missing_from_catalog" };
  }

  // 1. Availability gate — unavailable data can never be a safe join.
  const sAvail = availability(source);
  const tAvail = availability(target);
  if (sAvail === "blocked" || tAvail === "blocked") {
    const which = [sAvail === "blocked" ? source.label : null, tAvail === "blocked" ? target.label : null].filter(Boolean).join(", ");
    return { ...base, verdict: "unsafe", reasons: [`Data not available (status missing/quarantined): ${which}.`] };
  }

  // 2. Not-a-join relationships — honest "nothing to classify".
  if (CONSUMPTION.has(rel)) {
    return { ...base, verdict: "unverifiable", reasons: [`"${rel.replace(/_/g, " ")}" is a consumption edge, not a row-level join.`], nullReason: "not_a_join_consumption_edge" };
  }
  if (QUALITY.has(rel)) {
    return { ...base, verdict: "unverifiable", reasons: [`"${rel.replace(/_/g, " ")}" is a quality/routing edge, not a row-level join.`], nullReason: "not_a_join_quality_edge" };
  }

  const reasons: string[] = [];
  if (inferred) reasons.push("Relationship is inferred, not catalog-confirmed — caps the verdict below safe.");
  const degraded = sAvail === "degraded" || tAvail === "degraded";
  if (degraded) reasons.push("At least one endpoint is not confirmed fresh (stale/unknown status).");

  // 3. Transform edges — grain changes by design; a direct join is never safe, a bridge is.
  if (TRANSFORM.has(rel)) {
    reasons.push(`"${rel.replace(/_/g, " ")}" is a pipeline transform; grain changes across it.`);
    return { ...base, verdict: "bridge_required", reasons, bridgePath: bridgeText(rel, source, target, sg, tg) };
  }

  // 4. Direct-join candidates (references / exports_to): need POSITIVE evidence to be safe.
  if (DIRECT_JOIN.has(rel)) {
    const canBeSafe = !inferred && !degraded;
    if (fkLink) {
      reasons.unshift(`Declared foreign key (${fkLink}).`);
      if (canBeSafe) return { ...base, verdict: "safe", reasons };
      return { ...base, verdict: "bridge_required", reasons, bridgePath: bridgeText(rel, source, target, sg, tg) };
    }
    if (sg && tg && sg === tg) {
      reasons.unshift(`Both sides declare the same grain ("${sg}").`);
      if (canBeSafe) return { ...base, verdict: "safe", reasons };
      return { ...base, verdict: "bridge_required", reasons, bridgePath: bridgeText(rel, source, target, sg, tg) };
    }
    if (sg && tg && sg !== tg) {
      reasons.unshift(`Grain differs ("${sg}" vs "${tg}").`);
      return { ...base, verdict: "bridge_required", reasons, bridgePath: bridgeText(rel, source, target, sg, tg) };
    }
    // No FK, and grain undeclared on at least one side → cannot confirm. FAIL CLOSED.
    return {
      ...base,
      verdict: "unverifiable",
      reasons: [...reasons, "No declared foreign key, and grain is undeclared on at least one side — a safe join cannot be confirmed from catalog metadata."],
      nullReason: "no_foreign_key_or_grain_to_confirm_join",
    };
  }

  // 5. Unknown relationship type — fail closed.
  return { ...base, verdict: "unverifiable", reasons: [`Unrecognized relationship "${rel}".`], nullReason: "unrecognized_relationship_type" };
}

export const VERDICT_LABEL: Record<SafetyVerdict, string> = {
  safe: "Safe",
  bridge_required: "Bridge required",
  unsafe: "Unsafe",
  unverifiable: "Unverifiable",
};

export type SafetyTally = Record<SafetyVerdict, number>;

export function tallyVerdicts(results: SafetyResult[]): SafetyTally {
  const t: SafetyTally = { safe: 0, bridge_required: 0, unsafe: 0, unverifiable: 0 };
  for (const r of results) t[r.verdict] += 1;
  return t;
}
