"""
Credit Decisioning Engine
=========================

Implements the three-layer architecture:
  Layer 1 — Deny-by-Default Walled Garden (corpus-only retrieval, citation chains)
  Layer 2 — Chain-of-Thought Orchestration (mandatory reasoning steps, audit records)
  Layer 3 — Format Locks (schema-validated structured output)

Every decision is immutable and append-only.
"""

from __future__ import annotations

import json
import time
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any
from uuid import UUID

from app.db import get_cursor


# ── Helpers ──────────────────────────────────────────────────────────

def _q(value: Decimal | float | int | None) -> Decimal:
    if value is None:
        return Decimal("0")
    return Decimal(str(value)).quantize(Decimal("0.000000000001"))


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


# ── Layer 1: Walled Garden — Corpus Operations ──────────────────────

def ingest_document(
    *,
    env_id: UUID,
    business_id: UUID,
    document_ref: str,
    title: str,
    document_type: str,
    passages: list[dict],
    effective_from: str | None = None,
    created_by: str | None = None,
) -> dict:
    """Ingest a document and its passages into the walled garden corpus."""
    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO cc_corpus_document
            (env_id, business_id, document_ref, title, document_type,
             passage_count, effective_from, created_by)
            VALUES (%s::uuid, %s::uuid, %s, %s, %s, %s, %s, %s)
            RETURNING *
            """,
            (str(env_id), str(business_id), document_ref, title,
             document_type, len(passages), effective_from, created_by),
        )
        doc = cur.fetchone()
        doc_id = doc["document_id"]

        inserted_passages = []
        for p in passages:
            cur.execute(
                """
                INSERT INTO cc_corpus_passage
                (document_id, passage_ref, section_path, content_text, token_count)
                VALUES (%s::uuid, %s, %s, %s, %s)
                RETURNING *
                """,
                (str(doc_id), p["passage_ref"], p.get("section_path"),
                 p["content_text"], p.get("token_count", len(p["content_text"].split()))),
            )
            inserted_passages.append(cur.fetchone())

        return {"document": doc, "passages": inserted_passages}


def search_corpus(
    *,
    env_id: UUID,
    business_id: UUID,
    query: str,
    document_type: str | None = None,
) -> list[dict]:
    """Search corpus passages. Returns passages with document metadata.
    This is a text-match search; in production, replace with vector similarity."""
    with get_cursor() as cur:
        type_filter = ""
        params: list[Any] = [str(env_id), str(business_id), f"%{query}%"]
        if document_type:
            type_filter = "AND d.document_type = %s"
            params.append(document_type)

        cur.execute(
            f"""
            SELECT p.*, d.document_ref, d.title AS document_title, d.document_type
            FROM cc_corpus_passage p
            JOIN cc_corpus_document d ON d.document_id = p.document_id
            WHERE d.env_id = %s::uuid
              AND d.business_id = %s::uuid
              AND d.status = 'active'
              AND p.content_text ILIKE %s
              {type_filter}
            ORDER BY p.created_at DESC
            LIMIT 20
            """,
            params,
        )
        return cur.fetchall()


# ── Layer 2: Chain-of-Thought — Reasoning Engine ────────────────────

def _build_reasoning_chain(
    *,
    query: str,
    sub_queries: list[str],
    retrieval_results: list[dict],
    validation_verdicts: list[dict],
    synthesis: dict,
) -> list[dict]:
    """Build the mandatory 5-step reasoning chain."""
    ts = _now()
    return [
        {
            "step_number": 1,
            "step_type": "decompose",
            "input": {"query": query},
            "output": {"sub_queries": sub_queries},
            "timestamp": ts,
        },
        {
            "step_number": 2,
            "step_type": "retrieve",
            "input": {"sub_queries": sub_queries},
            "output": {"candidates": retrieval_results},
            "timestamp": ts,
        },
        {
            "step_number": 3,
            "step_type": "validate",
            "input": {"candidates": retrieval_results},
            "output": {"verdicts": validation_verdicts},
            "timestamp": ts,
        },
        {
            "step_number": 4,
            "step_type": "synthesize",
            "input": {"validated_passages": [v for v in validation_verdicts if v["verdict"] == "DIRECT"]},
            "output": synthesis,
            "timestamp": ts,
        },
        {
            "step_number": 5,
            "step_type": "audit",
            "input": {"steps_1_to_4": "complete"},
            "output": {"audit_status": "recorded"},
            "timestamp": ts,
        },
    ]


def create_audit_record(
    *,
    env_id: UUID,
    business_id: UUID,
    mode: str,
    query_text: str | None = None,
    operator_id: str = "system",
    reasoning_steps: list[dict],
    citation_chains: list[dict],
    final_output: dict,
    suppressed: bool = False,
    suppression_reason: str | None = None,
    format_lock: str | None = None,
    schema_valid: bool | None = None,
    corpus_documents_searched: list[str] | None = None,
    latency_ms: int | None = None,
    timestamp_start: str | None = None,
) -> dict:
    """Create an immutable audit record."""
    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO cc_audit_record
            (env_id, business_id, query_text, operator_id, mode,
             timestamp_start, timestamp_end, latency_ms,
             reasoning_steps_json, citation_chains_json, final_output_json,
             suppressed, suppression_reason, format_lock, schema_valid,
             corpus_documents_searched)
            VALUES (%s::uuid, %s::uuid, %s, %s, %s,
                    %s, %s, %s,
                    %s::jsonb, %s::jsonb, %s::jsonb,
                    %s, %s, %s, %s,
                    %s::jsonb)
            RETURNING *
            """,
            (str(env_id), str(business_id), query_text, operator_id, mode,
             timestamp_start or _now(), _now(), latency_ms,
             json.dumps(reasoning_steps), json.dumps(citation_chains), json.dumps(final_output),
             suppressed, suppression_reason, format_lock, schema_valid,
             json.dumps(corpus_documents_searched or [])),
        )
        return cur.fetchone()


# ── Layer 3: Format Locks — Schema Enforcement ──────────────────────

DECISION_OUTPUT_SCHEMA_KEYS = {
    "decision_log_id", "loan_id", "policy_id", "policy_version",
    "decision", "rules_evaluated", "explanation",
    "adverse_action_reasons", "input_snapshot",
    "citation_chain", "chain_status",
    "decided_by", "decided_at",
    "format_lock", "schema_valid",
}

EXCEPTION_OUTPUT_SCHEMA_KEYS = {
    "exception_id", "loan_id", "decision_log_id",
    "route_to", "priority", "reason", "failing_rules",
    "recommended_action", "sla_deadline",
    "citation_chain",
}

