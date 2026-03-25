# DOCUMENT COMPLETION AGENT — MEGA BUILD PROMPT

> **Purpose**: This is a comprehensive build prompt for an AI coding agent to implement the Document Completion Agent feature inside the Winston platform. It contains the full product spec, architecture decisions, data model, API design, frontend pages, background job design, and 3 sprint plans with tickets. Feed this entire document to your coding agent to build the feature end-to-end.

---

## SECTION 1: PRODUCT DEFINITION

### What This Is

**Document Completion Agent** — an off-the-shelf SaaS feature for lenders that automatically collects missing borrower documents, follows up until files are complete, escalates only when necessary, and helps teams close files faster at lower cost.

### Core Business Promise

- Complete files faster
- Reduce manual follow-up work
- Lower cost per file
- Increase funded loan throughput

### V1 Outcome Target

Reduce average document collection time from ~3 days to same-day for a meaningful share of files.

### Core Loop

```
detect missing docs → request from borrower → follow up → adapt → escalate if stuck → complete
```

### What Makes This "Agentic"

This is not just a trigger tool. The system:
- Observes file state
- Decides next best action
- Executes outreach
- Waits for response
- Re-evaluates
- Escalates when stuck
- Closes the loop automatically

### Guardrails

- Never mark complete unless deterministic checks pass
- Never message outside allowed hours
- Never send more than configured message count in window
- Always log reasoning and action
- Do NOT use LLM as the source of truth for file completeness — deterministic logic only

---

## SECTION 2: WHERE THIS LIVES IN WINSTON

### Architecture Context

- **Monorepo**: Winston codebase with `repo-b/` (Next.js frontend), `backend/` (FastAPI), `repo-b/db/schema/` (SQL migrations)
- **Hosting**: Vercel (frontend), Railway (backend), Supabase (Postgres + Storage)
- **Domain**: This feature lives under the **credit** domain surface at `/lab/env/[envId]/credit/doc-completion/`
- **Environment-scoped**: All tables use `env_id` + `business_id` scoping like every other Winston feature
- **Navigation**: Add "Doc Completion" to the credit nav in `DomainWorkspaceShell.tsx`

### Existing Patterns to Follow

All code must follow these established patterns exactly:

**Database migrations**: Numbered SQL files in `repo-b/db/schema/`. Next available: `386_doc_completion.sql`. Tables use uuid PKs via `gen_random_uuid()`, `env_id` + `business_id` foreign keys with CASCADE, `created_at`/`updated_at` timestamps, CHECK constraints for enums, JSONB for flexible metadata.

**Backend routes**: FastAPI `APIRouter` in `backend/app/routes/`. Prefix pattern: `/api/doc-completion/v1`. Context resolution via `env_context.resolve_env_business_context()`. Error handling via `classify_domain_error()` + `domain_error_response()`.

**Backend services**: Stateless functions in `backend/app/services/`. Use `get_cursor()` from `app.db` for SQL operations. Return plain dicts. No ORM — raw SQL with parameterized queries.

**Backend schemas**: Pydantic models in `backend/app/schemas/`. Request models with `*Request` suffix. Response models with `*Out` suffix. Use `Field()` for validation.

**Frontend pages**: All pages are `"use client"` React components. Use `useDomainEnv()` hook for environment context. Use `bosFetch()` from `@/lib/bos-api` for API calls. Tailwind CSS classes using the `bm-*` design token prefix.

**Frontend API functions**: Typed functions in `repo-b/src/lib/bos-api.ts` that call `bosFetch()`.

**Router registration**: Import route module in `backend/app/main.py` and call `app.include_router(doc_completion.router)`.

---

## SECTION 3: DATA MODEL

### Table: `dc_borrower`
Borrower contact info for outreach.

| Column | Type | Notes |
|--------|------|-------|
| borrower_id | uuid PK | gen_random_uuid() |
| env_id | uuid FK | → app.environments(env_id) CASCADE |
| business_id | uuid FK | → business(business_id) CASCADE |
| first_name | text NOT NULL | |
| last_name | text NOT NULL | |
| email | text | nullable |
| mobile | text | nullable |
| preferred_channel | text | CHECK ('sms','email','both'), default 'email' |
| timezone | text | default 'America/New_York' |
| consent_sms | boolean | default false |
| consent_email | boolean | default true |
| metadata_json | jsonb | default '{}' |
| created_by | text | |
| updated_by | text | |
| created_at | timestamptz | default now() |
| updated_at | timestamptz | default now() |

