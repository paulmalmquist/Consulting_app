from __future__ import annotations

from contextlib import contextmanager


class FakeCursor:
    def __init__(self):
        self.queries: list[str] = []
        self._fetchall_queue: list[list[dict]] = []

    def push_fetchall(self, rows: list[dict]):
        self._fetchall_queue.append(rows)
        return self

    def execute(self, sql: str, params=None):
        self.queries.append(sql.strip())

    def fetchall(self):
        if self._fetchall_queue:
            return self._fetchall_queue.pop(0)
        return []


@contextmanager
def cursor_ctx(cursor: FakeCursor):
    yield cursor


def test_winston_readiness_flags_missing_columns_and_indexes(monkeypatch):
    from app.services import winston_readiness as readiness

    fake = FakeCursor()
    fake.push_fetchall(
        [
            {"column_name": "conversation_id"},
            {"column_name": "business_id"},
            {"column_name": "env_id"},
            {"column_name": "title"},
            {"column_name": "created_at"},
            {"column_name": "updated_at"},
            {"column_name": "archived"},
        ]
    )
    fake.push_fetchall([])

    monkeypatch.setattr(readiness, "get_cursor", lambda: cursor_ctx(fake))
    monkeypatch.setattr(readiness, "AI_GATEWAY_ENABLED", True)
    monkeypatch.setattr(
        readiness,
        "load_winston_launch_surface_contract",
        lambda: {
            "schema_version_marker": readiness.WINSTON_SCHEMA_VERSION_MARKER,
            "surfaces": [
                {
                    "id": "re_fund_detail",
                    "route_pattern": "^/lab/env/[^/]+/re/funds/[^/]+(?:/|$)",
                    "surface": "fund_detail",
                    "thread_kind": "contextual",
                    "scope_type": "fund",
                    "required_context_fields": ["ui.route"],
                    "launch_source": "winston_companion_contextual",
                    "entity_selection_required": True,
                    "expected_degraded_behavior": "degrade precisely",
                }
            ],
        },
    )

    result = readiness.get_winston_readiness()

    assert result.ok is False
    assert "thread_kind" in result.missing_columns
    assert "idx_ai_conversations_business_thread_kind" in result.missing_indexes
    assert result.supported_launch_surface_ids == ["re_fund_detail"]


def test_validate_winston_launch_surface_contract_rejects_bad_shapes():
    from app.services import winston_readiness as readiness

    issues = readiness.validate_winston_launch_surface_contract(
        {
            "schema_version_marker": "wrong_version",
            "surfaces": [
                {
                    "id": "duplicate",
                    "route_pattern": "^/x$",
                    "surface": "x",
                    "thread_kind": "weird",
                    "scope_type": "mystery",
                    "required_context_fields": [],
                    "launch_source": "x",
                    "entity_selection_required": False,
                    "expected_degraded_behavior": "x",
                },
                {
                    "id": "duplicate",
                    "route_pattern": "^/y$",
                    "surface": "y",
                    "thread_kind": "general",
                    "scope_type": "environment",
                    "required_context_fields": ["ui.route"],
                    "launch_source": "y",
                    "entity_selection_required": False,
                    "expected_degraded_behavior": "y",
                },
            ],
        }
    )

    assert any("schema_version_marker" in issue for issue in issues)
    assert any("unsupported thread_kind" in issue for issue in issues)
    assert any("unsupported scope_type" in issue for issue in issues)
    assert any("Duplicate launch surface id" in issue for issue in issues)
