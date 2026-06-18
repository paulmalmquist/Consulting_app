# Embedding backfill (C1 / C2-B) — gated, dry-run-first promotion

Promoting vetted feature-store model observations into an embedding store is a
**gated promotion, not a materializer side effect**. This is the safety contract;
the planner refuses to write unless every gate passes, and even then only behind
explicit flags.

## Two targets (C2-B)

| Target | Table | Default? | Keyed by | Notes |
|---|---|---|---|---|
| `observation_embeddings` | `hr_feature_store_observation_embeddings` (10020) | **yes** | `(observation_id, model_obs_version, embedding_model_version)` | The safe home for feature-store observations. No episode mapping needed. Requires `--embedding-model-version`. |
| `episode_embeddings` | `episode_embeddings` (503) | no | `(episode_id, embedding_type, model_version)` | The historical analog library. Stays **blocked** unless an explicit episode mapping resolves — and none exists for gold rows, so it emits a mapping proposal. C2-B does not weaken this. |

**Why a separate table (C2-B):** `episode_embeddings` is keyed by `episode_id`
(FK → `episodes`); gold observations carry no `episode_id`. Rather than hack the
mismatch or force observations into the episode library, feature-store
observations get their own append-only table. Promotion of an observation *into*
the episode library is a separate human-reviewed workflow (C3), never an implicit
write. `episode_embeddings` is left entirely untouched by C2-B.

## Default behavior

```
dry-run only · no writes · no production mutation · no in-place overwrite
```

The CLI defaults to a dry-run that writes nothing and exits 0 with a structured
receipt — *even when blocked*. A blocked dry-run is a normal outcome, not an
error.

## The only write path

A write happens only behind ALL of:

```
--write  AND  --confirm  AND  --model-version <new>  AND  valid --calibration-evidence
AND every gate passing  AND  append-only (non-overwrite) insert
```

## Gates (a batch is eligible only if all pass)

| Gate | Rule | Source |
|---|---|---|
| Brier score | `< 0.22` | calibration evidence file |
| Permutation p-value | `< 0.05` | calibration evidence file |
| No-lookahead audit | no banned future/target field in `features_normalized`, `provenance`, or `lineage_json.inputs`; `as_of_date` present | computed deterministically over candidate rows (`backfill_audit.py`) |
| Model-version bump | requested version is non-empty, not `concat-l2-v1`, not already in `episode_embeddings`, and matches the evidence version | repo + evidence |
| Feature-vector dim | `len(feature_vector) == 256` | per row |
| Source quality | `source_quality == "live"` (synthetic / fixture / fallback are **not** promotable) | per row |
| Episode mapping | candidate resolves to an `episode_id` | repo |
| Non-overwrite | `(episode_id, embedding_type, model_version)` not already present → skip | repo |
| Non-event coverage | `non_event / crisis >= 2.0` (`pass`); `>= 1.0` (`degraded`); `< 1.0` (`fail`) — degraded/fail block | aggregate |

Banned no-lookahead substrings: `forward_return`, `future_return`, `target_`,
`resolved_`, `actual_outcome`, `max_drawdown_next`, `next_30d`.

If any gate fails the receipt returns `status="blocked"`, `write_allowed=false`,
and `blocked_reasons=[…]`. **No partial write.**

## Known schema gap → C2 (do not hack)

`episode_embeddings` is keyed by `episode_id` (FK → `episodes`,
`repo-b/db/schema/503_history_rhymes_structural.sql`). The gold
`hr_history_rhymes_model_observations` rows carry `observation_id` / `as_of_date`,
**no `episode_id`**. So the live DB repository resolves no mapping → the planner
blocks on `episode_mapping_unresolved` and emits a `mapping_proposal`:

- **C2-A** — a read-only adapter resolving `as_of_date` / anchor name to
  `episodes.id` (no schema change), or
- **C2-B** — a feature-store-specific embedding table keyed by
  `(observation_id, model_version)` with its own HNSW index, leaving
  `episode_embeddings` untouched.

No schema change in C1. Update the active plan and open C2 before any adapter
work.

## Calibration evidence

A committed fixture or a `--calibration-evidence path/to/evidence.json` file with:

```json
{
  "brier_score": 0.184,
  "permutation_p_value": 0.012,
  "no_lookahead_passed": true,
  "model_version": "hr_feature_store_v2",
  "evidence_generated_at": "2026-06-18T00:00:00Z",
  "evidence_source": "fixture:hr_feature_store/backfill/calibration_pass.json"
}
```

Missing evidence ⇒ `blocked` with `missing_calibration_evidence` +
`missing_permutation_evidence`. Metrics are never fabricated; C1 does **not**
run a calibration job or a full permutation engine — it *requires* the evidence.

## CLI

```bash
# dry-run (default target = observation_embeddings): plan only, exit 0 even if blocked
python scripts/history_rhymes/episode_embeddings_backfill.py \
  --dry-run --target observation_embeddings \
  --model-version hr_feature_store_v2 --embedding-model-version state_vector_encoder_v1 \
  --calibration-evidence backend/tests/fixtures/hr_feature_store/backfill/calibration_pass.json \
  --limit 25 --json

# write to the observation table (all gates must pass; tested only with a fake repo)
python scripts/history_rhymes/episode_embeddings_backfill.py \
  --write --confirm --target observation_embeddings \
  --model-version hr_feature_store_v2 --embedding-model-version state_vector_encoder_v1 \
  --calibration-evidence backend/tests/fixtures/hr_feature_store/backfill/calibration_pass.json \
  --limit 25 --json

# episode_embeddings target: blocks on episode mapping against the live DB
python scripts/history_rhymes/episode_embeddings_backfill.py \
  --dry-run --target episode_embeddings --model-version hr_feature_store_v2 --json
```

The write command is exercised only in tests with a fake repository. Do not run
it against production.

## Files

- `backend/app/services/hr_feature_store/embedding_backfill.py` — planner (two targets), gated executor, fail-soft DB repo, C2 mapping proposal.
- `backend/app/services/hr_feature_store/backfill_gates.py` — gate primitives + thresholds.
- `backend/app/services/hr_feature_store/backfill_audit.py` — deterministic no-lookahead audit.
- `scripts/history_rhymes/episode_embeddings_backfill.py` — dry-run-first CLI (`--target`, `--embedding-model-version`).
- `repo-b/db/schema/10020_history_rhymes_observation_embeddings.sql` — C2-B observation-keyed table (additive; `episode_embeddings` untouched).
- `backend/tests/test_hr_feature_store_embedding_backfill.py` — C1 fixture-only tests.
- `backend/tests/test_hr_feature_store_observation_embeddings.py` — C2-B observation-target + migration static tests.
