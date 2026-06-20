"""Contract and safety tests for the reviewed telemetry metadata graph."""
from __future__ import annotations

import json
from contextlib import contextmanager
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

import pytest

from app.services import telemetry_metadata as metadata_svc


ENV_ID = "telemetry-demo"
BUSINESS_ID = uuid4()
TENANT_ID = uuid4()
CATALOG_PATH = (
    Path(__file__).resolve().parents[1]
    / "app"
    / "data"
    / "telemetry"
    / "metadata_catalog.json"
)


def _catalog_dict() -> dict:
    return json.loads(CATALOG_PATH.read_text(encoding="utf-8"))


def _node(graph: dict, object_name: str) -> dict:
    return next(node for node in graph["nodes"] if node.get("object_name") == object_name)


def _assert_no_sensitive_content(value) -> None:
    forbidden_keys = {
        "api_key",
        "connection_string",
        "credential",
        "credentials",
        "database_url",
        "password",
        "query",
        "raw_row",
        "raw_rows",
        "secret",
        "service_role",
        "service_role_key",
        "sql",
        "token",
    }
    if isinstance(value, dict):
        assert not forbidden_keys.intersection(key.lower() for key in value)
        for child in value.values():
            _assert_no_sensitive_content(child)
    elif isinstance(value, list):
        for child in value:
            _assert_no_sensitive_content(child)
    elif isinstance(value, str):
        lowered = value.lower()
        assert "postgresql://" not in lowered
        assert "postgres://" not in lowered
        assert "private key" not in lowered


def test_committed_catalog_is_reviewed_telemetry_only():
    catalog = metadata_svc.load_catalog()

    assert catalog.domain == "telemetry"
    assert catalog.environment == ENV_ID
    assert catalog.nodes
    assert catalog.edges
    assert all(node.domain == "telemetry" for node in catalog.nodes)
    assert all(
        node.schema in {
            None,
            "public",
            "novendor_1.telemetry",
            "novendor_1.rs_factory",
            "rs_factory_seed",
        }
        for node in catalog.nodes
    )
    assert all(
        node.schema != "public" or node.object_name.startswith("tel_")
        for node in catalog.nodes
    )
    _assert_no_sensitive_content(catalog.model_dump(mode="json"))


def test_graph_contract_and_stats_are_derived_from_returned_graph():
    graph = metadata_svc.build_metadata_graph(
        env_id=ENV_ID,
        business_id=BUSINESS_ID,
        enrich_postgres=False,
    )

    assert set(graph) == {
        "generated_at",
        "env_id",
        "environment",
        "status",
        "warnings",
        "nodes",
        "edges",
        "stats",
    }
    assert graph["env_id"] == ENV_ID
    assert graph["environment"] == ENV_ID
    assert graph["status"] == "ok"
    assert graph["warnings"] == []
    assert graph["stats"] == {
        "source_count": sum(
            node["layer"] == "source" or node["kind"] in {"source", "stream"}
            for node in graph["nodes"]
        ),
        "bronze_count": sum(node["layer"] == "bronze" for node in graph["nodes"]),
        "silver_count": sum(node["layer"] == "silver" for node in graph["nodes"]),
        "gold_count": sum(node["layer"] == "gold" for node in graph["nodes"]),
        "metric_count": sum(node["kind"] == "metric" for node in graph["nodes"]),
        "model_count": sum(node["kind"] == "model" for node in graph["nodes"]),
        "dashboard_count": sum(
            node["kind"] in {"dashboard", "report"} for node in graph["nodes"]
        ),
        "edge_count": len(graph["edges"]),
        "unavailable_count": sum(
            node["status"] in {"missing", "quarantined"}
            or node["metadata"].get("available") is False
            for node in graph["nodes"]
        ),
    }
    assert any(edge["confidence"] == "inferred" for edge in graph["edges"])
    _assert_no_sensitive_content(graph)


