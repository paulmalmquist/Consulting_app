# Demo Friction Log

Accumulated friction points observed during PDS health checks that could impact live demos.

---

## 2026-03-26 — Stone PDS

| Friction Point | Severity | Workaround | Fix Path |
|---|---|---|---|
| Tech Adoption page crashes ("_ is not iterable") | HIGH — skip page | Do not navigate to `/pds/adoption` during demo | Add null guard on iterable in `adoption/page.tsx` |
| Forecast "Total Deals: NaN" | MEDIUM — visible bug | Focus on Weighted Pipeline ($523,990) which renders correctly | Guard `deals?.length ?? 0` in Deal Funnel label |
| Satisfaction "NPS Score: NaN" | MEDIUM — visible bug | Skip NPS gauge; show Importance vs Performance scatter and verbatims instead | Fix NPS calculation null guard |
| Schedule Health redirects to Delivery Risk | LOW — confusing nav | Don't click Schedule Health in demo | Build page or remove nav entry |
| Client risk scores all 0.0 on Home | LOW — looks unfinished | Scroll past Client Risk section quickly | Fix seed data quality |
| Pipeline empty state | LOW — not impressive | Skip Pipeline page or use it to demo "Create Deal" workflow | Seed pipeline deals |
