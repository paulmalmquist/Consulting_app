---
id: crm-log-task
kind: skill
status: active
trigger:
  - add a task
  - log a task
  - remind me to
  - I need to
  - put this on my list
  - task for [thing]
---

# Skill: Log Task

## Purpose
Add a task to `nv_task`. Tasks can be freestanding or linked to a deal, contact, or engagement.

## Inputs required
- `task_name` (required)
- `due_date` (required — ask if not provided, default to +7 days if Paul says "soon")
- `priority`: `high`, `medium`, or `low` (default: `medium`)
- `notes` (optional)
- `related_entity_type` (optional): `deal`, `contact`, `engagement`, `onboarding`, `outreach`, `product`, `admin`
- `related_entity_id` (optional): UUID of the linked record
- `mobile_quick_action_flag`: true if this is something Paul needs to act on immediately from his phone

## Insert
```sql
INSERT INTO nv_task (
  id, env_id, business_id,
  task_name, related_entity_type, related_entity_id,
  assigned_to, priority, due_date,
  status, mobile_quick_action_flag, notes,
  created_at, updated_at
) VALUES (
  gen_random_uuid(),
  '62cfd59c-a171-4224-ad1e-fffc35bd1ef4',
  '225f52ca-cdf4-4af9-a973-d1d310ddcba1',
  '{task_name}', '{related_entity_type}', '{related_entity_id}',
  'paul', '{priority}', '{due_date}',
  'open', {mobile_quick_action_flag}, '{notes}',
  now(), now()
);
```

## After insert
Confirm: "Task logged: '{task_name}' due {due_date} [{priority}]."

## Batch insert
If Paul provides multiple tasks at once, insert all in a single statement using multiple VALUES rows.

## Failure
If task_name is empty or ambiguous, ask: "What should this task be called?"
