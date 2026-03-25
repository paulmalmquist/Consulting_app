# Financial Intelligence Layer - ChatGPT Agent Role-Playing Test

**Purpose**: Validate the complete financial intelligence implementation through a realistic end-to-end workflow that a ChatGPT agent can execute autonomously.

**Duration**: ~15-20 minutes

**Prerequisites**:
- Backend running on `http://localhost:8000`
- Frontend running on `http://localhost:3000`
- Database initialized with migration 278
- Test environment configured: `env_id=test-env`, `business_id=<uuid>`

---

## Scenario: Quarterly Financial Close for Real Estate Fund

You are a financial analyst closing out Q1 2026 for a real estate fund. The fund has:
- **Fund**: "Dallas Multifamily Cluster" (equity strategy)
- **Assets**: 2 apartment complexes
- **Debts**: One bridge loan (for testing covenant controls)

Your tasks:
1. Seed realistic test data
2. Validate accounting imports
3. Run variance analysis
4. Compute return metrics
5. Run covenant tests on debt fund
6. Verify all data in UI

---

## Phase 1: Setup & Data Seeding

### Task 1.1: Create Test Fund and Seed Data
**Objective**: Establish initial test data via API

```bash
curl -X POST http://localhost:8000/api/re/v2/fi/seed \
  -H "Content-Type: application/json" \
  -d '{
    "env_id": "test-env",
    "business_id": "11111111-1111-1111-1111-111111111111",
    "fund_id": "22222222-2222-2222-2222-222222222222",
    "debt_fund_id": "33333333-3333-3333-3333-333333333333"
  }'
```

**Expected Response**: HTTP 200 with:
```json
{
  "status": "success",
  "chart_of_accounts_seeded": 13,
  "mapping_rules_seeded": 13,
  "budgets_seeded": 12,
  "actuals_seeded": 12,
  "fee_policies_seeded": 1,
  "cash_events_seeded": 3,
  "fund_expenses_seeded": 1,
  "loans_seeded": 1,
  "covenants_seeded": 3
}
```

**Validation Points**:
- ✅ Chart of accounts created (RENT, PAYROLL, UTILITIES, etc.)
- ✅ Mapping rules normalize GL codes to NOI lines
- ✅ Budget seeded for Jan-Jun 2026
- ✅ Actual actuals seeded with realistic variance (±5-15%)
- ✅ Fee policy created (1.5% annually on committed capital)
- ✅ Cash events created (capital calls, distributions, fees)
- ✅ Fund expenses seeded ($45K per quarter)
- ✅ Loan created with 3 covenant definitions (DSCR, LTV, Debt Yield)

---

## Phase 2: Accounting Layer

### Task 2.1: Import GL Actuals and Verify Normalization
**Objective**: Verify accounting import + NOI normalization

```bash
curl -X POST http://localhost:8000/api/re/v2/accounting/import \
  -H "Content-Type: application/json" \
  -d '{
    "env_id": "test-env",
    "business_id": "11111111-1111-1111-1111-111111111111",
    "source_name": "sage_intacct",
    "payload": [
      {
        "asset_id": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
        "period_month": "2026-01-01",
        "gl_account": "4000",
        "amount": 86700
      },
      {
        "asset_id": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
        "period_month": "2026-01-01",
        "gl_account": "5000",
        "amount": 12000
      }
    ]
  }'
```

**Expected Response**: HTTP 200
```json
{
  "source_name": "sage_intacct",
  "source_hash": "abc123def456...",
  "rows_loaded": 2
}
```

**Validation Points**:
- ✅ GL balances stored in `acct_gl_balance_monthly`
- ✅ Source hash generated (SHA256 of payload)
- ✅ Normalization applied: GL 4000 → RENT, GL 5000 → PAYROLL
- ✅ Can query normalized NOI via variance endpoint

---

## Phase 3: Variance Analysis

### Task 3.1: Query NOI Variance (Actual vs Plan)
**Objective**: Verify variance computation for Q1 2026

```bash
curl -X GET "http://localhost:8000/api/re/v2/variance/noi?env_id=test-env&business_id=11111111-1111-1111-1111-111111111111&fund_id=22222222-2222-2222-2222-222222222222&quarter=2026Q1"
```

