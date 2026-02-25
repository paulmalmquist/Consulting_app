# PDS Command

`PDS Command` is the Project & Development Services workspace under `/lab/env/[envId]/pds`.

## Context Model
- Environment-scoped: all operations resolve `env_id -> business_id` through backend context resolution.
- No business picker in the workspace UI.
- API namespace: `/api/pds/v1/*`.

## Core Screens
- Portfolio Command Center: `/lab/env/[envId]/pds`
- Project War Room: `/lab/env/[envId]/pds/projects/[projectId]`

## Deterministic Snapshot Engines
All engine outputs are deterministic for the same immutable input rows.

### Budget State Engine
Inputs:
- `pds_budget_versions`
- `pds_budget_revisions`
- `pds_commitment_lines`
- `pds_invoices`
- `pds_payments`
- `pds_forecast_versions`
- `pds_change_orders`

Outputs:
- `approved_budget`
- `revisions_amount`
- `committed`
- `invoiced`
- `paid`
- `forecast_to_complete`
- `eac`
- `variance`
- `contingency_remaining`
- `pending_change_orders`
- `open_change_order_count`
- `pending_approval_count`
- `snapshot_hash`

### Schedule Snapshot Engine
Inputs:
- `pds_milestones` (baseline/current/actual + critical flags)

Outputs:
- `milestone_health`
- `total_slip_days`
- `critical_flags`
- `snapshot_hash`

### Risk Exposure Engine
Inputs:
- `pds_risks`

Outputs:
- `expected_exposure = sum(probability * impact_amount)`
- `expected_impact_days = sum(probability * impact_days)`
- `top_risk_count`
- `snapshot_hash`

### Vendor Performance Engine
Inputs:
- `pds_survey_responses`
- `pds_punch_items`

Outputs:
- `vendor_score`
- `on_time_rate`
- `punch_speed_score`
- `dispute_count`
- `snapshot_hash`

### Reporting Assembly Engine
Inputs:
- latest portfolio/schedule/risk snapshots
- prior portfolio snapshot

Outputs:
- `deterministic_deltas_json`
- `artifact_refs_json`
- `narrative_text`
- `snapshot_hash`

## Persistence
Snapshot/report outputs are persisted in:
- `pds_schedule_snapshots`
- `pds_risk_snapshots`
- `pds_vendor_score_snapshots`
- `pds_portfolio_snapshots`
- `pds_report_runs`

## Logging Contract
PDS run endpoints log:
- `request_id`
- `run_id`
- `env_id`
- `project_id`
- `period`
- `snapshot_id`

