---
id: deploy-winston
kind: agent
status: active
source_of_truth: true
topic: deployment
owners:
  - scripts
  - cross-repo
intent_tags:
  - deploy
triggers:
  - deploy-winston
  - push
  - deploy
  - ship it
entrypoint: true
handoff_to:
  - qa-winston
when_to_use: "Use for commit, push, CI, deploy, and post-deploy verification flows."
when_not_to_use: "Do not use for generic implementation, architecture planning, schema design, or sync-only requests."
surface_paths:
  - scripts/
notes:
  - Selection precedence lives in CLAUDE.md.
---

# Deploy Winston

Selection lives in `CLAUDE.md`. This file defines deploy behavior after the route has already been chosen.

Purpose: handle Winston git push and deployment flows from Telegram or local OpenClaw sessions.

Rules:
- Interpret `push`, `deploy`, `ship it`, `release`, and similar Telegram commands as the full Winston deploy flow unless the user narrows the request.
- Operate only at `/Users/paulmalmquist/VSCodeProjects/BusinessMachine/Consulting_app`.
- Follow the deploy contract in `tips.md` section `Autonomous Deploy-and-Test Workflow`.
- `push` means:
  1. inspect git status and branch
  2. run required local checks for affected surfaces
  3. create a commit if there are uncommitted Winston repo changes
  4. push to `origin/main`
  5. monitor GitHub Actions CI
  6. monitor Railway backend and Vercel frontend deployment state as applicable
  7. run DB migrate or verify if the change requires it
  8. run production smoke tests before declaring success
- Stop and report immediately on git conflicts, failing tests, failed CI, failed deploys, or failed smoke checks.
- If the repo is dirty because it contains intentional pending changes, do not refuse by default. `Push` means commit and ship those changes unless the user says not to commit them.
- Use `sync-winston` only for guarded fetch/pull status; use your own runtime tools for commit/push/deploy actions.
- Do not attempt ACP harness delegation for push/deploy work unless the user explicitly says `use Claude` or `use Codex`.
- Do not emit internal routing commentary. Report only the active deploy result, blockers, CI state, deploy state, and verification outcome.

---

# Deploy Skill Contract

When the user says "deploy", "ship it", "push to prod", "release", "railway up", or any equivalent phrase, DO NOT interpret that as "just push code" or "just run deployment commands."

Deploy always means the full release workflow below.

## 0. Precondition

Before deploying, identify:
- target environment: local / staging / production
- frontend target
- backend target
- database target
- git commit SHA being deployed

If target is not explicit, default to:
- backend: Railway production service
- frontend: Vercel production
- database: production database configured for backend

Print these targets before proceeding.

## 1. Verify code state

Before deploy:
- confirm working tree status
- confirm current branch
- confirm commit SHA
- confirm whether local changes are uncommitted
- confirm whether migration files were added/changed
- summarize exactly what changed that affects runtime behavior

If files under `repo-b/db/schema/`, `backend/scripts/check_winston_schema.py`, or schema-dependent backend contracts changed:
- prefer a local CI-parity schema check before push instead of waiting for GitHub Actions to fail first
- when Docker is available, run `./scripts/local_db_schema_gate.sh`
- treat that local gate as the default pre-push check for schema work
- if Docker is unavailable, say that explicitly and continue with remote CI as the fallback verifier
- do not claim schema confidence if neither the local gate nor CI has passed

If there are uncommitted changes, do not silently deploy a different state than the repo head. State clearly what is being deployed.

## 2. Backend deploy preparation

Before backend deploy:
- inspect migration files
- determine expected schema head revision
- determine whether code introduces new required DB columns, constraints, indexes, or tables
- identify any Winston-critical schema dependencies, especially:
  - ai_conversations
  - ai_messages
  - assistant scope/context fields
  - any conversation bootstrap metadata columns

## 3. Deploy backend

Deploy backend to Railway using the project's canonical deploy method.
Do not stop after issuing the deploy command.

Immediately after deploy:
- capture deployment identifier if available
- capture service URL
- capture latest startup logs
- capture current running git SHA if exposed

## 4. Run migrations explicitly

After backend deploy, explicitly run the migration step for the target backend/database.
Never assume migrations ran automatically.

After migration:
- capture migration command output
- record migration revision now present in DB
- compare DB revision to code head revision
- fail the deploy if they do not match

## 5. Run schema contract validation

After migrations, run a schema validation check against the target database.

This check must verify all Winston-critical tables/columns required for conversation bootstrap and assistant runtime.

Minimum required checks:
- ai_conversations exists
- ai_messages exists
- required ai_conversations metadata columns exist:
  - thread_kind
  - scope_type
  - scope_id
  - scope_label
  - launch_source
  - context_summary
  - last_route

If any required schema element is missing:
- mark deploy as failed
- do not describe deployment as complete
- surface the exact missing items

## 6. Readiness verification

After schema validation:
- call liveness endpoint (`GET /health/live`)
- call readiness endpoint (`GET /health/ready`)
- verify database connectivity
- verify schema contract passed
- verify backend is ready for traffic

Do not treat "process booted" as success.
Only "ready for traffic" counts.

## 7. Frontend deploy

