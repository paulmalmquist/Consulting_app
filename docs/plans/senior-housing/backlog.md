# Senior Housing — Backlog

**Last updated:** 2026-05-16

## Bugs
- [ ] **Verify environment template exists** — Check `backend/app/services/environment_templates_v2.py` for a Senior Housing template. If missing, this is a blocker.

## UX improvements
- [ ] **Healthcare-specific KPIs** — Verify occupancy rate, revenue per unit (RevPAR), and NOI are visible on the portfolio page.

## Backend / API
- [ ] **HUD connector status** — `backend/app/connectors/cre/hud_fmr/` and `hud_usps_crosswalk/` — Determine if these connectors are active and what data they return.
- [ ] **Medical/healthcare routes** — Check `backend/app/routes/` for any `medical.py` or `healthcare.py` files and determine their purpose.

## Data / migrations
- [ ] **Senior housing data model** — Determine whether senior housing uses a separate Supabase table or shares REPE asset tables with a property_type filter.

## Tests
- [ ] **No known tests for senior housing** — Needs discovery before tests can be written.

## Documentation
- [ ] **Relationship to Meridian REPE** — Document how Senior Housing and REPE share or differ in their data models and routes.

## Nice-to-have
- [ ] CMS/Medicare star ratings integration
- [ ] Move-in/move-out trend visualization

## Completed
_(none yet)_
