# Novendor CRM / Accounting — Design Adaptation

## Purpose in the design system

This is the internal Novendor operating surface. It should feel like a well-organized operations center — not a polished client-facing product. Density matters. The operator needs to move fast.

## Accent choices
- Primary accent: `--nv-purple-400`
- Accounting alerts: `--nv-amber-400` (pending approval, overdue)
- Positive states: `--nv-success`
- CRM pipeline stages: use a sequential palette (purple → pink → amber → green)

## Density
Medium-high. The accounting queue and CRM pipeline must be scannable. Tables are the primary data vehicle.

## Component emphasis
- Approval queue items must show: amount, vendor, date, status chip — all visible in the row without expanding
- CRM deal cards must show: company, stage, next action, owner
- Receipt intake must show ingestion status inline (not a separate status page)
- KPI cards in ECC brief must load independently (skeleton per card, not full-page loading)

## What this environment must NOT do
- Show placeholder text in production accounting entries
- Use a chart where a table is more appropriate for dense financial data
- Hide approval status behind a hover or click
