#!/usr/bin/env python3
"""Post-deploy smoke test for Winston companion.

Validates the full conversation lifecycle: readiness → conversation create →
first message → response quality. Catches both bootstrap failures and
degraded responses ("Not available in the current context", etc.).

Usage:
    python scripts/smoke_companion_boot.py
    python scripts/smoke_companion_boot.py https://custom-backend.example.com
    python scripts/smoke_companion_boot.py --env-id UUID --business-id UUID

Exits 0 if all checks pass, 1 if any fail.
"""
import argparse
import json
import sys
import time
import urllib.request
import urllib.error

# ── Defaults ────────────────────────────────────────────────────────────────
DEFAULT_BASE_URL = "https://authentic-sparkle-production-7f37.up.railway.app"
DEFAULT_BUSINESS_ID = "a1b2c3d4-0001-0001-0001-000000000001"
DEFAULT_ENV_ID = "a1b2c3d4-0001-0001-0003-000000000001"

# Prompts that should produce real answers, not degraded responses.
# Each prompt tests a different capability path through the assistant runtime.
SMOKE_PROMPTS = [
    {
        "message": "Give me a summary of the funds",
        "expect_healthy": True,
        "tests": "fund lookup via structured precheck",
    },
    {
        "message": "How many funds are in this environment?",
        "expect_healthy": True,
        "tests": "entity count lookup",
    },
    {
        "message": "What can you help me with?",
        "expect_healthy": True,
        "tests": "general capability / meta question (should never degrade)",
    },
]

# Known degraded response messages that indicate a quality failure
DEGRADED_MESSAGES = {
    "Not available in the current context.",
    "Context not available.",
    "Context is ambiguous.",
    "The requested action is not allowed in the current mode.",
    "A required tool failed during execution.",
    "Winston could not determine the task type for this request.",
}


