"""Smoke tests for the v2 environment blueprint pipeline.

Scope: forward-looking pipeline in isolation. Does NOT exercise legacy envs.
Uses the FakeCursor from conftest so no DB is required.
"""

from __future__ import annotations

import pytest

from app.schemas.lab_v2 import EnvironmentManifestV2
from app.services import environment_pipeline_v2, environment_templates_v2


_TEMPLATE_ROW = {
    "template_key": "internal_ops",
    "version": 1,
    "display_name": "Internal Operations",
    "description": "Test template",
    "env_kind_default": "internal",
    "industry_type": "consulting",
    "default_home_route": "/lab/env/{env_id}/consulting",
    "default_auth_mode": "private",
    "enabled_modules": ["crm", "tasks"],
    "theme_tokens": {"accent": "217 91% 60%"},
    "login_copy": {},
    "default_seed_pack": "internal_ops_minimal",
    "available_seed_packs": ["internal_ops_minimal", "empty"],
    "is_active": True,
    "is_latest": True,
    "notes": None,
}


@pytest.fixture(autouse=True)
def _bypass_template_cache(monkeypatch):
    """Avoid hitting DB for templates — return the canned row."""

    def _fake_get_template(template_key, version=None):
        if template_key != _TEMPLATE_ROW["template_key"]:
            raise LookupError(f"Unknown template_key: {template_key}")
        return dict(_TEMPLATE_ROW)

    monkeypatch.setattr(environment_templates_v2, "get_template", _fake_get_template)


def test_dry_run_does_not_write(fake_cursor):
    manifest = EnvironmentManifestV2(
        client_name="Riverfront Capital",
        template_key="internal_ops",
        dry_run=True,
    )
    resp = environment_pipeline_v2.create_environment_v2(manifest)
    assert resp.dry_run is True
    assert resp.env_id is None
    assert resp.slug == "riverfront-capital"
    assert resp.template_key == "internal_ops"
    assert resp.template_version == 1
    assert not resp.errors
    stage_names = [s.name for s in resp.stages]
    assert "validate" in stage_names
    assert "dry_run_preview" in stage_names
    assert fake_cursor.queries == []


def test_slug_derivation():
    manifest = EnvironmentManifestV2(
        client_name="Acme  Co — New!", template_key="internal_ops", dry_run=True
    )
    resp = environment_pipeline_v2.create_environment_v2(manifest)
    assert resp.slug == "acme-co-new"


def test_explicit_slug_preserved():
    manifest = EnvironmentManifestV2(
        client_name="Whatever Corp",
        template_key="internal_ops",
        slug="custom-slug",
        dry_run=True,
    )
    resp = environment_pipeline_v2.create_environment_v2(manifest)
    assert resp.slug == "custom-slug"


def test_manifest_overflow_rejects_disallowed_keys():
    manifest = EnvironmentManifestV2(
        client_name="Bad Co",
        template_key="internal_ops",
        manifest_overflow={"home_route": "/evil"},  # home_route must be a structured column
        dry_run=True,
    )
    resp = environment_pipeline_v2.create_environment_v2(manifest)
    assert resp.errors
    assert any("home_route" in e for e in resp.errors)


def test_manifest_overflow_accepts_allowlisted_keys():
    manifest = EnvironmentManifestV2(
        client_name="Good Co",
        template_key="internal_ops",
        manifest_overflow={
            "custom_copy": {"headline": "Hello"},
            "feature_flags": {"beta_ui": True},
        },
        dry_run=True,
    )
    resp = environment_pipeline_v2.create_environment_v2(manifest)
    assert not resp.errors


def test_unknown_template_raises():
    manifest = EnvironmentManifestV2(
        client_name="Ghost Co", template_key="does_not_exist", dry_run=True
    )
    with pytest.raises(LookupError):
        environment_pipeline_v2.create_environment_v2(manifest)


def test_full_create_writes_expected_rows(fake_cursor):
    """Non-dry-run path: env insert + v1 mirror + seed pack writes."""
    # _create_rows existence check (by slug) returns no match, then RETURNING env_id
    fake_cursor.push_result([])  # SELECT by slug — no existing
    fake_cursor.push_result([{"env_id": "00000000-0000-0000-0000-000000000001"}])  # RETURNING env_id
    # v1.environments mirror has no RETURNING
    # seed pack INSERTs have no fetches
    # _health_check SELECT
    fake_cursor.push_result(
        [
            {
                "env_id": "00000000-0000-0000-0000-000000000001",
                "slug": "acme",
                "template_key": "internal_ops",
                "seed_pack_applied": "internal_ops_minimal",
                "lifecycle_state": "seeded",
                "default_home_route": "/lab/env/{env_id}/consulting",
            }
        ]
    )

    manifest = EnvironmentManifestV2(
        client_name="Acme",
        template_key="internal_ops",
        seed_pack="internal_ops_minimal",
    )
    resp = environment_pipeline_v2.create_environment_v2(manifest)

    assert resp.env_id == "00000000-0000-0000-0000-000000000001"
    assert resp.lifecycle_state == "verified"
    assert not resp.errors
    stage_names = [s.name for s in resp.stages]
    assert stage_names == [
        "validate",
        "create_rows",
        "apply_template_metadata",
        "assign_owner_membership",
        "run_seed_pack",
        "health_check",
    ]
    # At least one v1.environments mirror insert and one pipeline_stages insert occurred.
    sql_blob = " ".join(q[0] for q in fake_cursor.queries)
    assert "INSERT INTO v1.environments" in sql_blob
    assert "INSERT INTO v1.pipeline_stages" in sql_blob


def test_idempotent_reuses_existing_slug(fake_cursor):
    # SELECT by slug returns an existing env
    fake_cursor.push_result(
        [
            {
                "env_id": "11111111-1111-1111-1111-111111111111",
                "template_key": "internal_ops",
                "template_version": 1,
                "lifecycle_state": "live",
                "business_id": None,
            }
        ]
    )
    # health_check still queries
    fake_cursor.push_result(
        [
            {
                "env_id": "11111111-1111-1111-1111-111111111111",
                "slug": "acme",
                "template_key": "internal_ops",
                "seed_pack_applied": "internal_ops_minimal",
                "lifecycle_state": "live",
                "default_home_route": "/lab/env/{env_id}/consulting",
            }
        ]
    )

    manifest = EnvironmentManifestV2(
        client_name="Acme",
        template_key="internal_ops",
        slug="acme",
    )
    resp = environment_pipeline_v2.create_environment_v2(manifest)

    assert resp.env_id == "11111111-1111-1111-1111-111111111111"
    # create_rows should be skipped since the slug already exists
    create_stage = next(s for s in resp.stages if s.name == "create_rows")
    assert create_stage.status == "skipped"
    assert any("already exists" in w for w in resp.warnings)
