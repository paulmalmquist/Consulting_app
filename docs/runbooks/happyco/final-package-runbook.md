# HappyCo Property Ops Intelligence Kit - Runbook

Last updated: 2026-05-22

This is a private proof-of-work package for the HappyCo Head of Data
role. It uses deterministic synthetic data only. It does not contain HappyCo
production data, private recruiter email content, or secrets. Ticket 3B adds a
receipt-backed live Databricks execution claim for synthetic demo data only.

## Package Index

The HappyCo package spans routes, a Databricks pipeline, local artifacts, an
ADO-tracked PR program, and a Claude CoWork automation cadence. This section is
the map; the sections below it hold the detail.

### Docs in this package

| Doc | What it covers |
|---|---|
| `final-package-runbook.md` (this file) | Routes, APIs, artifacts, rebuild commands, Databricks proof, known limitations |
| `automation-cadence.md` | The nightly + weekly Claude CoWork operating cadence and how to schedule it later |
| `claude-cowork-nightly-tasks.md` | The 5 nightly + 2 weekly task prompts as copy-pasteable blocks |
| `loom-storyboard.md` | The 5-7 minute, 7-beat Loom recording script |
| `pre-recording-checklist.md` | What to open/close/verify before recording; what not to show |
| `claims-and-caveats.md` | The allowed / not-allowed claim sheet — source of truth for all copy |
| `post-merge-deploy-smoke.md` | The post-merge / post-deploy smoke checklist |
| `reusable-proof-system-backlog.md` | Reusable Winston proof-system patterns from this build |
| `outlook-wincom/` | Draft-only Outlook WinCOM recruiter workflow templates |

### The 6-PR program (Feature 391, Epic 386)

| PR | ADO | Scope |
|---|---|---|
| #100 | AB#392 | Azure DevOps relay workflow |
| #101 | AB#380 | HappyCo demo UX core |
| #102 | AB#394 | Databricks modular refactor |
| #103 | AB#395 | Databricks export contract + sample bundle |
| #104 | AB#393 | Weather-risk surfacing |
| PR-4 | AB#396 | Automation-cadence + Loom documentation package (this docs PR) |

### Routes at a glance

- `/happyco` — invite-gated landing; sets the `happyco_demo_access` cookie.
- `/happyco/demo` — clean demo; no Winston login, no Hall Boys shell.
- `/happyco/artifacts` — gated artifact hub.
- `/happyco/weather-risk` — KPI strip, risk table, market summary, model/run
  receipt evidence, chart gallery.
- `/lab/env/[envId]/operator/property-ops-intelligence` — implementation
  evidence only; the env operator route behind the demo.

### The cadence in one line

Nightly: QA, control-room refresh, Databricks receipt check, artifact
regeneration, recruiter draft prep. Weekly: role-fit gap analysis, Loom
storyboard refresh. Full detail in `automation-cadence.md`.

### Remaining gated steps

These are deliberately not done and are the honest next steps:

- Live Databricks `bundle deploy` + score run for the weather-risk bundle —
  blocked on an interactive `databricks auth login` (CLI v1.0.0). The current
  sample bundle is `mode: local_fallback` with placeholder chart PNGs.
- Uploading local artifacts to gated storage so the artifact hub can serve real
  downloads instead of local/private status.
- Turning the Claude CoWork cadence into a real recurring schedule — a separate
  ADO Task, not part of any current PR.
- Setting `HAPPYCO_DEMO_INVITE_CODE` in the deployment environment and filling
  real recruiter fields before any send.

## Routes

- Gated share package: `/happyco`
- Clean env demo URL: `/lab/env/[envId]/operator/property-ops-intelligence`
- Gated clean demo copy: `/happyco/demo`
- Gated artifact hub: `/happyco/artifacts`
- Gated artifact API: `/api/happyco/artifacts/[artifactKey]`
- Local development invite fallback: `happyco-local-demo` when
  `HAPPYCO_DEMO_INVITE_CODE` is unset and `NODE_ENV !== "production"`
- Production invite variable: `HAPPYCO_DEMO_INVITE_CODE`
- Live clean demo surface:
  `/lab/env/[envId]/operator/property-ops-intelligence`
