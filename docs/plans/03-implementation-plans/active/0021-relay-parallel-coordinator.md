# 0021 - Relay Parallel Coordinator: planning + scheduling spine

- Status: Done (2026-07-10). Implemented `orchestration/relay_coordinator/` + `backend/tests/test_relay_coordinator_*.py`. 80 coordinator tests + 123 relay tests green; ruff clean; dry-run mutation-free; `orchestration/coding_relay/` untouched.
- Environment: MCP / Orchestration / AI Runtime
- Risk: Medium (new orchestration tooling; adjacent to the relay but must not change relay behavior)
- Scope: Add a coordination layer over the existing Coding Relay that turns a roadmap into a dependency-aware, wave-scheduled, model-routed set of workstreams and launches them through the relay as isolated parallel workers. Planning + scheduling + worker-launch + integration-manifest only. NO autonomous merging, NO deploy, NO auto-migration-apply.
- Owning surface: `orchestration/` (commander/deploy/feature-dev). New sibling package `orchestration/relay_coordinator/`; the relay package `orchestration/coding_relay/` is imported and invoked but NOT modified.
- Related: `docs/reference/CODING_RELAY.md`, `docs/plans/03-implementation-plans/active/0016-coding-relay-agent.md`.

## Design constraints discovered from the relay

- The relay worker hard-wires **builder = `claude` CLI** (`claude -p --permission-mode acceptEdits`) and **reviewer = `codex` CLI** (`codex exec`). Model is selectable per CLI: `--claude-model` (builder), `--codex-model` (reviewer). There is no flag to make codex build or claude review.
- Therefore a workstream whose builder is a Claude-family model and reviewer a Codex-family model is **executable** by the current worker; the reverse orientation (e.g. Sol builds / Fable reviews) is **not executable** without editing the relay (a recorded self-edit escalation, explicitly out of scope here).
- The coordinator routes faithfully to the policy, maps each model to its provider+CLI via a registry, and marks any non-executable orientation as `unsupported_by_current_worker` with a reason instead of fabricating a run. Operators can edit model assignments to a supported orientation. This satisfies "probe CLI capabilities, record actual capability, do not assume model flags."
- Model IDs: `fable` -> `claude-fable-5` (claude CLI, builder-capable). `sol` -> `gpt-5.6` (codex CLI, reviewer-capable). Registry is data, operator-overridable.

## Module layout (all new, under `orchestration/relay_coordinator/`)