**Expected Response**: HTTP 200
```json
{
  "items": [
    {
      "id": "v1-uuid",
      "run_id": "run-uuid",
      "asset_id": "asset-uuid",
      "quarter": "2026Q1",
      "line_code": "RENT",
      "actual_amount": 86700,
      "plan_amount": 85000,
      "variance_amount": 1700,
      "variance_pct": 0.02
    },
    {
      "id": "v2-uuid",
      "run_id": "run-uuid",
      "asset_id": "asset-uuid",
      "quarter": "2026Q1",
      "line_code": "PAYROLL",
      "actual_amount": -12600,
      "plan_amount": -12000,
      "variance_amount": -600,
      "variance_pct": -0.05
    }
  ],
  "rollup": {
    "total_actual": "74100",
    "total_plan": "73000",
    "total_variance": "1100",
    "total_variance_pct": "0.0150"
  }
}
```

**Validation Points**:
- ✅ Items array contains per-line-code variance
- ✅ Actual amounts match seeded actuals
- ✅ Plan amounts match budget
- ✅ Variance amounts computed correctly (actual - plan)
- ✅ Variance % computed correctly and handles divide-by-zero
- ✅ Rollup shows totals across all line codes
- ✅ Total variance = $1,100 (1.5% of plan)

---

## Phase 4: Return Metrics & Gross-Net Bridge

### Task 4.1: Run Quarter Close (Full Financial Close)
**Objective**: Trigger complete Q1 2026 close with all computations

```bash
curl -X POST http://localhost:8000/api/re/v2/runs/quarter_close \
  -H "Content-Type: application/json" \
  -d '{
    "env_id": "test-env",
    "business_id": "11111111-1111-1111-1111-111111111111",
    "fund_id": "22222222-2222-2222-2222-222222222222",
    "quarter": "2026Q1"
  }'
```

**Expected Response**: HTTP 200
```json
{
  "status": "success",
  "run_id": "run-uuid",
  "run_type": "QUARTER_CLOSE",
  "quarter": "2026Q1",
  "fund_id": "22222222-2222-2222-2222-222222222222",
  "created_at": "2026-02-26T...",
  "outputs": {
    "variance_computed": true,
    "metrics_computed": true,
    "bridge_computed": true
  }
}
```

**Validation Points**:
- ✅ Run created with status='success'
- ✅ run_id is UUID
- ✅ run_type = QUARTER_CLOSE
- ✅ Variance computed (NOI actuals vs plan)
- ✅ Fee accrual computed: $25M committed × 1.5% annual = $93,750
- ✅ Fund expenses summed: $45,000
- ✅ Return metrics computed (IRR/TVPI/DPI/RVPI)

### Task 4.2: Retrieve Fund Metrics & Bridge
**Objective**: Verify metrics and gross-net bridge

```bash
curl -X GET "http://localhost:8000/api/re/v2/funds/22222222-2222-2222-2222-222222222222/metrics-detail?env_id=test-env&business_id=11111111-1111-1111-1111-111111111111&quarter=2026Q1"
```

**Expected Response**: HTTP 200
```json
{
  "metrics": {
    "id": "m1-uuid",
    "run_id": "run-uuid",
    "fund_id": "22222222-2222-2222-2222-222222222222",
    "quarter": "2026Q1",
    "gross_irr": 0.18,
    "net_irr": 0.14,
    "gross_tvpi": 1.18,
    "net_tvpi": 1.14,
    "dpi": 0.06,
    "rvpi": 1.12,
    "cash_on_cash": 0.06,
    "gross_net_spread": 0.04
  },
  "bridge": {
    "id": "b1-uuid",
    "run_id": "run-uuid",
    "fund_id": "22222222-2222-2222-2222-222222222222",
    "quarter": "2026Q1",
    "gross_return": 4500000,
    "mgmt_fees": 93750,
    "fund_expenses": 45000,
    "carry_shadow": 560000,
    "net_return": 3801250
  }
}
```

