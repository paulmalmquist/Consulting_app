# winston-plan-relay

Prompt assembler for the planning relay loop between ChatGPT, Claude Code, and Codex CLI. Runs in two modes: **dry-run** (assemble the bundle, you paste it into a reviewer) and **adapter** (the relay invokes a reviewer CLI for you).

See `SKILL.md` for the full contract. Quick start below.

## Quick start — dry-run (default-safe)

```powershell
# 1. Review an existing plan and get a refined handoff prompt
python skills/winston-plan-relay/scripts/relay.py `
  --repo-root c:\Projects\Consulting_app `
  --input docs/plans/03-implementation-plans/active/0001-meridian-repe-ui-data-integrity-roadmap.md `
  --mode plan-review `
  --out tmp/review.md `
  --dry-run --print-next-command

# 2. Turn a rough idea into a Winston-shaped plan
python skills/winston-plan-relay/scripts/relay.py `
  --repo-root c:\Projects\Consulting_app `
  --input tmp/raw-idea.md `
  --mode route-and-plan `
  --target-agent codex `
  --out tmp/plan.md `
  --dry-run

# 3. Generate a tight Claude Code handoff prompt for an approved plan
python skills/winston-plan-relay/scripts/relay.py `
  --repo-root c:\Projects\Consulting_app `
  --input docs/plans/03-implementation-plans/active/0004-environment-contract-promotion-gate.md `
  --mode handoff-only `
  --out tmp/handoff.md `
  --dry-run
```

A dry-run produces `<out>` (the assembled bundle) and `<out>.receipt.md` (audit trail + next command). No external process runs.

## Adapter run — invoke a reviewer CLI

Drop `--dry-run` to have the relay feed the bundle to the CLI implied by `--target-agent`:

```powershell
# Runs the `claude` CLI on the assembled bundle
python skills/winston-plan-relay/scripts/relay.py `
  --repo-root c:\Projects\Consulting_app `
  --input docs/plans/03-implementation-plans/active/0001-meridian-repe-ui-data-integrity-roadmap.md `
  --mode plan-review `
  --target-agent claude-code `
  --out tmp/review.md `
  --print-next-command

# --target-agent codex uses the `codex` CLI instead
```

An adapter run produces three files:

| File | Contents |
|---|---|
| `<out>` | the reviewer's output |
| `<out>.bundle.md` | the exact prompt sent to the CLI (always preserved, for debugging) |
| `<out>.receipt.md` | audit receipt: command, exit code, duration, bundle path, stderr excerpt on failure |

Behavior notes:
- The relay detects the CLI with `shutil.which()` before invoking. A missing CLI **fails loud** — exit 3, the attempted command, and a `--dry-run` fallback suggestion. The bundle is still written so nothing is lost.
- A non-zero reviewer exit fails the relay (exit 1) and the receipt is marked **FAILURE**. The relay never pretends the reviewer succeeded.
- `--target-agent human` only works with `--dry-run` — there is no `human` CLI to invoke.
- `--adapter-timeout <seconds>` caps the reviewer run (default 600).

## When to reach for this skill

- You're about to start a Claude Code or Codex session and want to hand the agent a tight, repo-grounded prompt instead of a vague brief.
- You have a half-baked idea and want the relay to apply the Winston dispatch algorithm and draft the plan in `NNNN-environment-short-title` shape.
- You want a critique pass on an existing plan before approving it.

## When to skip

- The change is trivial (a typo, a rename, a one-line fix).
- The plan already has a tight handoff prompt.
- You haven't read the input yourself yet — don't use the relay as a substitute for reading.

## Status

- **Ticket 1** — dry-run bundle assembler.
- **Ticket 1.6** — made the bundle behavior-driving (imperative prompts, `## Your task` header, collision-proof fences).
- **Ticket 2** — Claude/Codex CLI subprocess adapters. Dry-run remains the default-safe path; adapter invocation is opt-in by dropping `--dry-run`.

The adapters shell out to a locally installed CLI only — no API keys, no network calls of their own.
