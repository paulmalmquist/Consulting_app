"""Documents service — single source of truth for document operations."""

import re
from uuid import UUID

from app.db import get_cursor
from app.config import STORAGE_BUCKET
from app.repos.supabase_storage_repo import SupabaseStorageRepository

_storage = SupabaseStorageRepository()
_RE_ENTITY_VPATH = re.compile(
    r"^re/env/(?P<env_id>[0-9a-fA-F-]{36})/(?P<segment>fund|deal|asset)/(?P<entity_id>[0-9a-fA-F-]{36})(?:/.*)?$"
)
_SEGMENT_TO_ENTITY = {"fund": "fund", "deal": "investment", "asset": "asset"}
_ENTITY_TO_SEGMENT = {"fund": "fund", "investment": "deal", "asset": "asset"}


def _storage_key(
    tenant_id: str, business_id: str, department_id: str | None,
    document_id: str, version_id: str, filename: str,
) -> str:
    dept_part = department_id or "general"
    return f"tenant/{tenant_id}/business/{business_id}/department/{dept_part}/document/{document_id}/v/{version_id}/{filename}"


def _extract_re_context_from_virtual_path(virtual_path: str | None) -> dict | None:
    if not virtual_path:
        return None
    m = _RE_ENTITY_VPATH.match(virtual_path)
    if not m:
        return None
    segment = m.group("segment")
    return {
        "env_id": m.group("env_id"),
        "entity_type": _SEGMENT_TO_ENTITY[segment],
        "entity_id": m.group("entity_id"),
    }


def _canonical_re_virtual_path(
    *,
    env_id: str,
    entity_type: str,
    entity_id: str,
    filename: str,
) -> str:
    segment = _ENTITY_TO_SEGMENT[entity_type]
    safe_filename = filename.replace("/", "_").strip() or "file"
    return f"re/env/{env_id}/{segment}/{entity_id}/{safe_filename}"


def _insert_entity_link(cur, *, document_id: str, env_id: str, entity_type: str, entity_id: str) -> None:
    cur.execute(
        """
        INSERT INTO app.document_entity_links (document_id, env_id, entity_type, entity_id)
        VALUES (%s::uuid, %s::uuid, %s, %s::uuid)
        ON CONFLICT (document_id, env_id, entity_type, entity_id) DO NOTHING
        """,
        (document_id, env_id, entity_type, entity_id),
    )


