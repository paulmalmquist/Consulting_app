-- 417_local_ai_training_crm.sql
-- Mobile-friendly local training CRM for Novendor / Winston.
-- Built for founder-operated in-person AI class workflows: contacts,
-- partners, venues, events, registrations, outreach, campaigns, tasks,
-- and attendee feedback.

CREATE TABLE IF NOT EXISTS nv_contact_profile (
    crm_contact_id            uuid PRIMARY KEY REFERENCES crm_contact(crm_contact_id) ON DELETE CASCADE,
    env_id                    text NOT NULL,
    business_id               uuid NOT NULL,
    preferred_contact_method  text CHECK (preferred_contact_method IN ('email','phone','text','facebook','linkedin','in_person')),
    city                      text,
    age_band                  text,
    persona_type              text,
    audience_segment          text,
    business_owner_flag       boolean NOT NULL DEFAULT false,
    company_name_text         text,
    notes                     text,
    lead_source               text,
    status                    text NOT NULL DEFAULT 'new',
    consent_to_email          boolean NOT NULL DEFAULT false,
    first_event_attended_id   uuid,
    total_events_attended     int NOT NULL DEFAULT 0,
    interest_area             text,
    follow_up_priority        text,
    tags                      text[] NOT NULL DEFAULT ARRAY[]::text[],
    created_at                timestamptz NOT NULL DEFAULT now(),
    updated_at                timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS nv_organization_profile (
    crm_account_id            uuid PRIMARY KEY REFERENCES crm_account(crm_account_id) ON DELETE CASCADE,
    env_id                    text NOT NULL,
    business_id               uuid NOT NULL,
    organization_name         text NOT NULL,
    organization_type         text NOT NULL,
    phone                     text,
    city                      text,
    state                     text,
    relationship_type         text,
    partner_status            text,
    notes                     text,
    owner_contact_id          uuid REFERENCES crm_contact(crm_contact_id) ON DELETE SET NULL,
    created_at                timestamptz NOT NULL DEFAULT now(),
    updated_at                timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS nv_venue (
    id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    env_id                    text NOT NULL,
    business_id               uuid NOT NULL,
    organization_account_id   uuid REFERENCES crm_account(crm_account_id) ON DELETE SET NULL,
    venue_name                text NOT NULL,
    address                   text,
    city                      text,
    state                     text,
    zip                       text,
    website                   text,
    contact_name              text,
    contact_email             text,
    contact_phone             text,
    capacity_min              int,
    capacity_max              int,
    wifi_quality              text,
    av_available              boolean NOT NULL DEFAULT false,
    parking_notes             text,
    accessibility_notes       text,
    hourly_cost               numeric(18,2),
    deposit_required          boolean NOT NULL DEFAULT false,
    preferred_for_event_type  text,
    venue_status              text NOT NULL DEFAULT 'researching',
    is_preferred              boolean NOT NULL DEFAULT false,
    notes                     text,
    created_at                timestamptz NOT NULL DEFAULT now(),
    updated_at                timestamptz NOT NULL DEFAULT now(),
    UNIQUE (env_id, business_id, venue_name)
);

CREATE TABLE IF NOT EXISTS nv_training_event (
    id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    env_id                    text NOT NULL,
    business_id               uuid NOT NULL,
    event_name                text NOT NULL,
    event_series              text,
    event_type                text NOT NULL,
    event_status              text NOT NULL,
    event_date                date NOT NULL,
    event_start_time          time,
    event_end_time            time,
    venue_id                  uuid REFERENCES nv_venue(id) ON DELETE SET NULL,
    city                      text,
    target_capacity           int,
    actual_registrations      int NOT NULL DEFAULT 0,
    actual_attendance         int NOT NULL DEFAULT 0,
    ticket_price_standard     numeric(18,2),
    ticket_price_early        numeric(18,2),
    event_theme               text,
    audience_level            text,
    instructor                text,
    assistant_count           int NOT NULL DEFAULT 0,
    registration_link         text,
    check_in_status           text NOT NULL DEFAULT 'not_started',
    follow_up_sent_flag       boolean NOT NULL DEFAULT false,
    notes                     text,
    outcome_summary           text,
    created_at                timestamptz NOT NULL DEFAULT now(),
    updated_at                timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'fk_nv_contact_first_event'
          AND conrelid = 'nv_contact_profile'::regclass
    ) THEN
        ALTER TABLE nv_contact_profile
            ADD CONSTRAINT fk_nv_contact_first_event
            FOREIGN KEY (first_event_attended_id) REFERENCES nv_training_event(id) ON DELETE SET NULL;
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS nv_campaign (
    id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    env_id                    text NOT NULL,
    business_id               uuid NOT NULL,
    campaign_name             text NOT NULL,
    channel                   text NOT NULL,
    audience                  text,
    launch_date               date,
    end_date                  date,
    budget                    numeric(18,2),
    target_event_id           uuid REFERENCES nv_training_event(id) ON DELETE SET NULL,
    message_angle             text,
    status                    text NOT NULL DEFAULT 'draft',
    leads_generated           int NOT NULL DEFAULT 0,
    registrations_generated   int NOT NULL DEFAULT 0,
    notes                     text,
    created_at                timestamptz NOT NULL DEFAULT now(),
    updated_at                timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS nv_training_outreach_activity (
    id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    crm_activity_id           uuid REFERENCES crm_activity(crm_activity_id) ON DELETE SET NULL,
    env_id                    text NOT NULL,
    business_id               uuid NOT NULL,
    activity_type             text NOT NULL,
    crm_contact_id            uuid REFERENCES crm_contact(crm_contact_id) ON DELETE SET NULL,
    crm_account_id            uuid REFERENCES crm_account(crm_account_id) ON DELETE SET NULL,
    event_id                  uuid REFERENCES nv_training_event(id) ON DELETE SET NULL,
    campaign_id               uuid REFERENCES nv_campaign(id) ON DELETE SET NULL,
    owner                     text,
    activity_date             timestamptz NOT NULL DEFAULT now(),
    channel                   text,
    subject                   text,
    message_summary           text,
    outcome                   text,
    next_step                 text,
    due_date                  date,
    status                    text NOT NULL DEFAULT 'open',
    created_at                timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS nv_event_registration (
    id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    env_id                    text NOT NULL,
    business_id               uuid NOT NULL,
    event_id                  uuid NOT NULL REFERENCES nv_training_event(id) ON DELETE CASCADE,
    crm_contact_id            uuid NOT NULL REFERENCES crm_contact(crm_contact_id) ON DELETE CASCADE,
    registration_date         timestamptz NOT NULL DEFAULT now(),
    ticket_type               text,
    price_paid                numeric(18,2),
    payment_status            text NOT NULL DEFAULT 'paid',
    attended_flag             boolean NOT NULL DEFAULT false,
    checked_in_time           timestamptz,
    source_channel            text,
    referral_source           text,
    follow_up_status          text,
    feedback_score            int,
    feedback_notes            text,
    walk_in_flag              boolean NOT NULL DEFAULT false,
    created_at                timestamptz NOT NULL DEFAULT now(),
    updated_at                timestamptz NOT NULL DEFAULT now(),
    UNIQUE (event_id, crm_contact_id)
);

CREATE TABLE IF NOT EXISTS nv_task (
    id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    env_id                    text NOT NULL,
    business_id               uuid NOT NULL,
    task_name                 text NOT NULL,
    related_entity_type       text,
    related_entity_id         text,
    assigned_to               text,
    priority                  text NOT NULL DEFAULT 'medium',
    due_date                  date,
    status                    text NOT NULL DEFAULT 'open',
    mobile_quick_action_flag  boolean NOT NULL DEFAULT false,
    notes                     text,
    created_at                timestamptz NOT NULL DEFAULT now(),
    updated_at                timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS nv_event_feedback (
    id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    env_id                    text NOT NULL,
    business_id               uuid NOT NULL,
    event_id                  uuid NOT NULL REFERENCES nv_training_event(id) ON DELETE CASCADE,
    crm_contact_id            uuid NOT NULL REFERENCES crm_contact(crm_contact_id) ON DELETE CASCADE,
    rating                    int,
    what_they_found_useful    text,
    what_was_confusing        text,
    would_attend_again        boolean,
    would_bring_friend        boolean,
    testimonial_permission    boolean NOT NULL DEFAULT false,
    testimonial_text          text,
    created_at                timestamptz NOT NULL DEFAULT now(),
    updated_at                timestamptz NOT NULL DEFAULT now(),
    UNIQUE (event_id, crm_contact_id)
);

CREATE INDEX IF NOT EXISTS idx_nv_contact_profile_env
    ON nv_contact_profile (env_id, business_id, status, follow_up_priority);
CREATE INDEX IF NOT EXISTS idx_nv_org_profile_env
    ON nv_organization_profile (env_id, business_id, organization_type, partner_status);
CREATE INDEX IF NOT EXISTS idx_nv_venue_env
    ON nv_venue (env_id, business_id, venue_status, city);
CREATE INDEX IF NOT EXISTS idx_nv_event_env_date
    ON nv_training_event (env_id, business_id, event_date, event_status);
CREATE INDEX IF NOT EXISTS idx_nv_campaign_env
    ON nv_campaign (env_id, business_id, channel, status);
CREATE INDEX IF NOT EXISTS idx_nv_activity_env
    ON nv_training_outreach_activity (env_id, business_id, activity_date DESC);
CREATE INDEX IF NOT EXISTS idx_nv_registration_event
    ON nv_event_registration (event_id, attended_flag, registration_date);
CREATE INDEX IF NOT EXISTS idx_nv_registration_contact
    ON nv_event_registration (crm_contact_id, registration_date DESC);
CREATE INDEX IF NOT EXISTS idx_nv_task_env
    ON nv_task (env_id, business_id, status, due_date);
CREATE INDEX IF NOT EXISTS idx_nv_feedback_event
    ON nv_event_feedback (event_id, rating);
