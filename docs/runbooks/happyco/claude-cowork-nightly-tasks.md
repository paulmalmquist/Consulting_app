# Claude CoWork Task Prompts — HappyCo

Last updated: 2026-05-22

This file holds the copy-pasteable prompt blocks for the HappyCo automation
cadence: 5 nightly tasks and 2 weekly tasks. See
[`automation-cadence.md`](automation-cadence.md) for how the tasks fit together.

Each prompt is self-contained. Paste one into a Claude CoWork session to run that
task by hand. None of these prompts is wired to a recurring schedule by this PR.

Shared rules every task must follow:

- Synthetic data only. Never claim real HappyCo production data or a production
  model, deployment, or serving endpoint.
- Never send email. Never create a real recurring schedule. Never print or
  expose an invite code.
- Every written claim must match
  [`claims-and-caveats.md`](claims-and-caveats.md).
- This is DOCS/EVIDENCE work plus optional artifact regeneration. Do not change
  runtime code, Databricks pipeline code, or Azure relay routing code.

---

## Nightly Task 1 — HappyCo Proof Package Nightly QA

```text
You are running the HappyCo Proof Package Nightly QA for the Consulting_app repo.

Goal: confirm the gated HappyCo package is intact and honest, and leave a dated
QA receipt.

Checks:
1. /happyco in its locked state — tailored content is hidden, no invite code is
   visible in the page source.
2. /happyco unlocked with a valid invite — tailored content renders.
3. /happyco/demo — clean demo loads with no Winston login and no Hall Boys shell.
4. /happyco/artifacts — gated; lists artifacts; no public artifact URL exposed.
5. /happyco/weather-risk — KPI strip, risk table, market summary, model/run
   receipt evidence, and chart gallery render or degrade honestly.
6. Operator APIs under /api/operator/v1/property-ops/* return deterministic
   synthetic JSON with demo metadata and caveats.
7. The ml-risk endpoint reports its databricks_status and ml_status correctly.

Assertions:
- No public artifact path is reachable without the invite cookie.
- No copy overclaims: scan shipped page text against claims-and-caveats.md.
- The weather-risk sample bundle is described as mode: local_fallback with
  placeholder charts — not as a live Databricks run.

Output: capture screenshots or route-response evidence and write a dated QA
receipt (date, each check pass/fail, evidence path, any blocker). If a blocker
is found, mark it clearly so downstream tasks stop.

Do not change runtime code. Do not send email. Do not expose invite codes.
```

---

## Nightly Task 2 — Automation Control Room Refresh

```text
You are running the Automation Control Room Refresh for the HappyCo package.

Goal: keep the Automation Room copy accurate without overclaiming.

Inputs to inspect:
- Latest commits on the HappyCo branches.
- Open PR status and any deploy status (#100/AB#392 relay, #101/AB#380 demo UX,
  #102/AB#394 Databricks refactor, #103/AB#395 export contract,
  #104/AB#393 weather-risk, this PR-4/AB#396).
- The Databricks receipt status from tonight's Task 3.
- Artifact status from tonight's Task 4.
- The latest QA receipt from tonight's Task 1.
- Known limitations in final-package-runbook.md.

Action:
- Update the Automation Control Room copy ONLY if the new copy stays fully
  honest. If anything is ambiguous, leave the copy unchanged and report why.
- Never invent a run, a deploy, or a passing test that did not happen.

Output: a short status summary — what changed in the copy, what was left alone,
and why.

Do not change runtime code. Do not send email. Do not expose invite codes.
```

---

## Nightly Task 3 — Databricks Weather Risk Run / Receipt Check

```text
You are running the Databricks Weather Risk Run / Receipt Check.

Goal: keep the weather-risk Databricks evidence current and honest.

Steps:
1. Run `databricks bundle validate -t dev` for the weather_risk bundle. This is
   expected to PASS against the workspace.
2. Run `databricks bundle deploy` and a score run ONLY if a Databricks auth
   profile is available without interactive login. Databricks CLI v1.0.0 needs
   an interactive `databricks auth login`; if that has not been done, do NOT
   attempt a run — report "no new run, auth not available".
3. If a run does execute, validate the outputs and confirm MLflow / run metadata
   is present. Capture the job ID and run ID into a receipt.
4. If no run executes, confirm the prior receipt-backed run is still the latest
   evidence (job/run IDs in repo-b/src/lib/happyco/proof.ts
   HAPPYCO_DATABRICKS_RECEIPT) and report the sample bundle state.

Honesty rules:
- The current weather-risk sample bundle at
  repo-b/public/happyco/weather-risk/latest/ is mode: local_fallback. Its chart
  PNGs are ~67-byte local-contract placeholders, NOT real charts.
- Never describe `bundle validate` passing as a live training run.
- Never claim a fresh live run unless this task actually executed one tonight
  and has a receipt for it.

Output: bundle validate result, run/no-run status with reason, receipt path or
"no new receipt", and the current honest claim sentence.

Do not change pipeline code. Do not send email. Do not expose invite codes.
```