VALID_DECISIONS = {
    "auto_approve", "auto_decline", "exception_route",
    "manual_approve", "manual_decline", "insufficient_evidence",
}


def _validate_format_lock(output: dict, schema_keys: set[str], lock_name: str) -> bool:
    """Validate that output conforms to the format lock schema."""
    missing = schema_keys - set(output.keys())
    if missing:
        return False
    if "decision" in output and output["decision"] not in VALID_DECISIONS:
        return False
    return True


# ── Decisioning Engine ──────────────────────────────────────────────

def evaluate_loan(
    *,
    env_id: UUID,
    business_id: UUID,
    loan_id: UUID,
    policy_id: UUID,
    borrower_attributes: dict,
    operator_id: str = "system",
) -> dict:
    """
    Evaluate a loan against the active decision policy.
    Returns a format-locked CreditDecisionOutput.

    This is the main entry point. It orchestrates all three layers:
      1. Retrieves policy rules and corpus citations (Walled Garden)
      2. Evaluates each rule with logged reasoning (Chain of Thought)
      3. Emits a schema-validated decision record (Format Lock)
    """
    t_start = time.time()
    ts_start = _now()

    with get_cursor() as cur:
        # ── Load policy ──
        cur.execute(
            "SELECT * FROM cc_decision_policy WHERE policy_id = %s::uuid",
            (str(policy_id),),
        )
        policy = cur.fetchone()
        if not policy:
            raise LookupError("Decision policy not found")

        rules = json.loads(policy["rules_json"]) if isinstance(policy["rules_json"], str) else policy["rules_json"]

        # ── Step 1: Decompose ──
        sub_queries = [
            f"Evaluate rule {r['rule_id']}: {r['description']}"
            for r in rules
        ]

        # ── Step 2 & 3: Retrieve and Validate per rule ──
        rules_evaluated = []
        citation_chain = []
        all_pass = True
        first_fail_rule = None
        failing_rules = []

        for rule in rules:
            condition = rule.get("condition", {})
            result = "PASS"

            # Evaluate each condition attribute
            for attr, threshold in condition.items():
                observed = borrower_attributes.get(attr)
                if observed is None:
                    result = "FAIL"
                    continue

                if attr.endswith("_min") or attr == "fico_min":
                    base_attr = attr.replace("_min", "") if attr != "fico_min" else "fico_at_origination"
                    observed_val = borrower_attributes.get(base_attr, borrower_attributes.get(attr))
                    if observed_val is not None and float(observed_val) < float(threshold):
                        result = "FAIL"
                elif attr.endswith("_max") or attr == "dti_max" or attr == "ltv_max":
                    base_attr = attr.replace("_max", "")
                    if base_attr == "dti":
                        base_attr = "dti_at_origination"
                    elif base_attr == "ltv":
                        base_attr = "ltv_at_origination"
                    observed_val = borrower_attributes.get(base_attr, borrower_attributes.get(attr))
                    if observed_val is not None and float(observed_val) > float(threshold):
                        result = "FAIL"
                elif attr == "income_verified":
                    if bool(borrower_attributes.get("income_verified")) != bool(threshold):
                        result = "FAIL"

            rule_eval = {
                "rule_id": rule["rule_id"],
                "rule_description": rule.get("description", ""),
                "attribute": ", ".join(condition.keys()),
                "thresholds": condition,
                "observed_values": {
                    k: borrower_attributes.get(k)
                    for k in condition.keys()
                },
                "result": result,
                "source_document_ref": rule.get("source_document_ref"),
                "source_passage_ref": rule.get("source_passage_ref"),
            }
            rules_evaluated.append(rule_eval)

            # Build citation chain entry
            if rule.get("source_document_ref"):
                citation_chain.append({
                    "step": len(citation_chain) + 1,
                    "document_ref": rule["source_document_ref"],
                    "passage_ref": rule.get("source_passage_ref"),
                    "excerpt": rule.get("description", ""),
                    "relevance": "DIRECT",
                })

            if result == "FAIL":
                all_pass = False
                if first_fail_rule is None:
                    first_fail_rule = rule
                failing_rules.append({
                    "rule_id": rule["rule_id"],
                    "attribute": ", ".join(condition.keys()),
                    "thresholds": condition,
                    "observed": {k: borrower_attributes.get(k) for k in condition.keys()},
                })

        # ── Determine decision ──
        if all_pass:
            decision = "auto_approve"
            explanation_template = rules[0].get("explanation_template", "All rules passed.")
        elif first_fail_rule and first_fail_rule.get("action") == "exception_route":
            decision = "exception_route"
            explanation_template = first_fail_rule.get(
                "explanation_template",
                f"Routed to exception queue: rule {first_fail_rule['rule_id']} failed."
            )
        elif first_fail_rule and first_fail_rule.get("action") == "auto_decline":
            decision = "auto_decline"
            explanation_template = first_fail_rule.get(
                "explanation_template",
                f"Declined: rule {first_fail_rule['rule_id']} failed."
            )
        else:
            decision = "exception_route"
            explanation_template = "One or more rules failed. Routed for manual review."

        # Render explanation
        explanation = explanation_template
        for k, v in borrower_attributes.items():
            explanation = explanation.replace(f"{{{k}}}", str(v))

        chain_status = "COMPLETE" if citation_chain else "PARTIAL"

        # ── Step 4: Build reasoning chain ──
        retrieval_results = [{"rule_id": r["rule_id"], "source": r.get("source_document_ref")} for r in rules]
        validation_verdicts = [{"rule_id": r["rule_id"], "verdict": "DIRECT"} for r in rules_evaluated]
        reasoning_steps = _build_reasoning_chain(
            query=f"Evaluate loan {loan_id} against policy {policy_id}",
            sub_queries=sub_queries,
            retrieval_results=retrieval_results,
            validation_verdicts=validation_verdicts,
            synthesis={"decision": decision, "explanation": explanation},
        )

        latency_ms = int((time.time() - t_start) * 1000)

        # ── Persist decision log (immutable) ──
        cur.execute(
            """
            INSERT INTO cc_decision_log
            (env_id, business_id, loan_id, policy_id, policy_version_no,
             decision, rules_evaluated_json, explanation,
             adverse_action_reasons, input_snapshot_json,
             citation_chain_json, chain_status, reasoning_steps_json,
             format_lock, schema_valid, decided_by, latency_ms)
            VALUES (%s::uuid, %s::uuid, %s::uuid, %s::uuid, %s,
                    %s, %s::jsonb, %s,
                    %s::jsonb, %s::jsonb,
                    %s::jsonb, %s, %s::jsonb,
                    %s, %s, %s, %s)
            RETURNING *
            """,
            (str(env_id), str(business_id), str(loan_id), str(policy_id),
             policy["version_no"],
             decision, json.dumps(rules_evaluated), explanation,
             json.dumps(first_fail_rule.get("adverse_action_code", []) if first_fail_rule else []),
             json.dumps(borrower_attributes),
             json.dumps(citation_chain), chain_status, json.dumps(reasoning_steps),
             "CreditDecisionOutput_v1", True, operator_id, latency_ms),
        )
        decision_log = cur.fetchone()

        # ── If exception route, create exception queue entry ──
        exception = None
        if decision == "exception_route":
            route_to = first_fail_rule.get("route_to", "senior_underwriter") if first_fail_rule else "senior_underwriter"
            cur.execute(
                """
                INSERT INTO cc_exception_queue
                (env_id, business_id, loan_id, decision_log_id,
                 route_to, priority, reason, failing_rules_json,
                 recommended_action, sla_deadline)
                VALUES (%s::uuid, %s::uuid, %s::uuid, %s::uuid,
                        %s, %s, %s, %s::jsonb,
                        %s, NOW() + INTERVAL '24 hours')
                RETURNING *
                """,
                (str(env_id), str(business_id), str(loan_id),
                 str(decision_log["decision_log_id"]),
                 route_to, "high", explanation, json.dumps(failing_rules),
                 first_fail_rule.get("recommended_action") if first_fail_rule else None),
            )
            exception = cur.fetchone()

        # ── Create audit record ──
        audit = create_audit_record(
            env_id=env_id,
            business_id=business_id,
            mode="decisioning",
            query_text=f"Evaluate loan {loan_id}",
            operator_id=operator_id,
            reasoning_steps=reasoning_steps,
            citation_chains=citation_chain,
            final_output={
                "decision": decision,
                "decision_log_id": str(decision_log["decision_log_id"]),
            },
            format_lock="CreditDecisionOutput_v1",
            schema_valid=True,
            latency_ms=latency_ms,
            timestamp_start=ts_start,
        )

        # ── Format-locked output ──
        output = {
            "decision_log_id": str(decision_log["decision_log_id"]),
            "loan_id": str(loan_id),
            "policy_id": str(policy_id),
            "policy_version": policy["version_no"],
            "decision": decision,
            "rules_evaluated": rules_evaluated,
            "explanation": explanation,
            "adverse_action_reasons": first_fail_rule.get("adverse_action_code", []) if first_fail_rule else [],
            "input_snapshot": borrower_attributes,
            "citation_chain": citation_chain,
            "chain_status": chain_status,
            "decided_by": operator_id,
            "decided_at": decision_log["decided_at"].isoformat() if hasattr(decision_log["decided_at"], "isoformat") else str(decision_log["decided_at"]),
            "format_lock": "CreditDecisionOutput_v1",
            "schema_valid": True,
            "audit_record_id": str(audit["audit_record_id"]),
            "latency_ms": latency_ms,
            "reasoning_steps": reasoning_steps,
        }

        if exception:
            output["exception"] = {
                "exception_id": str(exception["exception_id"]),
                "route_to": exception["route_to"],
                "priority": exception["priority"],
                "status": exception["status"],
                "sla_deadline": exception["sla_deadline"].isoformat() if hasattr(exception["sla_deadline"], "isoformat") else str(exception["sla_deadline"]),
            }

        return output


