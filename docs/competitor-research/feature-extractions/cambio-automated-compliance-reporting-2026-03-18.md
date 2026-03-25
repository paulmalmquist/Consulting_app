# Feature: Automated Compliance Reporting (GRESB/TCFD/SFDR) — Cambio — 2026-03-18

**Source:** Cambio — https://cambio.ai

## What It Does (User-Facing)
Automatically generates regulatory and investor reporting submissions (GRESB, TCFD, SFDR, EnergyStar) from property operating data — eliminating the analyst hours spent collecting, formatting, and manually submitting ESG disclosures every reporting cycle.

## Functional Components

- **Data source:** Structured building data (energy, water, waste); portfolio metadata; asset-level operating metrics
- **Processing:** Map operational data to reporting framework schemas (GRESB taxonomy, TCFD framework categories, SFDR PAI indicators); calculate required metrics; generate compliant submission packages
- **Trigger:** Scheduled (annual/quarterly reporting cycles); on-demand
- **Output:** Pre-populated regulatory submission packages; investor ESG reports; benchmarking data
- **Delivery:** Direct submission to GRESB portal; PDF/Word export for investor reporting; in-app dashboard

## Winston Equivalent
Winston does not currently have ESG/compliance reporting automation. This is a gap — though it's worth noting that REPE firms in Winston's target segment (smaller GPs, $500M–$5B AUM) may have less ESG reporting pressure than large institutional funds. However, as LP mandates evolve, this becomes a real requirement. Classification: Major build (requires ESG data model, regulatory schema mapping, and submission tooling) but the underlying data ingestion infrastructure is partially shared with Winston's document pipeline.

## Architectural Pattern
Schema-mapping engine (operational data → regulatory taxonomy) + metric calculation layer + templated report generation + optional direct API submission to reporting portals (GRESB API). Key complexity is the regulatory schema maintenance as frameworks evolve.
