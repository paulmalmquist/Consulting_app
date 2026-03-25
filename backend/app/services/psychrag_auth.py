from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable
from uuid import UUID

import httpx
from fastapi import Header, HTTPException

from app.config import SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL
from app.db import get_cursor


@dataclass
class SupabaseIdentity:
    user_id: UUID
    email: str
    raw_user: dict


@dataclass
class PsychragActor:
    user_id: UUID
    email: str
    practice_id: UUID
    role: str
    display_name: str
    onboarding_complete: bool


def _require_supabase_config() -> None:
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        raise HTTPException(status_code=500, detail="Supabase auth is not configured for PsychRAG")


async def authenticate_supabase_user(authorization: str | None = Header(default=None)) -> SupabaseIdentity:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Bearer token required")

    _require_supabase_config()
    token = authorization.split(" ", 1)[1].strip()
    if not token:
        raise HTTPException(status_code=401, detail="Bearer token required")

    url = f"{SUPABASE_URL.rstrip('/')}/auth/v1/user"
    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.get(
            url,
            headers={
                "Authorization": f"Bearer {token}",
                "apikey": SUPABASE_SERVICE_ROLE_KEY,
            },
        )

    if response.status_code >= 400:
        raise HTTPException(status_code=401, detail="Supabase session is invalid or expired")

    payload = response.json()
    user_id = payload.get("id")
    email = payload.get("email")
    if not user_id or not email:
        raise HTTPException(status_code=401, detail="Supabase user payload was incomplete")

    return SupabaseIdentity(user_id=UUID(user_id), email=email, raw_user=payload)


def load_psychrag_actor(user_id: UUID) -> PsychragActor | None:
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT id, practice_id, role, display_name, email, onboarding_complete
            FROM psychrag_profiles
            WHERE id = %s
            """,
            (str(user_id),),
        )
        row = cur.fetchone()

    if not row:
        return None

    return PsychragActor(
        user_id=row["id"],
        email=row["email"],
        practice_id=row["practice_id"],
        role=row["role"],
        display_name=row["display_name"],
        onboarding_complete=bool(row.get("onboarding_complete")),
    )


async def require_psychrag_actor(
    authorization: str | None = Header(default=None),
    allowed_roles: Iterable[str] | None = None,
    require_onboarding: bool = True,
) -> PsychragActor:
    identity = await authenticate_supabase_user(authorization)
    actor = load_psychrag_actor(identity.user_id)
    if actor is None:
        raise HTTPException(status_code=403, detail="PsychRAG onboarding is required")
    if require_onboarding and not actor.onboarding_complete:
        raise HTTPException(status_code=403, detail="PsychRAG onboarding is incomplete")
    if allowed_roles and actor.role not in set(allowed_roles):
        raise HTTPException(status_code=403, detail="You do not have access to this PsychRAG endpoint")
    return actor


async def require_patient_actor(authorization: str | None = Header(default=None)) -> PsychragActor:
    return await require_psychrag_actor(authorization, allowed_roles={"patient"})


async def require_therapist_actor(authorization: str | None = Header(default=None)) -> PsychragActor:
    return await require_psychrag_actor(authorization, allowed_roles={"therapist", "admin"})


async def require_admin_actor(authorization: str | None = Header(default=None)) -> PsychragActor:
    return await require_psychrag_actor(authorization, allowed_roles={"admin"})