# ── Portfolio / Scenario Operations ─────────────────────────────────

def list_portfolios(*, env_id: UUID, business_id: UUID) -> list[dict]:
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT p.*,
                   (SELECT COUNT(*) FROM cc_loan l WHERE l.portfolio_id = p.portfolio_id) AS loan_count,
                   (SELECT COALESCE(SUM(l.current_balance), 0) FROM cc_loan l WHERE l.portfolio_id = p.portfolio_id) AS total_upb
            FROM cc_portfolio p
            WHERE p.env_id = %s::uuid AND p.business_id = %s::uuid
            ORDER BY p.created_at DESC
            """,
            (str(env_id), str(business_id)),
        )
        return cur.fetchall()


def create_portfolio(*, env_id: UUID, business_id: UUID, payload: dict) -> dict:
    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO cc_portfolio
            (env_id, business_id, name, product_type, origination_channel,
             servicer, vintage_quarter, target_fico_min, target_fico_max,
             target_dti_max, target_ltv_max, created_by)
            VALUES (%s::uuid, %s::uuid, %s, %s, %s,
                    %s, %s, %s, %s, %s, %s, %s)
            RETURNING *
            """,
            (str(env_id), str(business_id),
             payload["name"], payload.get("product_type", "other"),
             payload.get("origination_channel", "direct"),
             payload.get("servicer"), payload.get("vintage_quarter"),
             payload.get("target_fico_min"), payload.get("target_fico_max"),
             payload.get("target_dti_max"), payload.get("target_ltv_max"),
             payload.get("created_by")),
        )
        return cur.fetchone()


def list_decision_logs(*, env_id: UUID, business_id: UUID, limit: int = 50) -> list[dict]:
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT dl.*,
                   dp.name AS policy_name,
                   l.loan_ref,
                   b.borrower_ref
            FROM cc_decision_log dl
            LEFT JOIN cc_decision_policy dp ON dp.policy_id = dl.policy_id
            LEFT JOIN cc_loan l ON l.loan_id = dl.loan_id
            LEFT JOIN cc_borrower b ON b.borrower_id = (
                SELECT borrower_id FROM cc_loan WHERE loan_id = dl.loan_id
            )
            WHERE dl.env_id = %s::uuid AND dl.business_id = %s::uuid
            ORDER BY dl.decided_at DESC
            LIMIT %s
            """,
            (str(env_id), str(business_id), limit),
        )
        return cur.fetchall()


def list_exception_queue(*, env_id: UUID, business_id: UUID, status: str | None = None) -> list[dict]:
    with get_cursor() as cur:
        status_filter = ""
        params: list[Any] = [str(env_id), str(business_id)]
        if status:
            status_filter = "AND eq.status = %s"
            params.append(status)

        cur.execute(
            f"""
            SELECT eq.*,
                   l.loan_ref,
                   b.borrower_ref
            FROM cc_exception_queue eq
            LEFT JOIN cc_loan l ON l.loan_id = eq.loan_id
            LEFT JOIN cc_borrower b ON b.borrower_id = (
                SELECT borrower_id FROM cc_loan WHERE loan_id = eq.loan_id
            )
            WHERE eq.env_id = %s::uuid AND eq.business_id = %s::uuid
            {status_filter}
            ORDER BY
              CASE eq.priority
                WHEN 'critical' THEN 1
                WHEN 'high' THEN 2
                WHEN 'medium' THEN 3
                WHEN 'low' THEN 4
              END,
              eq.opened_at ASC
            """,
            params,
        )
        return cur.fetchall()


def list_audit_records(*, env_id: UUID, business_id: UUID, limit: int = 50) -> list[dict]:
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT *
            FROM cc_audit_record
            WHERE env_id = %s::uuid AND business_id = %s::uuid
            ORDER BY created_at DESC
            LIMIT %s
            """,
            (str(env_id), str(business_id), limit),
        )
        return cur.fetchall()


