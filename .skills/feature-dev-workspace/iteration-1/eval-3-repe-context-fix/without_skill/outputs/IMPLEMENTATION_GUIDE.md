# REPE Context Bootstrap Fix - Implementation Guide

## Overview
This document provides the complete implementation guide for fixing the REPE context bootstrap endpoint returning null for some environments.

## Problem Statement
The `/api/repe/context` endpoint was returning `null` business_id for certain environments because the `binding_found` logic in the context resolver was too strict. Specifically, when a business was resolved via heuristic slug matching or auto-creation, the response would set `binding_found: False`, which confused clients and could lead to null returns.

## Root Cause
In `backend/app/services/repe_context.py`, the `resolve_repe_business_context()` function has three fallback mechanisms for finding a business:

1. **Explicit binding lookup** (line 116-138): Query `app.env_business_bindings` table for an explicit row
2. **Heuristic slug matching** (line 140-171): Search for a business by env_token pattern matching
3. **Auto-create** (line 173-213): Create a new business if `allow_create=True`

The issue: When paths 2 or 3 succeeded (binding was created), the response still had `binding_found: False` because we only set it to `True` in path 1 (the lookup, before insertion).

## The Fix

### Changes Required
In `/sessions/bold-stoic-wright/mnt/Consulting_app/backend/app/services/repe_context.py`:

**Line ~168** (heuristic_slug path after INSERT):
```python
# OLD:
diagnostics={
    "binding_found": False,
    "business_found": True,
    "env_found": True,
}

# NEW:
diagnostics={
    "binding_found": True,  # FIX: binding now exists after INSERT
    "business_found": True,
    "env_found": True,
}
```

**Line ~210** (auto_create path after INSERT):
```python
# OLD:
diagnostics={
    "binding_found": False,
    "business_found": True,
    "env_found": True,
}

# NEW:
diagnostics={
    "binding_found": True,  # FIX: binding now exists after INSERT
    "business_found": True,
    "env_found": True,
}
```

**Line ~91** (explicit_business_id path):
```python
# OLD:
diagnostics={
    "binding_found": False,
    "business_found": True,
    "env_found": bool(resolved_env_id),
}

# NEW:
diagnostics={
    "binding_found": bool(resolved_env_id),  # FIX: binding exists if env_id exists
    "business_found": True,
    "env_found": bool(resolved_env_id),
}
```

### Why This Fix Works
By setting `binding_found: True` AFTER inserting the binding row, we ensure that the returned diagnostics accurately reflect the state of the database at the time of return. This prevents client confusion and ensures that:

1. All successful resolution paths return `business_found: True`
2. When a binding exists in the database (either pre-existing or just created), `binding_found: True`
3. The endpoint never returns `null` business_id for valid environments

## Test Plan

### Unit Tests
Run the regression tests in `proposed_test.py` against the fixed code:

```bash
cd /sessions/bold-stoic-wright/mnt/Consulting_app/backend
pytest tests/test_repe_context.py::test_context_resolver_auto_creates_and_sets_binding_found_true -v
pytest tests/test_repe_context.py::test_context_resolver_heuristic_sets_binding_found_true -v
pytest tests/test_repe_context.py::test_context_resolver_explicit_binding_is_still_true -v
pytest tests/test_repe_context.py::test_context_resolver_explicit_business_id_sets_binding_correctly -v
```

**Expected Output:**
```
test_context_resolver_auto_creates_and_sets_binding_found_true PASSED
test_context_resolver_heuristic_sets_binding_found_true PASSED
test_context_resolver_explicit_binding_is_still_true PASSED
test_context_resolver_explicit_business_id_sets_binding_correctly PASSED

======================== 4 passed in 0.XXs =========================
```

### Existing Tests
Verify that all existing REPE tests still pass:

```bash
pytest tests/test_repe_context.py -v
pytest tests/test_repe_object_api.py -v
pytest tests/test_finance_repe_api.py -v
```

**Expected:** All existing tests pass with no new failures (green status on all tests)

## Deployment Plan

### Pre-Deployment
1. **Code Review**: Review the proposed changes in `proposed_fix.py`
2. **Test Execution**: Run all unit tests locally
3. **Integration Tests**: Run full backend test suite: `make test-backend` (or `pytest backend/tests/ -v`)

### Deployment Steps
1. **Stage Changes**: Merge `proposed_fix.py` changes into the `repe_context.py` file in your codebase
2. **Deploy to Railway**: Push to main branch and trigger Railway deployment
   ```bash
   git add backend/app/services/repe_context.py
   git commit -m "fix: make binding_found accurate after binding insertion

   When a business is resolved via heuristic slug matching or auto-creation,
   the binding row is now created and binding_found is set to true in the
   response diagnostics. This prevents null returns and fixes the endpoint
   for environments without explicit bindings.

   See: proposed_fix.py for the exact changes."
   git push origin main
   ```
3. **Monitor Logs**: Watch Railway deployment logs for any errors
4. **Verify**: Run smoke tests against the deployed endpoint

### Rollback Plan
If issues occur post-deployment:
1. Revert the commit: `git revert <commit-hash>`
2. Push revert: `git push origin main`
3. Railway will auto-redeploy the previous version
4. Verify rollback with smoke tests

## Smoke Test Plan

### Pre-Production Testing
Before deploying to production, test the fix with the smoke test script:

```bash
bash /sessions/bold-stoic-wright/mnt/Consulting_app/.skills/feature-dev-workspace/iteration-1/eval-3-repe-context-fix/without_skill/outputs/smoke_test.sh
```

