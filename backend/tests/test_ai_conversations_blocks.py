from app.schemas.ai_gateway import MessageAppendRequest


def test_message_append_request_accepts_response_blocks_and_meta():
    payload = MessageAppendRequest.model_validate(
        {
            "role": "assistant",
            "content": "Here is your chart.",
            "response_blocks": [
                {
                    "type": "chart",
                    "block_id": "chart_1",
                    "chart_type": "line",
                    "title": "NOI Over Time",
                    "x_key": "month",
                    "y_keys": ["noi"],
                    "data": [{"month": "2026-01", "noi": 123}],
                }
            ],
            "message_meta": {"trace_id": "trace_123"},
        }
    )

    assert payload.response_blocks is not None
    assert payload.response_blocks[0]["type"] == "chart"
    assert payload.message_meta == {"trace_id": "trace_123"}
