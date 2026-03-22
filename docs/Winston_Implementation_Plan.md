# Winston AI Platform — Implementation Task Backlog

**Source:** Architecture Scorecard + Comprehensive Architecture Audit
**Execution:** Claude Code
**Principle:** Observability first — measure before optimizing

---

## Current State

Winston scores **5.0/10 overall**. Strong domain intelligence and a solid PLAN→CONFIRM→EXECUTE loop, but critical gaps in observability (2/10), security (3/10), cost efficiency (3/10), and model diversity (5/10). All weaknesses are in the infrastructure layer — the core AI doesn't need to be rearchitected.

---

## Priority Tier 1: Observability & Measurement

Everything else depends on being able to measure impact. These tasks come first.

### T-1.1: Deploy Langfuse for LLM Tracing

Self-host Langfuse on Railway (Docker image, dedicated Postgres instance). Instrument every FastAPI → OpenAI call via Langfuse Python SDK. Enable prompt management so versions are tracked in Langfuse, not just in code.

**Acceptance criteria:**
- Langfuse running on Railway with persistent storage
- Every LLM call instrumented with: latency, token count, cost, error status, lane classification
- Dashboard showing requests/min, P50/P95 latency, error rate, tokens consumed, cost per lane
- Prompt versions tracked and diffable

---

### T-1.2: Implement OpenAI Prompt Caching

Restructure all prompts so static components (system instructions, tool definitions, few-shot examples) come first and dynamic components (conversation history, user query) come last. OpenAI automatically caches prompts ≥1,024 tokens with matching prefixes — 50% cost reduction and up to 80% latency reduction with zero quality impact.

**Acceptance criteria:**
- All system prompts restructured with static-prefix pattern
- Verify token counts exceed 1,024 threshold
- Langfuse confirms cache hit rates >60% within first week
- Measurable cost reduction visible in dashboard

---

### T-1.3: Build Evaluation Harness

Create a pytest-based evaluation suite with 20–30 seed QA pairs drawn from actual REPE documents. This is the gate for every future change — no prompt edit, model swap, or RAG tweak ships without passing eval.

**Acceptance criteria:**
- Runnable via `pytest tests/eval/`
- Covers: RAG retrieval accuracy (right chunk retrieved?), answer faithfulness (hallucination check?), tool call correctness (right tool selected?)
- Baseline scores recorded in Langfuse
- Integrated into CI — blocks deployment on regression

---

## Priority Tier 2: RAG Pipeline Fixes

The pipeline has the right components in the wrong order and uses an underpowered embedding model. These are code-level changes with immediate quality gains.

### T-2.1: Fix Pipeline Ordering

The current flow applies a score threshold *before* reranking, which prematurely discards documents the cross-encoder might have scored highly. Reorder to:

1. Hybrid search in parallel (BM25 + vector)
2. RRF fusion
3. Metadata boosting
4. Cross-encoder rerank (Cohere)
5. Score threshold
6. MMR deduplication
7. Top-K selection

**Acceptance criteria:**
- Pipeline reordered per spec above
- Eval suite shows retrieval accuracy improvement (before/after comparison)
- No regression on answer quality

---

### T-2.2: Increase Over-Fetch Ratio

Increase initial retrieval from top-5 to top-50–100 candidates before reranking. The cross-encoder can only improve results if it sees enough candidates. Standard guidance: 50–200 candidates narrowed to final 5–20.

**Acceptance criteria:**
- Over-fetch configurable via environment variable (default: 75)
- Reranking latency measured in Langfuse (should add <500ms)
- Retrieval recall improves on eval suite

---

### T-2.3: Add Query Rewriting

Before retrieval, generate 3–5 query variants from each user question using a lightweight LLM call. Retrieve for each variant, union results before reranking. Critical for complex REPE questions that span multiple documents.

**Acceptance criteria:**
- Query rewriter integrated as pre-retrieval step
- Configurable variant count (default: 3)
- Eval suite shows improvement on complex multi-hop questions
- Latency overhead tracked in Langfuse

---

## Priority Tier 3: Security Fundamentals

Winston handles sensitive financial data. Without these, enterprise pilots are a non-starter.

### T-3.1: Row-Level Security on All Tables