If frontend changes are included or frontend depends on new backend behavior:
- deploy frontend
- verify production frontend is pointing at the intended backend
- verify environment variables and API base URLs are aligned with the deployed backend

## 8. Live smoke test through the real site

After deploy, run the automated smoke test:

```bash
python scripts/smoke_companion_boot.py
```

This runs with production defaults (no arguments needed) and checks:
- `/health/ready` returns 200 with `ready: true`
- Winston schema contract passes (all required columns present)
- Conversation create succeeds (catches KeyErrors, schema mismatches, auth issues)
- First message produces a **healthy** response (not degraded)

The test parses the full SSE stream and inspects the `turn_receipt` for:
- `status == "success"` (not "degraded" or "failed")
- `degraded_reason == null`
- `runtime.degraded == false`
- No known degraded messages in response text

A degraded response (e.g., "Not available in the current context") counts as a deploy failure, not just a bootstrap crash.

Exit code 0 = all checks pass. Exit code 1 = any check failed.

If the smoke test fails on response quality but readiness and bootstrap pass, the deploy is **runtime unhealthy** — the app boots but does not produce useful answers.

## 9. Produce a deploy receipt

Every deploy must end with a receipt containing:

- timestamp
- target environment
- frontend target
- backend target
- database fingerprint (sanitized)
- git SHA deployed
- migration head in code
- migration revision in DB
- schema contract result
- readiness result
- smoke test result
- links/IDs for deployment logs if available
- exact failing step if deployment is not healthy

## 10. Final status language

Never say "deployed successfully" unless all of the following are true:
- backend deployed
- migrations ran successfully
- DB revision matches code head
- schema contract passed
- readiness passed
- live smoke test passed

Otherwise say:
- "deployment incomplete"
- "deployment failed at step X"
- or "runtime unhealthy despite code deploy"

## Continuous monitoring

After any deploy, the system has three layers of validation that run independently:

1. **CI pipeline** (`.github/workflows/ci.yml`):
   - `db-schema-gate`: applies schema to ephemeral Postgres, verifies idempotency, runs `check_winston_schema.py`
   - `production-smoke`: runs `smoke_companion_boot.py` on push to main (observational, not blocking yet)
   - Artifacts: `smoke-test-result` JSON uploaded per run

2. **Health monitor** (`scripts/winston_health_monitor.py`):
   - Runs smoke test and stores results in `artifacts/production-loop/health-checks/`
   - `--report` shows trend analysis with regression detection
   - Hourly cron checks production health between deploys

3. **Deploy receipt** (`backend/scripts/generate_deploy_receipt.py`):
   - Captures readiness, schema contract, Winston readiness per deploy
   - Stored in `artifacts/deploy-receipts/`

Reference: `automated_testing_strategy.md` documents the full target-state architecture including ephemeral DB gates, post-deploy validation, rollback procedures, and property-based testing priorities.

## Docker Cleanup

### Environment classification

| Environment | Type | Docker cleanup needed? |
|---|---|---|
| Railway (backend deploy) | Ephemeral container | No — each deploy is a fresh image, old images are garbage collected by Railway |
| GitHub Actions CI | Ephemeral runner | No — runner is destroyed after each job |
| Local development machine | Persistent | **Yes** — repeated `local_db_schema_gate.sh` runs and Docker builds accumulate stale images, dangling layers, and build cache |

Docker cleanup is **mandatory on persistent environments** and **skipped on ephemeral environments**.

### Cleanup script

`scripts/docker_cleanup.sh` handles all Docker cleanup with three modes:

| Mode | When | What it removes |
|---|---|---|
| `--pre` (default) | Before each backend build | Dangling images, stopped containers, build cache |
| `--post` | After successful deploy + health check | All unused images and full build cache |
| `--deep` | Scheduled periodic (weekly) | Full system prune including unused volumes |
| `--report` | Anytime | Reports disk usage, no cleanup |

### Integration into deploy workflow

**Pre-deploy** (step 2.5 — after deploy preparation, before deploy):
```bash
./scripts/docker_cleanup.sh --pre
```

**Post-deploy** (step 8.5 — after smoke test passes):
```bash
./scripts/docker_cleanup.sh --post
```

### Guardrails

- Never removes the currently running container/image (Docker prune excludes running containers by design)
- Never removes named volumes unless `--deep` is explicitly passed
- Captures `docker system df` before/after cleanup
- Writes a JSON receipt to `artifacts/docker-cleanup/` with image counts and reclaimed stats
- If Docker is not installed or daemon is not running, the script exits cleanly with SKIP status

### Scheduled deep cleanup

For persistent machines, run weekly:
```bash
./scripts/docker_cleanup.sh --deep
```

This removes all unused images, containers, build cache, and volumes. Only use in environments where volume deletion is safe (not on machines hosting persistent databases in Docker volumes).

## Important behavioral rules

- Do not confuse local passing tests with production readiness.
- Do not stop at build success.
- Do not assume migrations ran.
- Do not assume Railway and the app are using the same database without verification.
- Do not call a deploy healthy unless the first real Winston conversation works.

## If the user says "deploy"

Return:
1. what target is being deployed
2. what changed
3. what migrations are expected
4. whether schema contract passed
5. whether Winston first-message smoke test passed
6. final deploy status
