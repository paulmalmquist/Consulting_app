# Business Machine SOC 2 Type II Readiness — Inventory & Gap Analysis

## Phase 1 Inventory (Current State)

### 1) Authentication System
- Frontend auth is invite-code based and issues a single cookie (`demo_lab_session`) without user identity binding, MFA, device posture, or session rotation.
- Middleware checks only presence of the cookie for protected routes.
- Backend APIs do not enforce authenticated principals at request boundary.

### 2) Role-Based Access Control (RBAC)
- Database has role/permission primitives in baseline schema and document ACL patterns.
- Business OS API services currently operate without centralized permission middleware and mostly trust request data.
- No formal access review workflow exists for periodic certification.

### 3) Database Schema
- Existing schema includes core business tables, work items, and `audit_events`.
- Workflow statuses exist as enums for work and executions, but transition policies are not centrally enforced.
- No dedicated global append-only event log with before/after state across all state mutations.
- No explicit segregation-of-duties policy tables.

### 4) Logging Infrastructure
- `audit_events` captures tool/action logs with redaction.
- Logging is partial and endpoint-specific; not all state-changing actions are consistently captured.
- No control-indexed evidence packet export for auditors.

### 5) Deployment Pipeline
- Build/test commands exist in Makefile.
- No repository-enforced branch protection or PR approval policy-as-code in repo.
- No deployment log table currently capturing commit hash, actor, and target environment.

### 6) Environment Separation (dev/stage/prod)
- Env vars are separated by `.env` examples per component.
- No explicit environment-level write guards or config control evidence in product DB.

### 7) Backup Configuration
- Backup process not tracked in product data model.
- No restore verification tracker/evidence table.

### 8) Audit Trails
- `audit_events` exists but is not a universal immutable ledger for all critical changes.
- Config changes (roles/workflows/thresholds/chart of accounts) not uniformly logged through a single mechanism.

### 9) Journal / Transaction Workflows
- Accounting constructs exist in DB backbone.
- Explicit SoD (creator cannot approve own transaction) not centrally implemented as configurable rules.
- No immutable posted-entry lifecycle + version lineage table for journal entries in Business OS schema extension.

## Structured Gap List

### Security Gaps
1. Weak authentication (shared invite code, no MFA enforcement).
2. Missing API-level permission middleware and principal-to-action authorization checks.
3. Role changes are not uniformly event-logged in a dedicated compliance event ledger.
4. Admin privilege boundaries and break-glass flows are undocumented.

### Missing Auditability
1. No single append-only global event log for all critical mutations.
2. Inconsistent before/after snapshot capture.
3. No evidence packet generator mapped by control and date range.
4. No formal incident timeline module with exportable artifacts.

### Missing Segregation of Duties
1. No reusable SoD policy matrix in code + DB.
2. Creator/approver conflict rules not enforced for transaction approvals.
3. Approval routing controls are not centrally logged as enforceable decisions.

### Missing SDLC Controls
1. Branch protection + required PR approvals not codified in repo docs.
2. Deployments are not logged in product DB as immutable records.
3. Environment promotion controls and separation-of-access requirements not documented in architecture docs.

### Missing Infrastructure Controls
1. Encryption-at-rest, TLS requirements, backup retention, and monitoring expectations are not consolidated in one architecture source of truth.
2. No product-native backup restore test evidence tracker.
3. No RTO/RPO commitments captured in repository docs.

## Architecture Diagram (Text) — Target SOC 2 Minimum Viable Compliance Architecture

```text
[Users / Reviewers / Operators]
        |
        v
[Frontend Next.js]
  - Compliance UI (/compliance)
  - Audit Explorer
  - Access Review workflow
        |
        v
[Business OS API (FastAPI)]
  +-----------------------------+
  | Compliance Layer Module     |
  | - Control Registry          |----> [control_registry table/view]
  | - Evidence Collector        |----> [event_log + compliance exports]
  | - Access Review Engine      |----> [access_review tables]
  | - SoD Engine                |----> [segregation_of_duties_rule]
  | - Incident Logger           |----> [incident tables]
  | - Backup Verification       |----> [backup_verification_log]
  +-----------------------------+
        |
        +-------> [RBAC Middleware + policy checks]
        |
        +-------> [State Machine Guardrails]
        |
        v
[PostgreSQL / Supabase]
  - event_log (append-only)
  - role assignment + permission mapping
  - config_change_log
  - journal_entry_version
  - deployment_log
  - incident/access review/backup evidence tables

Control Mapping:
- Security: RBAC + SoD + role change logging + access review evidence.
- Availability: backup verification log + deployment log + incident timeline.
- Processing Integrity: explicit workflow state transitions + approval routing + immutable posting/versioning.
```
