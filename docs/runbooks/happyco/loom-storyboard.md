# HappyCo Loom Storyboard

Last updated: 2026-05-22

A 5-7 minute Loom recording script for the HappyCo Property Ops Intelligence Kit.
The recording is private proof-of-work for the HappyCo Head-of-Data role. It runs
on deterministic synthetic data and a local-fallback Databricks bundle.

Pre-recording prep lives in
[`pre-recording-checklist.md`](pre-recording-checklist.md). Claim boundaries live
in [`claims-and-caveats.md`](claims-and-caveats.md). Read both before recording.

## Recording at a glance

- Target length: 5-7 minutes.
- Tone: calm, specific, no hype. Show the work, name the caveats.
- Structure: 7 beats. Roughly 45-60 seconds each.
- Open every claim with what is real and what is synthetic. Say "synthetic" out
  loud early so it frames the whole demo.

## The 7-beat flow

### Beat 1 — `/happyco` (about 45 sec)

Open the gated landing page.

- This is private proof-of-work for the HappyCo Head-of-Data role.
- Access is invite-gated — a `happyco_demo_access` cookie set by an invite code.
  Do not show or read the code on camera.
- State plainly: every figure in this package is deterministic synthetic data,
  not HappyCo production data.
- One sentence on intent: this shows how I would approach HappyCo's data
  platform, end to end.

### Beat 2 — `/happyco/demo` (about 60 sec)

Open the clean demo.

- Point out it is a clean surface — no Winston login, no Hall Boys operator
  shell. It is built to be shown directly.
- Walk the property-ops intelligence view: the canonical property graph and
  entity resolution.
- Show benchmark variance — Parkline Commons reading clearly as the
  underperformer against its peer group.
- Show predictive maintenance risk — the ML risk scores per property.
- Show the Automation Room — the controlled local-runner view with receipts and
  explicit send/export gates.

### Beat 3 — `/happyco/weather-risk` (about 60 sec)

Open the weather-risk page.

- This layer combines public NOAA/FEMA hazard data with the synthetic
  property-ops layer.
- Walk the KPI strip, the risk table, and the market summary.
- Show the model and run-receipt evidence, then the chart gallery.
- Be explicit about the charts. Say this exact sentence:

  > "The site contract is wired. The local fallback bundle validates the
  > interface, and the live Databricks score run is the next gated step to
  > replace placeholder chart artifacts with real generated charts."

- Do not present the placeholder charts as finished analytics output.

### Beat 4 — Databricks evidence (about 60 sec)

Show the Databricks side.

- The weather-risk pipeline is a modular `weather_risk` Python package plus a
  bundle.
- `databricks bundle validate -t dev` PASSES against the workspace — the bundle
  config is real and valid.
- `bundle deploy` and `run` are not done; Databricks CLI v1.0.0 needs an
  interactive `databricks auth login`. Say that honestly.
- A prior receipt-backed Databricks run exists — public weather plus synthetic
  property operations data — with real job and run IDs in the receipt.
- Caveats: no HappyCo production data, no production model, no serving endpoint.

### Beat 5 — Artifacts (about 45 sec)

Show the artifact hub at `/happyco/artifacts`.

- Walk the deliverables: the Excel property-ops model, the 90-day strategy
  PowerPoint deck, and the architecture diagram.
- The hub is invite-gated and serves files only through an allowlisted API.
- Be honest about status: artifacts that exist locally but are not uploaded to
  gated storage show as local/private rather than as public downloads. Nothing
  here is a public download unless it actually is.

### Beat 6 — ADO and automation (about 45 sec)

Show the delivery loop.

- The work is tracked in Azure DevOps: an Epic, a Feature, User Stories, and the
  six PRs in this program.
- The Claude CoWork nightly tasks keep the package honest — nightly QA, control
  room refresh, Databricks receipt check, artifact regeneration, recruiter draft
  prep — plus two weekly tasks.
- Every task leaves receipts and runs behind safety gates: no auto-send, no fake
  runs, no exposed invite codes.

### Beat 7 — Close (about 30 sec)

Land the point.

> "This is AI attached to a delivery loop: plan, code, run, validate, generate
> artifacts, deploy, and leave receipts."

- One line on next gated steps: the live Databricks score run and uploading
  artifacts to gated storage.
- Thank the viewer. End the recording.

## Tabs to open before recording

Open and arrange these before starting (see the pre-recording checklist for the
full setup):

1. `/happyco` — already unlocked, with the invite-code field off screen.
2. `/happyco/demo`
3. `/happyco/weather-risk`
4. The Databricks bundle / `bundle validate` output, or a terminal showing it.
5. `/happyco/artifacts`
6. The Azure DevOps board for the HappyCo Epic/Feature/Stories.

## What not to show

- The invite code, the invite-code input mid-typing, or any URL with the code in
  a query string.
- Local git-ignored artifact paths or a file explorer of `artifacts/happyco/`.
- Any Databricks token, profile secret, or `.env` content.
- The placeholder chart PNGs presented as real charts.
- Any claim the claims sheet marks as not allowed.

## Top 3 proof points

1. A gated, synthetic proof package with a clean demo and property-ops
   intelligence — graph, entity resolution, benchmarking, predictive risk.
2. A Databricks-validated modular weather-risk pipeline with a local fallback
   export bundle, plus a receipt-backed prior training run on public weather and
   synthetic property operations data.
3. An ADO-tracked delivery loop with nightly Claude CoWork automation that leaves
   receipts and runs behind safety gates.

## Top 3 caveats

1. Synthetic data only. No HappyCo production data anywhere in the package.
2. No production model, no production deployment, no serving endpoint.
3. The current weather-risk sample bundle is a local-fallback bundle with
   placeholder chart artifacts. The live Databricks score run is the next gated
   step.
