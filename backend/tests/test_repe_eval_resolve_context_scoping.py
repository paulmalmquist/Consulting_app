"""Regression guard for the T12 / asset-resolution scoping bug.

Production failure 2026-05-09 (conv 94eaed94 turn 3):
  > give me a t12 for tech campus north
  → "asset lookup failed with an internal database error ...
     column d.business_id does not exist"

`resolve_repe_context` in app/services/repe_eval_capabilities.py had a
UNION whose `deal` and `asset` branches filtered on `d.business_id` /
`a.business_id`. Neither repe_deal nor repe_asset has a business_id
column — tenant scope flows repe_asset → repe_deal → repe_fund and the
authoritative filter is repe_fund.business_id (same join
list_property_assets uses).

This test asserts the source query is scoped correctly. It is a
source-level check on purpose: resolve_repe_context needs a live DB to
execute, and a source assertion is exactly what would have caught this
class of bug in CI.
"""
from __future__ import annotations

import inspect
import re

from app.services import repe_eval_capabilities


def _resolve_repe_context_source() -> str:
    return inspect.getsource(repe_eval_capabilities.resolve_repe_context)


def test_deal_and_asset_branches_do_not_reference_nonexistent_business_id() -> None:
    src = _resolve_repe_context_source()
    # repe_deal / repe_asset have NO business_id column. The bug aliased
    # them `d` and `a` and filtered `d.business_id` / `a.business_id`.
    assert "d.business_id" not in src, (
        "repe_deal has no business_id column — scope via repe_fund. "
        "Regression of the 2026-05-09 T12 failure."
    )
    # The asset branch aliases the asset table `a`. `a.business_id` must
    # not appear. (repe_fund is aliased af/df, repe_entity uses e.)
    assert "a.business_id" not in src, (
        "repe_asset has no business_id column — scope via "
        "repe_asset → repe_deal → repe_fund."
    )


def test_deal_branch_joins_through_repe_fund() -> None:
    src = _resolve_repe_context_source()
    # The deal branch must JOIN repe_fund and filter its business_id.
    assert re.search(r"FROM\s+repe_deal\s+d\b", src)
    assert re.search(r"JOIN\s+repe_fund\s+df\b.*ON\s+df\.fund_id\s*=\s*d\.fund_id", src, re.DOTALL)
    assert "df.business_id = %s" in src


def test_asset_branch_joins_asset_to_deal_to_fund() -> None:
    src = _resolve_repe_context_source()
    assert re.search(r"FROM\s+repe_asset\s+a\b", src)
    assert re.search(r"JOIN\s+repe_deal\s+ad\b.*ON\s+ad\.deal_id\s*=\s*a\.deal_id", src, re.DOTALL)
    assert re.search(r"JOIN\s+repe_fund\s+af\b.*ON\s+af\.fund_id\s*=\s*ad\.fund_id", src, re.DOTALL)
    assert "af.business_id = %s" in src


def test_fund_and_entity_branches_unchanged() -> None:
    """fund and entity DO have business_id — those branches stay direct.
    Guards against an over-correction that would needlessly join them."""
    src = _resolve_repe_context_source()
    assert "f.business_id = %s" in src  # repe_fund f
    assert "e.business_id = %s" in src  # repe_entity e
