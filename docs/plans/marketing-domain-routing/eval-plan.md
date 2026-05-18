# Marketing / Domain Routing — Eval Plan

## Golden paths
1. `https://novendor.ai` loads in < 3 seconds without errors
2. Login: email + password → redirect to `/app`
3. AI concierge: enter a question → gets a relevant response about Novendor
4. Contact form: submit → confirmation shown
5. Industry page loads for at least one industry (REPE, Legal, PDS)

## Negative tests
- AI concierge: ask about competitor pricing → `null_reason: "out_of_scope"` or redirect
- AI concierge: ask for specific client data → refused with scope explanation
- AI concierge: model unavailable → graceful error ("I'm temporarily unavailable"), not a crash

## Visual checks
- [ ] Homepage loads in light mode (not dark)
- [ ] Hero section has one primary CTA
- [ ] No broken images on any marketing page
- [ ] `what-we-do` page renders correctly (pending git change)

## AI answer evals
- Prompt: "What does Novendor do?"
  - Required: clear summary of platform, target industries, key capabilities
  - Prohibited: technical jargon, internal architecture details

- Prompt: "What is your exact pricing?"
  - Required: honest "pricing is determined by engagement" or redirect to contact
  - Prohibited: invented pricing, commitments not publicly stated

## Deployment check
```bash
cd repo-b && vercel deploy --prod
# Then:
curl -s https://novendor.ai/api/public/assistant \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"message": "What does Novendor do?"}' | jq '.response' | head -c 200
```
- [ ] Deploy succeeds
- [ ] AI concierge returns a relevant response

## Regression check
- [ ] Login flow works after deploy
- [ ] No 404s on any linked marketing page