---

## Nightly Task 4 — Artifact Regeneration

```text
You are running HappyCo Artifact Regeneration.

Goal: regenerate and validate the local proof artifacts so they match the
current synthetic fixture and ML output.

Artifacts:
- Excel workbook: HappyCo_Property_Ops_Model.xlsx
- PowerPoint deck: HappyCo_90_Day_Data_Strategy.pptx
- Architecture diagram SVG
- API excerpts JSON (artifacts/happyco/qa/api_excerpts.json)
- ML model card and metrics
- Screenshots, only if browser tooling is available in this environment

Steps:
1. Run the rebuild commands documented in final-package-runbook.md.
2. Validate each artifact opens, has the expected sheets/slides/sections, and
   carries the synthetic-data caveat.
3. Confirm no regenerated artifact has been written to a public static path.
   Artifacts stay under artifacts/happyco/ (git-ignored) or behind the gated
   artifact API.

Assertions:
- No public artifact leak. The gated artifact hub stays the only access path.
- No artifact claims real HappyCo data or production performance.

Output: which artifacts were regenerated, validation results, and confirmation
that nothing leaked to a public path.

Do not change runtime code. Do not send email. Do not expose invite codes.
```

---

## Nightly Task 5 — Recruiter Draft Prep — Draft Only

```text
You are preparing a HappyCo recruiter follow-up DRAFT. Draft only — never send.

Goal: have a concise, honest follow-up ready for review.

Produce:
1. A short follow-up message draft (a few tight paragraphs, no fluff).
2. A gated-link placeholder for /happyco — use a placeholder token, NOT a real
   invite code. The real code is set by hand at send time.
3. Top 3 proof points, each backed by evidence from tonight's QA receipt:
   - the gated synthetic proof package and clean demo,
   - the Databricks-validated modular weather-risk pipeline with a local
     fallback export bundle,
   - the receipt-backed prior Databricks training run on public weather and
     synthetic property operations data.
4. Top 3 caveats, matching claims-and-caveats.md:
   - synthetic data only, no HappyCo production data,
   - no production model, deployment, or serving endpoint,
   - the current weather-risk sample bundle is a local-fallback bundle; the
     live score run is the next gated step.
5. Optional: Outlook WinCOM draft parameters using the tracked templates under
   docs/runbooks/happyco/outlook-wincom/ — dry_run true, send_policy draft.

Hard rules:
- Do not send. Do not auto-send. Sending requires explicit human confirmation.
- Do not embed a real invite code anywhere.
- Every proof point must be true tonight per the QA receipt.

Output: the draft, the placeholder link, proof points, caveats, and optional
Outlook params — all marked DRAFT.
```

---

## Weekly Task 6 — Weekly Role-Fit Gap Analysis

```text
You are running the Weekly HappyCo Role-Fit Gap Analysis.

Goal: measure how well the proof package covers the HappyCo Head-of-Data role
and surface the gaps.

Compare the package against these role requirement areas:
- data strategy
- canonical entity model
- property graph / knowledge layer
- entity resolution
- Databricks / modern data platform
- data pipelines
- analytics and benchmarking
- machine learning
- AI-enabled workflows
- product-facing APIs
- leadership artifacts (strategy deck, 30/60/90 plan)

For each area, mark coverage as Strong / Partial / Gap with one line of evidence
(route, artifact, PR, or receipt).

Output:
1. A coverage matrix across all areas.
2. The current gaps, ranked.
3. Suggested next tickets to close the top gaps, each phrased so it can be filed
   through the azure-devops-intake skill as a Task.

Use only honest, synthetic-data-backed evidence. Do not overclaim coverage.
```

---

## Weekly Task 7 — Weekly Loom/Demo Storyboard Refresh

```text
You are refreshing the HappyCo Loom / demo storyboard.

Goal: keep the recording script current with the latest package state.

Inputs: the latest nightly QA receipt, claims-and-caveats.md, the current
weather-risk bundle state, and any new PR/deploy status.

Output:
1. A 5-7 minute Loom script following the 7-beat flow in loom-storyboard.md.
2. The exact browser tabs to open before recording.
3. What NOT to show on screen (invite codes, local artifact paths, raw
   git-ignored files).
4. The allowed and disallowed claims for this recording, from
   claims-and-caveats.md.
5. The top 3 proof points and the top 3 caveats.

When describing the weather-risk state, use this exact sentence:
"The site contract is wired. The local fallback bundle validates the interface,
and the live Databricks score run is the next gated step to replace placeholder
chart artifacts with real generated charts."

Do not invent capabilities. Keep every claim receipt-backed.
```