@pytest.mark.parametrize(
    "mutate",
    [
        lambda raw: raw["nodes"].append(deepcopy(raw["nodes"][0])),
        lambda raw: raw["nodes"].append({
            **deepcopy(next(node for node in raw["nodes"] if node.get("schema"))),
            "id": "duplicate_object",
        }),
        lambda raw: raw["edges"].append(deepcopy(raw["edges"][0])),
        lambda raw: raw["edges"].append(
            {**deepcopy(raw["edges"][0]), "id": "duplicate_lineage"}
        ),
    ],
    ids=["node-id", "object-definition", "edge-id", "lineage-definition"],
)
def test_catalog_rejects_duplicate_definitions(mutate):
    raw = _catalog_dict()
    mutate(raw)

    with pytest.raises(metadata_svc.MetadataCatalogError, match="duplicate"):
        metadata_svc.validate_catalog(raw)


def test_catalog_rejects_dangling_lineage():
    raw = _catalog_dict()
    raw["edges"][0]["target"] = "missing_node"

    with pytest.raises(metadata_svc.MetadataCatalogError, match="dangling"):
        metadata_svc.validate_catalog(raw)


def test_catalog_rejects_unconnected_nodes():
    raw = _catalog_dict()
    raw["nodes"].append(
        {
            "id": "source_unconnected",
            "label": "Unconnected telemetry source",
            "kind": "source",
            "layer": "source",
            "confidence": "explicit",
            "metadata": {"source_references": ["RS_DEMO_CAPABILITY_CHECKLIST.md"]},
            "domain": "telemetry",
        }
    )

    with pytest.raises(metadata_svc.MetadataCatalogError, match="unconnected"):
        metadata_svc.validate_catalog(raw)


@pytest.mark.parametrize(
    ("mutation", "message"),
    [
        (
            lambda raw: raw["nodes"][0]["metadata"].update(
                {"sql": "select * from public.business"}
            ),
            "Unsafe",
        ),
        (
            lambda raw: raw["nodes"][0]["metadata"].update(
                {"endpoint": "postgresql://user:password@host/database"}
            ),
            "Sensitive",
        ),
        (
            lambda raw: raw["nodes"][0].update(
                {"schema": "public", "object_name": "business"}
            ),
            "telemetry prefix",
        ),
        (
            lambda raw: raw["nodes"][0].update(
                {"schema": "analytics", "object_name": "tel_readings"}
            ),
            "non-telemetry schema",
        ),
        (
            lambda raw: raw["nodes"][0].update(
                {"schema": "public", "object_name": "tel_readings;drop_table"}
            ),
            "unsafe object",
        ),
    ],
    ids=[
        "arbitrary-sql",
        "secret-url",
        "non-telemetry-public-object",
        "non-telemetry-schema",
        "unsafe-identifier",
    ],
)
def test_catalog_rejects_unsafe_or_non_telemetry_definitions(mutation, message):
    raw = _catalog_dict()
    mutation(raw)

    with pytest.raises(metadata_svc.MetadataCatalogError, match=message):
        metadata_svc.validate_catalog(raw)


def test_enrichment_is_allowlisted_and_uses_requested_serving_scope(fake_cursor):
    last_updated = datetime(2026, 6, 12, 12, 0, tzinfo=timezone.utc)
    fake_cursor.push_result([{"tenant_id": TENANT_ID}])
    fake_cursor.push_result(
        [
            {
                "object_name": "tel_predictions",
                "row_count": 7,
                "last_updated_at": last_updated,
                "status": "fresh",
            },
            {
                "object_name": "business",
                "row_count": 99,
                "last_updated_at": last_updated,
                "status": "fresh",
            },
        ]
    )

    requested_scope = "telemetry-demo"
    graph = metadata_svc.build_metadata_graph(
        env_id=requested_scope,
        business_id=BUSINESS_ID,
    )

    assert graph["env_id"] == requested_scope
    assert len(fake_cursor.queries) == 2
    sql, params = fake_cursor.queries[1]
    assert params == (requested_scope, str(BUSINESS_ID))
    assert sql == metadata_svc.POSTGRES_ENRICHMENT_SQL
    assert "information_schema" not in sql.lower()
    assert "pg_catalog" not in sql.lower()
    assert all(
        object_name in sql
        for object_name in metadata_svc.POSTGRES_ENRICHMENT_ALLOWLIST
    )
    assert " business " not in f" {sql.lower()} "

    predictions = _node(graph, "tel_predictions")
    assert predictions["status"] == "fresh"
    assert predictions["metadata"] == {
        **{
            key: value
            for key, value in predictions["metadata"].items()
            if key not in {"available", "row_count", "last_updated_at", "enrichment"}
        },
        "available": True,
        "row_count": 7,
        "last_updated_at": last_updated.isoformat(),
        "enrichment": "postgres_allowlist",
    }
    assert all(node.get("object_name") != "business" for node in graph["nodes"])


