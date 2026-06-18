"""Exercise the governed dispatch path against the stage Gemma endpoint, and print evidence.

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


def main() -> int:
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
    print("[providers] gemma available:", provider_registry.available(ProviderName.GEMMA_GCP))

    req = AIRequest(task="Summarize: loader retried 3x then OOM.", mode=TaskMode.SUMMARIZATION, risk_level=RiskLevel.LOW)
    d = select_provider(req)
    print(f"[route] summarization/low -> {d.status.value} / {d.selected_provider.value if d.selected_provider else None}")

    captured: dict = {}
    receipts_mod.record_decision = lambda **kw: (captured.update(kw) or "stage-receipt-id")  # capture, no prod write
    r = run_dispatch(req)
    print(f"[run] -> status={r.status.value} provider={r.provider.value if r.provider else None} latency_ms={r.latency_ms}")
    print(f"[run] answer (first 160): {(r.answer or '')[:160]!r}")
    if captured:
        print(f"[receipt] decision_type={captured.get('decision_type')} model_used={captured.get('model_used')} tags={captured.get('tags')}")
        no_answer = (r.answer or "X") not in json.dumps(captured.get("output_summary") or {})
        print(f"[receipt] raw answer NOT in output_summary: {no_answer}")

    import app.config as cfg
    good = cfg.GEMMA_VERTEX_ENDPOINT_ID
    cfg.GEMMA_VERTEX_ENDPOINT_ID = "0000000000000000000"
    rbad = run_dispatch(AIRequest(task="x", mode=TaskMode.SUMMARIZATION, risk_level=RiskLevel.LOW))
    print(f"[fail-closed] bad endpoint -> {rbad.status.value}/{rbad.null_reason.value if rbad.null_reason else None}")
    cfg.GEMMA_VERTEX_ENDPOINT_ID = good

    hi = select_provider(AIRequest(task="x", mode=TaskMode.SUMMARIZATION, risk_level=RiskLevel.HIGH))
    code = select_provider(AIRequest(task="x", mode=TaskMode.CODE, risk_level=RiskLevel.LOW, forced_provider=ProviderName.GEMMA_GCP))
    sens = select_provider(AIRequest(task="x", mode=TaskMode.SUMMARIZATION, risk_level=RiskLevel.LOW, privacy=Privacy.SENSITIVE))
    print(f"[policy] gemma blocked: high={hi.rejected.get('gemma_gcp')} code={code.null_reason.value if code.null_reason else None} sensitive={sens.rejected.get('gemma_gcp')}")
    print("=== STAGE RUN COMPLETE ===")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
