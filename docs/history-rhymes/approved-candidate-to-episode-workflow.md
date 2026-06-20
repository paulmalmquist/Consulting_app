# Approved candidate → episode → embedding workflow (C9 — design only)

**Status:** design. No code, no schema, no API, no UI, no episode creation, no
`episode_embeddings` write, no LLM, no backfill. This specifies the final
human-gated path from an *approved* promotion candidate to a real `episodes` row
and then an `episode_embeddings` row. Implementation is C10+.

## The core rule

> An approved candidate is **not yet historical memory**. Only a *human-authored*
> `episodes` row can join the historical analog library, and that episode becomes
> *searchable* only after its `episode_embeddings` row exists. Episode fields are
> authored by a reviewer — never auto-filled, never LLM-generated, never
> placeholdered. The flow seals back through the C4 airlock
> (`record_promoted_episode_link`), the immutable receipt, and the C8-A platform
> audit.

## Five separated layers (never collapse)

| Layer | Table | Meaning |
|---|---|---|
| Model-ready observations | `hr_history_rhymes_model_observations` | feature rows / current state |
| Observation embeddings | `hr_feature_store_observation_embeddings` (10024) | current-state embeddings; comparison surface |
| Promotion airlock | `hr_episode_promotion_candidates` (10025) | reviewed, evidence-gated candidates |
| Historical episodes | `episodes` (434) | human-authored historical records |
| Episode embeddings | `episode_embeddings` (503) | embeddings for approved historical episodes **only** |

The flow runs left→right and **never** writes an observation embedding into
`episode_embeddings`.

---

## Verified ground truth (read before trusting the mapping)

`episodes` (`repo-b/db/schema/434_history_rhymes_wss.sql`) — **NOT NULL** columns
that a reviewer MUST author: `name`, `asset_class`, `start_date`,
`macro_conditions_entering`, `catalyst_trigger`, `timeline_narrative`. Nullable
narrative/quant fields: `category`, `peak_date`, `trough_date`, `end_date`,
`peak_to_trough_pct`, `max_drawdown_pct`, `volatility_regime`, `cross_asset_impact`,
`narrative_arc`, `recovery_pattern`, `modern_analog_thesis`, `tags`,
`dalio_cycle_stage`, `regime_type`, `is_non_event`. Provenance: `source VARCHAR(50)
DEFAULT 'manual'` — **but there is NO column for the originating candidate_id**
(documented gap below).

`episode_embeddings` (`503`): `episode_id` FK → `episodes(id)`, `embedding_type`
default `'full_state'`, `embedding vector(256)` NOT NULL, `model_version` default
`'concat-l2-v1'`, **`UNIQUE(episode_id, embedding_type, model_version)`** — so it
*already* supports append-only versioning; no schema change needed for embeddings.

Retrieval contract (`history_rhymes_service._search_analogs`, must stay unchanged):
`FROM episode_embeddings ee JOIN episodes e ON e.id = ee.episode_id WHERE
ee.embedding_type='full_state' ORDER BY ee.embedding <=> %s::vector`.

C4 seal (`promotion_candidates.record_promoted_episode_link(repo, candidate_id, *,
created_episode_id, promoted_at)`): marks an **approved** candidate `promoted`,
links the `episode_id` created **elsewhere**, and seals the receipt. C9 supplies
"elsewhere".

---

## Candidate eligibility (gate before drafting)

A candidate may enter this flow ONLY if all hold:
- `approval_status == 'approved'`
- `approval_actor` present AND `approval_timestamp` present
- `calibration_evidence_json` present
- `no_lookahead_audit_json.passed == true`
- `non_event_context_json` present
- `promotion_receipt_json` present (a v1 approval receipt exists)
- `source_quality != 'synthetic_fallback'` unless an explicit, audited override

`draft` / `needs_evidence` / `needs_review` / `rejected` / `superseded` /
already-`promoted` candidates are ineligible → block (`candidate_not_approved`,
`candidate_already_promoted`, `candidate_rejected`, `candidate_superseded`).

---

## Workflow stages

Each: purpose · inputs · outputs · required fields · failure states · allowed
actor · audit evidence · rollback/undo.

