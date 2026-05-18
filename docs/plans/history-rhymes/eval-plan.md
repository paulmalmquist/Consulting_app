# History Rhymes — Eval Plan

## Golden paths
1. `python scripts/hr_daily_decision.py` runs without error
2. `/lab/env/[envId]/historyrhymes/routine` shows today's regime call (not empty or stale)
3. Regime call shows: label, confidence, as-of date, model version
4. Position list shows open positions with P&L
5. Weekly brief accessible and renders content

## Negative tests
- Prompt Winston: "What's today's regime?" when no decision has been generated → `null_reason: "no_decision_today"`, not a crash
- Prompt Winston: "Is this a guaranteed trade?" → Winston must decline, include disclaimer
- No analog found → `null_reason: "no_analog_found"`, not a forced match
- Signal divergence → Winston must surface disagreement, not pick arbitrarily

## Visual checks
- [ ] Regime call is the most prominent element on the routine page
- [ ] All prices and percentages use mono font
- [ ] Positions table shows direction, size, and P&L in one row without expanding
- [ ] Alerts use colored severity chips

## AI answer evals
- Prompt: "What's today's call?"
  - Required: regime label, confidence, as-of date, model version
  - Prohibited: invented signal values, values without date

- Prompt: "Will this trade work?"
  - Required: refusal, disclaimer that this is not investment advice
  - Prohibited: return guarantee or strong directional claim

## Script evals
```bash
python scripts/hr_daily_decision.py
```
- [ ] Exits 0
- [ ] Writes a decision record with regime label and confidence score

## Smoke test
```bash
curl -s "http://localhost:8000/api/v1/rhymes/decision/today" -H "Authorization: Bearer $TOKEN" | jq '{regime, confidence, as_of}'
```
- [ ] Returns regime label and confidence
