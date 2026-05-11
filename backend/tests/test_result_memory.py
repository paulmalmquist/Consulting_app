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


# ── PR 8a — qualifier + attribute-lookup clusters ──────────────────────
#
# Tests grouped by the three named pattern clusters so the resolver
# can't quietly drift into a regex junk drawer.

from app.assistant_runtime.result_memory import (  # noqa: E402
    _ATTRIBUTE_WHITELIST,
    _normalize_attrs,
    _parse_intent,
    build_attribute_lookup_response_text,
)


# Cluster 1: qualifier-phrase ─────────────────────────────────────────


def test_pr8a_qualifier_of_the_ones_without_statuses() -> None:
    intent = _parse_intent("of the ones without statuses")
    assert intent is not None
    assert intent.matched_pattern == "qualifier_noncanonical_status"
    assert intent.bucket_name == "other"
    assert intent.meaning == "noncanonical_status"
    assert intent.requested_attributes == []


def test_pr8a_qualifier_those_without_a_status() -> None:
    intent = _parse_intent("those without a status")
    assert intent is not None
    assert intent.matched_pattern == "qualifier_noncanonical_status"
    assert intent.bucket_name == "other"
    assert intent.meaning == "noncanonical_status"


def test_pr8a_qualifier_which_ones_dont_have_a_status() -> None:
    """Apostrophe and bare 'dont' forms must match."""
    for msg in (
        "which ones don't have a status",
        "which ones dont have a status",
    ):
        intent = _parse_intent(msg)
        assert intent is not None, f"failed: {msg!r}"
        assert intent.matched_pattern == "qualifier_noncanonical_status"
        assert intent.meaning == "noncanonical_status"


def test_pr8a_qualifier_ones_that_have_no_status() -> None:
    intent = _parse_intent("the ones that have no status")
    assert intent is not None
    assert intent.matched_pattern == "qualifier_noncanonical_status"


def test_pr8a_qualifier_bare_of_those() -> None:
    intent = _parse_intent("of those")
    assert intent is not None
    assert intent.matched_pattern == "qualifier_bare_reference"
    assert intent.use_all_rows is True
    assert intent.meaning is None


# Cluster 2: attribute-phrase ─────────────────────────────────────────


def test_pr8a_attribute_what_sector_are_they() -> None:
    intent = _parse_intent("what sector are they in")
    assert intent is not None
    assert intent.matched_pattern == "attribute_lookup"
    assert intent.use_all_rows is True
    assert intent.requested_attributes == ["property_type"]


def test_pr8a_attribute_whats_their_market_and_property_type() -> None:
    intent = _parse_intent("what's their market and property type")
    assert intent is not None
    assert intent.matched_pattern == "attribute_lookup"
    assert intent.requested_attributes == ["market", "property_type"]


def test_pr8a_attribute_show_me_their_property_type() -> None:
    intent = _parse_intent("show me their property type")
    assert intent is not None
    assert intent.matched_pattern == "attribute_lookup"
    assert intent.requested_attributes == ["property_type"]


def test_pr8a_attribute_sector_and_fund_for_those() -> None:
    intent = _parse_intent("sector and fund for those")
    assert intent is not None
    assert intent.matched_pattern == "attribute_lookup"
    assert intent.requested_attributes == ["property_type", "fund"]


def test_pr8a_attribute_whitelist_rejects_unknown() -> None:
    """Unknown attribute words drop out — _parse_intent returns None so
    the LLM path takes over rather than halting on a misclassification."""
    assert _parse_intent("how do trade winds work") is None
    assert _parse_intent("what zodiac are they") is None


# Cluster 3: combined (qualifier + attribute on the same message) ──────


def test_pr8a_combined_qualifier_plus_attribute() -> None:
    """The production-failing prompt from conversation 94eaed94 turn 4.
    Qualifier resolves to bucket=other AND the attribute phrase
    contributes requested_attributes."""
    intent = _parse_intent(
        "of the ones without statuses, what sector are they in"
    )
    assert intent is not None
    assert intent.matched_pattern == "qualifier_noncanonical_status"
    assert intent.bucket_name == "other"
    assert intent.meaning == "noncanonical_status"
    assert intent.requested_attributes == ["property_type"]


# Whitelist + synonym map ─────────────────────────────────────────────


def test_pr8a_synonym_sector_maps_to_property_type() -> None:
    assert _ATTRIBUTE_WHITELIST["sector"] == "property_type"
    assert _ATTRIBUTE_WHITELIST["property type"] == "property_type"


def test_pr8a_synonym_fund_in_whitelist() -> None:
    """`fund` is IN the PR 8a whitelist because the authoritative
    attribution source is the same repe_asset → repe_deal → repe_fund
    join `list_property_assets` uses (verified precondition). If a
    future PR moves fund to a different source, update both whitelist
    and this test together."""
    assert _ATTRIBUTE_WHITELIST.get("fund") == "fund"


def test_pr8a_normalize_attrs_strips_and_dedupes() -> None:
    assert _normalize_attrs("sector and market") == ["property_type", "market"]
    assert _normalize_attrs("sector, market, sector") == ["property_type", "market"]
    assert _normalize_attrs("their fund") == ["fund"]
    assert _normalize_attrs("") == []
    assert _normalize_attrs("blah") == []


