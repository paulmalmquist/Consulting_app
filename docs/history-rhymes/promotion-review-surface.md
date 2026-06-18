# Promotion review surface (C5 — design only)

**Status:** design. No code, no API routes, no UI, no schema, no episode creation,
no `episode_embeddings` write, no LLM, no backfill. This specifies how an internal
human reviewer *operates* the C4 airlock (`hr_episode_promotion_candidates`).
Implementation is C6+.

## The core rule

> The review surface **operates** the airlock. It does not create episodes
> automatically and it does not write episode embeddings. Every state change goes
> through the existing C4 service functions, which already enforce the status
> machine, evidence gate, non-event coverage, and immutable receipts. The surface
> is a thin, audited, protected operator over C4 — it adds no new authority.

The surface can never do anything C4's service layer forbids. If C4 raises
`PromotionCandidateError`, the API returns that error's exact reasons; the UI
renders them verbatim. No generic "validation failed".

---

## Verified ground truth (read before trusting any contract below)

C4 service (`backend/app/services/hr_feature_store/promotion_candidates.py`) —
the surface maps 1:1 onto these, adding nothing:

| Service function | Surface action |
|---|---|
| `list_candidates(repo, status=, candidate_type=)` | queue |
| `get_candidate(repo, candidate_id)` | detail packet |
| `attach_evidence(repo, candidate_id, evidence)` | evidence edit (reviewer) |
| `mark_needs_review(repo, candidate_id)` | "Send to review" |
| `approve_candidate(repo, id, approval_actor=, approval_timestamp=, coverage_override_reason=)` | Approve |
| `reject_candidate(repo, id, rejection_reason=)` | Reject |
| `supersede_candidate(repo, id, superseded_by_candidate_id=)` | Supersede |
| `record_promoted_episode_link(repo, id, created_episode_id=, promoted_at=)` | Link promoted episode |

Helpers the panels read: `evidence_blockers(candidate) -> list[str]`,
`non_event_coverage(candidate) -> {condition_cluster, crisis_anchor_count, non_event_count, non_event_to_event_ratio, coverage_status, override_required, override_reason}`.

Status machine (`ALLOWED_TRANSITIONS`): `draft → {needs_evidence, needs_review}`,
`needs_evidence → {needs_review, rejected}`, `needs_review → {approved, rejected, needs_evidence}`,
`approved → {promoted, superseded}`; `rejected` / `superseded` / `promoted` terminal.
`approved → promoted` requires `created_episode_id`.

Exact C4 blocked reasons (the only strings the surface may display):
`missing_calibration_evidence`, `missing_no_lookahead_audit`, `no_lookahead_failed`,
`missing_non_event_context`, `missing_features_snapshot`, `missing_lineage`,
`missing_narrative_summary`, `missing_approval_actor`,
`insufficient_non_event_coverage`, `invalid_status_transition:<from>-><to>`,
`candidate_not_found`, `duplicate_candidate_id`, `missing_created_episode_id`.

Auth precedent (`backend/app/routes/admin_prompt_receipts.py`): protected routes use
`require_authenticated_request(request)` + the `x-bm-platform-admin: true` header
(forwarded by the Next.js proxy for platform admins / env managers); the actor is
read from `x-bm-actor`. Namespace: `/api/hr/v1/...` is the only HR-compliant prefix
(`hr_feature_store.py` already mounts `/api/hr/v1/features`). Frontend: `HrSubNav`
TABS list under `repo-b/src/app/lab/env/[envId]/historyrhymes/<slug>`; HR client libs
in `repo-b/src/lib/historyrhymes/`.

**Regression guard:** the analog retrieval (`history_rhymes_service._search_analogs`:
`episode_embeddings JOIN episodes WHERE embedding_type='full_state'`) and the Feature
Foundry surfaces are read-only with respect to promotion and stay unchanged.

---

## Surface areas

Each: purpose · data needed · empty state · blocked state · actions allowed ·
actions forbidden · audit evidence shown.

