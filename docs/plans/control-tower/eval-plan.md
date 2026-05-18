# Control Tower — Eval Plan

## Golden paths
1. `/lab/system/control-tower` loads without error
2. Environment list renders with at least one environment
3. Environment detail shows name, type, status, and last updated
4. Create environment → provisioning begins → status updates
5. Switch to new environment → env_id updates in subsequent API calls

## Negative tests
- Request a non-existent environment → 404, not 500
- Request env from another tenant → 403, not data
- Provisioning fails mid-way → status shows `failed`, not stuck on `in-progress`

## Visual checks
- [ ] Status chips are high-contrast and readable without hover
- [ ] Environment list does not overflow at 1280px
- [ ] Provisioning progress indicator is visible

## AI answer evals
- Not applicable (minimal AI surface)

## Tool-call evals
- Create environment: confirmation gate appears before creation begins
- Delete environment: explicit warning + confirmation gate required

## Smoke test
```bash
curl -s http://localhost:8000/api/v1/lab/environments -H "Authorization: Bearer $TOKEN" | jq '.[] | .status'
```
- [ ] Returns list of environments with status field
