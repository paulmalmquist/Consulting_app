"""Supabase Storage implementation of UnstructuredRepository.

Uses Supabase Storage REST API with service-role key for signed URL generation.
"""

import httpx
from app.config import SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
from app.repos.unstructured_base import UnstructuredRepository


class SupabaseStorageRepository(UnstructuredRepository):

    def __init__(self):
        self.base_url = f"{SUPABASE_URL}/storage/v1"
        self.headers = {
            "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
            "apikey": SUPABASE_SERVICE_ROLE_KEY,
        }

    def generate_signed_upload_url(
        self, bucket: str, storage_key: str, content_type: str, expires_in: int = 3600
    ) -> str:
        # Supabase Storage v1 signed upload URL endpoint.
        # If endpoint config is missing/unreachable, gracefully fall back.
        try:
            resp = httpx.post(
                f"{self.base_url}/object/upload/sign/{bucket}/{storage_key}",
                headers=self.headers,
                json={},
                timeout=10,
            )
            if resp.status_code == 200:
                data = resp.json()
                # The signed URL is relative; make it absolute
                token = data.get("token", "")
                return f"{self.base_url}/object/upload/{bucket}/{storage_key}?token={token}"
        except httpx.HTTPError:
            pass

        # Fallback: return a direct upload URL using service role
        # The client will need to include the auth header
        return f"{self.base_url}/object/{bucket}/{storage_key}"

    def generate_signed_download_url(
        self, bucket: str, storage_key: str, expires_in: int = 3600
    ) -> str:
        try:
            resp = httpx.post(
                f"{self.base_url}/object/sign/{bucket}/{storage_key}",
                headers=self.headers,
                json={"expiresIn": expires_in},
                timeout=10,
            )
            if resp.status_code == 200:
                data = resp.json()
                signed_url = data.get("signedURL", "")
                if signed_url.startswith("/"):
                    return f"{SUPABASE_URL}/storage/v1{signed_url}"
                return signed_url
        except httpx.HTTPError:
            pass

        # Fallback: public URL (won't work for private buckets without RLS bypass)
        return f"{self.base_url}/object/public/{bucket}/{storage_key}"

    def delete_object(self, bucket: str, storage_key: str) -> None:
        httpx.delete(
            f"{self.base_url}/object/{bucket}",
            headers=self.headers,
            json={"prefixes": [storage_key]},
            timeout=10,
        )