def test_optional_enrichment_failure_returns_sanitized_partial(monkeypatch):
    @contextmanager
    def broken_cursor():
        raise RuntimeError(
            "postgresql://admin:super-secret@example.invalid/db SELECT * FROM business"
        )
        yield

    monkeypatch.setattr(metadata_svc, "_get_cursor", broken_cursor)
    graph = metadata_svc.build_metadata_graph(
        env_id=ENV_ID,
        business_id=BUSINESS_ID,
    )

    assert graph["status"] == "partial"
    assert graph["nodes"]
    assert graph["edges"]
    assert graph["warnings"] == [
        {
            "code": "RUNTIME_ENRICHMENT_UNAVAILABLE",
            "message": "Optional telemetry metadata enrichment was unavailable.",
            "severity": "warning",
        }
    ]
    warning_text = json.dumps(graph["warnings"]).lower()
    assert "secret" not in warning_text
    assert "postgres" not in warning_text
    assert "select" not in warning_text


def test_enrichment_updates_unavailable_stats_from_returned_nodes(fake_cursor):
    fake_cursor.push_result([{"tenant_id": TENANT_ID}])
    fake_cursor.push_result(
        [
            {
                "object_name": "tel_predictions",
                "row_count": 0,
                "last_updated_at": None,
                "status": "missing",
            }
        ]
    )

    graph = metadata_svc.build_metadata_graph(
        env_id=ENV_ID,
        business_id=BUSINESS_ID,
    )

    assert _node(graph, "tel_predictions")["status"] == "missing"
    expected = sum(
        node["status"] in {"missing", "quarantined"}
        or node["metadata"].get("available") is False
        for node in graph["nodes"]
    )
    assert graph["stats"]["unavailable_count"] == expected
    assert graph["stats"]["unavailable_count"] >= 1


def test_metadata_graph_endpoint_preserves_serving_scope(client, fake_cursor):
    fake_cursor.push_result([{"tenant_id": TENANT_ID}])
    fake_cursor.push_result([])

    response = client.get(
        "/api/telemetry/metadata/graph",
        params={"env_id": ENV_ID, "business_id": str(BUSINESS_ID)},
    )

    assert response.status_code == 200
    graph = response.json()
    assert graph["env_id"] == ENV_ID
    assert graph["environment"] == ENV_ID
    assert graph["status"] == "ok"
    assert graph["stats"]["edge_count"] == len(graph["edges"])
    assert fake_cursor.queries[1][1] == (ENV_ID, str(BUSINESS_ID))


def test_metadata_graph_endpoint_sanitizes_invalid_catalog(client, monkeypatch):
    def invalid_catalog(**_kwargs):
        raise metadata_svc.MetadataCatalogError(
            "postgresql://admin:secret@host/db invalid catalog"
        )

    monkeypatch.setattr(metadata_svc, "get_metadata_graph", invalid_catalog)
    response = client.get(
        "/api/telemetry/metadata/graph",
        params={"env_id": ENV_ID, "business_id": str(BUSINESS_ID)},
    )

    assert response.status_code == 500
    body = response.json()
    assert body["detail"]["error_code"] == "INVALID_METADATA_CATALOG"
    assert "secret" not in json.dumps(body).lower()
    assert "postgres" not in json.dumps(body).lower()
