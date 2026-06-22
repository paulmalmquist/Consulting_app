# Observation → Episode promotion workflow (C3 — design only)

**Status:** design. No code, no schema, no migration, no API, no UI, no backfill.
This document specifies the human-reviewed path by which a vetted feature-store
observation may *eventually* become a historical episode in the analog library.
Implementation is C4+, only after this design is approved.

## The core rule

> An observation is **not** a historical episode until a human-reviewed promotion
> workflow creates an `episodes` record with evidence, labels, non-event/crisis
> classification, calibration receipts, a no-lookahead audit, and explicit
> approval — and then creates an `episode_embeddings` row for that `episode_id`.

Storing an observation embedding (C2-B) is a comparison surface. It is **not** a
promotion. Promotion is the layer that stops "cool-looking analogs" from quietly
becoming bad institutional memory.

## Four separated concepts (never collapse)

| Layer | Table | Grain / key | Meaning |
|---|---|---|---|
| Model-ready observations | `hr_history_rhymes_model_observations` | `(observation_id, as_of_date, model_obs_version)` | feature rows; current/recent market state |
| Observation embeddings | `hr_feature_store_observation_embeddings` (C2-B, 10024) | `(observation_id, model_obs_version, embedding_model_version)` | append-only current-state embeddings; comparison surface |
| Historical episodes | `episodes` (434) | `episodes.id` (uuid) | reviewed historical episode records |
| Episode embeddings | `episode_embeddings` (503) | `(episode_id, embedding_type, model_version)` | embeddings **for reviewed historical episodes only** |

The promotion flow moves strictly left→right and never the reverse:

```
hr_history_rhymes_model_observations
   └─(+ hr_feature_store_observation_embeddings)
        → reviewed episode CANDIDATE  (new storage — see Options)
            → APPROVED candidate (human)
                → episodes row (episode_id)
                    → episode_embeddings row (for that episode_id)
                        → promotion receipt (immutable)
```

**Never** write an observation row directly into `episode_embeddings`. An
embedding only enters the library *after* an `episodes` row exists for it.

---

## Verified ground truth (read before trusting any field mapping)

The `episodes` table (`repo-b/db/schema/434_history_rhymes_wss.sql`) has these
columns — this is the real promotion target, not an invented one:

```
id uuid PK, name, asset_class, category,
start_date, peak_date, trough_date, end_date, duration_days,
peak_to_trough_pct, recovery_duration_days, max_drawdown_pct, volatility_regime,
macro_conditions_entering (NOT NULL), catalyst_trigger (NOT NULL),
timeline_narrative (NOT NULL), cross_asset_impact jsonb, narrative_arc,
recovery_pattern, modern_analog_thesis,
tags text[], dalio_cycle_stage, regime_type, is_non_event bool default false,
source default 'manual', created_at, updated_at
```

`episode_embeddings` (`503`): `episode_id` FK → `episodes(id)`, `embedding_type`
default `'full_state'`, `embedding vector(256)`, `model_version` default
`'concat-l2-v1'`, `feature_panel jsonb`, `UNIQUE(episode_id, embedding_type, model_version)`.

The **non-event detector precedent** already exists:
`episode_detection_audit` (`503`) logs every scanned crisis-precursor window with
`classification IN ('non_event','event','rejected_overlap','rejected_no_recovery','rejected_blip')`,
`content_hash` dedup, and an `episode_id` link when a row was inserted. C3's
labeling stage should align with this vocabulary, not invent a parallel one.

**Retrieval contract that must stay unchanged** (`history_rhymes_service.py`
`_search_analogs`): `SELECT … FROM episode_embeddings ee JOIN episodes e …
WHERE ee.embedding_type='full_state' ORDER BY ee.embedding <=> %s::vector`.
Promotion must not change this query, its `embedding_type='full_state'` filter,
or the Databricks pipeline that populates `episode_embeddings` today. Promotion is
an *additional* writer into the same target, gated by review.

---

## Workflow stages

Each stage lists: purpose · inputs · outputs · required fields · failure states ·
who/what approves · audit evidence.

