"""outreach_personalizer.py — Outreach Personalizer DB service.

All DB reads/writes for cro_outreach_target, cro_outreach_asset, and
cro_microsite_event. AI orchestration lives in outreach_personalizer_ai.py.

Rules (mirror pitch_forge):
- Synchronous DB via get_cursor()
- Return dicts (not ORM models)
- Raise OutreachPersonalizerError subclasses for domain failures
- Tenant scoping via explicit WHERE env_id = %s (RLS is defense-in-depth)
"""
from __future__ import annotations

import json
import re
from uuid import UUID

from app.db import get_cursor

PUBLIC_STATUSES = ("assets_ready", "microsite_live")

# Shared Loom URL validator. Mirrors the render-side toEmbedUrl() shape in
# repo-b/src/components/marketing/personalizer/LoomEmbed.tsx so operator-side and
# public-render validation agree. Only accepts loom.com share/embed links and
# normalizes to the embed form. Rejects javascript:/data:/arbitrary iframe URLs.
_LOOM_ID_RE = re.compile(r"^https?://(?:www\.)?loom\.com/(?:share|embed)/([A-Za-z0-9]+)")


def normalize_loom_url(value: str | None) -> str | None:
    """Return a safe normalized Loom embed URL, or None to clear.

    Raises ValueError for any non-empty value that is not a recognizable Loom
    share/embed URL (this includes javascript:/data: and arbitrary iframes,
    which never match the loom.com host pattern).
    """
    if value is None:
        return None
    v = value.strip()
    if v == "":
        return None
    m = _LOOM_ID_RE.match(v)
    if not m:
        raise ValueError(
            "loom_url must be a Loom share or embed URL "
            "(https://www.loom.com/share/<id> or /embed/<id>)."
        )
    return f"https://www.loom.com/embed/{m.group(1)}"


# ---------------------------------------------------------------------------
# Domain errors
# ---------------------------------------------------------------------------

class OutreachPersonalizerError(Exception):
    """Base class for Outreach Personalizer domain errors."""


class OutreachTargetNotFound(OutreachPersonalizerError):
    """Requested target does not exist."""


# ---------------------------------------------------------------------------
# cro_outreach_target
# ---------------------------------------------------------------------------

def get_target_by_id(*, target_id: UUID) -> dict:
    with get_cursor() as cur:
        cur.execute(
            "SELECT * FROM cro_outreach_target WHERE id = %s::uuid",
            (str(target_id),),
        )
        row = cur.fetchone()
    if not row:
        raise OutreachTargetNotFound(f"Target {target_id} not found")
    return row


def get_target_by_slug(*, env_id: str, firm_slug: str) -> dict | None:
    with get_cursor() as cur:
        cur.execute(
            """SELECT * FROM cro_outreach_target
               WHERE env_id = %s AND firm_slug = %s""",
            (env_id, firm_slug),
        )
        return cur.fetchone()


def get_public_target_by_slug(*, firm_slug: str) -> dict | None:
    """Public lookup by slug only (no env context). Returns the latest row for
    the slug regardless of status; the route decides ready vs not-ready so the
    public page can distinguish 'not found' from 'not ready'. Phase 1 is
    single-tenant; Phase 2 must add env disambiguation if a slug recurs."""
    with get_cursor() as cur:
        cur.execute(
            """SELECT * FROM cro_outreach_target
               WHERE firm_slug = %s
               ORDER BY updated_at DESC
               LIMIT 1""",
            (firm_slug,),
        )
        return cur.fetchone()


def is_public_ready(target: dict) -> bool:
    return target.get("status") in PUBLIC_STATUSES


def list_targets(*, env_id: str) -> list[dict]:
    with get_cursor() as cur:
        cur.execute(
            """SELECT * FROM cro_outreach_target
               WHERE env_id = %s
               ORDER BY updated_at DESC""",
            (env_id,),
        )
        return cur.fetchall()