Add `tenant_id` column with RLS policies enforced at the database level on every table containing tenant data (documents, embeddings, conversations, tool results, metrics). This is defense-in-depth — even if app code has a filtering bug, the database blocks cross-tenant access.

**Acceptance criteria:**
- Every public-schema table has `tenant_id` column and RLS policy
- Supabase RLS enabled and tested with cross-tenant access attempts (should fail)
- Existing queries still work correctly with RLS active

**Claude Code approach:** Audit all Supabase tables, generate migration scripts, write integration tests that attempt cross-tenant reads and verify they fail.

---

### T-3.2: Prompt Injection Defense (5-Layer Stack)

Implement:
1. **Input validation** — regex + ML classifier for known injection patterns
2. **Structured prompts** — clear delimiters between system instructions and user content
3. **Output filtering** — scan responses for PII leakage and system prompt echoing
4. **Tool call validation** — ensure arguments are within expected ranges and schemas
5. **Behavioral monitoring** — track anomalous tool calls and exfiltration attempts

**Acceptance criteria:**
- Input validation catches OWASP LLM Top 10 test cases
- Output scanner flags PII in responses (SSNs, account numbers, etc.)
- Tool call arguments validated against schema constraints
- All detections logged to Langfuse with alert thresholds

---

### T-3.3: PII Detection Pipeline

Deploy Microsoft Presidio (open-source) as middleware in the FastAPI pipeline. Every request to the LLM passes through PII scanning. Mask or tokenize PII before it reaches the model. NER-based detection achieves 93%+ accuracy on financial documents.

**Acceptance criteria:**
- Presidio integrated as FastAPI middleware
- Detects: SSNs, tax IDs, financial account numbers, investor names in deal contexts, property addresses linked to owners
- PII masked in Langfuse logs
- False positive rate <5% on sample REPE documents

---

### T-3.4: Comprehensive Audit Logging

Log every AI interaction: full prompt (PII-masked), model response, lane used, model used, all tool calls with I/O, RAG retrieval results + relevance scores, token consumption + cost, tenant + user IDs, timestamps. Retention: chat logs 90 days, audit trails 7 years (SEC recordkeeping requirement for investment advisers).

**Acceptance criteria:**
- Structured audit log entries in dedicated database table
- Queryable by tenant, user, time range, lane, tool
- PII redacted from logs
- Retention policies configured

---

### T-3.5: SOC 2 Documentation Kickoff

Document AI controls for SOC 2 readiness: vendor data handling agreements (OpenAI no-training guarantee), prompt injection controls, audit trails, change management with prompt version control, data classification with PII and financial data tagged throughout the pipeline.

**Acceptance criteria:**
- Controls document covering AICPA Trust Service Criteria (Security, Availability, Processing Integrity, Confidentiality, Privacy)
- Gap analysis identifying remaining SOC 2 requirements

---

## Priority Tier 4: Cost Optimization & Model Diversity

Winston runs GPT-4o for everything — burning 3–5x more than necessary.

### T-4.1: Add AI Gateway Layer (LiteLLM or Portkey)

Insert a gateway between FastAPI and model providers. This enables multi-provider routing, automatic fallback, centralized rate limiting, cost tracking, and prompt caching at the gateway level. LiteLLM is open-source and adds ~8ms P95 latency while supporting 100+ providers.

**Acceptance criteria:**
- Gateway deployed between FastAPI and OpenAI
- Anthropic Claude configured as fallback for all lanes
- Automatic failover on OpenAI 5xx errors or timeout
- Failover events logged and alerted

---

### T-4.2: Deploy Model Tiering Across Lanes

Assign appropriate models per lane:

| Lane | Use Case | SLA | Model | Rationale |
|---|---|---|---|---|
| A | Conversational | <1s | GPT-4o-mini | 17x cheaper, fast enough |
| B | Tool-backed | <4s | GPT-4o | Current model, appropriate for orchestration |
| C | Analytical | <8s | o4-mini (low effort) | ~60% cost of GPT-4o, better analytical performance |
| D | Deep reasoning | <20s | o4-mini (med/high) or o3 | Genuinely superior reasoning for financial analysis |

**Acceptance criteria:**
- Each lane routes to its designated model via the gateway
- Eval suite shows no quality regression on A/B, improvement on C/D
- Cost per query tracked per lane in Langfuse
- Expected combined cost reduction: 40–60%

