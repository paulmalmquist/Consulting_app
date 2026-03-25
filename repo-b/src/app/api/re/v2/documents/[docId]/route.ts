import { getPool } from "@/lib/server/db";

export const runtime = "nodejs";

export async function OPTIONS() {
  return new Response(null, { status: 200, headers: { Allow: "GET, OPTIONS" } });
}

/**
 * GET /api/re/v2/documents/[docId]?business_id=Y
 *
 * Returns document detail with versions, tags, and entity links.
 */
export async function GET(
  request: Request,
  { params }: { params: { docId: string } }
) {
  const pool = getPool();
  if (!pool) return Response.json({ error: "Database unavailable" }, { status: 503 });

  const { searchParams } = new URL(request.url);
  const businessId = searchParams.get("business_id");
  const docId = params.docId;

  if (!docId || !businessId) {
    return Response.json(
      { error: "docId and business_id are required" },
      { status: 400 }
    );
  }

  try {
    // Fetch document metadata
    const docRes = await pool.query(
      `SELECT
         d.id::text,
         d.business_id::text,
         d.department_id::text,
         d.title,
         d.description,
         d.status,
         d.domain,
         d.classification,
         d.virtual_path,
         d.created_at::text,
         d.updated_at::text,
         d.created_by
       FROM app.documents d
       WHERE d.id = $1::uuid AND d.business_id = $2::uuid`,
      [docId, businessId]
    );

    if (docRes.rows.length === 0) {
      return Response.json({ error: "Document not found" }, { status: 404 });
    }

    const document = docRes.rows[0];

    // Fetch versions
    const versionsRes = await pool.query(
      `SELECT
         id::text,
         version_number,
         state,
         size_bytes,
         content_hash,
         finalized_at::text,
         created_at::text
       FROM app.document_versions
       WHERE document_id = $1::uuid
       ORDER BY version_number DESC`,
      [docId]
    );

    // Fetch tags
    const tagsRes = await pool.query(
      `SELECT id::text, tag, created_by
       FROM app.document_tags
       WHERE document_id = $1::uuid
       ORDER BY tag`,
      [docId]
    );

    // Fetch entity links
    const linksRes = await pool.query(
      `SELECT
         id::text,
         env_id,
         entity_type,
         entity_id::text
       FROM app.document_entity_links
       WHERE document_id = $1::uuid`,
      [docId]
    );

    return Response.json({
      ...document,
      versions: versionsRes.rows,
      tags: tagsRes.rows,
      entity_links: linksRes.rows,
    });
  } catch (err) {
    console.error("[re/v2/documents/[docId]] DB error", err);
    return Response.json(
      { error: (err instanceof Error ? err.message : String(err)) || "Internal error" },
      { status: 500 }
    );
  }
}
