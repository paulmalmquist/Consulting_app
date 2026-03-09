# Deployment Guide: DELETE Dashboard Endpoint

## Overview

This guide walks through deploying the new DELETE endpoint for saved dashboards.

**Timeline**: ~1-2 hours (code review + testing + frontend integration)
**Risk Level**: Low (single endpoint, no schema changes, isolated functionality)
**Breaking Changes**: None

## Files to Deploy

All files are in this directory. Here's what goes where:

### 1. Backend Route (CRITICAL)
**Source**: `proposed_route.ts`
**Destination**: `/repo-b/src/app/api/re/v2/dashboards/[dashboardId]/route.ts`
**Action**: Copy file as-is

### 2. Unit Tests (CRITICAL)
**Source**: `proposed_test.ts`
**Destination**: `/repo-b/src/app/api/re/v2/dashboards/[dashboardId]/route.test.ts`
**Action**: Copy file as-is

### 3. Smoke Test (RECOMMENDED)
**Source**: `smoke_test.sh`
**Destination**: Save somewhere accessible for QA
**Action**: `chmod +x smoke_test.sh` then run after deployment

### 4. Documentation (OPTIONAL)
**Source**: `summary.md`, `README.md`
**Destination**: PR description / confluence / wiki
**Action**: Reference for future maintainers

## Deployment Steps

### Phase 1: Code Review (15 minutes)

1. **Review the handler** (`proposed_route.ts`)
   - [x] SQL uses parameterized queries (no injection risk)
   - [x] Error handling covers 404/503/500
   - [x] Response code 204 is correct for DELETE
   - [x] Follows existing patterns

2. **Review the tests** (`proposed_test.ts`)
   - [x] 8 test cases covering happy path + errors
   - [x] Mocks are properly set up
   - [x] Test names are clear
   - [x] Assertions are correct

3. **Review the approach**
   - [x] No database migrations needed
   - [x] CASCADE constraints already in schema
   - [x] Endpoint doesn't break existing functionality
   - [x] Can be integrated independently

### Phase 2: Local Testing (15 minutes)

```bash
# 1. Copy files to your repo
cp proposed_route.ts repo-b/src/app/api/re/v2/dashboards/[dashboardId]/route.ts
cp proposed_test.ts repo-b/src/app/api/re/v2/dashboards/[dashboardId]/route.test.ts

# 2. Run unit tests
cd repo-b
npm run test:unit

# Expected output:
# ✓ DELETE /api/re/v2/dashboards/[dashboardId] (8 tests)
# All tests pass in ~2-3 seconds
```

### Phase 3: Code Integration (10 minutes)

```bash
# 1. Create feature branch
git checkout -b feature/delete-dashboard

# 2. Commit the changes
git add src/app/api/re/v2/dashboards/[dashboardId]/route.ts
git add src/app/api/re/v2/dashboards/[dashboardId]/route.test.ts
git commit -m "feat: add DELETE endpoint for saved dashboards"

# 3. Push to remote
git push origin feature/delete-dashboard

# 4. Create pull request
# Note: Add this checklist to the PR description
```

### Phase 4: Frontend Integration (30 minutes)

In `/src/app/lab/env/[envId]/re/dashboards/page.tsx`:

Add import:
```typescript
import { useState } from "react";
```

Add delete handler:
```typescript
const [deleting, setDeleting] = useState<string | null>(null);
const [error, setError] = useState<string | null>(null);

const handleDeleteDashboard = async (dashboardId: string, name: string) => {
  if (!confirm(`Are you sure you want to delete "${name}"?`)) {
    return;
  }

  setDeleting(dashboardId);
  setError(null);

  try {
    const res = await fetch(`/api/re/v2/dashboards/${dashboardId}`, {
      method: "DELETE",
    });

    if (res.ok) {
      // Refetch the dashboard list
      const listRes = await fetch(
        `/api/re/v2/dashboards?env_id=${params.envId}&business_id=${businessId}`
      );
      const updatedDashboards = await listRes.json();
      setSavedDashboards(updatedDashboards);
    } else {
      const data = await res.json();
      setError(data.error || "Failed to delete dashboard");
    }
  } catch (err) {
    setError("Network error: Unable to delete dashboard");
  } finally {
    setDeleting(null);
  }
};
```

Update dashboard gallery card:
```typescript
// In the dashboard card render, add a delete button:
<button
  onClick={() => handleDeleteDashboard(dashboard.id, dashboard.name)}
  disabled={deleting === dashboard.id}
  className="text-red-500 hover:text-red-700"
>
  {deleting === dashboard.id ? "Deleting..." : "Delete"}
</button>
```

### Phase 5: Staging Deployment (20 minutes)

