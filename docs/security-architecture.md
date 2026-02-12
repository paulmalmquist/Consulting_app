# Security Architecture — SOC 2 MVP

## Scope
Business Machine product controls aligned to SOC 2 Type II Trust Services Criteria for:
- Security
- Availability
- Processing Integrity

## Core Design Principles
1. Evidence-first controls: every critical control emits immutable, queryable evidence.
2. Append-only auditability for high-risk actions.
3. Explicit state machines for critical workflow objects.
4. Service-layer segregation-of-duties checks for approval paths.
5. Multi-tenant compatible controls (`tenant_id` optional for single-tenant mode).

## Implemented Product Controls
- Global append-only `app.event_log` for state-changing events.
- State transition validation for work lifecycle.
- SoD guard function for creator/approver separation.
- Compliance API module for control registry, evidence exports, access reviews, backup verification, incidents, and deployment logs.
- Configuration-change logging for roles/workflows/thresholds/chart of accounts.
- Journal object soft-delete + versioning model with immutable posted state pattern.

## Infrastructure Requirements
1. **Encryption at rest**
   - PostgreSQL storage encryption enabled at provider layer.
   - Object storage encryption enabled with managed keys.
2. **TLS enforcement**
   - TLS 1.2+ required for all client/API/database connectivity.
3. **Automated daily backups**
   - Daily snapshots for prod databases.
4. **Retention policy**
   - Minimum 35-day rolling backup retention.
   - Event logs retained per data retention policy (minimum 1 year online).
5. **Monitoring alerts**
   - Availability, error budget, and security alerting integrated with incident workflow.
6. **RTO / RPO**
   - Target RTO: 4 hours.
   - Target RPO: 24 hours.

## SDLC Controls
- Require pull request approval before merge.
- Enforce branch protection on default branch.
- Log every deployment to `app.deployment_log`.
- Separate environment configs (`dev`, `stage`, `prod`) and prohibit production write credentials in development environments.

## Required Policies
- Access Control Policy
- Change Management Policy
- Incident Response Policy
- Business Continuity Policy
- Vendor Management Policy
- Data Retention Policy