### 1. Candidate queue
- **Purpose:** triage; find candidates needing review.
- **Data:** `list_candidates`, projected to the queue columns (below); `evidence_blockers` + `non_event_coverage` computed per row for the `has_blocked_reasons` / `coverage_status` chips.
- **Empty state:** "No promotion candidates" (no candidates exist yet — discovery is a future ticket, not this surface).
- **Blocked state:** n/a (read-only list); rows with blockers show a red "needs evidence" chip, not an error.
- **Actions allowed:** filter, sort, open a candidate.
- **Actions forbidden:** any mutation from the list (no bulk approve).
- **Audit shown:** `approval_status`, `updated_at`, status-age.

Columns: `candidate_id`, `approval_status`, `candidate_type`, `candidate_label`,
`condition_cluster`, `observation_id`, `as_of_date`, `source_quality`,
`readiness_score`, `non_event_to_event_ratio`, `coverage_status`, `created_at`,
`updated_at`.
Filters: `approval_status`, `candidate_type`, `candidate_label`,
`condition_cluster`, `source_quality`, `coverage_status`, `as_of_date` range,
`has_blocked_reasons` (derived from `evidence_blockers`).
Sorting: newest first (default), oldest first, readiness score, coverage ratio,
status age (time since `updated_at`).

### 2. Candidate detail / review packet
- **Purpose:** everything a reviewer needs to judge one candidate.
- **Data:** `get_candidate` (full row) + derived `evidence_blockers` + `non_event_coverage` + `allowed_actions` (from the status machine).
- **Empty state:** "Candidate not found" (`candidate_not_found`).
- **Blocked state:** banner listing the exact `evidence_blockers`; the action bar disables what the gate forbids.
- **Actions allowed:** whatever `ALLOWED_TRANSITIONS[current]` permits AND the gate passes.
- **Actions forbidden:** create episode, write embedding, edit a sealed receipt, fabricate a missing field.
- **Audit shown:** approval actor/timestamp, receipt history version.

Packet shape (read-only projection of the C4 row — never auto-fills missing
episode narrative fields with placeholders): candidate identity (`candidate_id`,
`approval_status`, `candidate_type`, `candidate_label`, `condition_cluster`),
observation identity (`observation_id`, `observation_embedding_id`, `as_of_date`),
`model_obs_version`, `embedding_model_version`, proposed episode fields
(`proposed_episode_name/asset_class/category/start_date/peak_date/trough_date/end_date/tags`),
`narrative_summary`, `features_snapshot`, `top_feature_drivers`, `lineage_json`,
`external_links_json`, `calibration_evidence_json`, `no_lookahead_audit_json`,
`non_event_context_json`, `readiness_score` + `readiness_degrade_reasons`,
`reviewer_notes`, `approval_actor`/`approval_timestamp`, `promotion_receipt_json`
(incl. `receipt_history`), `created_episode_id` (if present).

> **Missing required episode fields** (the `episodes` NOT NULL set —
> `macro_conditions_entering`, `catalyst_trigger`, `timeline_narrative`, plus
> `name`/`asset_class`) render the packet status `needs_evidence` with an explicit
> `missing_required_episode_fields` note. The reviewer supplies them; the surface
> never placeholders them.

### 3. Evidence gate panel
- **Purpose:** show, per gate, pass / missing / failed with the exact reason.
- **Data:** `evidence_blockers` + the underlying jsonb fields.
- **Gates + copy:**
  - calibration evidence — pass / `missing_calibration_evidence`
  - no-lookahead audit — pass / `missing_no_lookahead_audit` / `no_lookahead_failed`
  - non-event coverage — pass / `insufficient_non_event_coverage`
  - lineage — pass / `missing_lineage`
  - features snapshot — pass / `missing_features_snapshot`
  - narrative summary — pass / `missing_narrative_summary`
  - approval actor — pass / `missing_approval_actor`