**Validation Points**:
- ✅ Gross IRR: 18% (realistic for equity real estate)
- ✅ Net IRR: 14% (lower due to fees and carry)
- ✅ Gross TVPI: 1.18 (18% return on 1x capital)
- ✅ Net TVPI: 1.14 (after all deductions)
- ✅ DPI: 0.06 (6% distributions, low for Q1)
- ✅ RVPI: 1.12 (remaining value appreciation)
- ✅ Cash-on-Cash: 0.06 (quarterly cash distribution rate)
- ✅ Gross-Net Spread: 4% (fees + carry impact)

**Bridge Validation**:
- ✅ Gross return: $4.5M
- ✅ Management fees: $93,750 (from fee accrual)
- ✅ Fund expenses: $45,000
- ✅ Carry shadow: $560,000 (20% GP promote on excess return)
- ✅ Net return: $4.5M - $93.75K - $45K - $560K = **$3.80125M** ✓
- ✅ Bridge components sum correctly to net return

---

## Phase 5: Debt Surveillance (Covenant Testing)

### Task 5.1: List Loans for Equity Fund
**Objective**: Verify that equity fund has no loans (only debt fund does)

```bash
curl -X GET "http://localhost:8000/api/re/v2/funds/22222222-2222-2222-2222-222222222222/loans?env_id=test-env&business_id=11111111-1111-1111-1111-111111111111"
```

**Expected Response**: HTTP 200 with empty array
```json
[]
```

**Validation Points**:
- ✅ Equity fund has no loans (as expected)

### Task 5.2: Try to Run Covenant Tests on Equity Fund (Should Fail)
**Objective**: Verify that covenant tests reject equity funds

```bash
curl -X POST http://localhost:8000/api/re/v2/runs/covenant_tests \
  -H "Content-Type: application/json" \
  -d '{
    "env_id": "test-env",
    "business_id": "11111111-1111-1111-1111-111111111111",
    "fund_id": "22222222-2222-2222-2222-222222222222",
    "quarter": "2026Q1"
  }'
```

**Expected Response**: HTTP 400
```json
{
  "error_code": "VALIDATION_ERROR",
  "message": "Covenant tests only available for debt funds"
}
```

**Validation Points**:
- ✅ Error code is VALIDATION_ERROR (400)
- ✅ Message clearly states debt-fund-only requirement

### Task 5.3: Run Covenant Tests on Debt Fund
**Objective**: Execute covenant testing for debt fund

```bash
curl -X POST http://localhost:8000/api/re/v2/runs/covenant_tests \
  -H "Content-Type: application/json" \
  -d '{
    "env_id": "test-env",
    "business_id": "11111111-1111-1111-1111-111111111111",
    "fund_id": "33333333-3333-3333-3333-333333333333",
    "quarter": "2026Q1"
  }'
```

**Expected Response**: HTTP 200
```json
{
  "status": "success",
  "run_id": "run-uuid",
  "run_type": "COVENANT_TEST",
  "quarter": "2026Q1",
  "fund_id": "33333333-3333-3333-3333-333333333333",
  "created_at": "2026-02-26T...",
  "covenant_results": [
    {
      "loan_id": "loan-uuid",
      "loan_name": "Senior Note A",
      "dscr": 1.15,
      "ltv": 0.65,
      "debt_yield": 0.087,
      "dscr_pass": false,
      "ltv_pass": true,
      "dy_pass": true,
      "overall_breached": true
    }
  ]
}
```

**Validation Points**:
- ✅ Run created with status='success'
- ✅ run_type = COVENANT_TEST
- ✅ Covenant results include DSCR (1.15 < 1.25 threshold = fail)
- ✅ Covenant results include LTV (0.65 < 0.75 threshold = pass)
- ✅ Covenant results include Debt Yield (0.087 >= 0.08 threshold = pass)
- ✅ Overall breached = true (at least one covenant failed)
- ✅ Watchlist event created for breached covenant

### Task 5.4: Get Covenant Results History
**Objective**: Retrieve stored covenant results for debt fund loan

```bash
curl -X GET "http://localhost:8000/api/re/v2/loans/loan-uuid/covenant_results?quarter=2026Q1"
```

**Expected Response**: HTTP 200
```json
[
  {
    "id": "result-uuid",
    "run_id": "run-uuid",
    "loan_id": "loan-uuid",
    "quarter": "2026Q1",
    "dscr": 1.15,
    "ltv": 0.65,
    "debt_yield": 0.087,
    "pass": false,
    "breached": true,
    "headroom": -0.10,
    "created_at": "2026-02-26T..."
  }
]
```

