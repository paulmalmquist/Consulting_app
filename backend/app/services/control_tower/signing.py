"""Ed25519-signed, SHA-256 hash-chained decision receipts.

Tamper-evidence for go/no-go decisions. Signing happens server-side, outside the agent's trust
boundary — a compromised triage agent cannot forge or backdate a receipt. Each receipt links to the
previous one in the env's chain (``prev_receipt_hash``) and carries a monotonic ``chain_seq``; the
writer takes a per-env advisory lock so two concurrent signs cannot read the same chain head, and a
``UNIQUE(env_id, chain_seq)`` constraint is the hard backstop against forks.

The pure helpers (``canonical_json`` / ``payload_hash`` / ``sign`` / ``verify_signature``) take no DB
and are unit-tested directly. ``sign_decision`` / ``verify_receipt`` add the chain + persistence.

Honest limitation (surfaced in the UI): signed receipts are tamper-EVIDENT, not suppression-proof — a
log operator could still withhold a receipt. True assurance needs an append-only/witnessed log; that is
deferred (see the plan's Out-of-scope).
"""
from __future__ import annotations

import hashlib
import json
import logging
import os
from functools import lru_cache

from cryptography.hazmat.primitives.asymmetric.ed25519 import (
    Ed25519PrivateKey,
    Ed25519PublicKey,
)

from app.db import get_cursor

logger = logging.getLogger(__name__)

# Deterministic dev seed so signing/verify is fully functional locally without a configured secret.
# In production set CONTROL_TOWER_SIGNING_KEY (64 hex chars = 32-byte Ed25519 seed) to a real secret.
_DEV_SEED_LABEL = "control-tower-dev-signing-seed-v1"


@lru_cache(maxsize=1)
def _private_key() -> Ed25519PrivateKey:
    raw = os.getenv("CONTROL_TOWER_SIGNING_KEY", "").strip()
    if raw:
        try:
            seed = bytes.fromhex(raw)
            if len(seed) != 32:
                raise ValueError(f"expected 32-byte hex seed, got {len(seed)} bytes")
            return Ed25519PrivateKey.from_private_bytes(seed)
        except Exception as exc:  # noqa: BLE001 — bad key → fail loudly, do not silently fall back
            raise RuntimeError(f"CONTROL_TOWER_SIGNING_KEY is invalid: {exc}") from exc
    # No secret configured — derive a stable dev key and warn. Acceptable for the public-analog demo.
    logger.warning(
        "CONTROL_TOWER_SIGNING_KEY not set — using a deterministic DEV signing key. "
        "Receipts are verifiable but NOT secret. Set CONTROL_TOWER_SIGNING_KEY in production."
    )
    seed = hashlib.sha256(_DEV_SEED_LABEL.encode()).digest()
    return Ed25519PrivateKey.from_private_bytes(seed)


def _public_key() -> Ed25519PublicKey:
    return _private_key().public_key()


def public_key_hex() -> str:
    """The pinned public key (raw 32 bytes, hex) used to verify receipts."""
    from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat

    return _public_key().public_bytes(Encoding.Raw, PublicFormat.Raw).hex()


def public_key_id() -> str:
    """Short fingerprint of the pinned public key (sha256 of the raw key, first 16 hex)."""
    return hashlib.sha256(bytes.fromhex(public_key_hex())).hexdigest()[:16]


# ── pure helpers (no DB) ─────────────────────────────────────────────

def canonical_json(payload: dict) -> str:
    """Deterministic JSON: sorted keys, no whitespace. The exact string that is hashed + signed."""
    return json.dumps(payload, sort_keys=True, separators=(",", ":"), default=str)


def payload_hash(canonical: str) -> str:
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def sign(canonical: str) -> str:
    return _private_key().sign(canonical.encode("utf-8")).hex()


def verify_signature(canonical: str, signature_hex: str) -> bool:
    from cryptography.exceptions import InvalidSignature

    try:
        _public_key().verify(bytes.fromhex(signature_hex), canonical.encode("utf-8"))
        return True
    except (InvalidSignature, ValueError):
        return False


def build_payload(
    *,
    decision_id: str,
    env_id: str,
    business_id: str,
    run_key: str,
    channel_name: str,
    verdict: str,
    anomaly_score: float | None,
    threshold: float | None,
    dispatch_provider: str | None,
    dispatch_model: str | None,
    routing_reason: str | None,
    dispatch_request_id: str | None,
    human_decision: str,
    human_rationale: str | None,
    resolved_by: str,
    cost_estimate_usd: float | None,
    resolved_at_iso: str,
    chain_seq: int,
    prev_receipt_hash: str | None,
) -> dict:
    """The canonical receipt body. Floats are formatted as strings to keep the canonical form stable."""

    def _num(x: float | None) -> str | None:
        return None if x is None else repr(float(x))

    return {
        "schema": "tel_ct_receipt.v1",
        "decision_id": decision_id,
        "env_id": env_id,
        "business_id": business_id,
        "run_key": run_key,
        "channel_name": channel_name,
        "verdict": verdict,
        "anomaly_score": _num(anomaly_score),
        "threshold": _num(threshold),
        "dispatch": {
            "provider": dispatch_provider,
            "model": dispatch_model,
            "routing_reason": routing_reason,
            "request_id": dispatch_request_id,
        },
        "human_decision": human_decision,
        "human_rationale": human_rationale,
        "resolved_by": resolved_by,
        "cost_estimate_usd": _num(cost_estimate_usd),
        "resolved_at": resolved_at_iso,
        "chain_seq": chain_seq,
        "prev_receipt_hash": prev_receipt_hash,
    }


