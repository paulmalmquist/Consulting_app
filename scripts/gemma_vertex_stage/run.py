"""Exercise the governed dispatch path against the stage Gemma endpoint, and print evidence.

WHAT THIS FILE DOES (in plain language)
    Proves the deployed Gemma endpoint actually works AND that the safety rules around it hold.
    It sends one real request through the same routing code the live app uses, prints what
    happened, and captures the "receipt" (a record of the call) WITHOUT writing it to the real
    production audit log. Then it checks the guardrails: a broken endpoint should fail safely,
    and Gemma should stay BLOCKED for high-risk, code, and sensitive-privacy requests.

WHERE YOU SEE THIS
    Operator verification script. The routing it exercises is the same logic the Control Tower
    page relies on when it decides whether to send triage to the private Gemma tier.

INPUTS -> OUTPUT
    INPUTS:  ~/.gemma-stage-state.json (written by deploy.py) + Google credentials.
    OUTPUT:  printed evidence lines (provider availability, the routing decision, run status,
             receipt summary, and the four guardrail checks). No production data is written.

HOW TO READ IT
    * dispatch  = the governed router that picks WHICH model handles a request and records a
      receipt proving what it did.
    * fail-closed = if something isn't fully/correctly configured, the system returns UNAVAILABLE
      rather than guessing. -> the "bad endpoint" check below confirms this.
    * "receipt" here = a redacted record of the call (decision + model used + tags), deliberately
      WITHOUT the raw answer, so logs never leak sensitive content.

Usage:
    GOOGLE_APPLICATION_CREDENTIALS=~/.gcp-stage-sa.json \\
      python -m scripts.gemma_vertex_stage.run

Reads ~/.gemma-stage-state.json (from deploy.py). Real Gemma call. The receipt CONTENT is
captured, NOT written to the production audit log, so production stays untouched. Verifies:
providers-available, route-selects-Gemma, run-SUCCESS, receipt content (no raw answer), fail-closed
on a bad endpoint, and that Gemma stays blocked for high-risk/code/sensitive.
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
STATE = Path(os.path.expanduser("~/.gemma-stage-state.json"))


# Wire the backend to the deployed endpoint, send one real request, capture its receipt, then
# run the four guardrail checks and print evidence of each.
def main() -> int:
    # No state file means deploy.py never ran (or was torn down) — nothing to test against.
    if not STATE.exists():
        print(f"no state file at {STATE} — run deploy.py first", file=sys.stderr)
        return 2
    st = json.loads(STATE.read_text())

    sys.path.insert(0, str(ROOT / "backend"))
    # Stage env — set BEFORE importing app.config (it caches os.getenv at import).
    os.environ["GEMMA_VERTEX_PROJECT_ID"] = st["project"]
    os.environ["GEMMA_VERTEX_LOCATION"] = st["location"]
    os.environ["GEMMA_VERTEX_ENDPOINT_ID"] = st["endpoint_id"]
    if st.get("dedicated_dns"):
        os.environ["GEMMA_VERTEX_DEDICATED_DNS"] = st["dedicated_dns"]
    # Turn execution on for this run, and feed harmless placeholder DB/Supabase values so the
    # backend modules import cleanly — this script never touches a real database.
    os.environ["AI_DISPATCH_ENABLED"] = "true"
    os.environ.setdefault("DATABASE_URL", "postgresql://placeholder:placeholder@localhost:5432/placeholder")
    os.environ.setdefault("SUPABASE_URL", "https://placeholder.supabase.co")
    os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "placeholder")

    from app.services.ai_dispatch import receipts as receipts_mod
    from app.services.ai_dispatch.models import AIRequest, DispatchStatus, Privacy, ProviderName, RiskLevel, TaskMode
    from app.services.ai_dispatch.policy import select_provider
    from app.services.ai_dispatch.registry import provider_registry
    from app.services.ai_dispatch.supervisor import run_dispatch

    print(f"=== STAGE endpoint {st['endpoint_id']} ({st['project']}/{st['location']}) ===")
    # Check 1: is the Gemma provider registered and usable at all?
    print("[providers] gemma available:", provider_registry.available(ProviderName.GEMMA_GCP))

    # Check 2: a low-risk summarize request should ROUTE to Gemma. select_provider only decides
    # the route (no model call yet); we print which provider it picked.
    req = AIRequest(task="Summarize: loader retried 3x then OOM.", mode=TaskMode.SUMMARIZATION, risk_level=RiskLevel.LOW)
    d = select_provider(req)
    print(f"[route] summarization/low -> {d.status.value} / {d.selected_provider.value if d.selected_provider else None}")

    # Check 3: actually run the request. We swap in a fake recorder that CAPTURES the receipt in
    # memory instead of writing to the production audit log, so this test leaves prod untouched.
    captured: dict = {}
    receipts_mod.record_decision = lambda **kw: (captured.update(kw) or "stage-receipt-id")  # capture, no prod write
    r = run_dispatch(req)
    print(f"[run] -> status={r.status.value} provider={r.provider.value if r.provider else None} latency_ms={r.latency_ms}")
    print(f"[run] answer (first 160): {(r.answer or '')[:160]!r}")
    if captured:
        # Confirm the receipt records the decision but does NOT contain the raw answer text —
        # this is the privacy guarantee that lets us log every call safely.
        print(f"[receipt] decision_type={captured.get('decision_type')} model_used={captured.get('model_used')} tags={captured.get('tags')}")
        no_answer = (r.answer or "X") not in json.dumps(captured.get("output_summary") or {})
        print(f"[receipt] raw answer NOT in output_summary: {no_answer}")

    # Check 4 (fail-closed): point the config at a bogus endpoint id, run again, and confirm the
    # system returns a safe UNAVAILABLE/null_reason instead of guessing. Then restore the real id.
    # -> in the live app this same path is what makes the Control Tower show its fail-closed state.
    import app.config as cfg
    good = cfg.GEMMA_VERTEX_ENDPOINT_ID
    cfg.GEMMA_VERTEX_ENDPOINT_ID = "0000000000000000000"
    rbad = run_dispatch(AIRequest(task="x", mode=TaskMode.SUMMARIZATION, risk_level=RiskLevel.LOW))
    print(f"[fail-closed] bad endpoint -> {rbad.status.value}/{rbad.null_reason.value if rbad.null_reason else None}")
    cfg.GEMMA_VERTEX_ENDPOINT_ID = good

    # Check 5 (policy guardrails): Gemma must stay BLOCKED for high-risk, code, and sensitive
    # requests. These are decisions only (no model call); we just confirm each one is refused.
    hi = select_provider(AIRequest(task="x", mode=TaskMode.SUMMARIZATION, risk_level=RiskLevel.HIGH))
    code = select_provider(AIRequest(task="x", mode=TaskMode.CODE, risk_level=RiskLevel.LOW, forced_provider=ProviderName.GEMMA_GCP))
    sens = select_provider(AIRequest(task="x", mode=TaskMode.SUMMARIZATION, risk_level=RiskLevel.LOW, privacy=Privacy.SENSITIVE))
    print(f"[policy] gemma blocked: high={hi.rejected.get('gemma_gcp')} code={code.null_reason.value if code.null_reason else None} sensitive={sens.rejected.get('gemma_gcp')}")
    print("=== STAGE RUN COMPLETE ===")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
