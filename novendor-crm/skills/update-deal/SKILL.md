---
id: crm-update-deal
kind: skill
status: active
trigger:
  - update deal
  - move [company] to [stage]
  - change stage
  - deal update
  - [company] is now [stage]
  - we won [company]
  - we lost [company]
---

# Skill: Update Deal

## Purpose
Move a deal to a new stage and update or create the next action. If won, create an engagement record.

## Valid stages
`target_identified` → `researched` → `contacted` → `engaged` → `qualified` → `proposal` → `negotiation` → `won` / `lost` / `paused`

## Inputs required
- `company` name (to resolve the lead)
- `new_status` (new stage)
- `next_action_text` — what happens next (required unless won/lost)
- `next_action_due_date` — when (required unless won/lost)

## Step 1 — Resolve lead
```sql
SELECT sl.id, lp.company_name
FROM cro_strategic_lead sl
JOIN cro_lead_profile lp ON lp.id = sl.lead_profile_id
WHERE sl.env_id = '62cfd59c-a171-4224-ad1e-fffc35bd1ef4'
AND lower(lp.company_name) LIKE lower('%{company}%');
```

## Step 2 — Update stage
```sql
UPDATE cro_strategic_lead
SET status = '{new_status}', updated_at = now()
WHERE id = '{lead_id}';
```

## Step 3 — Upsert next action
```sql
INSERT INTO cro_next_action (
  id, env_id, business_id, lead_id,
  action_text, due_date, status,
  created_at, updated_at
) VALUES (
  gen_random_uuid(),
  '62cfd59c-a171-4224-ad1e-fffc35bd1ef4',
  '225f52ca-cdf4-4af9-a973-d1d310ddcba1',
  '{lead_id}',
  '{next_action_text}', '{next_action_due_date}', 'open',
  now(), now()
)
ON CONFLICT (lead_id) DO UPDATE
SET action_text = EXCLUDED.action_text,
    due_date = EXCLUDED.due_date,
    status = 'open',
    updated_at = now();
```

## Step 4 — If won
Create engagement:
```sql
INSERT INTO cro_engagement (
  id, env_id, business_id, lead_id,
  status, created_at, updated_at
) VALUES (
  gen_random_uuid(),
  '62cfd59c-a171-4224-ad1e-fffc35bd1ef4',
  '225f52ca-cdf4-4af9-a973-d1d310ddcba1',
  '{lead_id}',
  'active', now(), now()
);
```
Then say: "Deal marked won. Engagement record created. Add scope, timeline, and deliverables next."

## After update
Confirm: "{company} moved to {new_status}. Next action: {next_action_text} by {next_action_due_date}."

## Failure
If lead not found: "No matching deal for '{company}'. Check the name or list open deals first."
