-- 379_psychrag_core.sql
-- PsychRAG clinical psychology bounded-module schema.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'vector') THEN
    CREATE EXTENSION IF NOT EXISTS vector;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION psychrag_current_user_id() RETURNS uuid
LANGUAGE sql STABLE
AS $$
  SELECT COALESCE(
    NULLIF((COALESCE(NULLIF(current_setting('request.jwt.claims', true), ''), '{}')::json ->> 'sub'), ''),
    NULLIF(current_setting('app.current_user_id', true), '')
  )::uuid;
$$;

CREATE OR REPLACE FUNCTION psychrag_touch_updated_at() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS psychrag_practices (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                text NOT NULL,
  slug                text NOT NULL UNIQUE,
  is_default          boolean NOT NULL DEFAULT false,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS psychrag_profiles (
  id                  uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  practice_id         uuid NOT NULL REFERENCES psychrag_practices(id) ON DELETE CASCADE,
  role                text NOT NULL CHECK (role IN ('patient', 'therapist', 'admin')),
  display_name        text NOT NULL,
  email               text NOT NULL,
  license_number      text,
  license_state       text,
  specializations     text[] NOT NULL DEFAULT '{}',
  onboarding_complete boolean NOT NULL DEFAULT false,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION psychrag_current_role() RETURNS text
LANGUAGE sql STABLE
AS $$
  SELECT p.role
  FROM psychrag_profiles p
  WHERE p.id = psychrag_current_user_id();
$$;

CREATE TABLE IF NOT EXISTS psychrag_practice_memberships (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id         uuid NOT NULL REFERENCES psychrag_practices(id) ON DELETE CASCADE,
  profile_id          uuid NOT NULL REFERENCES psychrag_profiles(id) ON DELETE CASCADE,
  membership_role     text NOT NULL CHECK (membership_role IN ('patient', 'therapist', 'admin')),
  is_primary          boolean NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (practice_id, profile_id)
);

CREATE TABLE IF NOT EXISTS psychrag_patient_therapist (
  id                                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id                       uuid NOT NULL REFERENCES psychrag_practices(id) ON DELETE CASCADE,
  patient_id                        uuid NOT NULL REFERENCES psychrag_profiles(id) ON DELETE CASCADE,
  therapist_id                      uuid REFERENCES psychrag_profiles(id) ON DELETE SET NULL,
  therapist_email                   text NOT NULL,
  status                            text NOT NULL CHECK (status IN ('pending', 'active', 'inactive')),
  allow_therapist_feedback_to_ai    boolean NOT NULL DEFAULT false,
  consent_captured_at               timestamptz,
  connected_at                      timestamptz,
  created_at                        timestamptz NOT NULL DEFAULT now(),
  updated_at                        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (patient_id, therapist_email)
);

CREATE TABLE IF NOT EXISTS psychrag_chat_sessions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id         uuid NOT NULL REFERENCES psychrag_practices(id) ON DELETE CASCADE,
  patient_id          uuid NOT NULL REFERENCES psychrag_profiles(id) ON DELETE CASCADE,
  title               text,
  session_type        text NOT NULL CHECK (session_type IN ('therapy', 'psychoeducation', 'crisis')),
  mood_pre            smallint CHECK (mood_pre BETWEEN 1 AND 10),
  mood_post           smallint CHECK (mood_post BETWEEN 1 AND 10),
  techniques_used     text[] NOT NULL DEFAULT '{}',
  ai_summary          text,
  ai_summary_generated_at timestamptz,
  crisis_level        text NOT NULL DEFAULT 'none' CHECK (crisis_level IN ('none', 'low', 'moderate', 'high', 'crisis')),
  is_active           boolean NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  ended_at            timestamptz
);

CREATE TABLE IF NOT EXISTS psychrag_messages (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id          uuid NOT NULL REFERENCES psychrag_chat_sessions(id) ON DELETE CASCADE,
  role                text NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content             text NOT NULL,
  rag_sources         jsonb NOT NULL DEFAULT '[]'::jsonb,
  rag_query           text,
  safety_flags        jsonb NOT NULL DEFAULT '{}'::jsonb,
  model_used          text,
  token_count_input   int,
  token_count_output  int,
  latency_ms          int,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS psychrag_shared_sessions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id          uuid NOT NULL REFERENCES psychrag_chat_sessions(id) ON DELETE CASCADE,
  practice_id         uuid NOT NULL REFERENCES psychrag_practices(id) ON DELETE CASCADE,
  patient_id          uuid NOT NULL REFERENCES psychrag_profiles(id) ON DELETE CASCADE,
  therapist_id        uuid NOT NULL REFERENCES psychrag_profiles(id) ON DELETE CASCADE,
  share_type          text NOT NULL CHECK (share_type IN ('full', 'summary_only', 'flagged_only')),
  patient_note        text,
  reviewed            boolean NOT NULL DEFAULT false,
  reviewed_at         timestamptz,
  therapist_notes     text,
  risk_assessment     text CHECK (risk_assessment IN ('none', 'low', 'moderate', 'high', 'crisis')),
  follow_up_needed    boolean NOT NULL DEFAULT false,
  ai_clinical_summary text,
  shared_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, therapist_id)
);

