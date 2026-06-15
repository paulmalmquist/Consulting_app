# History Rhymes Telemetry-Cockpit Refactor

**Status:** Active — PR 1 in flight
**Created:** 2026-06-12
**ADO:** Epic #213 → Features #538 (Cockpit UI), #539 (Streaming Spine), #540 (Backstage + Reference) → Stories #541–#556 (one per PR)
**Board:** https://dev.azure.com/paulmalmquist1984/Novendor

## Goal

Change the front door of History Rhymes. The backend (pgvector analog matching, trap/structural alerts, decision runner, research→planning bridge, morning book) stays; the default surface at `/lab/env/[envId]/historyrhymes` becomes a telemetry-style regime cockpit modeled on the telemetry environment: regime → signal pulse → analog timeline → trap alerts → evidence drawer. Research and planning move backstage. A streaming spine (Confluent-first, Google Kafka behind a provider abstraction) makes signals feel like live sensor channels, with synthetic/replay/live modes.

## Honesty rules (rendering requirements, not aspirations)

- Never force a rhyme. An empty analog list renders the backend `degraded_reason` verbatim plus the line "The system refuses to force a rhyme."
- Fail closed. Every zone has an explicit degraded/empty state with a concrete reason string. No blank cards, no spinner-only pages.
- Never fabricate. No zero-filling nulls, no invented probabilities, no fake analogs/signals/calibration.
- No silent fallback. Stream mode and source are always labeled; stream loss shows an explicit note.
- v1 placeholder scenarios (0.25/0.50/0.25, "Awaiting multi-agent forecaster (Stage 5).") render as a pending state, never as real probabilities.
- Markdown briefs are archive/evidence, reachable through the evidence drawer and `/research` — never the default content.
- Cockpit copy avoids retail-trading language: "implication", "watch item", "research item", "directional bias", "scenario pressure" — not buy/sell/trade/position-size.

## PR sequence

| PR | Story | Scope | Status | Gate |
|---|---|---|---|---|
| 1 | #541 | Plan + ADO intake + credential safety (docs only) | Done — PR #156 | docs-only diff |
| 2 | #542 | Cockpit shell: primitives, shell/nav, regime header, implications, routes, allowlist token | Done — PR #157 | vitest + typecheck + lint + both playwright specs + 4-route visual check |
| 3 | #543 | Signal telemetry strip (8 sensor tiles, missing-safe) | Done — PR #158 | signals.test.ts edge cases |
| 4 | #544 | Streaming architecture plan + topic contract (docs only) | Done — docs/plans/history-rhymes/streaming-architecture.md | docs-only diff |
| 5 | #545 | Synthetic stream adapter, broker-less via ring buffer | Pending | backend pytest deterministic |
| 6 | #546 | Stream health API + chip + admin diagnostics | Pending | never-500, no-secrets asserted |
| 7 | #547 | Analog timeline + match via existing proxy | Pending | degraded reasons verbatim in tests |
| 8 | #548 | Alert/trap rail + acknowledge flow | Pending | null-vs-empty distinction tested |
| 9 | #549 | Scenario pressure panel (placeholder-honest) | Pending | placeholder detector tested |
| 10 | #550 | Evidence drawer | Pending | nullReason propagation tested |
| 11 | #551 | Kafka consumer scaffold (Confluent/Google config matrix) | Pending | fail-closed + no secret leakage |
| 12 | #552 | Persist events/offsets — additive migration 10016 | Pending | idempotency + naming check pre-merge |
| 13 | #553 | Live cockpit updates (replay/runner/polling) | Pending | no silent mixing tested |
| 14 | #554 | Research/planning demotion split | Pending | contract test unmodified; spec updated same PR |
| 15 | #555 | Episodes explorer + calibration status | Pending | calibration fabricates nothing |
| 16 | #556 | Polish, copy audits, degraded-backend e2e gate | Pending | full suite |

Hierarchy to keep repeating: **cockpit first, synthetic/replay second, live Kafka third.**

## Verified backend contracts — DO NOT RESHAPE

### POST /api/v1/rhymes/match (`backend/app/routes/rhymes.py:61-94`)

Request: `{as_of_date?, scope="global", k=5 (1-20)}`. Response envelope:

```
as_of_date, scope, request_id, latency_ms,
top_analogs[{rank, episode_id, episode_name, rhyme_score, cosine, dtw (null v1),
             categorical, era_discount, hoyt_amplification, episode_start_year,
             is_non_event, tags[]}],
scenarios{bull|base|bear: {probability, narrative}}        # v1 placeholders
trap_detector{trap_flag (false v1), trap_reason, honeypot_match,
              crowding_score, consensus_divergence}        # all null v1
structural_alerts[{id, alert_type, severity, hoyt_position, trigger_signals,
                   narrative, alert_date}],
confidence_meta{agent_agreement (null v1), permutation_p_value (null v1),
                sample_size, data_freshness_hours, freshness_weight, degraded_reason}
```

