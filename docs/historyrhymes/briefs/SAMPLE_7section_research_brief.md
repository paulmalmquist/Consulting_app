# HR Weekly Brief — 2026-05-18

**Regime call:** late_cycle
**Confidence:** 0.71
**Freshness score:** 0.88

## Executive Summary

Late-cycle conditions persist. Yield-curve normalization continues while CRE
stress builds. No regime change signalled this week; the highest-value research
work is closing two known signal gaps before the next cycle inflection.

## Thematic Findings

- **Yield curve normalizing** — 10Y-2Y back to +30bps, consistent with the
  2019 non-event analog rather than a 2007-style break.
- **CRE stress rising** — CMBS delinquency +40bps QoQ; office concentration is
  the dominant driver.
- **Crypto divergence forming** — MVRV-Z elevated while exchange outflows slow.

## Enhancement Path

- **Add MVRV-Z divergence signal** — detect crypto top/bottom divergences
  - What: Add an MVRV-Z divergence feature to the signal snapshot pipeline.
  - Why: 90%+ historical top/bottom hit rate; currently absent from the pulse.
  - Effort: 3 days
  - Impact: High — sharpens regime calls near cycle extremes.
  - Dependencies: signal snapshot pipeline, FRED loader
  - Priority: high
  - Category: signal
- **Backfill non-event episodes** — restore the 2:1 non-event ratio
  - What: Curate and embed six benign-resolution episodes.
  - Why: Episode library is survivorship-biased toward crises.
  - Effort: 5 days
  - Dependencies: none
  - Priority: medium
- **Tighten honeypot cosine threshold** — reduce false trap flags
  - Why: The current 0.85 threshold over-flags in low-volatility regimes.
  - Priority: low

## Adversarial Stress Test

- Add MVRV-Z divergence signal — VERDICT: PASS — survives crowding and honeypot checks
- Backfill non-event episodes — HOLD pending data-source license review
- Tighten honeypot cosine threshold — FAIL — would suppress real March-2020-type traps
- Overall: CAUTION — ship the signal work, defer the threshold change

## Signal Pulse

- MVRV-Z: 1.4 (elevated)
- 10Y-2Y: +0.30 (normalizing)
- VIX term: 0.95 (flat)
- CMBS delinquency: 6.2% (rising)

## Open Questions

- Is the crypto divergence a genuine top signal or a liquidity artifact?
- Does office-driven CMBS stress generalize to the broader CRE book?

## Honeypot Alert

None this week. Closest pattern is the 2019 yield-curve non-event (cosine 0.81,
below the 0.85 flag threshold).
