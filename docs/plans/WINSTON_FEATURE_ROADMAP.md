# Winston Feature Roadmap
**Updated:** 2026-05-11  
**Owner:** Paul Malmquist  
**Purpose:** Prioritized coding plan for Winston core. Every item ties to a deal, a conversion risk, or a delivery gap.

---

## Prioritization Logic

Score each item on three axes:
- **Revenue impact** — does this help close a deal or retain a client?
- **Demo value** — would a prospect say "I need that" in a 15-minute demo?
- **Effort** — rough estimate in developer-days

Priority = (Revenue + Demo) / Effort

---

## P0 — Ship This Week (Blocks Revenue)

### 1. CRM: `next_action` + `next_action_date` fields on `crm_opportunity`

**Why:** The opportunity table has no next action tracking. Every deal in the pipeline is effectively "stuck" with no due date. This breaks the Command Center and daily execution loop.

**What:** 
- Add `next_action TEXT` and `next_action_date DATE` columns to `crm_opportunity` via migration
- Surface in the pipeline board and deal detail page
- Include in the Command Center "deals needing action today" widget

**Effort:** 1 day (migration + UI)  
**Revenue tie:** Every active deal

---

### 2. Command Center — "Deals Needing Action Today" Widget

**Why:** The home screen needs to answer "what should I do today?" — currently it doesn't. Hall Boys follow-up is already overdue.

**What:**
- Widget showing all open opportunities where `next_action_date <= today` OR `next_action_date IS NULL` and stage >= `contacted`
- Click → deal detail
- Inline "log activity" and "set next action" actions

**Effort:** 1–2 days  
**Revenue tie:** Hall Boys, NCF, all contacted-stage deals

---

### 3. Task surface — Command Center widget + `/tasks` page

**Why:** Personal execution tracking is currently outside the app. Paul is managing his day in his head.

**What:**
- `tasks` table in Supabase (title, status, due_date, category, linked_opportunity_id, linked_account_id)
- Command Center widget: today's tasks with checkbox
- `/app/tasks` full page: list view with filter by status, category, due date
- Categories: `outreach`, `follow-up`, `product`, `research`, `admin`

**Effort:** 2–3 days  
**Revenue tie:** Execution speed across all deals

---

## P1 — Next Sprint (Directly Supports Sales)

### 4. CRM: `winston_angle` field surfaced on pipeline board + deal cards

**Why:** 40+ opportunities have `winston_angle = NULL`. The field exists in the DB but isn't visible on the kanban. Nobody fills it in if it's not visible.

**What:**
- Show `winston_angle` as an editable chip/tag on each deal card in the pipeline board
- Make it inline-editable (click to edit, saves on blur)
- Add to the deal detail page with a dedicated section

**Effort:** 1 day  
**Revenue tie:** All "contacted" stage deals — they need an angle before outreach can be meaningful

---

### 5. Outreach log: LinkedIn + email activity tracking

**Why:** The skill says to log `crm_activity` with `activity_type = 'linkedin_outreach'` but there's no UI to see what's been sent. Outreach history is invisible.

**What:**
- `crm_activity` table already exists — add a view to the deal detail page showing activity timeline
- Quick-log buttons: "LinkedIn DM sent", "Email sent", "Call completed", "Meeting scheduled"
- Outreach summary on each deal card (last touch + type)

**Effort:** 1–2 days  
**Revenue tie:** Outreach tracking for all active pipeline

---

### 6. Deal detail page — full context view

**Why:** Individual deals have no single-page view with all context (company, contacts, notes, outreach history, Winston angle, demo recommendation).

**What:**
- `/app/crm/deals/[id]` page
- Sections: Account overview, Primary contact, Thesis/Pain/Angle, Activity timeline, Notes, Attached insights, Recommended demo
- Edit-in-place on all fields

**Effort:** 2–3 days  
**Revenue tie:** Hall Boys deal is the immediate test case

---

### 7. Pipeline board — stage filter + bulk `next_action` setter

**Why:** 50+ open deals, mostly stuck at "contacted" with no next action. Need a way to triage quickly.

**What:**
- Filter pipeline board by stage, vertical/industry, missing fields
- Bulk select → "Set next action for selected deals" dialog
- Export to CSV for outreach batching

**Effort:** 1–2 days

---

## P2 — This Month (Product Depth)

### 8. Winston angle auto-suggest via Claude

**Why:** 40 deals have no Winston angle. Claude can generate a suggested angle based on `thesis` + `pain` + `industry`. Expose this as a "Generate angle" button on the deal card.

**What:**
- Button on deal card: "Suggest Winston angle"
- Calls `/api/crm/suggest-angle` → Claude prompt with thesis + pain → returns 2–3 angle options
- User picks or edits; saves to `crm_opportunity.winston_angle`

**Effort:** 1 day (API route + UI button)

---

### 9. Contact enrichment — LinkedIn profile pull

**Why:** Most deals have no contact. The CRM has a `linkedin_url` field in `cro_contact_profile` but no way to pull data from it.

**What:**
- Add a "Find contact" flow: enter company name + role → Apollo MCP search → returns candidate contacts → user selects → inserts to CRM
- Wire into the deal detail page as "Find Primary Contact"

**Effort:** 2–3 days  
**Revenue tie:** 30+ deals with no primary contact

---

### 10. Engagement tracker — delivery status

**Why:** Once Hall Boys or another deal closes, there's no delivery tracking in the app. The "Engagements" section from the system design is not built.

**What:**
- `crm_engagement` table: client, type (assessment/build/migration), scope, status, deliverables, timeline, blockers
- Engagements page: card view by status
- Link to opportunity

**Effort:** 3–4 days

---

### 11. Product feedback → backlog loop

**Why:** Every engagement should feed Winston product improvements. There's no structured way to log "this client needed X and we didn't have it."

**What:**
- `product_feedback` table: source (deal/client/internal), type (feature/bug/friction), description, priority, revenue_impact_deal_id
- Product backlog page: list with priority + revenue tie
- Quick-add from deal detail: "Log feature request from this deal"

**Effort:** 2 days

---

## P3 — Roadmap (Next 60 Days)

- Research feed integration: weekly brief → insights → outreach angle generator
- Conversion analytics: first touch → stage → close duration by vertical
- LP report generator: triggered from deal context, generates formatted investor update
- Content tracker: LinkedIn posts, demos, site content — tied to pipeline influence
- Autonomous outreach scheduling: Claude generates and queues outreach drafts on a schedule

---

## Migration Sequence

Run in this order:

1. `ALTER TABLE crm_opportunity ADD COLUMN next_action TEXT, ADD COLUMN next_action_date DATE;`
2. Create `tasks` table (see Task Surface spec)
3. Create `crm_engagement` table
4. Create `product_feedback` table

Each migration follows the standard `NNN_module_description.sql` format in `repo-b/db/schema/`.

---

## Verification Checklist (per feature)

- [ ] SQL migration applied and verified via Supabase MCP
- [ ] API route returns correct shape
- [ ] UI renders without empty-state errors
- [ ] RLS policy covers new table (if added)
- [ ] Feature visible in correct vertical navigation path
- [ ] At least one real record inserted to confirm end-to-end