# Response-text formatting ────────────────────────────────────────────


def test_pr8a_response_meaning_noncanonical_status() -> None:
    """meaning=noncanonical_status → intro reads 'with a non-canonical
    status', NEVER 'without a status'. The data lives in the `other`
    bucket — claiming NULL is misleading."""
    text = build_attribute_lookup_response_text(
        rows=[
            {"name": "Tech Campus North", "property_type": "office"},
            {"name": "Phoenix Gateway Medical Office", "property_type": "healthcare"},
        ],
        requested_attributes=["property_type"],
        meaning="noncanonical_status",
        scope_label="Meridian Capital Management",
    )
    assert "non-canonical status" in text
    assert "without a status" not in text
    assert "Tech Campus North" in text
    assert "property type: office" in text


def test_pr8a_response_multi_attribute_per_row() -> None:
    text = build_attribute_lookup_response_text(
        rows=[
            {"name": "X", "market": "Austin", "property_type": "office"},
            {"name": "Y", "market": "Phoenix", "property_type": "healthcare"},
        ],
        requested_attributes=["market", "property_type"],
        meaning=None,
        scope_label="Test scope",
    )
    assert "market: Austin, property type: office" in text
    assert "market: Phoenix, property type: healthcare" in text


def test_pr8a_response_handles_null_attribute_values() -> None:
    text = build_attribute_lookup_response_text(
        rows=[{"name": "Z", "market": None, "property_type": ""}],
        requested_attributes=["market", "property_type"],
        meaning=None,
        scope_label="Test scope",
    )
    assert "market: n/a" in text
    assert "property type: n/a" in text


def test_pr8a_response_empty_rows() -> None:
    text = build_attribute_lookup_response_text(
        rows=[],
        requested_attributes=["property_type"],
        meaning="noncanonical_status",
        scope_label="Test scope",
    )
    assert "no rows matched" in text.lower()


# Integration: resolver carries attrs + meaning through to resolution ──


def _pr8a_bucketed_result_memory() -> dict:
    return {
        "result_type": "bucketed_count",
        "scope": {
            "business_id": "biz-1",
            "environment_id": "env-1",
            "entity_type": "environment",
            "entity_id": "env-1",
            "entity_name": "Test Meridian",
        },
        "summary": {
            "total": 40,
            "bucket_counts": {"active": 30, "disposed": 6, "pipeline": 0, "other": 4},
            "primary_bucket": "active",
            "remainder_count": 10,
        },
        "rows": [],
        "bucket_members": {
            "active": [],
            "disposed": [],
            "pipeline": [],
            "other": [
                {"id": "asset-1", "name": "Tech Campus North", "entity_type": "asset", "bucket": "other"},
                {"id": "asset-2", "name": "Tech Campus South Building", "entity_type": "asset", "bucket": "other"},
                {"id": "asset-3", "name": "Phoenix Gateway Medical Office", "entity_type": "asset", "bucket": "other"},
                {"id": "asset-4", "name": "Westgate Student Housing", "entity_type": "asset", "bucket": "other"},
            ],
        },
    }


def test_pr8a_resolver_passes_through_attributes_and_meaning() -> None:
    """The user's 4-turn failure: after the asset-count produced the
    bucketed memory, turn 4 'of the ones without statuses, what sector
    are they in' resolves to status=resolved + bucket=other + 4 rows +
    requested_attributes=[property_type] + meaning=noncanonical_status,
    so the request_lifecycle attribute-lookup branch can fire."""
    rm = _pr8a_bucketed_result_memory()
    resolution = resolve_referential_followup(
        message="of the ones without statuses, what sector are they in",
        result_memory=rm,
        current_scope=rm["scope"],
    )
    assert resolution.is_referential is True
    assert resolution.status == "resolved"
    assert resolution.bucket_name == "other"
    assert resolution.resolved_count == 4
    assert resolution.requested_attributes == ["property_type"]
    assert resolution.meaning == "noncanonical_status"
    assert len(resolution.rows) == 4
    assert resolution.rows[0]["name"] == "Tech Campus North"


def test_pr8a_resolver_scope_mismatch_still_carries_attrs() -> None:
    rm = _pr8a_bucketed_result_memory()
    other_scope = {
        "business_id": "different-biz",
        "environment_id": "env-1",
        "entity_type": "environment",
        "entity_id": "env-1",
        "entity_name": "Other",
    }
    resolution = resolve_referential_followup(
        message="of the ones without statuses, what sector are they in",
        result_memory=rm,
        current_scope=other_scope,
    )
    assert resolution.status == "scope_mismatch"
    assert resolution.requested_attributes == ["property_type"]
    assert resolution.meaning == "noncanonical_status"


def test_pr8a_resolver_no_memory_still_carries_attrs() -> None:
    resolution = resolve_referential_followup(
        message="of the ones without statuses, what sector are they in",
        result_memory=None,
        current_scope={
            "business_id": "biz-1",
            "environment_id": "env-1",
            "entity_type": "environment",
            "entity_id": "env-1",
            "entity_name": "X",
        },
    )
    assert resolution.status == "no_memory"
    assert resolution.requested_attributes == ["property_type"]