### Table: `dc_loan_file`
Core file tracking per application.

| Column | Type | Notes |
|--------|------|-------|
| loan_file_id | uuid PK | gen_random_uuid() |
| env_id | uuid FK | CASCADE |
| business_id | uuid FK | CASCADE |
| borrower_id | uuid FK | → dc_borrower CASCADE |
| external_application_id | text NOT NULL | UNIQUE(env_id, business_id, external_application_id) |
| loan_type | text | CHECK ('mortgage','auto','personal','heloc','student','commercial','other') |
| loan_stage | text | CHECK ('application','processing','underwriting','closing','funded','servicing') |
| status | text | CHECK ('new','awaiting_initial_outreach','waiting_on_borrower','partial_docs_received','followup_scheduled','escalated','complete','closed_manually') |
| assigned_processor_id | text | nullable |
| upload_token | text | for borrower portal |
| upload_token_expires | timestamptz | |
| followup_count | int | default 0 |
| max_followups | int | default 3 |
| followup_cadence_json | jsonb | default '{"hours": [24, 48, 72]}' |
| allowed_send_start | int | hour (0-23), default 8 |
| allowed_send_end | int | hour (0-23), default 20 |
| webhook_url | text | for outbound events |
| opened_at | timestamptz | default now() |
| completed_at | timestamptz | |
| escalated_at | timestamptz | |
| last_activity_at | timestamptz | default now() |
| last_outreach_at | timestamptz | |
| metadata_json | jsonb | default '{}' |
| source | text | default 'api' |
| created_by | text | |
| updated_by | text | |
| created_at | timestamptz | default now() |
| updated_at | timestamptz | default now() |

### Table: `dc_doc_requirement`
Per-file required documents.

| Column | Type | Notes |
|--------|------|-------|
| requirement_id | uuid PK | |
| loan_file_id | uuid FK | → dc_loan_file CASCADE |
| env_id | uuid FK | CASCADE |
| doc_type | text NOT NULL | e.g. 'government_id', 'pay_stub' |
| display_name | text NOT NULL | human-friendly name |
| is_required | boolean | default true |
| status | text | CHECK ('required','requested','uploaded','rejected','accepted','waived') |
| notes | text | |
| uploaded_at | timestamptz | |
| accepted_at | timestamptz | |
| rejected_at | timestamptz | |
| waived_at | timestamptz | |
| created_at | timestamptz | |
| updated_at | timestamptz | |
| UNIQUE | | (loan_file_id, doc_type) |

### Table: `dc_message_event`
All outreach messages sent.

| Column | Type | Notes |
|--------|------|-------|
| message_event_id | uuid PK | |
| loan_file_id | uuid FK | CASCADE |
| borrower_id | uuid FK | CASCADE |
| env_id | uuid FK | CASCADE |
| channel | text | CHECK ('sms','email') |
| message_type | text | CHECK ('initial_request','followup','escalation_notice','completion_confirm','manual') |
| subject | text | for email |
| content_snapshot | text NOT NULL | message body |
| external_message_id | text | Twilio SID or SendGrid ID |
| sent_at | timestamptz | |
| delivered_at | timestamptz | |
| opened_at | timestamptz | |
| clicked_at | timestamptz | |
| failed_at | timestamptz | |
| failure_reason | text | |
| created_at | timestamptz | |

### Table: `dc_upload_event`
Borrower upload tracking.

| Column | Type | Notes |
|--------|------|-------|
| upload_event_id | uuid PK | |
| loan_file_id | uuid FK | CASCADE |
| requirement_id | uuid FK | → dc_doc_requirement CASCADE |
| env_id | uuid FK | CASCADE |
| filename | text NOT NULL | |
| file_type | text NOT NULL | |
| file_size_bytes | bigint | |
| storage_path | text | Supabase Storage path |
| upload_status | text | CHECK ('pending','stored','rejected','accepted') |
| uploader_ip | text | |
| created_at | timestamptz | |

### Table: `dc_escalation_event`
Escalation tracking.