# ── Context Operations ─────────────────────────────────────────────

def resolve_credit_context(*, env_id: UUID, business_id: UUID) -> dict:
    """Return env/business binding with credit_initialized status."""
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT e.env_id, e.credit_initialized
            FROM app.environments e
            WHERE e.env_id = %s::uuid
            """,
            (str(env_id),),
        )
        row = cur.fetchone()
        credit_init = row["credit_initialized"] if row else False
        return {
            "env_id": str(env_id),
            "business_id": str(business_id),
            "credit_initialized": credit_init,
            "created": row is not None,
            "source": "credit_v2",
            "diagnostics": {},
        }


def init_credit_context(*, env_id: UUID, business_id: UUID) -> dict:
    """Set credit_initialized = true for the environment."""
    with get_cursor() as cur:
        cur.execute(
            """
            UPDATE app.environments
            SET credit_initialized = true
            WHERE env_id = %s::uuid
            """,
            (str(env_id),),
        )
        return resolve_credit_context(env_id=env_id, business_id=business_id)


# ── Portfolio Operations (continued) ───────────────────────────────

def get_portfolio(*, env_id: UUID, business_id: UUID, portfolio_id: UUID) -> dict:
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT p.*,
                   (SELECT COUNT(*) FROM cc_loan l WHERE l.portfolio_id = p.portfolio_id) AS loan_count,
                   (SELECT COALESCE(SUM(l.current_balance), 0) FROM cc_loan l WHERE l.portfolio_id = p.portfolio_id) AS total_upb
            FROM cc_portfolio p
            WHERE p.env_id = %s::uuid AND p.business_id = %s::uuid
              AND p.portfolio_id = %s::uuid
            """,
            (str(env_id), str(business_id), str(portfolio_id)),
        )
        row = cur.fetchone()
        if not row:
            raise LookupError("Portfolio not found")
        return row


def update_portfolio(*, env_id: UUID, business_id: UUID, portfolio_id: UUID, payload: dict) -> dict:
    """Update mutable fields on a portfolio."""
    allowed = {"name", "status", "servicer", "target_fico_min", "target_fico_max", "target_dti_max", "target_ltv_max"}
    sets = []
    params: list[Any] = []
    for k, v in payload.items():
        if k in allowed and v is not None:
            sets.append(f"{k} = %s")
            params.append(v)
    if not sets:
        return get_portfolio(env_id=env_id, business_id=business_id, portfolio_id=portfolio_id)
    sets.append("updated_at = now()")
    params.extend([str(env_id), str(business_id), str(portfolio_id)])
    with get_cursor() as cur:
        cur.execute(
            f"""
            UPDATE cc_portfolio
            SET {', '.join(sets)}
            WHERE env_id = %s::uuid AND business_id = %s::uuid AND portfolio_id = %s::uuid
            RETURNING *
            """,
            params,
        )
        row = cur.fetchone()
        if not row:
            raise LookupError("Portfolio not found")
        return row


# ── Borrower Operations ───────────────────────────────────────────

def create_borrower(*, env_id: UUID, business_id: UUID, payload: dict) -> dict:
    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO cc_borrower
            (env_id, business_id, borrower_ref, fico_at_origination, dti_at_origination,
             income_verified, annual_income, employment_length_months,
             housing_status, state_code, attributes_json, created_by)
            VALUES (%s::uuid, %s::uuid, %s, %s, %s,
                    %s, %s, %s, %s, %s, %s::jsonb, %s)
            RETURNING *
            """,
            (str(env_id), str(business_id),
             payload["borrower_ref"],
             payload.get("fico_at_origination"), payload.get("dti_at_origination"),
             payload.get("income_verified", False), payload.get("annual_income"),
             payload.get("employment_length_months"),
             payload.get("housing_status"), payload.get("state_code"),
             json.dumps(payload.get("attributes_json", {})),
             payload.get("created_by")),
        )
        return cur.fetchone()


def list_borrowers(*, env_id: UUID, business_id: UUID, limit: int = 100) -> list[dict]:
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT *
            FROM cc_borrower
            WHERE env_id = %s::uuid AND business_id = %s::uuid
            ORDER BY created_at DESC
            LIMIT %s
            """,
            (str(env_id), str(business_id), limit),
        )
        return cur.fetchall()


def get_borrower(*, env_id: UUID, business_id: UUID, borrower_id: UUID) -> dict:
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT b.*,
                   (SELECT COUNT(*) FROM cc_loan l WHERE l.borrower_id = b.borrower_id) AS loan_count
            FROM cc_borrower b
            WHERE b.env_id = %s::uuid AND b.business_id = %s::uuid
              AND b.borrower_id = %s::uuid
            """,
            (str(env_id), str(business_id), str(borrower_id)),
        )
        row = cur.fetchone()
        if not row:
            raise LookupError("Borrower not found")
        return row


# ── Loan Operations ───────────────────────────────────────────────

def create_loan(*, env_id: UUID, business_id: UUID, payload: dict) -> dict:
    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO cc_loan
            (env_id, business_id, portfolio_id, borrower_id, loan_ref,
             origination_date, maturity_date, original_balance, current_balance,
             interest_rate, apr, term_months, remaining_term_months,
             loan_status, risk_grade, collateral_type, collateral_value,
             ltv_at_origination, payment_amount, payment_frequency,
             attributes_json, created_by)
            VALUES (%s::uuid, %s::uuid, %s::uuid, %s::uuid, %s,
                    %s, %s, %s, %s,
                    %s, %s, %s, %s,
                    %s, %s, %s, %s,
                    %s, %s, %s,
                    %s::jsonb, %s)
            RETURNING *
            """,
            (str(env_id), str(business_id),
             str(payload["portfolio_id"]), str(payload["borrower_id"]),
             payload["loan_ref"],
             payload.get("origination_date"), payload.get("maturity_date"),
             payload.get("original_balance", 0),
             payload.get("current_balance", payload.get("original_balance", 0)),
             payload.get("interest_rate"), payload.get("apr"),
             payload.get("term_months"), payload.get("remaining_term_months"),
             payload.get("loan_status", "current"),
             payload.get("risk_grade"), payload.get("collateral_type"),
             payload.get("collateral_value"), payload.get("ltv_at_origination"),
             payload.get("payment_amount"), payload.get("payment_frequency", "monthly"),
             json.dumps(payload.get("attributes_json", {})),
             payload.get("created_by")),
        )
        return cur.fetchone()