---

### T-4.3: Deploy Redis Semantic Cache

Redis-based semantic cache with tenant-scoped keys, checked before the RAG pipeline. Research shows 61–69% hit rates for typical enterprise query patterns — could reduce API costs by 50–90% for repetitive workloads.

**Acceptance criteria:**
- Redis deployed on Railway
- Cache keyed by `tenant_id` + query embedding similarity (0.95 cosine threshold)
- TTLs configured: 1 hour for market data, 24 hours for fund documents, 7 days for static reference
- Hit rate and latency savings tracked in Langfuse
- Cache bypass option for queries requiring fresh data

---

### T-4.4: Per-Tenant Cost Tracking & Budget Alerts

Implement cost attribution per tenant with configurable budget thresholds.

**Acceptance criteria:**
- Cost tracked per tenant, per lane, per model
- Budget alerts at 50/80/100% of allocation
- Automated model downgrade when thresholds hit (e.g., force Lane B → GPT-4o-mini)
- Cost dashboard accessible per tenant

---

## Priority Tier 5: Enhanced RAG

These require the eval harness from T-1.3 to validate impact.

### T-5.1: Upgrade Embedding Model

Migrate from text-embedding-3-small (62.3 MTEB) to text-embedding-3-large (64.6 MTEB) or Voyage-3-large (65.2 MTEB). For a domain where retrieval precision directly affects financial accuracy, the gap is material. **Requires full corpus re-embedding** — use a dual-index strategy to avoid downtime.

**Acceptance criteria:**
- New embedding model deployed
- Full corpus re-embedded (staged migration with dual-index)
- Eval suite shows retrieval accuracy improvement
- Old index decommissioned after validation

---

### T-5.2: Add Anthropic Contextual Retrieval

Prepend a chunk-specific explanatory context (50–100 tokens) generated by an LLM to each chunk before embedding. Anthropic's testing: 35% retrieval improvement alone, 49% with contextual BM25, 67% with reranking. For financial docs where a chunk like "revenue grew by 3%" is meaningless without knowing which property and time period — this is the single highest-ROI RAG improvement.

**Acceptance criteria:**
- Contextual retrieval applied during re-embedding (T-5.1)
- Each chunk prefixed with property/fund/time-period context
- Implementation cost tracked (~$1.02 per million document tokens with prompt caching)
- Eval suite shows retrieval improvement

---

### T-5.3: Deploy ParadeDB for True BM25

PostgreSQL's built-in tsvector/tsquery is not real BM25. For financial documents filled with specific identifiers (property addresses, fund names, DSCR values, entity names), keyword-based retrieval is essential. ParadeDB brings production-ready BM25 to PostgreSQL. Combined with RRF fusion, creates a three-signal system (dense vector + BM25 + metadata) that IBM research confirms is optimal.

**Acceptance criteria:**
- ParadeDB extension deployed on Supabase Postgres
- BM25 index created on document chunks
- RRF fusion updated to include BM25 signal alongside vector similarity
- Eval suite validates improvement on keyword-heavy queries

---

### T-5.4: Expand Evaluation Dataset to 200+ QA Pairs

Scale the eval harness from T-1.3. Cover: loan agreement extraction, lease analysis, financial model queries, LP reporting questions. Integrate DeepEval for automated regression testing in CI/CD. Deploy RAGAS for continuous production monitoring (faithfulness, context precision, answer relevancy).

**Acceptance criteria:**
- 200+ QA pairs covering all major REPE document types
- DeepEval integrated into CI/CD pipeline
- RAGAS running continuously in production
- Monthly red team testing for prompt injection and cross-tenant leakage

---

### T-5.5: Plan for GraphRAG

Microsoft's GraphRAG provides 23% improvement in factual accuracy for questions requiring aggregation across a corpus — e.g., "What are the top risk factors across our portfolio?" or "Which properties have co-tenancy clauses referencing Tenant X?" Start with LazyGraphRAQ (lighter variant) before full implementation. This is a large initiative — scope and plan it, don't rush it.

**Acceptance criteria:**
- Technical design document for GraphRAG integration
- LazyGraphRAG proof-of-concept on a subset of the corpus
- Benchmarked against current RAG on multi-hop analytical queries

