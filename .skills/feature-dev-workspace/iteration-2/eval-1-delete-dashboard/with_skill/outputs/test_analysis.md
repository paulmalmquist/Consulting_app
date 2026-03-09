# Test Analysis: DELETE Dashboard Endpoint

## Test Framework
- **Framework**: Vitest with mocking
- **Pattern**: Following existing repo-b test patterns (`/api/repe/funds/[fundId]/route.test.ts`)
- **Mock Strategy**: `vi.mock()` for database pool, individual query mocking

## Test File Location
- **File**: `repo-b/src/app/api/re/v2/dashboards/[dashboardId]/route.test.ts`
- **Handler**: `repo-b/src/app/api/re/v2/dashboards/[dashboardId]/route.ts`

## Test Cases (6 total)

### 1. Successful Delete (200)
```typescript
test("deletes a dashboard and returns 200 on success")
```
**Setup**:
- Mock pool.query to return 1 row for verify query
- Mock pool.query to return rowCount: 1 for delete query

**Assertions**:
- Response status = 200
- Response body: `{ success: true, id: "dash-123" }`
- Both verify and delete queries are called with correct parameters

**Expected Execution**:
1. Verify query: `SELECT id FROM re_dashboard WHERE id = $1 AND env_id = $2 AND business_id = $3::uuid`
2. Delete query: `DELETE FROM re_dashboard WHERE id = $1`

---

### 2. Dashboard Not Found (404)
```typescript
test("returns 404 when dashboard not found")
```
**Setup**:
- Mock verify query to return 0 rows (dashboard doesn't exist)

**Assertions**:
- Response status = 404
- Response body contains error message mentioning "Dashboard not found"
- Delete query is never called (stops at verify)

---

### 3. Missing dashboardId Parameter (400)
```typescript
test("returns 400 when dashboardId is missing")
```
**Setup**:
- dashboardId = "" (empty string)

**Assertions**:
- Response status = 400
- Response body error contains "required"
- No database queries executed

---

### 4. Missing env_id Query Param (400)
```typescript
test("returns 400 when env_id is missing")
```
**Setup**:
- URL lacks env_id param

**Assertions**:
- Response status = 400
- Response body error contains "required"
- No database queries executed

---

### 5. Missing business_id Query Param (400)
```typescript
test("returns 400 when business_id is missing")
```
**Setup**:
- URL lacks business_id param

**Assertions**:
- Response status = 400
- Response body error contains "required"
- No database queries executed

---

### 6. Database Unavailable (503)
```typescript
test("returns 503 when database is unavailable")
```
**Setup**:
- getPool() returns null

**Assertions**:
- Response status = 503
- Response body error = "Database unavailable"

---

### 7. Query Error (500)
```typescript
test("returns 500 on query error")
```
**Setup**:
- pool.query throws error

**Assertions**:
- Response status = 500
- Response body error = "Failed to delete dashboard"

---

## Expected Test Execution Command
```bash
cd repo-b
npm run test:unit -- src/app/api/re/v2/dashboards/[dashboardId]/route.test.ts
```

## Expected Output
```
✓ src/app/api/re/v2/dashboards/[dashboardId]/route.test.ts (6 tests)
  DELETE /api/re/v2/dashboards/[dashboardId]
    ✓ deletes a dashboard and returns 200 on success
    ✓ returns 404 when dashboard not found
    ✓ returns 400 when dashboardId is missing
    ✓ returns 400 when env_id is missing
    ✓ returns 400 when business_id is missing
    ✓ returns 503 when database is unavailable
    ✓ returns 500 on query error

Test Files  1 passed (1)
     Tests  7 passed (7)
  Start at  14:59:00
  Duration  245ms
```

## Code Quality Checks

### Pattern Compliance
- ✓ Follows existing test patterns from `repo-b/src/app/api/repe/funds/[fundId]/route.test.ts`
- ✓ Uses vi.mock pattern for dependency injection
- ✓ Properly mocks getPool() from @/lib/server/db
- ✓ Mock queries return appropriate { rows, rowCount } structures

### Database Safety
- ✓ Verify query checks env_id and business_id ownership
- ✓ Uses parametrized queries ($1, $2, $3) to prevent SQL injection
- ✓ Proper UUID casting (::uuid)
- ✓ DELETE uses cascade constraints (schema guarantees)

### Error Handling
- ✓ 400: Input validation (missing params)
- ✓ 404: Resource not found
- ✓ 503: Database unavailable
- ✓ 500: Unexpected database errors
- ✓ All errors logged to console

### HTTP Standards
- ✓ OPTIONS handler returns Allow header with correct methods
- ✓ DELETE returns 200 on success, not 201 (follows REST conventions)
- ✓ Proper status codes for all error cases

## Mocking Strategy Notes

The test uses `vi.mock()` which:
1. **Replaces** the entire `@/lib/server/db` module globally
2. **Returns** a custom getPool function from mockGetPool
3. **Tracks** all calls via vi.fn() for verification

This approach matches the FakeCursor pattern mentioned in CLAUDE.md:
- "FakeCursor pattern: all backend tests mock the DB layer"
- Proves routes and schemas are correct without real DB
- No real database connection needed for these tests
