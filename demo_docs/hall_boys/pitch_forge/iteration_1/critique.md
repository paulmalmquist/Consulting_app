# Sarat Mode Critique — Iteration 1
**Overall verdict: REJECT** — Score **62/100**

## Score breakdown
| Dimension | Score | Notes |
|---|---|---|
| Specificity | 14/25 | Mentions Hallboys context but zero named jobs, vendors, PMs, or estimators. Could be any GC. |
| Economic Value | 13/25 | Every number is a range. "~3 hrs", "$5K-8K", "1.5-1.8x". Sarat asks for one number, gets a hedge. |
| Fit to Constraints | 16/20 | Acumatica untouched, AP clerk unchanged, IT team feasible. Strong on this dimension. |
| Evidence Quality | 9/15 | Most claims tagged "Not available — to be validated" honestly, but no current evidence beyond context. |
| Demo Readiness | 10/15 | Workflows are concrete; pilot plan is broad ("two skills, recommend quote comparison + closeout"); no day-1 demo. |

## Section verdicts
| Section | Verdict | Reason |
|---|---|---|
| Title | PASS | Clear scope. |
| Hallboys Context (slide 2) | PASS | Hits the constraints. |
| Current State (slide 3) | WEAK | Reads like a generic GC current-state slide. No named role, no named system module within Acumatica. |
| Problem Framing (slide 4) | WEAK | Bullets describe categories of leaks, not Hallboys-specific leaks. Could be cut-and-pasted to any contractor. |
| Use Case 1 — Quote comparison (slide 6) | WEAK | "~3 hrs saved" is a hedge. Need a single defensible number tied to one prior bid package. |
| Use Case 2 — Scheduling (slide 7) | WEAK | "$5K-8K per avoided idle day" — Sarat will ask which job. No answer. Confidence is "low-medium" — own it or cut it. |
| Use Case 3 — AP triage (slide 8) | WEAK | "1.5x to 1.8x" is a double range. The "0 writes to Acumatica" point is buried in risks instead of front-and-center. |
| Use Case 4 — Closeout (slide 9) | WEAK | "Breakeven" framing is good but no dollar number anywhere. Sarat wants the retainage number. |
| Use Case 5 — Skill governance (slide 10) | REJECT | "Skills decay if no one maintains" is the entire pitch killed in one bullet. No money attached. The internal team could already do this — Sarat will say so. |
| Day-to-Day Workflow Changes (slide 11) | PASS | Best slide in the deck. Real before/after. |
| Quantified Impact (slide 12) | WEAK | Same problem as the use-case slides — every number is a range. |
| Failure Modes (slide 13) | PASS | Good — directly answers "what happens when Claude is wrong". |
| Why this fits Hallboys (slide 14) | WEAK | "Respects what you have / avoids what you don't" is generic. None of these bullets prove fit; they assert it. |
| Pilot Plan (slide 15) | WEAK | Day-30 kill points referenced but not defined on this slide. "Recommend" is hedge language. |
| Next Step (slide 16) | WEAK | "Agree on two workflows" is a meeting outcome, not a next step. Should be a single calendar action. |

## Sarat's voice — what he says in the room
> "Five workflows? You just told me your team is three people deep in IT. Pick three, kill two. And every dollar number on this deck is a range. '~3 hours.' '$5K-8K.' '1.5x to 1.8x.' Pick one of YOUR bid packages from last quarter, run it through this thing, and tell me the actual number. The skill governance slide is the weakest — that's a knowledge management problem we can solve internally, not a Novendor pitch. And the closing slide tells me to 'agree on two workflows' — that's not a next step, that's a meeting agenda."

## Specific kills (what gets rejected in a live conversation)
1. **Slide 7 — scheduling**: Sarat will ask "which job?" There is no answer.
2. **Slide 10 — skill governance**: "Anything the internal team could already do" — this is the constraint we were told to enforce. Skill governance violates it.
3. **Slide 14 — Why this fits Hallboys**: Reads like a Novendor sales slide, not an operational fit assessment.

## What is generic (would survive a search-and-replace to any GC)
- Slide 3, all bullets — could be any general contractor on any ERP
- Slide 4, all bullets — generic categories of operational leaks
- Slide 14, both columns — boilerplate "respect / avoid"

## Required fixes for Iteration 2
1. **Cut from 5 use cases to 4 max.** Skill governance must go — it's the workflow Sarat will say his team can do.
2. **Replace every range with a single number** — even if labeled "estimate, validate week 1". One number. No "~", no dashes between numbers.
3. **Lead with the dollar problem, not the workflow catalog.** Restructure so problem framing has a real total-leak number on it.
4. **Anchor at least 2 use cases to a named or anonymized prior Hallboys job** — "Q4 2025 Westside MOB bid package", "March 2026 retainage chase on the [Job X] closeout".
5. **Move "0 writes to Acumatica" to the headline of the AP slide**, not buried in risks.
6. **Define the day-30 kill thresholds on the pilot-plan slide itself**, not by reference.
7. **Closing slide must be a single concrete next action**, not "agree on workflows".

## Missing data Sarat needs before iter 2 lands
- Real bid-package volume per estimator per month
- One named historical Hallboys idle-day incident
- AP duplicate-invoice rate (or honest "Not available, will pull week 1")
- Hallboys closeout SOP existence (yes/no)
- Average retainage tied up per delayed closeout