---

## Priority Tier 6: Agent Architecture Upgrades

Winston's agent loop is fundamentally sound. These are additive refinements.

### T-6.1: Add VERIFY Step to Agent Loop

Evolve PLAN → CONFIRM → EXECUTE to PLAN → CONFIRM → EXECUTE → **VERIFY**. After execution, run a lightweight verification: did the database update succeed? Does the generated model pass sanity checks? Are extracted values within reasonable ranges? For financial data where a misread $1.5M vs $15M cascades through an entire model, verification is not optional.

**Acceptance criteria:**
- VERIFY step added to agent loop
- Verification rules defined per tool type (database writes, document extraction, financial calculations)
- Failed verifications trigger alert and block propagation
- Verification results logged in Langfuse

---

### T-6.2: Adaptive Replanning on Failure

If EXECUTE fails, replan rather than simply reporting failure. Bounded retry: maximum 2 replanning attempts before human escalation. This moves Winston from rigid Plan-and-Execute toward a hybrid with ReAct's adaptability. LangGraph's durable execution pattern provides a reference: state is checkpointed at each step, and on failure the system resumes from checkpoint with an updated plan.

**Acceptance criteria:**
- On EXECUTE failure, agent generates a revised plan (up to 2 attempts)
- Each replan attempt logged with reasoning
- Human escalation after 2 failed replans
- Success rate tracked: % of tasks recovered via replan

---

### T-6.3: Deploy Cross-Session Memory (Zep)

This is what separates an "AI assistant" from an "AI operating system." Implement four memory tiers:
- **Working memory** — current conversation context
- **Episodic memory** — records of past interactions and decisions
- **Semantic memory** — extracted facts about funds, properties, investor preferences
- **Procedural memory** — learned tool-call sequences for recurring tasks

Zep is recommended: SOC 2 compliant, temporal knowledge graph that naturally models deal timelines, outperforms MemGPT on benchmarks (94.8% vs 93.4%).

**Acceptance criteria:**
- Zep deployed and integrated with Winston's conversation layer
- Cross-session user preferences persisted and recalled
- Historical query patterns available for context enrichment
- Memory retrieval latency <100ms

---

### T-6.4: Dynamic MCP Tool Loading

With 12+ MCP tool categories, injecting all definitions into every request bloats the context window. Research shows model performance degrades past ~15–20 tools per active context. Use semantic matching or a lightweight classifier to select only the 5–10 most relevant tools per query. Alternatively, implement a hierarchical "meta-tool" that dispatches to specialist tools based on query domain.

**Acceptance criteria:**
- Tool definitions loaded dynamically based on query classification
- Max 10 tool definitions per request (down from 12+)
- Tool selection accuracy tracked (did the right tools get loaded?)
- Context window usage reduced measurably

---

### T-6.5: LangGraph for Lane D Complex Workflows

Implement LangGraph for Lane D multi-step workflows with checkpointing and durable execution. State is checkpointed at each step; on failure, resume from any checkpoint. Reserve multi-agent coordination for Lane D only — Anthropic's research shows multi-agent uses 15x more tokens than single-agent interactions; for Lanes A–C a single well-equipped agent with good routing is more efficient.

**Acceptance criteria:**
- LangGraph integrated for Lane D workflows
- State checkpointing at each workflow step
- Resume-from-checkpoint on failure
- Supervisor/worker pattern for complex tasks (document retrieval agent + financial calculation agent + narrative synthesis agent)

---

## Priority Tier 7: Domain Differentiation

These build Winston's competitive moat.

### T-7.1: ILPA v2.0 Automated LP Reporting

