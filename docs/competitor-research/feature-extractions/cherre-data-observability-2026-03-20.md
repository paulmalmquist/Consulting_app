# Feature: Data Observability & Validation UI — Cherre — 2026-03-20

**Source:** Cherre — cherre.com/products/platform/, businesswire.com (Data Observability launch)

## What It Does (User-Facing)
Provides a visual interface for monitoring data pipeline status, completeness, delivery, and transformation. Clients can directly manage pipelines, set custom validation rules, and see the full data journey from ingestion to delivery. Handles 20K+ ongoing schema changes and 10K+ pipelines.

## Functional Components
- Data source: Pipeline metadata, schema definitions, data quality metrics, validation rule outputs
- Processing: Real-time pipeline status tracking; automated business validation against custom rules; schema change detection and management; data profiling (completeness, freshness, accuracy)
- Trigger: Continuous monitoring; alerts on validation failures or pipeline delays
- Output: Dashboard showing pipeline health, validation results, schema changes, data freshness indicators
- Delivery: In-platform UI; likely alerting via email/webhook on failures

## Winston Equivalent
Winston does not have a dedicated data observability layer. Winston's data comes from its own database and demo environments, not from a complex multi-source data pipeline. However, as Winston scales to ingest real client data from multiple sources (property management systems, ERPs, external feeds), data observability becomes critical. This is "Moderate build" — not urgent for current demo-focused stage, but essential for enterprise deployment.

## Architectural Pattern
Pipeline metadata monitoring + rule-based validation + visual dashboard. Pattern: "pipeline event stream → metadata aggregation → rule engine validation → real-time dashboard + alerting."
