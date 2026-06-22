# Demo — Healthcare Subscription Analytics

A 5-minute review click-through. SYNTHETIC / NO-PHI throughout.

## Setup

Use env `ceeb9ea0-9f8b-4369-b853-adcd60c01def`. HHA-2 is currently local/draft-PR
only; do not claim the production Phase 2 URLs are shipped.

## Script

1. **Overview.** Open `/healthcare-subscription`. Point out the persistent NO-PHI
   banner, four-surface navigation, KPI cards, metric-definition drawer, and seeded
   provenance footer.

2. **Funnel.** Open `/healthcare-subscription/funnel`. Walk the six ordered lifecycle
   bars from visitor through retained. Compare paid search, organic, and referral CAC
   and stage conversion fractions. Click a value to show its governed definition.

3. **Cohorts.** Open `/healthcare-subscription/cohorts`. Scroll the M0-M11 grid and
   latest-LTV column. Show the separate `womens_pilot` marker:
   `"< 11 members - suppressed"`. No pilot count, rate, revenue, or LTV is present in
   the browser payload or DOM. Explain that channel LTV:CAC is intentionally unavailable
   because channel-specific LTV is not seeded.

4. **Operations.** Open `/healthcare-subscription/operations`. Compare target, p50, p90,
   breach rate, volume, and backlog for labs, consults, fulfillment, and support.
   Consults and support receive warning treatment because p90 is over target.

5. **Trust boundary.** On every surface, verify the only shared chrome is
   `LabEnvTopBar`, the NO-PHI banner is visible, a definition drawer opens, and the
   footer reports as-of date, freshness, and seeded provenance.

## What not to claim

- HHA-2 is in review, not shipped, and not deployed.
- The rollups are seeded, not event-derived.
- Channel LTV:CAC is not available at the current data grain.
- No patient data, PHI, clinical decisioning, copilot, or write workflow is included.
