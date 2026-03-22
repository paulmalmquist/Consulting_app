---
id: winston-sales-intelligence-prompt
kind: prompt
status: active
source_of_truth: true
topic: sales-intelligence
owners:
  - docs
  - cross-repo
intent_tags:
  - ops
  - outreach
  - crm
triggers:
  - prospect lookup
  - is [company] in winston
  - add to CRM
  - find contact
  - look up [person]
  - add prospect
  - track outreach
  - log outreach
  - sales intelligence
  - who have we contacted
  - what's the status on [company]
entrypoint: false
handoff_to:
  - winston-sales-intelligence
  - novendor-outreach
  - novendor-operations
when_to_use: "Reference document loaded by skills/winston-sales-intelligence/SKILL.md. Contains canonical SQL templates, table schemas, engagement stage definitions, and operator guardrails."
when_not_to_use: "Do not use as a primary entrypoint — route through skills/winston-sales-intelligence/SKILL.md instead."
notes:
  - Demoted to reference on 2026-03-19 — execution owned by skills/winston-sales-intelligence/SKILL.md
surface_paths:
  - docs/sales-signals/
  - docs/
---

# Winston — Sales Intelligence

Winston's Supabase database is the CRM. Web research is the enrichment source. No external CRM tools required.

---

## Core Tables

| Table | Purpose |
|---|---|
| `nv_accounts` | One row per target company. Owns the engagement stage, pain summary, and primary contact. |
| `nv_account_contacts` | One row per person at a company. Tracks champion and decision-maker flags. |
| `nv_pain_points` | Specific pain points per account, with severity and affected systems. |
| `cro_lead_profile` | Lead scoring: AI maturity, pain category, lead score, ERP stack, budget estimate. |
| `cro_strategic_lead` | Composite priority scores across AI pressure, reporting complexity, vendor fragmentation. |
| `cro_strategic_contact` | Key contacts with buyer type and authority level. |
| `cro_trigger_signal` | Specific events that triggered outreach (funding, hire, fund close, etc.). |
| `cro_outreach_log` | Every outreach touch — channel, subject, direction, reply, meeting booked. |

---

## Engagement Stages (`nv_accounts.engagement_stage`)

```
identified → researched → contacted → replied → meeting_scheduled → proposal → closed_won → closed_lost
```

---

## Workflow

### 1. Check if a company is already in Winston

```sql
SELECT account_id, company_name, engagement_stage, status, pain_summary,
       primary_contact_name, primary_contact_email, primary_contact_role
FROM nv_accounts
WHERE lower(company_name) ILIKE lower('%[company name]%');
```

If found → show the record and current stage. Ask if they want to update it or take an action.
If not found → proceed to research.

---

### 2. Research the prospect (web)

Run 2–3 targeted searches:
- `[Company] [CEO/CFO/COO] leadership team`
- `[Company] news funding OR "new fund" OR hiring 2025 2026`
- `[Company] site:linkedin.com` or `/team` page

Capture:
- Company HQ, employee count, industry/sub-industry
- Primary contact: name, title, email (verified or inferred)
- Champion (internal advocate, if known)
- Pain summary: what specific operational problem do they have
- Current systems: what ERP, PM, LP portal, or reporting tools they use
- Trigger: what specific event or signal prompted this

---

### 3. Add the account to Winston

```sql
INSERT INTO nv_accounts (
  account_id, env_id, business_id,
  company_name, industry, sub_industry,
  employee_count, headquarters, website_url,
  primary_contact_name, primary_contact_email, primary_contact_role,
  engagement_stage, pain_summary,
  vendor_count, system_count, status,
  notes, metadata_json, created_by, updated_by
) VALUES (
  gen_random_uuid(), '[env_id]', '[business_id]',
  '[Company Name]', '[industry]', '[sub_industry]',
  [employee_count], '[City, State]', '[website]',
  '[Contact Name]', '[email or null]', '[Title]',
  'researched', '[one sentence pain summary]',
  [vendor_count], [system_count], 'active',
  '[signal/source note]', '{}', 'winston', 'winston'
);
```

Then add the contact:

```sql
INSERT INTO nv_account_contacts (
  contact_id, account_id, env_id, business_id,
  full_name, email, role, department,
  is_champion, is_decision_maker, notes
) VALUES (
  gen_random_uuid(), '[account_id]', '[env_id]', '[business_id]',
  '[Full Name]', '[email or null]', '[Title]', '[Finance/Ops/etc]',
  false, true, '[how we found them, email confidence]'
);
```

Then log pain points found:

