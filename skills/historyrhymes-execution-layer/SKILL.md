# HistoryRhymes Execution Layer — Deterministic Allocation Contract

**Owner:** Winston Autonomous Loop
**Status:** Active (v1)
**Created:** 2026-04-20
**Source of truth:** true
**Sibling skill:** `skills/historyrhymes/SKILL.md` (research + analog matching)
**Related memory:** `feedback_ship_loop_then_harden.md`

## Purpose

The execution layer is **not a research assistant**. It is the deterministic interface that converts the weekly History Rhymes brief, current signal pulse, and analog matches into **position → size → time horizon → invalidation → next action**.

Messy inputs. Probabilistic internal logic. **Strict clean JSON output.** That boundary is the point.

This skill sits downstream of `skills/historyrhymes/SKILL.md` (which produces research + analogs) and is consumed by `backend/app/services/hr_decision_runner.py` (which calls it from the daily decision cron).

## When to use

Invoke this skill when the request is about:

- trade decision, position sizing, capital allocation
- converting a weekly brief + signals into tradeable positions
- daily decision build, regime call
- writing to the paper-trading ledger
- "what should we do today given the research"

Do **not** invoke this skill for:

- writing the weekly research brief (that's `skills/historyrhymes/SKILL.md`)
- analog matching itself (that's the `history_rhymes_service.py` read side)
- backtest design (that's `skills/historyrhymes/SKILL.md` + `skills/market-rotation-engine/SKILL.md`)
- explaining market moves (that's generic research, not execution)

## Input contract

The skill expects a single JSON object with four bundles:

```json
{
  "weekly_brief": {
    "brief_id": "...",
    "published_at": "...",
    "regime_call": "...",
    "themes": [...],
    "analogs": [
      {"episode_id": "...", "episode_name": "...", "rhyme_score": 0.87, "divergence_vector": {...}}
    ],
    "multi_agent_forecasts": {
      "macro": {...}, "quant": {...}, "narrative": {...}, "contrarian": {...}, "red_team": {...}
    },
    "honeypot_alerts": [...]
  },
  "signal_state": {
    "snapshot_id": "...",
    "taken_at": "...",
    "mvrv_z": ..., "yc_10y2y": ..., "vix_term": ..., "housing": {...},
    "cmbs_delinq": ..., "fed_tone": ..., "crypto_flow": ..., "macro_surprise": ...,
    "per_signal_freshness": {...}
  },
  "portfolio": {
    "exposures_by_segment": {...}
  },
  "freshness_verdict": "fresh | stale_snapshot | stale_brief | no_brief | no_snapshot"
}
```

**v1 note:** `portfolio` is deferred and may be absent or empty. The runner passes it through for forward-compatibility but the decision logic does not use it yet.

## Output contract (strict)

Return **only** the JSON envelope defined in [`output_contract.json`](output_contract.json):

```json
{
  "regime": "expansion | late_cycle | stagflation | crisis | recovery | unknown",
  "confidence": 0.0,
  "positions": [
    {
      "asset": "...",
      "direction": "long | short | neutral",
      "size": 0.0,
      "time_horizon_days": 7,
      "entry_type": "immediate | staggered | conditional",
      "key_drivers": ["..."],
      "top_analog": "...",
      "rhyme_score": 0.0,
      "invalidation": "...",
      "next_check": "..."
    }
  ],
  "risk": {
    "gross_exposure": 0.0,
    "net_exposure": 0.0,
    "max_position_size": 0.0,
    "stop_loss_logic": "...",
    "volatility_adjustment": "..."
  },
  "alerts": [
    { "type": "honeypot | crowding | divergence | data_quality", "message": "...", "action": "reduce | hedge | pause | reverse" }
  ],
  "execution_tasks": ["..."]
}
```

No prose. No commentary. No hedging every position.

## Decision logic (mandatory, verbatim)

### 1. Regime first

Map `{yc_10y2y, vix_term, liquidity_proxy, credit_stress}` to one of:

- **expansion** — curve normal, vol low, credit tight, liquidity expanding
- **late_cycle** — curve flat/inverted, vol rising, credit widening
- **stagflation** — curve inverted, vol high, inflation sticky, growth slowing
- **crisis** — vol backwardated, credit blowing out, liquidity contracting
- **recovery** — curve re-steepening, vol compressing, credit tightening from wides

### 2. Analog confirmation gate

Act only if:

- top analog `rhyme_score > 95th percentile of null distribution`, OR
- multi-agent agreement > 65% (count of agents agreeing on direction ÷ total agents)

Otherwise:

- reduce all position sizes × 0.5
- add alert `{type: "divergence", action: "reduce"}` with message "LOW CONVICTION — analog gate not cleared"

### 3. Sizing bands

- High conviction: 0.6–1.0
- Medium: 0.3–0.6
- Low: 0.1–0.3

Adjustments:

- ↓ if `per_signal_freshness` shows stale signals
- ↓ if signals conflict with each other
- ↓ if red-team agent flags crowding
- ↑ if flow confirms the narrative

### 4. Red team override (CRITICAL)

If any position has `crowding_score > 0.7` **OR** a `honeypot_alerts` match with `score > 0.85`:

- cut size by 50–100%, **or**
- flip direction if the adversarial thesis is strong (red_team agent confidence > 0.7 on the opposite side)

### 5. Flow vs narrative rule

If flow-aligned and narrative-aligned diverge:

- **flow wins**
- reduce narrative-driven positions
- increase flow-aligned exposure

### 6. Time horizon lock

Every position MUST specify exactly one of: **7, 30, or 90** `time_horizon_days`. No other values permitted.

### 7. Invalidation (MANDATORY)

Every position MUST include a non-empty `invalidation` string following the form "this trade is wrong if X". Examples: "yield curve reverses", "VIX backwardation emerges", "flows reverse", "analog breaks".

### 8. Execution tasks

Translate decisions into `execution_tasks` strings that the runner can act on:

- `"Increase BTC exposure from 0.25 → 0.45"`
- `"Hedge CRE exposure via REIT short basket"`
- `"Pause new longs until VIX structure confirms"`
- `"Close ledger entry abc-123 on invalidation: yield curve re-inverted"`

## Behavioral rules

- Max **5 positions**. Concentrate or abstain — do not dilute.
- Do not output generic macro commentary.
- Do not hedge every position — pick a side.
- Express uncertainty via **smaller sizes, not no positions**. When uncertain → smaller bets, not empty output.

## Failure mode handling

If required inputs are incomplete, stale, or missing:

1. Set `confidence < 0.4`
2. Reduce all `size` values × 0.5
3. Append `{type: "data_quality", action: "pause", message: "<what's missing>"}` to alerts
4. If `freshness_verdict ∈ {no_brief, no_snapshot}`: return the canonical degraded response in [`no_input_response.json`](no_input_response.json) — zero positions, pause action, nothing appended to the ledger.

## Final check before output

Ask:

1. Would a trader act on this immediately?
2. Are sizes clear and within sizing bands?
3. Is risk bounded by `max_position_size` and `gross_exposure`?
4. Is invalidation explicit on every position?

If any answer is no → fix before returning.

## Implementation

- **v1 runner:** `backend/app/services/hr_decision_runner.py` — Python port of the decision logic for determinism and speed. No LLM call per decision.
- **v2 option:** optionally invoke an LLM with this skill as the system prompt + input bundle; constrain output to `output_contract.json` schema. Use when adding narrative synthesis that the v1 port can't capture.

The runner reads inputs via the `hr_current_state` view (see migration 519) and writes output to `hr_predictions` (reusing the existing table — columns `regime`, `positions`, `risk_json`, `alerts_json`, `execution_tasks`, `source_brief_id`, `source_snapshot_id` were added in migration 519). Paper ledger appends go to `hr_paper_trading_ledger`.

## Cross-references

- `skills/historyrhymes/SKILL.md` — research + analog matching (upstream)
- `skills/market-rotation-engine/SKILL.md` — regime vocabulary
- `backend/app/services/history_rhymes_service.py` — pgvector analog read side
- `repo-b/db/schema/519_historyrhymes_execution_loop.sql` — backing schema
