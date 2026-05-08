---
id: crm-add-contact
kind: skill
status: active
trigger:
  - add a contact
  - new contact
  - add [name] to CRM
  - log contact
  - who do I add
---

# Skill: Add Contact

## Purpose
Add a new contact to the CRM, link them to a deal/lead, and set their buyer type and authority level.

## Inputs required
Gather these before inserting. Ask for anything missing:
- `name` (required)
- `title` (required)
- `company` / lead they belong to (required — need the `lead_profile_id`)
- `email` (optional but strongly preferred)
- `linkedin_url` (optional)
- `buyer_type`: one of `economic_buyer`, `champion`, `technical_buyer`, `blocker`, `influencer`
- `authority_level`: one of `decision_maker`, `strong_influence`, `weak_influence`, `gatekeeper`

## Lookup step
Before inserting, search `cro_lead_profile` for the company:
```sql
SELECT id, company_name FROM cro_lead_profile
WHERE env_id = '62cfd59c-a171-4224-ad1e-fffc35bd1ef4'
AND lower(company_name) LIKE lower('%{company}%');
```

If no match, ask Paul whether to create the company first.

## Insert
```sql
INSERT INTO cro_strategic_contact (
  id, env_id, business_id, lead_profile_id,
  name, title, email, linkedin_url,
  buyer_type, authority_level,
  created_at, updated_at
) VALUES (
  gen_random_uuid(),
  '62cfd59c-a171-4224-ad1e-fffc35bd1ef4',
  '225f52ca-cdf4-4af9-a973-d1d310ddcba1',
  '{lead_profile_id}',
  '{name}', '{title}', '{email}', '{linkedin_url}',
  '{buyer_type}', '{authority_level}',
  now(), now()
);
```

## After insert
Confirm back: "Added {name} ({title}) to {company} as {buyer_type}."
Ask: "Do you want to log any outreach or notes for this contact now?"

## Failure
If `lead_profile_id` can't be resolved, return: "Can't add contact — no matching company found. Create the company first or provide the lead ID directly."
