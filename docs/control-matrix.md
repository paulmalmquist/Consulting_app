# SOC 2 Control Matrix (Security, Availability, Processing Integrity)

| Control ID | Description | Control Type | System Component | Evidence Generated | Frequency |
|---|---|---|---|---|---|
| SEC-AR-01 | Quarterly access review of all active roles and privileged grants. | Detective | `app.access_review_tasks`, compliance API | Access review records + `app.event_log` approval entries. | Quarterly |
| SEC-MFA-01 | MFA required for privileged users at identity boundary. | Preventative | Identity provider / auth gateway | MFA policy snapshots + auth logs referenced by incident/evidence exports. | Continuous |
| SEC-RL-01 | All role grants/revokes must be logged. | Detective | `app.role_change_log`, `app.event_log` | Role change records + immutable event entries. | Continuous |
| SEC-ADM-01 | Admin actions require explicit permissions and are logged. | Preventative | RBAC middleware + permission model | Permission decision logs + denied-action events. | Continuous |
| SEC-PWD-01 | Password policy baseline enforced at identity provider. | Preventative | Identity provider | Password policy config snapshots. | Continuous |
| AVL-BKP-01 | Automated daily backups for production data stores. | Preventative | Backup scheduler / infra | Backup job logs + run metadata. | Daily |
| AVL-RST-01 | Backup restore tests are recorded and reviewed. | Detective | `app.backup_verification_log` | Restore test rows + `app.event_log` entries. | Quarterly |
| AVL-MON-01 | Monitoring alerts are tracked through incident operations. | Detective | Monitoring stack + incidents | Alert references in incident timeline. | Continuous |
| AVL-IR-01 | Incident lifecycle must have complete timeline and resolution notes. | Detective | `app.incidents`, `app.incident_timeline` | Incident records + timeline + event log. | Continuous |
| PI-DBL-01 | Journal entries enforce double-entry accounting constraints. | Preventative | `app.journal_entries` | Validation events + immutable status transitions. | Continuous |
| PI-BAL-01 | Transaction balancing (debits = credits) is enforced before approval/posting. | Preventative | journal service layer | Rejection + approval events in `app.event_log`. | Continuous |
| PI-APR-01 | Approval routing + segregation of duties enforced. | Preventative | `app.segregation_of_duties_rules`, service layer | Approval decision events + SoD violations. | Continuous |
| PI-EXC-01 | Exceptions routed to formal review workflow. | Detective | `app.work_items`, compliance evidence export | Work item status transitions + comments + event logs. | Continuous |

## Control-to-Evidence Mapping

- **Database tables:** `app.event_log`, `app.compliance_controls`, `app.access_review_tasks`, `app.backup_verification_log`, `app.incidents`, `app.incident_timeline`, `app.role_change_log`, `app.configuration_change_log`, `app.deployment_log`, `app.journal_entries`, `app.journal_entry_versions`.
- **Code modules:** `backend/app/services/compliance.py`, `backend/app/routes/compliance.py`, `backend/app/services/work.py`.
- **Logs:** `app.event_log` as the canonical append-only product evidence stream.
- **Exportable evidence:** `/api/compliance/evidence/export` returns both JSON and CSV data packets.
