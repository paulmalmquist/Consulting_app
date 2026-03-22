# Compliance Layer Module

This module defines product-level compliance building blocks for SOC 2 Type II:

- Control Registry (`/api/compliance/controls`)
- Evidence Collector (`/api/compliance/evidence/export`)
- Access Review Workflow (`/api/compliance/access-reviews`)
- Audit Log Explorer (`/api/compliance/event-log`)
- Backup Verification Tracker (`/api/compliance/backups/verify`)
- Incident Log (`/api/compliance/incidents`)
- Configuration Change Logging (`/api/compliance/config-changes`)
- Deployment Logging (`/api/compliance/deployments`)

All critical operations write to `app.event_log` as append-only evidence.
