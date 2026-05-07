---
name: triaged-execution
description: Execute a multi-step plan where each step is routed to the right Claude model, thinking budget, and verification effort based on the step's complexity and importance. Use when a user provides a plan to run, asks for "model triage," "tiered execution," "complexity-routed execution," or "cost-aware execution," or wants implementation effort scaled to the stakes of each step.
---

# Triaged Execution

## Purpose

Match each step of a plan to the cheapest model and the lightest verification that can reliably get the step right. Spend more on the steps that matter, less on the steps that don't.

## When to use

Activate when:

- The user hands you a multi-step plan and asks you to execute it.
- The user asks for "model triage," "tiered execution," or "cost-aware execution."
- Different parts of a job clearly differ in stakes (some throwaway, some critical).
- The user is going to re-run the same kind of plan repeatedly and wants the routing decisions captured.

Do not use this for single-step requests. A direct response is fine for those.

## Inputs

The plan can come in as:

1. A YAML plan file (preferred). See `plan.example.yaml` for the schema.
2. A markdown plan with numbered steps.
3. A free-text description, in which case structure it into steps before classifying.

Each step needs at minimum a `name` and a `description`. If the user pre-classified steps with `complexity` and `importance` fields, honor those values. Otherwise classify them yourself using the heuristics below, then show the user the classification table and ask for confirmation before running.

## The two axes

### Complexity (how hard is the reasoning?)

| Code | Label       | Examples                                                                                  |
|------|-------------|-------------------------------------------------------------------------------------------|
| C1   | Retrieval   | File search, grep, lookups, listing, summarizing what already exists.                     |
| C2   | Mechanical  | Structured edits, format conversion, find-and-replace, simple test scaffolding.            |
| C3   | Reasoning   | Multi-file refactors, debugging across files, design with tradeoffs, code review.          |
| C4   | Research    | Novel architecture, distributed/concurrency reasoning, deep performance work, ambiguity.   |

### Importance (what does it cost if this step is wrong?)

| Code | Label        | Examples                                                                       |
|------|--------------|--------------------------------------------------------------------------------|
| I1   | Throwaway    | Prototype, exploratory work, scratch.                                          |
| I2   | Internal     | Dev tools, internal docs, non-prod scripts.                                    |
| I3   | User-facing  | Features that ship, customer-facing surfaces, database schemas.                |
| I4   | Critical     | Production systems, financial calculations, security, irreversible actions.    |

When in doubt, classify one notch higher on importance. Over-investing on one step costs a few dollars. Under-investing on a critical step costs trust.

## Profile matrix

Each (complexity, importance) cell maps to a profile: `(model, thinking_tokens, effort_level)`.

|        | I1 Throwaway          | I2 Internal           | I3 User-facing         | I4 Critical             |
|--------|-----------------------|-----------------------|------------------------|-------------------------|
| **C1** | Haiku, 0 think, E0    | Haiku, 0 think, E0    | Haiku, 0 think, E1     | Sonnet, 0 think, E2     |
| **C2** | Haiku, 0 think, E0    | Sonnet, 0 think, E1   | Sonnet, 4k think, E2   | Sonnet, 8k think, E3    |
| **C3** | Sonnet, 4k think, E0  | Sonnet, 8k think, E2  | Sonnet, 16k think, E3  | Opus, 16k think, E4     |
| **C4** | Sonnet, 16k think, E2 | Opus, 16k think, E2   | Opus, 32k think, E3    | Opus, 32k think, E4     |

## Effort levels

| Code | Action                                                                                        |
|------|-----------------------------------------------------------------------------------------------|
| E0   | Single pass. Accept output as-is.                                                              |
| E1   | Lint pass. Run linter or formatter. One retry if it fails.                                     |
| E2   | Lint plus test. Run unit tests after edits. One retry if they fail.                            |
| E3   | Critic review. Spawn a Sonnet subagent to review the output. Reconcile findings before accept. |
| E4   | Full pipeline. E3 plus an Opus reviewer subagent plus a diff readout to the user before commit. |

## Thinking budgets

When the profile assigns a non-zero thinking budget:

- In Claude Code, use the `--thinking` or `--thinking-budget` flag if available on your CLI version.
- Otherwise, prepend the prompt with: `Think carefully and use up to <N> tokens of internal reasoning before producing your final output.`
- When the budget is 0, do not add a thinking instruction.

Thinking is most valuable on C3 and C4 steps where the model needs to weigh tradeoffs or hold many constraints at once. It rarely helps on C1 or C2.