### 1. Approved candidate selection
- **Purpose:** pick an eligible approved candidate to promote.
- **Inputs:** candidate row (C4/C6 detail packet).
- **Outputs:** an in-progress promotion session (no writes yet).
- **Required:** eligibility (above).
- **Failure:** ineligible → exact reason; **no episode side effects**.
- **Actor:** platform admin / env manager.
- **Audit:** `episode_draft_started` (candidate_id, actor).
- **Rollback:** n/a (no writes).

### 2. Human-authored episode drafting
- **Purpose:** the reviewer authors the episode narrative — the irreducible human step.
- **Inputs:** candidate `narrative_summary`, `proposed_*` fields, evidence (as *reference*, not as autofill source).
- **Outputs:** a draft episode payload held in the candidate / session, not in `episodes`.
- **Required:** the reviewer must supply the NOT NULL episode fields (§ Mapping). The `proposed_*` fields PRE-FILL the form but the reviewer confirms/edits; the system never treats a missing field as auto-fillable.
- **Failure:** none yet (draft); a draft with gaps simply isn't creatable (stage 3).
- **Actor:** admin.
- **Audit:** draft saved (payload hash), no status change.
- **Rollback:** discard draft (no `episodes` write occurred).

### 3. Required episode field validation
- **Purpose:** prove every NOT NULL episode field is human-authored before any insert.
- **Inputs:** the draft payload.
- **Outputs:** pass/blockers.
- **Required:** non-empty `name`, `asset_class`, `start_date`, `macro_conditions_entering`, `catalyst_trigger`, `timeline_narrative`.
- **Failure (exact, per field):** `missing_episode_name`, `missing_asset_class`, `missing_start_date`, `missing_macro_conditions_entering`, `missing_catalyst_trigger`, `missing_timeline_narrative` (aggregate `missing_required_episode_fields`). **No `"TBD"`/`"Unknown"`/generated text accepted** — a placeholder-looking value (empty/whitespace) blocks.
- **Actor:** admin.
- **Audit:** `episode_creation_blocked` with the field reasons (if blocked).
- **Rollback:** n/a.

### 4. Evidence & receipt carry-forward
- **Purpose:** bind the approval evidence to the episode without mutating it.
- **Inputs:** candidate `calibration_evidence_json`, `no_lookahead_audit_json`, `non_event_context_json`, `promotion_receipt_json`.
- **Outputs:** an `episode_payload_hash` + the carried receipt reference for the final seal/audit.
- **Required:** evidence unchanged (read-only); hashes computed with the C4 `stable_hash`.
- **Failure:** evidence missing (shouldn't happen post-eligibility) → block.
- **Actor:** system.
- **Audit:** hashes recorded.
- **Rollback:** n/a.

### 5. Episode row creation
- **Purpose:** insert the human-authored `episodes` row (the library write).
- **Inputs:** validated draft payload.
- **Outputs:** one `episodes` row, `source='promotion'`, returns `episode_id`.
- **Required:** stage 3 passed; explicit confirmation.
- **Failure:** DB error → `episode_creation_failed` (no partial state); a NOT NULL violation should be impossible because stage 3 gates it.
- **Actor:** admin + confirmation.
- **Audit:** `episode_created` (candidate_id, episode_id, actor, `episode_payload_hash`).
- **Rollback:** episode creation is **append-only**; "undo" is a domain decision (e.g. mark the episode inactive in a later ticket), never a silent delete that breaks retrieval.

### 6. Episode embedding planning
- **Purpose:** decide what embedding to write, before writing it.
- **Inputs:** `episode_id`, the candidate's 256-dim `feature_vector` (or a re-encode of the episode's canonical features), the target `model_version`.
- **Outputs:** an embedding plan (dim check, dedup check) — no write.
- **Required:** `len(feature_vector) == 256`; `(episode_id, 'full_state', model_version)` not already present.
- **Failure:** `embedding_dimension_mismatch`; `episode_embedding_duplicate`.
- **Actor:** admin.
- **Audit:** `episode_embedding_planned` (`embedding_plan_hash`).
- **Rollback:** n/a (plan only).

