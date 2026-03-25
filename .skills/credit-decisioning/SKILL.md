---
id: credit-decisioning
kind: skill
status: active
source_of_truth: true
topic: credit-ai-governance
owners:
  - backend
  - repo-b
intent_tags:
  - credit
  - decisioning
  - underwriting
  - hallucination
  - walled-garden
  - audit
triggers:
  - credit decisioning
  - loan decisioning
  - underwriting AI
  - walled garden
  - deny by default
  - format lock
  - chain of thought
  - credit knowledge base
  - decisioning policy
  - exception routing
entrypoint: true
handoff_to:
  - feature-dev
  - data-winston
when_to_use: "Use when the task involves consumer credit AI decisioning, knowledge-base governance, hallucination prevention, audit trail generation, or structured output enforcement for credit operations."
when_not_to_use: "Do not use for REPE workflows, generic chat, or tasks that do not touch the credit decisioning surface."
surface_paths:
  - backend/app/routes/credit.py
  - backend/app/services/credit.py
  - backend/app/services/credit_decisioning.py
  - repo-b/src/app/lab/env/[envId]/credit/
  - repo-b/db/schema/274_credit_core.sql
  - repo-b/db/schema/275_credit_object_model.sql
  - repo-b/db/schema/277_credit_workflow.sql
name: credit-decisioning
description: "Consumer credit AI decisioning engine. Enforces deny-by-default walled garden, chain-of-thought orchestration, and format locks. Use when building or operating the credit AI underwriting system."
---

# Credit Decisioning — The Underwriting Standard for AI

Selection and surface routing live in `CLAUDE.md`. This skill starts after the credit decisioning surface has been chosen.

## CORE PRINCIPLE

The AI is a loan officer, not an assistant. It operates under **deny-by-default** governance:

- If the proof is not in the corpus, the answer does not leave the system.
- If the reasoning chain breaks, the output is suppressed.
- If the output cannot conform to the target schema, it is rejected.

Every violation of these principles is treated the same as an underwriter approving a loan without documentation: the task is **INCOMPLETE**.

---

## THREE-LAYER ARCHITECTURE

### Layer 1: Deny-by-Default Walled Garden

The knowledge boundary is absolute. The AI may only reference documents that have been ingested into the environment's approved corpus.

**ENFORCED CONSTRAINTS:**

```
NEVER:
- Supplement corpus documents with internet sources
- Interpolate between documents to synthesize unsupported claims
- Return a "best guess" when evidence is insufficient
- Use training knowledge to fill gaps in the corpus

ALWAYS:
- Trace every claim to a specific passage in a specific document
- Generate a citation_chain: an ordered list of (document_id, passage_id, text_excerpt) tuples
- Validate that every link in the citation chain resolves to a concrete passage
- Return a structured refusal if any link in the chain cannot be resolved
```

**REFUSAL FORMAT:**

When evidence is insufficient, the system returns:

```json
{
  "decision": "INSUFFICIENT_EVIDENCE",
  "query": "<original query>",
  "searched_corpus": ["<list of document IDs searched>"],
  "nearest_match": {
    "document_id": "<closest document>",
    "relevance_score": 0.0,
    "reason_rejected": "<why this document does not satisfy the query>"
  },
  "recommendation": "ESCALATE_TO_HUMAN",
  "explanation": "<plain-language explanation of what evidence was missing>"
}
```

**CITATION CHAIN FORMAT:**

Every assertion requires a chain:

```json
{
  "assertion": "<the claim being made>",
  "citation_chain": [
    {
      "step": 1,
      "document_id": "POL-2025-042",
      "document_title": "Auto Loan Underwriting Policy v3.1",
      "passage_id": "section_4.2.1",
      "excerpt": "<exact quoted text>",
      "relevance": "DIRECT"
    }
  ],
  "chain_status": "COMPLETE",
  "confidence_basis": "DETERMINISTIC"
}
```

`chain_status` values:
- `COMPLETE` — every assertion has a direct source. Output may proceed.
- `PARTIAL` — some assertions lack direct sources. Output is SUPPRESSED.
- `BROKEN` — a link in the chain could not be resolved. Output is SUPPRESSED.

---

### Layer 2: Chain-of-Thought Orchestration

