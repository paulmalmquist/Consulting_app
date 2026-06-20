-- Migration 10017: History Rhymes streaming spine — events, latest, offsets, health
--
-- Backing stores for the cockpit's live signal channels (dispatch record:
-- docs/plans/03-implementation-plans/active/history-rhymes-telemetry-cockpit-refactor.md;
-- architecture: docs/plans/history-rhymes/streaming-architecture.md):
--   - hr_signal_events   (bronze: append-only normalized stream events)
--   - hr_signal_latest   (silver: newest value per signal key)
--   - hr_stream_offsets  (consumer-group offset receipts: replayability + evidence)
--   - hr_stream_health   (singleton fail-closed health snapshot)
--
-- hr_* module is single-tenant analytics: no env_id, no business_id, no RLS.
-- Exemption documented in ARCHITECTURE.md. These tables follow the
-- 519_historyrhymes_execution_loop.sql / 10002 sibling convention.
--
-- Additive only. Does not touch existing data. (Planned as 10016; renumbered
-- to 10017 after 10015/10016 landed mid-flight — content unchanged.)

-- ─────────────────────────────────────────────────────────────────────────────
-- Bronze: every normalized stream event, append-only, idempotent on the
-- producer-side dedupe key sha256(signal_key|observed_at|source).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.hr_signal_events (
    event_id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    idempotency_key       TEXT NOT NULL UNIQUE,
    topic                 TEXT NOT NULL,
    signal_key            TEXT NOT NULL,
    domain                TEXT,
    source                TEXT NOT NULL,
    mode                  TEXT NOT NULL,            -- synthetic | replay | live_kafka
    observed_at           TIMESTAMPTZ NOT NULL,
    ingested_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    value_numeric         NUMERIC,
    value_text            TEXT,
    unit                  TEXT,
    previous_value        NUMERIC,
    delta                 NUMERIC,
    window_label          TEXT,
    freshness_ttl_seconds INT,
    quality               JSONB NOT NULL DEFAULT '{}'::jsonb,
    tags                  TEXT[] NOT NULL DEFAULT '{}',
    raw                   JSONB,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.hr_signal_events IS
  'History Rhymes cockpit: bronze append-only stream events (one row per observed signal value; idempotent on idempotency_key). Owner: hr_stream (single-tenant analytics, ARCHITECTURE.md exemption).';

CREATE INDEX IF NOT EXISTS idx_hr_signal_events_key_observed
    ON public.hr_signal_events (signal_key, observed_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- Silver: the newest value per signal key. Upserts apply only when the
-- incoming observed_at is strictly newer (enforced in persist.py).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.hr_signal_latest (
    signal_key      TEXT PRIMARY KEY,
    event_id        UUID,
    domain          TEXT,
    source          TEXT NOT NULL,
    mode            TEXT NOT NULL,
    observed_at     TIMESTAMPTZ NOT NULL,
    ingested_at     TIMESTAMPTZ NOT NULL,
    value_numeric   NUMERIC,
    value_text      TEXT,
    unit            TEXT,
    previous_value  NUMERIC,
    delta           NUMERIC,
    quality         JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.hr_signal_latest IS
  'History Rhymes cockpit: silver latest-value-per-signal view backing GET /api/hr/v1/stream/signals/latest. Newer-only upserts. Owner: hr_stream (single-tenant analytics).';

-- ─────────────────────────────────────────────────────────────────────────────
-- Consumer offsets: replayability + "where did this number come from" evidence.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.hr_stream_offsets (
    consumer_group  TEXT NOT NULL,
    topic           TEXT NOT NULL,
    partition       INT NOT NULL,
    last_offset     BIGINT NOT NULL,
    committed_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (consumer_group, topic, partition)
);

COMMENT ON TABLE public.hr_stream_offsets IS
  'History Rhymes cockpit: per-(group, topic, partition) offset receipts written after each handled batch. Owner: hr_stream (single-tenant analytics).';

-- ─────────────────────────────────────────────────────────────────────────────
-- Health singleton: fail-closed default row. The health endpoint prefers this
-- row in replay/live modes; synthetic stays ring-based.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.hr_stream_health (
    id               SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    mode             TEXT,
    provider         TEXT,
    status           TEXT NOT NULL DEFAULT 'not_configured',
    consumer_group   TEXT,
    topic_prefix     TEXT,
    latest_event_at  TIMESTAMPTZ,
    lag_seconds      NUMERIC,
    degraded_reason  TEXT,
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.hr_stream_health IS
  'History Rhymes cockpit: singleton stream-health snapshot (fail-closed default not_configured). Owner: hr_stream (single-tenant analytics).';

INSERT INTO public.hr_stream_health (id, status, degraded_reason)
VALUES (1, 'not_configured', 'no runner has reported yet')
ON CONFLICT (id) DO NOTHING;