### 1. Candidate discovery
- **Purpose:** surface observations that *might* deserve to be episodes — never auto-promote.
- **Inputs:** `hr_history_rhymes_model_observations` (+ its `hr_feature_store_observation_embeddings` row when one exists).
- **Outputs:** `draft` candidates with a `candidate_type`.
- **Required fields:** `observation_id`, `as_of_date`, `model_obs_version`, `source_quality`, `candidate_type`.
- **Candidate types:** `crisis_anchor` · `non_event_anchor` · `regime_shift` · `trap_candidate` · `honeypot_candidate` · `routine_market_state`.
- **Exclusion rules (a candidate is NOT eligible if any holds):**
  `source_quality == 'synthetic_fallback'` (or `synthetic`) · `model_readiness_score` below threshold · missing `lineage_json` · `leakage_risk == 'high'` · batch `non_event_to_event_ratio < 2.0` · unresolved targets · missing calibration evidence.
- **Failure states:** excluded → `rejected` with reason; eligible → `draft`.
- **Approver:** machine (discovery is a proposal, never an approval).
- **Audit:** the exclusion reason is recorded; "not surfaced" is logged, not silent.

### 2. Candidate review packet
- **Purpose:** assemble everything a human needs to judge the candidate in one object.
- **Inputs:** the candidate + its observation + embedding + lineage + calibration evidence.
- **Outputs:** a `needs_review` packet (shape below).
- **Required fields:** the full packet contract (§ Review packet).
- **Failure states:** missing evidence → `needs_evidence` (not reviewable).
- **Approver:** machine assembles; human consumes.
- **Audit:** packet is immutable once `needs_review`; later edits create a new version.

### 3. Non-event / crisis labeling
- **Purpose:** force explicit classification so the library doesn't become crash-only.
- **Inputs:** packet + batch coverage stats.
- **Outputs:** `candidate_label` ∈ `episode_detection_audit.classification` vocabulary (`non_event`/`event`/…), `condition_cluster`, `coverage_status`.
- **Required fields:** `candidate_label`, `non_event_to_event_ratio`, `condition_cluster`, `coverage_status`.
- **Failure states:** `non_event_to_event_ratio < 2.0` → **block**, or require explicit `coverage_override` + reason from an authorized reviewer (the override is itself audited).
- **Approver:** human reviewer assigns the label; coverage override needs a senior reviewer.
- **Audit:** label + ratio + override reason persisted on the candidate.

### 4. Evidence attachment
- **Purpose:** prove the episode claim is grounded, not narrative.
- **Inputs:** features snapshot, top drivers, external links, lineage.
- **Outputs:** `features_snapshot`, `top_feature_drivers`, `external_links_json`, `lineage_json` on the packet.
- **Required fields:** non-empty `lineage_json`; at least one external link or an explicit "no external source" note.
- **Failure states:** no lineage → back to `needs_evidence`.
- **Approver:** machine attaches; human verifies.
- **Audit:** evidence is part of the immutable packet version.

### 5. Calibration receipt attachment
- **Purpose:** carry the same gate evidence the backfill planner requires.
- **Inputs:** `calibration_evidence_json` (Brier, permutation p, no-lookahead, model_version, generated_at, source) — the C1/C2-B evidence contract.
- **Outputs:** `calibration_evidence_json` on the packet.
- **Required fields:** `brier_score < 0.22`, `permutation_p_value < 0.05`, `no_lookahead_passed`, `model_version`, `evidence_generated_at`, `evidence_source`.
- **Failure states:** missing/failing → `needs_evidence`; never fabricate metrics.
- **Approver:** machine validates thresholds; human cannot waive calibration.
- **Audit:** receipt copied verbatim into the promotion receipt at stage 10.

### 6. No-lookahead audit
- **Purpose:** preserve C1's leakage guard at the episode boundary.
- **Inputs:** candidate `features_normalized`, `provenance`, `lineage_json.inputs`, and the **proposed episode start_date**.
- **Outputs:** `no_lookahead_audit_json` = `{passed, violations[], knowable_as_of}`.
- **Required fields:** banned-substring scan (`forward_return`, `future_return`, `target_`, `resolved_`, `actual_outcome`, `max_drawdown_next`, `next_30d`) is clean; **plus** a "knowable-at-start" proof: every feature's source timestamp ≤ `proposed_start_date` (an episode dated to T must be built only from data available at T).
- **Failure states:** any banned field or any source later than `proposed_start_date` → **block**.
- **Approver:** machine (deterministic); a human cannot override a leakage block.
- **Audit:** the audit JSON is part of the immutable receipt.