```sql
INSERT INTO nv_pain_points (
  pain_point_id, account_id, env_id, business_id,
  category, title, description, severity, affected_systems, source
) VALUES (
  gen_random_uuid(), '[account_id]', '[env_id]', '[business_id]',
  '[LP Reporting / Waterfall / Pipeline / Ops]',
  '[short pain title]', '[detail]',
  '[high / medium / low]',
  ARRAY['Excel', 'Juniper Square'],
  '[web research / sales signal scan]'
);
```

---

### 4. Log the trigger signal

```sql
INSERT INTO cro_trigger_signal (
  id, env_id, business_id, lead_profile_id,
  trigger_type, source_url, summary, detected_at
) VALUES (
  gen_random_uuid(), '[env_id]', '[business_id]', '[lead_profile_id]',
  '[new_fund / funding / hiring / competitor_switch / ilpa_compliance]',
  '[source URL]',
  '[one sentence: what happened and why it's relevant]',
  now()
);
```

Trigger types: `new_fund`, `funding`, `hiring_signal`, `competitor_switch`, `ilpa_compliance`, `operational_scaling`, `content_signal`, `inbound`

---

### 5. Log outreach when a draft is queued or sent

```sql
INSERT INTO cro_outreach_log (
  id, env_id, business_id, crm_account_id, crm_contact_id,
  channel, direction, subject, body_preview,
  sent_at, meeting_booked, bounce, sent_by
) VALUES (
  gen_random_uuid(), '[env_id]', '[business_id]', '[crm_account_id]', '[crm_contact_id]',
  '[email / linkedin]', 'outbound',
  '[subject line]', '[first 200 chars of body]',
  now(), false, false, 'paul'
);
```

Update `nv_accounts.engagement_stage` to `contacted` after logging.

---

### 6. Update status after a reply or meeting

```sql
UPDATE nv_accounts
SET engagement_stage = 'replied',  -- or 'meeting_scheduled'
    notes = notes || ' | [date]: [brief note on what happened]',
    updated_by = 'winston',
    updated_at = now()
WHERE account_id = '[account_id]';

UPDATE cro_outreach_log
SET replied_at = now(),
    reply_sentiment = '[positive / neutral / negative / not_interested]',
    meeting_booked = [true/false]
WHERE id = '[outreach_log_id]';
```

---

## Lookup Queries

**Who are our active prospects?**
```sql
SELECT company_name, engagement_stage, primary_contact_name,
       primary_contact_role, pain_summary, created_at
FROM nv_accounts
WHERE status = 'active'
ORDER BY engagement_stage, created_at DESC;
```

**What's the status on a specific company?**
```sql
SELECT a.company_name, a.engagement_stage, a.pain_summary,
       c.full_name, c.email, c.role,
       o.channel, o.subject, o.sent_at, o.replied_at, o.meeting_booked
FROM nv_accounts a
LEFT JOIN nv_account_contacts c ON c.account_id = a.account_id
LEFT JOIN cro_outreach_log o ON o.crm_account_id = a.account_id::uuid
WHERE lower(a.company_name) ILIKE lower('%[company]%')
ORDER BY o.sent_at DESC NULLS LAST;
```

**Which prospects have open signals but haven't been contacted?**
```sql
SELECT a.company_name, a.engagement_stage, t.trigger_type, t.summary, t.detected_at
FROM nv_accounts a
JOIN cro_lead_profile lp ON lp.crm_account_id = a.account_id::uuid
JOIN cro_trigger_signal t ON t.lead_profile_id = lp.id
WHERE a.engagement_stage IN ('identified', 'researched')
ORDER BY t.detected_at DESC;
```

---

## env_id and business_id

These are required for every insert. Resolve them from the session context or query:

```sql
-- Novendor consulting environment
SELECT id AS env_id FROM tenant WHERE name ILIKE '%novendor%' LIMIT 1;
SELECT id AS business_id FROM business WHERE name ILIKE '%novendor%' LIMIT 1;
```

If no matching rows, use the known values from the session bootstrap or ask Paul to confirm.

---

## Guardrails

- Never fabricate a contact. If web research doesn't confirm the person exists, write `email = null` and note confidence in the `notes` field.
- Always INSERT the account first, then contacts, then pain points. Foreign key order matters.
- `engagement_stage` must be updated every time an action is taken — this is the pipeline.
- Do not use `crm_account` / `crm_contact` as the primary CRM tables for Novendor outreach — those are for Winston product demo data. The `nv_*` and `cro_*` tables are the real Novendor CRM.
- When logging outreach, set `sent_at = now()` even for drafted emails — update with the real sent time when confirmed.