Degraded matrix — all HTTP 200 with `top_analogs: []`; these strings appear **verbatim** in UI and tests:

| degraded_reason | Condition |
|---|---|
| `episode_embeddings_missing` | migration 503 not applied |
| `empty_episode_embeddings` | embeddings table empty / pgvector returns 0 rows |
| `no_state_vector` | no wss_signal_state_vector row at/before as_of_date |
| `schema_not_applied` | UndefinedTable caught |

### Companions

- `GET /api/v1/rhymes/episodes` — filters `asset_class`, `is_non_event`, `has_hoyt_peak_tag`, `limit (1-500)`.
- `GET /api/v1/rhymes/alerts` — `unacknowledged` default true; `POST /api/v1/rhymes/alerts/{id}/acknowledge` (404 if missing/acked).
- `GET /api/hr/v1/state` — `{latest_brief/snapshot/decision ids+timestamps, latest_regime, latest_confidence, worst_input_age_hours (9999 sentinel), freshness_verdict: fresh|stale_snapshot|stale_brief|no_brief|no_snapshot}`.
- `GET /api/hr/v1/decisions/latest` (≤5 positions, risk envelope, alerts; 404 when none), `GET /api/hr/v1/briefs/latest` (`parsed_json.latest_signals` + `per_signal_freshness` feed the signal strip), research/planning routes, morning-book (never 5xx).
- Calibration data exists (`hr_agent_calibration.rolling_90d_brier`, weights; `hr_predictions.brier_score`) but **no route exposes it**. The calibration page says exactly that.

Transport: HR client uses `NEXT_PUBLIC_API_BASE` for `/api/hr/v1/*`; rhymes calls go same-origin through the existing proxy `repo-b/src/app/api/v1/rhymes/[...path]/route.ts`. Never mix the two conventions in one client file.

## Cockpit zone map

| Zone | Component | Data |
|---|---|---|
| Z1 Regime status header | `cockpit/RegimeStatusHeader.tsx` | hr/state + decision + match.trap_detector |
| Z2 Signal telemetry strip | `cockpit/SignalTelemetryStrip.tsx` + `Tile` | brief.parsed_json.latest_signals (→ stream in PR 13) |
| Z3 Analog timeline | `cockpit/AnalogTimeline.tsx` | rhymes/match.top_analogs |
| Z4 Alert/trap rail | `cockpit/AlertTrapRail.tsx` | rhymes/alerts + decision.alerts + trap_detector |
| Z5 Scenario pressure | `cockpit/ScenarioPressurePanel.tsx` | match.scenarios + confidence_meta |
| Z6 Evidence drawer | `cockpit/EvidenceDrawer.tsx` + `lib/historyrhymes/evidence.ts` | all of the above |
| Z7 Implications | `cockpit/ImplicationCard.tsx` | decision.positions (reframed copy) |

Routes: `/historyrhymes` (cockpit), `/routine` (alias, same component, legacy testid), `/morning-book` (unchanged), `/research` (PR 14), `/planning` (candidates only after PR 14), `/episodes` + `/calibration` (PR 15), `/admin` (PR 6). One shared-code change in the whole project: add `historyrhymes` to the full-bleed allowlist regex at `repo-b/src/components/lab/LabEnvironmentShell.tsx:167`.

Design: HR-local primitives (`cockpit/primitives.tsx`) copy-adapted from `repo-b/src/components/telemetry/primitives.tsx` — not imported, environments stay standalone. Palette: bg `#07090c`, panel `#0f141c`, bronze accent `#d4a85a`, status colors shared with telemetry for lab-wide literacy. Honesty primitives `DegradedNote({reason, refusal?})` and `CockpitEmptyState({zone, reason, hint})` require a concrete reason string by type.

## Streaming section