### 7. Human approval
- **Purpose:** the irreducible human gate.
- **Inputs:** a fully-populated `needs_review` packet that passed stages 3–6.
- **Outputs:** `approval_status` ∈ {`approved`, `rejected`}, `approval_actor`, `approval_timestamp`.
- **Required fields:** non-null `approval_actor` (a real human identity, not a service role), timestamp, optional `reviewer_notes`.
- **Failure states:** any gate not passed → approval is not offerable.
- **Approver:** human only. No automated/agent approval. No service-role approval.
- **Audit:** approval action logged immutably.

### 8. Episode creation
- **Purpose:** create the `episodes` row from the approved candidate.
- **Inputs:** approved candidate.
- **Outputs:** one `episodes` row (`episode_id`), `source='promotion'`.
- **Required fields:** the `episodes` NOT NULL columns must be satisfied (`name`, `asset_class`, `macro_conditions_entering`, `catalyst_trigger`, `timeline_narrative`) — see § Mapping for gaps.
- **Failure states:** a NOT NULL field cannot be derived → back to `needs_evidence` (do not insert a placeholder).
- **Approver:** the promotion executor, only for `approved` candidates.
- **Audit:** candidate → `episode_id` link recorded.

### 9. Episode embedding creation
- **Purpose:** make the new episode retrievable.
- **Inputs:** the new `episode_id` + the candidate's `feature_vector` (256-dim).
- **Outputs:** one `episode_embeddings` row `(episode_id, 'full_state', model_version)`, append-only (`ON CONFLICT DO NOTHING`).
- **Required fields:** `episode_id` exists; `feature_vector` dim == 256; a real `model_version` bump.
- **Failure states:** dim mismatch or duplicate key → skip with reason; never overwrite an existing embedding.
- **Approver:** promotion executor.
- **Audit:** the insert (or skip) is recorded in the receipt.

### 10. Post-promotion audit receipt
- **Purpose:** an immutable record of why this observation became an episode.
- **Inputs:** all prior stage outputs.
- **Outputs:** an immutable `promotion_receipt` linking `observation_id` → `episode_id` with calibration + no-lookahead + label + approver + coverage.
- **Required fields:** `observation_id`, `episode_id`, `calibration_evidence_json`, `no_lookahead_audit_json`, `candidate_label`, `approval_actor`, `approval_timestamp`, `coverage_status`.
- **Failure states:** none (terminal); the receipt is write-once.
- **Approver:** system.
- **Audit:** the receipt *is* the audit.

---

## Review packet contract

Field names reuse the `episodes` schema where one exists (so episode creation is a
direct map); `proposed_*` marks reviewer-editable proposals before approval.

```
candidate_id                # new candidate identity
observation_id              # FK-ish to hr_history_rhymes_model_observations
as_of_date
model_obs_version
embedding_model_version     # from hr_feature_store_observation_embeddings
source_quality
candidate_type              # crisis_anchor | non_event_anchor | regime_shift | trap_candidate | honeypot_candidate | routine_market_state
proposed_episode_name       # → episodes.name
proposed_asset_class        # → episodes.asset_class
proposed_category           # → episodes.category
proposed_start_date         # → episodes.start_date  (no-lookahead anchor)
proposed_peak_date          # → episodes.peak_date
proposed_trough_date        # → episodes.trough_date
proposed_end_date           # → episodes.end_date
proposed_tags               # → episodes.tags
narrative_summary           # → episodes.timeline_narrative / narrative_arc
features_snapshot           # evidence
top_feature_drivers         # evidence
readiness_score             # exclusion input
readiness_degrade_reasons
lineage_json                # → (no episodes column today — gap)
external_links_json         # → (no episodes column today — gap)
calibration_evidence_json   # → (no episodes column today — gap)
no_lookahead_audit_json     # → (no episodes column today — gap)
non_event_context_json      # condition_cluster, ratio, coverage_status
reviewer_notes
approval_status             # draft|needs_evidence|needs_review|approved|rejected|superseded|promoted
approval_actor
approval_timestamp
```

