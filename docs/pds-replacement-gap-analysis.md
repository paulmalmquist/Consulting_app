# Business Machine — PDS Replacement Gap Analysis (Prototype Reality)

Assumption baseline: current platform is still at prototype stage with business provisioning, department/capability shells, document storage, execution stubs, and basic UI shells only.

The findings below list what is **missing and required** to replace a traditional Project & Development Services (PDS) engagement.

---

## 1) Core Infrastructure Gaps

### Missing modules
- **Portfolio domain model service** for multi-entity hierarchy (program -> project -> property -> asset -> system/component).
- **Financial controls engine** for budget, forecast, commitments, and actuals.
- **Change governance module** for CO lifecycle, approvals, and downstream budget impacts.
- **Vendor/contractor management module** with qualification, compliance, and rate cards.
- **SLA & service-performance module** with timer states, breach logic, and penalties.
- **Cost coding and normalization module** (CSI/MasterFormat/Uniformat/custom crosswalks).
- **Portfolio rollup analytics service** for cross-project KPIs and drill-through.
- **Deep audit and control plane** for actor intent, before/after state, and chain-of-custody.
- **Policy-based approval routing engine** with dynamic rules and delegation.

### Missing database schemas/tables
- `portfolios`, `programs`, `projects`, `properties`, `assets`, `asset_systems`, `locations`
- `project_memberships`, `entity_relationships`, `entity_tags`
- `budgets`, `budget_versions`, `forecasts`, `forecast_versions`, `commitments`, `actual_costs`
- `change_orders`, `change_order_lines`, `change_order_reasons`, `change_order_approvals`
- `vendors`, `vendor_contacts`, `vendor_licenses`, `vendor_insurance`, `vendor_performance`
- `contracts`, `contract_line_items`, `contract_slas`, `sla_events`, `sla_breaches`
- `cost_codes`, `cost_code_taxonomies`, `cost_code_mappings`, `cost_code_exceptions`
- `rollup_snapshots`, `kpi_definitions`, `kpi_values`
- `approval_policies`, `approval_routes`, `approval_steps`, `approval_actions`, `delegations`
- `audit_events`, `audit_event_diffs`, `audit_signatures`, `actor_sessions`

### Required API endpoints
- Portfolio hierarchy CRUD + graph retrieval (`/portfolios`, `/projects/{id}/tree`).
- Budget/forecast compare endpoints (`/projects/{id}/financials/variance`).
- Change-order APIs with state transitions and approval actions.
- Vendor onboarding/compliance endpoints.
- SLA lifecycle endpoints (start/pause/stop/breach/waiver).
- Cost-code crosswalk endpoints and validation APIs.
- Rollup analytics endpoints with filters/snapshots.
- Approval policy simulation endpoints ("who approves if...").
- Full audit query/export endpoints.

### Required UI components
- Portfolio explorer tree + map/list split view.
- Financial variance workbench (budget vs forecast vs actual).
- Change-order board with approval timeline.
- Vendor registry dashboard + compliance alerts.
- SLA monitor with breach countdowns.
- Cost-code mapping editor with exception queues.
- Executive rollup dashboard with drill-down paths.
- Approval route designer + approval inbox.
- Audit timeline with before/after diff viewer.

---

## 2) Data Ingestion Requirements

### Missing modules
- **Universal import orchestration service** (batch + streaming).
- **Excel ingestion engine** with schema inference and template versioning.
- **Connector adapters** for Procore, MRI/Yardi, SAP/Oracle.
- **Email ingestion pipeline** (mailbox connectors, attachment extraction, OCR where needed).
- **Version comparison/diff engine** across files and structured records.
- **Canonical schema normalization layer** for source-to-target mapping.

### Missing database schemas/tables
- `ingestion_jobs`, `ingestion_sources`, `ingestion_runs`, `ingestion_errors`
- `source_connectors`, `connector_credentials`, `connector_sync_state`
- `staging_raw_files`, `staging_raw_records`, `staging_parsed_records`
- `schema_registry`, `field_mappings`, `mapping_versions`, `transformation_rules`
- `data_quality_rules`, `data_quality_results`, `data_rejections`
- `record_fingerprints`, `record_versions`, `record_diffs`, `change_events`
- `email_sources`, `email_messages`, `email_attachments`, `attachment_extractions`

