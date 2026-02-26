Bullet 1

Bullet 2

VERIFICATION COMMANDS:

pytest

pnpm test

pnpm playwright test

CONSTRAINTS:

No placeholders

Structured logging

No schema changes without migration

Deterministic behavior

IMPLEMENTATION RULES:

Produce plan first

Wait for approval

Implement in batches

Run verification after each batch

9. What “Programming” Now Means

Programming is now:

Writing specs in English

Designing architecture boundaries

Designing verification harnesses

Managing concurrent agents

Reviewing diffs for taste

Deleting unnecessary complexity

The leverage is in abstraction management.

10. Escalation Policy

If agent:

Fails same test 3 times

Cannot determine architecture

Suggests large refactor without justification

Attempts unsafe change

Stop.

Re-spec the task with tighter constraints.

11. The Real Edge

The advantage is not that agents can type code.

The advantage is:

They can persist

They can retry

They can research

They can parallelize

They can execute with no fatigue

But only if the harness is correct.

12. Final Principle

Small.
Deterministic.
Verified.
Merged.

Repeat.