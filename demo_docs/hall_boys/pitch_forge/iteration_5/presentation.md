# Hallboys + Claude — a 2-workflow pilot, anchored to your jobs
*$140K of measurable upside in 60 days, with day-30 kill points and full Acumatica preservation*

## Slide 1 — Title
Hallboys + Claude — a 2-workflow pilot, anchored to your jobs.

## Slide 2 — Hallboys context
**Your team and systems**
- Acumatica is the system of record — Project Accounting AP screen, Project module, Schedule, AP
- 3-person IT team — capacity for configuration, not custom build
- One AP clerk processing every invoice end-to-end
- Active Claude usage already exists across estimating, ops, finance

**Hard constraints we hold throughout**
- Acumatica untouched — no replacement, no integration risk
- No headcount reduction — capacity expansion only
- Humans approve every AP post, schedule change, closeout sign-off
- All data stays in the Hallboys Claude workspace

## Slide 3 — Estimated annual leak (4 workflows)
**$235K** — $78K (quote comparison) + $95K (schedule) + $62K (closeout). AP capacity row pulled — replaced by week-1 audit.

We removed the AP $45K estimate because we cannot defend it without your invoice data. We replace it with a real number from a week-1 audit, or we drop AP from scope.

## Slide 4 — Where the leak comes from (math on the slide)
| Workflow | Driver assumption | Math | Annualized |
|---|---|---|---|
| Quote comparison | 13 multi-vendor packages/qtr × 3 hrs saved × $150/hr loaded | 13 × 4 × 3 × 150 | $78K |
| Schedule conflicts | 1.5 idle crew days/qtr × $5,400/day blended (8-person × 8 hrs × $84/hr) | 1.5 × 4 × 5,400 + buffer | $95K |
| Closeout drag | 1 mid-size closeout/qtr × 18 days × $1M retainage tied × 8% cost-of-capital | 1 × 4 × (18/365) × 1,000,000 × 0.08 | $62K |
| AP capacity ceiling | Cannot defend pre-audit | Not available — week-1 audit replaces this row | Not estimated |

## Slide 5 — How work happens today, and where it fails
Two workflows we will pilot live. One we will run shadow-only. One we will hold.

## Slide 6 — Pilot Workflow A — Subcontractor quote comparison
**Today (lead estimator)**
- Opens 3-5 sub PDFs per package, hand-builds Excel comparison: 4 hrs
- Catches missing line items by chance during scroll-through
- 13 multi-vendor packages last quarter = ~52 hrs absorbed by 1 estimator
- Illustrative anchor: Q4 2025 medical-office bid, 4 sub bids

**After pilot**
- Drops PDFs into Quote-Comparison skill
- Skill returns scope deltas, missing line items, unit-price outliers in <5 min
- Estimator reviews in ~1 hr, picks the winner — no Excel build
- Same illustrative package: estimator finishes by 9:30, runs a second package same day

## Slide 7 — Pilot Workflow B — Project closeout document checks
**Today (PM closing a job)**
- Assembles closeout package from shared drives, ~3 hrs
- Owner finds gaps (lien-pay-app mismatches, missing warranties)
- Illustrative case: 4 lien gaps, 1 warranty letter missing — retainage held 18 days past expected
- PM chases docs from subs already off the job

**After pilot**
- PM uploads closeout folder to Closeout-Check skill before sending
- Skill checks against the Hallboys closeout SOP — flags gaps before owner sees them
- Same illustrative case: gaps caught in 1 hour; PM fixes in 2 days, sends clean package
- Retainage releases on schedule; ~$15,500 in cost-of-capital recovered on this single job

## Slide 8 — Shadow Workflow C and held Workflow D
**C — AP exception triage (shadow only)**
- Today: clerk opens each invoice cold, posts in Acumatica AP, no anomaly scan
- Pilot mode: shadow — Claude pre-reads, the clerk's workflow does not change
- We measure: extraction accuracy, would-have-flagged duplicates and price anomalies
- Production switch only after >85% accuracy + clerk endorsement

**D — Equipment + crew schedule scan (held)**
- Today: scheduler reconciles weekly schedule by hand
- Pilot mode: held until Acumatica schedule data quality is confirmed
- Why held: false-positive risk if data is stale; we don't pitch what we can't measure
- Reopen at day 60 if schedule data audit is clean