def _serialize_receipt(row: dict) -> dict:
    return {
        "id": str(row["id"]),
        "env_id": row["env_id"],
        "business_id": str(row["business_id"]),
        "decision_id": str(row["decision_id"]),
        "chain_seq": row["chain_seq"],
        "prev_receipt_hash": row["prev_receipt_hash"],
        "payload_hash": row["payload_hash"],
        "payload": row["payload"],
        "signature": row["signature"],
        "public_key_id": row["public_key_id"],
        "algo": row["algo"],
        "created_at": row["created_at"].isoformat() if row.get("created_at") else None,
    }


# ── DB-backed chain writer + verifier ────────────────────────────────

def sign_decision(
    *,
    env_id: str,
    business_id: str,
    decision_id: str,
    run_key: str,
    channel_name: str,
    verdict: str,
    anomaly_score: float | None,
    threshold: float | None,
    dispatch_provider: str | None,
    dispatch_model: str | None,
    routing_reason: str | None,
    dispatch_request_id: str | None,
    human_decision: str,
    human_rationale: str | None,
    resolved_by: str,
    cost_estimate_usd: float | None,
    resolved_at_iso: str,
) -> dict:
    """Append a signed, hash-chained receipt for a resolved decision. Returns the serialized receipt.

    Runs in one transaction holding a per-env advisory lock so concurrent signs serialize on the chain
    head; ``UNIQUE(env_id, chain_seq)`` is the backstop. ``get_cursor`` commits at block exit (releasing
    the xact lock)."""
    with get_cursor() as cur:
        # Serialize chain appends for this env. hashtext() → int4, implicitly widened to bigint.
        cur.execute("SELECT pg_advisory_xact_lock(hashtext(%s))", (f"tel_ct_chain:{env_id}",))
        cur.execute(
            "SELECT chain_seq, payload_hash FROM tel_ct_receipt "
            "WHERE env_id = %s ORDER BY chain_seq DESC LIMIT 1",
            (env_id,),
        )
        head = cur.fetchone()
        chain_seq = (head["chain_seq"] + 1) if head else 1
        prev_hash = head["payload_hash"] if head else None

        payload = build_payload(
            decision_id=decision_id, env_id=env_id, business_id=business_id, run_key=run_key,
            channel_name=channel_name, verdict=verdict, anomaly_score=anomaly_score, threshold=threshold,
            dispatch_provider=dispatch_provider, dispatch_model=dispatch_model,
            routing_reason=routing_reason, dispatch_request_id=dispatch_request_id,
            human_decision=human_decision, human_rationale=human_rationale, resolved_by=resolved_by,
            cost_estimate_usd=cost_estimate_usd, resolved_at_iso=resolved_at_iso,
            chain_seq=chain_seq, prev_receipt_hash=prev_hash,
        )
        canonical = canonical_json(payload)
        phash = payload_hash(canonical)
        signature = sign(canonical)

        cur.execute(
            """INSERT INTO tel_ct_receipt
                 (env_id, business_id, decision_id, chain_seq, prev_receipt_hash,
                  payload_hash, payload, payload_canonical, signature, public_key_id, algo)
               VALUES (%s,%s,%s,%s,%s,%s,%s::jsonb,%s,%s,%s,'ed25519')
               RETURNING *""",
            (env_id, business_id, decision_id, chain_seq, prev_hash,
             phash, json.dumps(payload), canonical, signature, public_key_id()),
        )
        return _serialize_receipt(cur.fetchone())


def verify_receipt(*, env_id: str, business_id: str, receipt_id: str) -> dict:
    """Recompute the hash, verify the signature against the pinned public key, and check chain linkage.

    Fail-closed: a missing receipt returns ``{"valid": false, "reason": "not_found"}``."""
    with get_cursor() as cur:
        cur.execute(
            "SELECT * FROM tel_ct_receipt WHERE id = %s AND env_id = %s AND business_id = %s",
            (receipt_id, env_id, business_id),
        )
        row = cur.fetchone()
        if row is None:
            return {"valid": False, "reason": "not_found"}

        canonical = row["payload_canonical"]
        recomputed = payload_hash(canonical)
        hash_valid = recomputed == row["payload_hash"]
        signature_valid = verify_signature(canonical, row["signature"])
        key_matches = row["public_key_id"] == public_key_id()

        # Chain linkage: prev_receipt_hash must equal the payload_hash of chain_seq-1 in this env.
        chain_intact = True
        chain_reason = None
        if row["chain_seq"] == 1:
            chain_intact = row["prev_receipt_hash"] is None
            if not chain_intact:
                chain_reason = "genesis_has_prev"
        else:
            cur.execute(
                "SELECT payload_hash FROM tel_ct_receipt WHERE env_id = %s AND chain_seq = %s",
                (env_id, row["chain_seq"] - 1),
            )
            prior = cur.fetchone()
            if prior is None:
                chain_intact = False
                chain_reason = "missing_prev_link"
            elif prior["payload_hash"] != row["prev_receipt_hash"]:
                chain_intact = False
                chain_reason = "prev_hash_mismatch"

        valid = hash_valid and signature_valid and key_matches and chain_intact
        return {
            "valid": valid,
            "receipt_id": str(row["id"]),
            "decision_id": str(row["decision_id"]),
            "chain_seq": row["chain_seq"],
            "hash_valid": hash_valid,
            "signature_valid": signature_valid,
            "key_matches": key_matches,
            "chain_intact": chain_intact,
            "chain_reason": chain_reason,
            "public_key_id": row["public_key_id"],
            "algo": row["algo"],
        }
