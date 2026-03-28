# Demo Friction Log

Accumulated friction points observed during health checks that could impact live demos.

---

## 2026-03-27 — Meridian REPE

| Friction Point | Severity | Workaround | Fix Path |
|---|---|---|---|
| AI Chat returns "Failed to create conversation: 500" | P0 — blocks entire AI demo | Skip Winston entirely; narrate what it would do | Fix backend conversation creation endpoint — check Railway logs |
| IGF VII shows TVPI 0.21x / IRR -98.9% while AI summary says 2.59x / 87.2% | P0 — visible contradiction on same page | Demo only the debt fund (MCOF I) where metrics align | Fix TVPI/IRR calculation to include unrealized NAV |
| Paid-In exceeds Committed on both equity funds | P1 — impossible for closed-end funds | Avoid scrolling to Capital section or demo debt fund only | Investigate paid-in data source / double-counting |
| Portfolio NAV ($2.1B) doesn't match sum of fund remaining values (~$58.6M) | P1 — header contradicts detail pages | Don't compare fund list to fund detail in same demo flow | Align NAV calculation across portfolio and fund views |
| All investments show "No type / No market / No valuation / Pending" | P2 — looks unseeded | Don't expand Portfolio Assets table | Seed investment sub-records (property_type, market, valuation) |
| Distribution events all show "0 payout rows" | P2 — hollow detail | Stay on summary view, don't click into events | Seed payout rows for paid events |
| Fund list Capital Activity and Asset Map show empty placeholders | P3 — not impressive | Scroll past or demo from fund detail instead | Seed capital activity and asset location data |

---

## 2026-03-27 — Stone PDS

| Friction Point | Severity | Workaround | Fix Path |
|---|---|---|---|
| Client risk scores all 0.0 on Home | LOW — looks unfinished | Scroll past Client Risk section quickly | Seed `pds_client_satisfaction_snapshot` data |
| Pipeline empty state | LOW — not impressive | Skip Pipeline page or use it to demo "Create Deal" workflow | Seed pipeline deals |
| Three "Coming Soon" stubs in nav (Backlog, Fee Variance, Capacity Planning) | LOW — visible in nav | Don't click during demo | Build pages or hide nav entries |
| Avg SPI 0.09 on Schedule Health | INFO — possibly confusing | Brief through quickly; focus on health distribution (165/87/0) | Investigate SPI calculation with seed data |
| Resources/Timecards empty states | LOW — not data-rich | Skip or brief through | Seed utilization and timecard data |

### Resolved (2026-03-27)

| Friction Point | Prior Severity | Resolution |
|---|---|---|
| Tech Adoption page crashes ("_ is not iterable") | HIGH — skip page | **FIXED** — null guards added, page renders tool overview |
| Forecast "Total Deals: NaN" | MEDIUM — visible bug | **FIXED** — now shows 202 deals correctly |
| Satisfaction "NPS Score: NaN" | MEDIUM — visible bug | **FIXED** — now shows +42 NPS Score |
| Schedule Health redirects to Delivery Risk | LOW — confusing nav | **FIXED** — renders own page with SPI data |

---

## 2026-03-26 — Stone PDS (superseded by 2026-03-27)

| Friction Point | Severity | Workaround | Fix Path |
|---|---|---|---|
| Tech Adoption page crashes ("_ is not iterable") | HIGH — skip page | Do not navigate to `/pds/adoption` during demo | Add null guard on iterable in `adoption/page.tsx` |
| Forecast "Total Deals: NaN" | MEDIUM — visible bug | Focus on Weighted Pipeline ($523,990) which renders correctly | Guard `deals?.length ?? 0` in Deal Funnel label |
| Satisfaction "NPS Score: NaN" | MEDIUM — visible bug | Skip NPS gauge; show Importance vs Performance scatter and verbatims instead | Fix NPS calculation null guard |
| Schedule Health redirects to Delivery Risk | LOW — confusing nav | Don't click Schedule Health in demo | Build page or remove nav entry |
| Client risk scores all 0.0 on Home | LOW — looks unfinished | Scroll past Client Risk section quickly | Fix seed data quality |
| Pipeline empty state | LOW — not impressive | Skip Pipeline page or use it to demo "Create Deal" workflow | Seed pipeline deals |
