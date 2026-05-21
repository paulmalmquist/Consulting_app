# HappyCo Property Ops Intelligence Kit - Runbook

Last updated: 2026-05-21

This is a private proof-of-work package for the HappyCo Head of Data
role. It uses deterministic synthetic data only. It does not contain HappyCo
production data, private recruiter email content, or secrets. Ticket 3B adds a
receipt-backed live Databricks execution claim for synthetic demo data only.

## Routes

- Gated share package: `/happyco`
- Local development invite fallback: `happyco-local-demo` when
  `HAPPYCO_DEMO_INVITE_CODE` is unset and `NODE_ENV !== "production"`
- Production invite variable: `HAPPYCO_DEMO_INVITE_CODE`
- Live operator surface:
  `/lab/env/[envId]/operator/property-ops-intelligence`
- Suggested local env id for demo links:
  `NEXT_PUBLIC_HAPPYCO_DEMO_ENV_ID=happyco-demo`

The `/happyco` route sets an HTTP-only `happyco_demo_access` cookie scoped to
`/happyco`. Tailored content is hidden until access is granted. Local ignored
artifacts are not exposed as public downloads.

## Operator API Endpoints

Backend routes added under `backend/app/routes/operator.py`:

- `GET /api/operator/v1/property-ops/entities`
- `GET /api/operator/v1/property-ops/graph`
- `GET /api/operator/v1/property-ops/benchmarks`
- `GET /api/operator/v1/property-ops/recommendations`
- `GET /api/operator/v1/property-ops/ml-risk`

Every payload includes synthetic-demo metadata. `ml-risk` and recommendations
fail soft with `ml_status: "not_available"` if local ML artifacts are absent.
The `ml-risk` payload also reports `databricks_status` as `not_run`,
`not_configured`, `attempted_failed`, or `completed`. A tracked sanitized
receipt fixture lets deployed demos show the completed Databricks run without
committing local ignored artifacts.

Service-level API excerpt written locally:

`artifacts/happyco/qa/api_excerpts.json`

Current excerpt highlights:

- Parkline Commons repeat rate peer ratio: `3.5`
- Parkline recommendation: `rec-parkline-hvac-audit`
- ML status for Parkline Commons: `available`

## Local Artifacts

These paths are ignored by git and must be copied or attached locally:

- Workbook:
  `artifacts/happyco/excel/HappyCo_Property_Ops_Model.xlsx`
- Deck:
  `artifacts/happyco/deck/HappyCo_90_Day_Data_Strategy.pptx`
- Architecture diagram:
  `artifacts/happyco/architecture/happyco_property_ops_architecture.svg`
- ML feature table:
  `artifacts/happyco/ml/feature_table.csv`
- ML predictions:
  `artifacts/happyco/ml/predictions.csv`
- Model metrics:
  `artifacts/happyco/ml/model_metrics.json`
- Feature importance:
  `artifacts/happyco/ml/feature_importance.csv`
- Model card:
  `artifacts/happyco/ml/model_card.md`
- Model registry record:
  `artifacts/happyco/ml/model_registry_record.json`
- Databricks run receipt, only after a successful workspace run:
  `artifacts/happyco/databricks/databricks_run_receipt.json`
- Databricks attempt receipt when CLI/auth/run setup fails:
  `artifacts/happyco/databricks/databricks_run_attempt_receipt.json`
- Screenshots:
  `artifacts/happyco/screenshots/happyco_locked.png`
  `artifacts/happyco/screenshots/happyco_unlocked.png`

## Rebuild Commands

Run from the repository root:

```powershell
python scripts/happyco/train_property_ops_ml.py --fixture backend/app/fixtures/winston_demo/happyco_property_ops_seed.json --out artifacts/happyco/ml
python scripts/happyco/run_databricks_ml.py --profile PaulMain --out artifacts/happyco/databricks
python scripts/happyco/run_databricks_ml.py --profile PaulMain --execute --out artifacts/happyco/databricks
python scripts/happyco/build_property_ops_workbook.py
python scripts/happyco/build_strategy_deck.py
```


## Weather + Maintenance Risk Databricks Proof

The newer weather-aware maintenance risk extension is a separate Databricks proof
using public weather data and synthetic property operations data. It is source
controlled in the proof branch commit `ad634bfa` and integrated into the gated
HappyCo package only as sanitized receipt metadata.

Allowed claim:

> Databricks ML training run executed on public weather and synthetic property operations data.

Run receipt summary:

- Job ID: `172758362681895`
- Run ID: `924781458483845`
- Data: public weather + synthetic property operations
- Output: predictions, metrics, MLflow run metadata, validated receipt
- Local ignored receipt path:
  `artifacts/happyco/weather-risk/databricks_run_receipt.json`

Claims still not allowed:

- HappyCo production data
- Production HappyCo model
- Production deployment
- Serving endpoint

Technical note:

- The Databricks workspace did not expose `main`, so the job used the
  `hive_metastore.property_ops_risk_ml` fallback namespace.
- Future serverless SparkML model artifact logging should configure a UC Volume
  path for `MLFLOW_DFS_TMP` or `dfs_tmpdir`.
- MLflow params/metrics/run IDs, tables, predictions, and receipt validation
  completed despite fail-soft SparkML artifact logging.

## Databricks Ticket 3B Runbook

The strongest honest claim after a successful run is:

> Databricks ML training run executed on synthetic property operations data.

Do not claim a real HappyCo production model, real HappyCo production data, or a
production model deployment.

