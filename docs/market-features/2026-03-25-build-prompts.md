# Market Rotation Engine — Build Prompts Summary
**Date:** 2026-03-25
**Run type:** Scheduled Phase 3 feature builder

---

## Cards Reviewed

All 3 top-priority cards were queried from `trading_feature_cards` (status = `identified` or `spec_ready`, ordered by `priority_score DESC`). All 3 were already in `spec_ready` status with fully template-compliant meta prompts stored in both Supabase (`meta_prompt` column) and on disk. No regeneration was required — specs are unchanged since the 2026-03-22 origination run.

| # | Card | Priority | Gap Category | Status | Prompt File |
|---|------|----------|-------------|--------|-------------|
| 1 | Regime Escalation Sentinel | 98.70 | alert | spec_ready | `docs/market-features/prompts/2026-03-22-regime-escalation-sentinel.md` |
| 2 | Multi-Asset Regime Classifier Dashboard | 92.00 | risk_model | spec_ready | `docs/market-features/prompts/2026-03-22-multi-asset-regime-classifier-dashboard.md` |
| 3 | BTC-SPX 30-Day Rolling Correlation Tracker | 88.60 | calculation | spec_ready | `docs/market-features/prompts/2026-03-22-btc-spx-30d-rolling-correlation-tracker.md` |

---

## Build Order Recommendation

These three features have a dependency chain that dictates build order:

**Phase A — Multi-Asset Regime Classifier Dashboard (Card #2)**
Build first. Creates the `market_regime_snapshot` table and `market_regime_engine.py` service that both downstream features depend on.
- Estimated effort: 8 hours
- Blockers: FRED_API_KEY env var must be provisioned

**Phase B — BTC-SPX 30-Day Rolling Correlation Tracker (Card #3)**
Build second. The correlation value feeds into the Regime Classifier's crypto signal breakdown. Requires `market_regime_snapshot` to exist for the cross-feed.
- Estimated effort: 6 hours
- Blockers: `scipy` or `numpy` must be confirmed in requirements

**Phase C — Regime Escalation Sentinel (Card #1)**
Build last despite highest priority score. Depends on `market_regime_snapshot` (to promote regime label to `stress`) and benefits from the BTC correlation signal for a richer alert surface.
- Estimated effort: 10 hours
- Blockers: `sse-starlette` package for SSE streaming; scheduler integration (APScheduler or cron)

**Total estimated effort:** 24 hours across 3 features

---

## Cross-Vertical Impact Matrix

| Feature | REPE | Credit | PDS |
|---------|------|--------|-----|
| Regime Classifier Dashboard | Underwriting context (regime label + confidence) | Tightening advisory on Risk-Off/Stress | Market conditions summary for pipeline demand |
| BTC-SPX Correlation Tracker | Indirect (via regime classifier) | Crypto collateral haircut advisory on recoupling | Indirect (via regime classifier) |
| Regime Escalation Sentinel | Stress-test cap rate advisory on 2+ triggers | Conservative DTI ceiling advisory on 2+ triggers | Construction financing advisory on macro stress |

All cross-vertical hooks are **additive context strings only** — zero modifications to existing REPE, Credit, or PDS service code.

---

## Notes

- All 3 cards have been stable in `spec_ready` since 2026-03-22. No new `identified` cards were found in today's query, meaning the rotation engine has not surfaced new gaps since the last run.
- The next action is to move Card #2 (Regime Classifier) to `building` status and execute the meta prompt.
- No schema conflicts detected — all 3 features create new tables only (additive).
- Protected surfaces confirmed: credit schemas 274/275/277, REPE engines, PDS dashboards, and Meridian demo assets are untouched by all 3 prompts.
