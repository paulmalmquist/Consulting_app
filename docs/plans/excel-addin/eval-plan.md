# Excel Add-in — Eval Plan

## Golden paths
1. Add-in loads in Excel Online without errors
2. Auth flow completes → task pane shows signed-in state
3. At least one custom function returns real data in a cell
4. Write operation: user initiates → confirmation shown → cell(s) updated → status confirmed

## Negative tests
- Auth expired → task pane shows re-auth prompt, not a blank or error state
- Custom function called with invalid parameters → cell shows readable error string (not #VALUE!)
- Write fails mid-way → no partial write, all cells revert to prior value

## Visual checks
- [ ] Task pane renders correctly at 320px width
- [ ] Auth state visible in header
- [ ] Write queue status visible without scrolling

## AI answer evals
- Not applicable (minimal AI surface in add-in)

## Tool-call evals
- Write cells: confirmation shown before any cell update
- Write failure: atomic rollback verified

## Smoke test
- Manual: load add-in in Excel Online, verify sign-in button appears
- API: `curl -s http://localhost:8000/api/v1/lab/excel/... -H "Authorization: Bearer $TOKEN"` (endpoint TBD after verification)