def create_target(*, env_id: str, business_id: UUID | None, payload: dict) -> dict:
    with get_cursor() as cur:
        cur.execute(
            """INSERT INTO cro_outreach_target
               (env_id, business_id, firm_name, firm_slug, logo_url, accent_hsl,
                profile_json, loom_url, status)
               VALUES (%s, %s, %s, %s, %s, %s, %s::jsonb, %s, 'pending')
               RETURNING *""",
            (
                env_id,
                str(business_id) if business_id else None,
                payload["firm_name"],
                payload["firm_slug"],
                payload.get("logo_url"),
                payload.get("accent_hsl"),
                json.dumps(payload.get("profile_json") or {}),
                payload.get("loom_url"),
            ),
        )
        return cur.fetchone()


def update_target(
    *,
    target_id: UUID,
    status: str | None = None,
    microsite_url: str | None = None,
    loom_url: str | None = None,
) -> dict:
    with get_cursor() as cur:
        cur.execute(
            """UPDATE cro_outreach_target
               SET status        = COALESCE(%s, status),
                   microsite_url = COALESCE(%s, microsite_url),
                   loom_url      = COALESCE(%s, loom_url),
                   updated_at    = now()
               WHERE id = %s::uuid
               RETURNING *""",
            (status, microsite_url, loom_url, str(target_id)),
        )
        row = cur.fetchone()
    if not row:
        raise OutreachTargetNotFound(f"Target {target_id} not found")
    return row


# Columns the PATCH endpoint may set. Unlike update_target (Phase 1 seed path,
# COALESCE — never clears), patch_target writes exactly the provided fields, so
# loom_url can be explicitly set to NULL to clear it.
_PATCHABLE = ("loom_url", "crm_account_id", "crm_opportunity_id", "logo_url", "accent_hsl")
_UUID_PATCH_COLS = ("crm_account_id", "crm_opportunity_id")


def patch_target(*, target_id: UUID, fields: dict) -> dict:
    """Update only the explicitly provided patchable fields (supports null-clear)."""
    cols = [c for c in _PATCHABLE if c in fields]
    if not cols:
        return get_target_by_id(target_id=target_id)
    set_sql = ", ".join(f"{c} = %s" for c in cols)
    params: list = []
    for c in cols:
        val = fields[c]
        if c in _UUID_PATCH_COLS and val is not None:
            params.append(str(val))
        else:
            params.append(val)
    params.append(str(target_id))
    with get_cursor() as cur:
        cur.execute(
            f"""UPDATE cro_outreach_target
                SET {set_sql}, updated_at = now()
                WHERE id = %s::uuid
                RETURNING *""",
            tuple(params),
        )
        row = cur.fetchone()
    if not row:
        raise OutreachTargetNotFound(f"Target {target_id} not found")
    return row


# ---------------------------------------------------------------------------
# crm_account — read-only reuse (FK existence guard + summary). NOT a CRM model;
# crm_account is owned by 260_crm_native.sql / app.services.crm.
# ---------------------------------------------------------------------------

def crm_account_exists(*, crm_account_id: UUID) -> bool:
    with get_cursor() as cur:
        cur.execute(
            "SELECT 1 FROM crm_account WHERE crm_account_id = %s::uuid",
            (str(crm_account_id),),
        )
        return cur.fetchone() is not None


def crm_account_summary(*, crm_account_id: UUID) -> dict | None:
    with get_cursor() as cur:
        cur.execute(
            """SELECT crm_account_id, name, website
               FROM crm_account WHERE crm_account_id = %s::uuid""",
            (str(crm_account_id),),
        )
        return cur.fetchone()


# ---------------------------------------------------------------------------
# crm_opportunity — read-only reuse (FK existence guard + summary) + pipeline
# advance gate. NOT a CRM model; crm_opportunity / crm_pipeline_stage are owned
# by 260_crm_native.sql / app.services.crm. Phase 2C.
# ---------------------------------------------------------------------------

# Single owner of the "closed/terminal" set. crm_opportunity.status was extended
# by 10001_crm_opportunity_lifecycle.sql to include 'cold_hold' and 'archived';
# only 'won', 'lost', 'archived' are terminal — 'on_hold' and 'cold_hold' are
# active-but-paused, so the operator can still advance them.
_CLOSED_OPP_STATUSES: tuple[str, ...] = ("won", "lost", "archived")


