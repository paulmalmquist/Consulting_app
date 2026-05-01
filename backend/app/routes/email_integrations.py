"""Email integration hooks for Novendor outreach sync."""
from __future__ import annotations

from fastapi import APIRouter, BackgroundTasks, HTTPException, Query, Request
from fastapi.responses import JSONResponse, PlainTextResponse

from app.services import msgraph_email_sync


router = APIRouter(prefix="/api/integrations/email", tags=["email-integrations"])


@router.post("/msgraph/webhook")
async def msgraph_webhook(
    request: Request,
    background_tasks: BackgroundTasks,
    validationToken: str | None = Query(default=None),
):
    """Receive Microsoft Graph message change notifications.

    Graph validates this endpoint by POSTing a validation token in the query
    string. For real notifications, keep the response fast and process message
    fetch/import work in a background task.
    """
    if validationToken is not None:
        return PlainTextResponse(validationToken, media_type="text/plain")

    payload = await request.json()
    if not msgraph_email_sync.validate_client_state(payload):
        raise HTTPException(status_code=403, detail="invalid clientState")

    background_tasks.add_task(msgraph_email_sync.process_notification_collection, payload)
    return JSONResponse({"accepted": True}, status_code=202)
