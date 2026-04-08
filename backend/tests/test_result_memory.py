from __future__ import annotations

from app.assistant_runtime.result_memory import (
    RESULT_MEMORY_SOURCE,
    build_bucketed_count_result_memory,
    build_list_result_memory,
    build_memory_scope,
    build_query_signature,
    compatible_result_memory_scope,
    extract_result_memory_from_prechecks,
    resolve_referential_followup,
)
from app.assistant_runtime.turn_receipts import StructuredPrecheckReceipt, StructuredPrecheckStatus


def _asset_result_memory() -> dict:
    scope = build_memory_scope(
        business_id="biz_123",
        environment_id="env_123",
        entity_type="fund",
        entity_id="fund_1",
        entity_name="Fund One",
    )
    return build_bucketed_count_result_memory(
        scope=scope,
        query_signature=build_query_signature(
            result_type="bucketed_count",
            source_name="asset_count",
            scope=scope,
        ),
        summary={
            "total": 5,
            "item_label": "property asset(s)",
            "bucket_counts": {"active": 2, "disposed": 1, "pipeline": 1, "other": 1},
        },
        rows=[
            {"id": "asset_1", "name": "Alpha", "entity_type": "asset", "status": "active", "bucket": "active"},
            {"id": "asset_2", "name": "Bravo", "entity_type": "asset", "status": "held", "bucket": "active"},
            {"id": "asset_3", "name": "Canal", "entity_type": "asset", "status": "disposed", "bucket": "disposed"},
            {"id": "asset_4", "name": "Delta", "entity_type": "asset", "status": "pipeline", "bucket": "pipeline"},
            {"id": "asset_5", "name": "Elm", "entity_type": "asset", "status": "paused", "bucket": "other"},
        ],
        bucket_members={
            "active": [
                {"id": "asset_1", "name": "Alpha", "entity_type": "asset", "status": "active", "bucket": "active"},
                {"id": "asset_2", "name": "Bravo", "entity_type": "asset", "status": "held", "bucket": "active"},
            ],
            "disposed": [
                {"id": "asset_3", "name": "Canal", "entity_type": "asset", "status": "disposed", "bucket": "disposed"},
            ],
            "pipeline": [
                {"id": "asset_4", "name": "Delta", "entity_type": "asset", "status": "pipeline", "bucket": "pipeline"},
            ],
            "other": [
                {"id": "asset_5", "name": "Elm", "entity_type": "asset", "status": "paused", "bucket": "other"},
            ],
        },
    )


def test_compatible_result_memory_scope_requires_business_environment_and_entity_match():
    result_memory = _asset_result_memory()

    assert compatible_result_memory_scope(
        result_memory,
        {
            "business_id": "biz_123",
            "environment_id": "env_123",
            "entity_type": "fund",
            "entity_id": "fund_1",
            "entity_name": "Fund One",
        },
    )
    assert not compatible_result_memory_scope(
        result_memory,
        {
            "business_id": "biz_other",
            "environment_id": "env_123",
            "entity_type": "fund",
            "entity_id": "fund_1",
            "entity_name": "Fund One",
        },
    )
    assert not compatible_result_memory_scope(
        result_memory,
        {
            "business_id": "biz_123",
            "environment_id": "env_other",
            "entity_type": "fund",
            "entity_id": "fund_1",
            "entity_name": "Fund One",
        },
    )
    assert not compatible_result_memory_scope(
        result_memory,
        {
            "business_id": "biz_123",
            "environment_id": "env_123",
            "entity_type": "fund",
            "entity_id": "fund_2",
            "entity_name": "Fund Two",
        },
    )


def test_resolve_referential_followup_uses_persisted_other_bucket():
    resolution = resolve_referential_followup(
        message="what are the names of the other 1",
        result_memory=_asset_result_memory(),
        current_scope={
            "business_id": "biz_123",
            "environment_id": "env_123",
            "entity_type": "fund",
            "entity_id": "fund_1",
            "entity_name": "Fund One",
        },
    )

    assert resolution.status == "resolved"
    assert resolution.bucket_name == "other"
    assert resolution.resolved_count == 1
    assert [row["name"] for row in resolution.rows] == ["Elm"]
    assert resolution.resolution_source == RESULT_MEMORY_SOURCE


def test_resolve_referential_followup_handles_not_active_from_saved_bucket_members():
    resolution = resolve_referential_followup(
        message="which ones are not active",
        result_memory=_asset_result_memory(),
        current_scope={
            "business_id": "biz_123",
            "environment_id": "env_123",
            "entity_type": "fund",
            "entity_id": "fund_1",
            "entity_name": "Fund One",
        },
    )

    assert resolution.status == "resolved"
    assert resolution.complement_of == "active"
    assert resolution.resolved_count == 3
    assert [row["name"] for row in resolution.rows] == ["Canal", "Delta", "Elm"]


def test_resolve_referential_followup_ignores_arbitrary_pronouns():
    resolution = resolve_referential_followup(
        message="what are their names again?",
        result_memory=_asset_result_memory(),
        current_scope={
            "business_id": "biz_123",
            "environment_id": "env_123",
            "entity_type": "fund",
            "entity_id": "fund_1",
            "entity_name": "Fund One",
        },
    )

    assert resolution.is_referential is False
    assert resolution.status == "not_referential"


def test_extract_result_memory_from_prechecks_returns_saved_structured_result():
    scope = build_memory_scope(
        business_id="biz_123",
        environment_id="env_123",
        entity_type="fund",
        entity_id="fund_1",
        entity_name="Fund One",
    )
    result_memory = build_list_result_memory(
        scope=scope,
        query_signature=build_query_signature(
            result_type="list",
            source_name="fund_holdings",
            scope=scope,
        ),
        summary={"total": 2, "item_label": "asset(s)"},
        rows=[
            {"id": "asset_1", "name": "Alpha", "entity_type": "asset"},
            {"id": "asset_2", "name": "Bravo", "entity_type": "asset"},
        ],
    )
    prechecks = [
        StructuredPrecheckReceipt(
            name="fund_holdings",
            source="repe.list_assets",
            status=StructuredPrecheckStatus.OK,
            scoped=True,
            result_count=2,
            evidence={"result_memory": result_memory},
        )
    ]

    extracted = extract_result_memory_from_prechecks(prechecks)

    assert extracted == result_memory
