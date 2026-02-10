/**
 * verify.js — Schema verification for Business OS backbone.
 *
 * Connects to the database and verifies:
 * 1. All expected tables exist
 * 2. Tenant-scoped tables have tenant_id column
 * 3. RLS is enabled on tenant-scoped tables
 * 4. Traceability columns exist on fact tables
 * 5. Key constraints exist
 *
 * Exits non-zero on any failure.
 *
 * Env: DATABASE_URL or SUPABASE_DB_URL
 */

const { Client } = require('pg');

const databaseUrl = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
if (!databaseUrl) {
  console.error('ERROR: DATABASE_URL or SUPABASE_DB_URL must be set.');
  process.exit(1);
}

// Tables that must have tenant_id and RLS
const TENANT_SCOPED_TABLES = [
  // Backbone
  'tenant', 'business', 'actor', 'role', 'object', 'event_log',
  'attachment', 'tag', 'dataset', 'rule_set', 'run',
  // Reporting
  'metric', 'dimension', 'report', 'dashboard', 'insight',
  'saved_query', 'fact_measurement', 'fact_status_timeline',
  // Accounting
  'account', 'cost_center', 'entity_legal', 'counterparty',
  'journal_entry', 'journal_line', 'invoice_ar', 'invoice_line_ar',
  'bill_ap', 'bill_line_ap', 'payment', 'reconciliation', 'close_task',
  // Projects
  'project', 'work_breakdown_item', 'milestone', 'resource',
  'assignment', 'timesheet', 'time_entry', 'issue', 'risk', 'change_order',
  // Property
  'property', 'unit', 'tenant_party', 'lease', 'lease_charge',
  'work_order', 'rent_roll_snapshot', 'capex_project', 'loan', 'appraisal',
  // Milestones
  'milestone_template', 'milestone_instance', 'milestone_event',
];

// Tables without tenant_id (global or join tables)
const GLOBAL_TABLES = [
  'dim_date', 'dim_currency', 'fx_rate',
  'object_type', 'object_version', 'object_tag',
  'actor_role', 'role_permission', 'permission',
  'module', 'module_dependency',
  'metric_version', 'report_version', 'dashboard_version',
  'dataset_version', 'rule_version', 'run_output',
  'invoice_line_ar', 'bill_line_ap',
  'business_module',
];

// Fact tables that must have traceability columns
const TRACEABLE_TABLES = [
  { table: 'fact_measurement', columns: ['dataset_version_id', 'rule_version_id', 'run_id'] },
  { table: 'rent_roll_snapshot', columns: ['dataset_version_id', 'rule_version_id', 'run_id'] },
];

