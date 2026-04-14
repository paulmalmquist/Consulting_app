"""Sub-Phase 2C — grain enforcement across registry + overview."""
from __future__ import annotations

from uuid import uuid4

import pytest

from app.services.pds_executive import metric_registry, orchestrator
from app.services.pds_executive.filter_normalizer import (
    FilterValidationError,
    SUPPORTED_GRAINS,
    normalize_filters,
)
from app.services.pds_executive.metric_functions import MetricReceipt, MetricResult


def test_supported_grains_covers_all_axes():
    assert set(SUPPORTED_GRAINS) == {"portfolio", "account", "project", "issue"}


def test_filter_normalizer_rejects_unsupported_grain():
    with pytest.raises(FilterValidationError, match="grain"):
        normalize_filters(env_id=uuid4(), business_id=uuid4(), grain="region")


def test_registry_rejects_unsupported_grain_for_metric():
    posture = metric_registry.get_metric("posture")
    # posture only supports portfolio — account must fail.
    nf = normalize_filters(env_id=uuid4(), business_id=uuid4(), grain="account")
    with pytest.raises(ValueError, match="does not support grain"):
        posture.compute(cur=None, nf=nf)


def test_overview_embeds_grain_in_top_level_and_in_receipt(fake_cursor, monkeypatch):
    fake_cursor.push_result([{"open_queue": 0, "critical_queue": 0, "high_queue": 0}])
    fake_cursor.push_result([{"open_signals": 0, "high_signals": 0}])
    fake_cursor.push_result([])

    def _stub(cur, nf):
        return MetricResult(
            metric="stub",
            value=0,
            grain=nf.grain,
            receipt=MetricReceipt(
                sql="-- stub",
                params=[],
                filters=nf.as_receipt_filters(),
                timestamp="stub",
                grain=nf.grain,
            ),
        )

    for name in ("total_managed", "net_variance", "directional_delta", "accounts_at_risk", "posture"):
        monkeypatch.setattr(metric_registry.get_metric(name), "compute_fn", _stub)

    payload = orchestrator.get_overview(
        env_id=uuid4(), business_id=uuid4(), grain="account"
    )
    assert payload["grain"] == "account"
    # every metric's receipt carries the requested grain (posture falls back to portfolio)
    for name, result in payload["metrics"].items():
        assert result["receipt"]["grain"] in {"account", "portfolio"}, (
            f"{name} receipt missing grain"
        )
