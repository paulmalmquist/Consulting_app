---
name: novendor-crm-supabase
description: Manipulate Novendor CRM data (accounts, opportunities, contacts, outreach) by writing SQL through the Supabase MCP, not by driving the UI or computer-use. Use when the user says "add this contact", "update the deal", "fix the CRM record", "log this in Novendor", "add Sarat to Hall Boys", or any phrasing that describes a CRUD change against the Novendor internal environment.
type: workflow
when_not_to_use:
  - The change belongs in a customer-facing client environment (route to that environment's skill instead)
  - The user wants outreach drafting (route to outreach skill) or proposal generation (route to proposals)
  - The user wants high-level lead enrichment via Apollo (route to winston-sales-intelligence)
---

# Novendor CRM via Supabase MCP

Direct SQL is the right tool when the user wants the CRM updated and the change is a simple insert/update/delete. The form-driven UI and the higher-level `crm.*` MCP tools both exist, but the Supabase MCP is faster, leaves an explicit audit trail in the response, and avoids the failure modes of pixel-driven computer use.

## Trigger phrases

- "add [person] to [account]" / "fill out the new contact form for [person]"
- "update the [account/opp/contact] in Novendor"
- "log [thing] in the CRM"
- "fix this CRM record"
- "set [contact] as primary on [opportunity]"
- "delete the duplicate [account/contact]"
- Any direct CRUD against Novendor data when the user has not explicitly asked for the UI

## Hard rules

1. **Use the Supabase MCP only.** Do not drive the form UI with computer-use or browser tools. The user has confirmed this is the preferred path.
2. **Never invent IDs.** Always resolve `tenant_id`, `business_id`, `env_id`, `crm_account_id`, `crm_opportunity_id` with a SELECT before writing.
3. **Look up before writing.** Search by name/email for an existing row before INSERT to avoid duplicates.
4. **Mirror tenant scoping.** Every write must carry `tenant_id` and `business_id` (and `env_id` where the table requires it). Read the column list first; do not guess.
5. **Return the inserted/updated row.** Always end the write with `RETURNING ...` so the response confirms what changed.
6. **Fail closed.** If a required FK can't be resolved, stop and ask the user — do not insert with NULL or a placeholder.

## Fixed identifiers (Novendor internal)

| Key | Value |
| --- | --- |
| Supabase project ref | `ozboonlsplroialdwuxj` |
| Novendor tenant_id | `921f716b-db4e-4cde-89fd-f7745066c8ef` |
| Novendor business_id | `225f52ca-cdf4-4af9-a973-d1d310ddcba1` |
| Novendor env_id (text, used by `cro_*` tables) | `62cfd59c-a171-4224-ad1e-fffc35bd1ef4` |

Re-verify these on first use of a session — schema or seeds may have changed:

```sql
SELECT crm_account_id, business_id, tenant_id, name
FROM crm_account
WHERE business_id = '225f52ca-cdf4-4af9-a973-d1d310ddcba1'
LIMIT 3;
```

## Table catalog (the ones you will touch most)

| Table | Purpose | Required FKs |
| --- | --- | --- |
| `crm_account` | Companies / firms | `tenant_id`, `business_id` |
| `crm_opportunity` | Deals on the pipeline (stage, amount, primary_contact) | `tenant_id`, `business_id`, `crm_account_id` |
| `crm_contact` | People at accounts (name, title, email, phone) | `tenant_id`, `business_id`; usually `crm_account_id` |
| `cro_contact_profile` | Extension row on `crm_contact` (linkedin_url, relationship_strength, decision_role, notes, last_outreach_at) | `crm_contact_id`, `business_id`, `env_id` (text) |
| `crm_pipeline_stage` | Stage definitions for opportunities | lookup only |
| `crm_activity` | Logged activities | `tenant_id`, `business_id` |
| `cro_outreach_log` | Outreach touches | `business_id`, `env_id` |
| `cro_strategic_lead`, `cro_lead_profile` | Pre-account lead intake | `business_id`, `env_id` |

Always run `information_schema.columns` on a table you have not touched recently — column lists drift.

## The "fill out the New Contact form" workflow

The New Contact dialog inside the Hall Boys-style deal view writes to two tables: `crm_contact` (full_name / title / email / phone) and `cro_contact_profile` (LinkedIn / relationship / role / notes). Replicate that with one CTE:

```sql
WITH new_contact AS (
  INSERT INTO crm_contact (
    tenant_id, business_id, crm_account_id,
    first_name, last_name, full_name, email, phone, title, is_active
  ) VALUES (
    '921f716b-db4e-4cde-89fd-f7745066c8ef',
    '225f52ca-cdf4-4af9-a973-d1d310ddcba1',
    :account_id,
    :first_name, :last_name, :full_name,
    :email, :phone, :title,
    true
  )
  RETURNING crm_contact_id, business_id
)
INSERT INTO cro_contact_profile (
  crm_contact_id, env_id, business_id,
  linkedin_url, relationship_strength, decision_role, notes
)
SELECT crm_contact_id,
       '62cfd59c-a171-4224-ad1e-fffc35bd1ef4',
       business_id,
       :linkedin_url, :relationship, :role, :notes
FROM new_contact
RETURNING crm_contact_id, env_id;
```

If the contact should anchor the deal, follow with:

```sql
UPDATE crm_opportunity
SET primary_contact_id = :new_contact_id
WHERE crm_opportunity_id = :opp_id
  AND primary_contact_id IS NULL
RETURNING crm_opportunity_id, primary_contact_id;
```

The `IS NULL` guard is intentional — don't silently overwrite an existing primary contact.

## Worked example: Sarat Vemuri / Hall Boys (2026-04-29)

Source data came from Gmail thread "Introduction to Novendor" + signature block.

Resolved IDs:
- `crm_account_id` = `397d4985-04d8-4c59-801f-84e261a33fd5` (Hall Boys)
- `crm_opportunity_id` = `792972a6-9452-4800-a7cc-efd9642d435b` (Hall Boys - Discovery)

Inserted contact: `28bb400b-b151-462d-a57c-d0b424366cbf` — Sarat Vemuri, CFO & CIO, saratvemuri@hallboys.com, +1 (678) 361-8277. Profile note carried the intro context (James, Legal Director; first call 2026-04-23) and the Alpharetta, GA office address. Set as primary contact on the Discovery opportunity.

## Verification checklist

After any write, run a SELECT that joins the new row back through its parents and paste the result into the response. For a new contact:

```sql
SELECT c.crm_contact_id, c.full_name, c.title, c.email::text, c.phone,
       a.name AS account, o.name AS opportunity, o.primary_contact_id,
       p.notes
FROM crm_contact c
JOIN crm_account a ON a.crm_account_id = c.crm_account_id
LEFT JOIN crm_opportunity o ON o.crm_account_id = a.crm_account_id
LEFT JOIN cro_contact_profile p ON p.crm_contact_id = c.crm_contact_id
WHERE c.crm_contact_id = :new_contact_id;
```

The user wants visible confirmation that the row landed and is wired correctly — never just say "done."

## Common edits

**Move a deal to a new stage** — resolve `crm_pipeline_stage_id` from `crm_pipeline_stage` first, then update `crm_opportunity.crm_pipeline_stage_id` and insert a row into `crm_opportunity_stage_history`.

**Update an account name / domain** — `UPDATE crm_account SET ... WHERE crm_account_id = :id`. Confirm only one row would match before running.

**Mark a contact inactive** — prefer `is_active = false` over DELETE. Permanent deletes are blocked by policy.

**Add a note to an existing contact** — UPDATE `cro_contact_profile.notes`; if no profile row exists, INSERT one.

## Job search integration

Job search leads live in the same pipeline as consulting leads. The only distinction is tags. No separate pipeline, no separate stage set.

### Tag IDs (seeded 2026-05-06)

| key | tag_id | color |
| --- | --- | --- |
| `job-search` | `4a7e99ea-a51b-4ade-88ed-ea3806b14ace` | #6366f1 |
| `consulting` | `5d1814de-7e15-458f-8722-394019858c57` | #0ea5e9 |
| `recruiter` | `9fa72ffc-c459-4f7c-9baa-f50229c1bd8c` | #f59e0b |
| `inbound` | `2c775446-3cd2-4d5c-ae58-cc2f3b6248cb` | #10b981 |
| `outbound` | `98c3eca0-9a7b-4f48-98e6-1235105b0cd6` | #8b5cf6 |

Apply tags via `object_tag`:

```sql
INSERT INTO object_tag (object_id, tag_id)
VALUES (:opportunity_id_or_account_id, :tag_id)
ON CONFLICT DO NOTHING;
```

### Stage semantics for job search opportunities

The pipeline stages map to job search milestones like this:

| CRM stage | Job search meaning |
| --- | --- |
| `identified` | Company/role on radar, not applied |
| `contacted` | Applied or sent cold message |
| `engaged` | Recruiter/hiring manager responded |
| `meeting` | Phone screen or intro call scheduled/done |
| `qualified` | Panel / on-site interview |
| `proposal` | Offer received |
| `closed_won` | Offer accepted |
| `closed_lost` | Rejected, ghosted, or withdrew |

### Account and opportunity naming conventions

- `crm_account.name` = company name (e.g., "Blackstone", "Apollo Global")
- `crm_opportunity.name` = "[Company] - [Role]" (e.g., "Blackstone - VP Technology")
- Set `thesis` to why the role is a fit
- Set `pain` to what problem you solve for them
- Set `winston_angle` to the specific angle for the conversation

### Adding a job search lead (full flow)

```sql
-- 1. Create account (if new)
INSERT INTO crm_account (tenant_id, business_id, name, industry)
VALUES (
  '921f716b-db4e-4cde-89fd-f7745066c8ef',
  '225f52ca-cdf4-4af9-a973-d1d310ddcba1',
  :company_name, :industry
)
ON CONFLICT DO NOTHING
RETURNING crm_account_id;

-- 2. Create opportunity
INSERT INTO crm_opportunity (
  tenant_id, business_id, crm_account_id, crm_pipeline_stage_id,
  name, amount, currency_code, status, thesis, pain, winston_angle
)
SELECT
  '921f716b-db4e-4cde-89fd-f7745066c8ef',
  '225f52ca-cdf4-4af9-a973-d1d310ddcba1',
  :account_id,
  s.crm_pipeline_stage_id,
  :opp_name, 0, 'USD', 'open',
  :thesis, :pain, :angle
FROM crm_pipeline_stage s
WHERE s.key = :stage_key
  AND s.business_id = '225f52ca-cdf4-4af9-a973-d1d310ddcba1'
LIMIT 1
RETURNING crm_opportunity_id;

-- 3. Tag the opportunity
INSERT INTO object_tag (object_id, tag_id)
VALUES (:opportunity_id, '4a7e99ea-a51b-4ade-88ed-ea3806b14ace')  -- job-search
ON CONFLICT DO NOTHING;

-- 4. Tag inbound vs outbound
INSERT INTO object_tag (object_id, tag_id)
VALUES (:opportunity_id, :inbound_or_outbound_tag_id)
ON CONFLICT DO NOTHING;
```

### Adding a recruiter contact

Same flow as the New Contact form. Use `title = 'Recruiter'` and tag the account with `recruiter` (`9fa72ffc-c459-4f7c-9baa-f50229c1bd8c`).

---

## Gmail scan → CRM write workflow

Use this when the user says "scan my Gmail for leads", "what recruiter emails came in this week", or "add this email signal to the CRM".

### Trigger phrases

- "scan Gmail for job search leads"
- "scan Gmail for inbound consulting leads"
- "what recruiter outreach did I get this week"
- "add this email signal to the CRM"
- "surface new leads from Gmail"

### Step-by-step

**Step 1 — Search Gmail** using the Gmail MCP (`mcp__5dd36e0f-*__search_threads`).

For job search / recruiter signals:
```
query: "subject:(opportunity OR role OR position OR hiring OR recruiter OR talent) newer_than:7d -in:sent -in:draft"
```

For inbound consulting leads:
```
query: "to:info@novendor.ai newer_than:14d -in:sent -in:draft"
```

**Step 2 — Parse and surface.** For each thread, extract:
- Sender name + email
- Company (from signature or email domain)
- Role or project mentioned
- Signal type: `recruiter_outreach` | `inbound_inquiry` | `follow_up`
- Suggested stage: `contacted` (if they reached out to you) or `identified` (if you're just flagging it)

Present a clean list to the user — do not write to the DB yet.

**Step 3 — User approves.** User says "add 1, 3, and 5" or "add all of them". Only write what's explicitly approved.

**Step 4 — Write to CRM.** For each approved signal:
1. Check for existing `crm_account` by company name/domain — avoid duplicates
2. Check for existing `crm_contact` by email — avoid duplicates
3. INSERT account (if new) → INSERT opportunity → INSERT contact (if new) → INSERT `crm_activity` with `activity_type = 'email_inbound'` and the thread snippet in `payload_json`
4. Tag the opportunity (`job-search` or `consulting`, plus `inbound` or `recruiter`)
5. RETURNING confirmation for every write

**Step 5 — Confirm.** Show a summary table: company | contact | stage | tags | opportunity name. Never just say "done."

### Activity log pattern for email signals

```sql
INSERT INTO crm_activity (
  tenant_id, business_id,
  crm_account_id, crm_contact_id, crm_opportunity_id,
  activity_type, subject, activity_at,
  direction, outcome, payload_json
) VALUES (
  '921f716b-db4e-4cde-89fd-f7745066c8ef',
  '225f52ca-cdf4-4af9-a973-d1d310ddcba1',
  :account_id, :contact_id, :opp_id,
  'email_inbound',
  :email_subject,
  :email_received_at,
  'inbound', 'signal',
  jsonb_build_object(
    'source', 'gmail',
    'thread_id', :gmail_thread_id,
    'from', :sender_email,
    'snippet', :snippet
  )
)
RETURNING crm_activity_id;
```

---

## What this skill does not do

- Computer use, browser automation, or form filling — never. The user has chosen Supabase as the interface.
- Schema changes / migrations — route to `agents/data.md`.
- Lead enrichment from external sources (Apollo, LinkedIn) — route to `winston-sales-intelligence`.
- Deletes that remove audit trail — discuss with the user first; default to soft-delete via `is_active`.
- Sending, archiving, or labeling email — the Gmail MCP is read-only in this context.
