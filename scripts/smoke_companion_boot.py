#!/usr/bin/env python3
"""Post-deploy smoke test for Winston companion bootstrap.

Usage:
    python scripts/smoke_companion_boot.py https://api.example.com --cookie "sb-access-token=..."

Runs:
  1. GET /health/ready — assert 200 + ready
  2. POST /api/ai/gateway/conversations — create conversation
  3. POST /api/ai/gateway/ask — send prompt, parse SSE, assert response

Prints a JSON receipt and exits 0 on success, 1 on failure.
"""
import argparse
import json
import sys
import time
import urllib.request
import urllib.error


def _req(url: str, *, method: str = "GET", body: dict | None = None,
         cookie: str = "", timeout: int = 30) -> tuple[int, str]:
    headers: dict[str, str] = {}
    if cookie:
        headers["Cookie"] = cookie
    data = None
    if body is not None:
        headers["Content-Type"] = "application/json"
        data = json.dumps(body).encode()
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.status, resp.read().decode()
    except urllib.error.HTTPError as exc:
        return exc.code, exc.read().decode()


def main() -> int:
    parser = argparse.ArgumentParser(description="Winston companion smoke test")
    parser.add_argument("base_url", help="Backend base URL (e.g. https://api.example.com)")
    parser.add_argument("--cookie", default="", help="Auth cookie string")
    parser.add_argument("--business-id", default="", help="Business UUID for conversation create")
    args = parser.parse_args()

    base = args.base_url.rstrip("/")
    receipt: dict = {"timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "base_url": base}
    passed = True

    # Step 1: Readiness
    print("[1/3] Checking readiness...")
    status, body = _req(f"{base}/health/ready", cookie=args.cookie)
    receipt["readiness_status"] = status
    try:
        receipt["readiness"] = json.loads(body)
    except Exception:
        receipt["readiness"] = body
    if status != 200:
        print(f"  FAIL: /health/ready returned {status}")
        passed = False
    else:
        print("  PASS: backend ready")

    # Step 2: Create conversation
    if args.business_id and passed:
        print("[2/3] Creating conversation...")
        status, body = _req(
            f"{base}/api/ai/gateway/conversations",
            method="POST",
            body={
                "business_id": args.business_id,
                "thread_kind": "general",
                "launch_source": "smoke_test",
                "context_summary": "Post-deploy smoke test",
            },
            cookie=args.cookie,
        )
        receipt["create_conversation_status"] = status
        try:
            receipt["conversation"] = json.loads(body)
        except Exception:
            receipt["conversation"] = body
        if status != 200:
            print(f"  FAIL: conversation create returned {status}")
            passed = False
        else:
            print(f"  PASS: conversation created ({receipt['conversation'].get('conversation_id', '?')})")

        # Step 3: Send first message
        if passed and isinstance(receipt.get("conversation"), dict):
            conv_id = receipt["conversation"]["conversation_id"]
            print("[3/3] Sending first prompt...")
            status, body = _req(
                f"{base}/api/ai/gateway/ask",
                method="POST",
                body={
                    "prompt": "What is your status?",
                    "business_id": args.business_id,
                    "conversation_id": conv_id,
                },
                cookie=args.cookie,
                timeout=60,
            )
            receipt["ask_status"] = status
            if status != 200:
                print(f"  FAIL: /ask returned {status}")
                passed = False
            else:
                events = [line for line in body.split("\n") if line.startswith("event:")]
                receipt["sse_events"] = [e.split(":", 1)[1].strip() for e in events]
                has_done = any("done" in e for e in receipt["sse_events"])
                if has_done:
                    print(f"  PASS: streamed response ({len(receipt['sse_events'])} events)")
                else:
                    print(f"  WARN: stream completed but no 'done' event found")
                    passed = False
    else:
        if not args.business_id:
            print("[2/3] Skipped (no --business-id provided)")
            print("[3/3] Skipped")
            receipt["note"] = "conversation smoke test skipped — no business_id"

    receipt["result"] = "PASS" if passed else "FAIL"
    print()
    print(json.dumps(receipt, indent=2))
    return 0 if passed else 1


if __name__ == "__main__":
    sys.exit(main())
