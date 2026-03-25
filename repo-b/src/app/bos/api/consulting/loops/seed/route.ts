import { getPool } from "@/lib/server/db";
import { randomUUID } from "crypto";

export const runtime = "nodejs";

const ENV_ID = "62cfd59c-a171-4224-ad1e-fffc35bd1ef4";
const BUSINESS_ID = "225f52ca-cdf4-4af9-a973-d1d310ddcba1";

const LOOP_DEFS = [
  {
    name: "Monthly Financial Reporting",
    process_domain: "reporting",
    description: "End-to-end monthly close process including journal entries, reconciliation, and report generation.",
    trigger_type: "scheduled",
    frequency_type: "monthly",
    frequency_per_year: 12,
    status: "observed",
    control_maturity_stage: 2,
    automation_readiness_score: 65,
    avg_wait_time_minutes: 120,
    rework_rate_percent: 15,
    roles: [
      { role_name: "Senior Analyst", loaded_hourly_rate: 95, active_minutes: 90, notes: "Prepares financial statements" },
      { role_name: "Controller", loaded_hourly_rate: 75, active_minutes: 45, notes: "Reviews and approves" },
    ],
  },
  {
    name: "Quarterly Board Deck",
    process_domain: "reporting",
    description: "Quarterly board presentation assembly including data collection, narrative, and executive review.",
    trigger_type: "scheduled",
    frequency_type: "quarterly",
    frequency_per_year: 4,
    status: "observed",
    control_maturity_stage: 1,
    automation_readiness_score: 40,
    avg_wait_time_minutes: 240,
    rework_rate_percent: 25,
    roles: [
      { role_name: "Director", loaded_hourly_rate: 150, active_minutes: 180, notes: "Narrative and strategy slides" },
      { role_name: "Analyst", loaded_hourly_rate: 80, active_minutes: 120, notes: "Data gathering and chart creation" },
    ],
  },
  {
    name: "Weekly Status Update",
    process_domain: "operations",
    description: "Weekly team status collection, summarization, and distribution to stakeholders.",
    trigger_type: "scheduled",
    frequency_type: "weekly",
    frequency_per_year: 52,
    status: "automating",
    control_maturity_stage: 3,
    automation_readiness_score: 85,
    avg_wait_time_minutes: 30,
    rework_rate_percent: 5,
    roles: [
      { role_name: "Project Manager", loaded_hourly_rate: 110, active_minutes: 45, notes: "Compile and distribute" },
    ],
  },
  {
    name: "Client Invoice Reconciliation",
    process_domain: "finance",
    description: "Monthly reconciliation of client invoices against time entries and project budgets.",
    trigger_type: "scheduled",
    frequency_type: "monthly",
    frequency_per_year: 12,
    status: "simplifying",
    control_maturity_stage: 2,
    automation_readiness_score: 55,
    avg_wait_time_minutes: 60,
    rework_rate_percent: 12,
    roles: [
      { role_name: "Finance Manager", loaded_hourly_rate: 120, active_minutes: 60, notes: "Reconciliation and approval" },
      { role_name: "Staff Accountant", loaded_hourly_rate: 70, active_minutes: 30, notes: "Data entry and matching" },
    ],
  },
  {
    name: "New Client Onboarding",
    process_domain: "sales",
    description: "End-to-end onboarding including contract setup, system provisioning, and kickoff coordination.",
    trigger_type: "event",
    frequency_type: "ad_hoc",
    frequency_per_year: 24,
    status: "observed",
    control_maturity_stage: 1,
    automation_readiness_score: 30,
    avg_wait_time_minutes: 180,
    rework_rate_percent: 20,
    roles: [
      { role_name: "Account Executive", loaded_hourly_rate: 130, active_minutes: 120, notes: "Handoff and kickoff" },
      { role_name: "Operations Specialist", loaded_hourly_rate: 85, active_minutes: 90, notes: "System setup and provisioning" },
    ],
  },
];

export async function POST() {
  const pool = getPool();
  if (!pool) {
    return Response.json({ error: "DB not configured" }, { status: 503 });
  }

  const results: string[] = [];
  let seeded = 0;

  try {
    for (const def of LOOP_DEFS) {
      const loopId = randomUUID();

      const insRes = await pool.query(
        `INSERT INTO nv_loop
           (id, env_id, business_id, name, process_domain, description,
            trigger_type, frequency_type, frequency_per_year, status,
            control_maturity_stage, automation_readiness_score,
            avg_wait_time_minutes, rework_rate_percent)
         VALUES ($1::uuid, $2, $3::uuid, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
         ON CONFLICT (env_id, business_id, name) DO NOTHING
         RETURNING id`,
        [
          loopId, ENV_ID, BUSINESS_ID,
          def.name, def.process_domain, def.description,
          def.trigger_type, def.frequency_type, def.frequency_per_year, def.status,
          def.control_maturity_stage, def.automation_readiness_score,
          def.avg_wait_time_minutes, def.rework_rate_percent,
        ],
      );

      if (insRes.rows.length > 0) {
        for (const role of def.roles) {
          await pool.query(
            `INSERT INTO nv_loop_role (id, loop_id, role_name, loaded_hourly_rate, active_minutes, notes)
             VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6)`,
            [randomUUID(), loopId, role.role_name, role.loaded_hourly_rate, role.active_minutes, role.notes],
          );
        }
        seeded++;
        results.push(`Seeded "${def.name}" with ${def.roles.length} roles`);
      } else {
        results.push(`"${def.name}" already exists — skipped`);
      }
    }

    return Response.json({
      status: "success",
      loops_seeded: seeded,
      results,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[bos.consulting.loops.seed] failed", { error: message });
    return Response.json({ error: message, results }, { status: 500 });
  }
}
