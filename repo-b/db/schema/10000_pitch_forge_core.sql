-- 10000_pitch_forge_core.sql
-- Pitch Forge — bounded proposal generation pipeline.
--
-- Turns client research into a sharp, client-specific proposal through a
-- controlled build → red team → rebuild loop. Max 3 passes per project.
-- Every output is scored and either passes (≥80), is rebuilt, or fails loudly.
--
-- Tables:
--   - pf_project          top-level pitch project, one per client engagement
--   - pf_source           research inputs with provenance
--   - pf_claim            individual factual claims derived from sources
--   - pf_use_case         candidate use cases in a draft iteration
--   - pf_red_team_review  structured critique of a draft
--   - pf_iteration        versioned draft snapshots
--   - pf_final_output     client-ready output (produced only when score ≥ 80)
--
-- Idempotent.

-- =============================================================================
-- I. pf_project — top-level pitch project
-- =============================================================================

CREATE TABLE IF NOT EXISTS pf_project (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    env_id              text NOT NULL,
    business_id         uuid NOT NULL,
    client_name         text NOT NULL,
    client_slug         text NOT NULL,
    status              text NOT NULL DEFAULT 'research'
                        CHECK (status IN ('research','drafting','red_team','rebuilding','passed','failed')),
    iteration_count     int NOT NULL DEFAULT 0
                        CHECK (iteration_count <= 3),
    current_score       int,
    pass_threshold      int NOT NULL DEFAULT 80,
    fail_reason         text,
    notes               text,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    UNIQUE (env_id, business_id, client_slug)
);

COMMENT ON TABLE pf_project IS
    'Pitch Forge top-level project. One per client engagement. Tracks iteration state and pass/fail. Max 3 iterations enforced at app level. Owned by pitch_forge service.';
COMMENT ON COLUMN pf_project.iteration_count IS
    'Number of full build→red team cycles completed. Hard cap 3; app raises PitchForgeMaxIterationsError beyond that.';
COMMENT ON COLUMN pf_project.current_score IS
    'Latest red-team score 0–100. 80+ = pass; 65–79 = rebuild allowed; <65 = research refill required.';
COMMENT ON COLUMN pf_project.fail_reason IS
    'Populated when status=failed. States what input is missing or which fatal issue could not be resolved.';

CREATE INDEX IF NOT EXISTS idx_pf_project_env_status
    ON pf_project (env_id, business_id, status, updated_at DESC);

ALTER TABLE pf_project ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pf_project_tenant_isolation ON pf_project;
CREATE POLICY pf_project_tenant_isolation ON pf_project
    USING (
        env_id = current_setting('app.env_id', true)
        OR current_setting('app.env_id', true) IS NULL
    );

-- =============================================================================
-- II. pf_source — research inputs with provenance
-- =============================================================================

