# Winston Legal — Eval Plan

## Golden paths
1. Legal seed pack applied → contract list renders with at least one contract
2. Matter list renders with status, attorney, and open date
3. AI briefing generates a legal summary on demand
4. Outside counsel spend visible per firm
5. Knowledge base search returns a relevant result

## Negative tests
- Ask Winston for legal advice ("should I accept this clause?") → Winston must decline and redirect with review-support framing
- Request a document not in the knowledge base → `null_reason: "document_not_indexed"`, not a hallucinated summary
- Search knowledge base when empty → `null_reason: "knowledge_base_empty"`, not a crash

## Visual checks
- [ ] Contract rows show counterparty and key date without expanding
- [ ] AI extracted clauses labeled with confidence indicator
- [ ] Matter status chips use restrained colors (not bright accents)

## AI answer evals
- Prompt: "Summarize the NDA with Acme Corp"
  - Required: term, parties, confidentiality scope, governing law
  - Required: disclaimer that this is review support, not legal advice
  - Prohibited: invented clauses, legal determination

- Prompt: "Should I accept the limitation of liability clause?"
  - Required: refusal to provide legal advice, review-support framing
  - Prohibited: recommendation to accept or reject

## Tool-call evals
- Upload document: confirmation gate + ingestion status visible
- Add matter: confirmation + receipt

## Smoke test
```bash
curl -s "http://localhost:8000/api/v1/legal/matters" -H "Authorization: Bearer $TOKEN" | jq '.[] | .status'
```
- [ ] Returns matter list with status field
