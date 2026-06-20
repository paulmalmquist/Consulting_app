/**
 * Shared test fixtures for the rhymes match envelope. Mirrors the v1 backend
 * exactly: placeholder scenarios, all-null trap detector, dtw null.
 * Used by AnalogTimeline/ScenarioPressurePanel/AlertTrapRail tests.
 */

import type { RhymesMatchResponse, TopAnalog } from "./rhymesClient";

export function makeAnalog(overrides: Partial<TopAnalog> = {}): TopAnalog {
  return {
    rank: 1,
    episode_id: "ep-1",
    episode_name: "2007-2009 GFC",
    rhyme_score: 0.8731,
    cosine: 0.912,
    dtw: null,
    categorical: 0.8,
    era_discount: 1.0,
    hoyt_amplification: 1.12,
    episode_start_year: 2007,
    is_non_event: false,
    tags: ["hoyt_peak", "credit"],
    ...overrides,
  };
}

export function makeMatch(overrides: Partial<RhymesMatchResponse> = {}): RhymesMatchResponse {
  return {
    as_of_date: "2026-06-12",
    scope: "global",
    request_id: "req_abc123def456",
    latency_ms: 142,
    top_analogs: [
      makeAnalog(),
      makeAnalog({ rank: 2, episode_id: "ep-2", episode_name: "1973 Real Estate Cycle Peak", rhyme_score: 0.7012, episode_start_year: 1973, hoyt_amplification: 1.0, era_discount: 0.85, tags: ["hoyt_peak"] }),
      makeAnalog({ rank: 3, episode_id: "ep-3", episode_name: "1994 Bond Massacre (non-event)", rhyme_score: 0.61, episode_start_year: 1994, is_non_event: true, tags: [] }),
    ],
    scenarios: {
      bull: { probability: 0.25, narrative: "Awaiting multi-agent forecaster (Stage 5)." },
      base: { probability: 0.5, narrative: "Awaiting multi-agent forecaster (Stage 5)." },
      bear: { probability: 0.25, narrative: "Awaiting multi-agent forecaster (Stage 5)." },
    },
    trap_detector: {
      trap_flag: false,
      trap_reason: null,
      honeypot_match: null,
      crowding_score: null,
      consensus_divergence: null,
    },
    structural_alerts: [],
    confidence_meta: {
      agent_agreement: null,
      permutation_p_value: null,
      sample_size: 42,
      data_freshness_hours: 26.4,
      freshness_weight: 0.9,
      degraded_reason: null,
    },
    ...overrides,
  };
}

/** Degraded envelope exactly as the backend ships it: 200, empty analogs. */
export function makeDegradedMatch(reason: string): RhymesMatchResponse {
  return makeMatch({
    top_analogs: [],
    confidence_meta: {
      agent_agreement: null,
      permutation_p_value: null,
      sample_size: 0,
      data_freshness_hours: null,
      freshness_weight: 0.35,
      degraded_reason: reason,
    },
  });
}

/** The four degraded_reason values the backend can emit — verbatim. */
export const DEGRADED_REASONS = [
  "episode_embeddings_missing",
  "empty_episode_embeddings",
  "no_state_vector",
  "schema_not_applied",
] as const;