### ETL components needed
- **Extractors:** API pullers (Procore/MRI/Yardi/SAP/Oracle), SFTP/file drop, mailbox listeners.
- **Parsers:** XLSX/CSV parser, PDF table extraction, OCR fallback.
- **Transformers:** type coercion, units normalization, code mapping, date/currency normalization.
- **Validators:** business-rule engine + referential integrity checks.
- **Loaders:** staging -> canonical -> warehouse serving layer.
- **Observability:** job metrics, lineage tracking, replay/retry tooling.

### Data validation rules
- Required-key checks (`project_id`, vendor, cost_code, amount, date).
- Domain constraints (non-negative costs, valid date ranges, status enums).
- Cross-entity referential integrity (project exists, vendor active, contract valid).
- Duplicate detection (hash + fuzzy matching on invoice/change-order identifiers).
- Currency/unit consistency and conversion sanity checks.
- Temporal consistency (forecast version sequence monotonic, no retroactive approval without override reason).

### Change detection logic
- Row-level fingerprints (stable business keys + normalized values).
- Record versioning with semantic diff classes (`financial`, `schedule`, `compliance`, `metadata`).
- Incremental CDC windows by source system watermark.
- Event emission for materiality thresholds (e.g., >2% budget variance, critical milestone slip).
- Human-in-the-loop review queue for low-confidence merges/matches.

### Required API endpoints
- Job orchestration endpoints (`/ingestion/jobs`, `/ingestion/jobs/{id}/rerun`).
- Connector management endpoints.
- Mapping/normalization endpoints with test-run previews.
- Validation report endpoints + downloadable rejection files.
- Version diff endpoints (`/records/{id}/diff?from=&to=`).

### Required UI components
- Data source setup wizard.
- Mapping studio (source field -> canonical field) with versioning.
- Import run monitor + error triage queue.
- Reconciliation screens (matched/unmatched records).
- Version diff viewer with approve/reject controls.

---

## 3) Project Management Module Requirements

### Missing modules
- Gantt/schedule engine with baseline management.
- Milestone dependency graph with critical-path calculations.
- RFI management (authoring, routing, response SLAs).
- Submittal package tracking and review cycles.
- Change-order approval workflows tied to financial controls.
- Document-cost linkage layer (spec/doc revision -> cost/schedule impact).

### Missing database schemas/tables
- `schedules`, `schedule_versions`, `schedule_tasks`, `task_dependencies`
- `milestones`, `milestone_status_history`
- `rfis`, `rfi_threads`, `rfi_assignments`, `rfi_responses`, `rfi_sla_events`
- `submittals`, `submittal_items`, `submittal_reviews`, `submittal_status_history`
- `document_links`, `impact_assessments`, `impact_approvals`

### Required API endpoints
- Task/milestone CRUD and dependency endpoints.
- Critical path + delay simulation endpoints.
- RFI/submittal lifecycle endpoints with SLA timers.
- Change-order to schedule-impact linking endpoints.
- Document impact assessment endpoints.

### Required UI components
- Interactive Gantt board.
- Dependency graph visualization.
- RFI inbox/outbox with SLA clock indicators.
- Submittal Kanban by review stage.
- Impact panel linking docs to cost/schedule deltas.

---

## 4) Facilities Management Module

### Missing modules
- Work order management (reactive and planned).
- Preventive maintenance scheduler with recurrence and condition triggers.
- Asset lifecycle tracker from commissioning to replacement.
- Capital reserve planning model.
- Vendor performance scoring engine for FM operations.

### Missing database schemas/tables
- `work_orders`, `work_order_tasks`, `work_order_status_history`, `work_order_costs`
- `maintenance_plans`, `maintenance_events`, `maintenance_checklists`
- `asset_lifecycle_events`, `asset_condition_scores`, `asset_replacement_plans`
- `capital_reserve_models`, `reserve_forecasts`, `reserve_scenarios`
- `vendor_scorecards`, `vendor_score_metrics`, `vendor_score_history`