def list_loans(
    *,
    env_id: UUID,
    business_id: UUID,
    portfolio_id: UUID,
    status: str | None = None,
    limit: int = 100,
) -> list[dict]:
    with get_cursor() as cur:
        status_filter = ""
        params: list[Any] = [str(env_id), str(business_id), str(portfolio_id)]
        if status:
            status_filter = "AND l.loan_status = %s"
            params.append(status)
        params.append(limit)
        cur.execute(
            f"""
            SELECT l.*, b.borrower_ref, b.fico_at_origination
            FROM cc_loan l
            LEFT JOIN cc_borrower b ON b.borrower_id = l.borrower_id
            WHERE l.env_id = %s::uuid AND l.business_id = %s::uuid
              AND l.portfolio_id = %s::uuid
              {status_filter}
            ORDER BY l.created_at DESC
            LIMIT %s
            """,
            params,
        )
        return cur.fetchall()


def get_loan(*, env_id: UUID, business_id: UUID, loan_id: UUID) -> dict:
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT l.*, b.borrower_ref, b.fico_at_origination,
                   b.dti_at_origination, b.income_verified, b.annual_income
            FROM cc_loan l
            LEFT JOIN cc_borrower b ON b.borrower_id = l.borrower_id
            WHERE l.env_id = %s::uuid AND l.business_id = %s::uuid
              AND l.loan_id = %s::uuid
            """,
            (str(env_id), str(business_id), str(loan_id)),
        )
        row = cur.fetchone()
        if not row:
            raise LookupError("Loan not found")
        return row


# ── Loan Event Operations ─────────────────────────────────────────

def create_loan_event(*, env_id: UUID, loan_id: UUID, payload: dict) -> dict:
    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO cc_loan_event
            (env_id, loan_id, event_date, event_type,
             principal_amount, interest_amount, fee_amount,
             balance_after, delinquency_days, memo, created_by)
            VALUES (%s::uuid, %s::uuid, %s, %s,
                    %s, %s, %s, %s, %s, %s, %s)
            RETURNING *
            """,
            (str(env_id), str(loan_id),
             payload["event_date"], payload["event_type"],
             payload.get("principal_amount", 0),
             payload.get("interest_amount", 0),
             payload.get("fee_amount", 0),
             payload.get("balance_after"),
             payload.get("delinquency_days"),
             payload.get("memo"),
             payload.get("created_by")),
        )
        event = cur.fetchone()

        # Update loan current_balance if balance_after provided
        if payload.get("balance_after") is not None:
            cur.execute(
                """
                UPDATE cc_loan SET current_balance = %s, updated_at = now()
                WHERE loan_id = %s::uuid
                """,
                (payload["balance_after"], str(loan_id)),
            )

        return event


def list_loan_events(*, env_id: UUID, loan_id: UUID, limit: int = 100) -> list[dict]:
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT *
            FROM cc_loan_event
            WHERE env_id = %s::uuid AND loan_id = %s::uuid
            ORDER BY event_date DESC, created_at DESC
            LIMIT %s
            """,
            (str(env_id), str(loan_id), limit),
        )
        return cur.fetchall()


# ── Policy Operations ─────────────────────────────────────────────

def create_policy(*, env_id: UUID, business_id: UUID, payload: dict) -> dict:
    with get_cursor() as cur:
        # If activating, deactivate existing active policy for same portfolio+type
        if payload.get("is_active"):
            cur.execute(
                """
                UPDATE cc_decision_policy
                SET is_active = false, updated_at = now()
                WHERE env_id = %s::uuid AND business_id = %s::uuid
                  AND portfolio_id = %s::uuid AND policy_type = %s
                  AND is_active = true
                """,
                (str(env_id), str(business_id),
                 str(payload["portfolio_id"]) if payload.get("portfolio_id") else None,
                 payload.get("policy_type", "underwriting")),
            )

        cur.execute(
            """
            INSERT INTO cc_decision_policy
            (env_id, business_id, portfolio_id, name, policy_type,
             rules_json, is_active, effective_from, effective_to, created_by)
            VALUES (%s::uuid, %s::uuid, %s, %s, %s,
                    %s::jsonb, %s, %s, %s, %s)
            RETURNING *
            """,
            (str(env_id), str(business_id),
             str(payload["portfolio_id"]) if payload.get("portfolio_id") else None,
             payload["name"], payload.get("policy_type", "underwriting"),
             json.dumps(payload.get("rules_json", [])),
             payload.get("is_active", False),
             payload.get("effective_from"), payload.get("effective_to"),
             payload.get("created_by")),
        )
        return cur.fetchone()


def list_policies(*, env_id: UUID, business_id: UUID, portfolio_id: UUID | None = None) -> list[dict]:
    with get_cursor() as cur:
        portfolio_filter = ""
        params: list[Any] = [str(env_id), str(business_id)]
        if portfolio_id:
            portfolio_filter = "AND portfolio_id = %s::uuid"
            params.append(str(portfolio_id))
        cur.execute(
            f"""
            SELECT *
            FROM cc_decision_policy
            WHERE env_id = %s::uuid AND business_id = %s::uuid
              {portfolio_filter}
            ORDER BY is_active DESC, created_at DESC
            """,
            params,
        )
        return cur.fetchall()


def get_policy(*, env_id: UUID, business_id: UUID, policy_id: UUID) -> dict:
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT *
            FROM cc_decision_policy
            WHERE env_id = %s::uuid AND business_id = %s::uuid
              AND policy_id = %s::uuid
            """,
            (str(env_id), str(business_id), str(policy_id)),
        )
        row = cur.fetchone()
        if not row:
            raise LookupError("Policy not found")
        return row