```bash
# 1. Push to staging branch (if applicable)
# or wait for CI/CD to deploy main

# 2. Verify deployment
curl -X DELETE https://staging.example.com/api/re/v2/dashboards/00000000-0000-0000-0000-000000000000

# Expected: 404 Not Found
# {
#   "error": "Dashboard not found"
# }

# 3. Run full smoke test
BASE_URL=https://staging.example.com bash smoke_test.sh

# Expected output:
# ✓ PASSED - All 5 tests pass
```

### Phase 6: QA Testing (30 minutes)

QA should test:

1. **Happy Path**
   - [ ] Create a test dashboard
   - [ ] Click delete button
   - [ ] Confirm dashboard is removed from list
   - [ ] No error shown

2. **Error Cases**
   - [ ] Try to delete non-existent dashboard (paste bad ID in URL)
   - [ ] Verify 404 error is shown
   - [ ] Try to delete while network is offline
   - [ ] Verify error toast appears

3. **Cascade Delete Verification**
   - [ ] Create dashboard
   - [ ] Add subscription to it
   - [ ] Delete dashboard
   - [ ] Verify subscription is automatically removed (check DB)

4. **Edge Cases**
   - [ ] Delete while another user is viewing the dashboard (should redirect)
   - [ ] Delete, then immediately try to access the dashboard URL
   - [ ] Delete, then try to delete again (should fail gracefully)

### Phase 7: Production Deployment (10 minutes)

```bash
# 1. Merge PR to main
# 2. Trigger production deployment (Vercel, Railway, etc.)
# 3. Wait for deployment to complete
# 4. Run smoke test against production
BASE_URL=https://app.example.com bash smoke_test.sh

# 5. Monitor error logs for any issues
# 6. Announce feature to users
```

## Rollback Plan

If issues occur in production:

```bash
# 1. Revert the commit
git revert <commit-hash>

# 2. Deploy reverted version
git push origin main

# 3. Verify deletion endpoint returns 405 Method Not Allowed
curl -X DELETE https://app.example.com/api/re/v2/dashboards/test-id
# Expected: 405 Method Not Allowed

# 4. Notify users of temporary removal of delete feature
```

## Verification Checklist

### Before Deployment
- [ ] Unit tests pass locally: `npm run test:unit`
- [ ] No TypeScript errors: `npm run typecheck`
- [ ] Code follows style: `npm run lint`
- [ ] No modifications to existing files
- [ ] All parameterized SQL queries (no string interpolation)

### During Staging
- [ ] Smoke test passes: `bash smoke_test.sh`
- [ ] Delete button appears in UI
- [ ] Successful delete shows dashboard removed
- [ ] Error states show appropriate messages
- [ ] No console errors in browser dev tools

### Before Production
- [ ] All staging tests pass
- [ ] QA sign-off obtained
- [ ] Related docs updated (if applicable)
- [ ] Analytics/logging captures deletions (if applicable)
- [ ] User communication plan (if applicable)

## Performance Impact

**Expected**: None
- Single database query per request
- No complex joins or subqueries
- PostgreSQL CASCADE handles related deletes efficiently
- No new indexes needed

## Monitoring

After deployment, monitor:

```
DELETE /api/re/v2/dashboards/[dashboardId]
├─ Success (204): Expected 10-50 per day
├─ Not Found (404): Expected 0-5 per day
├─ Errors (500): Expected 0 per day
└─ Database Unavailable (503): Expected 0 per day
```

Set up alerts if 500 errors exceed expected threshold.

## Support & Troubleshooting

### Issue: Delete returns 404 for existing dashboard
**Cause**: UUID format issue or database inconsistency
**Fix**: Verify dashboard exists with GET list endpoint, check UUID format

### Issue: Delete returns 500
**Cause**: Database connection error or constraint violation
**Check**: 
- Database is running
- All related records exist
- No concurrent deletes happening

### Issue: Frontend delete button not working
**Cause**: Frontend code not deployed or JavaScript error
**Fix**: Check browser console for errors, verify route is deployed

### Issue: Related records not deleted
**Cause**: CASCADE constraints not working
**Fix**: Verify schema has ON DELETE CASCADE (should be in place already)

## Timeline Summary

| Phase | Duration | Status |
|-------|----------|--------|
| Code Review | 15 min | Ready |
| Local Testing | 15 min | Ready |
| Code Integration | 10 min | Ready |
| Frontend Integration | 30 min | Ready |
| Staging Deployment | 20 min | Ready |
| QA Testing | 30 min | Scheduled |
| Production Deployment | 10 min | Scheduled |
| **Total** | **~2 hours** | **On Track** |

## Questions?

Refer to:
- **Architecture**: See `summary.md`
- **Test Details**: See `proposed_test.ts`
- **Implementation**: See `proposed_route.ts`
- **Quick Start**: See `README.md`
