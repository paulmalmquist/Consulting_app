# Stone PDS — QA Checklist

**Last verified:** Never  
**Verified by:** —

## Manual browser checks
- [ ] `/lab/env/[envId]/pds/utilization` loads with data (not empty)
- [ ] `/lab/env/[envId]/pds/revenue` shows revenue figures
- [ ] `/lab/env/[envId]/pds/executive` loads all KPI cards
- [ ] `/lab/env/[envId]/pds/projects` shows project list
- [ ] AI briefing generates a response at `/lab/env/[envId]/pds/ai-briefing`

## API checks
```bash
curl -s http://localhost:8000/api/v1/pds/utilization -H "Authorization: Bearer $TOKEN" | jq .
curl -s http://localhost:8000/api/v1/pds/revenue -H "Authorization: Bearer $TOKEN" | jq .
```
- [ ] Utilization returns numeric values (not null/empty)
- [ ] Revenue returns period-grouped figures

## Database checks
```sql
-- After table names confirmed
SELECT COUNT(*) FROM pds_projects WHERE env_id = '[test-env-id]';
SELECT COUNT(*) FROM pds_timecards WHERE env_id = '[test-env-id]';
```
- [ ] RLS enforced on PDS tables

## Console / log checks
- [ ] No errors on PDS executive page load
- [ ] No unhandled promise rejections

## Regression checks
- [ ] Other lab environments unaffected
- [ ] Auth flow unaffected

## Fail-closed checks
- [ ] Utilization returns 0%, not an error, when no timecard data exists
- [ ] AI briefing degrades gracefully if model unavailable