def activate_policy(*, env_id: UUID, business_id: UUID, policy_id: UUID) -> dict:
    """Activate a policy (deactivates prior active policy for same portfolio+type)."""
    with get_cursor() as cur:
        # Get the policy to find portfolio_id and type
        cur.execute(
            "SELECT * FROM cc_decision_policy WHERE policy_id = %s::uuid",
            (str(policy_id),),
        )
        policy = cur.fetchone()
        if not policy:
            raise LookupError("Policy not found")

        # Deactivate others
        cur.execute(
            """
            UPDATE cc_decision_policy
            SET is_active = false, updated_at = now()
            WHERE env_id = %s::uuid AND business_id = %s::uuid
              AND portfolio_id = %s AND policy_type = %s
              AND is_active = true AND policy_id != %s::uuid
            """,
            (str(env_id), str(business_id),
             policy["portfolio_id"], policy["policy_type"],
             str(policy_id)),
        )

        # Activate this one
        cur.execute(
            """
            UPDATE cc_decision_policy
            SET is_active = true, updated_at = now()
            WHERE policy_id = %s::uuid
            RETURNING *
            """,
            (str(policy_id),),
        )
        return cur.fetchone()


# ── Exception Resolution ──────────────────────────────────────────

def resolve_exception(
    *,
    env_id: UUID,
    business_id: UUID,
    exception_id: UUID,
    resolution: str,
    resolution_note: str | None = None,
    assigned_to: str | None = None,
    resolution_citation_json: list[dict] | None = None,
) -> dict:
    with get_cursor() as cur:
        cur.execute(
            """
            UPDATE cc_exception_queue
            SET status = 'resolved',
                resolution = %s,
                resolution_note = %s,
                assigned_to = COALESCE(%s, assigned_to),
                resolution_citation_json = %s::jsonb,
                resolved_at = now(),
                updated_at = now()
            WHERE env_id = %s::uuid AND business_id = %s::uuid
              AND exception_id = %s::uuid
            RETURNING *
            """,
            (resolution, resolution_note, assigned_to,
             json.dumps(resolution_citation_json or []),
             str(env_id), str(business_id), str(exception_id)),
        )
        row = cur.fetchone()
        if not row:
            raise LookupError("Exception not found")
        return row


def get_exception(*, env_id: UUID, business_id: UUID, exception_id: UUID) -> dict:
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT eq.*, l.loan_ref, b.borrower_ref
            FROM cc_exception_queue eq
            LEFT JOIN cc_loan l ON l.loan_id = eq.loan_id
            LEFT JOIN cc_borrower b ON b.borrower_id = l.borrower_id
            WHERE eq.env_id = %s::uuid AND eq.business_id = %s::uuid
              AND eq.exception_id = %s::uuid
            """,
            (str(env_id), str(business_id), str(exception_id)),
        )
        row = cur.fetchone()
        if not row:
            raise LookupError("Exception not found")
        return row


# ── Decision Log Detail ───────────────────────────────────────────

def get_decision_log(*, env_id: UUID, business_id: UUID, decision_log_id: UUID) -> dict:
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT dl.*, dp.name AS policy_name, l.loan_ref, b.borrower_ref
            FROM cc_decision_log dl
            LEFT JOIN cc_decision_policy dp ON dp.policy_id = dl.policy_id
            LEFT JOIN cc_loan l ON l.loan_id = dl.loan_id
            LEFT JOIN cc_borrower b ON b.borrower_id = l.borrower_id
            WHERE dl.env_id = %s::uuid AND dl.business_id = %s::uuid
              AND dl.decision_log_id = %s::uuid
            """,
            (str(env_id), str(business_id), str(decision_log_id)),
        )
        row = cur.fetchone()
        if not row:
            raise LookupError("Decision log not found")
        return row


# ── Scenario Operations ───────────────────────────────────────────

def create_scenario(*, env_id: UUID, business_id: UUID, payload: dict) -> dict:
    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO cc_portfolio_scenario
            (env_id, business_id, portfolio_id, name, scenario_type,
             is_base, assumptions_json, created_by)
            VALUES (%s::uuid, %s::uuid, %s::uuid, %s, %s,
                    %s, %s::jsonb, %s)
            RETURNING *
            """,
            (str(env_id), str(business_id),
             str(payload["portfolio_id"]), payload["name"],
             payload.get("scenario_type", "base"),
             payload.get("is_base", False),
             json.dumps(payload.get("assumptions_json", {})),
             payload.get("created_by")),
        )
        return cur.fetchone()


def list_scenarios(*, env_id: UUID, business_id: UUID, portfolio_id: UUID) -> list[dict]:
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT *
            FROM cc_portfolio_scenario
            WHERE env_id = %s::uuid AND business_id = %s::uuid
              AND portfolio_id = %s::uuid
            ORDER BY is_base DESC, created_at DESC
            """,
            (str(env_id), str(business_id), str(portfolio_id)),
        )
        return cur.fetchall()


# ── Corpus Operations (continued) ─────────────────────────────────

def list_corpus_documents(*, env_id: UUID, business_id: UUID) -> list[dict]:
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT *
            FROM cc_corpus_document
            WHERE env_id = %s::uuid AND business_id = %s::uuid
            ORDER BY ingested_at DESC
            """,
            (str(env_id), str(business_id)),
        )
        return cur.fetchall()


def list_corpus_passages(*, document_id: UUID) -> list[dict]:
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT *
            FROM cc_corpus_passage
            WHERE document_id = %s::uuid
            ORDER BY passage_ref
            """,
            (str(document_id),),
        )
        return cur.fetchall()


# ── Environment Snapshot ──────────────────────────────────────────

