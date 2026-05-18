# Demo Lab — QA Checklist

**Last verified:** Never  
**Verified by:** —

## Manual browser checks
- [ ] `/lab/upload` accepts a PDF and shows ingestion status
- [ ] `/lab/pipeline` shows job queue with status
- [ ] `/lab/chat` returns a RAG-cited response to a question about an uploaded doc
- [ ] `/lab/sql-agent` executes a basic query and returns results
- [ ] `/lab/audit` shows recent AI interactions
- [ ] `/lab/ai-audit` shows AI-specific audit log

## API checks
```bash
# Upload document
curl -s -X POST http://localhost:8000/api/v1/lab/upload \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@test.pdf" | jq .

# Query RAG
curl -s -X POST http://localhost:8000/api/v1/psychrag/query \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query": "What is in this document?", "env_id": "[test-env-id]"}' | jq .
```
- [ ] Upload returns job_id
- [ ] RAG query returns answer with source citations

## Database checks
```sql
-- After table names confirmed
SELECT COUNT(*) FROM lab_documents WHERE env_id = '[test-env-id]';
SELECT COUNT(*) FROM pipeline_jobs WHERE status = 'done';
```
- [ ] RLS enforced on lab tables
- [ ] Embeddings exist for uploaded documents

## Console / log checks
- [ ] No errors on upload page
- [ ] No unhandled rejections on chat page

## Regression checks
- [ ] AI test suite passes: `docs/ai-test-cases/`
- [ ] Other environments unaffected

## Fail-closed checks
- [ ] SQL agent blocked from running DROP/DELETE statements
- [ ] Cross-env document retrieval impossible (RLS check)
- [ ] RAG returns graceful "no relevant documents" when context is empty