## Heuristics for self-classification

Use these only if the user did not pre-classify a step.

### Detecting complexity

| If the step says... | Likely     |
|---------------------|------------|
| find, list, grep, locate, enumerate, summarize what's there | C1 |
| rename, format, convert, fill in, populate, scaffold from a template | C2 |
| refactor, debug, design, review, investigate, propose | C3 |
| architect, optimize, decide between, reason about, derive | C4 |

### Detecting importance

| If the output... | Likely |
|------------------|--------|
| will be discarded after review | I1 |
| feeds an internal tool, doc, or non-prod script | I2 |
| ships to users or modifies user data | I3 |
| touches money, security, or irreversible production state | I4 |

## Execution loop

1. **Parse the plan.** Confirm each step has `name` plus `description`. If steps are not classified, classify them and show the user the classification table. Wait for confirmation.

2. **For each step in order:**
   - Look up the profile from the matrix.
   - Build the prompt. Reference prior step outputs by file path (not full content) so input tokens stay bounded.
   - Dispatch using the profile:
     - Inside Claude Code or Cowork: spawn a subagent with the assigned model parameter.
     - From the terminal: invoke `claude -p --model <X>` (see `runner.py`).
   - Save the output to `/tmp/triaged_<plan_slug>_step_<id>.md`.
   - Run the verification effort for the assigned E-level.
   - If verification fails, retry once with the next-higher profile (one step up the matrix in importance). If it still fails, halt and report.

3. **Report.** When the plan finishes, produce the summary block defined below.

## Final summary format

```
TRIAGED EXECUTION SUMMARY
Plan: <name>
Total steps: N
Total approx. cost: $X.XX
Wall-clock: M minutes

Step 1: <name>
  Profile: <model>, <thinking> think, <effort>
  Status: success | retry | halt
  Tokens (in / out): A / B
  Output: /tmp/triaged_<slug>_step_1.md

Step 2: <name>
  ...
```

## Boundaries

- Do not run an Opus / 32k think / E4 step without explicit user confirmation. That cell burns real money.
- Do not retry beyond one upgrade cycle. If the upgraded profile still fails, halt and ask the user.
- Do not silently drop steps. If a downstream step depends on a halted prior step, halt the whole plan.
- Always show the classification table before executing so the user can override before any tokens get spent.

## Anti-patterns

- Defaulting every step to Sonnet "to be safe." If half your steps are C1, you are paying 3x for retrieval work.
- Defaulting every step to Opus on a critical project. Most critical projects have C1 and C2 steps mixed in. Only the C3 and C4 cells warrant Opus.
- Skipping verification on I3 or I4 steps because the output "looked right."
- Letting the model self-grade. Verification needs to be programmatic (lint, test) or use an independent subagent.

## Companion files

- `runner.py`: standalone Python orchestrator for terminal use. `python runner.py plan.yaml`.
- `cost_ledger.py`: per-plan token + cost tracking. Aggregates Cowork-side and CLI-side runs. Auto-populated by `runner.py`.
- `plan.example.yaml`: sample plan showing all schema fields.

## Cost tracking

After each plan run, inspect the ledger:

```bash
python skills/triaged-execution/cost_ledger.py report --plan <slug>
```

The report shows three columns per step: actual cost (triaged), what it would have cost on all-Sonnet, what it would have cost on all-Opus.

**Reading the comparison honestly.** Triaging is not always cheaper than all-Sonnet. When a plan has a single high-stakes step that correctly routes to Opus with thinking, that step alone can make triaged total exceed all-Sonnet. That is not waste. The right comparison is risk-adjusted: a wrong production write costs far more than the Opus premium. Compare against all-Opus to see the savings on the cheap steps; compare against all-Sonnet to verify you are not over-spending on the expensive ones.

**Recording Cowork subagent runs manually.** When the orchestrator dispatches an Agent tool call inside Cowork, the Agent's `<usage>` block reports `total_tokens`, `tool_uses`, and `duration_ms`. Pass those into the ledger:

```bash
python cost_ledger.py add --plan <slug> --step <n> --source cowork \
  --model <haiku|sonnet|opus> --input <est> --output <est> --thinking <budget>
```

The split between input and output is approximate; use rough 70/30 or 80/20 estimates if Anthropic's reported total is the only number you have.

## When this skill is the wrong choice

- Pure conversation, brainstorming, or one-shot questions. Just answer.
- Plans where every step is the same complexity and importance. Pick the right model once and run.
- Plans where the user has already specified per-step models. Honor their choices and skip the matrix.