### 7. Episode embedding creation
- **Purpose:** make the episode searchable.
- **Inputs:** the plan.
- **Outputs:** one `episode_embeddings` row `(episode_id, 'full_state', model_version)`, append-only (`ON CONFLICT (episode_id, embedding_type, model_version) DO NOTHING`).
- **Required:** the episode row exists; dim 256; a real `model_version`.
- **Failure:** `episode_embedding_failed` (write error) → the episode exists but is **not searchable**; surface `embedding_pending`/`embedding_failed`, never claim searchable.
- **Actor:** admin + confirmation (separate from episode creation).
- **Audit:** `episode_embedding_created` or `episode_embedding_failed`.
- **Rollback:** never overwrite an existing embedding; a failed write leaves no partial row.

### 8. Candidate link / seal
- **Purpose:** close the airlock — link the episode back to the candidate.
- **Inputs:** `candidate_id`, `created_episode_id`.
- **Outputs:** candidate `approval_status='promoted'`, `created_episode_id` set, sealing receipt (C4 `record_promoted_episode_link`, receipt v2).
- **Required:** candidate is `approved`; episode exists.
- **Failure:** `missing_created_episode_id`; `invalid_status_transition`.
- **Actor:** system (driven by the admin action).
- **Audit:** `candidate_promoted_sealed`.
- **Rollback:** `promoted` is terminal; corrections happen via a NEW candidate.

### 9. Platform audit record
- **Purpose:** cross-domain governance trail (C8-A).
- **Inputs:** all stage outputs.
- **Outputs:** `ai_decision_audit_log` rows (`decision_type=history_rhymes_promotion_candidate_action`) for each state-changing stage.
- **Required:** actor, hashes.
- **Failure:** audit-write failure → `audit_status="failed"` (visible), never hides the result.
- **Actor:** system.
- **Audit:** the rows themselves.
- **Rollback:** n/a (append-only log).

### 10. Post-promotion retrieval regression check
- **Purpose:** prove the library write didn't break analog retrieval.
- **Inputs:** the new `episode_id`.
- **Outputs:** confirmation that `_search_analogs` returns the episode **only after** both the episode row and its `full_state` embedding exist; the query/filter is unchanged.
- **Required:** observation embeddings are NOT searched as episodes; Feature Foundry stays read-only.
- **Failure:** `retrieval_contract_failed` (a guard test, not a runtime block).
- **Actor:** test/CI.
- **Audit:** n/a.

---

## Episode field mapping (candidate → `episodes`)

| Candidate field | `episodes` column | Required? | Transformation | Validation |
|---|---|---|---|---|
| `proposed_episode_name` (reviewer-confirmed) | `name` | **yes** | trim | non-empty → else `missing_episode_name` |
| `proposed_asset_class` | `asset_class` | **yes** | trim | non-empty → else `missing_asset_class` |
| `proposed_start_date` | `start_date` | **yes** | date parse | valid date → else `missing_start_date` |
| reviewer-authored | `macro_conditions_entering` | **yes** | none | non-empty, not placeholder → else `missing_macro_conditions_entering` |
| reviewer-authored | `catalyst_trigger` | **yes** | none | non-empty, not placeholder → else `missing_catalyst_trigger` |
| `narrative_summary` / reviewer-authored | `timeline_narrative` | **yes** | none | non-empty, not placeholder → else `missing_timeline_narrative` |
| `proposed_category` | `category` | no | trim | — |
| `proposed_peak/trough/end_date` | `peak_date/trough_date/end_date` | no | date parse | — |
| `proposed_tags` | `tags` | no | array | — |
| `candidate_label == 'non_event'` | `is_non_event` | no | bool | — |
| `non_event_context_json.regime` | `regime_type` | no | map | — |
| (constant) | `source` | no | `'promotion'` | — |

**Rules:** do not mutate candidate evidence during mapping; episode creation is
append-only; `source='promotion'` marks origin.

**Documented gap (propose a later schema ticket — C11):** `episodes` has **no
column** for the originating `candidate_id` / `observation_id`. Until a column is
added (e.g. `origin_candidate_id uuid` or an `origin_json jsonb`), origin is
preserved in the candidate `promotion_receipt_json` (which carries `created_episode_id`)
and the C8-A platform audit (`candidate_id` + `episode_id`). Do not invent an
`episodes` column in C9; do not stuff origin into a narrative field.

---

## Episode embedding design

