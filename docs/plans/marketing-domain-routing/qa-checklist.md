# Marketing / Domain Routing — QA Checklist

**Last verified:** Never  
**Verified by:** —

## Manual browser checks
- [ ] `https://novendor.ai` loads correctly
- [ ] Homepage renders without errors
- [ ] Login flow: visit /login → enter credentials → redirect to /app
- [ ] AI concierge responds to a test question
- [ ] Contact form submits and confirms receipt
- [ ] All industry pages load without 500 errors
- [ ] `what-we-do` page renders correctly (pending change)

## API checks
```bash
# Public assistant (AI concierge)
curl -s -X POST https://novendor.ai/api/public/assistant \
  -H "Content-Type: application/json" \
  -d '{"message": "What does Novendor do?"}' | jq .

# Lead capture
curl -s -X POST https://novendor.ai/api/public/onboarding-lead \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com", "company": "Test Co"}' | jq .
```
- [ ] AI concierge returns a helpful response
- [ ] Lead capture returns 200 and writes to CRM

## Domain checks
- [ ] `novendor.ai` resolves correctly (not `paulmalmquist.com`)
- [ ] HTTPS cert valid
- [ ] No www redirect issues

## Console / log checks
- [ ] No errors on homepage load
- [ ] No mixed content warnings

## Regression checks
- [ ] Login flow unaffected by marketing changes
- [ ] AI concierge not broken by gateway changes

## Fail-closed checks
- [ ] AI concierge returns graceful error if model unavailable
- [ ] Lead capture form shows error if submit fails (not silent failure)