### Required API endpoints
- Work order lifecycle + dispatch endpoints.
- Maintenance plan template and run generation endpoints.
- Asset condition and lifecycle forecasting endpoints.
- Capital reserve scenario endpoints.
- Vendor scoring inputs/results endpoints.

### Required UI components
- Facilities operations console.
- Work order queue with mobile-friendly task forms.
- PM calendar and checklist execution UI.
- Asset health dashboard.
- Reserve planning scenario explorer.
- Vendor scorecard dashboard.

---

## 5) Executive Control Dashboard

### Missing modules
- Portfolio KPI aggregation and semantic metric layer.
- Budget heatmap renderer and anomaly tracker.
- Reporting latency telemetry service.
- Risk-flag rules engine + risk register.
- Project health scoring model service.
- Variance detection AI recommendation service.

### Missing database schemas/tables
- `portfolio_metrics`, `metric_snapshots`, `metric_dimensions`
- `reporting_latency_logs`, `data_freshness_status`
- `risk_flags`, `risk_register`, `risk_mitigations`, `risk_events`
- `health_scores`, `health_score_factors`, `health_score_history`
- `variance_alerts`, `ai_recommendations`, `recommendation_feedback`

### Required API endpoints
- Portfolio summary and heatmap data endpoints.
- Data freshness/latency endpoints.
- Risk CRUD + workflow endpoints.
- Health score explainability endpoints.
- AI recommendation generate/accept/reject endpoints.

### Required UI components
- Executive landing dashboard with heatmaps.
- Freshness/latency status ribbon.
- Risk cockpit with severity filters.
- Health score cards with explainability drilldown.
- Variance recommendation side panel.

---

## 6) Cost Transparency Engine

### Missing modules
- Fee model simulator (% of construction vs hybrid fee structures).
- Labor hour/capacity model.
- SaaS and tooling spend aggregator.
- Consulting invoice ingestion and normalization.
- ROI projection and benefits-realization calculator.

### Missing database schemas/tables
- `fee_models`, `fee_model_versions`, `fee_scenarios`
- `labor_roles`, `labor_rates`, `labor_time_entries`, `labor_capacity_plans`
- `saas_subscriptions`, `saas_costs`, `saas_usage`
- `consulting_invoices`, `invoice_lines`, `invoice_allocations`
- `roi_models`, `roi_assumptions`, `roi_scenarios`, `roi_actuals`

### Required API endpoints
- Fee scenario simulation endpoints.
- Labor model and utilization endpoints.
- Spend aggregation endpoints.
- Invoice ingestion/reconciliation endpoints.
- ROI scenario and sensitivity endpoints.

### Required UI components
- Fee simulator workspace.
- Labor planning and utilization charts.
- Spend transparency dashboard.
- Invoice reconciliation workbench.
- ROI waterfall + sensitivity matrix.

---

## 7) Compliance & Audit Defensibility

### Missing modules
- Immutable event journal (append-only + tamper-evident hashes).
- Approval chain graph service.
- Evidence package manager with provenance.
- Retention policy engine and legal hold capability.
- Regulatory checklist and attestation workflow.

### Missing database schemas/tables
- `immutable_events`, `event_hash_chain`, `event_signatures`
- `approval_graph_nodes`, `approval_graph_edges`, `approval_chain_snapshots`
- `evidence_items`, `evidence_links`, `evidence_collections`, `evidence_access_logs`
- `retention_policies`, `retention_assignments`, `legal_holds`, `purge_jobs`
- `regulatory_frameworks`, `checklist_items`, `attestations`, `control_tests`

### Required API endpoints
- Immutable log query and verification endpoints.
- Approval chain reconstruction endpoints.
- Evidence pack create/export endpoints.
- Retention/legal hold management endpoints.
- Checklist/attestation lifecycle endpoints.

### Required UI components
- Compliance command center.
- Approval chain graph viewer.
- Evidence binder builder.
- Retention/legal hold console.
- Control checklist and attestation screens.

---

## 8) Automation Layer

