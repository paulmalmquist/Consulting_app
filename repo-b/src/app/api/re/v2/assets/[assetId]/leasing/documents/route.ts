import { getPool } from "@/lib/server/db";

export const runtime = "nodejs";

export async function OPTIONS() {
  return new Response(null, { status: 200, headers: { Allow: "GET, OPTIONS" } });
}

export async function GET(
  _req: Request,
  { params }: { params: { assetId: string } }
) {
  const pool = getPool();
  if (!pool) return Response.json({ documents: [] }, { status: 200 });

  try {
    const { rows } = await pool.query(
      `SELECT
         d.doc_id,
         d.lease_id,
         t.name   AS tenant_name,
         d.doc_type,
         d.file_name,
         d.parser_status,
         d.confidence::float8,
         d.uploaded_at
       FROM re_lease_document d
       JOIN re_lease  l ON l.lease_id  = d.lease_id
       JOIN re_tenant t ON t.tenant_id = l.tenant_id
       WHERE l.asset_id = $1::uuid
       ORDER BY d.uploaded_at DESC`,
      [params.assetId]
    );

    return Response.json({ documents: rows });
  } catch (err) {
    console.error("[leasing/documents] DB error", err);
    return Response.json({ documents: [] }, { status: 200 });
  }
}
