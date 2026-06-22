## Implementation handoff scaffold

**Write the handoff prompt now.** This section defines the structure to use — it is not a checklist to summarize back. Your output for this part of the response is the actual prompt the user will paste into the target agent. The agent reading it has not seen this conversation.

Produce a single prompt with these sections, in this order:

1. **Ticket scope** — one paragraph. What is being built this session. State what is *not* being built (deferred to later tickets).
2. **Files to touch** — repo-relative or absolute paths. Mark each `create` or `modify`. If a path is uncertain, name the directory and write `(confirm before editing)`.
3. **Acceptance criteria** — Screen / API / DB / AI / Evals / Regression Guard rows. Omit a row only when it genuinely does not apply; do not leave silent gaps.
4. **Constraints** — the specific system invariants that bite this ticket (RLS, authoritative-state lock, portability, dirty-tree discipline, no new env vars without a deploy plan). Name only the ones that apply.
5. **Verification** — exact shell commands the agent runs to prove the change works. Prefer the narrowest tests plus one smoke command over "run the full suite".
6. **Out of scope** — explicit list of what the agent must not touch this session. This is the section that keeps scope tight; do not skip it.
7. **Reporting expectations** — instruct the agent to end with: files changed, test results, plan-file updates, tips.md updates, commit hash, final status.

### Rules for the handoff prompt you write
- Imperative voice. No "please", no "kindly", no "as you can see".
- Concrete paths and commands, never gestures.
- Mark any uncertain fact `(verify before acting)` instead of asserting it.
- One ticket per handoff. Never bundle multiple tickets.
- Do not paste the full plan file into the prompt — the agent has the path and can read it.
- Do not restate background motivation — it is already in the plan's `## Context`.
- Do not include speculative "future work" notes.

### Output shape
Emit the handoff prompt as a single fenced block so the user can copy it cleanly. Nothing after it except, if the mode calls for it, a one-line deferral note.