The local shell must be able to run:

```powershell
databricks --version
databricks auth profiles
databricks current-user me
```

If `databricks` is not found, install the Databricks CLI and reopen the shell so
the executable is on `PATH`. If auth fails, configure using your workspace's
approved method. Typical environment-variable setup is:

```powershell
$env:DATABRICKS_HOST="https://<workspace-url>"
$env:DATABRICKS_TOKEN="<token>"
databricks current-user me
```

Do not paste tokens into chat, commit tokens, or print token values into logs.

Readiness / attempt receipt:

```powershell
python scripts/happyco/run_databricks_ml.py --profile PaulMain --out artifacts/happyco/databricks
```

If CLI/auth is unavailable, this writes
`artifacts/happyco/databricks/databricks_run_attempt_receipt.json`. The API/UI
will report `databricks_status` as `not_configured` or `attempted_failed`; it
will not show "Databricks run completed."

Completed execution:

```powershell
python scripts/happyco/run_databricks_ml.py --profile PaulMain --execute --out artifacts/happyco/databricks
```

The current successful run used serverless notebook execution and produced:

- Run ID: `1055219858155829`
- Job ID: `77917622473309`
- Local ignored receipt:
  `artifacts/happyco/databricks/databricks_run_receipt.json`
- Tracked sanitized deployed receipt:
  `backend/app/fixtures/winston_demo/happyco_databricks_run_receipt.json`

The receipt contains:

- `demo_mode`
- `data_source`
- `databricks_executed`
- `workspace_user`
- `job_id` if applicable
- `run_id`
- `run_page_url`
- `notebook_path`
- `started_at`
- `finished_at`
- `status`
- `output_paths`
- `model_name`
- `model_version`
- `caveat`
- `claim_allowed`
- `claim_not_allowed`

Because the completed receipt exists, the operator ML panel and gated page may say:

> Databricks run completed on synthetic property operations data.

Validate Outlook params:

```powershell
python -m json.tool docs/runbooks/happyco/outlook-wincom/happyco_search_recruiter_context.params.template.json > $null
python -m json.tool docs/runbooks/happyco/outlook-wincom/happyco_draft_followup.params.template.json > $null
python -m json.tool docs/runbooks/happyco/outlook-wincom/happyco_workflow_receipt.params.template.json > $null
```

Frontend validation:

```powershell
cd repo-b
npm run typecheck
```

Backend validation:

```powershell
python -m pytest backend/tests/test_operator_property_ops.py -q
python -m pytest backend/tests/test_operator_v1.py backend/tests/test_operator_permits.py backend/tests/test_operator_closeout.py -q
```

## Screenshot Smoke

Temporary dev-server smoke used:

```powershell
cd repo-b
npm run dev -- -p 3100
```

Then `/happyco` was loaded, the local development invite code was submitted, and
the locked/unlocked screenshots were captured with Playwright. The dev server
was stopped after capture.

## Outlook Workflow

Tracked templates:

- `docs/runbooks/happyco/outlook-wincom/happyco_search_recruiter_context.params.template.json`
- `docs/runbooks/happyco/outlook-wincom/happyco_draft_followup.params.template.json`
- `docs/runbooks/happyco/outlook-wincom/happyco_workflow_receipt.params.template.json`

Local runner pattern when the Outlook WinCOM skill is available:

```powershell
py skills\outlook-wincom-cowork\scripts\outlook_protocol.py --params artifacts\happyco\outlook\happyco_draft_followup.params.json
```

The templates are safe by default:

- `dry_run: true`
- draft-only email policy
- no real recipient
- no private recruiter context
- sending requires explicit local override outside tracked templates

## Known Limitations

- The Databricks job ran on deterministic synthetic property operations data, not
  HappyCo production data. Claim only the Databricks execution pattern, not real
  HappyCo predictive performance.
- ML metrics are synthetic-demo validation signals. The model card and metrics
  JSON explicitly warn that deterministic labels can inflate performance.
- Workbook and deck generation use local fallback tooling because artifact-tool
  presentation/spreadsheet dependencies were unavailable in this workspace.
- `/happyco` gates tailored content but does not expose local artifact downloads.
  Attachments are handled manually or through the local Outlook workflow.
- Operator page data is fixture-backed and deterministic; no DB migration or
  production persistence is included in this vertical slice.
- The clean worktree lacks `backend/.env`, so full ASGI smoke using `app.main`
  was not run. Focused FastAPI route tests passed under pytest fixtures.

## Ready To Demo

- Synthetic canonical data spine and entity-resolution queue
- Property operations graph service and operator endpoints
- Parkline Commons underperformance benchmark
- Evidence-backed deterministic recommendation
- ML feature table, predictions, model metrics, feature importance, model card,
  and registry record
- HappyCo-colored operator page
- Gated `/happyco` package route
- Local Excel workbook
- Local PowerPoint deck and architecture SVG
- Outlook WinCOM dry-run/draft templates

## Manual Actions Before Recruiter Send

1. Set `HAPPYCO_DEMO_INVITE_CODE` in the deployment environment.
2. Set `NEXT_PUBLIC_HAPPYCO_DEMO_ENV_ID` to the real demo env id if not using
   `happyco-demo`.
3. Review the generated workbook and deck locally.
4. Copy Outlook params templates to ignored `artifacts/happyco/outlook/`.
5. Fill real recruiter fields locally.
6. Create an Outlook draft only.
7. Review the draft in Outlook before any manual send.