- **Empty state:** all-grey "evidence not attached yet" → status `needs_evidence`.
- **Blocked state:** each failed gate shows its exact C4 reason string. **No generic "failed validation" banner.**
- **Actions allowed:** "Send to review" only when no blockers remain.
- **Actions forbidden:** approve while any gate fails; silently override a missing gate.
- **Audit shown:** which gate cleared and when (from receipt hashes).

### 4. Non-event coverage panel
- **Purpose:** keep the library from going crash-only.
- **Data:** `non_event_coverage(candidate)`.
- **Shows:** `condition_cluster`, `crisis_anchor_count`, `non_event_count`, `non_event_to_event_ratio`, `coverage_status`, `override_required`, `override_reason`.
- **Rule:** target `non_event_to_event_ratio >= 2.0`.
- **Empty state:** "non-event context not attached" → `needs_evidence`.
- **Blocked state:** ratio `< 2.0` → `coverage_status: below_target`, `override_required: true`; approval is blocked (`insufficient_non_event_coverage`) until an override reason is given.
- **Override copy:** *"This promotion weakens non-event coverage for this condition cluster. Provide an override reason before approval."* The reason is required text, is passed as `coverage_override_reason`, and is written into `non_event_context_json.override_reason` → surfaced in the receipt.
- **Actions forbidden:** approve below target without a reason; hide the ratio.
- **Audit shown:** the override reason + actor on the receipt.

### 5. No-lookahead audit panel
- **Purpose:** prove the observation was knowable at the proposed episode start.
- **Data:** `no_lookahead_audit_json` = `{passed, violations[], knowable_as_of}`.
- **Empty state:** "no-lookahead audit not attached" → `missing_no_lookahead_audit`.
- **Blocked state:** `passed:false` → list `violations[]` (e.g. `feature:forward_return_30d`); approval impossible. **A leakage block is not human-overridable** (unlike non-event coverage).
- **Actions forbidden:** approve over a failed audit; edit the audit to flip `passed`.
- **Audit shown:** `knowable_as_of` vs `proposed_start_date`; the violations list.

### 6. Approval action bar
- **Purpose:** the human gate.
- **Data:** `allowed_actions` (derived from `ALLOWED_TRANSITIONS[current]`), the gate state.
- **Actions allowed (each maps to a C4 call):** Send to review (`mark_needs_review`), Approve (`approve_candidate`, requires actor + notes + override reason when applicable), Reject (`reject_candidate`, requires reason), Supersede (`supersede_candidate`, requires replacement `candidate_id`), Link promoted episode (`record_promoted_episode_link`, requires `created_episode_id`).
- **Blocked state:** disabled buttons carry a tooltip with the exact blocking reason; attempting a disallowed transition returns `invalid_status_transition:<from>-><to>`.
- **Actions forbidden:** create episode, write embedding, run backfill, call an LLM to summarize/label, override missing evidence silently.
- **Confirmation required:** Approve, Reject, Supersede, Link promoted episode (all state-changing + hard to reverse).
- **Audit shown:** actor + timestamp captured on every action.

### 7. Receipt history panel
- **Purpose:** the immutable trail.
- **Data:** `promotion_receipt_json` = `{...current, version, receipt_history[]}`.
- **Empty state:** "no receipts yet" (pre-approval).
- **Blocked state:** n/a (read-only).
- **Actions forbidden:** edit/delete a receipt; the surface is display-only over append-only data.
- **Audit shown:** each receipt's evidence hashes (`calibration_evidence_hash`, `no_lookahead_audit_hash`, `non_event_context_hash`, `lineage_hash`, `features_snapshot_hash`), `version`, actor, timestamp, `approval_status` at issue time.

### 8. Promoted episode link panel
- **Purpose:** record (not create) the episode an external ticket made.
- **Data:** `created_episode_id`, the sealing receipt.
- **Empty state:** "not promoted" (for non-`promoted` candidates).
- **Blocked state:** Link disabled unless status is `approved`; missing id → `missing_created_episode_id`.
- **Actions allowed:** paste an externally-created `episode_id` → `record_promoted_episode_link`.
- **Actions forbidden:** **create** the episode; **create/write** its embedding. This panel only *links* and seals.
- **Audit shown:** `created_episode_id`, promoted-at, final receipt version.

