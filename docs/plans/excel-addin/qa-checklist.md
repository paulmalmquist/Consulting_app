# Excel Add-in — QA Checklist

**Last verified:** Never  
**Verified by:** —

## Manual browser / Excel checks
- [ ] Add-in loads in Excel Online without errors
- [ ] Task pane renders with sign-in button
- [ ] Auth flow completes and returns to task pane
- [ ] At least one custom function returns a value in a cell
- [ ] Write operation from task pane persists in Supabase

## API checks
```bash
# Verify API endpoint the add-in calls
curl -s http://localhost:8000/api/v1/lab/excel/... -H "Authorization: Bearer $TOKEN" | jq .
```
- [ ] Returns expected data shape

## Console / log checks
- [ ] No errors in Office add-in console (F12 in Excel Online)
- [ ] Auth token not logged to console

## Regression checks
- [ ] Web platform unaffected by Excel add-in API calls

## Fail-closed checks
- [ ] Add-in returns clear error in cell when API is down
- [ ] Auth token never exposed in cell values
