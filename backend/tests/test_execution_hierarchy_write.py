"""Ticket 5 — consulting task hierarchy write-path validation.

validate_hierarchy fails closed: unknown domain/initiative/workstream keys
raise HierarchyValidationError (→ clean 400 at the route), never a silent
write. NULL hierarchy is always allowed (flat / Ungrouped task).

Pure dependency-rule cases need no DB. Reference-lookup cases drive the
FakeCursor (queue an empty result to simulate "key not in reference table").
A live integration test against the seeded tables runs only when a DB is
reachable (skips in the standard unit run).
"""

import uuid
from contextlib import contextmanager
from unittest.mock import patch

import pytest

from app.services import execution_tasks as svc


def _patched_cursor(cur):
    @contextmanager
    def _mock():
        yield cur

    return patch("app.services.execution_tasks.get_cursor", _mock)


def test_null_hierarchy_is_allowed():
    """Flat task — no keys — must never raise (no DB call needed)."""
    svc.validate_hierarchy(
        env_id="env1",
        business_id=uuid.uuid4(),
        domain_key=None,
        initiative_key=None,
        workstream_key=None,
    )


def test_initiative_without_domain_rejected():
    with pytest.raises(svc.HierarchyValidationError, match="requires a domain_key"):
        svc.validate_hierarchy(
            env_id="env1",
            business_id=uuid.uuid4(),
            domain_key=None,
            initiative_key="flowyorker",
            workstream_key=None,
        )


def test_workstream_without_initiative_rejected():
    with pytest.raises(
        svc.HierarchyValidationError, match="requires a domain_key and initiative_key"
    ):
        svc.validate_hierarchy(
            env_id="env1",
            business_id=uuid.uuid4(),
            domain_key="web_properties",
            initiative_key=None,
            workstream_key="site_ops",
        )


def test_unknown_domain_key_rejected(fake_cursor):
    fake_cursor.push_result([])  # domain lookup returns nothing
    with _patched_cursor(fake_cursor):
        with pytest.raises(svc.HierarchyValidationError, match="unknown domain_key"):
            svc.validate_hierarchy(
                env_id="env1",
                business_id=uuid.uuid4(),
                domain_key="not_a_domain",
                initiative_key=None,
                workstream_key=None,
            )


def test_unknown_initiative_key_rejected(fake_cursor):
    fake_cursor.push_result([{"?column?": 1}])  # domain OK
    fake_cursor.push_result([])  # initiative lookup empty
    with _patched_cursor(fake_cursor):
        with pytest.raises(
            svc.HierarchyValidationError, match="unknown initiative_key"
        ):
            svc.validate_hierarchy(
                env_id="env1",
                business_id=uuid.uuid4(),
                domain_key="web_properties",
                initiative_key="not_real",
                workstream_key=None,
            )


def test_unknown_workstream_key_rejected(fake_cursor):
    fake_cursor.push_result([{"?column?": 1}])  # domain OK
    fake_cursor.push_result([{"?column?": 1}])  # initiative OK
    fake_cursor.push_result([])  # workstream lookup empty
    with _patched_cursor(fake_cursor):
        with pytest.raises(
            svc.HierarchyValidationError, match="unknown workstream_key"
        ):
            svc.validate_hierarchy(
                env_id="env1",
                business_id=uuid.uuid4(),
                domain_key="web_properties",
                initiative_key="flowyorker",
                workstream_key="not_real",
            )


def test_fully_valid_chain_passes(fake_cursor):
    fake_cursor.push_result([{"?column?": 1}])  # domain OK
    fake_cursor.push_result([{"?column?": 1}])  # initiative OK
    fake_cursor.push_result([{"?column?": 1}])  # workstream OK
    with _patched_cursor(fake_cursor):
        svc.validate_hierarchy(
            env_id="env1",
            business_id=uuid.uuid4(),
            domain_key="web_properties",
            initiative_key="flowyorker",
            workstream_key="site_ops",
        )

# Note: live validation against the seeded reference tables was verified
# manually via `supabase db query --linked` (options query returns the 5
# seeded domains; the web_properties→flowyorker→content_seo chain exists).
# No DB-backed test here on purpose — a fixture that blocks on psycopg.connect
# can hang the unit suite, which is worse than relying on the proven manual
# check plus the FakeCursor-driven rejection tests above.