---

## API design (contracts only — do NOT implement)

Namespace verified compliant: `/api/hr/v1/...`. Recommended family
(matches existing HR prefixes; final names confirmed at C6):

```
GET   /api/hr/v1/promotion-candidates                                  # queue (filters/sort as query params)
GET   /api/hr/v1/promotion-candidates/{candidate_id}                   # detail packet
POST  /api/hr/v1/promotion-candidates/{candidate_id}/needs-review      # mark_needs_review
POST  /api/hr/v1/promotion-candidates/{candidate_id}/approve           # approve_candidate
POST  /api/hr/v1/promotion-candidates/{candidate_id}/reject            # reject_candidate
POST  /api/hr/v1/promotion-candidates/{candidate_id}/supersede         # supersede_candidate
POST  /api/hr/v1/promotion-candidates/{candidate_id}/link-promoted-episode  # record_promoted_episode_link
```

Per-route contract:

| Route | Request | Response (200) | Auth | Side effects |
|---|---|---|---|---|
| `GET /promotion-candidates` | query: `approval_status, candidate_type, candidate_label, condition_cluster, source_quality, coverage_status, as_of_from, as_of_to, has_blocked_reasons, sort` | `{candidates: [queue-row...], count}` | admin + auth | none (read) |
| `GET /…/{id}` | — | detail packet + `evidence_blockers`, `coverage`, `allowed_actions` | admin + auth | none |
| `POST /…/needs-review` | `{}` | updated packet | admin + auth | `mark_needs_review` |
| `POST /…/approve` | `{notes?, coverage_override_reason?}` | updated packet + new receipt | admin + auth (actor from `x-bm-actor`) | `approve_candidate`; appends receipt |
| `POST /…/reject` | `{rejection_reason}` | updated packet | admin + auth | `reject_candidate` |
| `POST /…/supersede` | `{superseded_by_candidate_id}` | updated packet | admin + auth | `supersede_candidate` |
| `POST /…/link-promoted-episode` | `{created_episode_id}` | updated packet + sealing receipt | admin + auth | `record_promoted_episode_link` (links only — no episode/embedding write) |

`approval_actor` and `approval_timestamp` come from the request context
(`x-bm-actor` + server clock), never the client body. No route creates an
`episodes` row or writes `episode_embeddings`.

Blocked response (HTTP 409, the C4 error surfaced verbatim):

```json
{
  "status": "blocked",
  "blocked_reasons": [],
  "candidate_id": "...",
  "current_status": "...",
  "allowed_actions": []
}
```

---

## Frontend design (boundaries only — do NOT implement)

Route: `repo-b/src/app/lab/env/[envId]/historyrhymes/promotions/page.tsx`, added
to `HrSubNav` TABS as `{ slug: "promotions", label: "Promotions" }`. Standalone
full-bleed dark console (no shared app shell), plain `useState`/`useEffect`, reuse
HR UI primitives; new client lib `repo-b/src/lib/historyrhymes/promotions.ts`
(reuse `getJson`/`sendJson`; hit `/api/hr/v1/promotion-candidates*`; leave
`featureStore.ts`/`mlDemo.ts` frozen).

Components (props · loading/empty/error):
- `PromotionCandidateQueue` — props: filters, sort, `onOpen(candidate_id)`; loading skeleton rows; empty "No promotion candidates"; error "Could not load candidates".
- `PromotionCandidateDetail` — props: `candidate`, `allowedActions`; empty `candidate_not_found`; error inline.
- `EvidenceGatePanel` — props: `blockers[]`; renders each gate's exact reason; empty = all-grey "not attached".
- `NonEventCoveragePanel` — props: `coverage`; shows ratio + override copy when `override_required`.
- `NoLookaheadAuditPanel` — props: `audit`; lists `violations[]`; non-overridable block.
- `PromotionActionBar` — props: `allowedActions`, handlers; disabled buttons carry the blocking reason; confirm dialogs for approve/reject/supersede/link.
- `ReceiptHistoryPanel` — props: `promotion_receipt_json`; read-only version list with hashes.
- `PromotedEpisodeLinkPanel` — props: `created_episode_id`, `status`; link input enabled only when `approved`.

