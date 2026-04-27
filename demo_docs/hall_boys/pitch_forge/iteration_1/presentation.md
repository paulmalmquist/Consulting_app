# Claude at Hallboys — Operational Workflows
*Five candidate workflows where Claude can save time, capacity, or risk inside Hallboys' current systems*

## Slide 1 — Title
Claude at Hallboys — Operational Workflows.

## Slide 2 — Hallboys Context
- GC operating with Acumatica as ERP and system of record
- 3-person internal IT team — no spare capacity for a 6-month build
- One AP clerk processing every invoice end-to-end
- Claude already in active use across the organization, mostly ad-hoc
- No deployed agentic workflows today, no shared skill library, no audit trail
- Field, office, and finance work happen on different cadences (daily, weekly, monthly)

## Slide 3 — Current State
**Office and finance**
- Estimator manually compares sub quotes in Excel — 3 to 5 vendors per package
- AP clerk receives invoices via email, posts each one in Acumatica AP screen
- PMs assemble closeout packages from shared drives, no formal pre-check
- Schedule changes flow through verbal updates and Acumatica project records

**Field and ops**
- Equipment scheduled by hand against a master schedule — no conflict checker
- Sub coordination happens in weekly meetings and ad-hoc texts
- Job folders live partly on Acumatica, partly on shared drives
- Closeout punch and warranty docs collected late, often during retainage chase

## Slide 4 — Problem Framing
**Economic leaks**
- Estimator hours absorbed by quote comparison
- AP clerk capacity capped, invoice volume grows faster than headcount
- Retainage held longer than necessary
- Idle crew days from preventable schedule conflicts

**Operational leaks**
- Sub scope gaps surfacing after award
- Duplicate invoices and pricing drift
- Closeout missing items found by owner
- Claude usage today is private, no reuse, no review

## Slide 5 — Five candidate workflows
Each is bounded to one role, one cadence, and one measurable outcome. None require new systems.

## Slide 6 — Use Case 1: Subcontractor quote comparison
- Current: estimator opens 3-5 sub quote PDFs, builds Excel comparison, ~4 hrs/package
- Intervention: Claude skill returns scope deltas, missing line items, risk flags
- Tomorrow: estimator opens a pre-built comparison instead of building one
- Impact: ~3 hrs saved per multi-vendor bid package
- Confidence: medium (validate week 1 against last quarter's bid log)
- Risks: missed scope nuance on unusual trades; Not available — current bid-package volume

## Slide 7 — Use Case 2: Equipment and crew scheduling
- Current: scheduler reconciles schedule by hand each week
- Intervention: weekly schedule + equipment list go into Claude skill, conflicts surfaced
- Tomorrow: Monday meeting opens with pre-flagged conflict list
- Impact: ~$5K-8K per avoided idle crew day on a mid-size job
- Confidence: low-medium (depends on Hallboys' historical conflict rate)
- Risks: schedule data quality drives output; Not available — historical idle-day cost

## Slide 8 — Use Case 3: AP exception triage (assisted only)
- Current: AP clerk opens each invoice cold, posts in Acumatica
- Intervention: Claude pre-reads each invoice — extracts fields, flags duplicates and price drift
- Tomorrow: clerk works from triaged queue; still posts in Acumatica
- Impact: target 1.5x-1.8x invoices/clerk-day at same catch rate
- Confidence: medium (validated through 30-day shadow mode first)
- Risks: Claude never writes to Acumatica; Not available — current duplicate-invoice rate

## Slide 9 — Use Case 4: Project closeout document checks
- Current: PM assembles closeout package manually, gaps caught by owner
- Intervention: Claude checks closeout folder against Hallboys SOP — missing items, mismatched dates, lien gaps
- Tomorrow: PM gets missing-item list before sending package
- Impact: avoiding 1 retainage delay/quarter is breakeven for this workflow alone
- Confidence: medium-high (depends on documented closeout SOP)
- Risks: SOP must be current; Not available — average retainage tied up per delayed closeout

## Slide 10 — Use Case 5: Claude skill governance
- Current: every Claude user writes their own prompts; no version control
- Intervention: small set of versioned skills, owned by IT, used by everyone
- Tomorrow: Claude users open right skill instead of blank prompts
- Impact: reduce duplicate prompt rebuilding; consistent outputs
- Confidence: high (mechanical change)
- Risks: skills decay if no owner; Not available — current Claude user count and hours/week

## Slide 11 — Day-to-Day Workflow Changes
| Role | Today | Tomorrow | Touches Acumatica? |
|---|---|---|---|
| Lead estimator | Builds bid comparison in Excel, ~4 hrs/package | Reviews pre-built comparison, picks winner | No |
| Scheduler | Reconciles schedule by hand each Monday | Opens Monday meeting with conflict list in hand | Reads only |
| AP clerk | Opens each invoice cold, posts to Acumatica | Works from triaged queue, posts to Acumatica as today | Posts (unchanged) |
| PM on closing job | Assembles package, gaps found by owner | Pre-checks against SOP, fixes gaps before sending | No |
| IT lead | Ad-hoc Claude support requests | Owns 5 published skills, monthly review cadence | No |

## Slide 12 — Quantified Impact
| Workflow | Lever | Target signal | Confidence |
|---|---|---|---|
| Quote comparison | Capacity (hours) | ~3 hrs saved per bid package | Medium |
| Schedule coordination | Risk (idle day) | $5K-8K per avoided idle day | Low-medium |
| AP triage | Capacity (volume) | 1.5-1.8x invoices per clerk-day | Medium |
| Closeout checks | Cost (retainage) | 1 avoided delay per quarter = breakeven | Medium-high |
| Skill governance | Risk + capacity | All 5 skills in active use by day 60 | High |

## Slide 13 — Failure Modes
**Where Claude can be wrong**
- Misses scope nuance on unusual trades
- Surfaces false-positive schedule conflicts when Acumatica data is stale
- Flags legitimate invoice as duplicate
- Misses closeout doc not covered by SOP
- Skill output drifts as scope conventions change

**Where the human owns the call**
- Estimator picks the bid winner
- Scheduler approves every change
- AP clerk posts every invoice in Acumatica
- PM signs every closeout package
- IT lead approves every skill version

## Slide 14 — Why this fits Hallboys
**Respects what you have**
- Acumatica stays the system of record
- AP clerk role unchanged — capacity expands, headcount does not shrink
- 3-person IT team can own this — skills are configured, not engineered
- Builds on Claude usage you already have
- Pilots fit existing meeting cadences

**Avoids what you don't want**
- No custom system build, no new ERP
- No data leaves the Hallboys Claude workspace
- No black-box automation on AP, contracts, or schedule
- No 6-month rollout — 60-day pilot with day-30 kill points
- No vendor lock-in

## Slide 15 — Pilot Plan (60 days, exit any time)
- Days 1-7: pull baselines (bid log, closeout SOP, AP volume)
- Days 8-21: publish 2 skills (recommend quote comparison + closeout)
- Days 22-30: pilot in production with one estimator and one PM; day-30 kill points enforced
- Days 31-45: pull AP duplicate-rate baseline; consider adding AP triage
- Days 46-60: hand skills to IT for ongoing ownership
- Exit at any review point with no penalty

## Slide 16 — Next Step
Agree on two workflows for the 60-day pilot. Recommend quote comparison + closeout.
