from app.assistant_runtime.degraded_responses import classified_retrieval_empty_blocks


def test_generic_unavailable_string_is_paired_with_reason_code():
    blocks, message = classified_retrieval_empty_blocks(
        unavailable_reason="null_metric",
        skill_id="rank_metric",
        entity_type="fund",
        entity_name="Fund VII",
    )

    assert "is not available in the environment data" in message
    assert "reason: null_metric" in message
    assert any(block["type"] == "unavailable_with_reason" and block["reason_code"] == "null_metric" for block in blocks)
