from __future__ import annotations

from app.assistant_runtime.meridian_structured_capabilities import (
    find_meridian_capability,
    list_meridian_structured_capabilities,
)
from app.assistant_runtime.meridian_structured_runtime import _parse_contract
from app.services.metric_inventory import build_help_examples, build_metric_inventory_response
from app.services.unified_metric_registry import UnifiedMetricRegistry


def test_every_runtime_capability_exists_in_inventory():
    registry = UnifiedMetricRegistry([])
    response = build_metric_inventory_response(
        business_id="a1b2c3d4-0001-0001-0001-000000000001",
        env_id="a1b2c3d4-0001-0001-0003-000000000001",
        registry=registry,
    )
    inventory_keys = {item["metric_key"] for item in response["platform_metrics"]} | {
        item["metric_key"] for item in response["meridian_askable_metrics"]
    }

    for capability in list_meridian_structured_capabilities():
        assert capability.inventory_key in inventory_keys


def test_every_meridian_askable_entry_is_backed_by_runtime_matrix():
    registry = UnifiedMetricRegistry([])
    response = build_metric_inventory_response(
        business_id="a1b2c3d4-0001-0001-0001-000000000001",
        env_id="a1b2c3d4-0001-0001-0003-000000000001",
        registry=registry,
    )

    for entry in response["meridian_askable_metrics"]:
        capability = find_meridian_capability(inventory_key=entry["metric_key"])
        assert capability is not None
        assert set(entry["supported_transformations_meridian"]) == set(capability.supported_transformations)


def test_every_askable_metric_has_a_runtime_prompt_case():
    prompts = {
        "fund_list": "give me a rundown of the funds",
        "performance_family": "summarize each funds performance",
        "gross_irr": "list investments by gross IRR descending as of 2026Q1",
        "asset_count": "how many total assets are there in the portfolio",
        "total_commitments": "how much do we have in total commitments",
        "noi_variance": "which have an NOI variance of -5% or worse",
        "occupancy": "which assets have occupancy above 90%",
    }

    for inventory_key, prompt in prompts.items():
        contract, _memory_used = _parse_contract(message=prompt, structured_state={})
        assert contract is not None
        capability = find_meridian_capability(inventory_key=inventory_key)
        assert capability is not None
        if contract.metric:
            assert contract.metric in capability.runtime_metric_keys
        if contract.fact:
            assert contract.fact in capability.runtime_fact_keys
        assert contract.transformation in capability.supported_transformations


def test_help_examples_are_generated_from_inventory_entries():
    registry = UnifiedMetricRegistry([])
    response = build_metric_inventory_response(
        business_id="a1b2c3d4-0001-0001-0001-000000000001",
        env_id="a1b2c3d4-0001-0001-0003-000000000001",
        registry=registry,
    )

    for entry in response["meridian_askable_metrics"]:
        assert build_help_examples(entry)