def init_upload(
    business_id: UUID,
    filename: str,
    content_type: str,
    department_id: UUID | None = None,
    title: str | None = None,
    virtual_path: str | None = None,
    entity_type: str | None = None,
    entity_id: UUID | None = None,
    env_id: UUID | None = None,
) -> dict:
    vpath_ctx = _extract_re_context_from_virtual_path(virtual_path)
    has_entity_inputs = any([entity_type, entity_id, env_id])
    if has_entity_inputs and not (entity_type and entity_id and env_id):
        raise ValueError("entity_type, entity_id, and env_id are required together")
    if has_entity_inputs:
        if entity_type not in _ENTITY_TO_SEGMENT:
            raise ValueError("entity_type must be one of: fund, investment, asset")
        if virtual_path:
            if not vpath_ctx:
                raise ValueError("Malformed RE virtual_path prefix")
            if (
                vpath_ctx["entity_type"] != entity_type
                or vpath_ctx["entity_id"] != str(entity_id)
                or vpath_ctx["env_id"] != str(env_id)
            ):
                raise ValueError("virtual_path context does not match entity context")
        else:
            virtual_path = _canonical_re_virtual_path(
                env_id=str(env_id),
                entity_type=entity_type,
                entity_id=str(entity_id),
                filename=filename,
            )
            vpath_ctx = _extract_re_context_from_virtual_path(virtual_path)
    elif virtual_path and virtual_path.startswith("re/") and not vpath_ctx:
        raise ValueError("Malformed RE virtual_path prefix")

    with get_cursor() as cur:
        cur.execute(
            "SELECT tenant_id FROM app.businesses WHERE business_id = %s",
            (str(business_id),),
        )
        biz = cur.fetchone()
        if not biz:
            raise LookupError("Business not found")
        tenant_id = str(biz["tenant_id"])

        actual_title = title or filename

        cur.execute(
            """SELECT document_id
               FROM app.documents
               WHERE business_id = %s
                 AND COALESCE(department_id::text, '') = COALESCE(%s, '')
                 AND COALESCE(virtual_path, '') = COALESCE(%s, '')
                 AND title = %s
               ORDER BY created_at ASC
               LIMIT 1""",
            (
                str(business_id),
                str(department_id) if department_id else None,
                virtual_path,
                actual_title,
            ),
        )
        existing_doc = cur.fetchone()
        if existing_doc:
            document_id = str(existing_doc["document_id"])
        else:
            cur.execute(
                """INSERT INTO app.documents
                   (tenant_id, business_id, department_id, domain, classification, title, virtual_path, status)
                   VALUES (%s, %s, %s, 'general', 'other', %s, %s, 'draft')
                   RETURNING document_id""",
                (tenant_id, str(business_id), str(department_id) if department_id else None,
                 actual_title, virtual_path),
            )
            doc_row = cur.fetchone()
            document_id = str(doc_row["document_id"])

        resolved_ctx = vpath_ctx
        if not resolved_ctx and virtual_path and virtual_path.startswith("re/"):
            resolved_ctx = _extract_re_context_from_virtual_path(virtual_path)
            if not resolved_ctx:
                raise ValueError("Malformed RE virtual_path prefix")
        if resolved_ctx:
            _insert_entity_link(
                cur,
                document_id=document_id,
                env_id=resolved_ctx["env_id"],
                entity_type=resolved_ctx["entity_type"],
                entity_id=resolved_ctx["entity_id"],
            )

        cur.execute(
            "SELECT COALESCE(MAX(version_number), 0) + 1 as next_ver FROM app.document_versions WHERE document_id = %s",
            (document_id,),
        )
        next_ver = cur.fetchone()["next_ver"]

        cur.execute(
            """INSERT INTO app.document_versions
               (tenant_id, document_id, version_number, state, bucket, object_key, original_filename, mime_type)
               VALUES (%s, %s, %s, 'uploading', %s, %s, %s, %s)
               RETURNING version_id""",
            (tenant_id, document_id, next_ver, STORAGE_BUCKET, "pending",
             filename, content_type),
        )
        ver_row = cur.fetchone()
        version_id = str(ver_row["version_id"])

        storage_key = _storage_key(
            tenant_id, str(business_id),
            str(department_id) if department_id else None,
            document_id, version_id, filename,
        )

        cur.execute(
            "UPDATE app.document_versions SET object_key = %s WHERE version_id = %s",
            (storage_key, version_id),
        )

        signed_url = _storage.generate_signed_upload_url(
            STORAGE_BUCKET, storage_key, content_type
        )

        return {
            "document_id": document_id,
            "version_id": version_id,
            "storage_key": storage_key,
            "signed_upload_url": signed_url,
        }


def complete_upload(
    document_id: UUID,
    version_id: UUID,
    sha256: str,
    byte_size: int,
    entity_type: str | None = None,
    entity_id: UUID | None = None,
    env_id: UUID | None = None,
) -> None:
    has_entity_inputs = any([entity_type, entity_id, env_id])
    if has_entity_inputs and not (entity_type and entity_id and env_id):
        raise ValueError("entity_type, entity_id, and env_id are required together")
    if entity_type and entity_type not in _ENTITY_TO_SEGMENT:
        raise ValueError("entity_type must be one of: fund, investment, asset")

    with get_cursor() as cur:
        cur.execute(
            "SELECT virtual_path FROM app.documents WHERE document_id = %s",
            (str(document_id),),
        )
        doc = cur.fetchone()
        if not doc:
            raise LookupError("Document not found")

        vpath = doc.get("virtual_path")
        vpath_ctx = _extract_re_context_from_virtual_path(vpath)
        if vpath and vpath.startswith("re/") and not vpath_ctx:
            raise ValueError("Malformed RE virtual_path prefix")

        if has_entity_inputs and vpath_ctx:
            if (
                vpath_ctx["entity_type"] != entity_type
                or vpath_ctx["entity_id"] != str(entity_id)
                or vpath_ctx["env_id"] != str(env_id)
            ):
                raise ValueError("Entity context does not match document virtual_path")

        if not has_entity_inputs and vpath_ctx:
            entity_type = vpath_ctx["entity_type"]
            entity_id = UUID(vpath_ctx["entity_id"])
            env_id = UUID(vpath_ctx["env_id"])

        cur.execute(
            """UPDATE app.document_versions
               SET state = 'available', size_bytes = %s, content_hash = %s, finalized_at = now()
               WHERE version_id = %s AND document_id = %s""",
            (byte_size, sha256, str(version_id), str(document_id)),
        )
        if cur.rowcount == 0:
            raise LookupError("Version not found")

        if entity_type and entity_id and env_id:
            _insert_entity_link(
                cur,
                document_id=str(document_id),
                env_id=str(env_id),
                entity_type=entity_type,
                entity_id=str(entity_id),
            )


