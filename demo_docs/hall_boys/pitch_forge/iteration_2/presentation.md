# Where Hallboys is leaking time — and four workflows to close it
*An operational proposal grounded in the jobs you ran last quarter*

## Slide 1 — Title
Where Hallboys is leaking time — and four workflows to close it.

## Slide 2 — The leak we are estimating
**$280K/yr** — Working estimate of recoverable leak across estimating, scheduling, AP, and closeout.

Not a forecast. Built from public construction benchmarks layered onto Hallboys' team shape. Validated or revised in week 1 against your own jobs.

## Slide 3 — How the $280K splits
| Workflow | Annualized leak (est.) | Driver | Validation source |
|---|---|---|---|
| Quote comparison | $78K | Estimator hours absorbed by manual comparison | Last quarter's bid log |
| Schedule conflicts | $95K | 1-2 idle crew days/quarter at $5,400/day blended | Acumatica schedule changes, last 90 days |
| AP capacity ceiling | $45K | Invoice volume at clerk capacity, growth costs OT or hire | 30 days of AP invoice receipts |
| Closeout drag | $62K | Retainage delay = ~2 weeks working capital on mid-size job | Hallboys closeout SOP + last 4 closed jobs |

## Slide 4 — Hallboys context
**Your team and systems**
- Acumatica is the system of record (AP, project, schedule)
- 3-person IT team — capacity for configuration, not custom build
- One AP clerk processing every invoice end-to-end
- Active Claude usage already exists across estimating, ops, finance

**Constraints we hold throughout**
- No replacement of Acumatica or any current system
- No headcount reduction — capacity expansion only
- No black-box automation on AP, contracts, or schedule
- No data leaves the Hallboys Claude workspace

## Slide 5 — How work happens today (the leaking parts)
Three workflows where the leak above is concentrated.

## Slide 6 — Today's workflow — three pain points
**Estimating + Scheduling**
- Estimator opens 3-5 sub PDFs, hand-builds Excel comparison: 4 hrs/package
- Q4 2025 example: estimator ran 11 packages, ~44 hrs absorbed
- Scheduler reconciles equipment + sub list manually each Monday
- Q1 2026: one concrete pour shifted, crew of 8 idle 1 day

**AP + Closeout**
- AP clerk opens each invoice cold, posts in Acumatica AP screen
- No automated duplicate or pricing-anomaly check
- PMs assemble closeout from shared drives, gaps caught by owner
- Recent closeout: lien waiver gaps held retainage 18 days past expected

## Slide 7 — Four workflows
We removed skill governance. It is a knowledge-management problem your IT team can solve internally.

## Slide 8 — Workflow 1: Subcontractor quote comparison
**Owner: lead estimator. Anchor: Q4 2025 Westside MOB bid package.**
- Current: estimator builds Excel comparison from 3-5 sub PDFs, 4 hrs per package
- Intervention: estimator drops PDFs into Claude skill returning scope deltas, missing line items, risk flags
- Tomorrow: estimator opens pre-built comparison, picks winner — no Excel build
- Impact: 3 hrs saved per multi-vendor package = $78K/yr at current package volume
- Confidence: medium — validated week 1 by re-running 3 packages from Q4 2025 bid log
- Risks: scope nuance on unusual trades; Not available — exact bid-package volume per estimator

## Slide 9 — Workflow 2: Equipment + crew schedule conflict scan
**Owner: scheduler. Anchor: Q1 2026 concrete pour shift incident.**
- Current: scheduler reconciles weekly schedule by hand against equipment, sub commitments, master plan
- Intervention: weekly schedule + equipment list go into Claude skill flagging overlaps, missing deliveries, dependency breaks
- Tomorrow: Monday meeting opens with flagged conflict list — scheduler decides each call
- Impact: avoiding 1 idle crew day = $5,400 (Q1 2026 incident: crew of 8 × 8 hrs × ~$84/hr blended)
- Confidence: medium — single Hallboys incident anchor, validated against last 90 days of Acumatica schedule changes
- Risks: schedule data quality drives output; false positives expected first 30 days