- Gated duplicate presentation surface:
  `/happyco/demo`
- Suggested local env id for demo links:
  `NEXT_PUBLIC_HAPPYCO_DEMO_ENV_ID=happyco-demo`

The `/happyco` route sets an HTTP-only `happyco_demo_access` cookie scoped to
`/happyco`. Tailored package content is hidden until access is granted. The env
demo URL is route-specific presentation mode: it keeps the env/API URL but
bypasses the Hall Boys/Winston operator shell. Other operator routes keep the
normal shell. Local ignored artifacts are not exposed as public downloads.

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


## Gated Artifact Access

The HappyCo package uses a manifest-first artifact hub at `/happyco/artifacts`.
The hub is protected by the same invite cookie as `/happyco` and never links to
public static artifact paths.

Current behavior:

- The hub lists Excel, PowerPoint, architecture SVG, Databricks receipt, API
  excerpts, screenshots, model card, feature importance, and predictions.
- `/api/happyco/artifacts/[artifactKey]` checks the HappyCo invite cookie and
  streams only allowlisted server-side files.
- Unknown keys return `404`; missing invite access returns `403`.
- If a file is not present in the deployed filesystem, the UI says
  `Local/private artifact available; upload to gated storage pending`.

Future storage path:

- Upload generated artifacts to private blob storage, Supabase Storage, or Vercel
  Blob with non-public objects.
- Keep direct storage URLs private or signed.
- Continue streaming through the gated API so invite access remains the control
  point.

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

## Weather-Risk Route And Sample Bundle

`/happyco/weather-risk` surfaces a public NOAA/FEMA hazard layer joined to the
synthetic property-ops layer. It shows a KPI strip, a risk table, a market
summary, model/run-receipt evidence, and a chart gallery.

The Databricks side is a modular `weather_risk` Python package plus a bundle.
`databricks bundle validate -t dev` PASSES against the workspace — the bundle
config is real and valid.

`bundle deploy` and `bundle run` are NOT done. Databricks CLI v1.0.0 needs an
interactive `databricks auth login` first.

The weather-risk sample bundle at `repo-b/public/happyco/weather-risk/latest/` is
`mode: local_fallback`. Its chart PNGs are local-contract placeholders
(roughly 67 bytes), not real charts.

Exact wording for the weather-risk state:

> The site contract is wired. The local fallback bundle validates the interface,
> and the live Databricks score run is the next gated step to replace
> placeholder chart artifacts with real generated charts.

Allowed claim for the current bundle:

> Databricks-validated modular pipeline with a local fallback export bundle.

A separate, prior receipt-backed Databricks run exists (job/run IDs in
`repo-b/src/lib/happyco/proof.ts`, `HAPPYCO_DATABRICKS_RECEIPT`). Its allowed
claim is:

> Databricks ML training run executed on public weather and synthetic property
> operations data.

Keep these two claims separate — see `claims-and-caveats.md`.

## Automation Cadence

The package is kept honest after sharing by a Claude CoWork cadence: 5 nightly
tasks and 2 weekly tasks. The cadence is documented, not yet scheduled. No
recurring schedule is created by PR-4.

- Nightly: Proof Package QA, Automation Control Room Refresh, Databricks Weather
  Risk Run / Receipt Check, Artifact Regeneration, Recruiter Draft Prep.
- Weekly: Role-Fit Gap Analysis, Loom/Demo Storyboard Refresh.

Full design is in `automation-cadence.md`. The copy-pasteable task prompts are in
`claude-cowork-nightly-tasks.md`. Safety gates: no auto-send, no fake runs, no
exposed invite codes, no public artifact leaks.

## Manual Actions Before Recruiter Send

1. Set `HAPPYCO_DEMO_INVITE_CODE` in the deployment environment.
2. Set `NEXT_PUBLIC_HAPPYCO_DEMO_ENV_ID` to the real demo env id if not using
   `happyco-demo`.
3. Review the generated workbook and deck locally.
4. Copy Outlook params templates to ignored `artifacts/happyco/outlook/`.
5. Fill real recruiter fields locally.
6. Create an Outlook draft only.
7. Review the draft in Outlook before any manual send.