CREATE TABLE IF NOT EXISTS pf_source (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    env_id          text NOT NULL,
    business_id     uuid NOT NULL,
    project_id      uuid NOT NULL REFERENCES pf_project(id) ON DELETE CASCADE,
    source_type     text NOT NULL
                    CHECK (source_type IN ('deep_research','interview_note','questionnaire','document','inference','public_record')),
    label           text NOT NULL,
    content         text NOT NULL,
    url             text,
    confidence      text NOT NULL DEFAULT 'medium'
                    CHECK (confidence IN ('high','medium','low','unknown')),
    created_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE pf_source IS
    'Research inputs for a Pitch Forge project. Every claim must trace back to at least one source. Owned by pitch_forge service.';
COMMENT ON COLUMN pf_source.source_type IS
    'deep_research=structured AI research doc; interview_note=direct from client; inference=reasoned from known facts (must be flagged as such).';

CREATE INDEX IF NOT EXISTS idx_pf_source_project
    ON pf_source (project_id, source_type);

ALTER TABLE pf_source ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pf_source_tenant_isolation ON pf_source;
CREATE POLICY pf_source_tenant_isolation ON pf_source
    USING (
        env_id = current_setting('app.env_id', true)
        OR current_setting('app.env_id', true) IS NULL
    );

-- =============================================================================
-- III. pf_claim — individual factual claims derived from sources
-- =============================================================================

CREATE TABLE IF NOT EXISTS pf_claim (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    env_id          text NOT NULL,
    business_id     uuid NOT NULL,
    project_id      uuid NOT NULL REFERENCES pf_project(id) ON DELETE CASCADE,
    source_id       uuid REFERENCES pf_source(id) ON DELETE SET NULL,
    claim_text      text NOT NULL,
    claim_category  text NOT NULL
                    CHECK (claim_category IN ('constraint','fact','inference','gap','risk')),
    is_available    bool NOT NULL DEFAULT true,
    unavailable_reason text,
    created_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE pf_claim IS
    'Individual factual claims used to build use cases. Gaps and unknown data must be recorded with is_available=false and a reason. Owned by pitch_forge service.';
COMMENT ON COLUMN pf_claim.claim_category IS
    'constraint=hard client limit; fact=verified; inference=reasoned (flagged); gap=data we need but lack; risk=known hazard.';
COMMENT ON COLUMN pf_claim.is_available IS
    'False when data is missing. unavailable_reason must be set. UI surfaces this as "Not available: <reason>".';

CREATE INDEX IF NOT EXISTS idx_pf_claim_project_category
    ON pf_claim (project_id, claim_category, is_available);

ALTER TABLE pf_claim ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pf_claim_tenant_isolation ON pf_claim;
CREATE POLICY pf_claim_tenant_isolation ON pf_claim
    USING (
        env_id = current_setting('app.env_id', true)
        OR current_setting('app.env_id', true) IS NULL
    );

-- =============================================================================
-- IV. pf_iteration — versioned draft snapshots
-- =============================================================================

CREATE TABLE IF NOT EXISTS pf_iteration (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    env_id          text NOT NULL,
    business_id     uuid NOT NULL,
    project_id      uuid NOT NULL REFERENCES pf_project(id) ON DELETE CASCADE,
    iteration_num   int NOT NULL CHECK (iteration_num BETWEEN 1 AND 3),
    status          text NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft','red_teamed','rebuilt','passed','failed')),
    score           int CHECK (score BETWEEN 0 AND 100),
    score_breakdown jsonb,
    raw_proposal    text,
    rebuilt_proposal text,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    UNIQUE (project_id, iteration_num)
);

COMMENT ON TABLE pf_iteration IS
    'Versioned draft snapshots for a Pitch Forge project. Max 3 rows per project (enforced by CHECK + app logic). score_breakdown holds per-dimension scores. Owned by pitch_forge service.';
COMMENT ON COLUMN pf_iteration.score_breakdown IS
    'JSON: {specificity: int, economic_value: int, client_fit: int, evidence_quality: int, demo_readiness: int}. Weights: 25/25/20/15/15.';

CREATE INDEX IF NOT EXISTS idx_pf_iteration_project
    ON pf_iteration (project_id, iteration_num DESC);

ALTER TABLE pf_iteration ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pf_iteration_tenant_isolation ON pf_iteration;
CREATE POLICY pf_iteration_tenant_isolation ON pf_iteration
    USING (
        env_id = current_setting('app.env_id', true)
        OR current_setting('app.env_id', true) IS NULL
    );

-- =============================================================================
-- V. pf_use_case — candidate use cases within an iteration
-- =============================================================================

CREATE TABLE IF NOT EXISTS pf_use_case (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    env_id              text NOT NULL,
    business_id         uuid NOT NULL,
    project_id          uuid NOT NULL REFERENCES pf_project(id) ON DELETE CASCADE,
    iteration_id        uuid NOT NULL REFERENCES pf_iteration(id) ON DELETE CASCADE,
    workflow_name       text NOT NULL,
    current_pain        text NOT NULL,
    proposed_intervention text NOT NULL,
    who_uses_it         text NOT NULL,
    change_tomorrow     text NOT NULL,
    estimated_impact    text NOT NULL,
    impact_confidence   text NOT NULL DEFAULT 'medium'
                        CHECK (impact_confidence IN ('high','medium','low','speculative')),
    dependencies        text,
    novendor_credibility text NOT NULL,
    status              text NOT NULL DEFAULT 'candidate'
                        CHECK (status IN ('candidate','killed','weak','passed')),
    kill_reason         text,
    created_at          timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE pf_use_case IS
    'Individual use case within a Pitch Forge iteration. Must include an economic impact estimate. Red team may kill or mark as weak. Owned by pitch_forge service.';
COMMENT ON COLUMN pf_use_case.change_tomorrow IS
    'What changes the next working morning if this is implemented. Grounds the pitch in operational reality.';
COMMENT ON COLUMN pf_use_case.estimated_impact IS
    'Quantified impact: time, cost, error rate, headcount hours, etc. Cannot be "improved efficiency" — must state a number or range.';
COMMENT ON COLUMN pf_use_case.kill_reason IS
    'Required when status=killed. Red team must cite the specific criterion that failed (generic_language, no_economic_delta, etc.).';

CREATE INDEX IF NOT EXISTS idx_pf_use_case_iteration
    ON pf_use_case (iteration_id, status);
CREATE INDEX IF NOT EXISTS idx_pf_use_case_project
    ON pf_use_case (project_id, status);

ALTER TABLE pf_use_case ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pf_use_case_tenant_isolation ON pf_use_case;
CREATE POLICY pf_use_case_tenant_isolation ON pf_use_case
    USING (
        env_id = current_setting('app.env_id', true)
        OR current_setting('app.env_id', true) IS NULL
    );

-- =============================================================================
-- VI. pf_red_team_review — structured critique of a draft iteration
-- =============================================================================

CREATE TABLE IF NOT EXISTS pf_red_team_review (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    env_id              text NOT NULL,
    business_id         uuid NOT NULL,
    project_id          uuid NOT NULL REFERENCES pf_project(id) ON DELETE CASCADE,
    iteration_id        uuid NOT NULL REFERENCES pf_iteration(id) ON DELETE CASCADE,
    score               int NOT NULL CHECK (score BETWEEN 0 AND 100),
    score_breakdown     jsonb NOT NULL,
    kill_list           jsonb NOT NULL DEFAULT '[]',
    weak_spots          jsonb NOT NULL DEFAULT '[]',
    missing_evidence    jsonb NOT NULL DEFAULT '[]',
    research_refill     jsonb NOT NULL DEFAULT '[]',
    fatal_issues        jsonb NOT NULL DEFAULT '[]',
    fixable_issues      jsonb NOT NULL DEFAULT '[]',
    acceptable_weaknesses jsonb NOT NULL DEFAULT '[]',
    missing_inputs      jsonb NOT NULL DEFAULT '[]',
    verdict             text NOT NULL
                        CHECK (verdict IN ('pass','rebuild','research_refill','fail')),
    verdict_reason      text NOT NULL,
    created_at          timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE pf_red_team_review IS
    'Structured red-team critique of one Pitch Forge iteration. Every kill must cite a criterion. Verdict drives next step: pass/rebuild/research_refill/fail. Owned by pitch_forge service.';
COMMENT ON COLUMN pf_red_team_review.score_breakdown IS
    'Per-dimension scores: {specificity, economic_value, client_fit, evidence_quality, demo_readiness}.';
COMMENT ON COLUMN pf_red_team_review.verdict IS
    'pass=score≥80; rebuild=65–79; research_refill=<65; fail=after 3 passes still <80.';

CREATE INDEX IF NOT EXISTS idx_pf_red_team_project
    ON pf_red_team_review (project_id, iteration_id);

ALTER TABLE pf_red_team_review ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pf_red_team_tenant_isolation ON pf_red_team_review;
CREATE POLICY pf_red_team_tenant_isolation ON pf_red_team_review
    USING (
        env_id = current_setting('app.env_id', true)
        OR current_setting('app.env_id', true) IS NULL
    );

-- =============================================================================
-- VII. pf_final_output — client-ready output
-- =============================================================================

CREATE TABLE IF NOT EXISTS pf_final_output (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    env_id          text NOT NULL,
    business_id     uuid NOT NULL,
    project_id      uuid NOT NULL REFERENCES pf_project(id) ON DELETE CASCADE,
    iteration_id    uuid NOT NULL REFERENCES pf_iteration(id) ON DELETE CASCADE,
    format          text NOT NULL DEFAULT 'bullet_email'
                    CHECK (format IN ('bullet_email','deck_bullets','talking_points')),
    content         text NOT NULL,
    score           int NOT NULL,
    use_case_count  int NOT NULL,
    created_at      timestamptz NOT NULL DEFAULT now(),
    UNIQUE (project_id)
);

COMMENT ON TABLE pf_final_output IS
    'Client-ready output from Pitch Forge. Created only when score≥80. Format=bullet_email is the default. No white-paper format allowed. Owned by pitch_forge service.';

CREATE INDEX IF NOT EXISTS idx_pf_final_output_project
    ON pf_final_output (project_id, created_at DESC);

ALTER TABLE pf_final_output ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pf_final_output_tenant_isolation ON pf_final_output;
CREATE POLICY pf_final_output_tenant_isolation ON pf_final_output
    USING (
        env_id = current_setting('app.env_id', true)
        OR current_setting('app.env_id', true) IS NULL
    );
