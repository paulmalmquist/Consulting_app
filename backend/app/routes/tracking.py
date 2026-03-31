"""Engagement tracking endpoints.

Provides transparent pixel (open tracking) and redirect (click tracking)
endpoints for outreach email engagement analytics.
"""
from __future__ import annotations

import base64
from uuid import UUID

from fastapi import APIRouter, Query, Request
from fastapi.responses import RedirectResponse, Response

from app.db import get_cursor
from app.observability.logger import emit_log

router = APIRouter(prefix="/api/tracking", tags=["engagement-tracking"])

# 1x1 transparent GIF (43 bytes)
_TRANSPARENT_GIF = base64.b64decode(
    "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"
)


def _log_engagement_event(
    tracking_id: UUID,
    event_type: str,
    request: Request,
    target_url: str | None = None,
) -> None:
    """Record an engagement event and update the parent outreach log."""
    ip = request.client.host if request.client else None
    ua = request.headers.get("user-agent", "")

    try:
        with get_cursor() as cur:
            # Look up the outreach log to get env_id and business_id
            cur.execute(
                """
                SELECT env_id, business_id
                FROM cro_outreach_log
                WHERE id = %s
                LIMIT 1
                """,
                (str(tracking_id),),
            )
            row = cur.fetchone()
            if not row:
                emit_log(
                    level="warn",
                    service="backend",
                    action="tracking.unknown_id",
                    message=f"Tracking ID {tracking_id} not found in outreach log",
                    context={"tracking_id": str(tracking_id)},
                )
                return

            env_id = row["env_id"]
            business_id = row["business_id"]

            # Insert engagement event
            cur.execute(
                """
                INSERT INTO cro_engagement_event
                    (env_id, business_id, tracking_id, event_type, target_url, ip_address, user_agent)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                """,
                (env_id, str(business_id), str(tracking_id), event_type, target_url, ip, ua[:500] if ua else None),
            )

            # Update outreach log
            if event_type == "open":
                cur.execute(
                    """
                    UPDATE cro_outreach_log
                    SET opened_at = COALESCE(opened_at, now())
                    WHERE id = %s
                    """,
                    (str(tracking_id),),
                )
            elif event_type == "click":
                cur.execute(
                    """
                    UPDATE cro_outreach_log
                    SET clicked_at = COALESCE(clicked_at, now()),
                        link_clicks = COALESCE(link_clicks, 0) + 1
                    WHERE id = %s
                    """,
                    (str(tracking_id),),
                )

        emit_log(
            level="info",
            service="backend",
            action=f"tracking.{event_type}",
            message=f"Engagement {event_type} recorded for {tracking_id}",
            context={
                "tracking_id": str(tracking_id),
                "event_type": event_type,
                "env_id": env_id,
            },
        )
    except Exception as exc:
        emit_log(
            level="error",
            service="backend",
            action="tracking.error",
            message=f"Failed to record engagement event: {exc}",
            context={"tracking_id": str(tracking_id), "event_type": event_type},
            error=exc,
        )


@router.get("/pixel/{tracking_id}")
def tracking_pixel(tracking_id: UUID, request: Request) -> Response:
    """Return a 1x1 transparent GIF and log an email open event."""
    _log_engagement_event(tracking_id, "open", request)
    return Response(
        content=_TRANSPARENT_GIF,
        media_type="image/gif",
        headers={
            "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
            "Pragma": "no-cache",
            "Expires": "0",
        },
    )


@router.get("/redirect/{tracking_id}")
def tracking_redirect(
    tracking_id: UUID,
    request: Request,
    url: str = Query(..., description="Target URL to redirect to"),
) -> RedirectResponse:
    """Log a click event and redirect to the target URL."""
    _log_engagement_event(tracking_id, "click", request, target_url=url)
    return RedirectResponse(url=url, status_code=302)
