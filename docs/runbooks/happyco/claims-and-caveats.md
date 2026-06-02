# HappyCo Claims and Caveats

Last updated: 2026-05-22

The single source of truth for what the HappyCo package may and may not claim.
Every doc, every Loom script, every recruiter draft, every automation task, and
every page of shipped copy must agree with this sheet.

If a claim is not on the allowed list, it is not allowed. When in doubt, say
less.

## Allowed claims

- This is private proof-of-work for the HappyCo Head-of-Data role.
- It is a synthetic-data proof package — deterministic synthetic data only.
- It is a receipt-backed automation package — the nightly/weekly Claude CoWork
  cadence leaves dated receipts.
- "Databricks ML training run executed on public weather and synthetic property
  operations data." — ALLOWED, and ONLY in reference to the prior
  receipt-backed run (job/run IDs in `repo-b/src/lib/happyco/proof.ts`,
  `HAPPYCO_DATABRICKS_RECEIPT`).
- "Databricks-validated modular pipeline with a local fallback export bundle."
  — ALLOWED for the CURRENT weather-risk sample bundle. `databricks bundle
  validate -t dev` passes; the bundle is `mode: local_fallback`.
- The work is tracked end to end in Azure DevOps (Epic, Feature, User Stories,
  six PRs).
- The recruiter follow-up is a draft-only Outlook workflow — drafts are
  prepared, never sent automatically.

## Not allowed claims

- Real HappyCo data, of any kind.
- A production HappyCo model.
- A production deployment.
- A model serving endpoint.
- Email sent automatically. The Outlook workflow is draft-only; sending is a
  manual, confirmed action.
- Public artifact downloads — unless a gated download path is actually
  implemented and verified. Local/private artifacts are not public downloads.
- Calling the current local-fallback weather-risk bundle a fresh live Databricks
  run. `bundle validate` passing is not a training run.

## The two Databricks claims — keep them separate

These are easy to blur. They are different things.

| | Prior receipt-backed run | Current sample bundle |
|---|---|---|
| What it is | A real Databricks ML training run that already executed | The weather-risk export bundle shipped in `repo-b/public/happyco/weather-risk/latest/` |
| Mode | Completed run, receipt exists | `mode: local_fallback` |
| Evidence | Job/run IDs in `proof.ts` `HAPPYCO_DATABRICKS_RECEIPT` | `bundle validate -t dev` passes |
| Charts | Real run outputs | Placeholder PNGs, ~67 bytes — local-contract placeholders, not real charts |
| Allowed claim | "Databricks ML training run executed on public weather and synthetic property operations data." | "Databricks-validated modular pipeline with a local fallback export bundle." |
| Not allowed | Calling it a production model or deployment | Calling it a fresh live run |

`bundle deploy` and `bundle run` for the current bundle are NOT done. Databricks
CLI v1.0.0 needs an interactive `databricks auth login` first. The live score run
is the next gated step.

## The weather-risk state — exact wording

When describing where the weather-risk feature stands, use this sentence
verbatim:

> "The site contract is wired. The local fallback bundle validates the
> interface, and the live Databricks score run is the next gated step to
> replace placeholder chart artifacts with real generated charts."

## Quick test before you ship a claim

1. Is the claim on the allowed list above? If not, cut it.
2. Does it mention HappyCo data, a production model, a deployment, a serving
   endpoint, or a sent email? If yes, cut it.
3. Does it call the current sample bundle a live run? If yes, fix it.
4. Is there a receipt or a validate result backing it? If not, soften it to
   what is actually proven.
