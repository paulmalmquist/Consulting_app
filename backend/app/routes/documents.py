from fastapi import APIRouter, HTTPException, Query
from uuid import UUID
from typing import Optional
from app.db import get_cursor
from app.config import STORAGE_BUCKET
from app.repos.supabase_storage_repo import SupabaseStorageRepository
from app.schemas.documents import (
    InitUploadRequest,
    InitUploadResponse,
    CompleteUploadRequest,
    DocumentOut,
    DocumentVersionOut,
    DownloadUrlResponse,
)
from app.schemas.business import OkResponse

router = APIRouter(prefix="/api/documents")
storage = SupabaseStorageRepository()


def _storage_key(
    tenant_id: str, business_id: str, department_id: Optional[str],
    document_id: str, version_id: str, filename: str,
) -> str:
    dept_part = department_id or "general"
    return f"tenant/{tenant_id}/business/{business_id}/department/{dept_part}/document/{document_id}/v/{version_id}/{filename}"


@router.post("/init-upload", response_model=InitUploadResponse)
def init_upload(req: InitUploadRequest):
    with get_cursor() as cur:
        # Look up tenant_id from business
        cur.execute(
            "SELECT tenant_id FROM app.businesses WHERE business_id = %s",
            (str(req.business_id),),
        )
        biz = cur.fetchone()
        if not biz:
            raise HTTPException(status_code=404, detail="Business not found")
        tenant_id = str(biz["tenant_id"])

        title = req.title or req.filename

        # Create document row
        cur.execute(
            """INSERT INTO app.documents
               (tenant_id, business_id, department_id, domain, classification, title, virtual_path, status)
               VALUES (%s, %s, %s, 'general', 'other', %s, %s, 'draft')
               RETURNING document_id""",
            (tenant_id, str(req.business_id), str(req.department_id) if req.department_id else None,
             title, req.virtual_path),
        )
        doc_row = cur.fetchone()
        document_id = str(doc_row["document_id"])

        # Determine next version number
        cur.execute(
            "SELECT COALESCE(MAX(version_number), 0) + 1 as next_ver FROM app.document_versions WHERE document_id = %s",
            (document_id,),
        )
        next_ver = cur.fetchone()["next_ver"]

        # Create version placeholder
        version_id_placeholder = None
        storage_key_placeholder = "pending"  # will be updated below

        cur.execute(
            """INSERT INTO app.document_versions
               (tenant_id, document_id, version_number, state, bucket, object_key, original_filename, mime_type)
               VALUES (%s, %s, %s, 'uploading', %s, %s, %s, %s)
               RETURNING version_id""",
            (tenant_id, document_id, next_ver, STORAGE_BUCKET, storage_key_placeholder,
             req.filename, req.content_type),
        )
        ver_row = cur.fetchone()
        version_id = str(ver_row["version_id"])

        # Build storage key
        storage_key = _storage_key(
            tenant_id, str(req.business_id),
            str(req.department_id) if req.department_id else None,
            document_id, version_id, req.filename,
        )

        # Update version with real storage key
        cur.execute(
            "UPDATE app.document_versions SET object_key = %s WHERE version_id = %s",
            (storage_key, version_id),
        )

        # Generate signed upload URL
        signed_url = storage.generate_signed_upload_url(
            STORAGE_BUCKET, storage_key, req.content_type
        )

        return InitUploadResponse(
            document_id=document_id,
            version_id=version_id,
            storage_key=storage_key,
            signed_upload_url=signed_url,
        )


@router.post("/complete-upload", response_model=OkResponse)
def complete_upload(req: CompleteUploadRequest):
    with get_cursor() as cur:
        cur.execute(
            """UPDATE app.document_versions
               SET state = 'available', size_bytes = %s, content_hash = %s, finalized_at = now()
               WHERE version_id = %s AND document_id = %s""",
            (req.byte_size, req.sha256, str(req.version_id), str(req.document_id)),
        )
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="Version not found")

    return OkResponse()


@router.get("", response_model=list[DocumentOut])
def list_documents(
    business_id: UUID = Query(...),
    department_id: Optional[UUID] = Query(None),
):
    with get_cursor() as cur:
        if department_id:
            cur.execute(
                """SELECT d.document_id, d.business_id, d.department_id, d.title,
                          d.virtual_path, d.status::text as status, d.created_at,
                          lv.version_number as latest_version_number,
                          lv.mime_type as latest_content_type,
                          lv.size_bytes as latest_size_bytes
                   FROM app.documents d
                   LEFT JOIN LATERAL (
                     SELECT version_number, mime_type, size_bytes
                     FROM app.document_versions
                     WHERE document_id = d.document_id
                     ORDER BY version_number DESC LIMIT 1
                   ) lv ON true
                   WHERE d.business_id = %s AND d.department_id = %s
                   ORDER BY d.created_at DESC""",
                (str(business_id), str(department_id)),
            )
        else:
            cur.execute(
                """SELECT d.document_id, d.business_id, d.department_id, d.title,
                          d.virtual_path, d.status::text as status, d.created_at,
                          lv.version_number as latest_version_number,
                          lv.mime_type as latest_content_type,
                          lv.size_bytes as latest_size_bytes
                   FROM app.documents d
                   LEFT JOIN LATERAL (
                     SELECT version_number, mime_type, size_bytes
                     FROM app.document_versions
                     WHERE document_id = d.document_id
                     ORDER BY version_number DESC LIMIT 1
                   ) lv ON true
                   WHERE d.business_id = %s
                   ORDER BY d.created_at DESC""",
                (str(business_id),),
            )

        rows = cur.fetchall()
        return [DocumentOut(**r) for r in rows]


@router.get("/{document_id}/versions", response_model=list[DocumentVersionOut])
def list_versions(document_id: UUID):
    with get_cursor() as cur:
        cur.execute(
            """SELECT version_id, document_id, version_number, state::text as state,
                      original_filename, mime_type, size_bytes, content_hash, created_at
               FROM app.document_versions
               WHERE document_id = %s
               ORDER BY version_number DESC""",
            (str(document_id),),
        )
        rows = cur.fetchall()
        return [DocumentVersionOut(**r) for r in rows]


@router.get("/{document_id}/versions/{version_id}/download-url", response_model=DownloadUrlResponse)
def get_download_url(document_id: UUID, version_id: UUID):
    with get_cursor() as cur:
        cur.execute(
            "SELECT bucket, object_key FROM app.document_versions WHERE version_id = %s AND document_id = %s",
            (str(version_id), str(document_id)),
        )
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Version not found")

        signed_url = storage.generate_signed_download_url(row["bucket"], row["object_key"])
        return DownloadUrlResponse(signed_download_url=signed_url)
