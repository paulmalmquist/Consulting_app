# Hallboys + Claude — a 2-workflow pilot, anchored to your jobs
*$140K of measurable upside in 60 days, with day-30 kill points*

## Slide 1 — Title
Hallboys + Claude — a 2-workflow pilot, anchored to your jobs.

## Slide 2 — Hallboys context
**Your team and systems**
- Acumatica is the system of record (AP, project, schedule)
- 3-person IT team — capacity for configuration, not custom build
- One AP clerk processing every invoice end-to-end
- Active Claude usage already exists across estimating, ops, finance

**Hard constraints we hold**
- Acumatica unchanged — no replacement, no integration risk
- No headcount reduction — capacity expansion only
- No black-box automation; humans approve every AP post, schedule change, closeout sign-off
- All data stays in the Hallboys Claude workspace

## Slide 3 — Estimated annual leak on the four workflows
**$235K** — $78K (quote comparison) + $95K (schedule) + $62K (closeout) + AP "Not available, week-1 audit".

We removed the AP $45K estimate; it depended on assumptions we cannot defend without your invoice data. We replace it with a real number from a week-1 audit, or we drop the AP workflow from scope.

## Slide 4 — Where the leak comes from (math on the slide)
| Workflow | Driver assumption | Math | Annualized |
|---|---|---|---|
| Quote comparison | 13 multi-vendor packages/qtr × 3 hrs saved × $150/hr loaded | 13 × 4 × 3 × 150 | $78K |
| Schedule conflicts | 1.5 idle crew days/qtr × $5,400/day blended (8-person × 8 hrs × $84/hr) | 1.5 × 4 × 5,400 + buffer | $95K |
| Closeout drag | 1 mid-size closeout/qtr × 18 days × $1M retainage tied × 8% cost-of-capital | 1 × 4 × (18/365) × 1,000,000 × 0.08 | $62K |
| AP capacity ceiling | Too many assumptions to defend pre-audit | Not available — week-1 audit replaces this row | Not estimated |

## Slide 5 — How work happens today, and where it fails
Two workflows we will pilot live. Two we will run shadow-only or hold.

## Slide 6 — Today: pilot Workflow A — Quote comparison
**Current workflow (estimator)**
- Estimator opens 3-5 sub PDFs, hand-builds Excel comparison: 4 hrs per package
- Catches missing line items by chance during scroll-through
- 13 multi-vendor packages last quarter = ~52 hrs absorbed by 1 estimator
- Q4 2025 illustrative example: Westside MOB package, 4 sub bids

**After pilot**
- Estimator drops PDFs into Quote-Comparison skill
- Skill returns scope deltas, missing line items, unit-price outliers
- Estimator reviews in ~1 hr, picks the winner — no Excel build
- Same illustrative package: estimator finishes by 9:30, picks up another package same day

## Slide 7 — Today: pilot Workflow B — Closeout document checks
**Current workflow (PM)**
- PM assembles closeout from shared drives, ~3 hrs
- Owner finds gaps (lien-pay-app mismatches, missing warranties)
- Recent illustrative case: 4 lien gaps, 1 warranty letter missing, retainage held 18 days past expected
- PM chases docs from subs already off the job

**After pilot**
- PM uploads closeout folder to Closeout-Check skill before sending
- Skill checks against the Hallboys closeout SOP — flags gaps before owner sees them
- Same illustrative case: gaps found in 1 hour; PM fixes in 2 days, sends clean package
- Retainage releases on schedule; ~$15,500 in cost-of-capital recovered on this single job

## Slide 8 — Today: shadow Workflow C and held Workflow D
**Workflow C: AP exception triage (shadow only)**
- Today: clerk opens each invoice cold, posts in Acumatica, no anomaly scan
- Pilot mode: shadow for 30 days — Claude pre-reads, the clerk's workflow does not change yet
- We measure extraction accuracy + would-have-flagged anomalies
- Production switch only after >85% accuracy and clerk endorsement — Claude never writes to Acumatica

