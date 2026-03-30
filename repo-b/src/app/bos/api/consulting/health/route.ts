import { NextRequest } from "next/server";
import { getPool } from "@/lib/server/db";

export const runtime = "nodejs";

/**
 * Required tables grouped by migration file.
 * Used to map missing tables → which migration to run.
 */
const MIGRATION_TABLE_MAP: Record<string, { migration: string; tables: string[] }> = {
  "260": {
    migration: "260_crm_native.sql",
    tables: [
      "crm_account",
      "crm_contact",
      "crm_pipeline_stage",
      "crm_opportunity",
      "crm_opportunity_stage_history",
      "crm_activity",
    ],
  },
  "280": {
    migration: "280_consulting_revenue_os.sql",
    tables: [
      "cro_lead_profile",
      "cro_contact_profile",
      "cro_outreach_template",
      "cro_outreach_log",
      "cro_proposal",
      "cro_client",
      "cro_engagement",
      "cro_revenue_schedule",
      "cro_revenue_metrics_snapshot",
    ],
  },
  "281": {
    migration: "281_strategic_outreach_engine.sql",
    tables: [
      "cro_strategic_lead",
      "cro_lead_hypothesis",
      "cro_strategic_contact",
      "cro_outreach_sequence",
      "cro_trigger_signal",
      "cro_diagnostic_session",
      "cro_deliverable",
    ],
  },
  "302": {
    migration: "302_consulting_loop_intelligence.sql",
    tables: ["nv_loop", "nv_loop_role", "nv_loop_intervention"],
  },
  "311": {
    migration: "311_crm_next_actions.sql",
    tables: ["cro_next_action"],
  },
  "431": {
    migration: "431_consulting_proof_assets_objections.sql",
    tables: ["cro_proof_asset", "cro_objection", "cro_demo_readiness"],
  },
};

const ALL_REQUIRED_TABLES = Object.values(MIGRATION_TABLE_MAP).flatMap((m) => m.tables);

export async function GET(_request: NextRequest) {
  const pool = getPool();
  if (!pool) {
    return Response.json(
      { error_code: "CONFIG_ERROR", message: "DATABASE_URL is not configured." },
      { status: 503 },
    );
  }

  try {
    // Check which tables exist
    const { rows: existingRows } = await pool.query<{ tablename: string }>(
      `SELECT tablename FROM pg_catalog.pg_tables
       WHERE schemaname = 'public'
         AND tablename = ANY($1::text[])`,
      [ALL_REQUIRED_TABLES],
    );

    const existingSet = new Set(existingRows.map((r) => r.tablename));
    const tablesFound = ALL_REQUIRED_TABLES.filter((t) => existingSet.has(t));
    const tablesMissing = ALL_REQUIRED_TABLES.filter((t) => !existingSet.has(t));

    // Determine which migrations are needed
    const migrationsNeeded: string[] = [];
    for (const [num, entry] of Object.entries(MIGRATION_TABLE_MAP)) {
      const missing = entry.tables.filter((t) => !existingSet.has(t));
      if (missing.length > 0) {
        migrationsNeeded.push(`${num} (${entry.migration}) — missing: ${missing.join(", ")}`);
      }
    }

    const schemaReady = tablesMissing.length === 0;

    // Check seed status (row counts for key tables)
    let seedStatus: Record<string, number> = {};
    if (schemaReady) {
      const seedTables = ["cro_lead_profile", "cro_next_action", "cro_proposal", "crm_pipeline_stage"];
      for (const table of seedTables) {
        try {
          const { rows } = await pool.query(`SELECT COUNT(*)::int AS cnt FROM ${table}`);
          seedStatus[table] = rows[0]?.cnt ?? 0;
        } catch {
          seedStatus[table] = -1;
        }
      }
    }

    const hasData = Object.values(seedStatus).some((v) => v > 0);

    // Last activity
    let lastActivity: string | null = null;
    if (existingSet.has("crm_activity")) {
      try {
        const { rows } = await pool.query(
          `SELECT MAX(activity_date)::text AS last_at FROM crm_activity`,
        );
        lastActivity = rows[0]?.last_at ?? null;
      } catch {
        lastActivity = null;
      }
    }

    return Response.json({
      schema_ready: schemaReady,
      tables_found: tablesFound,
      tables_missing: tablesMissing,
      migrations_needed: migrationsNeeded,
      seed_status: seedStatus,
      has_data: hasData,
      last_activity: lastActivity,
      total_required: ALL_REQUIRED_TABLES.length,
      total_found: tablesFound.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[bos.consulting.health] failed", { error: message });
    return Response.json(
      { error_code: "INTERNAL_ERROR", message: "Health check failed.", detail: message },
      { status: 500 },
    );
  }
}
