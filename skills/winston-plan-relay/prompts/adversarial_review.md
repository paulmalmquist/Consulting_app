## Mode: `two-agent-loop`

> **Ticket 1 status:** placeholder. In Ticket 1 (dry-run only), this mode produces the bundle and a note describing what Ticket 2 will do. No subprocess invocation happens yet.

### What Ticket 2 will do
Run two reviewers against the same input (Claude CLI and Codex CLI, per `--reviewers`):

1. **Reviewer A — structural pass.** Apply `plan_review.md` and report missing acceptance criteria, undefined environment, scope creep, missing tests.
2. **Reviewer B — adversarial pass.** Try to find the way this plan fails in production: hidden migrations, silent RLS gaps, cross-repo coupling, tests that would pass on a broken feature, abstractions with no near-term caller.
3. **Reconciliation.** Merge both critiques; flag where the two reviewers disagree (those are the high-information disagreements worth surfacing); produce a final refined plan + handoff prompt.

### For now (Ticket 1)
- Use the input as-is.
- Apply `plan_review.md` mentally — emit a single critique pass.
- Note explicitly at the end of the bundle: "Reviewer B / reconciliation deferred to Ticket 2."
- Recommend `--mode plan-review` as the immediate next step if the user wants a richer single-reviewer pass.
