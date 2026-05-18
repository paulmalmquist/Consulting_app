# Regression Suite

These are the behaviors that must never break. They are checked after every deploy and after any change to shared code.

## Never-break list

### Auth and session
- [ ] Login with valid credentials succeeds
- [ ] Login with invalid credentials returns 401 (not 500)
- [ ] Logout clears session
- [ ] Expired session redirects to login (not blank page)
- [ ] Environment switch updates env_id correctly

### AI gateway
- [ ] Gateway health endpoint returns 200
- [ ] A simple query returns a response with terminal_status: complete
- [ ] A refused query returns terminal_status: refused (not error)
- [ ] A null response returns null_reason (not empty string)

### Authoritative state (REPE)
- [ ] `verification/lint/no_legacy_repe_reads.py` passes
- [ ] `backend/tests/test_state_lock_invariants.py` passes
- [ ] Fund detail page shows IRR via authoritative state (not computed inline)

### Confirmation and receipts
- [ ] Write operation surfaces confirmation gate (not bypassed)
- [ ] Confirmed write produces receipt
- [ ] Cancelled write does not execute

### Tenant isolation
- [ ] API with env_id_A does not return data from env_id_B
- [ ] Unauthenticated API request returns 401 (not data)

### Shell and navigation
- [ ] At least one environment loads without shell errors
- [ ] Environment name visible in shell
- [ ] Top nav renders within shell bounds (no overflow)

## How to run

```bash
# State lock invariants
cd backend && python -m pytest tests/test_state_lock_invariants.py -v

# Legacy read lint
python verification/lint/no_legacy_repe_reads.py

# Backend test suite
cd backend && python -m pytest tests/ -v

# Playwright suite (when configured)
cd repo-b && npx playwright test
```

## Regression fail protocol

If any regression check fails after a deploy:
1. Do NOT mark the deploy as successful
2. Identify the exact change that caused the failure
3. Fix forward or revert the specific change
4. Rerun the regression suite
5. Add the regression to the environment's `eval-plan.md` so it is tracked going forward
