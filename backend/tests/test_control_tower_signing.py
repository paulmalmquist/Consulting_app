"""Ed25519 signing/verify — pure crypto round-trip + tamper detection (no DB)."""
from __future__ import annotations

from app.services.control_tower import signing


def _payload():
    return signing.build_payload(
        decision_id="dec-1", env_id="env-1", business_id="biz-1", run_key="run-1",
        channel_name="D-4", verdict="NO_GO", anomaly_score=3.1, threshold=0.135,
        dispatch_provider="gemma_gcp", dispatch_model="gemma-3-1b-it",
        routing_reason="sensitive -> private tier", dispatch_request_id="req-1",
        human_decision="reject", human_rationale="redline breach", resolved_by="operator",
        cost_estimate_usd=0.0, resolved_at_iso="2026-06-18T00:00:00+00:00",
        chain_seq=1, prev_receipt_hash=None,
    )


def test_sign_verify_roundtrip():
    canonical = signing.canonical_json(_payload())
    sig = signing.sign(canonical)
    assert signing.verify_signature(canonical, sig) is True


def test_tampered_payload_fails_verification():
    canonical = signing.canonical_json(_payload())
    sig = signing.sign(canonical)
    tampered = canonical.replace('"NO_GO"', '"GO"')
    assert tampered != canonical
    assert signing.verify_signature(tampered, sig) is False


def test_tampered_signature_fails():
    canonical = signing.canonical_json(_payload())
    sig = signing.sign(canonical)
    # flip the last hex nibble
    bad = sig[:-1] + ("0" if sig[-1] != "0" else "1")
    assert signing.verify_signature(canonical, bad) is False


def test_canonical_hash_is_stable_and_order_independent():
    p1 = _payload()
    p2 = dict(reversed(list(p1.items())))  # same content, different insertion order
    assert signing.payload_hash(signing.canonical_json(p1)) == signing.payload_hash(
        signing.canonical_json(p2)
    )


def test_public_key_id_is_16_hex():
    kid = signing.public_key_id()
    assert len(kid) == 16
    int(kid, 16)  # parses as hex