CREATE TABLE IF NOT EXISTS psychrag_annotations (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shared_session_id   uuid NOT NULL REFERENCES psychrag_shared_sessions(id) ON DELETE CASCADE,
  therapist_id        uuid NOT NULL REFERENCES psychrag_profiles(id) ON DELETE CASCADE,
  message_id          uuid REFERENCES psychrag_messages(id) ON DELETE SET NULL,
  annotation_type     text NOT NULL CHECK (annotation_type IN (
    'clinical_note', 'risk_flag', 'technique_suggestion', 'homework_assignment', 'diagnosis_observation'
  )),
  content             text NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS psychrag_assessments (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id         uuid NOT NULL REFERENCES psychrag_practices(id) ON DELETE CASCADE,
  patient_id          uuid NOT NULL REFERENCES psychrag_profiles(id) ON DELETE CASCADE,
  instrument          text NOT NULL CHECK (instrument IN ('phq9', 'gad7')),
  responses           jsonb NOT NULL,
  total_score         int NOT NULL,
  severity            text NOT NULL,
  administered_by     text NOT NULL CHECK (administered_by IN ('self', 'ai_prompted', 'therapist')),
  session_id          uuid REFERENCES psychrag_chat_sessions(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS psychrag_kb_documents (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id         uuid REFERENCES psychrag_practices(id) ON DELETE CASCADE,
  title               text NOT NULL,
  author              text,
  document_type       text NOT NULL CHECK (document_type IN (
    'textbook', 'clinical_guideline', 'research_paper',
    'treatment_manual', 'assessment_instrument', 'psychoeducation'
  )),
  source_url          text,
  source_license      text NOT NULL CHECK (source_license IN (
    'owned', 'licensed', 'public_domain', 'rights_cleared', 'restricted'
  )),
  approved_for_rag    boolean NOT NULL DEFAULT false,
  rights_notes        text,
  embedding_model     text,
  total_chunks        int NOT NULL DEFAULT 0,
  metadata            jsonb NOT NULL DEFAULT '{}'::jsonb,
  ingested_by         uuid REFERENCES psychrag_profiles(id) ON DELETE SET NULL,
  ingested_at         timestamptz NOT NULL DEFAULT now(),
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS psychrag_kb_chunks (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id         uuid NOT NULL REFERENCES psychrag_kb_documents(id) ON DELETE CASCADE,
  chunk_index         int NOT NULL,
  content             text NOT NULL,
  chapter             text,
  section             text,
  page_start          int,
  page_end            int,
  token_count         int NOT NULL DEFAULT 0,
  embedding           vector(3072),
  created_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (document_id, chunk_index)
);

ALTER TABLE psychrag_kb_chunks
  ADD COLUMN IF NOT EXISTS search_tsv tsvector
  GENERATED ALWAYS AS (to_tsvector('english', content)) STORED;

CREATE TABLE IF NOT EXISTS psychrag_crisis_events (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id         uuid NOT NULL REFERENCES psychrag_practices(id) ON DELETE CASCADE,
  patient_id          uuid NOT NULL REFERENCES psychrag_profiles(id) ON DELETE CASCADE,
  session_id          uuid NOT NULL REFERENCES psychrag_chat_sessions(id) ON DELETE CASCADE,
  message_id          uuid REFERENCES psychrag_messages(id) ON DELETE SET NULL,
  risk_level          text NOT NULL CHECK (risk_level IN ('low', 'moderate', 'high', 'crisis')),
  detection_sources   text[] NOT NULL DEFAULT '{}',
  requires_resources  boolean NOT NULL DEFAULT true,
  therapist_notified  boolean NOT NULL DEFAULT false,
  status              text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'reviewed', 'dismissed')),
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS psychrag_notifications (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id         uuid NOT NULL REFERENCES psychrag_practices(id) ON DELETE CASCADE,
  therapist_id        uuid NOT NULL REFERENCES psychrag_profiles(id) ON DELETE CASCADE,
  patient_id          uuid REFERENCES psychrag_profiles(id) ON DELETE CASCADE,
  shared_session_id   uuid REFERENCES psychrag_shared_sessions(id) ON DELETE CASCADE,
  crisis_event_id     uuid REFERENCES psychrag_crisis_events(id) ON DELETE CASCADE,
  notification_type   text NOT NULL CHECK (notification_type IN ('shared_session', 'crisis_alert', 'summary_ready')),
  status              text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'acknowledged')),
  payload             jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at          timestamptz NOT NULL DEFAULT now(),
  acknowledged_at     timestamptz
);

CREATE TABLE IF NOT EXISTS psychrag_access_audit_log (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id         uuid REFERENCES psychrag_practices(id) ON DELETE CASCADE,
  actor_id            uuid REFERENCES psychrag_profiles(id) ON DELETE SET NULL,
  actor_role          text,
  event_type          text NOT NULL,
  target_type         text NOT NULL,
  target_id           uuid,
  metadata            jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS psychrag_profiles_practice_idx
  ON psychrag_profiles (practice_id, role, created_at DESC);
CREATE INDEX IF NOT EXISTS psychrag_memberships_practice_idx
  ON psychrag_practice_memberships (practice_id, membership_role);
CREATE INDEX IF NOT EXISTS psychrag_relationship_patient_idx
  ON psychrag_patient_therapist (patient_id, status);
CREATE INDEX IF NOT EXISTS psychrag_relationship_therapist_idx
  ON psychrag_patient_therapist (therapist_id, status);
CREATE INDEX IF NOT EXISTS psychrag_sessions_patient_idx
  ON psychrag_chat_sessions (patient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS psychrag_messages_session_idx
  ON psychrag_messages (session_id, created_at ASC);
CREATE INDEX IF NOT EXISTS psychrag_shared_sessions_therapist_idx
  ON psychrag_shared_sessions (therapist_id, reviewed, shared_at DESC);
CREATE INDEX IF NOT EXISTS psychrag_assessments_patient_idx
  ON psychrag_assessments (patient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS psychrag_kb_documents_license_idx
  ON psychrag_kb_documents (approved_for_rag, source_license, created_at DESC);
CREATE INDEX IF NOT EXISTS psychrag_kb_chunks_doc_idx
  ON psychrag_kb_chunks (document_id, chunk_index);
CREATE INDEX IF NOT EXISTS psychrag_kb_chunks_fts_idx
  ON psychrag_kb_chunks USING GIN (search_tsv);
CREATE INDEX IF NOT EXISTS psychrag_kb_chunks_embedding_idx
  ON psychrag_kb_chunks USING hnsw ((embedding::halfvec(3072)) halfvec_cosine_ops)
  WITH (m = 16, ef_construction = 64);
CREATE INDEX IF NOT EXISTS psychrag_crisis_events_patient_idx
  ON psychrag_crisis_events (patient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS psychrag_notifications_therapist_idx
  ON psychrag_notifications (therapist_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS psychrag_access_audit_idx
  ON psychrag_access_audit_log (practice_id, created_at DESC);

DROP TRIGGER IF EXISTS psychrag_practices_touch_updated_at ON psychrag_practices;
CREATE TRIGGER psychrag_practices_touch_updated_at
  BEFORE UPDATE ON psychrag_practices
  FOR EACH ROW EXECUTE FUNCTION psychrag_touch_updated_at();

DROP TRIGGER IF EXISTS psychrag_profiles_touch_updated_at ON psychrag_profiles;
CREATE TRIGGER psychrag_profiles_touch_updated_at
  BEFORE UPDATE ON psychrag_profiles
  FOR EACH ROW EXECUTE FUNCTION psychrag_touch_updated_at();

DROP TRIGGER IF EXISTS psychrag_relationship_touch_updated_at ON psychrag_patient_therapist;
CREATE TRIGGER psychrag_relationship_touch_updated_at
  BEFORE UPDATE ON psychrag_patient_therapist
  FOR EACH ROW EXECUTE FUNCTION psychrag_touch_updated_at();

DROP TRIGGER IF EXISTS psychrag_sessions_touch_updated_at ON psychrag_chat_sessions;
CREATE TRIGGER psychrag_sessions_touch_updated_at
  BEFORE UPDATE ON psychrag_chat_sessions
  FOR EACH ROW EXECUTE FUNCTION psychrag_touch_updated_at();

INSERT INTO psychrag_practices (name, slug, is_default)
VALUES ('PsychRAG Default Practice', 'psychrag-default-practice', true)
ON CONFLICT (slug) DO UPDATE
SET is_default = EXCLUDED.is_default;

ALTER TABLE psychrag_practices ENABLE ROW LEVEL SECURITY;
ALTER TABLE psychrag_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE psychrag_practice_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE psychrag_patient_therapist ENABLE ROW LEVEL SECURITY;
ALTER TABLE psychrag_chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE psychrag_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE psychrag_shared_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE psychrag_annotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE psychrag_assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE psychrag_kb_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE psychrag_kb_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE psychrag_crisis_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE psychrag_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE psychrag_access_audit_log ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY psychrag_profiles_select ON psychrag_profiles
    FOR SELECT USING (
      id = psychrag_current_user_id()
      OR (
        practice_id = (SELECT p.practice_id FROM psychrag_profiles p WHERE p.id = psychrag_current_user_id())
        AND psychrag_current_role() IN ('therapist', 'admin')
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY psychrag_profiles_upsert ON psychrag_profiles
    FOR INSERT WITH CHECK (id = psychrag_current_user_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY psychrag_profiles_update ON psychrag_profiles
    FOR UPDATE USING (id = psychrag_current_user_id() OR psychrag_current_role() = 'admin')
    WITH CHECK (id = psychrag_current_user_id() OR psychrag_current_role() = 'admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY psychrag_memberships_select ON psychrag_practice_memberships
    FOR SELECT USING (
      profile_id = psychrag_current_user_id()
      OR psychrag_current_role() IN ('therapist', 'admin')
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY psychrag_relationships_access ON psychrag_patient_therapist
    FOR ALL USING (
      patient_id = psychrag_current_user_id()
      OR therapist_id = psychrag_current_user_id()
      OR psychrag_current_role() = 'admin'
    )
    WITH CHECK (
      patient_id = psychrag_current_user_id()
      OR therapist_id = psychrag_current_user_id()
      OR psychrag_current_role() = 'admin'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY psychrag_sessions_access ON psychrag_chat_sessions
    FOR ALL USING (
      patient_id = psychrag_current_user_id()
      OR EXISTS (
        SELECT 1
        FROM psychrag_shared_sessions ss
        WHERE ss.session_id = psychrag_chat_sessions.id
          AND ss.therapist_id = psychrag_current_user_id()
      )
      OR psychrag_current_role() = 'admin'
    )
    WITH CHECK (
      patient_id = psychrag_current_user_id()
      OR psychrag_current_role() = 'admin'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY psychrag_messages_access ON psychrag_messages
    FOR SELECT USING (
      EXISTS (
        SELECT 1
        FROM psychrag_chat_sessions s
        WHERE s.id = psychrag_messages.session_id
          AND (
            s.patient_id = psychrag_current_user_id()
            OR EXISTS (
              SELECT 1
              FROM psychrag_shared_sessions ss
              WHERE ss.session_id = s.id
                AND ss.therapist_id = psychrag_current_user_id()
            )
            OR psychrag_current_role() = 'admin'
          )
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY psychrag_messages_insert ON psychrag_messages
    FOR INSERT WITH CHECK (
      EXISTS (
        SELECT 1
        FROM psychrag_chat_sessions s
        WHERE s.id = psychrag_messages.session_id
          AND (
            s.patient_id = psychrag_current_user_id()
            OR psychrag_current_role() = 'admin'
          )
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY psychrag_shared_sessions_access ON psychrag_shared_sessions
    FOR ALL USING (
      patient_id = psychrag_current_user_id()
      OR therapist_id = psychrag_current_user_id()
      OR psychrag_current_role() = 'admin'
    )
    WITH CHECK (
      patient_id = psychrag_current_user_id()
      OR therapist_id = psychrag_current_user_id()
      OR psychrag_current_role() = 'admin'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY psychrag_annotations_access ON psychrag_annotations
    FOR ALL USING (
      therapist_id = psychrag_current_user_id()
      OR psychrag_current_role() = 'admin'
      OR EXISTS (
        SELECT 1
        FROM psychrag_shared_sessions ss
        WHERE ss.id = psychrag_annotations.shared_session_id
          AND ss.patient_id = psychrag_current_user_id()
      )
    )
    WITH CHECK (
      therapist_id = psychrag_current_user_id()
      OR psychrag_current_role() = 'admin'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY psychrag_assessments_access ON psychrag_assessments
    FOR ALL USING (
      patient_id = psychrag_current_user_id()
      OR EXISTS (
        SELECT 1
        FROM psychrag_patient_therapist pt
        WHERE pt.patient_id = psychrag_assessments.patient_id
          AND pt.therapist_id = psychrag_current_user_id()
          AND pt.status = 'active'
      )
      OR psychrag_current_role() = 'admin'
    )
    WITH CHECK (
      patient_id = psychrag_current_user_id()
      OR psychrag_current_role() = 'admin'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY psychrag_kb_documents_admin_only ON psychrag_kb_documents
    FOR ALL USING (psychrag_current_role() = 'admin')
    WITH CHECK (psychrag_current_role() = 'admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY psychrag_kb_chunks_admin_only ON psychrag_kb_chunks
    FOR ALL USING (psychrag_current_role() = 'admin')
    WITH CHECK (psychrag_current_role() = 'admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY psychrag_crisis_events_access ON psychrag_crisis_events
    FOR SELECT USING (
      patient_id = psychrag_current_user_id()
      OR EXISTS (
        SELECT 1
        FROM psychrag_patient_therapist pt
        WHERE pt.patient_id = psychrag_crisis_events.patient_id
          AND pt.therapist_id = psychrag_current_user_id()
          AND pt.status = 'active'
      )
      OR psychrag_current_role() = 'admin'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY psychrag_crisis_events_insert ON psychrag_crisis_events
    FOR INSERT WITH CHECK (
      patient_id = psychrag_current_user_id()
      OR psychrag_current_role() IN ('therapist', 'admin')
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY psychrag_notifications_access ON psychrag_notifications
    FOR ALL USING (
      therapist_id = psychrag_current_user_id()
      OR psychrag_current_role() = 'admin'
    )
    WITH CHECK (
      therapist_id = psychrag_current_user_id()
      OR psychrag_current_role() = 'admin'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY psychrag_access_audit_admin_only ON psychrag_access_audit_log
    FOR ALL USING (psychrag_current_role() = 'admin')
    WITH CHECK (psychrag_current_role() = 'admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
