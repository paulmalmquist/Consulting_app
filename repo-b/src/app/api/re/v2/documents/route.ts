import { getPool, resolveBusinessId } from "@/lib/server/db";

export const runtime = "nodejs";

export async function OPTIONS() {
  return new Response(null, { status: 200, headers: { Allow: "GET, OPTIONS" } });
}

/**
 * GET /api/re/v2/documents?env_id=X&business_id=Y&classification=C&domain=D&entity_type=T&entity_id=E&status=S
 *
 * Returns documents with latest version info, tags, and entity links.
 */
export async function GET(request: Request) {
  const pool = getPool();
  const empty = { documents: [] as Record<string, unknown>[] };
  if (!pool) return Response.json(empty);

  const { searchParams } = new URL(request.url);
  const envId = searchParams.get("env_id");
  const classification = searchParams.get("classification");
  const domain = searchParams.get("domain");
  const entityType = searchParams.get("entity_type");
  const entityId = searchParams.get("entity_id");
  const status = searchParams.get("status");

  try {
    const businessId = await resolveBusinessId(pool, envId, searchParams.get("business_id"));
    if (!businessId) return Response.json(empty);

    const params: (string | null)[] = [businessId];
    let idx = 2;
    let filters = "";
    let entityJoinFilter = "";

    if (classification) {
      filters += ` AND d.classification = $${idx}`;
      params.push(classification);
      idx++;
    }

    if (domain) {
      filters += ` AND d.domain = $${idx}`;
      params.push(domain);
      idx++;
    }

    if (status) {
      filters += ` AND d.status = $${idx}`;
      params.push(status);
      idx++;
    }

    if (entityType) {
      entityJoinFilter += ` AND el_filter.entity_type = $${idx}`;
      params.push(entityType);
      idx++;
    }

    if (entityId) {
      entityJoinFilter += ` AND el_filter.entity_id = $${idx}::uuid`;
      params.push(entityId);
      idx++;
    }

    let entityFilterJoin = "";
    if (entityType || entityId) {
      entityFilterJoin = `
        JOIN app.document_entity_links el_filter
          ON el_filter.document_id = d.id${entityJoinFilter}`;
    }

    const res = await pool.query(
      `SELECT
         d.id::text,
         d.title,
         d.description,
         d.classification,
         d.domain,
         d.status,
         d.virtual_path,
         d.created_at::text,
         d.updated_at::text,
         d.created_by,
         (SELECT COUNT(*)::int FROM app.document_versions dv WHERE dv.document_id = d.id) AS version_count,
         (SELECT dv2.size_bytes
          FROM app.document_versions dv2
          WHERE dv2.document_id = d.id
          ORDER BY dv2.version_number DESC
          LIMIT 1) AS size_bytes,
         (SELECT COALESCE(json_agg(dt.tag), '[]'::json)
          FROM app.document_tags dt
          WHERE dt.document_id = d.id) AS tags,
         (SELECT COALESCE(json_agg(json_build_object(
            'entity_type', del.entity_type,
            'entity_id', del.entity_id::text,
            'env_id', del.env_id
          )), '[]'::json)
          FROM app.document_entity_links del
          WHERE del.document_id = d.id) AS entity_links
       FROM app.documents d
       ${entityFilterJoin}
       WHERE d.business_id = $1::uuid${filters}
       ORDER BY d.updated_at DESC
       LIMIT 200`,
      params
    );

    return Response.json({ documents: res.rows });
  } catch (err) {
    console.error("[re/v2/documents] DB error", err);
    return Response.json(empty);
  }
}
