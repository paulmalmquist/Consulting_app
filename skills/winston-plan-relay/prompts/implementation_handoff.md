## Handoff scaffold — produce ONE Claude Code / Codex prompt

The handoff prompt you emit is what the user will paste into the target agent. It should be tight enough to fit in a single coding session and rich enough that the agent can execute without re-asking for context.

### Required sections in the handoff prompt

1. **Ticket scope** — one paragraph. What is being built. What is *not* being built (defer to later tickets).
2. **Files to touch** — absolute or repo-relative paths. Distinguish `create` vs `modify`. If unsure, name the directory and let the agent confirm.
3. **Acceptance criteria** — Screen / API / DB / AI / Evals / Regression Guard rows. Omit rows that genuinely don't apply.
4. **Constraints** — anything from system invariants that bites this ticket (RLS, authoritative state, portability, dirty-tree, no new env vars without a plan).
5. **Verification** — exact shell commands the agent should run to prove the change works. Prefer narrow tests + a smoke command over "run the full suite".
6. **Out of scope** — list what the agent must not touch in this session. This is the most important section for keeping scope tight.
7. **Reporting expectations** — at end of session, the agent should list: files changed, test results, plan-file updates, tips.md updates, commit hash, final status.

### Style for the handoff prompt
- No filler. No "please" or "kindly". No "as you can see".
- Imperative voice.
- Concrete paths and commands, not gestures.
- If a fact is uncertain, mark it `(verify before acting)` rather than asserting it.

### What NOT to put in the handoff prompt
- The full plan file content. The agent has the path; it can read it.
- Background motivation. Already in the plan's `## Context` section.
- Multiple tickets. One per handoff.
- Speculative "future work" notes.
