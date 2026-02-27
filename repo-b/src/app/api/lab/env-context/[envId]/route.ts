import { NextRequest } from "next/server";
import { getPool, resolveBusinessId } from "@/lib/server/db";

export const runtime = "nodejs";

type EnvironmentRow = {
  env_id: string;
  client_name: string;
  industry: string;
  industry_type: string | null;
  business_id: string | null;
  is_active: boolean;
  notes: string | null;
};

type ExistingBusinessRow = {
  business_id: string;
  tenant_id: string | null;
  name: string;
  slug: string;
  region: string | null;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const schemaCache = new Map<string, boolean>();

async function hasTable(
  pool: NonNullable<ReturnType<typeof getPool>>,
  schemaName: string,
  tableName: string,
): Promise<boolean> {
  const cacheKey = `table:${schemaName}.${tableName}`;
  if (schemaCache.has(cacheKey)) {
    return Boolean(schemaCache.get(cacheKey));
  }
  try {
    const { rows } = await pool.query<{ exists: boolean }>(
      `SELECT EXISTS (
         SELECT 1
         FROM information_schema.tables
         WHERE table_schema = $1
           AND table_name = $2
       ) AS exists`,
      [schemaName, tableName],
    );
    const exists = Boolean(rows[0]?.exists);
    schemaCache.set(cacheKey, exists);
    return exists;
  } catch {
    schemaCache.set(cacheKey, false);
    return false;
  }
}

async function hasColumn(
  pool: NonNullable<ReturnType<typeof getPool>>,
  schemaName: string,
  tableName: string,
  columnName: string,
): Promise<boolean> {
  const cacheKey = `column:${schemaName}.${tableName}.${columnName}`;
  if (schemaCache.has(cacheKey)) {
    return Boolean(schemaCache.get(cacheKey));
  }
  try {
    const { rows } = await pool.query<{ exists: boolean }>(
      `SELECT EXISTS (
         SELECT 1
         FROM information_schema.columns
         WHERE table_schema = $1
           AND table_name = $2
           AND column_name = $3
       ) AS exists`,
      [schemaName, tableName, columnName],
    );
    const exists = Boolean(rows[0]?.exists);
    schemaCache.set(cacheKey, exists);
    return exists;
  } catch {
    schemaCache.set(cacheKey, false);
    return false;
  }
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

async function ensureBusinessBinding(
  pool: NonNullable<ReturnType<typeof getPool>>,
  env: EnvironmentRow,
  hasBusinessIdColumn: boolean,
): Promise<string | null> {
  const [hasBindingsTable, hasAppBusinessesTable, hasAppTenantsTable] =
    await Promise.all([
    hasTable(pool, "app", "env_business_bindings"),
    hasTable(pool, "app", "businesses"),
    hasTable(pool, "app", "tenants"),
  ]);

  if (!hasBindingsTable || !hasAppBusinessesTable || !hasAppTenantsTable) {
    return null;
  }

  const [hasPublicTenantTable, hasPublicBusinessTable] = await Promise.all([
    hasTable(pool, "public", "tenant"),
    hasTable(pool, "public", "business"),
  ]);

  const slug = slugify(`${env.client_name}-${env.env_id.slice(0, 8)}`) || `env-${env.env_id.slice(0, 8)}`;
  const businessName = `${env.client_name} Workspace`;
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    let businessId: string | null = null;
    let tenantId: string | null = null;
    let persistedName = businessName;
    let persistedSlug = slug;
    let region = "us";

    const existing = await client.query<ExistingBusinessRow>(
      `SELECT business_id::text,
              tenant_id::text,
              name,
              slug,
              region
         FROM app.businesses
        WHERE slug = $1
        LIMIT 1`,
      [slug],
    );

    if (existing.rows[0]) {
      businessId = existing.rows[0].business_id;
      tenantId = existing.rows[0].tenant_id;
      persistedName = existing.rows[0].name;
      persistedSlug = existing.rows[0].slug;
      region = existing.rows[0].region || "us";
    }

    if (!tenantId) {
      const tenantRes = await client.query<{ tenant_id: string }>(
        `INSERT INTO app.tenants (name)
         VALUES ($1)
         RETURNING tenant_id::text`,
        [persistedName],
      );
      tenantId = tenantRes.rows[0]?.tenant_id ?? null;
      if (!tenantId) {
        throw new Error("Failed to create tenant for environment context.");
      }
    }

    if (!businessId) {
      const businessRes = await client.query<{ business_id: string }>(
        `INSERT INTO app.businesses (tenant_id, name, slug, region)
         VALUES ($1::uuid, $2, $3, $4)
         RETURNING business_id::text`,
        [tenantId, persistedName, persistedSlug, region],
      );
      businessId = businessRes.rows[0]?.business_id ?? null;
      if (!businessId) {
        throw new Error("Failed to create business for environment context.");
      }
    } else {
      await client.query(
        `UPDATE app.businesses
            SET tenant_id = COALESCE(tenant_id, $2::uuid)
          WHERE business_id = $1::uuid`,
        [businessId, tenantId],
      );
    }

    const canonicalTenantSlug = `${persistedSlug}-${tenantId.slice(0, 8)}`;

    if (hasPublicTenantTable) {
      try {
        await client.query(
          `INSERT INTO tenant (tenant_id, name, slug)
           VALUES ($1::uuid, $2, $3)
           ON CONFLICT (tenant_id) DO NOTHING`,
          [tenantId, persistedName, canonicalTenantSlug],
        );
      } catch (error) {
        console.warn("[lab.env-context] public.tenant sync skipped", {
          envId: env.env_id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    if (hasPublicBusinessTable) {
      try {
        await client.query(
          `INSERT INTO business (business_id, tenant_id, name, slug, region)
           VALUES ($1::uuid, $2::uuid, $3, $4, $5)
           ON CONFLICT (business_id) DO NOTHING`,
          [businessId, tenantId, persistedName, persistedSlug, region],
        );
      } catch (error) {
        console.warn("[lab.env-context] public.business sync skipped", {
          envId: env.env_id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    await client.query(
      `INSERT INTO app.env_business_bindings (env_id, business_id)
       VALUES ($1::uuid, $2::uuid)
       ON CONFLICT (env_id) DO UPDATE SET business_id = EXCLUDED.business_id`,
      [env.env_id, businessId],
    );

    if (hasBusinessIdColumn) {
      await client.query(
        `UPDATE app.environments
            SET business_id = $2::uuid
          WHERE env_id = $1::uuid`,
        [env.env_id, businessId],
      );
    }

    await client.query("COMMIT");
    return businessId;
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("[lab.env-context] auto-bind failed", {
      envId: env.env_id,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  } finally {
    client.release();
  }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: { envId: string } }
) {
  if (!UUID_RE.test(params.envId)) {
    return Response.json({ message: "Invalid environment id." }, { status: 400 });
  }

  const pool = getPool();
  if (!pool) {
    return Response.json(
      { message: "Environment context unavailable: DATABASE_URL is not configured." },
      { status: 503 }
    );
  }

  try {
    const [industryTypeEnabled, businessIdEnabled] = await Promise.all([
      hasColumn(pool, "app", "environments", "industry_type"),
      hasColumn(pool, "app", "environments", "business_id"),
    ]);

    const { rows } = await pool.query<EnvironmentRow>(
      `SELECT env_id::text,
              client_name,
              industry,
              ${industryTypeEnabled ? "COALESCE(industry_type, industry)" : "industry"} AS industry_type,
              ${businessIdEnabled ? "business_id::text" : "NULL::text"} AS business_id,
              is_active,
              notes
         FROM app.environments
        WHERE env_id = $1::uuid
        LIMIT 1`,
      [params.envId]
    );

    const env = rows[0];
    if (!env) {
      return Response.json({ message: "Environment not found." }, { status: 404 });
    }

    let businessId = env.business_id || null;

    if (!businessId) {
      try {
        businessId = await resolveBusinessId(pool, params.envId, null);
      } catch (error) {
        console.warn("[lab.env-context] binding lookup skipped", {
          envId: params.envId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    if (!businessId) {
      businessId = await ensureBusinessBinding(pool, env, businessIdEnabled);
    }

    if (!businessId) {
      return Response.json(
        { message: "Environment is not bound to a business." },
        { status: 409 }
      );
    }

    return Response.json({
      env_id: env.env_id,
      client_name: env.client_name,
      industry: env.industry,
      industry_type: env.industry_type || env.industry,
      business_id: businessId,
      is_active: env.is_active,
      notes: env.notes,
    });
  } catch (error) {
    console.error("[lab.env-context] resolve failed", {
      envId: params.envId,
      error: error instanceof Error ? error.message : String(error),
    });
    return Response.json(
      { message: "Failed to resolve environment context." },
      { status: 500 }
    );
  }
}