- Write only after the `episodes` row exists (needs `episode_id`).
- `embedding_type = 'full_state'` (preserves the retrieval contract).
- `embedding` is the 256-dim state vector (candidate `feature_vector`, or a
  re-encode of the episode's canonical features via the spine encoder — an
  implementation choice for C10/C12; C9 only requires dim 256).
- Append-only: `ON CONFLICT (episode_id, embedding_type, model_version) DO NOTHING`.
  **No in-place overwrite.** The schema already supports model versioning via the
  UNIQUE key, so no schema change is needed — a new encoder version produces a NEW
  row.

---

## Transaction boundary options

### Option A — two-step commit
Episode row (commit) → episode embedding (commit) → seal candidate.
- **Pros:** simple; an embedding failure leaves a valid, *non-searchable* episode that can be retried; matches the schema's append-only embedding.
- **Cons:** an interim window where the episode exists but isn't searchable (must be shown honestly).

### Option B — single transaction (episode + embedding + seal)
- **Pros:** atomic — no partial state; episode is searchable the moment it's visible.
- **Cons:** couples episode creation to embedding success; an embedding failure rolls back a fully human-authored episode (wasteful); harder if embedding is slow.

### Option C — episode row now, embedding async later
Episode created + `embedding_pending`; embedding generated asynchronously → `embedding_ready`/`embedding_failed`.
- **Pros:** resilient to slow/failing embedding generation; episode authorship isn't lost; clean "not searchable yet" state.
- **Cons:** requires a visible searchability state machine + a worker; more moving parts.

### Recommendation
**Option C if embedding generation may fail or be slow** — with an explicit
`embedding_pending` / `embedding_failed` state, and the surface NEVER claiming the
episode is searchable until the embedding exists. **If the system requires
immediate analog use, Option A** with explicit failure handling (episode created,
embedding retried, searchability badge honest). Avoid Option B unless embedding is
fast and in-process — atomicity isn't worth discarding human-authored episodes on a
transient embedding error. Either way: **episode creation and embedding creation are
separate, separately-confirmed steps**, and searchability is asserted only once the
embedding row exists.

---

## API design (contracts only — do NOT implement)

Namespace `/api/hr/v1/promotion-candidates/{candidate_id}/…` (extends the C6
family; final names at C10):

```
POST …/draft-episode               # save/validate a human-authored draft (no episodes write)
POST …/create-episode              # insert the episodes row (confirmation required) → episode_id
POST …/plan-episode-embedding      # dim/dedup plan (no write)
POST …/create-episode-embedding    # insert episode_embeddings (confirmation required)
POST …/seal-promoted-episode       # C4 record_promoted_episode_link + final receipt
```

Every state-changing route requires: authenticated request + `x-bm-platform-admin:
true` + actor (`x-bm-actor`) + an explicit confirmation flag for create-episode and
create-episode-embedding. Blocked response (HTTP 409) preserves exact reasons:

```json
{ "status": "blocked", "blocked_reasons": [], "candidate_id": "...", "approval_status": "...", "allowed_actions": [] }
```

---

## UI design (boundaries only — do NOT implement)

Extends the C7 review surface with: **Episode Draft Panel** (reviewer authors the
NOT NULL fields, pre-filled from `proposed_*`), **Required Episode Fields Panel**
(per-field pass/missing), **Episode Creation Confirmation Modal**, **Episode
Embedding Plan Panel**, **Searchability Status Badge** (`not_created` →
`episode_created · embedding_pending` → `searchable` / `embedding_failed`), **Seal
Promotion Receipt Panel**. Copy is explicit:

> Creating an episode adds reviewed historical memory. Creating an embedding makes
> that episode searchable by analog retrieval. This action is not automatic and
> cannot use placeholders.

No LLM-authored fields, no auto-promotion, no forced-rhyme language.

---

## Audit & receipt design

Each stage updates `promotion_receipt_json`, the platform audit log, or both.
Audit entries: `episode_draft_started`, `episode_creation_blocked`,
`episode_created`, `episode_embedding_planned`, `episode_embedding_created`,
`candidate_promoted_sealed`, `episode_embedding_failed`. Payload:
`candidate_id`, `episode_id` (if created), `actor`, `old_status`, `new_status`,
`request_payload_hash`, `episode_payload_hash`, `embedding_plan_hash`,
`receipt_hash`, `blocked_reasons` — reusing the C8-A `stable_hash` + the
`history_rhymes_promotion_candidate_action` decision type.