## Slide 10 — Workflow 3: AP exception triage (0 writes to Acumatica)
**Owner: AP clerk. Headline: Claude never posts. The clerk owns every approval.**
- Current: clerk opens each invoice cold, manually keys into Acumatica AP screen, checks PO, posts
- Intervention: Claude pre-reads invoice, extracts vendor/amount/PO match, flags duplicates and pricing drift; clerk reviews and posts in Acumatica unchanged
- Tomorrow: clerk works from triaged queue with anomalies surfaced first — same Acumatica screen
- Impact: 1.6x current invoice volume per clerk-day at same catch rate; defers ~$45K in OT or new-hire cost
- Confidence: medium — validated through 30-day shadow mode before any clerk workflow change
- Risks: false-positive duplicate flags possible; Not available — current duplicate-invoice rate (week-1 pull)

## Slide 11 — Workflow 4: Closeout document checks against your SOP
**Owner: PM on closing job. Anchor: recent retainage held 18 days past expected.**
- Current: PM assembles closeout package from shared drives, owner finds gaps, retainage delay follows
- Intervention: PM uploads closeout folder to Claude skill checking against Hallboys closeout SOP
- Tomorrow: PM gets missing-item list before sending the package, fixes gaps in-house
- Impact: removing one 18-day retainage delay/quarter = ~$62K/yr working capital recovered (1 mid-size job/quarter, ~$1M retainage tied)
- Confidence: medium-high — depends on Hallboys closeout SOP being current and accessible
- Risks: SOP completeness; doc not in SOP will not be flagged; Not available — confirmed current SOP version

## Slide 12 — Day-to-day workflow changes
| Role | Today (per week) | After pilot (per week) | What stays the same |
|---|---|---|---|
| Lead estimator | Builds 2-3 Excel comparisons, ~10 hrs | Reviews 2-3 pre-built comparisons, ~3 hrs | Estimator picks every winner; no auto-award |
| Scheduler | ~3 hrs reconciling Monday schedule | Opens Monday meeting with conflict list, ~30 min | Scheduler approves every change; no auto-reschedule |
| AP clerk | ~25 invoices/day, no anomaly scan | ~40 invoices/day from triaged queue | Clerk posts every invoice in Acumatica; Claude never writes |
| PM (closing job) | Assembles package, owner finds gaps | Pre-checks against SOP, sends clean package | PM signs off every closeout |

## Slide 13 — Failure modes
**What can go wrong**
- Quote comparison: misses scope nuance on unusual trades
- Schedule scan: false-positive conflict from stale Acumatica data
- AP triage: flags legitimate invoice as duplicate
- Closeout: misses doc not covered by SOP
- Skill output drifts as vendors or scope change

**Where the human still owns the call**
- Estimator picks the bid winner
- Scheduler approves every change
- AP clerk posts every invoice in Acumatica
- PM signs every closeout package
- IT lead approves every skill version

## Slide 14 — 60-day pilot — kill thresholds defined here
| Workflow | Owner | Day-30 kill threshold | Day-60 success signal |
|---|---|---|---|
| Quote comparison | Lead estimator | <1.5 hrs saved per package average | >2.5 hrs saved + estimator capacity for +1 package/wk |
| Closeout checks | PM (closing job) | <3 real missing items found across first 5 closeouts | >5 missing items found, >1 retainage delay avoided |
| AP triage (shadow only) | AP clerk + IT | <70% extraction accuracy in shadow mode | >85% accuracy + clerk endorses production switch |

## Slide 15 — Next step
Schedule the day-7 baseline review. 30 min with lead estimator and one PM to pull last quarter's bid log and the closeout SOP. Pilot starts day 8 if data is intact. We exit if it is not.