Every query is processed through mandatory reasoning steps. The AI does not jump to conclusions.

**MANDATORY REASONING SEQUENCE:**

```
Step 1: DECOMPOSE
  - Break the query into atomic sub-queries
  - Each sub-query must be answerable from a single document passage
  - Log: { step: "decompose", sub_queries: [...], timestamp }

Step 2: RETRIEVE
  - For each sub-query, retrieve candidate passages from the corpus
  - Log: { step: "retrieve", sub_query_id, candidates: [...], timestamp }

Step 3: VALIDATE
  - For each candidate, determine if it DIRECTLY answers the sub-query
  - Reject candidates that are merely related but not responsive
  - Log: { step: "validate", sub_query_id, candidate_id, verdict: "DIRECT|RELATED|IRRELEVANT", timestamp }

Step 4: SYNTHESIZE
  - Combine validated answers into a coherent response
  - Every sentence in the response must map to at least one validated passage
  - Log: { step: "synthesize", response_sentences: [...], mappings: [...], timestamp }

Step 5: AUDIT
  - Generate the immutable audit record
  - Include: full reasoning chain, all retrieved candidates (including rejected ones),
    validation verdicts, synthesis mappings, final output, timestamps
  - Log: { step: "audit", audit_record_id, timestamp }
```

**AUDIT RECORD SCHEMA:**

```json
{
  "audit_record_id": "uuid",
  "query_id": "uuid",
  "environment_id": "uuid",
  "business_id": "uuid",
  "operator_id": "<human or system>",
  "timestamp_start": "ISO-8601",
  "timestamp_end": "ISO-8601",
  "latency_ms": 0,
  "reasoning_steps": [
    {
      "step_number": 1,
      "step_type": "decompose|retrieve|validate|synthesize|audit",
      "input": {},
      "output": {},
      "timestamp": "ISO-8601"
    }
  ],
  "final_decision": {},
  "citation_chains": [],
  "suppressed": false,
  "suppression_reason": null
}
```

**CONTROLLED LATENCY:**

The system deliberately does not optimize for speed. Each reasoning step takes the time it requires. Typical latency: 800ms–2000ms depending on query complexity. This latency IS the compliance work.

---

### Layer 3: Format Locks

Every output that will be consumed by a downstream system must conform to a declared schema. No exceptions.

**FORMAT LOCK ENFORCEMENT:**

```
1. Before generation, identify the output target:
   - HUMAN_READER → prose with citation footnotes
   - DECISIONING_ENGINE → CreditDecisionOutput schema
   - SERVICING_PLATFORM → ServicerRecord schema
   - BATCH_SYSTEM → fixed-width or CSV per target spec
   - ADVERSE_ACTION → AdverseActionNotice schema
   - GENERAL_LEDGER → JournalEntry schema

2. Load the target schema

3. Generate the response within the schema constraints

4. Validate the output against the schema BEFORE delivery

5. If validation fails:
   a. Retry with tighter constraints (up to 2 retries)
   b. If retries exhausted, REJECT and escalate to human
   c. NEVER emit a malformed payload
```

**CREDIT DECISION OUTPUT SCHEMA:**

```json
{
  "decision_id": "uuid",
  "loan_id": "uuid",
  "policy_id": "uuid",
  "policy_version": 0,
  "decision": "AUTO_APPROVE|AUTO_DECLINE|EXCEPTION_ROUTE|MANUAL_REVIEW",
  "rules_evaluated": [
    {
      "rule_id": "R001",
      "rule_description": "<from policy>",
      "attribute": "<e.g. fico_at_origination>",
      "threshold": "<from policy>",
      "observed_value": "<from application>",
      "result": "PASS|FAIL",
      "source_document": "<policy document reference>"
    }
  ],
  "explanation": "<rendered from policy explanation template>",
  "adverse_action_reasons": ["<if declined, ECOA-compliant reason codes>"],
  "input_snapshot": {
    "fico": 0,
    "dti": 0.0,
    "ltv": 0.0,
    "income_verified": false,
    "requested_amount": 0.0
  },
  "citation_chain": [],
  "audit_record_id": "uuid",
  "decided_by": "system|<analyst_id>",
  "decided_at": "ISO-8601",
  "format_lock": "CreditDecisionOutput_v1",
  "schema_valid": true
}
```

