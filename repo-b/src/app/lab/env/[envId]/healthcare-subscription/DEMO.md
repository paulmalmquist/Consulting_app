# Demo — Healthcare Subscription Analytics

A 3-minute click-through for a digital-health reviewer. SYNTHETIC / NO-PHI throughout.

## Setup
Log in, open `/lab/env/{env_id}/healthcare-subscription`.

## Script

1. **Frame it.** "This is the analytics operating layer for a subscription-led longevity
   business. Every number is synthetic — no patients, no PHI. The point is the modeling and
   the governance, not the figures." Point at the non-dismissible NO-PHI banner.

2. **Exec Overview.** Walk the KPI strip: active members, MRR/ARR, ARPU, NRR (>100% — the
   expansion story), gross/net churn (net churn is negative — expansion outpaces churn),
   trial→paid, activation, month-3 retention, LTV, blended CAC, LTV:CAC, CAC payback, and the
   care-ops SLAs (lab, consult). NRR / LTV:CAC / net-churn carry directional color.

3. **Governed definitions.** Click any KPI → the metric-definition drawer opens with the
   formula, grain, owner, and source-of-record. "One definition per metric — the dashboard,
   the AI layer, and ad-hoc SQL all resolve through this. Three teams can't produce three
   different NRR numbers."

4. **Trust the plumbing.** Point at the footer: as-of date, refresh time, and the honest
   provenance label — "synthetic gold rollup (seeded)". "Freshness and provenance are
   user-facing, not buried."

5. **The boundary (talk track for the copilot phase).** "When the copilot lands, it answers
   only aggregate analytics questions. Ask it to diagnose a patient or list members and it
   refuses — schema-only, aggregate-only, small groups (<11) suppressed, every query logged.
   The capability of modern AI analytics with the data handling a health company is held to."

## What to emphasize
A real analytics architecture (governed semantic definitions, RLS tenancy, freshness/
provenance, small-cell suppression baked into the data), not a slide. Business analytics
kept strictly separate from anything clinical.