| Column | Type | Notes |
|--------|------|-------|
| escalation_event_id | uuid PK | |
| loan_file_id | uuid FK | CASCADE |
| env_id | uuid FK | CASCADE |
| reason | text NOT NULL | |
| priority | text | CHECK ('critical','high','medium','low') |
| assigned_to | text | |
| status | text | CHECK ('open','acknowledged','resolved','dismissed') |
| resolution_note | text | |
| triggered_at | timestamptz | |
| resolved_at | timestamptz | |
| metadata_json | jsonb | includes missing_docs list |
| created_at | timestamptz | |

### Table: `dc_audit_log`
Immutable action log.

| Column | Type | Notes |
|--------|------|-------|
| audit_log_id | uuid PK | |
| env_id | uuid FK | CASCADE |
| entity_type | text | CHECK ('loan_file','doc_requirement','message_event','upload_event','escalation_event','borrower') |
| entity_id | uuid NOT NULL | |
| action | text NOT NULL | e.g. 'file.created', 'doc.uploaded', 'outreach.followup' |
| actor_type | text | CHECK ('system','staff','borrower','cron','api') |
| actor_id | text | |
| metadata_json | jsonb | always includes loan_file_id |
| created_at | timestamptz | |

---

## SECTION 4: API DESIGN

### Router Prefix: `/api/doc-completion/v1`

### Authenticated Endpoints (Staff/System)

**POST /applications** — Intake new application
```json
{
  "external_application_id": "APP-12345",
  "borrower": {
    "first_name": "John",
    "last_name": "Smith",
    "email": "john@example.com",
    "mobile": "+15555555555"
  },
  "loan_type": "mortgage",
  "loan_stage": "processing",
  "required_documents": ["government_id", "pay_stub", "bank_statement"],
  "submitted_documents": ["government_id"],
  "assigned_processor_id": "PROC-22",
  "send_initial_outreach": true
}
```
Creates: borrower + loan_file + doc_requirements. Sends initial SMS/email if missing docs detected.

**GET /files** — List files (filterable by status, processor)
Returns: `LoanFileListOut[]` with borrower_name, status, missing count, escalation status.

**GET /files/{file_id}** — File detail
Returns: Full file with nested borrower, requirements, messages, uploads, escalations.

**PATCH /files/{file_id}/status** — Manual status update

**POST /files/{file_id}/outreach** — Trigger manual outreach

**POST /files/{file_id}/docs/{req_id}/accept** — Accept document

**POST /files/{file_id}/docs/{req_id}/reject** — Reject document

**POST /files/{file_id}/docs/{req_id}/waive** — Waive requirement

**POST /files/{file_id}/escalations/{esc_id}/resolve** — Resolve escalation

**GET /dashboard/stats** — KPI aggregates (active, waiting, escalated, completed today, avg time)

**GET /dashboard/escalations** — Escalation queue

**POST /cron/process-followups** — Called by pg_cron (protected by DC_CRON_SECRET)

**POST /cron/process-escalations** — Called by pg_cron (protected by DC_CRON_SECRET)

### Public Endpoints (Borrower Portal, token-authenticated)

**GET /portal/{token}** — Get file info + missing docs for borrower view

**POST /portal/{token}/upload** — Upload a document (multipart/form-data)

### Outbound Webhook Events

Fires POST to configured `webhook_url` on:
- `file.completed` → `{"event": "file.completed", "external_application_id": "...", "completed_at": "..."}`
- `file.escalated` → `{"event": "file.escalated", "external_application_id": "...", "reason": "...", "missing_documents": [...]}`
- `file.status_changed` → `{"event": "file.status_changed", "external_application_id": "...", "status": "..."}`

---

## SECTION 5: MESSAGING INTEGRATION