def list_documents(
    business_id: UUID,
    department_id: UUID | None = None,
    env_id: UUID | None = None,
    entity_type: str | None = None,
    entity_id: UUID | None = None,
    tags: list[str] | None = None,
) -> list[dict]:
    has_entity_scope = any([env_id, entity_type, entity_id])
    if has_entity_scope and not (env_id and entity_type and entity_id):
        raise ValueError("env_id, entity_type, and entity_id are required together")
    if entity_type and entity_type not in _ENTITY_TO_SEGMENT:
        raise ValueError("entity_type must be one of: fund, investment, asset")

    with get_cursor() as cur:
        conditions = ["d.business_id = %s"]
        params: list = [str(business_id)]

        if department_id:
            conditions.append("d.department_id = %s")
            params.append(str(department_id))

        if tags:
            conditions.append(
                "EXISTS (SELECT 1 FROM app.document_tags dt WHERE dt.document_id = d.document_id AND dt.tag = ANY(%s))"
            )
            params.append(tags)

        if has_entity_scope:
            conditions.append(
                """EXISTS (
                     SELECT 1
                     FROM app.document_entity_links del
                     WHERE del.document_id = d.document_id
                       AND del.env_id = %s
                       AND del.entity_type = %s
                       AND del.entity_id = %s
                   )"""
            )
            params.extend([str(env_id), entity_type, str(entity_id)])

        where = " AND ".join(conditions)

        cur.execute(
            f"""SELECT d.document_id, d.business_id, d.department_id, d.title,
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
               WHERE {where}
               ORDER BY d.created_at DESC""",
            params,
        )
        return cur.fetchall()


def list_versions(document_id: UUID) -> list[dict]:
    with get_cursor() as cur:
        cur.execute(
            """SELECT version_id, document_id, version_number, state::text as state,
                      original_filename, mime_type, size_bytes, content_hash, created_at
               FROM app.document_versions
               WHERE document_id = %s
               ORDER BY version_number DESC""",
            (str(document_id),),
        )
        return cur.fetchall()


def get_download_url(document_id: UUID, version_id: UUID) -> str:
    with get_cursor() as cur:
        cur.execute(
            "SELECT bucket, object_key FROM app.document_versions WHERE version_id = %s AND document_id = %s",
            (str(version_id), str(document_id)),
        )
        row = cur.fetchone()
        if not row:
            raise LookupError("Version not found")

        return _storage.generate_signed_download_url(row["bucket"], row["object_key"])


def add_tag(document_id: UUID, tag: str, actor: str) -> None:
    normalized = tag.strip().lower()
    if not normalized:
        raise ValueError("Tag cannot be empty")
    with get_cursor() as cur:
        cur.execute(
            "SELECT tenant_id FROM app.documents WHERE document_id = %s",
            (str(document_id),),
        )
        doc = cur.fetchone()
        if not doc:
            raise LookupError("Document not found")
        cur.execute(
            """INSERT INTO app.document_tags (tenant_id, document_id, tag, created_by)
               VALUES (%s, %s, %s, %s)
               ON CONFLICT (document_id, tag) DO NOTHING""",
            (str(doc["tenant_id"]), str(document_id), normalized, actor),
        )


def remove_tag(document_id: UUID, tag: str) -> None:
    normalized = tag.strip().lower()
    with get_cursor() as cur:
        cur.execute(
            "DELETE FROM app.document_tags WHERE document_id = %s AND tag = %s",
            (str(document_id), normalized),
        )