---

## Approval status machine

```
draft ──► needs_evidence ──► needs_review ──► approved ──► promoted
  │            ▲                   │
  │            └───────────────────┤ (missing/failed evidence)
  ▼                                ▼
rejected                        rejected
  │
  └─ superseded ──► (points to replacement candidate_id)
```

Rules:
- Only **`approved`** candidates can create `episodes` rows.
- **`rejected`** cannot be promoted without a *new* review (new candidate version).
- **`superseded`** carries `superseded_by = <candidate_id>` (the replacement).
- Promotion (`approved → promoted`) writes an **immutable** receipt; `promoted` is terminal.
- Approval requires a real human `approval_actor`. No agent/service-role approval.

---

## Non-event discipline (enforced, not cosmetic)

The design must compute and surface, per promotion batch:
`non_event_to_event_ratio`, `condition_cluster`, `candidate_label`, `coverage_status`.

- **Target:** `non_event_to_event_ratio >= 2.0` (the existing History Rhymes
  survivorship-bias correction, mirrored from `episode_detection_audit`).
- **Below target:** **block** the promotion, OR allow an explicit
  `coverage_override` with a written reason by a senior reviewer (override is
  audited and appears on the receipt). Never silently expand the library
  crisis-first.

---

## Episode-creation mapping + documented gaps

Direct, faithful mapping (no invented fields):

| Candidate field | `episodes` column |
|---|---|
| `proposed_episode_name` | `name` |
| `proposed_asset_class` | `asset_class` |
| `proposed_category` | `category` |
| `proposed_start_date/peak/trough/end` | `start_date/peak_date/trough_date/end_date` |
| `proposed_tags` | `tags` |
| `candidate_label == 'non_event'` | `is_non_event = true` |
| `narrative_summary` | `timeline_narrative` (NOT NULL) |
| `non_event_context_json.regime` | `regime_type` |
| (constant) | `source = 'promotion'` |

**NOT NULL fields with no clean source today** → must be supplied by the reviewer
at stage 8, never auto-placeholdered: `macro_conditions_entering`,
`catalyst_trigger`, `timeline_narrative`.

**Gaps — `episodes` cannot represent this promoted metadata** (document, defer to
C4 schema work; do **not** invent columns here):
- `model_obs_version`, `embedding_model_version` — no column on `episodes`.
- `calibration_evidence_json`, `no_lookahead_audit_json`, `lineage_json`, `external_links_json` — no column on `episodes`.
- A back-link from `episodes` → originating `observation_id`/`candidate_id`.

These belong on a candidate/receipt store (next section), **not** bolted onto
`episodes`, which is the human-curated narrative library.

---

## Implementation options (compare; recommend)

### Option A — `hr_episode_promotion_candidates` table (+ receipt)
A real candidate table holding the packet, status machine, and an immutable
promotion receipt; `episode_id` set on promotion.
- **Pros:** queryable review queue; enforces the status machine in the DB; natural home for the gap fields; clean append-only receipt; scales to a review UI.
- **Cons:** new schema (migration, RLS-exempt `hr_` justification, COMMENTs); more surface to get right; premature if promotion volume is ~0.

### Option B — docs/receipt-only, no table yet
Capture candidates and approvals as committed receipt artifacts / audit-log rows
until volume justifies a table.
- **Pros:** zero schema risk now; fast; honest for a near-empty promotion pipeline.
- **Cons:** no queryable queue; weak status enforcement; doesn't scale; awkward to wire a UI to.