**Validation Points**:
- ✅ Results stored and retrievable
- ✅ pass = false (covenant breached)
- ✅ Headroom = -0.10 (DSCR shortfall: 1.15 - 1.25 = -0.10)

### Task 5.5: Get Watchlist Events
**Objective**: Verify watchlist event was created for breach

```bash
curl -X GET "http://localhost:8000/api/re/v2/funds/33333333-3333-3333-3333-333333333333/watchlist?env_id=test-env&business_id=11111111-1111-1111-1111-111111111111"
```

**Expected Response**: HTTP 200
```json
[
  {
    "id": "event-uuid",
    "fund_id": "33333333-3333-3333-3333-333333333333",
    "loan_id": "loan-uuid",
    "quarter": "2026Q1",
    "event_type": "COVENANT_BREACH",
    "covenant_type": "DSCR",
    "severity": "HIGH",
    "description": "DSCR 1.15 < threshold 1.25",
    "created_at": "2026-02-26T..."
  }
]
```

**Validation Points**:
- ✅ Event created automatically on covenant breach
- ✅ Event type = COVENANT_BREACH
- ✅ Covenant type = DSCR (the failed covenant)
- ✅ Severity = HIGH (important for workflow prioritization)
- ✅ Description includes measured vs threshold values

---

## Phase 6: Run History & Audit Trail

### Task 6.1: List All Runs for Equity Fund
**Objective**: Verify run history tracking

```bash
curl -X GET "http://localhost:8000/api/re/v2/fi/runs?env_id=test-env&business_id=11111111-1111-1111-1111-111111111111&fund_id=22222222-2222-2222-2222-222222222222"
```

**Expected Response**: HTTP 200
```json
[
  {
    "id": "run-uuid",
    "fund_id": "22222222-2222-2222-2222-222222222222",
    "quarter": "2026Q1",
    "run_type": "QUARTER_CLOSE",
    "status": "success",
    "input_hash": "abc123...",
    "output_hash": "def456...",
    "created_at": "2026-02-26T...",
    "created_by": "api"
  }
]
```

**Validation Points**:
- ✅ Run history shows QUARTER_CLOSE
- ✅ Status = success (completed without error)
- ✅ input_hash present (SHA256 of quarter close inputs)
- ✅ output_hash present (SHA256 of computed outputs)
- ✅ created_by = api (from API call)
- ✅ Hashes enable reproducibility and change detection

### Task 6.2: Filter Runs by Quarter
**Objective**: Verify quarter filtering

```bash
curl -X GET "http://localhost:8000/api/re/v2/fi/runs?env_id=test-env&business_id=11111111-1111-1111-1111-111111111111&fund_id=22222222-2222-2222-2222-222222222222&quarter=2026Q1"
```

**Expected Response**: HTTP 200 with only 2026Q1 runs

**Validation Points**:
- ✅ Filtering by quarter works
- ✅ No runs from other quarters returned

---

## Phase 7: Frontend UI Validation

### Task 7.1: Navigate to Fund Detail Page
**Objective**: Open frontend and view complete financial dashboard

**URL**: `http://localhost:3000/lab/env/test-env/re/funds/22222222-2222-2222-2222-222222222222`

**Expected Behavior**:
1. Page loads within 3 seconds
2. Fund name displays: "Dallas Multifamily Cluster"
3. Fund strategy displays: "Equity"
4. 5 tabs visible:
   - Overview
   - Variance (NOI)
   - Returns (Gross/Net)
   - ~~Debt Surveillance~~ (hidden for equity fund)
   - Run Center

**Validation Points**:
- ✅ Page title: "Dallas Multifamily Cluster"
- ✅ Fund strategy: "Equity"
- ✅ No 404 error
- ✅ All tabs render without JavaScript errors
- ✅ Data-testid attributes present for E2E testing

### Task 7.2: View Variance Tab
**Expected Display**:
- Table with columns: Line Code, Actual, Plan, Variance $, Variance %
- Rows include: RENT, PAYROLL, UTILITIES, TAXES, REPAIRS, MISC
- Rollup cards show:
  - **NOI Actual**: $74,100
  - **NOI Plan**: $73,000
  - **NOI Variance**: $1,100 (1.5%)