### Twilio (SMS)
- Environment variables: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`
- Use `twilio` Python SDK
- Store SID in `dc_message_events.external_message_id`

### SendGrid (Email)
- Environment variable: `SENDGRID_API_KEY`, `SENDGRID_FROM_EMAIL`
- Use `sendgrid` Python SDK
- HTML email templates with: missing docs list, upload button link, lender branding

### Message Templates

**Initial SMS**: "Hi {name}, we're missing {count} item(s) to continue your loan file: {doc_list}. Upload them here: {link}"

**Follow-up SMS** (tone escalates):
- Follow-up 1: "Just a friendly reminder..."
- Follow-up 2: "We still need..."
- Follow-up 3: "Urgent reminder — we're still waiting on..."

**Initial Email**: HTML with heading, missing docs list, explanation, upload CTA button, 72h expiry notice.

**Follow-up Email**: Subject escalates from "Reminder" → "Action needed" → "Urgent".

### Consent & Compliance
- Check `consent_sms` before sending SMS
- Check `consent_email` before sending email
- Respect `allowed_send_start` / `allowed_send_end` (borrower timezone)
- Prevent duplicate sends within configured window
- Log all sends to `dc_message_events`

---

## SECTION 6: BACKGROUND JOBS

### Approach: Supabase pg_cron → FastAPI Endpoints

Free — no Redis/Celery required. pg_cron is included with Supabase.

**Follow-up processor** (every 5 minutes):
```sql
SELECT cron.schedule('dc-followups', '*/5 * * * *',
  $$SELECT net.http_post(
    url:='https://<railway-url>/api/doc-completion/v1/cron/process-followups',
    headers:='{"Authorization": "Bearer <DC_CRON_SECRET>"}'::jsonb
  )$$
);
```

**Escalation processor** (every 15 minutes):
```sql
SELECT cron.schedule('dc-escalations', '*/15 * * * *',
  $$SELECT net.http_post(
    url:='https://<railway-url>/api/doc-completion/v1/cron/process-escalations',
    headers:='{"Authorization": "Bearer <DC_CRON_SECRET>"}'::jsonb
  )$$
);
```

### Follow-Up Logic
- Default cadence: [24h, 48h, 72h] — configurable per file via `followup_cadence_json`
- Query files where `status IN ('waiting_on_borrower', 'followup_scheduled', 'partial_docs_received')` AND `followup_count < max_followups` AND enough time has passed since `last_outreach_at`
- Send via both SMS + email
- Increment `followup_count`

### Escalation Logic
- Trigger when `followup_count >= max_followups` AND file still incomplete
- Create `dc_escalation_event` with reason, missing docs, priority
- Update file status to 'escalated'
- Notify assigned processor (email alert)

---

## SECTION 7: BORROWER UPLOAD PORTAL

### URL Pattern
`https://app.novendor.com/upload/{token}` — lives at `repo-b/src/app/upload/[token]/page.tsx`

### Portal Requirements
- No authentication required — token-based access
- Mobile-friendly single page
- Shows: lender name, borrower first name, list of requested documents with status indicators
- Upload button per document type
- Accepts: PDF, JPG, PNG (HEIC if possible)
- Shows upload success confirmation
- Triggers completeness re-check after each upload
- Token expires after 72 hours (configurable)

### Upload Flow
1. Borrower clicks link from SMS/email
2. Page calls `GET /api/doc-completion/v1/portal/{token}` to get file info
3. Borrower selects file and uploads
4. Frontend sends `POST /api/doc-completion/v1/portal/{token}/upload` (multipart)
5. Backend stores file in Supabase Storage, records `dc_upload_event`, updates `dc_doc_requirement` status to 'uploaded'
6. Backend runs completeness check — if all done, marks file complete
7. Page shows updated status

---

## SECTION 8: FRONTEND PAGES

### 8.1 Credit Nav Update
**File**: `repo-b/src/components/domain/DomainWorkspaceShell.tsx`

Add to the credit nav items (line ~48-52):
```typescript
if (domain === "credit") {
  return [
    { href: base, label: "Home" },
    { href: `${base}/cases`, label: "Cases" },
    { href: `${base}/doc-completion`, label: "Doc Completion" },
  ];
}
```

### 8.2 Hub/Dashboard Page
**File**: `repo-b/src/app/lab/env/[envId]/credit/doc-completion/page.tsx`

**Tab 1: Overview**
- KPI strip: Active Files | Waiting on Borrower | Escalated | Completed Today | Avg Completion Time
- File queue table: Application ID, Borrower, Loan Type, Missing Docs, Status, Last Activity, Processor, Escalation
- "New Application" button → opens intake form panel
- Table rows link to file detail

**Tab 2: Escalations**
- Filtered view of escalated files only
- Columns: Application ID, Borrower, Missing Docs, Attempts, Days Open, Assigned To, Actions