---

## Security / auth

- **View:** authenticated + `x-bm-platform-admin: true` (platform admin / env manager). Not a public route.
- **Approve / Reject / Supersede / Link promoted episode:** same admin gate; `approval_actor` captured from `x-bm-actor`.
- **Confirmation required:** all four state-changing actions (approve, reject, supersede, link) — they are consequential and hard to reverse.
- **Audit logged:** every state-changing call (below).
- The Next.js proxy forwards the admin header exactly as it does for
  `admin_prompt_receipts.py`; the surface mounts behind the same gate.

---

## Audit requirements

Every state-changing action records: `actor`, `timestamp`, `old_status`,
`new_status`, `candidate_id`, `blocked_reasons` (if blocked), `request_payload_hash`,
`receipt_hash` (if a receipt was generated).

For C5/C6, the **immutable promotion receipt** (`promotion_receipt_json` +
`receipt_history`) already carries actor/timestamp/status/evidence hashes and is
the primary audit. Integrating with the platform `ai_decision_audit_log` is
attractive but blocked: its `decision_type` CHECK only allows
`tool_call|response|classification|fast_path` — a `promotion` type needs a
migration to extend the CHECK. **Propose that as a later audit-integration ticket
(C7);** do not bolt promotion onto the audit log in C5/C6.

---

## Acceptance Criteria (for future C6+ implementation)

### API
- Protected internal endpoints list/get/update promotion candidates.
- Blocked responses return the **exact** C4 blocked reasons (no generic banner).
- No route creates episodes or writes `episode_embeddings`.

### UI
- Reviewer can list/filter/sort and open candidates.
- Reviewer sees the evidence gate, non-event coverage, no-lookahead audit, and receipt history.
- Reviewer can approve/reject/supersede/link a promoted episode **only** through allowed transitions; disabled actions show the blocking reason.

### Data
- C4 status machine preserved (surface adds no authority).
- Immutable receipts remain append-only (history + version).
- `created_episode_id` can only be linked after `approved`.

### Security
- Admin/protected access required; actor captured for state-changing actions; risky actions require confirmation.

### Regression guards
- `_search_analogs` (`episode_embeddings JOIN episodes WHERE embedding_type='full_state'`) unchanged.
- Feature Foundry remains read-only with respect to promotion.
- No automatic episode creation; no automatic embedding writes; no LLM summaries/labels.

---

## Explicitly out of scope for C5
API routes · React components · schema migration · episode creation ·
`episode_embeddings` writes · embedding-provider calls · LLM summaries/labels ·
automatic candidate discovery · connector changes · infra changes · production
deploy. Anything requiring implementation to answer is recorded here as a gap, not built.

---

## C6 — protected API (IMPLEMENTED, 2026-06-18)

C6 implements the route layer above (API only — no UI, no schema, no episode
creation, no `episode_embeddings` write, no LLM):

- **`backend/app/routes/hr_promotion_candidates.py`** — prefix
  `/api/hr/v1/promotion-candidates`, admin-gated (`require_authenticated_request` +
  `x-bm-platform-admin: true`; actor from `x-bm-actor`). All 9 routes delegate to
  the C4 service; a `PromotionCandidateError` becomes **HTTP 409** with the exact
  envelope `{status, blocked_reasons[], candidate_id, current_status, allowed_actions[]}`.
  Success uses `{status:"ok", candidate_id, approval_status, candidate}`. The list
  route adds the C5 filters + `{items,count,limit,offset}`; GET returns the detail
  packet plus `allowed_actions`/`blocked_reasons`/`coverage`.
