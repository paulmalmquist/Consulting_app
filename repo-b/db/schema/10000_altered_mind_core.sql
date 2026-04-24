-- 10000_altered_mind_core.sql
-- Altered Mind operator analytics module.
-- Tracks daily sessions, weekly summaries, referral intake, and monthly reflections
-- for a solo therapy practice. Full RLS and env_id required per ARCHITECTURE.md.
--
-- Entities:
--   am_daily_checkin       — one row per session day
--   am_weekly_summary      — aggregated weekly snapshot
--   am_referral            — referral intake pipeline per lead
--   am_monthly_reflection  — qualitative monthly narrative

-- ---------------------------------------------------------------------------
-- am_daily_checkin
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS am_daily_checkin (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    env_id                  TEXT NOT NULL,
    business_id             UUID NOT NULL,
    session_date            DATE NOT NULL,

    -- Volume
    clients_seen            INTEGER,
    cancellations           INTEGER,
    no_shows                INTEGER,
    late_cancel             INTEGER,
    late_fee_applied        BOOLEAN,

    -- Pipeline
    consultations_completed INTEGER,
    new_referrals           INTEGER,
    intake_completed        INTEGER,
    converted_to_client     INTEGER,
    discharges              INTEGER,

    -- Session type
    self_pay_sessions       INTEGER,
    insurance_sessions      INTEGER,

    -- Revenue
    revenue_dollars         NUMERIC(10, 2),
    utilization_pct         NUMERIC(7, 6),
    revenue_per_session     NUMERIC(10, 4),

    -- Topic session counts (one column per topic; strongly typed)
    topic_anxiety           INTEGER,
    topic_depression        INTEGER,
    topic_adhd              INTEGER,
    topic_burnout           INTEGER,
    topic_relationships     INTEGER,
    topic_trauma_ptsd       INTEGER,
    topic_grief_loss        INTEGER,
    topic_life_transitions  INTEGER,
    topic_relapse_prev      INTEGER,
    topic_other             INTEGER,

    notes                   TEXT,

    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT am_daily_checkin_env_date_unique UNIQUE (env_id, session_date)
);

COMMENT ON TABLE am_daily_checkin IS
    'Altered Mind: one row per working day. Tracks session volume, pipeline '
    'events (referrals, intakes, conversions), revenue, and per-topic client '
    'counts. Source: Daily Check In sheet of the weekly Excel tracker.';

ALTER TABLE am_daily_checkin ENABLE ROW LEVEL SECURITY;
CREATE POLICY am_daily_checkin_tenant_isolation ON am_daily_checkin
    USING (env_id = current_setting('app.env_id', true))
    WITH CHECK (env_id = current_setting('app.env_id', true));

CREATE INDEX IF NOT EXISTS idx_am_daily_checkin_env_date
    ON am_daily_checkin (env_id, session_date DESC);

-- ---------------------------------------------------------------------------
-- am_weekly_summary
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS am_weekly_summary (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    env_id                  TEXT NOT NULL,
    business_id             UUID NOT NULL,
    week_starting           DATE NOT NULL,

    -- Capacity
    clients_seen            INTEGER,
    openings                INTEGER,

    -- Exceptions
    cancellations           INTEGER,
    no_shows                INTEGER,

    -- Pipeline
    consultations           INTEGER,
    intake_appts            INTEGER,
    new_referrals           INTEGER,
    discharges              INTEGER,

    -- Session type
    self_pay_sessions       INTEGER,
    insurance_sessions      INTEGER,

    -- Revenue & utilization
    weekly_revenue          NUMERIC(10, 2),
    capacity_utilization    NUMERIC(7, 6),

    -- Platform flag
    betterhelp_active       BOOLEAN,

    -- Topic breakdowns
    topic_adhd              INTEGER,
    topic_anxiety           INTEGER,
    topic_burnout           INTEGER,
    topic_depression        INTEGER,
    topic_grief_loss        INTEGER,
    topic_life_transitions  INTEGER,
    topic_other             INTEGER,
    topic_relationships     INTEGER,
    topic_trauma_ptsd       INTEGER,
    topic_relapse_prev      INTEGER,

    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT am_weekly_summary_env_week_unique UNIQUE (env_id, week_starting)
);

COMMENT ON TABLE am_weekly_summary IS
    'Altered Mind: aggregated weekly snapshot transposed from the Weekly Summary '
    'sheet. One row per Monday week-start. Source columns become typed fields. '
    'Future weeks with zero data are excluded at ingest time.';

ALTER TABLE am_weekly_summary ENABLE ROW LEVEL SECURITY;
CREATE POLICY am_weekly_summary_tenant_isolation ON am_weekly_summary
    USING (env_id = current_setting('app.env_id', true))
    WITH CHECK (env_id = current_setting('app.env_id', true));

CREATE INDEX IF NOT EXISTS idx_am_weekly_summary_env_week
    ON am_weekly_summary (env_id, week_starting DESC);

-- ---------------------------------------------------------------------------
-- am_referral
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS am_referral (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    env_id                  TEXT NOT NULL,
    business_id             UUID NOT NULL,
    referral_date           DATE NOT NULL,
    platform                TEXT NOT NULL,
    referral_source         TEXT,
    consult_completed       BOOLEAN,
    intake_completed        BOOLEAN,
    converted_to_client     BOOLEAN,
    notes                   TEXT,

    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE am_referral IS
    'Altered Mind: one row per inbound referral lead. Tracks the conversion '
    'funnel: referral → consult → intake → client. Source: Referral Intake '
    'Log sheet. Platform values are normalized (e.g. "ZOCDOC " → "ZOCDOC").';

ALTER TABLE am_referral ENABLE ROW LEVEL SECURITY;
CREATE POLICY am_referral_tenant_isolation ON am_referral
    USING (env_id = current_setting('app.env_id', true))
    WITH CHECK (env_id = current_setting('app.env_id', true));

CREATE INDEX IF NOT EXISTS idx_am_referral_env_date
    ON am_referral (env_id, referral_date DESC);
CREATE INDEX IF NOT EXISTS idx_am_referral_env_platform
    ON am_referral (env_id, platform);

-- ---------------------------------------------------------------------------
-- am_monthly_reflection
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS am_monthly_reflection (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    env_id                  TEXT NOT NULL,
    business_id             UUID NOT NULL,
    reflection_month        TEXT NOT NULL,           -- human label: "January 2026"
    reflection_month_date   DATE NOT NULL,           -- first of month; used for ordering/filtering
    theme                   TEXT,
    wins                    TEXT,
    challenges              TEXT,
    adjustment              TEXT,

    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT am_monthly_reflection_env_month_unique UNIQUE (env_id, reflection_month_date)
);

COMMENT ON TABLE am_monthly_reflection IS
    'Altered Mind: qualitative monthly narrative. One row per month with theme, '
    'wins, challenges, and planned adjustment. Source: Monthly Reflections Archive '
    'sheet. Only months with actual data are ingested (empty future months skipped).';

ALTER TABLE am_monthly_reflection ENABLE ROW LEVEL SECURITY;
CREATE POLICY am_monthly_reflection_tenant_isolation ON am_monthly_reflection
    USING (env_id = current_setting('app.env_id', true))
    WITH CHECK (env_id = current_setting('app.env_id', true));

CREATE INDEX IF NOT EXISTS idx_am_monthly_reflection_env_month
    ON am_monthly_reflection (env_id, reflection_month_date DESC);
