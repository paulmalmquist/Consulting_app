---
id: crm-log-outreach
kind: skill
status: active
trigger:
  - log outreach
  - I sent a message
  - I emailed [name]
  - I DM'd [name]
  - I called [name]
  - they replied
  - got a response
  - log this message
---

# Skill: Log Outreach

## Purpose
Record every outbound message or inbound reply in `cro_outreach_log`. This is the conversion tracking layer.

## Inputs required
- `channel`: `linkedin`, `email`, `call`, `meeting`, `referral`
- `direction`: `outbound` or `inbound`
- `subject` (optional but preferred)
- `body_preview` (optional — first ~200 chars of message)
- `sent_at` (default: now())
- `crm_account_id` — the lead/account this belongs to
- `crm_contact_id` — the specific contact (optional)
- `replied_at` — if they responded (optional)
- `reply_sentiment`: `positive`, `neutral`, `negative`, `not_interested` (optional)
- `meeting_booked`: true/false (default: false)
- `sent_by`: default `paul`

## Lookup step
Resolve the account:
```sql
SELECT sl.id as lead_id, lp.id as lead_profile_id, lp.company_name
FROM cro_strategic_lead sl
JOIN cro_lead_profile lp ON lp.id = sl.lead_profile_id
WHERE sl.env_id = '62cfd59c-a171-4224-ad1e-fffc35bd1ef4'
AND lower(lp.company_name) LIKE lower('%{company}%');
```

## Insert
```sql
INSERT INTO cro_outreach_log (
  id, env_id, business_id,
  crm_account_id, crm_contact_id,
  channel, direction, subject, body_preview,
  sent_at, replied_at, reply_sentiment,
  meeting_booked, sent_by,
  created_at
) VALUES (
  gen_random_uuid(),
  '62cfd59c-a171-4224-ad1e-fffc35bd1ef4',
  '225f52ca-cdf4-4af9-a973-d1d310ddcba1',
  '{crm_account_id}', '{crm_contact_id}',
  '{channel}', '{direction}', '{subject}', '{body_preview}',
  '{sent_at}', '{replied_at}', '{reply_sentiment}',
  {meeting_booked}, 'paul',
  now()
);
```

## After insert
1. Confirm: "Logged {direction} {channel} to {company}."
2. Update the lead's `last_touch_at`, `last_touched_by`, `last_touch_channel`:
```sql
UPDATE cro_strategic_lead
SET last_touch_at = now(), last_touched_by = 'paul', last_touch_channel = '{channel}', updated_at = now()
WHERE id = '{lead_id}';
```
3. Ask: "Do you want to update the next action for this deal?"

## Failure
If company can't be resolved: "Couldn't find that account. Check the company name or provide the account ID directly."
