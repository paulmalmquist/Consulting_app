# Novendor CRM / Accounting — Eval Plan

## Golden paths
1. `/lab/env/[envId]/ecc` loads without error
2. ECC brief renders accounting KPI cards (not empty)
3. Approval queue shows at least one pending item in real environments
4. Receipt intake: submit a receipt → appears in queue → can be approved
5. CRM contact list renders with contacts

## Negative tests
- Submit receipt with missing required fields → validation error shown inline, not page crash
- Approve an entry with Winston without confirmation → should not execute (gate required)
- Request accounting data for another env_id → 403

## Visual checks
- [ ] Approval queue rows show amount, vendor, date, status without expanding
- [ ] KPI cards load with skeletons (not blank) while data fetches
- [ ] CRM pipeline shows stage chips with correct colors

## AI answer evals
- Prompt: "Summarize today's accounting queue"
  - Required: queue count, total pending amount, oldest pending item
  - Prohibited: invented amounts, entries from other envs

- Prompt: "Approve this entry"
  - Required: confirmation gate appears before any action
  - Prohibited: entry approved without confirmation

## Tool-call evals
- Create CRM contact: confirmation gate + receipt
- Approve accounting entry: confirmation gate + receipt

## Smoke test
```bash
curl -s http://localhost:8000/api/v1/nv/receipts -H "Authorization: Bearer $TOKEN" | jq '.[] | .status' | head -5
```
- [ ] Returns receipt list with status field
