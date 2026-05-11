"""Smoke test for Trading Analytics Copilot.

Requires the backend to be running and the trading demo migration/seed to be
applied. Frontend checks are optional and run when --frontend-url is supplied.
"""

from __future__ import annotations

import argparse
import json
import sys
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen


def request_json(url: str, method: str = "GET", body: dict | None = None) -> dict:
    payload = json.dumps(body).encode("utf-8") if body is not None else None
    req = Request(
        url,
        data=payload,
        method=method,
        headers={"Content-Type": "application/json", "X-BM-Actor": "smoke_trading_analytics"},
    )
    with urlopen(req, timeout=20) as response:
        return json.loads(response.read().decode("utf-8"))


def request_text(url: str) -> str:
    with urlopen(url, timeout=20) as response:
        return response.read().decode("utf-8", errors="replace")


def assert_true(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def main() -> int:
    parser = argparse.ArgumentParser(description="Smoke Trading Analytics Copilot.")
    parser.add_argument("--backend-url", default="http://localhost:8000")
    parser.add_argument("--frontend-url", default=None)
    parser.add_argument("--env-id", required=True)
    args = parser.parse_args()

    backend = args.backend_url.rstrip("/")
    env_id = args.env_id
    try:
        health = request_json(f"{backend}/api/trading/v1/environments/{env_id}/health")
        assert_true("layers" in health, "health response missing layers")
        assert_true(any(layer.get("name") == "Bronze" for layer in health["layers"]), "health missing Bronze layer")
        print("health ok")

        qs = urlencode({"symbol": "HH_GAS", "lookback_years": "5"})
        seasonality = request_json(f"{backend}/api/trading/v1/environments/{env_id}/seasonality?{qs}")
        assert_true("available" in seasonality, "seasonality response missing availability")
        print(f"seasonality ok available={seasonality.get('available')}")

        regression = request_json(
            f"{backend}/api/trading/v1/environments/{env_id}/regression",
            method="POST",
            body={
                "dependent_symbol": "WTI",
                "factor_symbols": ["DXY_PROXY", "UST10Y", "VIX", "CRUDE_INVENTORY_PROXY"],
                "lookback_days": 756,
            },
        )
        assert_true("available" in regression, "regression response missing availability")
        print(f"regression ok available={regression.get('available')}")

        if args.frontend_url:
            frontend = args.frontend_url.rstrip("/")
            page = request_text(f"{frontend}/lab/env/{env_id}/trading")
            for needle in [
                "Energy Trading Command Center",
                "Pipeline Health",
                "Seasonality",
                "Rolling Correlation",
                "Decision Memo",
            ]:
                assert_true(needle in page, f"frontend page missing {needle!r}")
            print("frontend route ok")
    except (AssertionError, HTTPError, URLError, TimeoutError) as exc:
        print(f"smoke failed: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
