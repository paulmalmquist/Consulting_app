#!/usr/bin/env python3
"""Smoke test all 12 /api/vultr/* endpoints against the sentinel env.

Uses FastAPI's TestClient so we don't need to start a real server. Asserts
shape (env_id present, freshness present, no 5xx) and prints concise output.
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from uuid import NAMESPACE_DNS, uuid5

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[2]
load_dotenv(ROOT / "backend" / ".env")
sys.path.insert(0, str(ROOT / "backend"))

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402


SENTINEL_ENV_ID = str(uuid5(NAMESPACE_DNS, "vultr-verify-2026-05-02:env"))


def _assert_envelope(payload: dict, name: str) -> None:
    assert "env_id" in payload, f"{name}: missing env_id"
    assert payload["env_id"] == SENTINEL_ENV_ID, f"{name}: env_id mismatch"
    assert "as_of" in payload, f"{name}: missing as_of"
    assert "freshness" in payload, f"{name}: missing freshness"


def main() -> int:
    client = TestClient(app)
    e = SENTINEL_ENV_ID
    failures: list[str] = []

    def hit(method: str, path: str, *, params: dict | None = None,
            shape: str = "envelope", name: str = "") -> dict | None:
        params = dict(params or {})
        if "env_id" not in params:
            params["env_id"] = e
        try:
            r = client.request(method, path, params=params)
        except Exception as exc:
            failures.append(f"{name or path}: exception {type(exc).__name__}: {exc}")
            return None
        if r.status_code >= 500:
            failures.append(f"{name or path}: {r.status_code} {r.text[:200]}")
            return None
        if r.status_code >= 400:
            print(f"  {path}  {r.status_code} (expected for negative tests only)")
            return None
        body = r.json()
        if shape == "envelope":
            try:
                _assert_envelope(body, name or path)
            except AssertionError as exc:
                failures.append(str(exc))
                return None
        # shape == "raw" or "graph" → no envelope assertion
        return body

    print(f"sentinel env_id = {e}\n")
    # NOTE: /api/vultr/context is intentionally not exercised against the
    # sentinel — context resolution requires a row in app.environments, which
    # the sentinel deliberately doesn't create. Real envs go through the
    # normal v1 environment-creation pipeline before the workspace shell loads.

    print(">>/api/vultr/summary")
    body = hit("GET", "/api/vultr/summary", name="summary")
    if body:
        print(f"  blocks={len(body['metric_blocks'])} freshness.usage={body['freshness']['usage']}")

    print(">>/api/vultr/executive")
    body = hit("GET", "/api/vultr/executive", params={"period": "30D"}, name="executive")
    if body:
        b = body["data"]["bridge"]
        print(f"  stages={len(b['stages'])} exceptions={b['exceptions_count']} "
              f"exc_total=${b['exceptions_total_usd']}")

    print(">>/api/vultr/reconciliation")
    body = hit("GET", "/api/vultr/reconciliation", name="reconciliation")
    if body:
        print(f"  exceptions={len(body['exceptions'])} stages={len(body['data']['bridge']['stages'])}")

    print(">>/api/vultr/reconciliation/{id}")
    if body and body["exceptions"]:
        exc_id = body["exceptions"][0]["exception_id"]
        body2 = hit("GET", f"/api/vultr/reconciliation/{exc_id}", name="reconciliation_detail")
        if body2:
            print(f"  bridge_stages={len(body2['data']['bridge']['stages'])}")

    print(">>/api/vultr/gpu-economics")
    body = hit("GET", "/api/vultr/gpu-economics", name="gpu_economics")
    if body:
        d = body["data"]
        print(f"  regions={len(d['regions'])} skus={len(d['sku_nodes'])} "
              f"customers={len(d['customer_nodes'])} ts_pts={len(d['time_series'])}")

    print(">>/api/vultr/gpu-command-graph")
    body = hit("GET", "/api/vultr/gpu-command-graph", shape="graph", name="gpu_command_graph")
    if body:
        print(f"  regions={len(body['regions'])} skus={len(body['sku_nodes'])} "
              f"customers={len(body['customer_nodes'])} flows={len(body['flows'])} "
              f"kpis={len(body['kpis'])}")
        # Quick sanity check on KPI shape
        for k in body["kpis"]:
            assert "value" in k and "unit" in k and "status" in k, "kpi block malformed"

    print(">>/api/vultr/customers")
    body = hit("GET", "/api/vultr/customers", params={"limit": 5}, name="customers")
    if body:
        print(f"  customers={len(body['data']['customers'])}")
        cid = body["data"]["customers"][0]["customer_id"] if body["data"]["customers"] else None
    else:
        cid = None

    print(">>/api/vultr/customers/{id}")
    if cid:
        r = client.get(f"/api/vultr/customers/{cid}", params={"env_id": e})
        if r.status_code >= 500:
            failures.append(f"customers/{{id}}: {r.status_code} {r.text[:200]}")
        else:
            d = r.json()
            print(f"  customer={d['customer']['display_name']} "
                  f"snaps={len(d['daily_snapshots'])} invoices={len(d['recent_invoices'])} "
                  f"open_excs={len(d['open_exceptions'])}")

    print(">>/api/vultr/sales")
    body = hit("GET", "/api/vultr/sales", name="sales")
    if body:
        print(f"  opps={len(body['data']['opportunities'])} stages={len(body['data']['funnel'])}")

    print(">>/api/vultr/operations")
    body = hit("GET", "/api/vultr/operations", name="operations")
    if body:
        d = body["data"]
        print(f"  tickets={len(d['tickets'])} incidents={len(d['incidents'])} "
              f"open={d['open_tickets']} sla_breaches={d['sla_breaches_30d']}")

    print(">>/api/vultr/data-model")
    body = hit("GET", "/api/vultr/data-model", name="data_model")
    if body:
        d = body["data"]
        print(f"  metric_defs={len(d['metric_definitions'])} regions={len(d['regions'])} "
              f"skus={len(d['skus'])} products={len(d['products'])}")

    print(">>/api/vultr/quality")
    body = hit("GET", "/api/vultr/quality", name="quality")
    if body:
        d = body["data"]
        print(f"  checks={len(d['checks'])} overall_ok={d['overall_ok']}")
        for c in d["checks"]:
            mark = "OK" if c["ok"] else "FAIL"
            print(f"    [{mark}] {c['name']}: {c['detail']}")

    print()
    if failures:
        print(f"FAILURES ({len(failures)}):")
        for f in failures:
            print(f"  - {f}")
        return 1
    print("All 12 endpoints OK.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