**Validation Points**:
- ✅ Data loads from API
- ✅ Values match backend response
- ✅ Percentage formatting correct (0.02 = "2.0%")
- ✅ Currency formatting correct ($86,700 displays as "$86,700")
- ✅ Rollup totals sum correctly

### Task 7.3: View Returns Tab
**Expected Display**:
- KPI cards (in order):
  - Cash-on-Cash: 6.0%
  - Gross IRR: 18.0%
  - Net IRR: 14.0%
  - Gross TVPI: 1.18x
  - Net TVPI: 1.14x
  - DPI: 0.06x
  - RVPI: 1.12x
  - Gross-Net Spread: 4.0%
- Gross-Net Bridge waterfall showing:
  - Gross Return: $4,500,000 (start)
  - Less: Mgmt Fees: ($93,750)
  - Less: Fund Expenses: ($45,000)
  - Less: Carry Shadow: ($560,000)
  - **Equals: Net Return: $3,801,250** (end)

**Validation Points**:
- ✅ All 8 metrics display
- ✅ Values match backend response
- ✅ Percentage/multiple formatting correct
- ✅ Bridge components sum correctly: 4.5M - 0.094M - 0.045M - 0.56M = 3.801M
- ✅ Bridge visual (waterfall chart or list) shows flow clearly

### Task 7.4: Verify Debt Surveillance Tab Hidden (Equity Fund)
**Expected Display**:
- Tab labeled "Debt Surveillance" does NOT appear in tab list
- Only 4 tabs visible: Overview, Variance, Returns, Run Center

**Validation Points**:
- ✅ Debt Surveillance tab conditionally hidden
- ✅ UI not cluttered with disabled/grayed-out tabs

### Task 7.5: View Run Center Tab
**Expected Display**:
- Selectors for: Fund (pre-filled), Quarter (editable), Scenario (optional)
- Buttons visible:
  - "Run Quarter Close" (blue/primary)
  - "Run Waterfall Shadow" (secondary)
  - ~~"Run Covenant Tests"~~ (hidden for equity fund)
- Run history table showing:
  - Run ID, Run Type, Quarter, Status, Created At, Created By
  - Most recent run: QUARTER_CLOSE, 2026Q1, Success, 2 min ago, api

**Validation Points**:
- ✅ Fund name pre-filled (no selector visible)
- ✅ Quarter shows current/last: 2026Q1
- ✅ Covenant Tests button hidden (equity fund)
- ✅ Run history populated with previous run
- ✅ Status shows "Success" with green indicator

### Task 7.6: Navigate to Debt Fund Detail Page
**URL**: `http://localhost:3000/lab/env/test-env/re/funds/33333333-3333-3333-3333-333333333333`

**Expected Behavior**:
1. Page loads: "Meridian Debt Fund II"
2. Fund strategy: "Debt"
3. 5 tabs visible:
   - Overview
   - Variance (NOI) (optional for debt, less common)
   - Returns (Gross/Net)
   - **Debt Surveillance** (visible!)
   - Run Center

**Validation Points**:
- ✅ Debt Surveillance tab now visible (strategy='debt')
- ✅ Conditional rendering works correctly

### Task 7.7: View Debt Surveillance Tab (Debt Fund)
**Expected Display**:
- Loans table with columns: Loan Name, UPB, Rate, DSCR, LTV, Debt Yield, Status
- Single row:
  - Loan Name: "Senior Note A"
  - UPB: $15,000,000
  - Rate: 6.5%
  - DSCR: 1.15 (red/warning indicator)
  - LTV: 65%
  - Debt Yield: 8.7%
  - Status: "Breached"
- Watchlist section showing:
  - Event: "COVENANT_BREACH - DSCR 1.15 < 1.25"
  - Severity: HIGH (red)
  - Date: 2 min ago

**Validation Points**:
- ✅ Loan data loads correctly
- ✅ DSCR displays as 1.15 (not 115% or 0.0115)
- ✅ Breach status highlighted (red background or warning icon)
- ✅ Watchlist event shows in table/list
- ✅ Clicking loan name opens covenant details (if implemented)