---

## Failure states (exact reasons for C10+)

`candidate_not_approved` · `candidate_already_promoted` · `candidate_rejected` ·
`candidate_superseded` · `missing_required_episode_fields` · `missing_episode_name` ·
`missing_asset_class` · `missing_start_date` · `missing_macro_conditions_entering` ·
`missing_catalyst_trigger` · `missing_timeline_narrative` · `no_lookahead_failed` ·
`missing_calibration_evidence` · `missing_non_event_context` ·
`episode_creation_failed` · `episode_embedding_failed` ·
`embedding_dimension_mismatch` · `episode_embedding_duplicate` ·
`retrieval_contract_failed` · `missing_actor` · `confirmation_required`.

---

## Acceptance Criteria (for future C10+ implementation)

### API
- Protected admin routes create an episode only from an `approved` candidate.
- Exact blocked reasons returned for missing fields or invalid candidate status.
- Episode embedding creation happens only after the episode row exists.
- Candidate sealing calls C4 `record_promoted_episode_link`.

### Data
- No direct `observation_id` insert into `episode_embeddings`.
- `episodes` row is append-only and human-authored.
- `episode_embeddings` row references a real `episode_id`; append-only by `(episode_id, embedding_type, model_version)`.
- Candidate receipt and platform audit capture hashes + actor; origin lives in receipt/audit until an `episodes` origin column ships (C11).

### UI
- Reviewer sees required episode fields before creation.
- Reviewer confirms episode creation separately from embedding creation.
- Searchability status is visible and honest (never "searchable" pre-embedding).

### AI behavior
- No LLM-generated episode fields; no auto-promotion; no forced-rhyme language.

### Regression guards
- `_search_analogs` contract unchanged (`episode_embeddings JOIN episodes WHERE embedding_type='full_state'`).
- Observation embeddings remain separate from episode embeddings.
- Feature Foundry remains read-only with respect to promotion.

---

## Explicitly out of scope for C9
schema migration · API routes · React components · episode creation ·
`episode_embeddings` writes · embedding-provider calls · LLM summaries/labels ·
automatic candidate discovery · backfill · connector/infra changes · production
deploy. Anything requiring implementation to answer is recorded here as a gap
(the `episodes` origin-column gap → C11), not built.

---

## C10 — episode-creation API (IMPLEMENTED, 2026-06-18)

C10 implements stages 1-5 + 9 of this design (validate + create the `episodes`
row), API only — NO embedding, NO seal, NO searchability:

- **`backend/app/services/hr_feature_store/episode_creation.py`** —
  `eligibility_blockers` (approved + actor + receipt + the carried C4 evidence
  gate; blocks `candidate_not_approved`/`_rejected`/`_superseded`/
  `_already_promoted`/`_already_has_episode`), `field_blockers` (exact
  `missing_<field>` reasons for the verified NOT NULL set, rejecting empty/
  placeholder values), `build_episode_preview` (candidate `proposed_*` defaults
  UNDER the reviewer payload; never invents a required value; sets
  `source='promotion'`), and `validate_episode`/`create_episode` (insert exactly
  one row via `DbEpisodeRepository`). It never writes embeddings, seals, or calls
  an encoder/LLM.
- **Routes** (in the C6 file): `POST …/validate-episode` (writes nothing) and
  `POST …/create-episode` (admin gate + actor + `confirm:true`). Blocked → HTTP 409
  with exact reasons + `allowed_actions`; success →
  `{status:"created", episode_id, searchable:false, embedding_status:"not_created",
  next_required_step:"create_episode_embedding"}`. Both audit via C8-A
  (`episode_validation_blocked`/`_eligible`, `episode_created_from_candidate`).
- **Origin gap** stays as C9 documented: `source='promotion'` is set, but the
  originating `candidate_id` lives in the audit/response, not an `episodes` column
  (→ C11). The candidate is NOT sealed and its status is unchanged — sealing +
  embedding are C12.

Searchability is still false after C10: the episode exists as reviewed historical
memory but won't appear in `_search_analogs` until its `full_state`
`episode_embeddings` row is created later.
