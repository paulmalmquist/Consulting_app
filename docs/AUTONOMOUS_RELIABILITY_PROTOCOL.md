# Autonomous Task Reliability Protocol

> Every autonomous task in the Novendor/Winston system MUST apply these protocols. They prevent hallucination, assumption drift, and low-quality outputs in unsupervised agent runs.

---

## Protocol 1: Refusal Protocol

If at any point you are uncertain about a fact, stop and write:
`UNCERTAIN: [what you don't know]`

If you cannot complete any part of the request accurately, write:
`CANNOT COMPLETE: [specific reason]`

Never fill gaps with assumptions. Incomplete and honest beats complete and wrong.

## Protocol 2: Confidence Scoring

After completing your output, go back and score every factual claim:
- `[HIGH]` — You would stake your reputation on this (directly observed, read from a file, or computed)
- `[MEDIUM]` — You believe this but recommend verifying (inferred from partial data, web search result)
- `[LOW]` — This is your best guess, treat with caution (extrapolated, no direct source)

Claims scored `[LOW]` must be flagged visibly in the output so Paul can verify.

## Protocol 3: Source Attribution

For every key claim in the output, cite:
- **Source type:** file read, web search, Supabase query, computed, inferred
- **Source location:** file path, URL, table name
- **Confidence:** HIGH / MEDIUM / LOW

If you can't source a claim, flag it with `[UNSOURCED]`.

## Protocol 4: Assumption Audit

Before starting the main task, list every assumption you are making about:
- What data is current vs. stale
- What systems are working vs. broken
- What the user wants this output used for
- What counts as a good result

Write these assumptions in an `## Assumptions` section at the top of your output. If any assumption is wrong, the output should be re-evaluated.

## Protocol 5: Hard Constraints

Every autonomous task has these hard stops:
- Never invent statistics, metrics, or company names
- Never present inferred information as confirmed fact
- Never skip verification steps to save tokens
- Never claim a feature works without checking the health report
- Never suggest building something that already exists in `docs/CAPABILITY_INVENTORY.md`
- Never commit code that hasn't been tested or at minimum lint-checked
- Never push to production without reading the latest regression report

## Protocol 6: Self-Critique Pass

After completing the main output, switch to critic mode:
1. Re-read your output as a hostile reviewer
2. Flag every claim that could be hallucinated with `[REVIEW]`
3. Flag every recommendation that lacks evidence with `[NEEDS EVIDENCE]`
4. Produce a `## Self-Critique` section at the bottom listing everything flagged
5. Fix or remove flagged items before finalizing

---

## How to Apply

Include this preamble in every autonomous task prompt:

```
Before starting work, read and apply docs/AUTONOMOUS_RELIABILITY_PROTOCOL.md.
Your output must include: Assumptions section, source citations, confidence scores
on key claims, and a Self-Critique section at the bottom.
```

Tasks that produce code should additionally:
- Run the code or at minimum verify syntax
- Check for regressions against existing tests
- Note any `[UNCERTAIN]` areas in commit messages
