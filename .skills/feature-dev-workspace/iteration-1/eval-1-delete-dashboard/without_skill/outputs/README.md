# DELETE Endpoint for Saved Dashboards

This directory contains the complete implementation proposal for adding a DELETE endpoint to remove saved dashboards from the dashboard gallery.

## Quick Summary

**What**: Add `DELETE /api/re/v2/dashboards/[dashboardId]` endpoint to remove saved dashboards
**Where**: New file at `/src/app/api/re/v2/dashboards/[dashboardId]/route.ts`
**Why**: Allow users to delete dashboards from the gallery UI
**Status**: 100% complete - ready for code review and integration

## Files in This Directory

| File | Size | Purpose |
|------|------|---------|
| `summary.md` | 4.7 KB | Architecture overview, design decisions, deployment plan |
| `proposed_route.ts` | 1.6 KB | **The DELETE handler code** - ready to copy to repo |
| `proposed_test.ts` | 7.3 KB | **Complete test suite** - 8 comprehensive test cases |
| `smoke_test.sh` | 4.8 KB | **Production smoke test** - creates, verifies, and deletes a test dashboard |
| `FILES_CREATED.txt` | 5.6 KB | Detailed manifest and reference |
| `README.md` | This file | Quick reference guide |

## Implementation at a Glance

### The Route Handler (proposed_route.ts)

```typescript
DELETE /api/re/v2/dashboards/[dashboardId]
```

**Response on Success:**
- Status: `204 No Content`
- Body: Empty

**Response on Error:**
- `404`: Dashboard not found → `{ "error": "Dashboard not found" }`
- `503`: Database unavailable → `{ "error": "Database unavailable" }`
- `500`: Database error → `{ "error": "Failed to delete dashboard" }`

### Key Implementation Details

✓ **SQL Injection Prevention**: Parameterized queries (`$1`, `$2`)
✓ **Cascade Delete**: Uses PostgreSQL `ON DELETE CASCADE` (no app logic)
✓ **Idempotent**: Returns 204 on success (standard REST pattern)
✓ **Error Handling**: Distinguishes 404 from 500
✓ **Two-Stage Delete**: Verify existence first, then delete

### Related Database Tables

The `re_dashboard` table has three related tables with cascade delete:

```
re_dashboard
├── re_dashboard_favorite (ON DELETE CASCADE)
├── re_dashboard_subscription (ON DELETE CASCADE)
└── re_dashboard_export (ON DELETE CASCADE)
```

All cascade constraints are already in the schema - **no migrations needed**.

## Testing

### Unit Tests (proposed_test.ts)

Run with:
```bash
npm run test:unit -- src/app/api/re/v2/dashboards/[dashboardId]/route.test.ts
```

**8 test cases:**
1. ✓ Successful delete (204 No Content)
2. ✓ Dashboard not found (404)
3. ✓ Database unavailable (503)
4. ✓ Database error (500)
5. ✓ Malformed UUID handling
6. ✓ Cascade delete verification
7. ✓ OPTIONS method
8. ✓ Related records cleanup

### Smoke Test (smoke_test.sh)

Run after deployment:
```bash
# Default: http://localhost:3000
bash smoke_test.sh

# Custom URL:
BASE_URL=https://staging.example.com bash smoke_test.sh
```

**Test flow:**
1. Create a test dashboard via POST
2. Verify it exists via GET list
3. Delete it via DELETE (main test)
4. Verify it's gone via GET list
5. Test 404 on non-existent ID

## How to Integrate

### Step 1: Copy the Route Handler
Copy `proposed_route.ts` to:
```
/repo-b/src/app/api/re/v2/dashboards/[dashboardId]/route.ts
```

### Step 2: Add Tests
Copy `proposed_test.ts` to:
```
/repo-b/src/app/api/re/v2/dashboards/[dashboardId]/route.test.ts
```

### Step 3: Run Tests
```bash
npm run test:unit
```