def _req(url: str, *, method: str = "GET", body: dict | None = None,
         headers: dict | None = None, timeout: int = 30) -> tuple[int, str]:
    hdrs: dict[str, str] = headers.copy() if headers else {}
    data = None
    if body is not None:
        hdrs["Content-Type"] = "application/json"
        data = json.dumps(body).encode()
    req = urllib.request.Request(url, data=data, headers=hdrs, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.status, resp.read().decode()
    except urllib.error.HTTPError as exc:
        return exc.code, exc.read().decode()


def _parse_sse(raw: str) -> list[dict]:
    """Parse SSE text into a list of {event, data} dicts."""
    events: list[dict] = []
    current_event = "message"
    current_data: list[str] = []
    for line in raw.split("\n"):
        if line.startswith("event:"):
            current_event = line.split(":", 1)[1].strip()
        elif line.startswith("data:"):
            current_data.append(line.split(":", 1)[1].strip())
        elif line == "" and current_data:
            data_str = "\n".join(current_data)
            try:
                data = json.loads(data_str)
            except Exception:
                data = data_str
            events.append({"event": current_event, "data": data})
            current_event = "message"
            current_data = []
    return events


def _extract_turn_receipt(events: list[dict]) -> dict | None:
    for evt in events:
        if evt["event"] == "done" and isinstance(evt["data"], dict):
            return evt["data"].get("turn_receipt")
    return None


def _extract_response_blocks(events: list[dict]) -> list[dict]:
    blocks = []
    for evt in events:
        if evt["event"] == "response_block" and isinstance(evt["data"], dict):
            blocks.append(evt["data"].get("block", evt["data"]))
    # Also check done event for response_blocks
    for evt in events:
        if evt["event"] == "done" and isinstance(evt["data"], dict):
            done_blocks = evt["data"].get("response_blocks", [])
            if done_blocks and not blocks:
                blocks = done_blocks
    return blocks


def _extract_token_text(events: list[dict]) -> str:
    parts = []
    for evt in events:
        if evt["event"] == "token" and isinstance(evt["data"], dict):
            parts.append(evt["data"].get("text", ""))
    return "".join(parts)


def _check_response_quality(events: list[dict]) -> dict:
    """Analyze SSE events for response quality. Returns a quality report."""
    report: dict = {
        "healthy": False,
        "event_types": [e["event"] for e in events],
        "issues": [],
    }

    # Check basic event flow
    event_types = set(report["event_types"])
    if "done" not in event_types:
        report["issues"].append("No 'done' event — stream may have terminated early")
        return report

    # Extract turn receipt
    receipt = _extract_turn_receipt(events)
    if receipt:
        report["status"] = receipt.get("status")
        report["degraded_reason"] = receipt.get("degraded_reason")
        report["lane"] = receipt.get("lane")
        report["skill_id"] = receipt.get("skill", {}).get("skill_id") if receipt.get("skill") else None
        report["dispatch_confidence"] = receipt.get("dispatch", {}).get("normalized", {}).get("confidence")
    else:
        report["issues"].append("No turn_receipt in done event")
        return report

    # Extract trace
    for evt in events:
        if evt["event"] == "done" and isinstance(evt["data"], dict):
            trace = evt["data"].get("trace", {})
            report["execution_path"] = trace.get("execution_path")
            report["elapsed_ms"] = trace.get("elapsed_ms")
            report["response_block_count"] = trace.get("response_block_count", 0)
            runtime = trace.get("runtime", {})
            report["runtime_degraded"] = runtime.get("degraded", False)
            report["tools_enabled"] = runtime.get("tools_enabled", False)
            report["rag_enabled"] = runtime.get("rag_enabled", False)
            report["model"] = trace.get("model")
            break

    # Check for degraded status
    if report.get("status") == "degraded":
        reason = report.get("degraded_reason", "unknown")
        report["issues"].append(f"Response degraded: {reason}")
        return report

    if report.get("status") == "failed":
        report["issues"].append("Response failed")
        return report

    if report.get("runtime_degraded"):
        report["issues"].append("Runtime reports degraded=true despite status not being 'degraded'")

    # Check for degraded text content
    token_text = _extract_token_text(events)
    response_blocks = _extract_response_blocks(events)
    report["token_text_length"] = len(token_text)
    report["response_blocks_received"] = len(response_blocks)

    # Check for known degraded messages in blocks or tokens
    all_text = token_text
    for block in response_blocks:
        if isinstance(block, dict):
            all_text += " " + (block.get("markdown", "") or block.get("message", ""))
    for degraded_msg in DEGRADED_MESSAGES:
        if degraded_msg in all_text:
            report["issues"].append(f"Degraded response text: '{degraded_msg}'")

    # Check for empty response
    if not token_text.strip() and not response_blocks:
        report["issues"].append("Empty response — no tokens and no response blocks")

    if not report["issues"]:
        report["healthy"] = True

    return report


def main() -> int:
    parser = argparse.ArgumentParser(description="Winston companion smoke test")
    parser.add_argument("base_url", nargs="?", default=DEFAULT_BASE_URL,
                        help=f"Backend base URL (default: {DEFAULT_BASE_URL})")
    parser.add_argument("--business-id", default=DEFAULT_BUSINESS_ID)
    parser.add_argument("--env-id", default=DEFAULT_ENV_ID)
    parser.add_argument("--cookie", default="", help="Auth cookie string")
    parser.add_argument("--json-only", action="store_true", help="Output only JSON receipt")
    args = parser.parse_args()

    base = args.base_url.rstrip("/")
    hdrs: dict[str, str] = {"x-bm-actor": "deploy-smoke-test"}
    if args.cookie:
        hdrs["Cookie"] = args.cookie

    receipt: dict = {
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "base_url": base,
        "business_id": args.business_id,
        "env_id": args.env_id,
        "steps": {},
    }

    def _log(msg: str):
        if not args.json_only:
            print(msg)

    all_passed = True

    # ── Step 1: Readiness ────────────────────────────────────────────────
    _log("[1/5] Checking readiness...")
    status, body = _req(f"{base}/health/ready", headers=hdrs)
    step = {"status": status}
    try:
        step["data"] = json.loads(body)
    except Exception:
        step["data"] = body[:500]
    receipt["steps"]["readiness"] = step
    if status != 200:
        _log(f"  FAIL: /health/ready returned {status}")
        all_passed = False
    else:
        _log(f"  PASS: ready=true, startup={step['data'].get('startup_duration_ms', '?')}ms")

    # ── Step 2: Winston schema readiness ─────────────────────────────────
    _log("[2/5] Checking Winston schema contract...")
    status, body = _req(f"{base}/api/ai/gateway/winston-readiness", headers=hdrs)
    step = {"status": status}
    try:
        step["data"] = json.loads(body)
    except Exception:
        step["data"] = body[:500]
    receipt["steps"]["winston_readiness"] = step
    if status != 200 or not (isinstance(step["data"], dict) and step["data"].get("ok")):
        _log(f"  FAIL: Winston schema not ready")
        issues = step["data"].get("issues", []) if isinstance(step["data"], dict) else []
        for issue in issues:
            _log(f"    - {issue}")
        all_passed = False
    else:
        _log(f"  PASS: schema ok, {len(step['data'].get('missing_columns', []))} missing columns")

    # ── Step 3: Conversation create ──────────────────────────────────────
    _log("[3/5] Creating conversation...")
    status, body = _req(
        f"{base}/api/ai/gateway/conversations",
        method="POST",
        body={
            "business_id": args.business_id,
            "env_id": args.env_id,
            "thread_kind": "general",
            "launch_source": "deploy_smoke_test",
            "context_summary": "Automated post-deploy smoke test",
        },
        headers=hdrs,
    )
    step = {"status": status}
    try:
        step["data"] = json.loads(body)
    except Exception:
        step["data"] = body[:500]
    receipt["steps"]["conversation_create"] = step

    if status != 200:
        _log(f"  FAIL: conversation create returned {status}")
        error_code = None
        if isinstance(step["data"], dict):
            detail = step["data"].get("detail", {})
            if isinstance(detail, dict):
                error_code = detail.get("error_code")
                _log(f"    error_code: {error_code}")
                _log(f"    message: {detail.get('message', '?')}")
        all_passed = False
    else:
        conv_id = step["data"].get("conversation_id", "?")
        _log(f"  PASS: conversation {conv_id}")

    # ── Step 4: Send prompts and check quality ───────────────────────────
    conv_id = None
    if isinstance(receipt["steps"].get("conversation_create", {}).get("data"), dict):
        conv_id = receipt["steps"]["conversation_create"]["data"].get("conversation_id")

    prompt_results = []
    if conv_id and all_passed:
        for i, prompt_spec in enumerate(SMOKE_PROMPTS, 1):
            _log(f"[4/5] Sending prompt {i}/{len(SMOKE_PROMPTS)}: \"{prompt_spec['message']}\"...")
            t0 = time.monotonic()
            status, body = _req(
                f"{base}/api/ai/gateway/ask",
                method="POST",
                body={
                    "message": prompt_spec["message"],
                    "business_id": args.business_id,
                    "env_id": args.env_id,
                    "conversation_id": conv_id,
                },
                headers=hdrs,
                timeout=90,
            )
            elapsed_ms = int((time.monotonic() - t0) * 1000)

            result: dict = {
                "prompt": prompt_spec["message"],
                "status": status,
                "elapsed_ms": elapsed_ms,
            }

            if status != 200:
                result["passed"] = False
                result["issue"] = f"HTTP {status}"
                _log(f"  FAIL: /ask returned {status}")
                all_passed = False
            else:
                events = _parse_sse(body)
                quality = _check_response_quality(events)
                result["quality"] = quality
                result["passed"] = quality["healthy"]

                if quality["healthy"]:
                    _log(f"  PASS: healthy response in {elapsed_ms}ms")
                    _log(f"    status={quality.get('status')} lane={quality.get('lane')} "
                         f"skill={quality.get('skill_id')} blocks={quality.get('response_block_count', 0)}")
                else:
                    _log(f"  FAIL: degraded response in {elapsed_ms}ms")
                    for issue in quality.get("issues", []):
                        _log(f"    - {issue}")
                    all_passed = False

            prompt_results.append(result)
    else:
        if not conv_id:
            _log("[4/5] Skipped (no conversation)")
        else:
            _log("[4/5] Skipped (prior step failed)")

    receipt["steps"]["prompts"] = prompt_results

    # ── Step 5: Summary ─────────────────────────────────────────────────
    receipt["result"] = "PASS" if all_passed else "FAIL"
    receipt["passed"] = all_passed

    healthy_count = sum(1 for r in prompt_results if r.get("passed"))
    total_count = len(prompt_results)

    _log(f"[5/5] Summary")
    _log(f"  Readiness:           {'PASS' if receipt['steps'].get('readiness', {}).get('status') == 200 else 'FAIL'}")
    _log(f"  Schema contract:     {'PASS' if receipt['steps'].get('winston_readiness', {}).get('data', {}).get('ok') else 'FAIL'}")
    _log(f"  Conversation create: {'PASS' if receipt['steps'].get('conversation_create', {}).get('status') == 200 else 'FAIL'}")
    _log(f"  Response quality:    {healthy_count}/{total_count} prompts healthy")
    _log(f"  Overall:             {receipt['result']}")
    _log("")

    print(json.dumps(receipt, indent=2))
    return 0 if all_passed else 1


if __name__ == "__main__":
    sys.exit(main())
