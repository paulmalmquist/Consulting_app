-- Migration 519: History Rhymes execution-loop surfaces
--
-- Adds the research → decision → display loop backing stores:
--   - hr_weekly_briefs         (Sunday research, markdown + JSON)
--   - hr_signal_snapshots      (8-signal pulse snapshots)
--   - hr_paper_trading_ledger  (append-only execution log)
--   - hr_current_state         (view: time-aligned latest IDs + freshness)
--   - hr_predictions columns   (regime, source_brief_id, source_snapshot_id, positions jsonb, alerts jsonb)
--
-- hr_* module is single-tenant analytics: no env_id, no RLS.
-- Exemption documented in ARCHITECTURE.md.
--
-- Additive only. Reuses existing hr_predictions (from migration 434) as the
-- decision-output surface. Does not touch existing data.

-- ═══════════════════════════════════════════════════════════════════════════════
-- PART 1: WEEKLY BRIEFS
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.hr_weekly_briefs (
    brief_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    published_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    regime_call VARCHAR(50),                    -- expansion | late_cycle | stagflation | crisis | recovery | unknown
    confidence DECIMAL(5,4),                    -- 0.0000–1.0000
    freshness_score DECIMAL(5,4),               -- composite of signal freshness at brief time
    markdown_uri TEXT,                          -- file path or blob URL for human archive
    parsed_json JSONB NOT NULL,                 -- structured envelope: themes, enhancements, honeypots, analog refs
    source VARCHAR(50) DEFAULT 'manual',        -- manual | scheduled | backfill
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hr_weekly_briefs_published_at
    ON public.hr_weekly_briefs(published_at DESC);

COMMENT ON TABLE public.hr_weekly_briefs IS
    'History Rhymes weekly research brief. parsed_json holds themes, enhancement candidates, honeypot flags, and analog references (v1 keeps these inline rather than splitting to child tables). markdown_uri points to the human-readable archive.';

-- ═══════════════════════════════════════════════════════════════════════════════
-- PART 2: SIGNAL SNAPSHOTS
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.hr_signal_snapshots (
    snapshot_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    taken_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    signals_json JSONB NOT NULL,                -- {mvrv_z, yc_10y2y, vix_term, housing, cmbs_delinq, fed_tone, crypto_flow, macro_surprise, per_signal_freshness}
    source VARCHAR(50) DEFAULT 'scheduled',     -- scheduled | manual | backfill
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hr_signal_snapshots_taken_at
    ON public.hr_signal_snapshots(taken_at DESC);

COMMENT ON TABLE public.hr_signal_snapshots IS
    'Point-in-time snapshot of the 8 canonical HR signals (MVRV Z, 10Y-2Y, VIX term, housing, CMBS delinq, Fed tone, crypto flows, macro surprise). signals_json is the single payload column (v1 keeps wide-table explosion deferred).';

-- ═══════════════════════════════════════════════════════════════════════════════
-- PART 3: PAPER TRADING LEDGER (append-only)
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.hr_paper_trading_ledger (
    entry_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    decision_id UUID REFERENCES public.hr_predictions(id) ON DELETE RESTRICT,
    asset VARCHAR(100) NOT NULL,
    direction VARCHAR(10) NOT NULL,             -- long | short | neutral
    size DECIMAL(5,4) NOT NULL,                 -- 0.0000–1.0000
    time_horizon_days INTEGER NOT NULL,         -- 7 | 30 | 90
    entry_type VARCHAR(20) NOT NULL,            -- immediate | staggered | conditional
    invalidation TEXT NOT NULL,                 -- mandatory per execution-layer contract
    opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    closed_at TIMESTAMPTZ,                      -- v2: populated when invalidated
    pnl_pct DECIMAL(8,4),                       -- v2: populated on close
    source VARCHAR(50) DEFAULT 'daily_decision_job',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hr_paper_ledger_opened_at
    ON public.hr_paper_trading_ledger(opened_at DESC);
CREATE INDEX IF NOT EXISTS idx_hr_paper_ledger_open
    ON public.hr_paper_trading_ledger(opened_at) WHERE closed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_hr_paper_ledger_decision
    ON public.hr_paper_trading_ledger(decision_id);

COMMENT ON TABLE public.hr_paper_trading_ledger IS
    'Append-only paper trading ledger. One row per position opened by the daily decision job. closed_at and pnl_pct populate in v2 (invalidation-driven closes). entry_type follows execution-layer contract (immediate | staggered | conditional).';

-- ═══════════════════════════════════════════════════════════════════════════════
-- PART 4: EXTEND hr_predictions for execution-layer output
-- ═══════════════════════════════════════════════════════════════════════════════
-- The execution-layer skill emits a richer envelope than hr_predictions' original
-- single-direction schema. Add optional columns to hold the extras without
-- breaking existing seed rows or the prediction resolution flow.

ALTER TABLE public.hr_predictions
    ADD COLUMN IF NOT EXISTS regime VARCHAR(50),
    ADD COLUMN IF NOT EXISTS positions JSONB,            -- array of {asset, direction, size, time_horizon_days, entry_type, key_drivers, top_analog, rhyme_score, invalidation, next_check}
    ADD COLUMN IF NOT EXISTS risk_json JSONB,            -- {gross_exposure, net_exposure, max_position_size, stop_loss_logic, volatility_adjustment}
    ADD COLUMN IF NOT EXISTS alerts_json JSONB,          -- array of {type, message, action}
    ADD COLUMN IF NOT EXISTS execution_tasks JSONB,      -- array of strings
    ADD COLUMN IF NOT EXISTS source_brief_id UUID REFERENCES public.hr_weekly_briefs(brief_id),
    ADD COLUMN IF NOT EXISTS source_snapshot_id UUID REFERENCES public.hr_signal_snapshots(snapshot_id);

COMMENT ON COLUMN public.hr_predictions.regime IS
    'Execution-layer regime call: expansion | late_cycle | stagflation | crisis | recovery | unknown. Null for pre-v1 rows and for legacy single-direction predictions.';
COMMENT ON COLUMN public.hr_predictions.positions IS
    'Execution-layer v1: full positions array from the skill output. Complements (does not replace) the single direction/confidence fields.';

-- ═══════════════════════════════════════════════════════════════════════════════
-- PART 5: hr_current_state VIEW (single read interface)
-- ═══════════════════════════════════════════════════════════════════════════════
-- One-row view returning time-aligned latest brief + snapshot + decision IDs,
-- plus a freshness verdict. Decision job and /api/hr/v1/state read from this.

CREATE OR REPLACE VIEW public.hr_current_state AS
WITH latest_brief AS (
    SELECT brief_id, published_at, freshness_score
    FROM public.hr_weekly_briefs
    ORDER BY published_at DESC
    LIMIT 1
), latest_snapshot AS (
    SELECT snapshot_id, taken_at
    FROM public.hr_signal_snapshots
    ORDER BY taken_at DESC
    LIMIT 1
), latest_decision AS (
    -- Only execution-layer decisions (those with regime set) — legacy seed rows excluded
    SELECT id AS decision_id, prediction_date, regime, direction_confidence
    FROM public.hr_predictions
    WHERE regime IS NOT NULL
    ORDER BY prediction_date DESC
    LIMIT 1
)
SELECT
    (SELECT brief_id FROM latest_brief)                  AS latest_brief_id,
    (SELECT published_at FROM latest_brief)              AS latest_brief_at,
    (SELECT snapshot_id FROM latest_snapshot)            AS latest_snapshot_id,
    (SELECT taken_at FROM latest_snapshot)               AS latest_snapshot_at,
    (SELECT decision_id FROM latest_decision)            AS latest_decision_id,
    (SELECT prediction_date FROM latest_decision)        AS latest_decision_at,
    (SELECT regime FROM latest_decision)                 AS latest_regime,
    (SELECT direction_confidence FROM latest_decision)   AS latest_confidence,
    -- Freshness verdict: worst-case age in hours across brief + snapshot
    GREATEST(
        COALESCE(EXTRACT(EPOCH FROM (NOW() - (SELECT published_at FROM latest_brief))) / 3600.0, 9999),
        COALESCE(EXTRACT(EPOCH FROM (NOW() - (SELECT taken_at FROM latest_snapshot))) / 3600.0, 9999)
    ) AS worst_input_age_hours,
    CASE
        WHEN (SELECT brief_id FROM latest_brief) IS NULL THEN 'no_brief'
        WHEN (SELECT snapshot_id FROM latest_snapshot) IS NULL THEN 'no_snapshot'
        WHEN EXTRACT(EPOCH FROM (NOW() - (SELECT taken_at FROM latest_snapshot))) / 3600.0 > 48 THEN 'stale_snapshot'
        WHEN EXTRACT(EPOCH FROM (NOW() - (SELECT published_at FROM latest_brief))) / 86400.0 > 10 THEN 'stale_brief'
        ELSE 'fresh'
    END AS freshness_verdict;

COMMENT ON VIEW public.hr_current_state IS
    'Single read interface for the HR decision loop. Returns time-aligned latest brief + snapshot + execution-layer decision IDs with a freshness verdict (fresh | stale_snapshot | stale_brief | no_brief | no_snapshot). Decision job reads from here, never from raw tables.';