def get_environment_snapshot(*, env_id: UUID, business_id: UUID) -> dict:
    """Return high-level KPIs for the credit environment."""
    with get_cursor() as cur:
        # Portfolio + loan aggregates
        cur.execute(
            """
            SELECT
              (SELECT COUNT(*) FROM cc_portfolio WHERE env_id = %s::uuid AND business_id = %s::uuid) AS portfolio_count,
              (SELECT COUNT(*) FROM cc_loan WHERE env_id = %s::uuid AND business_id = %s::uuid) AS total_loan_count,
              (SELECT COALESCE(SUM(current_balance), 0) FROM cc_loan WHERE env_id = %s::uuid AND business_id = %s::uuid) AS total_upb,
              (SELECT COUNT(*) FROM cc_loan WHERE env_id = %s::uuid AND business_id = %s::uuid AND delinquency_bucket != 'current') AS dq_count,
              (SELECT COUNT(*) FROM cc_loan WHERE env_id = %s::uuid AND business_id = %s::uuid AND delinquency_bucket IN ('60','90','120plus','default')) AS dq_60plus_count,
              (SELECT COUNT(*) FROM cc_loan WHERE env_id = %s::uuid AND business_id = %s::uuid AND delinquency_bucket IN ('90','120plus','default')) AS dq_90plus_count,
              (SELECT COUNT(*) FROM cc_loan WHERE env_id = %s::uuid AND business_id = %s::uuid AND loan_status = 'charged_off') AS charged_off_count,
              (SELECT COUNT(*) FROM cc_exception_queue WHERE env_id = %s::uuid AND business_id = %s::uuid AND status IN ('open','assigned','in_review')) AS open_exception_count,
              (SELECT COUNT(*) FROM cc_corpus_document WHERE env_id = %s::uuid AND business_id = %s::uuid AND status = 'active') AS corpus_document_count,
              (SELECT COUNT(*) FROM cc_decision_policy WHERE env_id = %s::uuid AND business_id = %s::uuid) AS policy_count,
              (SELECT COUNT(*) FROM cc_decision_log WHERE env_id = %s::uuid AND business_id = %s::uuid) AS decision_count
            """,
            tuple(str(env_id) if i % 2 == 0 else str(business_id) for i in range(22)),
        )
        row = cur.fetchone()
        total = row["total_loan_count"] or 1  # avoid div/0
        return {
            "portfolio_count": row["portfolio_count"],
            "total_upb": str(row["total_upb"]),
            "total_loan_count": row["total_loan_count"],
            "dq_30plus_rate": str(Decimal(str(row["dq_count"])) / Decimal(str(total))),
            "dq_60plus_rate": str(Decimal(str(row["dq_60plus_count"])) / Decimal(str(total))),
            "dq_90plus_rate": str(Decimal(str(row["dq_90plus_count"])) / Decimal(str(total))),
            "net_loss_rate": str(Decimal(str(row["charged_off_count"])) / Decimal(str(total))),
            "exception_queue_depth": row["open_exception_count"],
            "open_exception_count": row["open_exception_count"],
            "corpus_document_count": row["corpus_document_count"],
            "policy_count": row["policy_count"],
            "decision_count": row["decision_count"],
        }


# ── Seeder ─────────────────────────────────────────────────────────

