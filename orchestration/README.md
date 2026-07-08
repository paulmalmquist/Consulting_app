# Controlled Parallel Codex Orchestration

This subsystem enforces deterministic, auditable Codex execution with session metadata, scope controls, branch isolation, risk gating, and merge validation.

## Fast vs Deep

- Fast model intents: `ui_refactor`, `file_move`, `test_fix`.
- Deep model intents: `schema_change`, `business_logic_update`, `mcp_contract_update`, `infra_change`.
- Optional intents (`documentation`, `analytics_query`) default to fast unless session model is deep.

Model aliases resolve from environment variables:
- `CODEX_MODEL_FAST`
- `CODEX_MODEL_DEEP`

## Session Lifecycle

Create session:

```bash
python3 scripts/codex_orchestrator.py session create \
  --session-id <uuid> \
  --intent ui_refactor \
  --model fast \
  --reasoning-effort low \
  --allowed-directories repo-b/src/app \
  --allowed-tools read,edit,shell \
  --max-files-per-execution 20 \
  --auto-approval false
```

Validate/show session:

```bash
python3 scripts/codex_orchestrator.py session validate --session-id <uuid>
python3 scripts/codex_orchestrator.py session show --session-id <uuid>
```

## Run

Plan preview:

```bash
python3 scripts/codex_orchestrator.py plan --session-id <uuid> --prompt "Refactor UI card spacing"
```

Execute:

```bash
python3 scripts/codex_orchestrator.py run --session-id <uuid> --prompt-file task.txt
```

High-risk confirmation phrase:

```text
CONFIRM HIGH RISK
```

## Launch Patterns

Human-facing codex launch patterns:

```bash
codex -m <fast_model> --session-id=<uuid>
codex -m <deep_model> --session-id=<uuid>
```

Enforced path in this repo:

```bash
python3 scripts/codex_orchestrator.py run --session-id <uuid> --prompt "..."
```

## Parallel Validation

```bash
python3 scripts/codex_orchestrator.py validate-parallel --session-a <idA> --session-b <idB>
```

Includes branch collision checks, file overlap checks, protected branch checks, independent log checks, and merge gate build/test checks.

## Merge Safety

```bash
python3 scripts/codex_orchestrator.py merge-gate --branch-a feature/<idA>/<intentA> --branch-b feature/<idB>/<intentB>
```

## Audit

```bash
python3 scripts/codex_orchestrator.py log show --session-id <uuid>
python3 scripts/codex_orchestrator.py log verify-chain
```

## Coding Relay

`orchestration/coding_relay/` is a separate tool on the same substrate: a
bounded build/review loop where the Claude CLI implements inside a throwaway
worktree and the Codex CLI audits each pass from an artifact bundle,
returning a structured JSON verdict per acceptance criterion. Plans without
explicit success criteria are refused. Receipts land under
`.orchestration/runs/<run_id>/`; on pass it opens a draft PR (never merges).

```bash
python -m orchestration.coding_relay --plan <path|NNNN>   # repo root
python scripts/coding_relay.py --plan 0016 --dry-run      # anywhere
```

Full reference: `docs/reference/CODING_RELAY.md`. Tests:
`backend/tests/test_orchestration_relay_*.py`.
