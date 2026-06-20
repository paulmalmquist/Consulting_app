# History Rhymes — QA Checklist

**Last verified:** Never  
**Verified by:** —

## Cockpit checks (telemetry refactor, PR 2+)
- [ ] `/lab/env/[envId]/historyrhymes` opens to the cockpit — regime, confidence, freshness, timestamps above the fold; never blank, never markdown-first
- [ ] `/historyrhymes/routine` renders the same cockpit (compatibility alias)
- [ ] All four HR routes (`/historyrhymes`, `/routine`, `/morning-book`, `/planning`) show the HR shell with no duplicate/nested lab chrome
- [ ] With the backend down, every zone shows a fail-closed state with a concrete reason — no blank cards
- [ ] Empty analog list shows the backend degraded_reason verbatim + "The system refuses to force a rhyme."
- [ ] Placeholder scenarios (0.25/0.50/0.25) render as pending, not as probability bars
- [ ] Stream health chip shows the active mode; `not_configured` when HR_STREAM_MODE is off
- [ ] Signal tiles label their source (weekly brief vs stream · mode)

## Manual browser checks (legacy — still valid via the /routine alias)
- [ ] `/lab/env/[envId]/historyrhymes/routine` shows today's decision (not empty)
- [ ] Decision shows regime call, signal, and rationale
- [ ] Portfolio view shows positions
- [ ] Markets execution view is accessible

## API checks
```bash
# Today's decision
curl -s http://localhost:8000/api/v1/rhymes/decision/today -H "Authorization: Bearer $TOKEN" | jq .

# Trade ledger
curl -s http://localhost:8000/api/v1/trades -H "Authorization: Bearer $TOKEN" | jq .
```
- [ ] Decision endpoint returns regime and signal
- [ ] Trade ledger returns position list

## Script checks
```bash
cd /path/to/repo && python scripts/hr_daily_decision.py --dry-run
```
- [ ] Script completes without errors
- [ ] Output includes regime label and position recommendations

## Database checks
```sql
-- After table names confirmed
SELECT * FROM hr_decisions ORDER BY created_at DESC LIMIT 5;
SELECT * FROM hr_positions WHERE is_open = true;
```
- [ ] Latest decision exists for today or recent date
- [ ] RLS enforced on trading tables

## Console / log checks
- [ ] No errors on trading routine page load
- [ ] No unhandled rejections

## Regression checks
- [ ] Other lab environments unaffected by trading changes

## Fail-closed checks
- [ ] Decision API returns last known decision if today's is not yet generated
- [ ] Portfolio view shows empty state gracefully if no positions open
