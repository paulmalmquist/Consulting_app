#!/usr/bin/env python3
"""Generate a deploy receipt artifact from a live backend.

Usage:
    python scripts/generate_deploy_receipt.py https://api.example.com [--cookie "..."]

Produces a JSON receipt at artifacts/deploy-receipts/<timestamp>-<sha>.json
"""
import argparse
import json
import os
import sys
import time
import urllib.request
import urllib.error


def _get(url: str, cookie: str = "", timeout: int = 15) -> tuple[int, dict | str]:
    headers: dict[str, str] = {}
    if cookie:
        headers["Cookie"] = cookie
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            body = resp.read().decode()
            try:
                return resp.status, json.loads(body)
            except Exception:
                return resp.status, body
    except urllib.error.HTTPError as exc:
        body = exc.read().decode()
        try:
            return exc.code, json.loads(body)
        except Exception:
            return exc.code, body


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate deploy receipt")
    parser.add_argument("base_url", help="Backend base URL")
    parser.add_argument("--cookie", default="", help="Auth cookie")
    parser.add_argument("--env", default=os.environ.get("RAILWAY_ENVIRONMENT", "unknown"),
                        help="Environment name")
    args = parser.parse_args()

    base = args.base_url.rstrip("/")
    ts = time.strftime("%Y%m%dT%H%M%SZ", time.gmtime())

    receipt: dict = {
        "timestamp": ts,
        "environment": args.env,
        "base_url": base,
    }

    # Readiness
    status, data = _get(f"{base}/health/ready", cookie=args.cookie)
    receipt["readiness_status"] = status
    if isinstance(data, dict):
        receipt["git_sha"] = data.get("git_sha")
        receipt["db_fingerprint"] = data.get("db_fingerprint")
        receipt["db_connected"] = data.get("db_connected")
        receipt["schema_contract_ok"] = data.get("schema_contract_ok")
        receipt["schema_issues"] = data.get("schema_issues", [])
        receipt["migration_head_in_code"] = data.get("migration_head_in_code")
        receipt["assistant_boot_enabled"] = data.get("assistant_boot_enabled")
        receipt["ready"] = data.get("ready", False)
    else:
        receipt["readiness_raw"] = str(data)[:500]
        receipt["ready"] = False

    # Winston readiness (may require auth)
    status, data = _get(f"{base}/api/ai/gateway/winston-readiness", cookie=args.cookie)
    receipt["winston_readiness_status"] = status
    if isinstance(data, dict):
        receipt["winston_ok"] = data.get("ok")
        receipt["winston_issues"] = data.get("issues", [])
    else:
        receipt["winston_readiness_raw"] = str(data)[:500]

    # Determine output path
    sha_short = (receipt.get("git_sha") or "unknown")[:8]
    out_dir = os.path.join(os.path.dirname(__file__), "..", "..", "artifacts", "deploy-receipts")
    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, f"{ts}-{sha_short}.json")

    with open(out_path, "w") as f:
        json.dump(receipt, f, indent=2)

    print(f"Deploy receipt written to: {out_path}")
    print(json.dumps(receipt, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
