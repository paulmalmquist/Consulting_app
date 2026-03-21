# Autonomous Loop Guardrails

Every task created by the autonomous loop skill MUST include these controls. These are not optional — they are what separates a controlled system from a background script runner.

## Turn Budgets

Every task has a hard limit on tool calls. Include this in the task prompt as a "Budget" line.

| Task type | Max tool calls | Rationale |
|---|---|---|
| Intelligence scanner | 8-10 | Web search + summarize. Should be fast. |
| Competitor tracker | 8-10 | Web search + compare. Should be fast. |
| Feature radar / analysis | 10-12 | Reads intel + inventory + writes. Moderate. |
| Content generation | 8-10 | Reads context + writes. Should be focused. |
| Ops / health checks | 8-10 | Check endpoints + write report. Mechanical. |
| Digest / manifest refresh | 10-12 | Reads many files, synthesizes one output. |
| Coding session | 25 | Plan + implement + commit. The expensive one. |
| Coding follow-up | 15 | Verify + fix. Should be shorter than the session. |
| Efficiency tracker | 10 | Read outputs + score. Lightweight analysis. |
| Watchdog | 10 | Check directories + git. Fast sanity check. |
| Weekly audit | 30 | Deep review of full week. Only runs once. |

Include in prompt: "**Budget:** Complete in under {N} tool calls. If approaching limit, wrap up and document."

## Loop Detection

Include in every coding-related task prompt:

```
**Loop detection:** If you read the same file more than twice, or edit the same file more than 3 times, STOP. You are looping. Commit what you have, document the issue, and let the next task handle it.
```

## Fail Fast

Include in every task prompt:

```
**Fail fast:** If you encounter an error you cannot resolve in 2 attempts, STOP. Document the error, what you tried, and what you think the fix is.
```

## Impact Statements

Every task output MUST end with an Impact Statement section. This is the single most important governance control — it forces every task to answer "was this run worth the tokens?"

```markdown
## Impact Statement
What changed as a result of this run: [1-2 concrete sentences]
If nothing changed: "[Honest explanation of why]"
```

For suggestion-generating tasks, the impact statement should also include:
- Could the coding session act on this today? [Yes/No]
- New ideas not previously suggested: [count]

For coding tasks, the impact statement should include:
- Files changed: [list]
- Was this worth Opus? [Yes/No + why]

For ops tasks, the impact statement should include:
- Issues found: [count]
- Action required: [Yes/No]

## Novelty Check

Include in every suggestion-generating task:

```
Check the last 3 days of your output folder before writing. If today's output repeats previous days, say so. Don't manufacture ideas from stale signals.
```

This prevents the common failure mode of tasks producing the same "insights" day after day with slightly different words.

## Signal Propagation

Intelligence tasks should include a propagation signal that downstream tasks can read:

```markdown
## Signal for Downstream Tasks
Novel signals today: [count]
If zero: "No novel signals. Downstream analysis tasks can skip or produce minimal output."
```

This lets the feature radar, demo generator, etc. short-circuit on quiet days instead of manufacturing ideas from nothing.

## Cost Justification

Include in every Opus-tier task:

```
**Model discipline:** You are running on Opus. Justify the expense. If the task turns out to be trivial, finish quickly and note in your report that this could have been Sonnet-tier.
```

## Fresh Context

Include in every task:

```
**Fresh context:** Do NOT re-read the entire repo. Read only the files you need for your specific task. Start narrow, expand only if required.
```

This prevents context bloat — the hidden cost driver in autonomous sessions.

## Scope Lock

Include in every coding task:

```
**Scope lock:** Pick ONE task. If during implementation you discover it's larger than expected, implement the smallest useful slice and document the rest. Do NOT expand scope.
```

## Governance Chain

The three-tier governance system monitors every task:

1. **Efficiency Tracker (daily, 6:30 PM)** — Scores every task output on actionability, novelty, dedup compliance, and cost justification. Flags underperformers.

2. **Watchdog (daily, 8 PM)** — Fast sanity check: missing outputs, stale files, coding session health, git health, repeat failures. Flags pipeline issues.

3. **Weekly Audit (Saturday)** — Deep review using efficiency scores and watchdog reports. Recommends prompt refinements, task retirements, priority overrides, and structural changes.

The weekly audit has authority to recommend:
- Retiring tasks that score <8/20 for 3+ consecutive days
- Merging redundant tasks (e.g., if noon-feature-ideas never adds value beyond product-feature-radar)
- Downgrading model tiers (e.g., if coding session consistently handles trivial tasks)
- Upgrading model tiers (e.g., if a scanner is producing low-quality output that wastes downstream time)
- Creating new tasks to fill gaps
- Changing task timing to fix dependency issues

## Anti-Patterns to Watch For

These are the failure modes that waste tokens without producing value:

1. **Repeat offender** — Task produces the same output day after day. Novelty score stays at 1-2.
2. **Context hoarder** — Task reads 20+ files when it only needs 3. Burns turns on unnecessary reading.
3. **Scope creeper** — Coding session starts on one bug, ends up refactoring three files.
4. **Loop rider** — Task encounters an error and retries the same approach 5 times.
5. **Noise generator** — Task produces long, well-formatted output that contains no actionable information.
6. **Duplicate builder** — Task suggests building something that already exists despite reading the inventory.
7. **Orphan producer** — Task writes output that no downstream task ever reads.

The efficiency tracker and weekly audit specifically check for these patterns.
