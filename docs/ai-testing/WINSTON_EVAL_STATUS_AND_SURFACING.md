# Winston Eval Status and Guarded Surfacing

Updated: 2026-04-30

## Current State

- The repo already has a production-minded eval spine: `eval_loop/`, durable Postgres tables, backend admin routes under `/api/admin/eval/*`, contract observation routes under `/api/admin/contract/*`, and nightly/weekly GitHub workflows.
- The canonical Winston eval target is the backend request lifecycle, reached in evals through `run_request_lifecycle`, not a browser-only test path.
- The user-facing canonical runtime remains repo-b Winston companion -> Next `/api/ai/gateway/*` -> FastAPI AI gateway/request lifecycle -> SSE response.
- The Claude/managed-agent runtime is a separate pilot path behind `/api/ai/operator/*`; it must fail explicitly and never silently fall back to gateway.
- The Novendor eval suite includes an `operator_readiness` pilot case that records disabled, misconfigured, unavailable, runtime_error, or available as distinct states.

## V1 Target Environments

- Meridian REPE: `/lab/env/{env_id}/re/funds`, environment slug `meridian`.
- Novendor Consulting OS: `/lab/env/{env_id}/consulting`, environment slug `novendor`.
- Eval runs, baselines, and regressions are separated by environment. Shared fixtures are excluded from env-scoped runs unless explicitly marked global.

## Hard Eval Rules

- Every canonical assistant eval requires `runtime_identity`.
- The default expected runtime path is `canonical`; cases must explicitly opt into other allowed paths.
- Expected lane is enforced from the case contract when declared.
- Contract violations are part of normal scoring, not only Postgres persistence.
- Missing terminal state, multiple terminal states, post-terminal events, contract-enforced fallback, raw ID leakage, unavailable masquerade, empty dashboard shells, and runtime path drift are hard failures.
- A passing-looking answer cannot pass if it arrived through the wrong runtime path or malformed event sequence.

## Surfacing Rules

- `/lab` now mounts the Winston companion provider, but the launcher stays hidden until context is fully resolved.
- Lab companion boot requires route env, context env, business id, and non-global scope to agree.
- Conversation creation is blocked if the page has ambiguous or missing lab context.
- No Next.js admin status UI is part of V1; use Postgres, `/api/admin/eval/*`, `/api/admin/contract/*`, and markdown reports.

## Scheduling

- Nightly smoke and weekly full eval workflows run a matrix over `meridian` and `novendor`.
- Each matrix job requires environment-specific business and env secrets.
- Reports are written under `docs/ai-testing/reports/` with the environment slug in the filename.
- The runner exits non-zero when failures or critical regressions are present.

## Known Limitations

- Existing historical reports are sparse locally, so first env-scoped runs will establish fresh baselines.
- The managed-agent path is readiness/pilot only; automatic routing remains disabled.
- The operator pilot readiness case is not a full managed-agent conversation eval yet; it verifies explicit readiness state and no fallback semantics first.
- Some Meridian structured paths may need explicit case-level runtime expectations if they are intentionally not `canonical`.
