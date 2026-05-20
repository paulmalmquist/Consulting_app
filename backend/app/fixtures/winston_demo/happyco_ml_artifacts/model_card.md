# HappyCo Property Ops Predictive Maintenance Risk Model

## Purpose
Demonstrate a Databricks-ready, product-facing ML workflow for property operations risk.

## Use Case
Predict whether a property/building/category cluster is likely to produce a repeat work order, reopened ticket, or maintenance escalation in the next 30 days.

## Data
- Source: deterministic synthetic HappyCo Property Ops fixture.
- Caveat: not HappyCo production data.
- Pipeline frame: Bronze operational extracts -> Silver canonical records -> Gold benchmark/features -> ML feature table -> batch inference.

## Model
- Name: `happyco_property_maintenance_escalation_risk`
- Version: `happyco-property-ops-risk-v1`
- Type: logistic regression.
- Priority: explainability over raw performance.

## Metrics
- Accuracy: 0.9
- ROC AUC: 0.9375
- Positive rows: 7
- Total rows: 30

## Honesty Note
Synthetic labels may be deterministic or partially separable; treat metrics as a demo-data validation signal, not expected production performance.

## Deployment Status
`local_demo_only`

## Caveat
Synthetic demo model trained on deterministic demo data. Not HappyCo production data and not evidence of real-world expected performance.
