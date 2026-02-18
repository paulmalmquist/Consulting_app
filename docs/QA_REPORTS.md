# QA Reports + Loop Harness

## Reports UI
The app now includes seven report pages under `/app/reports`:

1. `R1` Business Overview: `/app/reports/business-overview`
2. `R2` Department Health: `/app/reports/department-health`
3. `R3` Document Register: `/app/reports/document-register`
4. `R4` Document Compliance: `/app/reports/document-compliance`
5. `R5` Execution Ledger: `/app/reports/execution-ledger`
6. `R6` Template Adoption: `/app/reports/template-adoption`
7. `R7` Readiness / Coverage: `/app/reports/readiness`

Each page supports empty state and populated state, and includes deep links back into operational UI surfaces.

## Backend Aggregation Endpoints
Read-only endpoints under `/api/reports/*`:

- `GET /api/reports/business-overview?business_id=...`
- `GET /api/reports/department-health?business_id=...&deptKey=...`
- `GET /api/reports/doc-register?business_id=...`
- `GET /api/reports/doc-compliance?business_id=...`
- `GET /api/reports/execution-ledger?business_id=...`
- `GET /api/reports/template-adoption?business_id=...`
- `GET /api/reports/readiness?business_id=...`

Test-only drift simulation helper:

- `POST /api/reports/template-adoption/simulate-drift?business_id=...`

## Playwright QA Scenarios
`repo-b/tests/reports-qa.spec.ts` implements:

1. `S1` Template Business
2. `S2` Custom Business
3. `S3` Documents + Versions
4. `S4` Executions
5. `S5` Drift Detection

Evidence per run:

- Screenshots on failure (`tests/artifacts/*-failure.png`)
- Console/page/network summaries in `tests/artifacts/qa-runbook.md`
- Playwright traces/videos via config

## Commands
From `repo-b/`:

- One pass: `npm run test:qa-reports`
- Indefinite loop: `npm run qa:loop`

Loop controls:

- `QA_LOOP_MAX_RUNS` (optional, `0` = infinite)
- `QA_LOOP_INTERVAL_SEC` (default `15`)
- `QA_SPEC` (default `tests/reports-qa.spec.ts`)
- `QA_PLAYWRIGHT_CONFIG` (default `playwright.local.config.ts`)

## Selector Contract
Stable selectors were added for:

- Onboarding inputs and path controls
- Department tabs and capability tiles
- Document upload/list/version/download controls
- Execution run/result controls
- Report nav links and report rows/cards