def crm_opportunity_exists(*, crm_opportunity_id: UUID, business_id: UUID) -> bool:
    """FK guard that ALSO enforces same-business linkage. Returns True only when
    the opportunity row exists AND belongs to the given business_id."""
    with get_cursor() as cur:
        cur.execute(
            """SELECT 1 FROM crm_opportunity
               WHERE crm_opportunity_id = %s::uuid AND business_id = %s::uuid""",
            (str(crm_opportunity_id), str(business_id)),
        )
        return cur.fetchone() is not None


def list_opportunity_summaries_bulk(*, opp_ids: list[str]) -> dict[str, dict]:
    """Per-opportunity name + current-stage label for the list view's linked
    indicator. ONE round-trip via `WHERE crm_opportunity_id = ANY(%s)`. Returns
    {opp_id: {crm_opportunity_id, name, stage_label}}. Empty input → empty dict
    (no DB call), so existing list-view tests with unlinked targets do not
    consume an extra FakeCursor push."""
    if not opp_ids:
        return {}
    with get_cursor() as cur:
        cur.execute(
            """SELECT o.crm_opportunity_id, o.name, s.label AS stage_label
                 FROM crm_opportunity o
                 LEFT JOIN crm_pipeline_stage s
                        ON s.crm_pipeline_stage_id = o.crm_pipeline_stage_id
                WHERE o.crm_opportunity_id = ANY(%s)""",
            ([str(o) for o in opp_ids],),
        )
        rows = cur.fetchall()
    return {
        str(r["crm_opportunity_id"]): {
            "crm_opportunity_id": r["crm_opportunity_id"],
            "name": r["name"],
            "stage_label": r.get("stage_label"),
        }
        for r in rows
    }


def crm_opportunity_summary(*, crm_opportunity_id: UUID) -> dict | None:
    """Opportunity + joined current-stage fields the operator UI needs."""
    with get_cursor() as cur:
        cur.execute(
            """SELECT o.crm_opportunity_id, o.name, o.amount, o.status,
                      o.business_id, o.crm_account_id, o.crm_pipeline_stage_id,
                      s.key AS stage_key, s.label AS stage_label,
                      s.stage_order, s.is_closed, s.is_won
                 FROM crm_opportunity o
                 LEFT JOIN crm_pipeline_stage s
                        ON s.crm_pipeline_stage_id = o.crm_pipeline_stage_id
                WHERE o.crm_opportunity_id = %s::uuid""",
            (str(crm_opportunity_id),),
        )
        return cur.fetchone()


def _next_open_stage(*, cur, business_id: UUID, current_order: int) -> dict | None:
    """Resolve the next non-closed stage strictly above current_order.

    Deterministic tiebreaker on duplicate stage_order: secondary ASC by `key`
    (the table's UNIQUE column within a business). Same business scope as the
    current opportunity. This helper is the SINGLE owner of the "what counts
    as the next stage" policy — do not reimplement at call sites.
    """
    cur.execute(
        """SELECT crm_pipeline_stage_id, key, label, stage_order
             FROM crm_pipeline_stage
            WHERE business_id = %s::uuid
              AND is_closed = false
              AND stage_order > %s
            ORDER BY stage_order ASC, key ASC
            LIMIT 1""",
        (str(business_id), current_order),
    )
    return cur.fetchone()