**EXCEPTION QUEUE OUTPUT SCHEMA:**

```json
{
  "exception_id": "uuid",
  "loan_id": "uuid",
  "decision_id": "uuid",
  "route_to": "<role or queue name>",
  "priority": "LOW|MEDIUM|HIGH|CRITICAL",
  "reason": "<why the system could not auto-decide>",
  "failing_rules": [
    {
      "rule_id": "R002",
      "attribute": "dti",
      "threshold": 0.36,
      "observed": 0.42,
      "gap": 0.06
    }
  ],
  "recommended_action": "<from policy exception handling section>",
  "sla_deadline": "ISO-8601",
  "citation_chain": [],
  "audit_record_id": "uuid"
}
```

**LOSS FORECAST OUTPUT SCHEMA:**

```json
{
  "forecast_id": "uuid",
  "portfolio_id": "uuid",
  "scenario_id": "uuid",
  "as_of_date": "YYYY-MM-DD",
  "horizon_months": 0,
  "methodology": "ROLL_RATE|PD_LGD|VINTAGE_CURVE|TRANSITION_MATRIX",
  "results": {
    "expected_loss": 0.0,
    "expected_loss_rate": 0.0,
    "expected_recovery": 0.0,
    "net_loss": 0.0
  },
  "assumptions_frozen": {},
  "vintage_breakdown": [],
  "citation_chain": [],
  "audit_record_id": "uuid",
  "format_lock": "LossForecastOutput_v1",
  "schema_valid": true
}
```

---

## BANNED PATTERNS — violations mean the task is INCOMPLETE

```
- Emitting any claim without a citation chain
- Returning "I think" or "probably" or "likely" in a decisioning context
- Referencing data outside the walled garden corpus
- Skipping any step in the chain-of-thought sequence
- Emitting a downstream-targeted output without format lock validation
- Suppressing a refusal to appear more helpful
- Using similarity scores as proof (similarity != evidence)
- Generating an adverse action notice without ECOA-compliant reason codes
- Approving an exception without a documented rationale
- Logging an audit record after the fact instead of during reasoning
```

---

## OPERATING MODES

### Mode: DECISIONING

Triggered when the system evaluates a loan application against policy.

Flow: Ingest application → Load active policy → Evaluate rules → Log decision → Route exceptions → Emit format-locked output

### Mode: MONITORING

Triggered when the system evaluates portfolio health metrics.

Flow: Load portfolio snapshot → Calculate roll rates → Detect covenant breaches → Generate alerts → Emit format-locked monitoring report

### Mode: FORECASTING

Triggered when the system projects future losses.

Flow: Load vintage cohorts → Apply scenario assumptions → Calculate forward curves → Compare to actuals → Emit format-locked forecast

### Mode: ATTRIBUTION

Triggered when the system analyzes predictive attribute importance.

Flow: Load loan-level data → Calculate information value per attribute → Rank attributes → Segment analysis → Emit format-locked attribute report

---

## INTEGRATION WITH EXISTING CREDIT ENVIRONMENT

This skill governs the AI behavior layer. The data layer is owned by:

- `274_credit_core.sql` — origination lifecycle (cases, underwriting, committee, covenants)
- `275_credit_object_model.sql` — portfolio-level object model (portfolios, loans, borrowers, servicers)
- `277_credit_workflow.sql` — decisioning policies, decision logs, exception queues, scenarios

The backend service layer is:

- `backend/app/services/credit.py` — origination CRUD
- `backend/app/services/credit_decisioning.py` — policy evaluation engine, audit logging, format lock enforcement

The frontend layer is:

- `/lab/env/[envId]/credit/` — origination hub
- `/lab/env/[envId]/credit/decisioning/` — policy management, exception queue, audit viewer

---

## EXAMINER TEST

Before marking any credit AI task as complete, apply the examiner test:

> If a regulator asked "how did the system arrive at this output?", can you show them:
> 1. The exact documents the system referenced? (Walled Garden)
> 2. The step-by-step reasoning the system followed? (Chain of Thought)
> 3. The structured, schema-valid output the system produced? (Format Lock)

If any answer is "no", the task is INCOMPLETE.