async function main() {
  const client = new Client({
    connectionString: databaseUrl,
    ssl: databaseUrl.includes('supabase.co') ? { rejectUnauthorized: false } : undefined,
  });
  await client.connect();

  let passed = 0;
  let failed = 0;

  function pass(msg) { console.log(`  PASS  ${msg}`); passed++; }
  function fail(msg) { console.log(`  FAIL  ${msg}`); failed++; }

  try {
    console.log('Business OS Schema Verification');
    console.log('================================\n');

    // 1. Check all expected tables exist
    console.log('1. Table existence:');
    const allExpected = [...new Set([...TENANT_SCOPED_TABLES, ...GLOBAL_TABLES])];
    const { rows: existingTables } = await client.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    `);
    const tableSet = new Set(existingTables.map(r => r.table_name));

    for (const t of allExpected) {
      if (tableSet.has(t)) {
        pass(t);
      } else {
        fail(`${t} — table not found`);
      }
    }

    // 2. Tenant-scoped tables have tenant_id
    console.log('\n2. Tenant ID column:');
    const { rows: columns } = await client.query(`
      SELECT table_name, column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND column_name = 'tenant_id'
    `);
    const tablesWithTenantId = new Set(columns.map(r => r.table_name));

    for (const t of TENANT_SCOPED_TABLES) {
      if (!tableSet.has(t)) continue; // skip if table doesn't exist (already failed above)
      if (tablesWithTenantId.has(t)) {
        pass(`${t}.tenant_id`);
      } else {
        fail(`${t} — missing tenant_id column`);
      }
    }

    // 3. RLS enabled
    console.log('\n3. Row-Level Security:');
    const { rows: rlsRows } = await client.query(`
      SELECT relname, relrowsecurity
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r'
    `);
    const rlsMap = new Map(rlsRows.map(r => [r.relname, r.relrowsecurity]));

    for (const t of TENANT_SCOPED_TABLES) {
      if (!tableSet.has(t)) continue;
      if (rlsMap.get(t) === true) {
        pass(`${t} RLS enabled`);
      } else {
        fail(`${t} — RLS not enabled`);
      }
    }

    // Also check business_module
    if (rlsMap.get('business_module') === true) {
      pass('business_module RLS enabled');
    } else if (tableSet.has('business_module')) {
      fail('business_module — RLS not enabled');
    }

    // 4. Traceability columns on fact tables
    console.log('\n4. Traceability columns:');
    for (const { table, columns: reqCols } of TRACEABLE_TABLES) {
      if (!tableSet.has(table)) continue;
      const { rows: tableCols } = await client.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1
      `, [table]);
      const colSet = new Set(tableCols.map(r => r.column_name));
      for (const col of reqCols) {
        if (colSet.has(col)) {
          pass(`${table}.${col}`);
        } else {
          fail(`${table} — missing traceability column: ${col}`);
        }
      }
    }

    // 5. Key views exist
    console.log('\n5. Views:');
    const expectedViews = [
      'v_object_current_version',
      'v_project_current',
      'v_property_current',
      'v_lease_active',
      'v_milestone_instance_detail',
      'v_run_detail',
    ];
    const { rows: viewRows } = await client.query(`
      SELECT table_name FROM information_schema.views
      WHERE table_schema = 'public'
    `);
    const viewSet = new Set(viewRows.map(r => r.table_name));
    for (const v of expectedViews) {
      if (viewSet.has(v)) {
        pass(v);
      } else {
        fail(`${v} — view not found`);
      }
    }

    // 6. Key functions exist
    console.log('\n6. Functions:');
    const expectedFunctions = [
      'close_and_create_version',
      'current_tenant_id',
      'check_module_enabled',
      'check_module_dependencies',
    ];
    const { rows: funcRows } = await client.query(`
      SELECT routine_name FROM information_schema.routines
      WHERE routine_schema = 'public' AND routine_type = 'FUNCTION'
    `);
    const funcSet = new Set(funcRows.map(r => r.routine_name));
    for (const f of expectedFunctions) {
      if (funcSet.has(f)) {
        pass(f);
      } else {
        fail(`${f} — function not found`);
      }
    }

    // 7. Seed data
    console.log('\n7. Seed data:');
    const { rows: [moduleCount] } = await client.query('SELECT count(*)::int AS c FROM module');
    if (moduleCount.c >= 6) {
      pass(`module rows: ${moduleCount.c}`);
    } else {
      fail(`module rows: ${moduleCount.c} (expected >= 6)`);
    }

    const { rows: [otCount] } = await client.query('SELECT count(*)::int AS c FROM object_type');
    if (otCount.c >= 10) {
      pass(`object_type rows: ${otCount.c}`);
    } else {
      fail(`object_type rows: ${otCount.c} (expected >= 10)`);
    }

    const { rows: [currCount] } = await client.query('SELECT count(*)::int AS c FROM dim_currency');
    if (currCount.c >= 5) {
      pass(`dim_currency rows: ${currCount.c}`);
    } else {
      fail(`dim_currency rows: ${currCount.c} (expected >= 5)`);
    }

    const { rows: [dateCount] } = await client.query('SELECT count(*)::int AS c FROM dim_date');
    if (dateCount.c > 3000) {
      pass(`dim_date rows: ${dateCount.c}`);
    } else {
      fail(`dim_date rows: ${dateCount.c} (expected > 3000)`);
    }

    // Summary
    console.log('\n================================');
    console.log(`Results: ${passed} passed, ${failed} failed`);
    if (failed > 0) {
      console.log('\nVERIFICATION FAILED.');
      process.exit(1);
    } else {
      console.log('\nAll checks passed.');
    }
  } finally {
    await client.end();
  }
}

main().catch(err => { console.error(err); process.exit(1); });