### 8.3 File Detail Page
**File**: `repo-b/src/app/lab/env/[envId]/credit/doc-completion/files/[fileId]/page.tsx`

**Tab 1: Overview**
- Borrower info card (name, email, mobile, preferred channel)
- Document checklist — each requirement row showing: doc type, display name, status badge, action buttons (Accept / Reject / Waive)
- File status + manual override controls
- "Send Outreach" button for manual trigger

**Tab 2: Communications**
- Full message timeline — each message showing: channel icon, type, content preview, timestamps (sent, delivered, opened), failure info
- Chronological order

**Tab 3: Audit Log**
- All actions taken on this file
- Each entry: timestamp, action, actor type, actor ID, metadata

### 8.4 Borrower Upload Portal (Public)
**File**: `repo-b/src/app/upload/[token]/page.tsx`

- Clean, mobile-first design
- Lender branding header
- "Hi {first_name}, please upload the following documents:"
- Document list with status indicators (green check = done, yellow = uploaded/pending, red = still needed)
- File upload dropzone per document type
- Success toast on upload
- "All documents received!" message when complete

### 8.5 TypeScript Interfaces + API Functions
**File**: `repo-b/src/lib/bos-api.ts` (append to existing)

Add interfaces: `DcLoanFile`, `DcLoanFileList`, `DcDocRequirement`, `DcMessageEvent`, `DcUploadEvent`, `DcEscalationEvent`, `DcDashboardStats`, `DcPortalFile`, `DcPortalDoc`, `DcAuditLog`

Add functions:
- `listDocCompletionFiles(envId, businessId?, status?)`
- `getDocCompletionFile(envId, fileId, businessId?)`
- `createDocCompletionApplication(envId, payload, businessId?)`
- `getDocCompletionStats(envId, businessId?)`
- `sendDocCompletionOutreach(envId, fileId, businessId?)`
- `acceptDocRequirement(envId, fileId, reqId, businessId?)`
- `rejectDocRequirement(envId, fileId, reqId, businessId?)`
- `waiveDocRequirement(envId, fileId, reqId, businessId?)`
- `resolveDocEscalation(envId, fileId, escId, notes, businessId?)`
- `getDocCompletionPortal(token)` — unauthenticated
- `uploadDocCompletionPortal(token, reqId, file)` — unauthenticated

---

## SECTION 9: FILES TO CREATE

| # | File Path | Type | Description |
|---|-----------|------|-------------|
| 1 | `repo-b/db/schema/386_doc_completion.sql` | Migration | 7 tables with indexes |
| 2 | `backend/app/schemas/doc_completion.py` | Schemas | Pydantic request/response models |
| 3 | `backend/app/services/doc_completion.py` | Service | Core business logic |
| 4 | `backend/app/services/messaging.py` | Service | Twilio SMS + SendGrid email |
| 5 | `backend/app/routes/doc_completion.py` | Routes | All API endpoints |
| 6 | `repo-b/src/app/lab/env/[envId]/credit/doc-completion/page.tsx` | Page | Hub dashboard |
| 7 | `repo-b/src/app/lab/env/[envId]/credit/doc-completion/files/[fileId]/page.tsx` | Page | File detail |
| 8 | `repo-b/src/app/upload/[token]/page.tsx` | Page | Borrower upload portal |

## FILES TO MODIFY

| # | File Path | Change |
|---|-----------|--------|
| 1 | `repo-b/src/components/domain/DomainWorkspaceShell.tsx` | Add "Doc Completion" nav item to credit |
| 2 | `repo-b/src/lib/bos-api.ts` | Add TypeScript interfaces + API functions |
| 3 | `backend/app/main.py` | Import + register doc_completion router |

---

## SECTION 10: SPRINT PLANS

---

### SPRINT 1 — PROVE THE CORE LOOP

**Goal**: Intake a loan file, detect missing documents, send an initial request, and track status. Just prove the core loop works.

**Timeline**: 8 days

**Definition of Done**:
1. Send a loan file via API
2. System detects missing docs
3. System sends borrower message (SMS + email)
4. Borrower uploads document
5. System updates status
6. System marks file complete when ready
7. Everything viewable via API

#### EPIC 1: Project Setup

**Ticket 1.1 — Database Migration**
- Create `386_doc_completion.sql` with all 7 tables
- Apply migration to Supabase
- Verify tables created with correct constraints