### Option C — reuse existing Winston work-item / audit tables
Model candidates as ADO work items + `ai_decision_audit_log` receipts.
- **Pros:** reuses existing approval + audit surfaces; no new HR schema.
- **Cons:** `ai_decision_audit_log.decision_type` CHECK only allows
  `tool_call|response|classification|fast_path` — a `promotion` type needs a
  migration to extend the CHECK (documented trap); semantic mismatch (work items
  aren't market episodes); couples HR library curation to the generic audit log.

### Recommendation
**Option A is the eventual target — but not yet.** Make the promotion *semantics*
explicit first (this doc). Implement the storage/receipt contract in **C4**, after
this design is approved. Until then, a thin Option-B receipt is acceptable for the
first one or two manual promotions. This is the layer that prevents
"cool-looking analogs" from becoming bad institutional memory, so the gate
(human approval + calibration + no-lookahead + non-event coverage) matters more
than the storage shape — get the gate agreed before building the table.

---

## Acceptance Criteria (for future C4+ implementation)

### Screen
- Promotion review queue (later): list candidates by status; open a packet; show evidence, calibration, no-lookahead, non-event coverage; approve/reject with actor + notes. Full-bleed dark console; no shared app shell.

### API
- Later: candidate create (from observation), review/label, attach evidence, approve/reject, promote. Promote is the only write that touches `episodes`/`episode_embeddings`, and only for `approved` candidates.

### DB/Data
- Append-only candidate + receipt contract (Option A table or receipt). `episode_embeddings` writes are append-only `ON CONFLICT DO NOTHING`, only after an `episodes` row exists. No in-place overwrite. `episodes`/`episode_embeddings` schema unchanged except an explicit, separately-approved C4 migration for the gap fields.

### AI behavior
- Never force a rhyme. Promotion requires evidence + calibration + no-lookahead + human approval. Unapproved observations can never become historical episodes. No agent/service-role approval.

### Evals/tests
- Approval-gate test (only `approved` → episode); non-event coverage test (`<2.0` blocks or requires audited override); no-lookahead test (banned field or post-start source blocks); append-only receipt test (no overwrite); status-machine test (rejected can't promote; superseded points to replacement).

### Regression guard
- `history_rhymes_service._search_analogs` unchanged: still `episode_embeddings JOIN episodes WHERE embedding_type='full_state'`; the Databricks population path for `episode_embeddings` is untouched; existing analog retrieval behavior and `degraded_reason` paths are identical.

---

## Explicitly out of scope for C3
schema migration · promotion table · promotion API · promotion UI · episode
creation code · `episode_embeddings` write path · live backfill · OpenAI/Anthropic
calls · new connectors · infra changes · Feature Foundry changes. If answering the
design required implementation, that is recorded above as a documented gap, not built.

---

## C4 — promotion-candidate storage + receipt (IMPLEMENTED, 2026-06-18)

C4 builds the airlock storage layer recommended above (Option A), storage only —
**no episode creation, no `episode_embeddings` write, no UI, no auto-promotion, no
LLM**:

- **Migration** `repo-b/db/schema/10025_history_rhymes_episode_promotion_candidates.sql`
  — additive `hr_episode_promotion_candidates`; CHECK constraints on
  `approval_status` / `candidate_type` / `candidate_label` / `source_quality` /
  `readiness_score`; the indexes from the design; `COMMENT ON TABLE`/`COLUMN` on the
  gate fields; a verification DO block. `episodes` / `episode_embeddings` untouched.
- **`backend/app/services/hr_feature_store/promotion_candidates.py`** — repository
  protocol + fail-soft `DbCandidateRepository` (writes only this table) + the
  service ops (`create/get/list/attach_evidence/mark_needs_review/approve/reject/
  supersede/record_promoted_episode_link`), the status machine
  (`ALLOWED_TRANSITIONS`), the evidence gate (`evidence_blockers`), and the
  non-event guard (`non_event_coverage`, ratio ≥ 2.0 or audited override).
- **`backend/app/services/hr_feature_store/promotion_receipts.py`** — deterministic
  `stable_hash` (canonical JSON SHA-256), `build_receipt` (evidence fingerprints),
  and `append_receipt` (never overwrites — prior receipt → `receipt_history`,
  `version` bump).
- `record_promoted_episode_link` only *links* an `episode_id` created by a later
  ticket and seals the receipt; it never creates an episode or embedding.

Status machine: `draft → needs_evidence → needs_review → approved → promoted`
(terminal), with `needs_review → rejected`, `approved → superseded`. Approval
requires every evidence gate to pass AND a human `approval_actor`; `approved →
promoted` requires a `created_episode_id`. The promotion API / admin surface is
deferred to **C5** (design first; still no automatic episode creation or
`episode_embeddings` write).