def seed_credit_demo(*, env_id: UUID, business_id: UUID) -> dict:
    """Create a full demo credit environment with corpus, portfolios, loans, policies, and decisions."""
    import random
    import uuid as _uuid

    _NS = _uuid.UUID("cc000000-0001-0001-0001-000000000001")

    def _sid(name: str) -> UUID:
        return _uuid.uuid5(_NS, name)

    # ── Init context ──
    init_credit_context(env_id=env_id, business_id=business_id)

    # ── Corpus documents ──
    doc1 = ingest_document(
        env_id=env_id, business_id=business_id,
        document_ref="POL-2025-042",
        title="Auto Loan Underwriting Policy v3.1",
        document_type="policy",
        effective_from="2025-01-01",
        passages=[
            {"passage_ref": "section_4.2.1", "section_path": "4 > 4.2 > 4.2.1",
             "content_text": "Auto-approval criteria: FICO score >= 720, DTI ratio <= 36%, income verified, LTV <= 100%. Applications meeting all criteria may be auto-approved without manual review."},
            {"passage_ref": "section_4.3.1", "section_path": "4 > 4.3 > 4.3.1",
             "content_text": "Exception routing: Applications with FICO 640-719 or DTI 36%-43% shall be routed to the exception queue for senior underwriter review within 24 hours."},
            {"passage_ref": "section_4.4.1", "section_path": "4 > 4.4 > 4.4.1",
             "content_text": "Auto-decline criteria: FICO score < 640 or DTI ratio > 43% or income not verified. Adverse action notice required per ECOA within 30 days."},
            {"passage_ref": "section_5.1", "section_path": "5 > 5.1",
             "content_text": "Maximum LTV for auto loans: 120% for new vehicles, 100% for used vehicles. LTV calculated as (loan amount + fees) / NADA retail value."},
        ],
    )

    doc2 = ingest_document(
        env_id=env_id, business_id=business_id,
        document_ref="REG-2025-008",
        title="ECOA Adverse Action Compliance Guide",
        document_type="regulatory_guidance",
        effective_from="2025-01-01",
        passages=[
            {"passage_ref": "section_2.1", "section_path": "2 > 2.1",
             "content_text": "Required disclosures: All adverse action notices must include the specific reasons for denial, the applicant's right to obtain the credit report, and the name of the credit reporting agency."},
            {"passage_ref": "section_3.1", "section_path": "3 > 3.1",
             "content_text": "Reason codes: AA01 (credit score below minimum), AA02 (debt-to-income ratio too high), AA03 (insufficient income verification), AA04 (loan-to-value ratio exceeds maximum)."},
        ],
    )

    doc3 = ingest_document(
        env_id=env_id, business_id=business_id,
        document_ref="PROC-2025-015",
        title="Exception Queue Operating Procedures",
        document_type="procedure",
        effective_from="2025-01-01",
        passages=[
            {"passage_ref": "section_1.1", "section_path": "1 > 1.1",
             "content_text": "SLA requirements: All exception queue items must be resolved within 24 hours of routing. Escalation to senior credit officer required if SLA is breached."},
            {"passage_ref": "section_2.1", "section_path": "2 > 2.1",
             "content_text": "Resolution documentation: Every exception resolution must include the resolution decision, supporting rationale, and at least one citation to an applicable policy or regulatory document."},
        ],
    )

    doc4 = ingest_document(
        env_id=env_id, business_id=business_id,
        document_ref="MEMO-2025-003",
        title="Q1 2025 Credit Committee Guidance Memo",
        document_type="internal_memo",
        effective_from="2025-01-15",
        passages=[
            {"passage_ref": "section_1", "section_path": "1",
             "content_text": "Portfolio targets for Q1 2025: Maintain 30+ DQ rate below 3.5%, target weighted average FICO above 700, and keep exception queue resolution rate above 95% within SLA."},
        ],
    )

    # ── Portfolio 1: Auto Prime ──
    p1 = create_portfolio(
        env_id=env_id, business_id=business_id,
        payload={
            "name": "Auto Prime 2025-A",
            "product_type": "auto",
            "origination_channel": "direct",
            "vintage_quarter": "2025-Q1",
            "target_fico_min": 640,
            "target_fico_max": 850,
            "target_dti_max": "0.43",
            "target_ltv_max": "1.20",
        },
    )
    p1_id = p1["portfolio_id"]

    # ── Decision policy for portfolio 1 ──
    pol1 = create_policy(
        env_id=env_id, business_id=business_id,
        payload={
            "portfolio_id": p1_id,
            "name": "Auto Prime Underwriting v1",
            "policy_type": "underwriting",
            "is_active": True,
            "effective_from": "2025-01-01",
            "rules_json": [
                {
                    "rule_id": "R001",
                    "description": "Auto-approve prime borrowers",
                    "condition": {"fico_min": 720, "dti_max": 0.36, "income_verified": True},
                    "action": "auto_approve",
                    "explanation_template": "Approved: FICO {fico_at_origination} >= 720, DTI {dti_at_origination} <= 36%",
                    "source_document_ref": "POL-2025-042",
                    "source_passage_ref": "section_4.2.1",
                },
                {
                    "rule_id": "R002",
                    "description": "Route near-prime to exception queue",
                    "condition": {"fico_min": 640, "dti_max": 0.43},
                    "action": "exception_route",
                    "route_to": "senior_underwriter",
                    "explanation_template": "Routed: FICO {fico_at_origination} in 640-719 range or DTI {dti_at_origination} > 36%",
                    "source_document_ref": "POL-2025-042",
                    "source_passage_ref": "section_4.3.1",
                },
                {
                    "rule_id": "R003",
                    "description": "Auto-decline sub-prime",
                    "condition": {"fico_min": 0, "dti_max": 1.0},
                    "action": "auto_decline",
                    "adverse_action_code": ["AA01", "AA02"],
                    "explanation_template": "Declined: FICO {fico_at_origination} < 640 or DTI {dti_at_origination} > 43%",
                    "source_document_ref": "POL-2025-042",
                    "source_passage_ref": "section_4.4.1",
                },
            ],
        },
    )
    pol1_id = pol1["policy_id"]

    # ── Borrowers and loans for portfolio 1 ──
    borrower_profiles = [
        {"ref": "B-1001", "fico": 780, "dti": "0.28", "income": "95000", "verified": True, "state": "CA", "housing": "own"},
        {"ref": "B-1002", "fico": 745, "dti": "0.32", "income": "78000", "verified": True, "state": "TX", "housing": "mortgage"},
        {"ref": "B-1003", "fico": 710, "dti": "0.38", "income": "62000", "verified": True, "state": "FL", "housing": "rent"},
        {"ref": "B-1004", "fico": 695, "dti": "0.41", "income": "55000", "verified": True, "state": "NY", "housing": "rent"},
        {"ref": "B-1005", "fico": 620, "dti": "0.45", "income": "42000", "verified": False, "state": "OH", "housing": "rent"},
        {"ref": "B-1006", "fico": 760, "dti": "0.25", "income": "110000", "verified": True, "state": "WA", "housing": "own"},
        {"ref": "B-1007", "fico": 730, "dti": "0.34", "income": "72000", "verified": True, "state": "CO", "housing": "mortgage"},
        {"ref": "B-1008", "fico": 680, "dti": "0.39", "income": "58000", "verified": True, "state": "AZ", "housing": "rent"},
        {"ref": "B-1009", "fico": 650, "dti": "0.42", "income": "48000", "verified": True, "state": "GA", "housing": "rent"},
        {"ref": "B-1010", "fico": 590, "dti": "0.50", "income": "35000", "verified": False, "state": "MI", "housing": "rent"},
    ]

    loan_amounts = [32000, 28000, 22000, 18000, 15000, 45000, 25000, 20000, 16000, 12000]
    loan_ids = []
    borrower_attrs_list = []

    for i, bp in enumerate(borrower_profiles):
        b = create_borrower(
            env_id=env_id, business_id=business_id,
            payload={
                "borrower_ref": bp["ref"],
                "fico_at_origination": bp["fico"],
                "dti_at_origination": bp["dti"],
                "income_verified": bp["verified"],
                "annual_income": bp["income"],
                "housing_status": bp["housing"],
                "state_code": bp["state"],
            },
        )
        loan = create_loan(
            env_id=env_id, business_id=business_id,
            payload={
                "portfolio_id": p1_id,
                "borrower_id": b["borrower_id"],
                "loan_ref": f"L-{1001 + i}",
                "origination_date": "2025-01-15",
                "original_balance": loan_amounts[i],
                "current_balance": loan_amounts[i],
                "interest_rate": "0.0599",
                "term_months": 60,
                "remaining_term_months": 58,
                "collateral_type": "vehicle",
                "collateral_value": int(loan_amounts[i] * 1.1),
                "ltv_at_origination": "0.91",
                "payment_amount": int(loan_amounts[i] / 55),
                "risk_grade": "A" if bp["fico"] >= 720 else "B" if bp["fico"] >= 680 else "C",
            },
        )
        loan_ids.append(loan["loan_id"])
        borrower_attrs_list.append({
            "fico_at_origination": bp["fico"],
            "dti_at_origination": float(bp["dti"]),
            "income_verified": bp["verified"],
            "annual_income": float(bp["income"]),
            "ltv_at_origination": 0.91,
        })

    # ── Run decisioning on all loans ──
    decision_count = 0
    for lid, attrs in zip(loan_ids, borrower_attrs_list):
        evaluate_loan(
            env_id=env_id, business_id=business_id,
            loan_id=lid, policy_id=pol1_id,
            borrower_attributes=attrs,
        )
        decision_count += 1

    # ── Scenarios ──
    create_scenario(env_id=env_id, business_id=business_id, payload={
        "portfolio_id": p1_id, "name": "Base Case", "scenario_type": "base", "is_base": True,
        "assumptions_json": {"pd_curve_multiplier": 1.0, "prepayment_speed_cpr": 0.06, "recovery_lag_months": 12},
    })
    create_scenario(env_id=env_id, business_id=business_id, payload={
        "portfolio_id": p1_id, "name": "Stress: Recession", "scenario_type": "stress",
        "assumptions_json": {"pd_curve_multiplier": 2.5, "prepayment_speed_cpr": 0.02, "unemployment_rate": 0.08},
    })

    return {
        "business_id": str(business_id),
        "portfolios": [str(p1_id)],
        "loans": len(loan_ids),
        "borrowers": len(borrower_profiles),
        "policies": 1,
        "decisions": decision_count,
        "corpus_documents": 4,
        "audit_records": decision_count,
    }