**Ticket 1.2 — Backend Scaffolding**
- Create `backend/app/schemas/doc_completion.py`
- Create `backend/app/services/doc_completion.py` (intake + completeness check)
- Create `backend/app/services/messaging.py` (Twilio + SendGrid)
- Create `backend/app/routes/doc_completion.py`
- Register router in `backend/app/main.py`

#### EPIC 2: Loan File Intake

**Ticket 2.1 — POST /applications endpoint**
- Validate payload
- Create borrower
- Create loan file
- Store required + submitted documents
- Generate upload token
- Return success response with upload URL

**Ticket 2.2 — Missing Document Detection**
- Compare required vs submitted docs
- Set document statuses (accepted for submitted, required for missing)
- Calculate missing_doc_count
- If already complete, mark file complete immediately

#### EPIC 3: Communication Engine (V1)

**Ticket 3.1 — Twilio SMS Integration**
- `send_sms()` function using Twilio REST API
- Handle errors gracefully
- Return delivery metadata

**Ticket 3.2 — SendGrid Email Integration**
- `send_email()` function using SendGrid v3 API
- HTML template with missing docs + upload link
- Handle errors gracefully

**Ticket 3.3 — Initial Outreach Trigger**
- After intake + missing doc detection, automatically send:
  - SMS with missing docs list + upload link
  - Email with HTML template + upload CTA button
- Check consent before each channel
- Record all messages in `dc_message_events`

#### EPIC 4: Borrower Upload (Basic V1)

**Ticket 4.1 — Upload Token Generation**
- Generate HMAC-signed token per loan file
- 72-hour expiry
- Verify token on portal access

**Ticket 4.2 — Portal Endpoints**
- `GET /portal/{token}` — return file info + missing docs (public, no auth)
- `POST /portal/{token}/upload` — accept file upload, store to Supabase Storage

#### EPIC 5: Completion Logic

**Ticket 5.1 — Completeness Checker**
- Deterministic: compare required docs vs accepted/waived
- If all satisfied → mark file complete, set `completed_at`
- Run after every upload

**Ticket 5.2 — Status Transitions**
- new → awaiting_initial_outreach → waiting_on_borrower → partial_docs_received → complete
- Update on: intake, outreach sent, upload received, all docs done

#### EPIC 6: Dashboard API (No UI yet)

**Ticket 6.1 — GET /files (list)**
- Paginated, filterable by status + processor
- Includes borrower name, missing count, escalation status

**Ticket 6.2 — GET /files/{file_id} (detail)**
- Full file with nested borrower, requirements, messages, uploads, escalations

**Ticket 6.3 — GET /dashboard/stats**
- Active files, waiting, escalated, completed today, avg completion time

**Do NOT build in Sprint 1**: UI pages, follow-up automation, escalation engine, role-based access, advanced templates.

---

### SPRINT 2 — SELF-OPERATING AGENT

**Goal**: Make the system self-operating — automated follow-ups, intelligent retries, and escalation when stuck. If Sprint 1 = a tool, Sprint 2 = a digital employee.

**Timeline**: 8 days

**Definition of Done**:
1. Files automatically receive follow-ups on schedule
2. System adapts timing + messaging tone
3. Files escalate when stuck (after max follow-ups)
4. No manual intervention required for normal cases
5. Dashboard shows active, escalated, and activity history
6. Metrics are visible

#### EPIC 1: Follow-Up Automation Engine

**Ticket 1.1 — pg_cron Background Jobs**
- Set up pg_cron schedule: `dc-followups` every 5 minutes, `dc-escalations` every 15 minutes
- Both call FastAPI endpoints protected by `DC_CRON_SECRET`
- No Redis/Celery needed — runs free on Supabase

**Ticket 1.2 — Follow-Up Logic Service**
- `process_followups()`: query eligible files, check cadence timing, send messages
- Cadence: configurable per file via `followup_cadence_json` (default [24h, 48h, 72h])
- Stop if file is complete
- Increment `followup_count`

**Ticket 1.3 — Follow-Up Message Templates**
- Tone escalation across attempts:
  - Attempt 1: helpful/friendly
  - Attempt 2: reminder
  - Attempt 3: firmer urgency
- Both SMS and email variants

