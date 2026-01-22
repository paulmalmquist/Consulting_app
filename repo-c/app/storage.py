from supabase import create_client

from .config import get_settings


def get_storage_client():
    settings = get_settings()
    if not settings.supabase_url or not settings.supabase_service_role_key:
        raise RuntimeError("Supabase credentials are missing")
    return create_client(settings.supabase_url, settings.supabase_service_role_key)
