# Winston Sales Intelligence Skill

**Trigger phrases:** "add a lead", "add [company] to CRM", "log a lead", "is [company] in CRM", "find [person] at [company]", "add contact", "CRM lookup", "prospect enrichment", "track outreach", "add to pipeline"

**When NOT to use:** General outreach drafting (use `agents/outreach.md`), proposal creation (use `agents/proposals.md`), pipeline scoreboard reporting (call `crm.pipeline_scoreboard` directly).

---

## Environment Context

The Novendor CRM lives in the `novendor` environment. All MCP tools require `env_id` and `business_id`. These are resolved at runtime from the database — the `env_id` matches the slug `novendor` and the `business_id` is the UUID for the Novendor business entity.

To resolve IDs before any write, call:
```
GET /api/repe/context?env_id=novendor
```
or use `crm.list_accounts` with a known `business_id` to confirm context is live.

---

## Adding a Lead

Use `crm.create_lead` for new prospects. This is the canonical entry point — it creates both the CRM account and the lead profile in one call.

**Required fields:**
- `env_id` — always `"novendor"` for Novendor leads
- `business_id` — Novendor's UUID (resolve from context if unknown)
- `company_name` — the company name

**Key optional fields to populate when known:**
- `contact_name`, `contact_title`, `contact_email`, `contact_linkedin`
- `industry` — use standard SIC-style labels (e.g. "Construction Services", "Real Estate", "Financial Services")
- `ai_maturity` — one of: `none`, `exploring`, `piloting`, `scaling`, `advanced`
- `pain_category` — one of: `manual_processes`, `reporting`, `compliance`, `ai_strategy`, `cost_reduction`
- `lead_source` — one of: `linkedin`, `referral`, `event`, `inbound`, `cold_outreach`, `workshop`
- `company_size` — one of: `1-50`, `51-200`, `201-500`, `501-1000`, `1000+`
- `estimated_budget` — dollar amount as string, e.g. `"15000"`
- `confirm: true` — required to execute the write

**After creating a lead:**
- Optionally call `novendor.contacts.upsert_contact` to attach the primary contact to the lead profile
- Optionally call `crm.create_opportunity` to open a pipeline opportunity linked to the new account
- Optionally call `crm.log_outreach` to record any prior touches (e.g. intro email already sent)

---

## Workflow: Warm Intro Lead (most common case)

When Paul receives a warm intro:

1. **Create the lead** via `crm.create_lead` with `lead_source: "referral"`
2. **Attach the contact** via `novendor.contacts.upsert_contact` with name, title, and any known email/LinkedIn
3. **Create an opportunity** via `crm.create_opportunity` at stage `"identified"` or `"prospect"`
4. **Log the intro email** via `crm.log_outreach` with `channel: "email"` and a brief subject/body summary
5. **Confirm to Paul** with the lead score, qualification tier, and opportunity ID

---

## Workflow: Looking Up a Contact or Account

1. Call `crm.list_accounts` to check if the company already exists
2. If found, call `crm.list_activities` to see prior touchpoints
3. Return the account ID, any existing contacts, and last activity date

---

## Workflow: Pipeline Status Check

Call `crm.pipeline_scoreboard` with the Novendor `business_id` to get:
- Total and weighted pipeline value
- Open deals by stage
- Win rate
- Won revenue to date

---

## Notes

- Always use `confirm: true` on write operations — the MCP tools enforce this.
- The `lead_score` and `qualification_tier` are computed automatically by `cro_leads.create_lead` — do not try to set them manually.
- If a company already exists as a CRM account, skip `crm.create_lead` and go straight to `crm.create_opportunity` or `crm.log_outreach`.
- `pain_category` for AI consulting leads is usually `manual_processes` or `ai_strategy` unless Paul specifies otherwise.
- For companies with a CFO/CIO contact, default `ai_maturity` to `exploring` unless there's evidence otherwise.

---

## Reference: MCP Tool Cheatsheet

| Action | Tool |
|---|---|
| Add a new lead | `crm.create_lead` |
| Add/update a contact | `novendor.contacts.upsert_contact` |
| Open a pipeline opportunity | `crm.create_opportunity` |
| Move opportunity stage | `crm.move_opportunity_stage` |
| Log an email/call/meeting | `crm.log_outreach` |
| Record a reply | `crm.record_reply` |
| List all accounts | `crm.list_accounts` |
| List all leads | `crm.list_leads` |
| Get pipeline scoreboard | `crm.pipeline_scoreboard` |
| List open opportunities | `crm.list_opportunities` |