**Ticket 1.4 — Follow-Up Event Logging**
- Record all follow-ups in `dc_message_events`
- Update `last_outreach_at`, `followup_count`, `last_activity_at`

#### EPIC 2: Escalation Engine

**Ticket 2.1 — Escalation Rules**
- Trigger when: `followup_count >= max_followups` AND file still incomplete
- Configurable thresholds per file

**Ticket 2.2 — Escalation Trigger**
- Create `dc_escalation_event` with reason, missing docs, priority
- Update loan file status to 'escalated', set `escalated_at`

**Ticket 2.3 — Escalation Notification**
- Email alert to assigned processor
- Webhook to LOS if `webhook_url` configured
- Dashboard visibility via GET /dashboard/escalations

#### EPIC 3: Smarter Communication

**Ticket 3.1 — Channel Selection Logic**
- If mobile + consent → SMS
- If email + consent → email
- If both → send both
- Fallback if one channel fails

**Ticket 3.2 — Quiet Hours / Compliance**
- Check borrower timezone
- Respect `allowed_send_start` / `allowed_send_end`
- Queue messages for next allowed window if outside hours

#### EPIC 4: Enhanced Completion

**Ticket 4.1 — Partial Upload Handling**
- Update status to 'partial_docs_received'
- Continue following up for remaining docs only

**Ticket 4.2 — Invalid Upload Handling**
- Staff can reject uploaded doc → status back to 'rejected'
- Trigger re-notification to borrower for that specific doc

#### EPIC 5: Dashboard Enhancements

**Ticket 5.1 — Escalation Queue API**
- GET /dashboard/escalations — list all escalated files with missing docs, attempts, days open

**Ticket 5.2 — File Activity Timeline**
- GET /files/{file_id} includes chronological timeline of all events

**Ticket 5.3 — Basic Metrics API**
- avg completion time, avg follow-ups per file, completion rate, escalation rate

#### EPIC 6: Configuration Layer

**Ticket 6.1 — Per-Lender Workflow Settings**
- Follow-up cadence, escalation thresholds, max attempts
- Stored in `followup_cadence_json`, `max_followups`, `allowed_send_*`

**Do NOT build in Sprint 2**: Full UI polish, AI decision logic, deep LOS integrations, complex permissions, multi-product expansion.

---

### SPRINT 3 — PRODUCTION-READY SaaS

**Goal**: Make the product usable by real lenders in production with minimal friction. Get the first pilot customer live.

**Timeline**: 8 days

**Definition of Done**:
1. Real lender can send data into the system
2. System processes files automatically
3. Updates sent back to their system (webhooks)
4. Can onboard a new lender in <1 hour
5. Data isolated per customer (env_id + business_id)
6. Messaging is compliant and safe
7. Can show ROI metrics

#### EPIC 1: Integration Layer

**Ticket 1.1 — Webhook Ingestion (Production-ready)**
- Add API key authentication to POST /applications
- Validate payload structure
- Handle idempotency (UNIQUE constraint on external_application_id)
- Log inbound requests

**Ticket 1.2 — CSV Import Pipeline (Fallback)**
- Upload endpoint for CSV files of applications
- CSV parser → batch create loan files
- Error reporting for bad rows

**Ticket 1.3 — Outbound Webhook**
- Fire webhooks on: file.completed, file.escalated, file.status_changed
- Retry logic (3 attempts with exponential backoff)
- Store delivery attempts

**Ticket 1.4 — Integration Mapping**
- Map external field names → internal schema
- Configurable per lender via metadata_json

#### EPIC 2: Multi-Tenant Foundation

**Ticket 2.1 — Tenant Isolation**
- All queries already scoped by env_id + business_id (Winston pattern)
- Verify no cross-tenant data leakage in all endpoints

**Ticket 2.2 — API Key Auth**
- Per-lender API keys for external integrations
- Stored hashed, validated in middleware

#### EPIC 3: Compliance & Trust

**Ticket 3.1 — Consent-Aware Messaging**
- Check `consent_sms` before SMS, `consent_email` before email
- Fallback channel if primary blocked
- Log consent decisions in audit

**Ticket 3.2 — Audit Trail Hardening**
- Every action logged immutably in `dc_audit_log`
- No missing events
- Queryable full file history

**Ticket 3.3 — Test Mode / Sandbox**
- Flag accounts as sandbox
- Log messages instead of sending
- Safe testing environment