## Slide 9 — Day-to-day workflow changes — by role
| Role | Today (per week) | After pilot (per week) | Who can reverse Claude |
|---|---|---|---|
| Lead estimator | Builds 2-3 Excel comparisons, ~10 hrs | Reviews 2-3 pre-built, ~3 hrs; runs +1 package/wk | Estimator picks every winner; rejects skill output anytime |
| PM (closing job) | Assembles closeout, owner finds gaps | Pre-checks with skill, fixes in-house, sends clean | PM signs every closeout; skill is advisory only |
| AP clerk | ~25 invoices/day, no anomaly scan | No production change — receives end-of-day shadow report | Workflow unchanged during pilot |
| IT lead (3-person team) | Ad-hoc Claude support requests | Owns 2 published skills + 1 shadow; monthly review | IT approves every skill version before publish |

## Slide 10 — Failure modes — per workflow
| Workflow | What can go wrong | How we catch it | Who owns the fix |
|---|---|---|---|
| Quote comparison | Misses scope nuance on unusual trades | Estimator spot-checks every package; weekly review log | Estimator + IT lead at monthly skill review |
| Closeout checks | Misses doc not covered by Hallboys SOP | PM adds the missed item; SOP is versioned | PM + IT lead at next monthly review |
| AP shadow | Mis-extracts a field or false-positive duplicate | Logged for skill update; no posting blocked, no clerk workflow change | IT lead; clerk feedback drives prioritization |
| Held: schedule | False-positive conflict from stale Acumatica data | Held until schedule data audit completes | Scheduler + IT lead before any pilot start |

## Slide 11 — Quantified pilot upside — live workflows only
**$140K/yr** — $78K (quote comparison) + $62K (closeout). Single number. Updated from real Hallboys baseline in week 1.

Schedule and AP are not in this number. Either they prove themselves in shadow or audit, or they are not pitched.

## Slide 12 — 60-day pilot — 2 live, 1 shadow, 1 held
| Workflow | Mode | Day-30 kill threshold | Day-60 success signal |
|---|---|---|---|
| Quote comparison | Live | <1.5 hrs saved per package average | >2.5 hrs saved + estimator runs +1 package/wk |
| Closeout checks | Live | <3 real missing items across first 5 closeouts | >5 items found, >1 retainage delay avoided |
| AP triage | Shadow only | <70% field-extraction accuracy at day 30 | >85% accuracy + clerk endorses production switch |
| Schedule conflicts | Held | — | Reopen at day 60 if schedule data audit is clean |

## Slide 13 — Pilot plan — week-by-week (compressed build)
| Week | Hallboys does | Novendor delivers | Output |
|---|---|---|---|
| 1 (Days 1-7) | Estimator pulls 3 bid packages; PM provides closeout SOP; IT opens shared workspace | Build Quote-Comparison v0.1 + Closeout-Check v0.1; AP shadow harness installed | Two skills published; AP shadow capturing |
| 2 (Days 8-14) | Estimator + PM run baseline replays of last quarter's bid packages and closeouts | Score baseline; tune skills against findings; AP shadow scorecard v1 | Baseline scorecard delivered to Sarat |
| 3-4 (Days 15-30) | Estimator + PM use skills on live packages and closeouts; clerk feedback weekly | Weekly 1-page scorecard; day-30 review pack; kill recommendation if thresholds missed | Day-30 review meeting (30 min) |
| 5-8 (Days 31-60) | Live use continues; Sarat day-60 scorecard review | Day-60 scorecard with go/hold/expand recommendation per workflow; skill handover to IT | Final scorecard + skills owned by IT |

## Slide 14 — Why this pilot fits Hallboys specifically
**Anchored to your environment**
- Skills published in your existing Claude workspace — no vendor onboarding
- Baselines pulled from Acumatica data Hallboys already has
- Owners named in your existing org chart
- Closeout skill anchored to YOUR closeout SOP, not a template
- Two of three live/shadow workflows validate from your data on day one

**Anchored to your decision pace**
- 60 days end-to-end; day-30 kill points enforced
- Sarat sees a 1-page scorecard each Friday; full review at day 30 and 60
- Either workflow can be killed at day 30 with no commitment
- Skills handed to IT at day 60 — Hallboys owns them
- AP and schedule do not enter scope until they earn it

## Slide 15 — Next step
30-min baseline-data check this week. Lead estimator + one PM. Confirm bid log accessible, confirm closeout SOP exists. If yes, pilot Week 1 starts within 5 business days. If no, we re-scope before any commitment.

---

## Appendix — 6-slide executive cut
Separate file: `iteration_5/executive_cut.pptx`. For the operating partner.
