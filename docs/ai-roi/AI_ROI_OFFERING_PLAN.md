# Novendor AI ROI Reframing Exercise - Offering Plan

Status: build-ready plan. This document defines the offer, site structure, calculator intent, and asset map for the AI ROI section.

---

## Thesis

AI ROI is not a salary-savings formula. Two people can earn the same salary and free the same number of hours, but the business value of those hours changes based on what they produce and who uses it.

The public calculator should make that point fast. It is an illustrative model, not a quote. The page should teach the visitor to ask a better question: which work has the highest value path once AI gives time back?

Visible disclaimer:

> Illustrative model. Not a quote.

---

## Buyer

Primary economic buyer: COO, VP Operations, or CFO at a 50-1,000 employee company.

Primary champion: a function lead in finance, RevOps, operations, customer support, legal ops, or analytics who can name the workflows that absorb time.

Technical gatekeeper: IT, security, or data governance. This person needs access controls, audit trails, and fail-closed behavior before real data enters an AI workflow.

Poor fit:

- Companies with no repeatable operational baseline.
- Buyers asking only for a model API or a chatbot with no measurement plan.
- Teams unwilling to separate modeled gains from realized gains.

---

## Core Pains

Manual assembly: people rebuild spreadsheets, decks, and status reports every cycle.

Decision latency: work waits on one expert, reviewer, or approver.

Reporting fragility: a renamed field, new system, or reorg breaks a report and the break is found too late.

AI spend with no scoreboard: seats and tools exist, but renewal decisions have little evidence behind them.

Governance drag: useful pilots stall because access, audit, and data-boundary rules are not defined.

---

## Offer

AI ROI Assessment is the entry offer.

Scope:

- Select 3-5 target workflows.
- Measure current time cost and decision delay.
- Score where AI could return time or reduce rework.
- Check governance readiness.
- Produce a ranked shortlist and a measurement plan.

Outputs:

- Baseline cost model.
- Role and audience value map.
- Intervention shortlist.
- Governance readiness score.
- Modeled vs. realized reporting plan.

Downstream work can include deployment support and recurring ROI reporting, but the public AI ROI section sells the assessment and teaches the measurement frame.

---

## Calculator Intent

The calculator is now the AI ROI reframing exercise.

Inputs:

- Annual compensation.
- Freed hours per week.
- Role type.
- Served audience.
- Output type.

Outputs:

- Selected-role multiplier.
- Comparison across role presets using the same salary and hours.
- One insight sentence.
- A secondary dollar range marked illustrative.

The main lesson is the multiplier. Salary-only math undervalues work that affects decisions, customers, investors, or executive review cycles.

---

## Discovery Questionnaire

The assessment page includes a ten-question discovery form.

Categories:

- Manual assembly.
- Decision latency.
- Reporting fragility.
- AI spend measurement.
- Governance readiness.

Each category has two required questions. The score function blocks incomplete results and names the missing questions. A completed form returns category scores and an overall band.

---

## Site Structure

```
/ai-roi
  hero
  problem: AI spend without a scoreboard
  what we measure
  four-step assessment method
  governance gate
  case-study teaser
  calculator preview
  closing CTA

/ai-roi/assessment
  assessment scope and discovery questionnaire

/ai-roi/calculator
  full AI ROI reframing exercise

/ai-roi/case-studies
  proof format and sample cases

/ai-roi/resources
  gated one-pagers and framework download
```

Page intent:

- Landing page: convert a cold operator into an assessment conversation.
- Assessment page: explain scope and collect discovery answers.
- Calculator page: teach why AI should be pointed at high-value work.
- Case studies page: show the proof format without overstating results.
- Resources page: capture leads through downloadable one-pagers.

---

## Visual Assets

Build responsive inline visuals:

- Governance gate diagram: data in, access boundary, audit trail, fail-closed result.
- Baseline-to-target bar: current cycle time vs. target cycle time.
- ROI scoreboard mock: modeled gain, realized gain, and delta by workflow.
- Decision-latency timeline: where work waits today and where AI can remove wait time.

Use the existing Novendor dark marketing style and keep text readable at mobile widths.

---

## Asset Map

Public pages:

- Landing page.
- Assessment page.
- Calculator page.
- Case studies page.
- Resources page.

Gated assets:

- AI ROI reframing one-pager.
- AI ROI framework one-pager.

Persistence:

- `nv_ai_roi_leads` records calculator, questionnaire, and resource submissions.
- This is pre-tenant marketing intake, so `ARCHITECTURE.md` records the `env_id` and `business_id` exemption.

---

## Claims Boundaries

Do not promise a fixed productivity gain before measuring a baseline.

Do not present modeled savings as realized savings.

Do not imply headcount replacement.

Do not treat the calculator output as a quote.

Do not deploy AI on client data without access controls, audit trails, and fail-closed behavior.
