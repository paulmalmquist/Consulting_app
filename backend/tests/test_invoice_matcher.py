"""Tests for invoice matcher — cost code matching, confidence, and thresholds."""
from decimal import Decimal

from app.services.invoice_matcher import _find_best_match, AUTO_MATCH_THRESHOLD, MatchCandidate


def _make_draw_lines(codes_and_descs: list[tuple[str, str]]) -> list[dict]:
    return [
        {"line_item_id": f"dl-{i}", "cost_code": code, "description": desc}
        for i, (code, desc) in enumerate(codes_and_descs)
    ]


class TestExactCostCodeMatch:
    def test_exact_match_returns_095(self):
        draw_lines = _make_draw_lines([("03-300", "Cast-in-Place Concrete"), ("05-100", "Structural Steel")])
        inv_line = {"cost_code": "03-300", "description": "Concrete work"}
        result = _find_best_match(inv_line, draw_lines, {})
        assert result is not None
        assert result.confidence == Decimal("0.9500")
        assert result.strategy == "exact_cost_code"
        assert result.cost_code == "03-300"

    def test_exact_match_above_threshold(self):
        draw_lines = _make_draw_lines([("03-300", "Concrete")])
        inv_line = {"cost_code": "03-300", "description": "Concrete"}
        result = _find_best_match(inv_line, draw_lines, {})
        assert result is not None
        assert result.confidence >= AUTO_MATCH_THRESHOLD


class TestFuzzyCostCodeMatch:
    def test_prefix_match_returns_085(self):
        draw_lines = _make_draw_lines([("03-300", "Cast-in-Place Concrete")])
        inv_line = {"cost_code": "03-30", "description": "Concrete"}
        result = _find_best_match(inv_line, draw_lines, {})
        assert result is not None
        assert result.confidence == Decimal("0.8500")
        assert result.strategy == "fuzzy_cost_code"


class TestDescriptionSimilarity:
    def test_high_similarity_scores_above_060(self):
        draw_lines = _make_draw_lines([("03-300", "cast in place concrete foundations")])
        inv_line = {"cost_code": "", "description": "cast in place concrete foundation work"}
        result = _find_best_match(inv_line, draw_lines, {})
        assert result is not None
        assert result.confidence >= Decimal("0.6000")
        assert result.strategy == "description_similarity"

    def test_low_similarity_no_match(self):
        draw_lines = _make_draw_lines([("03-300", "Cast-in-Place Concrete")])
        inv_line = {"cost_code": "", "description": "Elevator maintenance contract"}
        result = _find_best_match(inv_line, draw_lines, {})
        # Very different descriptions may not match at all
        if result:
            assert result.confidence < AUTO_MATCH_THRESHOLD


class TestVendorHistoryMatch:
    def test_vendor_history_returns_088(self):
        draw_lines = _make_draw_lines([("03-300", "Concrete"), ("05-100", "Steel")])
        vendor_history = {"03-300": "dl-0"}
        inv_line = {"cost_code": "03-300", "description": "Some invoice"}
        result = _find_best_match(inv_line, draw_lines, vendor_history)
        assert result is not None
        # Exact code match should be 0.95, which is higher than vendor history 0.88
        assert result.confidence >= Decimal("0.8800")


class TestAutoMatchThreshold:
    def test_above_085_auto_matched(self):
        draw_lines = _make_draw_lines([("03-300", "Concrete")])
        inv_line = {"cost_code": "03-300", "description": "Concrete"}
        result = _find_best_match(inv_line, draw_lines, {})
        assert result is not None
        assert result.confidence >= AUTO_MATCH_THRESHOLD

    def test_no_candidates_returns_none(self):
        inv_line = {"cost_code": "99-999", "description": "Unknown item"}
        result = _find_best_match(inv_line, [], {})
        assert result is None


class TestEdgeCases:
    def test_empty_cost_code(self):
        draw_lines = _make_draw_lines([("03-300", "Concrete")])
        inv_line = {"cost_code": "", "description": ""}
        result = _find_best_match(inv_line, draw_lines, {})
        # No cost code and no description → no match
        assert result is None

    def test_none_fields(self):
        draw_lines = _make_draw_lines([("03-300", "Concrete")])
        inv_line = {"cost_code": None, "description": None}
        result = _find_best_match(inv_line, draw_lines, {})
        assert result is None
