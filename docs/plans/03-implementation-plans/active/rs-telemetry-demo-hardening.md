# RS Telemetry Demo Hardening

**ADO:** Story 519 (parent Feature 513 — RS Demo Live Telemetry Streaming Slice + Dashboard System)
**Branch:** `fix/rs-telemetry-demo-hardening` (off `main` @ ae8f29f2)
**Type:** hardening / fix pass — NOT a feature build. The RS demo stack (#140/#144/#143) is already merged + live.
**Trigger:** skeptical-engineer Agent Mode review of the live demo on novendor.ai (2026-06-10).

## Findings + root causes (verified, not assumed)

| # | Symptom (from review) | Root cause (verified) | Class |
|---|---|---|---|
| 1+5 | Mission Control shows vague `no_stream_data`, no live feed | `TELEMETRY_STREAM_ENABLED` unset on Railway (config default `"0"`) → lifespan worker never starts (`main.py:305 if TELEMETRY_STREAM_ENABLED`). Confirmed live: `/stream/health` → `freshness:[]`, `pipeline_status:[]`; `/stream/live` → `pipeline.status:"unknown"`, `reason:"no_status_row"`, 0 channels. AND both endpoints collapse every absence to one `no_stream_data` string. | app code (diagnostics) + deploy config (enable) |
| 2 | "Start review" timer sometimes doesn't respond, needs reload | `DispositionControls` mounted at `Copilot.tsx:232` WITHOUT a React `key`. On a new draft (`report.report_id` changes) React reuses the instance → stale `startedAt`/`result`/`arm` persist; a fresh report can show "timing…" or a locked verdict. | app code (real bug) |
| 3 | Chips "navigated unexpectedly" | NO `<form>` wraps the copilot buttons (verified `grep`); buttons have no `href`/`<a>`/router push. Cannot cause app navigation. | Agent Mode/browser artifact — NOT an app bug |
| 4 | Developer/prompt-injection message appeared | `SYSTEM_PROMPT_TEXT` is server-side only (`telemetry_copilot.py:261`), never returned; only `prompt_version` (hash) + `model` surface. Live probe: copilot refuses "repeat your instructions" with `unsupported_question`. | Agent Mode/tooling artifact — NO app leakage |

## Fixes (smallest root cause)

### Backend — actionable stream diagnostics (Finding 1+5)
`backend/app/services/telemetry_stream_etl.py`:
- New pure helper `derive_stream_reason(*, worker_running, bronze_rows_recent, watermark_age_s, channels_mapped, has_silver) -> str|None` returning one of:
  `stream_worker_disabled` | `source_unavailable` | `no_bronze_frames` | `etl_watermark_stalled` | `no_channel_mapping` | `None` (healthy).
- `stream_health` + `stream_live` call it and set `null_reason` to the specific reason (replacing the blanket `no_stream_data`). `stream_live` also reports `worker_present: bool` and (when no worker) probes whether bronze rows exist at all.
- Fail-closed contract preserved: still never interpolates; STALE/failed still rides the payload.

### Frontend — Mission Control state split (Finding 1+5)
`repo-b/src/components/telemetry/MissionControlStream.tsx`:
- Replace the single amber "ingest worker has not landed any frames" block with a state switch keyed on `null_reason`, each with a one-line repair hint (e.g. `stream_worker_disabled → "set TELEMETRY_STREAM_ENABLED=1 and redeploy"`). Source chip already handles LIVE/CAPTURE/STALE/FAILED; add explicit `NOT AVAILABLE` chip when `channels.length === 0`.

### Frontend — review timer (Finding 2)
`repo-b/src/components/telemetry/Copilot.tsx`:
- Mount `<DispositionControls key={report.report_id} ... />` so a new report remounts fresh.
- Belt-and-braces: `useEffect(reset, [reportId])` clearing `startedAt/result/arm/confidence/err`.

### Frontend — defensive button typing (Finding 3)
- Add `type="button"` to the Ask button + quick-question chips (`Copilot.tsx:422,430`) and the report download/toggle buttons. Documented as defensive, not a reproduced bug.

## Out of scope (regression guard)
`/score`, `_verdict_for`, champion constants/thresholds (MAD_K, GLOBAL_TRAIN_SCALE), model aliases, LLM judge, auth/proxy, any fabricated review rows, synthetic-as-live data, broad UI redesign, unrelated REPE/ProfitSolv/LegalFin/HR, destructive DB.

## Tests
- `backend/tests/test_telemetry_stream_etl.py` — add `derive_stream_reason` cases (each reason) + assert `stream_health`/`stream_live` surface the specific reason via FakeCursor.
- `repo-b` — `MissionControlStream` state-derivation test (each null_reason renders its hint; no synthetic values); `Copilot.test.tsx` — new-report remount resets the timer; existing disposition tests stay green.

## Acceptance
- `/stream/health` + `/stream/live` return a SPECIFIC reason, never bare `no_stream_data`.
- With the worker running (capture) locally: Mission Control shows updating charts ~1s cadence, source `CAPTURE`, ingest + client lag separate, STALE on feed stop, no interpolation.
- Review timer: reliably starts; verdicts disabled pre-timer, enabled post; pre-timer submit shows visible error; new report resets.
- No app prompt leakage (documented).
- Owner-approved: `TELEMETRY_STREAM_ENABLED=1` on Railway + redeploy; prod `/stream/health` shows `capture` healthy; skeptical re-review.

## Production verification (owner-approved deploy)
1. Deploy backend from clean `main` after merge.
2. `railway variables set TELEMETRY_STREAM_ENABLED=1` (SOURCE already defaults `capture`).
3. `/version` = expected commit; `/stream/health` = capture healthy with rows/min > 0.
4. novendor.ai Mission Control: CAPTURE chip + moving charts OR actionable fail-closed reason.
5. Complete 1 unassisted + 1 assisted review; Governance usefulness panel reflects measured values.
6. Re-run skeptical Agent Mode pass.