Build the automated LP reporting pipeline: aggregate property-level financials → calculate fund metrics (IRR, MOIC, DPI, RVPI, TVPI per ILPA's new gross-up methodologies) → generate capital account statements → produce ILPA-compliant output. No competitor fully automates this pipeline. This is a near-term market differentiator.

**Acceptance criteria:**
- End-to-end pipeline from property financials to ILPA-compliant output
- Supports IRR, MOIC, DPI, RVPI, TVPI calculations
- Capital account statement generation
- Quarterly report generation in <10 minutes
- Output validated against manually prepared reports

---

### T-7.2: REPE Ontology Layer

Build an ontology mapping: properties → funds → investors → leases → deals → financial metrics, with typed relationships. This enables queries that require traversing relationships, not just vector similarity — e.g., "show me all properties in Fund III with leases expiring within 12 months where the tenant's credit rating has declined." This is the architectural foundation for becoming a true operating system.

**Acceptance criteria:**
- Entity types defined: Property, Fund, Investor, Lease, Deal, Financial Metric
- Relationships modeled with types and cardinalities
- Ontology integrated with RAG retrieval (entity linking boosts relevance)
- Complex relationship queries return correct results

---

### T-7.3: Permission-Aware Retrieval

RAG retrieval must enforce permissions at the chunk level. A user querying "show me our portfolio performance" should only see results from funds they have access to. Requires permission metadata on every chunk and filtering at retrieval time, not just application-level access control.

**Acceptance criteria:**
- Permission metadata attached to every document chunk
- Retrieval filters by user's fund/deal access at query time
- Cross-permission access verified as blocked
- No performance degradation from permission filtering

---

### T-7.4: Dynamic Context Window Management

Implement a TokenBudgetManager that allocates context window capacity dynamically: system prompt (10–15%), tool definitions (10–15%, loaded dynamically per T-6.4), RAG context (30–40%), conversation history (20–30%), output reservation (10–15%). For conversations exceeding 10 turns, trigger incremental summarization — compress older turns while preserving critical entities and decisions.

**Acceptance criteria:**
- Token budget enforced per request
- Conversation summarization triggers at configurable turn count
- No context overflow errors in production
- Coherence maintained in extended analysis sessions

---

## Priority Tier 8: Future Architecture (Scope & Plan Only)

These are large initiatives to design and plan but not implement immediately.

### T-8.1: AI-Native Financial Modeling Engine
Design the engine that ingests documents, extracts terms, populates DCF models, runs waterfall calculations, and generates institutional-grade outputs through natural language. Target: ARGUS-compatible outputs with AI-native capabilities. Deliverable: technical design document and proof-of-concept scope.

### T-8.2: Multi-Agent Deal Teams
Design the supervisor/worker pattern for complex deal workflows. One agent for document extraction, one for financial modeling, one for market analysis, one for narrative synthesis. Deliverable: architecture document with agent boundaries, communication protocol, and tool allowlists per agent.

### T-8.3: Predictive Intelligence Layer
Design the proactive AI layer: lease expiration monitoring, covenant compliance tracking, market shift alerts, portfolio concentration warnings. Requires the ontology (T-7.2), continuous data integration, and predictive models. Deliverable: data requirements and model design document.

### T-8.4: Infrastructure Migration Plan
Plan the migration from Railway to AWS/GCP for SOC 2 compliance, VPC isolation, KMS encryption, CloudTrail audit logging. Evaluate dedicated vector databases for corpus >10M vectors. Deliverable: migration plan with cost analysis and timeline.

---

## Task Dependency Map

```
T-1.1 (Langfuse) ─────► EVERYTHING (cannot measure without it)
T-1.3 (Eval harness) ──► T-2.x (RAG fixes), T-4.2 (model tiering), T-5.x (enhanced RAG)
T-4.1 (Gateway) ───────► T-4.2 (model tiering) — gateway must exist before routing models
T-3.1 (RLS) ───────────► T-7.3 (permission-aware retrieval)
T-5.1 (Embeddings) ────► T-5.2 (contextual retrieval) — do both during re-embedding
T-7.2 (Ontology) ──────► T-5.5 (GraphRAG), T-8.3 (predictive intelligence)
```

Tasks without listed dependencies can run in parallel.

---

## Success Metrics

| Metric | Current | Target |
|---|---|---|
| API cost per query | Unknown (no tracking) | Tracked per lane, 50–70% reduction |
| RAG retrieval accuracy | Unknown (no eval) | Baselined, then +15–25% |
| Mean time to detect failure | ∞ (no observability) | <5 minutes |
| Cross-tenant data leakage | Unknown | 0 verified incidents |
| Eval suite coverage | 0 QA pairs | 200+ |
| RAG faithfulness (RAGAS) | Unknown | >0.85 |
| Agent task completion | Unknown | >90% without human intervention |
| LP report generation | Hours (manual) | <10 minutes |
