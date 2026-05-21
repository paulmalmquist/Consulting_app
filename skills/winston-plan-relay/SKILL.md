---
name: winston-plan-relay
description: Automate the manual planning relay between ChatGPT, Claude Code, and Codex CLI. Takes a rough idea or existing plan file, reads Winston context (CLAUDE.md, plan-maintenance rules, dispatch routing), and emits a fully-assembled prompt bundle + sibling receipt for the target agent. Ticket 1 is dry-run only — no model subprocess invocation; the relay assembles the prompt and you paste it into the agent yourself.
kind: skill
status: active
source_of_truth: true
topic: orchestration
owners:
  - cross-repo
intent_tags:
  - planning
  - relay
  - handoff
  - claude-code
  - codex
  - prompt-assembly
  - dispatch
triggers:
  - relay this plan
  - relay this idea into a plan
  - review this plan and produce a handoff prompt
  - normalize this idea into a Winston plan
  - build me a handoff prompt for Claude Code
  - build me a handoff prompt for Codex
  - two-agent review on this plan
  - run plan relay
  - winston plan relay
  - route and plan this idea
  - critique this plan against Winston conventions
entrypoint: true
sandbox: false
local_deps: "Python 3.10+ (stdlib only)"
when_to_use: "Use when you have a rough idea or an existing plan file and want the same back-and-forth refinement you'd do manually between ChatGPT and Claude Code/Codex, but packaged as a deterministic, repo-grounded step. Especially valuable before starting a Claude Code or Codex coding session, so the agent gets a tight prompt instead of a vague brief."
when_not_to_use: "Do not use for trivial one-line changes — overhead exceeds benefit. Do not use for plans that already have a tight handoff prompt. Do not use as a substitute for actually reading the plan yourself before approving it."
---

# Winston Plan Relay

Automated prompt assembler for the planning relay loop. Reads Winston context, applies the right mode-specific prompt fragment to your input, and writes a bundle + receipt that you paste into Claude Code or Codex CLI.

## What it does

You have an idea or a plan file. You want the same critique-and-refinement loop you've been running manually between ChatGPT and Claude Code, but deterministic and repo-aware. The relay does the *context gathering* and *prompt assembly* steps automatically. You still run the model yourself in Ticket 1 (by pasting the bundle into your agent).

Modes:

| Mode | Input | Output |
|---|---|---|
| `plan-review` | existing plan file | critique + refined handoff prompt |
| `route-and-plan` | rough idea | dispatch routing decision + drafted plan + Ticket 1 handoff prompt |
| `handoff-only` | approved plan | tight Claude Code / Codex prompt for one ticket |
| `two-agent-loop` | idea or plan | Ticket 1: same as plan-review with a Ticket-2 note; Ticket 2 (deferred): runs Claude CLI + Codex CLI and reconciles |

## How to invoke

```powershell
python skills/winston-plan-relay/scripts/relay.py `
  --repo-root c:\Projects\Consulting_app `
  --input docs/plans/03-implementation-plans/active/0001-meridian-repe-ui-data-integrity-roadmap.md `
  --mode plan-review `
  --target-agent claude-code `
  --out tmp/relay-out.md `
  --dry-run
```

Outputs:
- `tmp/relay-out.md` — full assembled bundle (system invariants + mode prompt + your input + handoff scaffold).
- `tmp/relay-out.md.receipt.md` — sibling receipt: context files read, suggested next plan filename (route-and-plan mode), flagged risks, next recommended command.

Pass `--print-next-command` to also echo the next command to stdout.

## Files in this skill

```
skills/winston-plan-relay/
  SKILL.md                       # this file
  README.md                      # quick-start narrative
  scripts/
    relay.py                     # CLI (Python 3.10+, stdlib only)
  prompts/
    system.md                    # Winston invariants (always included)
    plan_review.md               # critique existing plan
    route_and_plan.md            # raw idea → drafted plan
    implementation_handoff.md    # handoff scaffold (always included)
    adversarial_review.md        # two-agent-loop (Ticket 1 placeholder)
  templates/
    session_brief.md             # session-tracking template
    implementation_plan.md       # plan skeleton matching NNNN-env-title format
    relay_receipt.md             # receipt shape reference
  examples/
    review_existing_plan.sh
    route_raw_idea.sh
    two_agent_review.sh
```

## Ticket boundaries

**Ticket 1 (this version):** dry-run only. Assembles the prompt. Writes bundle + receipt. No model subprocess.

**Ticket 2 (deferred):** add `scripts/adapters/claude_cli.py` and `scripts/adapters/codex_cli.py`. Allow `relay.py` without `--dry-run` to actually invoke the reviewer CLIs and write their output to `--out`. Don't build until you've used Ticket 1 on at least one real plan and confirmed it saves time.

## Safety rules

- Never auto-writes into `docs/plans/03-implementation-plans/active/`. The relay only *suggests* the next plan filename. The user copies the drafted plan into place.
- Fails closed when required context files are missing. Pass `--allow-missing-context` only when running outside the Winston repo.
- No model API calls in Ticket 1.

## See also

- `skills/supervised-build-review-loop/SKILL.md` — multi-agent build/review loop for code (this skill's sibling, scoped to *planning* not building).
- `skills/triaged-execution/SKILL.md` — model-budget routing for plan steps.
- `docs/plans/PLAN_MAINTENANCE_RULES.md` — what the relay is enforcing.
- `WINSTON_CODING_SESSION_INSTRUCTIONS.md` — the protocol the relay is built around.