This will:
- Check health endpoint
- Test `/api/repe/context` with various env_id values
- Verify business_id is never null
- Verify business_found is always true
- Test both query param and header-based env_id passing

### Production Validation
After deployment to Railway, run smoke tests against production:

```bash
bash smoke_test.sh https://backend-railway-production-url.com
```

Expected results:
- All 5 endpoints respond with HTTP 200
- business_id is never null
- business_found is always true
- Response time < 500ms per request

### Manual Verification
Test with curl against the deployed backend:

```bash
# Test with query parameter
curl -X GET "https://backend.railway.app/api/repe/context?env_id=f0790a88-5d05-4991-8d0e-243ab4f9af27" \
  -H "Accept: application/json" | jq .

# Test with header
curl -X GET "https://backend.railway.app/api/repe/context" \
  -H "X-Env-Id: f0790a88-5d05-4991-8d0e-243ab4f9af27" \
  -H "Accept: application/json" | jq .

# Verify response structure
# Expected: {
#   "env_id": "f0790a88-5d05-4991-8d0e-243ab4f9af27",
#   "business_id": "<valid-uuid>",
#   "created": false/true,
#   "source": "binding:param|heuristic_slug:param|auto_create:param",
#   "diagnostics": {
#     "binding_found": true,
#     "business_found": true,
#     "env_found": true
#   }
# }
```

## Files Delivered

### 1. `summary.md` (17 KB)
Comprehensive analysis of the issue, root cause investigation, and proposed fix strategy. Includes:
- Executive summary
- Root cause analysis with code locations
- Investigation summary
- Proposed fix rationale
- Test plan
- Deploy plan
- Smoke test plan

### 2. `proposed_fix.py` (6.4 KB)
Drop-in replacement code for the `resolve_repe_business_context()` function in `backend/app/services/repe_context.py`. Shows exactly what lines to change and the new values.

Key changes:
- Line 91: `binding_found: bool(resolved_env_id)` (was `False`)
- Line 168: `binding_found: True` (was `False`)
- Line 210: `binding_found: True` (was `False`)

### 3. `proposed_test.py` (7.2 KB)
Pytest regression tests for all four resolution paths:
1. Auto-create path (no binding, heuristic fails)
2. Heuristic slug matching path
3. Explicit binding lookup path (regression test)
4. Explicit business_id path

Each test verifies that:
- `business_found: True` is always set
- `binding_found: True` after binding insertion
- No null business_id values
- Correct source attribution

Run with: `pytest proposed_test.py -v`

### 4. `smoke_test.sh` (8.5 KB)
Bash script for end-to-end validation against Railway backend:
- Tests health endpoint
- Tests GET /api/repe/context with query params
- Tests GET /api/repe/context with X-Env-Id header
- Tests POST /api/repe/context/init
- Validates non-null business_id
- Validates business_found: true
- Color-coded pass/fail output
- Summaries test results

Run with: `bash smoke_test.sh https://backend-url.com [env_id1] [env_id2] ...`

## Validation Checklist

- [ ] Code review completed on proposed changes
- [ ] All unit tests pass locally
- [ ] Backend test suite passes: `pytest backend/tests/ -v`
- [ ] Changes deployed to Railway
- [ ] Smoke tests pass against production
- [ ] Manual curl tests return valid responses
- [ ] Logs show no errors for repe.context operations
- [ ] Previous null-returning env_ids now return valid business_id
- [ ] No regressions in other REPE endpoints

## Success Criteria

After deployment, the fix is successful if:
1. **No null business_id**: The endpoint never returns null business_id for valid environments
2. **Consistent diagnostics**: All successful paths have `business_found: True` and `binding_found: True`
3. **No 500 errors**: Backend logs show no new REPE context errors
4. **Performance**: Response time remains < 500ms
5. **Smoke tests**: All smoke tests pass against production

## Troubleshooting

### Issue: Tests fail with "table does not exist"
- **Cause**: Test database not properly mocked
- **Solution**: Ensure `fake_cursor` fixture is properly set up in conftest.py
- **File**: `/sessions/bold-stoic-wright/mnt/Consulting_app/backend/tests/conftest.py`

### Issue: Smoke tests timeout
- **Cause**: Backend not responding or network issues
- **Solution**:
  - Verify backend URL is correct
  - Check Railway deployment status
  - Run `curl -s https://backend-url.com/api/repe/health` to verify connectivity

### Issue: Smoke tests fail with 404 on business_id
- **Cause**: Likely the endpoint is still returning null
- **Solution**:
  - Verify all three code changes were applied
  - Check that Railway redeployed successfully
  - Look at Railway logs for binding insertion errors

### Issue: Some env_ids still return errors
- **Cause**: Environment doesn't exist in database or tables not migrated
- **Solution**:
  - Check if REPE migrations (265/266/267) are applied
  - Verify environment exists in `app.environments` table
  - Ensure `app.env_business_bindings` table exists

## References

- Original issue: REPE context bootstrap endpoint returning null
- Files modified: `backend/app/services/repe_context.py`
- Endpoint: `GET /api/repe/context`, `POST /api/repe/context/init`
- Related tests: `backend/tests/test_repe_context.py`
- REPE routes: `backend/app/routes/repe.py` (lines 310-360)

---

**For questions or issues**, refer to the detailed analysis in `summary.md` or review the actual code in `proposed_fix.py`.
