-- 302_consulting_loop_intelligence.sql
-- Loop Intelligence for the Novendor consulting workspace.
--
-- V1 scope: human-entered loop registry, deterministic labor cost model,
-- intervention snapshots, and environment/business scoping.

CREATE TABLE IF NOT EXISTS nv_loop (
    id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    env_id                      text NOT NULL,
    business_id                 uuid NOT NULL,
    client_id                   uuid REFERENCES cro_client(id) ON DELETE SET NULL,
    name                        text NOT NULL,
    process_domain              text NOT NULL,
    description                 text,
    trigger_type                text NOT NULL
                                CHECK (trigger_type IN ('scheduled', 'event', 'manual')),
    frequency_type              text NOT NULL
                                CHECK (frequency_type IN ('daily', 'weekly', 'monthly', 'quarterly', 'ad_hoc')),
    frequency_per_year          numeric(18,4) NOT NULL DEFAULT 0
                                CHECK (frequency_per_year >= 0),
    status                      text NOT NULL
                                CHECK (status IN ('observed', 'simplifying', 'automating', 'stabilized')),
    control_maturity_stage      smallint NOT NULL
                                CHECK (control_maturity_stage BETWEEN 1 AND 5),
    automation_readiness_score  int NOT NULL DEFAULT 0
                                CHECK (automation_readiness_score BETWEEN 0 AND 100),
    avg_wait_time_minutes       numeric(18,4) NOT NULL DEFAULT 0
                                CHECK (avg_wait_time_minutes >= 0),
    rework_rate_percent         numeric(9,4) NOT NULL DEFAULT 0
                                CHECK (rework_rate_percent BETWEEN 0 AND 100),
    created_at                  timestamptz NOT NULL DEFAULT now(),
    updated_at                  timestamptz NOT NULL DEFAULT now(),
    UNIQUE (env_id, business_id, name)
);

CREATE TABLE IF NOT EXISTS nv_loop_role (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    loop_id             uuid NOT NULL REFERENCES nv_loop(id) ON DELETE CASCADE,
    role_name           text NOT NULL,
    loaded_hourly_rate  numeric(18,4) NOT NULL CHECK (loaded_hourly_rate >= 0),
    active_minutes      numeric(18,4) NOT NULL CHECK (active_minutes >= 0),
    notes               text,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS nv_loop_intervention (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    loop_id                 uuid NOT NULL REFERENCES nv_loop(id) ON DELETE CASCADE,
    intervention_type       text NOT NULL
                            CHECK (intervention_type IN (
                                'remove_step',
                                'consolidate_role',
                                'automate_step',
                                'policy_rewrite',
                                'data_standardize',
                                'other'
                            )),
    notes                   text,
    before_snapshot         jsonb NOT NULL,
    after_snapshot          jsonb,
    observed_delta_percent  numeric(9,4),
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_nv_loop_env_business
    ON nv_loop (env_id, business_id);

CREATE INDEX IF NOT EXISTS idx_nv_loop_env_business_status
    ON nv_loop (env_id, business_id, status);

CREATE INDEX IF NOT EXISTS idx_nv_loop_env_business_domain
    ON nv_loop (env_id, business_id, process_domain);

CREATE INDEX IF NOT EXISTS idx_nv_loop_env_client
    ON nv_loop (env_id, client_id);

CREATE INDEX IF NOT EXISTS idx_nv_loop_role_loop_id
    ON nv_loop_role (loop_id);

CREATE INDEX IF NOT EXISTS idx_nv_loop_intervention_loop_created
    ON nv_loop_intervention (loop_id, created_at DESC);