### Task 7.8: View Run Center Tab (Debt Fund)
**Expected Display**:
- All buttons visible:
  - "Run Quarter Close"
  - "Run Waterfall Shadow"
  - **"Run Covenant Tests"** (now visible for debt fund!)

**Validation Points**:
- ✅ Covenant Tests button visible (strategy='debt')
- ✅ Button is clickable and functional

### Task 7.9: Sidebar Navigation
**Expected Behavior**:
- When on fund detail page (`/funds/<id>`), sidebar shows:
  - "Funds" link highlighted with border/underline
  - "Investments", "Assets", "Scenarios", "Run Center" not highlighted
- When navigating to other routes:
  - `/deals` → "Investments" highlighted
  - `/assets` → "Assets" highlighted
  - `/scenarios` → "Scenarios" highlighted
  - `/runs/quarter-close` → "Run Center" highlighted

**Validation Points**:
- ✅ Active state logic works correctly
- ✅ Fund detail routes don't highlight multiple nav items
- ✅ Navigation between sections updates active state

---

## Phase 8: Error Handling & Edge Cases

### Task 8.1: Query Non-Existent Fund
**Objective**: Verify clean 404 handling

```bash
curl -X GET "http://localhost:3000/lab/env/test-env/re/funds/00000000-0000-0000-0000-000000000000"
```

**Expected Frontend Display**:
- Clear error card: "Fund Not Found"
- No spinner or loading state
- Sidebar still visible
- Breadcrumb shows path attempted

**Validation Points**:
- ✅ No JavaScript console errors
- ✅ User-friendly error message
- ✅ Navigation still works (can go back)

### Task 8.2: Query Metrics Before Seeding
**Objective**: Verify 404 when no data exists

```bash
curl -X GET "http://localhost:8000/api/re/v2/funds/99999999-9999-9999-9999-999999999999/metrics-detail?env_id=test-env&business_id=11111111-1111-1111-1111-111111111111&quarter=2026Q1"
```

**Expected Response**: HTTP 404
```json
{
  "error_code": "NOT_FOUND",
  "message": "No metrics for fund 99999999-9999-9999-9999-999999999999 quarter 2026Q1"
}
```

**Validation Points**:
- ✅ 404 status code (not 500)
- ✅ Structured error with error_code and message
- ✅ Message identifies missing resource

### Task 8.3: Invalid Quarter Format
**Objective**: Verify input validation

```bash
curl -X GET "http://localhost:8000/api/re/v2/variance/noi?env_id=test-env&business_id=11111111-1111-1111-1111-111111111111&fund_id=22222222-2222-2222-2222-222222222222&quarter=invalid"
```

**Expected Response**: HTTP 400
```json
{
  "error_code": "VALIDATION_ERROR",
  "message": "Invalid quarter format. Use format: 2026Q1"
}
```

**Validation Points**:
- ✅ 400 status code (not 500)
- ✅ Clear error message with format example

---

## Test Completion Checklist

### Backend API (7 areas)
- [ ] Task 2.1: Accounting import works
- [ ] Task 3.1: Variance endpoint returns data
- [ ] Task 4.1: Quarter close succeeds
- [ ] Task 4.2: Fund metrics retrieved
- [ ] Task 5.1-5.5: Debt surveillance & covenant testing
- [ ] Task 6.1-6.2: Run history & filtering
- [ ] Task 8.1-8.3: Error handling

### Frontend UI (10 areas)
- [ ] Task 7.1: Fund detail page loads
- [ ] Task 7.2: Variance tab displays correctly
- [ ] Task 7.3: Returns tab with bridge waterfall
- [ ] Task 7.4: Debt Surveillance hidden for equity
- [ ] Task 7.5: Run Center visible with correct buttons
- [ ] Task 7.6: Debt fund loads correctly
- [ ] Task 7.7: Debt Surveillance shows loans & covenants
- [ ] Task 7.8: Run Center shows Covenant Tests for debt
- [ ] Task 7.9: Sidebar navigation highlights correctly
- [ ] Task 8.1: 404 handling clean