- **Two minimal C4 helpers** added (no schema change, rules preserved):
  `mark_needs_evidence` (the `draft|needs_review → needs_evidence` move) and the
  read-only `allowed_actions(candidate)`.
- **Registered** in `backend/app/main.py`.
- `link-promoted-episode` only links an externally-created `episode_id` via
  `record_promoted_episode_link`; it creates no episode and writes no embedding.

The frontend review UI (the components/route in §Frontend design) remains **C7**.
Audit stays in the receipt (the `ai_decision_audit_log` CHECK migration is still
deferred).

---

## C7 — review UI (IMPLEMENTED, 2026-06-18)

C7 implements the internal reviewer surface (UI only — no schema, no backend route
changes, no episode creation, no `episode_embeddings` write, no LLM):

- **Route** `repo-b/src/app/lab/env/[envId]/historyrhymes/promotions/page.tsx`
  (thin server wrapper forwarding `envId`) + a `Promotions` tab in `HrSubNav`
  (longest-prefix active logic). Behind the existing app/lab auth boundary.
- **Client** `repo-b/src/lib/historyrhymes/promotions.ts` — typed, calls ONLY
  `/api/hr/v1/promotion-candidates*` (C6); a 409 is parsed into a discriminated
  `{kind:"blocked"}` result that preserves the EXACT `blocked_reasons` (never a
  generic banner); reads degrade to stable empty envelopes.
- **Components** under `repo-b/src/components/historyrhymes/promotions/`:
  `PromotionReviewClient` (orchestrator), `PromotionCandidateQueue` (columns,
  status/leakage/blocked badges, empty-state copy), `PromotionCandidateDetail`
  (review packet + missing-episode-field warning + raw-evidence drawers),
  `EvidenceGatePanel` (exact reason strings), `NonEventCoveragePanel`
  (ratio + audited-override warning), `NoLookaheadAuditPanel` (failed = shown as
  non-overridable), `PromotionActionBar` (buttons gated on `allowed_actions`;
  approve also disabled when no-lookahead failed), `ReceiptHistoryPanel`
  (version + hashes + prior receipts), `PromotedEpisodeLinkPanel` (links an
  externally-created episode id; "does not create an episode or write embeddings").

The actions map 1:1 to the C6 routes; the UI enables an action only when its target
status is in `allowed_actions` (derived by C6 from the C4 machine). Episode creation
and embedding writes remain outside this surface entirely.

---

## C8-A — platform audit integration (IMPLEMENTED, 2026-06-18)

The audit-deferral noted in §"Audit requirements" / C5 is now resolved. Promotion
actions are logged at the platform layer in addition to the C4 immutable receipt:

- **Migration** `repo-b/db/schema/10022_history_rhymes_promotion_audit_type.sql` —
  a controlled widening of the (inline, auto-named) `ai_decision_audit_log`
  `decision_type` CHECK: it drops the existing constraint by discovered name and
  re-adds it with EVERY legacy value (`tool_call`, `response`, `classification`,
  `fast_path`) PLUS one new value `history_rhymes_promotion_candidate_action`. No
  data dropped, table not recreated, no wildcard; `episodes`/`episode_embeddings`
  untouched. A verification DO block asserts legacy values survive + the new one is
  present.
- **`backend/app/services/hr_feature_store/promotion_audit.py`** — pure
  `build_audit_payload` (safe metadata + stable hashes: `request_payload_hash`,
  `candidate_receipt_hash`) and `record_promotion_audit` writing via
  `governance.record_decision` (best-effort). Single-tenant `hr_` has no
  business_id → a documented sentinel UUID satisfies the NOT NULL column.
- **C6 routes** now audit every state-changing action — successful AND blocked —
  capturing actor/old→new status/action/route/hashes. The 409 blocked envelope is
  unchanged except an additive `audit_status`; success responses also carry
  `audit_status`. An audit-write failure surfaces `audit_status="failed"` and never
  hides or reverses the C4/C6 result.

The audit layer adds NO authority: it records what C4 already did/refused, and
creates no episode and writes no embedding.