### Step 4: Frontend Integration
In `/src/app/lab/env/[envId]/re/dashboards/page.tsx`, add a delete button:
```typescript
const handleDelete = async (dashboardId: string) => {
  const res = await fetch(`/api/re/v2/dashboards/${dashboardId}`, {
    method: "DELETE"
  });
  if (res.ok) {
    // Refetch dashboard list
  } else {
    // Show error toast
  }
};
```

### Step 5: Deploy & Test
```bash
# Deploy to staging
git push origin feature-delete-dashboard

# Run smoke test
bash smoke_test.sh
```

## API Contract

### Request
```http
DELETE /api/re/v2/dashboards/550e8400-e29b-41d4-a716-446655440000
```

### Success Response (204)
```
HTTP/1.1 204 No Content
```

### Error Responses
```http
404 Not Found
Content-Type: application/json
{ "error": "Dashboard not found" }
```

```http
503 Service Unavailable
Content-Type: application/json
{ "error": "Database unavailable" }
```

```http
500 Internal Server Error
Content-Type: application/json
{ "error": "Failed to delete dashboard" }
```

## Related Endpoints (Already Exist)

The new DELETE endpoint complements these existing endpoints:

```
GET    /api/re/v2/dashboards?env_id=...&business_id=...
POST   /api/re/v2/dashboards
GET    /api/re/v2/dashboards/[dashboardId]/export
GET    /api/re/v2/dashboards/[dashboardId]/subscribe
POST   /api/re/v2/dashboards/[dashboardId]/subscribe
DELETE /api/re/v2/dashboards/[dashboardId]/subscribe
```

## Architecture Patterns Used

This implementation follows existing patterns from the codebase:

**Similar to**: `subscribe/route.ts`
- Uses `getPool()` from `@/lib/server/db`
- Parameterized SQL queries
- Consistent error handling
- 200/404/500 response codes

**Simpler than**: `funds/[fundId]/route.ts`
- Single DELETE statement (vs. complex cascading)
- No custom cascade logic needed (DB handles it)
- No transaction management required

**Consistent with**: All other dashboard endpoints
- Same response shape
- Same error format
- Same logging pattern

## Deployment Checklist

- [ ] Code review: Check `proposed_route.ts` for:
  - SQL injection prevention (parameterized queries)
  - Error handling
  - Response codes
  - Alignment with patterns

- [ ] Test review: Verify `proposed_test.ts` covers:
  - Happy path (204)
  - 404 when not found
  - 503 when DB unavailable
  - 500 on errors

- [ ] Unit tests: `npm run test:unit`

- [ ] Deploy to staging

- [ ] Run smoke test: `bash smoke_test.sh`

- [ ] Frontend integration: Add delete button to gallery

- [ ] Deploy to production

## FAQ

**Q: Do we need a database migration?**
A: No. The `re_dashboard` table already exists with proper `ON DELETE CASCADE` constraints.

**Q: What happens to related records (favorites, subscriptions, exports)?**
A: PostgreSQL handles it automatically via `ON DELETE CASCADE` constraints. When you delete a dashboard, all related records are deleted by the database.

**Q: Why return 204 instead of 200?**
A: 204 No Content is the standard HTTP response for successful DELETE operations. It indicates success with no response body.

**Q: Is this endpoint idempotent?**
A: The first DELETE returns 204. Subsequent DELETEs of the same ID return 404. This is the standard REST behavior.

**Q: What about authorization?**
A: This endpoint follows the existing pattern - authorization is handled by application-level middleware, not in the route handler.

## Files Checklist

- [x] `summary.md` - Complete documentation
- [x] `proposed_route.ts` - Route handler (54 lines)
- [x] `proposed_test.ts` - Test suite (220 lines, 8 tests)
- [x] `smoke_test.sh` - Integration test (shell script)
- [x] `FILES_CREATED.txt` - Detailed manifest
- [x] `README.md` - This file

## Next Steps

1. Review all files in this directory
2. Verify the implementation approach with team
3. Copy files to repository
4. Run tests
5. Integrate frontend delete button
6. Deploy to production

## Support

For questions about:
- **Implementation details**: See `summary.md`
- **Test coverage**: See `proposed_test.ts`
- **Production testing**: See `smoke_test.sh`
- **File locations**: See `FILES_CREATED.txt`