def compute_pipeline_advance_state(
    *, target: dict, opportunity: dict | None = None
) -> dict:
    """Single source of truth for the pipeline-advance gate.

    Used for BOTH display (GET /targets/{id}) and enforcement
    (POST /targets/{id}/advance-pipeline). Failure mapping is intentionally
    1-to-1 with the operator-facing blocking_reason strings — earliest failure
    short-circuits with the most actionable message.

    Callers may pass a pre-fetched `opportunity` dict (from
    crm_opportunity_summary) to avoid a duplicate SELECT when the route already
    needs the summary for its response payload.

    Returns:
        {
          "available": bool,
          "blocking_reason": str | None,
          "opportunity": <crm_opportunity_summary or None>,
          "next_stage": {crm_pipeline_stage_id, key, label} | None,
        }
    """
    def _fail(reason: str, opp: dict | None = None) -> dict:
        return {"available": False, "blocking_reason": reason,
                "opportunity": opp, "next_stage": None}

    # 1. business_id
    business_id = target.get("business_id")
    if not business_id:
        return _fail("Env has no business_id; pipeline operations unavailable.")
    # 2. crm_account_id
    if not target.get("crm_account_id"):
        return _fail("Link a CRM account first.")
    # 3. crm_opportunity_id
    opp_id = target.get("crm_opportunity_id")
    if not opp_id:
        return _fail("Link a CRM opportunity to enable pipeline moves.")

    opp = opportunity if opportunity is not None else crm_opportunity_summary(
        crm_opportunity_id=opp_id
    )
    # 4. opportunity row exists AND same business
    if opp is None:
        return _fail("Linked opportunity belongs to a different business.")
    if str(opp.get("business_id")) != str(business_id):
        return _fail("Linked opportunity belongs to a different business.", opp)
    # 5. opportunity not closed
    if opp.get("status") in _CLOSED_OPP_STATUSES:
        return _fail("Opportunity is closed; reopen it in CRM to advance.", opp)
    # 6. current stage not terminal
    current_order = opp.get("stage_order")
    if opp.get("is_closed") is True:
        return _fail("Opportunity already at terminal stage.", opp)
    if current_order is None:
        # No stage attached at all → no progression possible.
        return _fail("No valid next stage is configured.", opp)
    # 7. next stage exists
    with get_cursor() as cur:
        nxt = _next_open_stage(
            cur=cur, business_id=business_id, current_order=current_order,
        )
    if not nxt:
        return _fail("No valid next stage is configured.", opp)

    return {
        "available": True,
        "blocking_reason": None,
        "opportunity": opp,
        "next_stage": {
            "crm_pipeline_stage_id": nxt["crm_pipeline_stage_id"],
            "key": nxt["key"],
            "label": nxt["label"],
        },
    }


# ---------------------------------------------------------------------------
# cro_outreach_asset
# ---------------------------------------------------------------------------

def list_assets(*, target_id: UUID) -> list[dict]:
    with get_cursor() as cur:
        cur.execute(
            """SELECT * FROM cro_outreach_asset
               WHERE target_id = %s::uuid
               ORDER BY asset_type ASC, position ASC""",
            (str(target_id),),
        )
        return cur.fetchall()


def insert_asset(
    *, target_id: UUID, asset_type: str, payload: dict, position: int = 0
) -> dict:
    """Initial generation. regenerated_count stays at its default of 0."""
    with get_cursor() as cur:
        cur.execute(
            """INSERT INTO cro_outreach_asset
               (target_id, asset_type, position, payload)
               VALUES (%s::uuid, %s, %s, %s::jsonb)
               RETURNING *""",
            (str(target_id), asset_type, position, json.dumps(payload)),
        )
        return cur.fetchone()


def regenerate_asset_row(*, target_id: UUID, asset_type: str, payload: dict) -> dict:
    """Replace an asset's payload and increment regenerated_count.

    If no row exists yet for this asset_type, insert one already marked as a
    regeneration (count = 1) so the counter still reflects the action.
    """
    with get_cursor() as cur:
        cur.execute(
            """UPDATE cro_outreach_asset
               SET payload           = %s::jsonb,
                   generated_at      = now(),
                   regenerated_count = regenerated_count + 1
               WHERE target_id = %s::uuid AND asset_type = %s
               RETURNING *""",
            (json.dumps(payload), str(target_id), asset_type),
        )
        row = cur.fetchone()
        if row:
            return row
        cur.execute(
            """INSERT INTO cro_outreach_asset
               (target_id, asset_type, position, payload, regenerated_count)
               VALUES (%s::uuid, %s, 0, %s::jsonb, 1)
               RETURNING *""",
            (str(target_id), asset_type, json.dumps(payload)),
        )
        return cur.fetchone()