**Workflow D: Equipment + crew schedule scan (held)**
- Today: scheduler reconciles weekly schedule by hand
- Pilot mode: held — Acumatica schedule data quality must be confirmed first
- Why held: false-positive risk is high if the schedule data is stale; we don't pitch what we can't measure
- Reopen at day 60 if schedule data audit is clean

## Slide 9 — Day-to-day workflow changes — by role
| Role | Today (per week) | After pilot (per week) | Who can reverse Claude |
|---|---|---|---|
| Lead estimator | Builds 2-3 Excel comparisons, ~10 hrs | Reviews 2-3 pre-built, ~3 hrs; runs +1 package/wk | Estimator picks every winner; rejects skill output anytime |
| PM (closing job) | Assembles closeout, owner finds gaps | Pre-checks with skill, sends clean package | PM signs every closeout; skill is advisory only |
| AP clerk (shadow) | ~25 invoices/day, no anomaly scan | Same workflow during pilot; receives anomaly report at end of day | No production change in pilot |
| IT lead (3-person team) | Ad-hoc Claude support requests | Owns 2 published skills + 1 shadow; monthly review | IT approves every skill version before publish |

## Slide 10 — Failure modes — per workflow
| Workflow | What can go wrong | How we catch it | Who owns the fix |
|---|---|---|---|
| Quote comparison | Misses scope nuance on unusual trades | Estimator spot-checks every package; weekly review log | Estimator + IT lead at monthly skill review |
| Closeout checks | Misses doc not covered by Hallboys SOP | PM adds the missed item to skill backlog; SOP versioned | PM + IT lead at next monthly review |
| AP shadow | Mis-extracts a field or false-positive duplicate | Logged for skill update; no posting blocked, no clerk workflow change | IT lead; clerk feedback drives prioritization |
| Held: schedule | False-positive conflict from stale Acumatica data | Held until Acumatica schedule data audit completes | Scheduler + IT lead before any pilot start |

## Slide 11 — Quantified pilot upside — live workflows only
**$140K/yr** — $78K (quote comparison) + $62K (closeout). Single number, derived on slide 4. Updated from real Hallboys baseline in week 1.

Schedule and AP are not in this number. Either they prove themselves in shadow/audit, or they don't get pitched.

## Slide 12 — 60-day pilot — 2 live, 1 shadow, 1 held
| Workflow | Mode | Day-30 kill threshold | Day-60 success signal |
|---|---|---|---|
| Quote comparison | Live | <1.5 hrs saved per package average | >2.5 hrs saved + estimator runs +1 package/wk |
| Closeout checks | Live | <3 real missing items across first 5 closeouts | >5 items found, >1 retainage delay avoided |
| AP triage | Shadow only | <70% field-extraction accuracy at day 30 | >85% accuracy + clerk endorses production switch |
| Schedule conflicts | Held | — | Reopen at day 60 if schedule data audit is clean |

## Slide 13 — Pilot plan — what happens when, who does what
**Hallboys provides**
- Day 1-7: lead estimator pulls last quarter's bid log (3 packages min for baseline)
- Day 1-7: PM provides current closeout SOP
- Day 1-7: AP clerk + IT allow 30 days of historical invoices for shadow benchmark
- Day 30 + Day 60: Sarat attends 30-min scorecard reviews
- IT lead: skill ownership at day 60 handover

**Novendor delivers**
- Day 1-14: build Quote-Comparison + Closeout-Check skills in your workspace
- Day 8-21: re-run baselines; deliver baseline scorecard
- Day 22-60: live pilot with 1 estimator + 1 PM; weekly 1-page scorecard
- Day 30 + Day 60: review meetings; honest go/no-go recommendation
- Day 60: skills handed to IT, AP shadow report, schedule reopen recommendation

## Slide 14 — Next step
30-min baseline-data check this week. Lead estimator + one PM. Confirm bid log accessible, confirm closeout SOP exists. If yes, pilot starts day 8. If no, we re-scope before any commitment.
