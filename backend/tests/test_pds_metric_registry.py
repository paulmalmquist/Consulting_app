"""Sub-Phase 2A — metric registry metadata + definition endpoint shape."""
from __future__ import annotations

from app.services.pds_executive import metric_registry


def test_registry_exposes_governance_fields_for_every_metric():
    for name, definition in metric_registry.iter_metrics():
        metadata = definition.to_metadata()
        # Definition panel requires each of these to be non-empty.
        assert metadata["definition"], f"{name} missing definition"
        assert metadata["supported_grains"], f"{name} missing supported_grains"
        assert metadata["source_tables"], f"{name} missing source_tables"
        assert metadata["validation_checks"], f"{name} missing validation_checks"
        assert metadata["tolerance_class"] in {"exact", "currency", "percentage"}


def test_every_metric_supports_portfolio_grain_or_declares_narrower_scope():
    # At minimum, the hero-tile metrics must work at the top-level portfolio grain.
    hero_metrics = {"total_managed", "net_variance", "directional_delta", "accounts_at_risk", "posture"}
    for name in hero_metrics:
        d = metric_registry.get_metric(name)
        assert "portfolio" in d.supported_grains, f"{name} must support portfolio grain"


def test_compute_fn_points_at_metric_functions_module():
    for _, definition in metric_registry.iter_metrics():
        assert definition.compute_fn.__module__.endswith("metric_functions")
