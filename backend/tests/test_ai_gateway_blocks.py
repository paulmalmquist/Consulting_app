from app.services.assistant_blocks import legacy_structured_result_to_blocks


def test_query_result_card_maps_to_table_and_chart_blocks():
    blocks = legacy_structured_result_to_blocks(
        "query_result",
        {
            "title": "Query Results",
            "table": {
                "columns": ["month", "noi", "budget_noi"],
                "rows": [
                    {"month": "2026-01", "noi": 120000, "budget_noi": 110000},
                    {"month": "2026-02", "noi": 118000, "budget_noi": 111500},
                ],
            },
            "columns": ["month", "noi", "budget_noi"],
            "rows": [
                {"month": "2026-01", "noi": 120000, "budget_noi": 110000},
                {"month": "2026-02", "noi": 118000, "budget_noi": 111500},
            ],
            "visualization_hint": "line",
            "metrics": [{"label": "Rows", "value": "2"}],
        },
    )

    assert any(block["type"] == "workflow_result" for block in blocks)
    assert any(block["type"] == "kpi_group" for block in blocks)
    assert any(block["type"] == "table" for block in blocks)
    chart = next(block for block in blocks if block["type"] == "chart")
    assert chart["chart_type"] == "line"
    assert chart["x_key"] == "month"
    assert chart["y_keys"] == ["noi", "budget_noi"]


def test_waterfall_memo_card_maps_sections_to_markdown_blocks():
    blocks = legacy_structured_result_to_blocks(
        "waterfall_memo",
        {
            "title": "Waterfall Memo",
            "sections": [
                {"title": "Scenario Assumptions", "content": "NOI falls by 10% and the exit cap expands by 75bps."},
            ],
        },
    )

    markdown_blocks = [block for block in blocks if block["type"] == "markdown_text"]
    assert markdown_blocks
    assert "Scenario Assumptions" in markdown_blocks[0]["markdown"]
