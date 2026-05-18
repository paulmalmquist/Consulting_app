# Coding Session Handoff — [Environment]

**Date:** YYYY-MM-DD  
**Session completed by:** [Claude Code / Codex / manual]  
**Status after session:** [In progress / Blocked / Ready for QA / Done]

## Session objective
What this session set out to do.

## What was completed
- [ ] (list completed items with file paths)

## What was not completed
- [ ] (list incomplete items and why)

## Files changed
- `path/to/file.py` — what changed and why
- `path/to/component.tsx` — what changed and why

## Files likely involved in next session
- `path/to/...` — why
- `path/to/...` — why

## Required reading before next session
- `docs/plans/[environment]/architecture.md`
- `docs/plans/[environment]/backlog.md`
- (add any relevant docs or plans)

## Step-by-step plan for next session
1. (specific step with file path)
2. (specific step with file path)
3. (specific step with file path)

## Acceptance criteria for next session
- [ ] (specific, testable outcome)
- [ ] (specific, testable outcome)

## Tests to run
```bash
# Example — replace with actual commands
cd backend && python -m pytest tests/test_[module].py -v
cd repo-b && npx playwright test [test-file]
```

## What to screenshot or verify in browser
- URL: `/lab/env/[envId]/[path]`
- Expected: (what should appear)
- Not expected: (what should not appear)

## Rollback plan
If the session breaks something:
- `git revert HEAD` or specific files to restore
- Database: (any migration rollback needed?)

## Expected final response format
When the session is done, the handoff note should include:
- Summary of what changed
- Updated next-session.md content
- Any new backlog items
- Any new tips.md content

## Update tips.md if you discover
- A non-obvious repo behavior
- A command that took multiple attempts to get right
- A gotcha that would have cost the next session 20 minutes
