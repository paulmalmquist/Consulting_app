# Winston Plan Relay — Receipt (template)

> This is the template `relay.py` fills in. It is not used at runtime — `relay.py` writes the receipt directly. Kept here for reference and so reviewers know what to expect in `<out>.receipt.md`.

- **Input:** `<path>` (`<size>`)
- **Mode:** `<plan-review | route-and-plan | handoff-only | two-agent-loop>`
- **Target agent:** `<claude-code | codex | human>`
- **Reviewers requested:** `<list or (none)>`
- **Context files read:**
    - ✓ `WINSTON_CODING_SESSION_INSTRUCTIONS.md` (<size>)
    - ✓ `CLAUDE.md` (<size>)
    - ✓ `docs/plans/PLAN_MAINTENANCE_RULES.md` (<size>)
    - ✓ `docs/plans/00-dispatch/routing-map.md` (<size>)
- **Suggested next plan number:** `NNNN-<environment>-<short-title>.md` (route-and-plan only)
- **Output bundle:** `<path>`
- **Risks / assumptions flagged:**
    - …

## Next recommended command

```
<shell command the user should run next>
```
