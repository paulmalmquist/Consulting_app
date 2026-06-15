# Gate 0 — Telemetry Trust Layer — Evidence Receipt

**Status:** COMPLETE — verdict produced.
**Verdict:** **KILL** (mechanical, from the decision rule; not massaged).
**Date:** 2026-06-13
**Run:** `993096546213269` (SUCCESS) · design `option_b_train_split_heldout_units`
**Notebook:** `telemetry-platform/databricks/notebooks/telemetry_trust_gate0_distance_error.py`
**Ticket:** `docs/plans/03-implementation-plans/active/telemetry-trust-gate0-ticket.md`
**Model:** `novendor_1.telemetry.tel_rul_regressor` v1 (GBM, frozen inference, `scikit-learn==1.4.2`)
**Machine-readable:** `telemetry-trust-gate0.json`

## Verdict: KILL

The trust thesis — *windows farther from the fleet in embedding space have larger RUL error* — is
**refuted** with this cheap z-score+PCA embedding. The within-band signal is not flat; it points the
**wrong way**.

## The numbers

Design: FD001 **train split** (real per-cycle `rul_target`), 100 units split by unit id (seed 0) into
**80 fleet** (16,220 rows) and **20 held-out** (4,311 rows). Embedding = z-score + PCA(24) fit on fleet
rows only. Distance = mean L2 to the k=10 nearest fleet windows. Held-out units are disjoint from the
fleet, so distance reflects novelty, not memorization.

**Spearman ρ(kNN distance, |RUL error|), conditioned on predicted-RUL band:**

| Band | n | ρ | 95% CI | Sign / significance |
|---|---|---|---|---|
| 0–25 | 485 | **−0.135** | [−0.222, −0.046] | negative, CI excludes 0 |
| 25–50 | 432 | **−0.160** | [−0.256, −0.066] | negative, CI excludes 0 |
| 50–75 | 383 | −0.073 | [−0.175, +0.027] | negative, CI spans 0 |
| 75–100 | 766 | −0.053 | [−0.127, +0.015] | negative, CI spans 0 |
| 100+ | 2245 | **−0.045** | [−0.084, −0.004] | negative, CI excludes 0 |
| **overall** | 4311 | **−0.127** | — | negative |

The median-abs-error-by-distance-quartile tables agree: within bands, error tends to **fall** as
distance rises (e.g. band 0–25: 5.11 → 4.32 → 3.49 → 3.86 across quartiles Q0→Q3). Ten A/B pairs were
found, but the gate requires a positive within-band relationship for them to mean anything.

## Why this is KILL, not "train SupCon next"

The decision rule (mechanical):
- **continue** — ≥2 bands with ρ ≥ 0.30 *and* CI excluding 0, plus ≥1 A/B pair.
- **train_contrastive** — ≥1 band with **positive** ρ and CI excluding 0 (weak-but-real).
- **kill** — otherwise.

There are **zero positive bands**. Three of five are **significantly negative** (CI excludes 0 below).
"Weak-but-real" means weak-*positive* — a signal in the thesis's direction that a learned encoder might
sharpen. This is the opposite: the geometry carries error information in the **wrong** direction. A
negative, CI-excludes-zero result is a stronger refutation than flatness, and it does **not** route to
SupCon. Per the rule and the "don't massage it" instruction: **kill**.

## What the kill does and doesn't claim

**Does claim:** the *cheap PCA embedding of existing C-MAPSS features* does not carry usable trust
information for this GBM RUL predictor on FD001 — in fact it anti-correlates. The "one embedding,
distance = trust" idea is not free; it does not fall out of the features as-is.

**Does NOT claim:** that no embedding could ever work. A purpose-built contrastive encoder is a
*different* object. But the gate's whole point was to test the cheap path **before** spending on SupCon —
and the cheap path failed in the wrong direction, which is exactly the signal that says *don't* spend.

## Honest caveats (carry into any reuse)

- **Predictor is in-sample.** The champion was trained on all 100 train units, incl. the held-out ones,
  so predictions are optimistic (held-out per-cycle RMSE 19.86). That makes the gate *harder* to pass
  (less error to correlate), so it does not explain away a kill — if anything it understates error
  spread. The held-out split governs the embedding/kNN, which is what the distance signal depends on.
- **Per-cycle RMSE ≠ benchmark.** 19.86 is per-cycle and in-sample; the shipped **20.32** is the
  last-cycle-per-unit benchmark — a different quantity. No competitiveness claim, either direction.
- **Single seed, single fault mode.** seed=0 held-out split; FD001 is one fault mode. A different seed
  could shift magnitudes, but five consistently-negative bands across 4,311 windows is not a seed
  artifact. The FD003 novel-fault-mode test is moot now — the precondition (distance tracks error in
  the *right* direction) already fails.
- **Embedding choice.** z-score + PCA(24). A different cheap embedding (raw z-score, more PCA dims)
  could be tried, but the gate deliberately tested the standard cheap path; redesigning the embedding
  to chase a positive ρ would be moving the goalposts.

## Execution notes / prior blocked attempts (not the conclusion)

Before this clean run, the first design (score *all test cycles*) blocked: the C-MAPSS **test** split
has no per-cycle `rul_target` (13,096/13,096 NaN — by dataset construction). Diagnosed across four runs
(mlflow-missing → env spec; sklearn version skew → pin 1.4.2; NaN-truth → the data fact). Recorded in
git `6b9b4702`. Redesigned to Option B (train-split held-out units, real per-cycle truth) → this verdict.

## Reproducibility (required)

- **`scikit-learn==1.4.2`** — the champion pickle won't `predict()` under newer sklearn
  (`HalfSquaredError.get_init_raw_predictions` removed). Pin it.
- Serverless job: `runs/submit` task `environment_key:"Default"` + `environments[].spec
  {client:"2", dependencies:["mlflow","scikit-learn==1.4.2"]}`.
- CLI v1.0.0 auth: `DATABRICKS_AUTH_TYPE=pat`, `DATABRICKS_CONFIG_FILE=/dev/null`. Windows Git Bash:
  `MSYS_NO_PATHCONV=1` for `/Users/...` workspace paths.

## Consequence for the Telemetry Trust Layer

Gate 0 **kills the cheap-path version of the thesis.** Per the assessment
(`factory-pattern-intelligence.md`), Gate 0 had "the authority to kill the project before a dollar is
spent" — it did its job. Do **not** proceed to SupCon training, the trust/divergence schema, the three
UI screens, or any infrastructure on the strength of this result. If the thesis is revisited, it must
start from *why distance anti-correlates with error here* (plausibly: late-life windows are both more
self-similar **and** lower-error, so a generic feature embedding conflates "near the fleet" with "easy
to predict") — a research question, not a build.

---

*Verdict recorded. The assessment artifact
(`docs/plans/03-implementation-plans/active/factory-pattern-intelligence.md`) may now be updated to
reflect the kill, or left frozen as the pre-gate record — owner's call.*