# ---------------------------------------------------------------------------
# cro_microsite_event
# ---------------------------------------------------------------------------

def record_microsite_event(
    *,
    target_id: UUID | None,
    env_id: str | None,
    microsite_slug: str,
    event_type: str,
    metadata: dict | None = None,
    ip_address: str | None = None,
    user_agent: str | None = None,
) -> dict:
    with get_cursor() as cur:
        cur.execute(
            """INSERT INTO cro_microsite_event
               (target_id, env_id, microsite_slug, event_type, metadata,
                ip_address, user_agent)
               VALUES (%s, %s, %s, %s, %s::jsonb, %s, %s)
               RETURNING *""",
            (
                str(target_id) if target_id else None,
                env_id,
                microsite_slug,
                event_type,
                json.dumps(metadata or {}),
                ip_address,
                user_agent,
            ),
        )
        return cur.fetchone()


# ---------------------------------------------------------------------------
# Engagement rollups (Phase 2B). cro_microsite_event is the source of truth.
# Operator-facing only — IP / user-agent are deliberately NOT surfaced.
# ---------------------------------------------------------------------------

_EMPTY_ROLLUP = {
    "total_views": 0,
    "total_ctas": 0,
    "last_viewed_at": None,
    "last_cta_at": None,
}


def engagement_rollup(*, target_id: UUID, recent_limit: int = 10) -> dict:
    """Full rollup for one target: counts, last-seen, and recent events
    (event_type + occurred_at only)."""
    with get_cursor() as cur:
        cur.execute(
            """SELECT
                   count(*) FILTER (WHERE event_type = 'microsite_view')  AS total_views,
                   count(*) FILTER (WHERE event_type = 'microsite_cta')   AS total_ctas,
                   max(occurred_at) FILTER (WHERE event_type = 'microsite_view') AS last_viewed_at,
                   max(occurred_at) FILTER (WHERE event_type = 'microsite_cta')  AS last_cta_at
               FROM cro_microsite_event
               WHERE target_id = %s::uuid""",
            (str(target_id),),
        )
        agg = cur.fetchone() or {}
        cur.execute(
            """SELECT event_type, occurred_at
               FROM cro_microsite_event
               WHERE target_id = %s::uuid
               ORDER BY occurred_at DESC
               LIMIT %s""",
            (str(target_id), recent_limit),
        )
        recent = cur.fetchall()
    return {
        "total_views": agg.get("total_views") or 0,
        "total_ctas": agg.get("total_ctas") or 0,
        "last_viewed_at": agg.get("last_viewed_at"),
        "last_cta_at": agg.get("last_cta_at"),
        "recent_events": [
            {"event_type": r["event_type"], "occurred_at": r["occurred_at"]}
            for r in recent
        ],
    }


def engagement_rollup_bulk(*, target_ids: list[str]) -> dict[str, dict]:
    """Per-target counts + last-seen for a list view, in a single grouped query.
    Returns {target_id: {total_views,total_ctas,last_viewed_at,last_cta_at}}."""
    if not target_ids:
        return {}
    with get_cursor() as cur:
        cur.execute(
            """SELECT
                   target_id,
                   count(*) FILTER (WHERE event_type = 'microsite_view')  AS total_views,
                   count(*) FILTER (WHERE event_type = 'microsite_cta')   AS total_ctas,
                   max(occurred_at) FILTER (WHERE event_type = 'microsite_view') AS last_viewed_at,
                   max(occurred_at) FILTER (WHERE event_type = 'microsite_cta')  AS last_cta_at
               FROM cro_microsite_event
               WHERE target_id = ANY(%s)
               GROUP BY target_id""",
            ([str(t) for t in target_ids],),
        )
        rows = cur.fetchall()
    out: dict[str, dict] = {}
    for r in rows:
        out[str(r["target_id"])] = {
            "total_views": r.get("total_views") or 0,
            "total_ctas": r.get("total_ctas") or 0,
            "last_viewed_at": r.get("last_viewed_at"),
            "last_cta_at": r.get("last_cta_at"),
        }
    return out