- `__init__.py` - version constant, public exports.
- `graph.py` - `Workstream` dataclass (the JSON schema fields), `DependencyGraph` build + validation (cycle, path-overlap, migration order, parent-precedes-child, contract-freeze).
- `waves.py` - topological wave assignment; classify serial-foundation / parallel-safe / serial-integration; enforce max concurrency (default 3) by batching within a wave.
- `routing.py` - task classes, default routing policy, model registry, `resolve_execution()` (executable vs unsupported orientation), outcome recorder (append-only JSONL), `recommend()` from collected evidence (no auto-rewrite).
- `child_plans.py` - render a focused relay-compatible active plan per workstream; validate judgeable criteria by reusing `coding_relay.intake.normalize_criteria`.
- `workers.py` - launch each workstream through the relay CLI as a subprocess with isolated worktree-root, fixed `--base` commit, builder/reviewer models, `--no-pr`, `--max-iterations`; concurrency-capped; capture per-worker result. Never merge/deploy/force-push/delete-worktree; pass through the relay's own safety.
- `integration.py` - ordered integration manifest per completed workstream (PR, base commit, dependency state, tests, verdict, changed paths, conflicts, rebase-needed); recommend merge order + prepare commands; never merges.
- `staleness.py` - on a simulated dependency-merge event, mark downstream evidence stale, require rebase, flag reruns, update manifest.
- `safety.py` - coordinator hard-stop conditions (distinct from the relay's own scanner).
- `cli.py` + `__main__.py` - roadmap intake, operator wave preview (exact format), approval gate, edit/reduce/defer/abort, dry-run (mutation-free), fixture mode (token-free).

Tests under `orchestration/relay_coordinator/tests/` (pytest), discoverable by the backend suite command.

## Roadmap intake contract

Robust prose extraction is out of scope. The coordinator accepts a **structured workstreams manifest** (JSON or a fenced `json` block inside a roadmap markdown) matching the graph schema, and enriches/validates it. A helper `scaffold_from_plan_tickets()` seeds a manifest skeleton from a plan's `T#` ticket list so operators start from real tickets, then fill owned/forbidden paths and criteria. Intake identifies features, tickets, dependencies, shared contracts, owned paths, required tests, risk, migration requirements, and recommended builder/reviewer (defaults from routing policy when unset).

## Machine-readable graph (exact fields, per workstream)

```json
{
  "workstream_id": "...",
  "title": "...",
  "depends_on": [],
  "owned_paths": [],
  "read_only_paths": [],
  "forbidden_paths": [],
  "acceptance_criteria": [],
  "required_tests": [],
  "risk": "low|medium|high",
  "builder_model": "...",
  "reviewer_model": "...",
  "wave": 0
}
```

## Acceptance Criteria

### Screen
- Operator wave preview renders in the documented text form before any launch, grouping workstreams by wave with `serial`/`parallel, max N` labels and `Builder builds / Reviewer reviews` per row. Verifiable from a unit test asserting the rendered string, and from `--dry-run` output.

### API
- `python -m orchestration.relay_coordinator --roadmap <manifest> --dry-run` prints the validated graph, the waves, the model assignments, and every relay command it would run, and exits without creating a worktree, branch, run folder, or file (mutation-free), mirroring relay dry-run semantics.
- A non-`--dry-run` run requires explicit operator approval of the waves before launching any worker (a `--yes` flag matches the relay's non-interactive approval semantics; without it and without a TTY, it prints the plan and exits, launching nothing).
- The coordinator invokes the relay as the worker via `python -m orchestration.coding_relay --plan <child> --base <sha> --worktree-root <dir> --claude-model <m> --codex-model <m> --no-pr --max-iterations <n>` and never adds `--draft-pr`, `gh pr merge`, deploy, or force-push.

### DB/Data
- Not applicable (no schema, no migration in this ticket). The coordinator can *plan* migration ordering for downstream workstreams but applies nothing.

### AI behavior
- Model routing is configurable by task class; builder and reviewer may be different providers; the default policy assigns Fable to repo-wide/ambiguous/architecture-sensitive/foundation classes and Sol to bounded implementation/test classes, with the opposite model as reviewer when executable. Plan-level overrides win. Non-executable orientations are recorded as `unsupported_by_current_worker`, never silently rerouted without a record. Run outcomes (iterations, first-pass tests, final status, reviewer findings count, elapsed, token/cost if available) are appended to an evidence store per (model, task_class); `recommend()` reads that store and returns suggestions without rewriting the policy.

### Evals/tests
- New pytest suite passes, covering: dependency-cycle detection, owned-path overlap among same-wave workstreams, wave scheduling (topological levels), concurrency-limit enforcement, model routing (class -> assignment + executable/unsupported classification), child-plan generation (produces a plan whose criteria pass `normalize_criteria`), and integration-manifest construction + stale-on-merge transitions.
- Existing relay tests remain green: `backend/tests/test_orchestration_relay_*.py` and `python -m ruff check orchestration`.
- Command to run: `python -m pytest orchestration/relay_coordinator/tests -q` and `python -m pytest backend/tests/test_orchestration_relay_*.py -q`.

### Regression guard
- No file under `orchestration/coding_relay/` is modified (verifiable from the diff file list).
- The relay's guided and non-interactive single-plan runs, fixture mode (token-free), dry-run (mutation-free), and safety/redaction behavior are unchanged (no relay files touched).
- The coordinator itself never calls `gh pr merge`, never pushes to `main`, never force-pushes, never deploys, never applies a migration, and caps concurrency (default 3); each is covered by a safety unit test asserting the hard stop or the absence of the command.
- Cyclic dependencies, parallel ownership overlap, unordered migrations, shared-contract edits by parallel dependents, and missing success criteria each raise a coordinator hard stop before any worker launches.

## Out of scope (explicit)
- Automatic PR merging, production deployment, automatic migration application, unlimited parallel workers, a browser cockpit, self-modifying routing policy.
- Editing `orchestration/coding_relay/` (including adding codex-as-builder / claude-as-reviewer role support). If bidirectional builder/reviewer orientation is wanted, that is a separate relay ticket with `--allow-relay-self-edit`.
- Actually merging any workstream PR or executing the recommended merge order.