#### EPIC 4: Frontend Pages

**Ticket 4.1 — Hub Dashboard Page**
- KPI strip + file queue table + "New Application" form
- Two tabs: Overview + Escalations

**Ticket 4.2 — File Detail Page**
- Borrower info + document checklist + action buttons
- Three tabs: Overview + Communications + Audit Log

**Ticket 4.3 — Borrower Upload Portal**
- Public page at `/upload/{token}`
- Mobile-friendly, no auth
- Upload per doc type with success confirmation

**Ticket 4.4 — Credit Nav Update**
- Add "Doc Completion" to DomainWorkspaceShell.tsx credit nav

#### EPIC 5: Metrics & ROI

**Ticket 5.1 — Time-to-Completion Metric**
- Calculate `completed_at - opened_at` per file
- Aggregate per lender

**Ticket 5.2 — Reporting API**
- GET /reports — avg completion time, completion rate, escalation rate, messages sent

#### EPIC 6: Pilot Enablement

**Ticket 6.1 — Manual Override API**
- Mark file complete manually
- Override document status
- Cancel workflow (close_manually)

**Ticket 6.2 — Seed/Demo Data**
- POST /seed endpoint that creates sample loan files with various statuses
- Useful for demos and testing

---

## SECTION 11: USER ROLES

| Role | Permissions |
|------|------------|
| Admin | Configure account, manage users, integration setup, messaging rules, reporting access |
| Manager | View all files, manage escalations, reporting, override statuses |
| Processor | View assigned files, intervene manually, send manual outreach, resolve escalations |
| Borrower | Upload requested docs, view outstanding docs, confirm submission (via portal) |

---

## SECTION 12: SUCCESS METRICS

### Product Metrics
- Average time to file completion
- Average number of follow-ups per file
- % of files completed without human touch
- Escalation rate
- Borrower upload completion rate
- Message response rate

### Business Metrics
- Cost saved per file
- Increase in funded loan throughput
- Processor hours saved
- Reduction in file aging
- Reduction in abandoned applications

### Beta Pilot Success (30 days)
- At least 100 files processed
- At least 40% of incomplete files completed without human intervention
- Average time-to-completion improves by at least 50%
- Processor manual follow-up time drops materially
- At least one ROI case study documented

---

## SECTION 13: WHAT NOT TO BUILD IN V1

- Automated underwriting decisions
- Fraud scoring
- OCR-heavy document extraction
- Voice calling
- Multi-language support beyond English
- Complex workflow builder
- Advanced compliance rules engine
- Deep LOS native integrations for every vendor
- AI as source of truth for file completeness (deterministic only)

---

## SECTION 14: EXISTING CODE ALREADY BUILT

The following files have already been created and should NOT be recreated — build on top of them:

1. **`repo-b/db/schema/386_doc_completion.sql`** — Full migration with all 7 tables, indexes, and constraints
2. **`backend/app/schemas/doc_completion.py`** — All Pydantic request/response models
3. **`backend/app/services/doc_completion.py`** — Complete service layer with: intake, completeness check, document actions, upload processing, outreach, follow-up processor, escalation processor, dashboard stats, portal access, audit log
4. **`backend/app/services/messaging.py`** — Twilio SMS + SendGrid email integration with message templates

### What Still Needs to Be Built

- `backend/app/routes/doc_completion.py` — API route layer
- Register router in `backend/app/main.py`
- `DomainWorkspaceShell.tsx` nav update
- `repo-b/src/lib/bos-api.ts` TypeScript interfaces + API functions
- All 3 frontend pages (hub, file detail, borrower portal)
- pg_cron setup SQL

---

## SECTION 15: BUILD ORDER (FOUNDER SHORTCUT)

1. Routes → `backend/app/routes/doc_completion.py` + register in main.py
2. Nav update → `DomainWorkspaceShell.tsx`
3. TypeScript API functions → `bos-api.ts`
4. Hub dashboard page → `doc-completion/page.tsx`
5. File detail page → `doc-completion/files/[fileId]/page.tsx`
6. Borrower upload portal → `upload/[token]/page.tsx`
7. pg_cron setup SQL
8. Seed/demo data endpoint
9. Test end-to-end

---

*End of mega build prompt.*