- **Reuse `backend/app/events/`** (envelope, publisher, KafkaTransport, Noop fail-closed, BQ sink). New code: topic helper in `topics.py` (constants untouched), `backend/app/events/consumer.py`, `backend/app/services/hr_stream/` package.
- **Topics (additive; legacy `winston.hr.signals.v1` + BigQuery sink untouched):** `{prefix}.signal.{macro|market|crypto|credit|real_estate|sentiment|options}.v1`, `{prefix}.alerts.v1`, `{prefix}.snapshots.v1`; `prefix = HR_KAFKA_TOPIC_PREFIX` (default `hr.dev`). Partition key `signal_key`; `idempotency_key = sha(signal_key + observed_at + source)`.
- **Signal↔domain crosswalk:** mvrv_z→crypto, yc_10y2y→macro, vix_term→options, housing→real_estate, cmbs_delinq→credit, fed_tone→sentiment, crypto_flow→crypto, macro_surprise→macro.
- **Modes:** `HR_STREAM_MODE = off (default) | synthetic | replay | live_kafka`. Synthetic = deterministic backend generator over the real wire path, works broker-less via ring buffer. Replay = captured JSONL, original `observed_at` preserved. Live = consumer against Confluent (or the Google branch). The cockpit always displays the active mode; no silent fallback between modes.
- **Health:** `GET /api/hr/v1/stream/health` → `connected | delayed | replaying | disconnected | not_configured` + `degraded_reason`. Missing config is `not_configured` with HTTP 200, never 500. Payload allowlisted to non-secret fields.
- **Provider abstraction:** `HR_KAFKA_PROVIDER = confluent (default) | google`. "Google" means whatever GCP Kafka-compatible deployment is actually available — Google Cloud Managed Service for Apache Kafka, Confluent Cloud on GCP, or a GCP-hosted Kafka-compatible endpoint. Do not assume product semantics until env/config is inspected; the consumer config matrix must accommodate all three without forking the architecture. Confluent-first per the Phase 3B decision in `0004-event-streaming-bigquery-gke.md`.
- **Env vars:** `HR_KAFKA_BOOTSTRAP`, `HR_KAFKA_API_KEY/SECRET` (env only — code never reads the root credential JSON), `HR_KAFKA_SASL_MECHANISM`, `HR_KAFKA_SCHEMA_REGISTRY_URL`, `HR_KAFKA_CONSUMER_GROUP` (default `hr-cockpit-dev`), `HR_KAFKA_TOPIC_PREFIX`.

## Schema reservation

10014 is the highest schema file on disk; **10015 is reserved on paper** by `docs/plans/TELEMETRY_STREAMING_SLICE_PLAN.md` (tel_stream_*). HR streaming takes **10016**. Re-glob `repo-b/db/schema/100*.sql` immediately before merging PR 12, and check `hr_*` vs `history_rhymes_*` vs `wss_*` naming conventions before finalizing table names (draft: `hr_signal_events`, `hr_signal_latest`, `hr_stream_offsets`, `hr_stream_health`). hr_* tables are single-tenant analytics, exempt from env_id/RLS per ARCHITECTURE.md — the migration header states this, every table gets `COMMENT ON TABLE`, everything is `IF NOT EXISTS`.

## Risks

1. Routine regression — alias renders the identical cockpit with legacy testid; both URLs in playwright from PR 2.
2. Planning split — `client.ts` untouched in PR 14; playwright spec updated in the same PR (it pins upload testids on the planning URL today).
3. Schema race — see reservation above; IF NOT EXISTS makes a renumber filename-only.
4. Credential leak — `confluent)_kafka_api.json` and `aws_creds.json` verified never-committed and untracked during PR 1 intake (no rotation needed); both are now gitignored on main (Stargate commit d22b4931, which landed mid-session); creds env-only; health payload + consumer repr tested for non-leakage.
5. Honesty drift — centralized DegradedNote/CockpitEmptyState; degraded_reason enum covered verbatim in fixtures; placeholder-scenario detector; PR 16 degraded-backend e2e gate.
6. Allowlist side effect — morning-book/planning reskin into the HR shell in PR 2; content/testids untouched; planning spec in the PR 2 gate; 4-route visual verification required.
7. Background task safety — runner starts only when `HR_STREAM_MODE != off`; all transport/consumer resolution fails closed to noop.
8. Topic collision — none: new `hr.{env}.*` namespace is additive beside `winston.hr.signals.v1`.

## Test plan

- Frontend per PR: `npx vitest run src/components/historyrhymes/ src/lib/historyrhymes/`, `npm run typecheck`, `npm run lint`, `npx playwright test tests/historyrhymes-cockpit.spec.ts tests/historyrhymes-planning.spec.ts` (shell smokes unconditional; full loops `HR_E2E=1`).
- Backend per PR: `cd backend && python -m pytest tests/test_history_rhymes.py tests/test_hr_decision_runner.py tests/test_hr_morning_book_routes.py tests/test_hr_research_routes.py tests/test_hr_stream_*.py -q`.
- Streaming wire check (manual): `docker compose -f infra/local/docker-compose.streaming.yml up -d`, synthetic tick, Redpanda console on :8080.
- PR 16 honesty regression gate: backend down → every zone renders a fail-closed state, no blank zones.

## Out of scope

No renames/reshapes of `/api/hr/v1/*` or `/api/v1/rhymes/*`. No DB migration before PR 12 (additive only). No calibration backend route unless separately approved. No SSE/WebSocket (polling, like telemetry). No deletion of research/planning functionality. No changes to other lab environments beyond the one allowlist token. No live Confluent connection until synthetic/replay are proven.