### Data Integrity
- [ ] Variance math: actual - plan = variance
- [ ] Variance %: variance / plan = %
- [ ] Bridge math: gross - fees - expenses - carry = net
- [ ] Fee computation: capital × rate = fee
- [ ] Covenant pass/fail logic correct
- [ ] Hashes (input/output) consistent

### Test Coverage Verification
- [ ] Backend tests passing (330 total, 8 new)
- [ ] Frontend unit tests passing (41 total, 9 new)
- [ ] E2E tests passing (6 specs)
- [ ] No console errors in browser
- [ ] No Python tracebacks in backend logs

---

## Success Criteria

### All-Passing Threshold
✅ **Test is PASSING if**:
1. All API calls return expected status codes (200, 400, 404)
2. All response JSON contains expected fields with correct data types
3. All mathematical computations match expected values (variance, bridge, metrics)
4. Frontend pages load without errors and display all expected elements
5. Sidebar navigation highlights correct items
6. Conditional rendering works (Debt tab hidden/shown correctly)
7. Error messages are clear and actionable
8. All tests pass without manual intervention

### Test is FAILING if
❌ Any API call returns unexpected status code
❌ Any response field is missing or wrong type
❌ Mathematical values don't match (variance, metrics, bridge)
❌ Frontend page crashes or shows 404
❌ Sidebar highlights wrong nav item
❌ Debt Surveillance tab appears for equity fund
❌ Covenant Tests button visible for equity fund
❌ Test requires debugging or manual fixes

---

## Time Budget

| Phase | Task Count | Est. Time | Notes |
|-------|-----------|-----------|-------|
| Setup | 1 | 2 min | Seed data API call |
| Accounting | 1 | 2 min | Import GL |
| Variance | 1 | 2 min | Query variance |
| Returns | 2 | 3 min | Quarter close + metrics |
| Debt | 5 | 5 min | Covenant testing flow |
| History | 2 | 2 min | Run history |
| Frontend | 9 | 12 min | UI navigation & validation |
| Errors | 3 | 2 min | Error cases |
| **Total** | **24** | **~30 min** | Can run in parallel |

---

## Notes for ChatGPT Agent

1. **Parallelization**: Tasks 2.1, 3.1, 7.1-7.9 can run in parallel (different API calls/pages)
2. **Data Dependencies**: Phase 5 requires Phase 4 complete (covenant tests need debt fund seed)
3. **Frontend Testing**: Phase 7 requires backend running; can skip if backend tests pass
4. **Reproducibility**: Save all curl command outputs for verification
5. **Logging**: Note timestamp of each phase start/end for performance profiling
6. **Regression**: If any task fails, save full error output before proceeding

---

## Reporting Template (Copy This)

```markdown
# Financial Intelligence Test Report

**Test Date**: [DATE]
**Tester**: ChatGPT Agent Mode
**Environment**: test-env
**Duration**: [TIME]

## Summary
- **Total Tasks**: 24
- **Passed**: [X]
- **Failed**: [Y]
- **Skipped**: [Z]

## Phase Results

### Phase 1: Setup ✅/❌
- Task 1.1: [PASS/FAIL] - [Details]

### Phase 2: Accounting ✅/❌
- Task 2.1: [PASS/FAIL] - [Details]

### Phase 3: Variance ✅/❌
- Task 3.1: [PASS/FAIL] - [Details]

### Phase 4: Returns ✅/❌
- Task 4.1: [PASS/FAIL] - [Details]
- Task 4.2: [PASS/FAIL] - [Details]

### Phase 5: Debt ✅/❌
- Task 5.1: [PASS/FAIL] - [Details]
- Task 5.2: [PASS/FAIL] - [Details]
- Task 5.3: [PASS/FAIL] - [Details]
- Task 5.4: [PASS/FAIL] - [Details]
- Task 5.5: [PASS/FAIL] - [Details]

### Phase 6: Run History ✅/❌
- Task 6.1: [PASS/FAIL] - [Details]
- Task 6.2: [PASS/FAIL] - [Details]

### Phase 7: Frontend ✅/❌
- Task 7.1: [PASS/FAIL] - [Details]
- [Continue for 7.2-7.9...]

### Phase 8: Error Handling ✅/❌
- Task 8.1: [PASS/FAIL] - [Details]
- Task 8.2: [PASS/FAIL] - [Details]
- Task 8.3: [PASS/FAIL] - [Details]

## Issues Found
[List any failed tasks, error codes, or unexpected behavior]

## Mathematical Verification
- [ ] Variance: $1,100 = $86,700 - $85,000 ✓
- [ ] Variance %: 1.5% = $1,100 / $73,000 ✓
- [ ] Bridge: $3,801,250 = $4,500,000 - $93,750 - $45,000 - $560,000 ✓
- [ ] Fee: $93,750 = $25,000,000 × 1.5% / 4 quarters ✓

## Recommendation
[PASS/FAIL - Ready for deployment or [list blockers]]
```

