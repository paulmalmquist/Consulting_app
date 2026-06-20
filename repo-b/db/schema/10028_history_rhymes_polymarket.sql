-- 10028_history_rhymes_polymarket.sql
-- History Rhymes: read-only Polymarket metadata, minute features, stream health,
-- deterministic question mappings, and auditable divergence forecasts.
--
-- Raw WebSocket events stay in Confluent and the observational BigQuery sink.
-- Per ARCHITECTURE.md, hr_* is a documented single-tenant analytics module and
-- is exempt from env_id/business_id/RLS. These tables are service-role only.

CREATE TABLE IF NOT EXISTS public.hr_polymarket_markets (
    market_id              text PRIMARY KEY,
    event_id               text,
    condition_id           text NOT NULL UNIQUE,
    question               text NOT NULL,
    slug                   text,
    category               text,
    tags                   jsonb NOT NULL DEFAULT '[]'::jsonb,
    end_at                 timestamptz NOT NULL,
    resolution_source      text,
    yes_token_id           text NOT NULL,
    no_token_id            text NOT NULL,
    gamma_yes_price        double precision,
    gamma_no_price         double precision,
    liquidity_usd          double precision NOT NULL DEFAULT 0,
    volume_usd             double precision NOT NULL DEFAULT 0,
    active                 boolean NOT NULL DEFAULT true,
    closed                 boolean NOT NULL DEFAULT false,
    accepting_orders       boolean NOT NULL DEFAULT true,
    enable_order_book      boolean NOT NULL DEFAULT true,
    raw                    jsonb NOT NULL DEFAULT '{}'::jsonb,
    first_seen_at          timestamptz NOT NULL DEFAULT now(),
    last_seen_at           timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT hr_pm_distinct_tokens CHECK (yes_token_id <> no_token_id),
    CONSTRAINT hr_pm_gamma_yes_prob CHECK (
        gamma_yes_price IS NULL OR gamma_yes_price BETWEEN 0 AND 1
    ),
    CONSTRAINT hr_pm_gamma_no_prob CHECK (
        gamma_no_price IS NULL OR gamma_no_price BETWEEN 0 AND 1
    )
);
CREATE INDEX IF NOT EXISTS idx_hr_pm_active_liquidity
    ON public.hr_polymarket_markets (active, closed, liquidity_usd DESC);
COMMENT ON TABLE public.hr_polymarket_markets IS
  'History Rhymes single-tenant market metadata selected from public Gamma keyset discovery. Read-only; no wallet or trading data.';

CREATE TABLE IF NOT EXISTS public.hr_polymarket_feature_snapshots (
    id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    market_id                   text NOT NULL REFERENCES public.hr_polymarket_markets(market_id) ON DELETE CASCADE,
    bucket_at                   timestamptz NOT NULL,
    observed_at                 timestamptz,
    connection_last_message_at  timestamptz,
    market_last_event_at        timestamptz,
    yes_probability             double precision,
    price_basis                 text,
    last_trade_price            double precision,
    best_bid                    double precision,
    best_ask                    double precision,
    midpoint                    double precision,
    spread                      double precision,
    spread_bps                  double precision,
    bid_notional_1pt            double precision NOT NULL DEFAULT 0,
    ask_notional_1pt            double precision NOT NULL DEFAULT 0,
    bid_notional_5pt            double precision NOT NULL DEFAULT 0,
    ask_notional_5pt            double precision NOT NULL DEFAULT 0,
    book_imbalance              double precision,
    probability_change_5m       double precision,
    probability_change_1h       double precision,
    probability_change_24h      double precision,
    liquidity_confidence        double precision NOT NULL DEFAULT 0,
    shock_score                 double precision NOT NULL DEFAULT 0,
    connection_stale            boolean NOT NULL DEFAULT true,
    market_stale                boolean NOT NULL DEFAULT true,
    thin_liquidity_flag         boolean NOT NULL DEFAULT true,
    ambiguity_flag              boolean NOT NULL DEFAULT false,
    null_reason                 text,
    source_event_ids            jsonb NOT NULL DEFAULT '[]'::jsonb,
    provenance                  jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at                  timestamptz NOT NULL DEFAULT now(),
    UNIQUE (market_id, bucket_at),
    CONSTRAINT hr_pm_feature_yes_prob CHECK (
        yes_probability IS NULL OR yes_probability BETWEEN 0 AND 1
    ),
    CONSTRAINT hr_pm_feature_confidence CHECK (
        liquidity_confidence BETWEEN 0 AND 1
    ),
    CONSTRAINT hr_pm_feature_imbalance CHECK (
        book_imbalance IS NULL OR book_imbalance BETWEEN -1 AND 1
    )
);
CREATE INDEX IF NOT EXISTS idx_hr_pm_features_market_time
    ON public.hr_polymarket_feature_snapshots (market_id, bucket_at DESC);
CREATE INDEX IF NOT EXISTS idx_hr_pm_features_pulse
    ON public.hr_polymarket_feature_snapshots (bucket_at DESC)
    WHERE yes_probability IS NOT NULL;
