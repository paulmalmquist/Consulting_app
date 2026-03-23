import { getPool, resolveBusinessId } from "@/lib/server/db";

export const runtime = "nodejs";

export async function OPTIONS() {
  return new Response(null, { status: 200, headers: { Allow: "GET, POST, OPTIONS" } });
}

/**
 * GET /api/re/v2/saved-analyses?env_id=X&business_id=Y&collection_id=Z
 *
 * Returns saved analyses, optionally filtered by collection.
 */
export async function GET(request: Request) {
  const pool = getPool();
  const empty = { analyses: [] as Record<string, unknown>[] };
  if (!pool) return Response.json(empty);

  const { searchParams } = new URL(request.url);
  const envId = searchParams.get("env_id");
  const collectionId = searchParams.get("collection_id");

  try {
    const businessId = await resolveBusinessId(pool, envId, searchParams.get("business_id"));
    if (!businessId) return Response.json(empty);

    const params: (string | null)[] = [businessId];
    let idx = 2;
    let collectionJoin = "";
    let collectionFilter = "";
    let collectionSelect = "NULL AS collection_name";

    if (collectionId) {
      collectionJoin = `
        JOIN analytics_collection_membership acm ON acm.query_id = aq.id
        JOIN analytics_collection ac ON ac.id = acm.collection_id`;
      collectionFilter = ` AND acm.collection_id = $${idx}::uuid`;
      collectionSelect = "ac.name AS collection_name";
      params.push(collectionId);
      idx++;
    } else {
      collectionJoin = `
        LEFT JOIN analytics_collection_membership acm ON acm.query_id = aq.id
        LEFT JOIN analytics_collection ac ON ac.id = acm.collection_id`;
    }

    if (envId) {
      // env_id filter already handled via business_id resolution, but also direct-filter
    }

    const res = await pool.query(
      `SELECT
         aq.id::text,
         aq.title,
         aq.description,
         aq.nl_prompt,
         aq.created_by,
         aq.created_at::text,
         aq.updated_at::text,
         ${collectionSelect}
       FROM analytics_query aq
       ${collectionJoin}
       WHERE aq.business_id = $1::uuid${collectionFilter}
       ORDER BY aq.created_at DESC
       LIMIT 200`,
      params
    );

    return Response.json({ analyses: res.rows });
  } catch (err) {
    console.error("[re/v2/saved-analyses] DB error", err);
    return Response.json(empty);
  }
}

/**
 * POST /api/re/v2/saved-analyses
 *
 * Save a new analysis query.
 * Body: { title, description?, nl_prompt?, sql_text?, visualization_spec?, env_id, business_id, collection_id? }
 */
export async function POST(request: Request) {
  const pool = getPool();
  if (!pool) return Response.json({ error: "Database unavailable" }, { status: 503 });

  try {
    const body = await request.json();
    const {
      title,
      description,
      nl_prompt,
      sql_text,
      visualization_spec,
      env_id,
      business_id,
      collection_id,
    } = body as {
      title?: string;
      description?: string;
      nl_prompt?: string;
      sql_text?: string;
      visualization_spec?: unknown;
      env_id?: string;
      business_id?: string;
      collection_id?: string;
    };

    if (!title || !env_id || !business_id) {
      return Response.json(
        { error: "title, env_id, and business_id are required" },
        { status: 400 }
      );
    }

    const insertRes = await pool.query(
      `INSERT INTO analytics_query
         (env_id, business_id, title, description, nl_prompt, sql_text, visualization_spec)
       VALUES ($1, $2::uuid, $3, $4, $5, $6, $7::jsonb)
       RETURNING id::text, title`,
      [
        env_id,
        business_id,
        title,
        description || null,
        nl_prompt || null,
        sql_text || null,
        visualization_spec ? JSON.stringify(visualization_spec) : null,
      ]
    );

    const newQuery = insertRes.rows[0];

    // Optionally link to a collection
    if (collection_id && newQuery) {
      try {
        await pool.query(
          `INSERT INTO analytics_collection_membership (collection_id, query_id)
           VALUES ($1::uuid, $2::uuid)
           ON CONFLICT DO NOTHING`,
          [collection_id, newQuery.id]
        );
      } catch (linkErr) {
        console.error("[re/v2/saved-analyses] Collection link error", linkErr);
      }
    }

    return Response.json(newQuery, { status: 201 });
  } catch (err) {
    console.error("[re/v2/saved-analyses] POST error", err);
    return Response.json(
      { error: (err instanceof Error ? err.message : String(err)) || "Failed to save analysis" },
      { status: 500 }
    );
  }
}
