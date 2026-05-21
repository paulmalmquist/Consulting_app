# winston-plan-relay

Dry-run prompt assembler for the planning relay loop between ChatGPT, Claude Code, and Codex CLI.

See `SKILL.md` for the full contract. Quick start below.

## Quick start

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

Each run produces `<out>` (the assembled bundle) and `<out>.receipt.md` (audit trail + next command).

## When to reach for this skill

- You're about to start a Claude Code or Codex session and want to hand the agent a tight, repo-grounded prompt instead of a vague brief.
- You have a half-baked idea and want the relay to apply the Winston dispatch algorithm and draft the plan in `NNNN-environment-short-title` shape.
- You want a critique pass on an existing plan before approving it.

## When to skip

- The change is trivial (a typo, a rename, a one-line fix).
- The plan already has a tight handoff prompt.
- You haven't read the input yourself yet — don't use the relay as a substitute for reading.

## Ticket 1 vs Ticket 2

Ticket 1 (this version) is dry-run only: it assembles the prompt, you paste into the agent.
Ticket 2 (deferred) will add Claude CLI and Codex CLI subprocess adapters so the relay can run the review itself. Don't build it until Ticket 1 has earned its keep on at least one real plan.
