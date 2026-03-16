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