### Missing modules
- Workflow designer (visual + configuration-as-code).
- Rules engine with condition/action semantics.
- Escalation policy engine.
- AI summarization and action recommendation pipeline.
- Notification/alerting hub.

### Missing database schemas/tables
- `workflows`, `workflow_versions`, `workflow_nodes`, `workflow_edges`
- `rules`, `rule_conditions`, `rule_actions`, `rule_execution_logs`
- `escalation_policies`, `escalation_steps`, `escalation_events`
- `ai_summaries`, `summary_inputs`, `summary_feedback`
- `alerts`, `alert_channels`, `alert_subscriptions`, `alert_deliveries`

### Required API endpoints
- Workflow CRUD/publish/test endpoints.
- Rule simulation and execution endpoints.
- Escalation trigger and acknowledgment endpoints.
- AI summary generate/revise endpoints.
- Alert subscription and delivery status endpoints.

### Required UI components
- Drag/drop workflow builder.
- Rule editor with test sandbox.
- Escalation matrix editor.
- AI summary review panel.
- Alert center + user notification preferences.

---

## 9) Client Self-Management Layer

### Missing modules
- Tenant admin console.
- Custom report/query builder.
- Field/schema configurability (safe extension model).
- External API management (keys, scopes, quotas).
- Export governance and data egress controls.

### Missing database schemas/tables
- `tenant_settings`, `tenant_branding`, `tenant_policies`
- `custom_reports`, `report_queries`, `report_schedules`, `report_shares`
- `custom_fields`, `custom_field_definitions`, `field_bindings`, `field_validations`
- `api_clients`, `api_tokens`, `api_scopes`, `api_usage`
- `export_policies`, `export_jobs`, `export_audits`, `egress_approvals`

### Required API endpoints
- Tenant admin settings endpoints.
- Report builder/query execution endpoints.
- Custom field lifecycle endpoints.
- API credential and scope management endpoints.
- Export request/approval/download endpoints.

### Required UI components
- Admin center.
- No-code report builder.
- Dynamic field configuration studio.
- API key management UI.
- Export governance queue.

---

## 10) Architecture Changes Required

### Brutal assessment
- **Yes: event-driven backend is required** for auditability, integration fan-out, and asynchronous workflows.
- **Yes: job queue system is mandatory** for imports, recomputations, notifications, and AI tasks.
- **Yes: background processing is non-negotiable** for scalability and latency isolation.
- **Yes: versioned schema strategy is required** (both DB migration versioning and canonical data contract versioning).
- **Yes: multi-tenant isolation hardening is required** (logical isolation at minimum, strong RLS, tenant-aware caches/queues, key management).

### Missing modules
- Event bus + outbox/inbox reliability framework.
- Queue workers + scheduler + dead-letter handling.
- Distributed workflow/orchestration runtime.
- Schema registry/version management service.
- Tenant isolation security layer and policy enforcement.
- Observability stack (logs, traces, metrics, SLOs).

### Missing database schemas/tables
- `outbox_events`, `inbox_events`, `event_subscriptions`, `event_retries`, `dead_letter_events`
- `jobs`, `job_attempts`, `job_schedules`, `job_locks`
- `schema_versions`, `contract_versions`, `migration_audits`
- `tenant_keys`, `tenant_encryption_context`, `tenant_access_policies`
- `service_health`, `slo_definitions`, `incident_events`

### Required API endpoints
- Event publication/subscription admin endpoints.
- Job enqueue/status/cancel/retry endpoints.
- Workflow orchestration control endpoints.
- Schema contract discovery and compatibility endpoints.
- Tenant security policy endpoints.
- Operational health/SLO endpoints.

### Required UI components
- Platform operations console.
- Queue/job monitoring dashboard.
- Contract/schema version explorer.
- Tenant security policy dashboard.
- Reliability/incident cockpit.

---

## Bottom-line Readiness Verdict

Current prototype is not "missing a few features"; it is missing most of the operational, financial, governance, and compliance stack required to displace a full PDS engagement.

To credibly replace PDS incumbents, the platform must evolve from document-centric workflow shells to a strongly-governed, integration-heavy, event-driven operating system for capital programs and facilities operations.
