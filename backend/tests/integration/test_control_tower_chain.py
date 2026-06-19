"""Integration: signed-receipt hash chain against a real Postgres (auto-skips without one).

Exercises the parts a mock can't: the per-env advisory lock + UNIQUE(env_id, chain_seq) backstop, real
signature/hash verification through the DB, tamper detection, and fork rejection. Requires the tel_ct_*
schema (migration 10020) — skips if absent, so the standard unit run is unaffected.
"""
from __future__ import annotations

import uuid

import psycopg
import pytest

from app.services.control_tower import signing

BIZ = "000000000000000000000000000000aa"
_BIZ = str(uuid.UUID(BIZ))


def _schema_present(conn) -> bool:
    with conn.cursor() as cur:
        cur.execute("SELECT to_regclass('public.tel_ct_receipt')")
        return cur.fetchone()["to_regclass"] is not None


def _sign(env_id, seq_decision_id):
    return signing.sign_decision(
        env_id=env_id, business_id=_BIZ, decision_id=seq_decision_id,
        run_key="run-it", channel_name="D-4", verdict="NO_GO",
        anomaly_score=3.1, threshold=0.135, dispatch_provider="gemma_gcp",
        dispatch_model="gemma-3-1b-it", routing_reason="sensitive -> private tier",
        dispatch_request_id="req-it", human_decision="reject", human_rationale="redline",
        resolved_by="op", cost_estimate_usd=0.0, resolved_at_iso="2026-06-18T00:00:00+00:00",
    )


def test_chain_signs_verifies_and_rejects_forks(db_conn):
    if not _schema_present(db_conn):
        pytest.skip("tel_ct_* schema not migrated in this DB")

    env_id = f"ct-it-{uuid.uuid4().hex[:8]}"
    try:
        r1 = _sign(env_id, str(uuid.uuid4()))
        r2 = _sign(env_id, str(uuid.uuid4()))
        assert r1["chain_seq"] == 1 and r1["prev_receipt_hash"] is None
        assert r2["chain_seq"] == 2 and r2["prev_receipt_hash"] == r1["payload_hash"]

        v = signing.verify_receipt(env_id=env_id, business_id=_BIZ, receipt_id=r2["id"])
        assert v["valid"] is True and v["chain_intact"] is True and v["signature_valid"] is True

        # Tamper the stored canonical payload → verification must fail.
        with db_conn.cursor() as cur:
            cur.execute(
                "UPDATE tel_ct_receipt SET payload_canonical = payload_canonical || ' ' WHERE id = %s",
                (r2["id"],),
            )
        db_conn.commit()
        v2 = signing.verify_receipt(env_id=env_id, business_id=_BIZ, receipt_id=r2["id"])
        assert v2["valid"] is False and v2["hash_valid"] is False

        # Fork attempt: a second receipt claiming chain_seq=2 must be rejected by UNIQUE(env_id, chain_seq).
        with pytest.raises(psycopg.errors.UniqueViolation):
            with db_conn.cursor() as cur:
                cur.execute(
                    """INSERT INTO tel_ct_receipt
                         (env_id, business_id, decision_id, chain_seq, prev_receipt_hash,
                          payload_hash, payload, payload_canonical, signature, public_key_id, algo)
                       VALUES (%s,%s,%s,2,%s,'x','{}'::jsonb,'x','x',%s,'ed25519')""",
                    (env_id, _BIZ, str(uuid.uuid4()), r1["payload_hash"], signing.public_key_id()),
                )
            db_conn.commit()
        db_conn.rollback()
    finally:
        with db_conn.cursor() as cur:
            cur.execute("DELETE FROM tel_ct_receipt WHERE env_id = %s", (env_id,))
        db_conn.commit()