---

## Example: Running All Tests (Bash)

Save this script to automate the entire test suite:

```bash
#!/bin/bash

echo "🚀 Starting Financial Intelligence Test Suite"

# Phase 1: Seed
echo "📊 Phase 1: Seeding test data..."
curl -X POST http://localhost:8000/api/re/v2/fi/seed \
  -H "Content-Type: application/json" \
  -d '{"env_id":"test-env","business_id":"11111111-1111-1111-1111-111111111111","fund_id":"22222222-2222-2222-2222-222222222222","debt_fund_id":"33333333-3333-3333-3333-333333333333"}' \
  | jq '.'

# Phase 2: Accounting
echo "📝 Phase 2: Importing GL actuals..."
curl -X POST http://localhost:8000/api/re/v2/accounting/import \
  -H "Content-Type: application/json" \
  -d '{"env_id":"test-env","business_id":"11111111-1111-1111-1111-111111111111","source_name":"test","payload":[{"asset_id":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","period_month":"2026-01-01","gl_account":"4000","amount":86700}]}' \
  | jq '.'

# Phase 3: Variance
echo "📈 Phase 3: Computing NOI variance..."
curl -X GET "http://localhost:8000/api/re/v2/variance/noi?env_id=test-env&business_id=11111111-1111-1111-1111-111111111111&fund_id=22222222-2222-2222-2222-222222222222&quarter=2026Q1" \
  | jq '.'

# Phase 4: Quarter Close
echo "🔐 Phase 4: Running quarter close..."
curl -X POST http://localhost:8000/api/re/v2/runs/quarter_close \
  -H "Content-Type: application/json" \
  -d '{"env_id":"test-env","business_id":"11111111-1111-1111-1111-111111111111","fund_id":"22222222-2222-2222-2222-222222222222","quarter":"2026Q1"}' \
  | jq '.'

# Phase 5: Metrics
echo "💰 Phase 5: Retrieving fund metrics..."
curl -X GET "http://localhost:8000/api/re/v2/funds/22222222-2222-2222-2222-222222222222/metrics-detail?env_id=test-env&business_id=11111111-1111-1111-1111-111111111111&quarter=2026Q1" \
  | jq '.'

# Phase 6: Covenant tests
echo "⚖️ Phase 6: Running covenant tests..."
curl -X POST http://localhost:8000/api/re/v2/runs/covenant_tests \
  -H "Content-Type: application/json" \
  -d '{"env_id":"test-env","business_id":"11111111-1111-1111-1111-111111111111","fund_id":"33333333-3333-3333-3333-333333333333","quarter":"2026Q1"}' \
  | jq '.'

# Phase 7: Run history
echo "📜 Phase 7: Retrieving run history..."
curl -X GET "http://localhost:8000/api/re/v2/fi/runs?env_id=test-env&business_id=11111111-1111-1111-1111-111111111111&fund_id=22222222-2222-2222-2222-222222222222" \
  | jq '.'

echo "✅ Test suite complete!"
```

---

## Post-Test Actions

1. **If All Pass**: ✅
   - Mark implementation ready for staging deployment
   - Save test report to shared documentation
   - Update CHANGELOG with FI layer version

2. **If Any Fail**: ❌
   - Capture full error output + logs
   - Identify pattern (API error, math error, UI bug, etc.)
   - Create tickets for fixes
   - Re-run after fixes applied

3. **Regression Testing**:
   - Run this test suite weekly post-deployment
   - Add any new edge cases to this document
   - Monitor performance (should take < 30 sec for all tasks)

