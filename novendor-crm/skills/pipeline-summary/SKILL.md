---
id: crm-pipeline-summary
kind: skill
status: active
trigger:
  - show pipeline
  - pipeline summary
  - what's in the pipeline
  - where are my deals
  - deal status
  - what should I work on today
---

# Skill: Pipeline Summary

## Purpose
Give Paul a fast, opinionated read on the pipeline — what needs action today, what's stalled, what's moving.

## Query
```sql
SELECT
  lp.company_name,
  sl.status,
  sl.composite_priority_score,
  sl.last_touch_at,
  sl.last_touch_channel,
  na.action_text AS next_action,
  na.due_date AS next_action_due
FROM cro_strategic_lead sl
JOIN cro_lead_profile lp ON lp.id = sl.lead_profile_id
LEFT JOIN cro_next_action na ON na.lead_id = sl.id
WHERE sl.env_id = '62cfd59c-a171-4224-ad1e-fffc35bd1ef4'
AND sl.status NOT IN ('won', 'lost')
ORDER BY sl.composite_priority_score DESC, na.due_date ASC;
```

## Output format
Group by urgency:

**🔴 Action needed today** — next_action_due is today or overdue
**🟡 This week** — next_action_due within 7 days
**⚪ Monitoring** — no due date or due date > 7 days out
**⚠️ Stalled** — last_touch_at is more than 14 days ago with no next action

For each deal show:
- Company | Stage | Score | Last touch | Next action + due date

## After summary
Always end with: "Which deal do you want to move on?"

## Open tasks
Also pull overdue/urgent tasks:
```sql
SELECT task_name, due_date, priority, notes
FROM nv_task
WHERE env_id = '62cfd59c-a171-4224-ad1e-fffc35bd1ef4'
AND status = 'open'
AND (due_date <= current_date + 3 OR mobile_quick_action_flag = true)
ORDER BY due_date ASC;
```
Surface these at the top of the summary under **"Tasks needing action"**.