COMMENT ON TABLE public.hr_polymarket_feature_snapshots IS
  'History Rhymes one-row-per-market-minute Polymarket microstructure features. Raw ticks remain in Confluent/BigQuery.';

CREATE TABLE IF NOT EXISTS public.hr_polymarket_stream_status (
    component                   text PRIMARY KEY,
    status                      text NOT NULL,
    connection_last_message_at  timestamptz,
    market_last_event_at        timestamptz,
    last_discovery_at           timestamptz,
    last_reconciliation_at      timestamptz,
    last_snapshot_at            timestamptz,
    reconnect_count             integer NOT NULL DEFAULT 0,
    subscribed_market_count     integer NOT NULL DEFAULT 0,
    consumer_offsets            jsonb NOT NULL DEFAULT '{}'::jsonb,
    last_error                  text,
    updated_at                  timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT hr_pm_stream_status_chk CHECK (
        status IN ('disabled', 'starting', 'live', 'stale', 'unavailable')
    )
);
COMMENT ON TABLE public.hr_polymarket_stream_status IS
  'History Rhymes operational handshake for the Polymarket ingestion and materialization workers.';

CREATE TABLE IF NOT EXISTS public.hr_forecast_questions (
    question_id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    market_id           text NOT NULL UNIQUE REFERENCES public.hr_polymarket_markets(market_id) ON DELETE CASCADE,
    family              text,
    subject             text,
    predicate           text,
    threshold           double precision,
    target_date         date,
    timezone            text,
    resolution_source   text,
    mapping_status      text NOT NULL,
    mapping_reason      text,
    parser_version      text NOT NULL,
    parsed_json         jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT hr_fq_mapping_status_chk CHECK (
        mapping_status IN ('eligible', 'unsupported', 'ambiguous')
    ),
    CONSTRAINT hr_fq_predicate_chk CHECK (
        predicate IS NULL OR predicate IN ('above', 'below', 'at_least', 'at_most', 'equals')
    )
);
CREATE INDEX IF NOT EXISTS idx_hr_fq_family_status
    ON public.hr_forecast_questions (family, mapping_status);
COMMENT ON TABLE public.hr_forecast_questions IS
  'Deterministic, auditable parsing of supported Polymarket questions. LLMs never set predicates or probabilities.';

CREATE TABLE IF NOT EXISTS public.hr_event_forecasts (
    id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    question_id              uuid NOT NULL REFERENCES public.hr_forecast_questions(question_id) ON DELETE CASCADE,
    forecast_at              timestamptz NOT NULL,
    p_polymarket             double precision,
    p_hr                     double precision,
    posterior_lower          double precision,
    posterior_upper          double precision,
    signed_divergence        double precision,
    p_base                   double precision,
    analog_count             integer NOT NULL DEFAULT 0,
    effective_sample_size    double precision NOT NULL DEFAULT 0,
    analog_sample            jsonb NOT NULL DEFAULT '[]'::jsonb,
    calibration              jsonb NOT NULL DEFAULT '{}'::jsonb,
    forecast_status          text NOT NULL,
    null_reason              text,
    model_version            text NOT NULL,
    data_lineage             jsonb NOT NULL DEFAULT '{}'::jsonb,
    research_only            boolean NOT NULL DEFAULT true,
    eligible_position_sizing boolean NOT NULL DEFAULT false,
    resolution_at            timestamptz,
    actual_outcome           double precision,
    brier_score              double precision,
    created_at               timestamptz NOT NULL DEFAULT now(),
    UNIQUE (question_id, forecast_at),
    CONSTRAINT hr_ef_status_chk CHECK (
        forecast_status IN ('research', 'withheld', 'unsupported', 'ambiguous', 'stale', 'uncalibrated')
    ),
    CONSTRAINT hr_ef_p_poly_chk CHECK (
        p_polymarket IS NULL OR p_polymarket BETWEEN 0 AND 1
    ),
    CONSTRAINT hr_ef_p_hr_chk CHECK (
        p_hr IS NULL OR p_hr BETWEEN 0 AND 1
    ),
    CONSTRAINT hr_ef_interval_chk CHECK (
        (posterior_lower IS NULL AND posterior_upper IS NULL)
        OR (posterior_lower BETWEEN 0 AND 1 AND posterior_upper BETWEEN 0 AND 1
            AND posterior_lower <= posterior_upper)
    ),
    CONSTRAINT hr_ef_position_sizing_chk CHECK (
        eligible_position_sizing = false OR research_only = false
    ),
    CONSTRAINT hr_ef_actual_outcome_chk CHECK (
        actual_outcome IS NULL OR actual_outcome IN (0, 1)
    )
);
CREATE INDEX IF NOT EXISTS idx_hr_ef_question_time
    ON public.hr_event_forecasts (question_id, forecast_at DESC);
CREATE INDEX IF NOT EXISTS idx_hr_ef_divergence
    ON public.hr_event_forecasts (forecast_at DESC)
    WHERE p_hr IS NOT NULL;
COMMENT ON TABLE public.hr_event_forecasts IS
  'Auditable History Rhymes event probabilities and signed Polymarket divergence. Research-only until live-resolution gates pass.';
