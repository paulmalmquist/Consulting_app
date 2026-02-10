/**
 * schema.test.js — Integration tests for Business OS backbone schema.
 *
 * Connects to the database and exercises:
 * 1. Core tables exist (tenant, business, actor)
 * 2. Object + object_version append-only flow
 * 3. Dataset/rule/run lineage + fact_measurement FK integrity
 * 4. Accounting module: account + journal entry + lines
 * 5. Projects module: project + timesheet + time_entry
 * 6. Property module: property/unit/lease + rent_roll_snapshot with run lineage
 * 7. Milestones module: milestone_instance attached to object
 *
 * This test creates data inside a transaction that is rolled back at the end,
 * leaving the database clean.
 *
 * Env: DATABASE_URL or SUPABASE_DB_URL
 */

const { Client } = require('pg');

const databaseUrl = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
if (!databaseUrl) {
  console.error('ERROR: DATABASE_URL or SUPABASE_DB_URL must be set.');
  process.exit(1);
}

let client;
let passed = 0;
let failed = 0;
const errors = [];

function assert(condition, label) {
  if (condition) {
    console.log(`  PASS  ${label}`);
    passed++;
  } else {
    console.log(`  FAIL  ${label}`);
    failed++;
    errors.push(label);
  }
}

async function q(sql, params) {
  const result = await client.query(sql, params);
  return result.rows;
}

async function q1(sql, params) {
  const rows = await q(sql, params);
  return rows[0];
}

async function main() {
  client = new Client({
    connectionString: databaseUrl,
    ssl: databaseUrl.includes('supabase.co') ? { rejectUnauthorized: false } : undefined,
  });
  await client.connect();

  // Run everything in a transaction we'll roll back
  await client.query('BEGIN');

  // Bypass RLS for test (service role / postgres already bypasses, but be explicit)
  await client.query("SET LOCAL row_security = off");

  try {
    console.log('Business OS Schema Integration Tests');
    console.log('=====================================\n');

    // ── 1. Core tables exist ──
    console.log('1. Core tables:');
    const tableCheck = async (name) => {
      const r = await q1(
        "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=$1) AS ok",
        [name]
      );
      assert(r.ok, `${name} exists`);
    };
    await tableCheck('tenant');
    await tableCheck('business');
    await tableCheck('actor');
    await tableCheck('object');
    await tableCheck('object_version');
    await tableCheck('module');

    // ── 2. Insert tenant + business + actor ──
    console.log('\n2. Tenant, business, actor:');
    const tenant = await q1(
      "INSERT INTO tenant (name, slug) VALUES ('Test Corp', 'test-corp') RETURNING tenant_id"
    );
    assert(!!tenant.tenant_id, 'tenant created');

    const biz = await q1(
      "INSERT INTO business (tenant_id, name, slug) VALUES ($1, 'Test Biz', 'test-biz') RETURNING business_id",
      [tenant.tenant_id]
    );
    assert(!!biz.business_id, 'business created');

    const actor = await q1(
      "INSERT INTO actor (tenant_id, email, display_name) VALUES ($1, 'test@example.com', 'Test User') RETURNING actor_id",
      [tenant.tenant_id]
    );
    assert(!!actor.actor_id, 'actor created');

    // ── 3. Object + object_version ──
    console.log('\n3. Object system (append-only):');
    const otGeneric = await q1("SELECT object_type_id FROM object_type WHERE key = 'generic'");
    assert(!!otGeneric, 'generic object_type seeded');

    const obj = await q1(
      "INSERT INTO object (tenant_id, business_id, object_type_id) VALUES ($1, $2, $3) RETURNING object_id",
      [tenant.tenant_id, biz.business_id, otGeneric.object_type_id]
    );
    assert(!!obj.object_id, 'object created');

    // Insert first version
    await q(
      `INSERT INTO object_version (object_id, version, payload_json, actor_id)
       VALUES ($1, 1, '{"name":"v1"}'::jsonb, $2)`,
      [obj.object_id, actor.actor_id]
    );

    // Check current view
    const current = await q1(
      "SELECT * FROM v_object_current_version WHERE object_id = $1",
      [obj.object_id]
    );
    assert(current && current.version === 1, 'v_object_current_version returns version 1');
    assert(current && current.payload_json.name === 'v1', 'payload correct');

    // Use close_and_create_version to append v2
    const newVid = await q1(
      "SELECT close_and_create_version($1, '{\"name\":\"v2\"}'::jsonb, NULL, $2) AS vid",
      [obj.object_id, actor.actor_id]
    );
    assert(!!newVid.vid, 'close_and_create_version returned new version_id');

    const current2 = await q1(
      "SELECT * FROM v_object_current_version WHERE object_id = $1",
      [obj.object_id]
    );
    assert(current2 && current2.version === 2, 'current version is now 2');
    assert(current2 && current2.payload_json.name === 'v2', 'v2 payload correct');

    // Verify v1 is closed
    const v1 = await q1(
      "SELECT valid_to FROM object_version WHERE object_id = $1 AND version = 1",
      [obj.object_id]
    );
    assert(v1.valid_to !== null, 'v1 valid_to is set (closed)');

    // ── 4. Dataset/rule/run lineage ──
    console.log('\n4. Lineage (dataset + rule + run + fact):');

    const ds = await q1(
      "INSERT INTO dataset (tenant_id, key, label) VALUES ($1, 'test-ds', 'Test Dataset') RETURNING dataset_id",
      [tenant.tenant_id]
    );
    const dsv = await q1(
      "INSERT INTO dataset_version (dataset_id, version, row_count) VALUES ($1, 1, 100) RETURNING dataset_version_id",
      [ds.dataset_id]
    );

    const rs = await q1(
      "INSERT INTO rule_set (tenant_id, key, label) VALUES ($1, 'test-rules', 'Test Rules') RETURNING rule_set_id",
      [tenant.tenant_id]
    );
    const rv = await q1(
      "INSERT INTO rule_version (rule_set_id, version) VALUES ($1, 1) RETURNING rule_version_id",
      [rs.rule_set_id]
    );

    const run = await q1(
      `INSERT INTO run (tenant_id, business_id, dataset_version_id, rule_version_id, status)
       VALUES ($1, $2, $3, $4, 'completed') RETURNING run_id`,
      [tenant.tenant_id, biz.business_id, dsv.dataset_version_id, rv.rule_version_id]
    );
    assert(!!run.run_id, 'run created with lineage');

    // Create a metric for fact_measurement
    const metric = await q1(
      "INSERT INTO metric (tenant_id, key, label, unit) VALUES ($1, 'revenue', 'Revenue', 'USD') RETURNING metric_id",
      [tenant.tenant_id]
    );

    const fact = await q1(
      `INSERT INTO fact_measurement (
        tenant_id, business_id, metric_id, value,
        dataset_version_id, rule_version_id, run_id
      ) VALUES ($1, $2, $3, 50000.00, $4, $5, $6) RETURNING fact_measurement_id`,
      [tenant.tenant_id, biz.business_id, metric.metric_id,
       dsv.dataset_version_id, rv.rule_version_id, run.run_id]
    );
    assert(!!fact.fact_measurement_id, 'fact_measurement with full lineage');

    // ── 5. Enable modules ──
    console.log('\n5. Module enablement:');

    const modules = await q("SELECT module_id, key FROM module ORDER BY key");
    assert(modules.length >= 6, `${modules.length} modules seeded`);

    const accMod = modules.find(m => m.key === 'accounting');
    const projMod = modules.find(m => m.key === 'projects');
    const propMod = modules.find(m => m.key === 'property');
    const msMod = modules.find(m => m.key === 'milestones');

    // Enable all four
    for (const mod of [accMod, projMod, propMod, msMod]) {
      await q(
        "INSERT INTO business_module (business_id, module_id, enabled_by) VALUES ($1, $2, $3)",
        [biz.business_id, mod.module_id, actor.actor_id]
      );
    }

    const enabled = await q1(
      "SELECT check_module_enabled($1, 'accounting') AS ok",
      [biz.business_id]
    );
    assert(enabled.ok === true, 'accounting module enabled');

    // Check dependencies
    const missingDeps = await q1(
      "SELECT check_module_dependencies($1, 'accounting') AS deps",
      [biz.business_id]
    );
    assert(missingDeps.deps.length === 0, 'accounting dependencies satisfied');

    // ── 6. Accounting: account + journal entry + lines ──
    console.log('\n6. Accounting module:');

    // Need USD currency
    const acct1 = await q1(
      `INSERT INTO account (tenant_id, business_id, code, name, account_type)
       VALUES ($1, $2, '1000', 'Cash', 'asset') RETURNING account_id`,
      [tenant.tenant_id, biz.business_id]
    );
    const acct2 = await q1(
      `INSERT INTO account (tenant_id, business_id, code, name, account_type)
       VALUES ($1, $2, '4000', 'Revenue', 'revenue') RETURNING account_id`,
      [tenant.tenant_id, biz.business_id]
    );
    assert(!!acct1.account_id && !!acct2.account_id, 'accounts created');

    const je = await q1(
      `INSERT INTO journal_entry (tenant_id, business_id, entry_date, reference, status)
       VALUES ($1, $2, '2025-01-15', 'JE-001', 'posted') RETURNING journal_entry_id`,
      [tenant.tenant_id, biz.business_id]
    );
    assert(!!je.journal_entry_id, 'journal entry created');

    await q(
      `INSERT INTO journal_line (tenant_id, journal_entry_id, line_number, account_id, debit)
       VALUES ($1, $2, 1, $3, 1000.00)`,
      [tenant.tenant_id, je.journal_entry_id, acct1.account_id]
    );
    await q(
      `INSERT INTO journal_line (tenant_id, journal_entry_id, line_number, account_id, credit)
       VALUES ($1, $2, 2, $3, 1000.00)`,
      [tenant.tenant_id, je.journal_entry_id, acct2.account_id]
    );
    const lines = await q(
      "SELECT * FROM journal_line WHERE journal_entry_id = $1 ORDER BY line_number",
      [je.journal_entry_id]
    );
    assert(lines.length === 2, 'journal lines created');
    assert(parseFloat(lines[0].debit) === 1000, 'debit line correct');
    assert(parseFloat(lines[1].credit) === 1000, 'credit line correct');

    // ── 7. Projects: project + timesheet + time_entry ──
    console.log('\n7. Projects module:');

    const proj = await q1(
      `INSERT INTO project (tenant_id, business_id, code, name, status, object_id)
       VALUES ($1, $2, 'PRJ-001', 'Test Project', 'active', $3) RETURNING project_id`,
      [tenant.tenant_id, biz.business_id, obj.object_id]
    );
    assert(!!proj.project_id, 'project created');

    // Check v_project_current
    const projView = await q1(
      "SELECT * FROM v_project_current WHERE project_id = $1",
      [proj.project_id]
    );
    assert(!!projView && projView.code === 'PRJ-001', 'v_project_current works');

    const res = await q1(
      `INSERT INTO resource (tenant_id, business_id, actor_id, name, role, hourly_rate)
       VALUES ($1, $2, $3, 'Test User', 'Developer', 150.00) RETURNING resource_id`,
      [tenant.tenant_id, biz.business_id, actor.actor_id]
    );

    const ts = await q1(
      `INSERT INTO timesheet (tenant_id, business_id, resource_id, period_start, period_end, status)
       VALUES ($1, $2, $3, '2025-01-13', '2025-01-19', 'draft') RETURNING timesheet_id`,
      [tenant.tenant_id, biz.business_id, res.resource_id]
    );

    const te = await q1(
      `INSERT INTO time_entry (tenant_id, timesheet_id, project_id, entry_date, hours, description)
       VALUES ($1, $2, $3, '2025-01-15', 8.00, 'Feature work') RETURNING time_entry_id`,
      [tenant.tenant_id, ts.timesheet_id, proj.project_id]
    );
    assert(!!te.time_entry_id, 'time entry created');

    // ── 8. Property: property/unit/lease + rent_roll_snapshot ──
    console.log('\n8. Property module:');

    const prop = await q1(
      `INSERT INTO property (tenant_id, business_id, code, name, property_type, city, country)
       VALUES ($1, $2, 'PROP-001', 'Main Office', 'commercial', 'Austin', 'US') RETURNING property_id`,
      [tenant.tenant_id, biz.business_id]
    );
    assert(!!prop.property_id, 'property created');

    const unit = await q1(
      `INSERT INTO unit (tenant_id, property_id, code, name, unit_type, square_feet)
       VALUES ($1, $2, 'STE-100', 'Suite 100', 'office', 2500) RETURNING unit_id`,
      [tenant.tenant_id, prop.property_id]
    );
    assert(!!unit.unit_id, 'unit created');

    const tp = await q1(
      `INSERT INTO tenant_party (tenant_id, business_id, name, contact_email)
       VALUES ($1, $2, 'Acme Inc', 'lease@acme.com') RETURNING tenant_party_id`,
      [tenant.tenant_id, biz.business_id]
    );

    const lease = await q1(
      `INSERT INTO lease (tenant_id, business_id, property_id, unit_id, tenant_party_id,
        lease_number, start_date, end_date, monthly_rent, status)
       VALUES ($1, $2, $3, $4, $5, 'LSE-001', '2025-01-01', '2027-12-31', 5000.00, 'active')
       RETURNING lease_id`,
      [tenant.tenant_id, biz.business_id, prop.property_id, unit.unit_id, tp.tenant_party_id]
    );
    assert(!!lease.lease_id, 'lease created');

    // Rent roll snapshot with full traceability
    const rrs = await q1(
      `INSERT INTO rent_roll_snapshot (
        tenant_id, business_id, property_id, snapshot_date, unit_id, lease_id,
        tenant_party_name, monthly_rent, square_feet, rent_per_sqft,
        dataset_version_id, rule_version_id, run_id
      ) VALUES ($1, $2, $3, '2025-01-31', $4, $5, 'Acme Inc', 5000, 2500, 2.00,
        $6, $7, $8) RETURNING rent_roll_snapshot_id`,
      [tenant.tenant_id, biz.business_id, prop.property_id, unit.unit_id, lease.lease_id,
       dsv.dataset_version_id, rv.rule_version_id, run.run_id]
    );
    assert(!!rrs.rent_roll_snapshot_id, 'rent_roll_snapshot with lineage');

    // v_property_current
    const propView = await q1(
      "SELECT * FROM v_property_current WHERE property_id = $1",
      [prop.property_id]
    );
    assert(!!propView && propView.code === 'PROP-001', 'v_property_current works');

    // ── 9. Milestones: attach to project object ──
    console.log('\n9. Milestones module:');

    const msTpl = await q1(
      `INSERT INTO milestone_template (tenant_id, business_id, key, name, default_offset_days)
       VALUES ($1, $2, 'kickoff', 'Kickoff', 0) RETURNING milestone_template_id`,
      [tenant.tenant_id, biz.business_id]
    );
    assert(!!msTpl.milestone_template_id, 'milestone template created');

    const msInst = await q1(
      `INSERT INTO milestone_instance (tenant_id, business_id, milestone_template_id, object_id, name, due_date, status)
       VALUES ($1, $2, $3, $4, 'Project Kickoff', '2025-01-20', 'completed')
       RETURNING milestone_instance_id`,
      [tenant.tenant_id, biz.business_id, msTpl.milestone_template_id, obj.object_id]
    );
    assert(!!msInst.milestone_instance_id, 'milestone instance attached to object');

    await q(
      `INSERT INTO milestone_event (tenant_id, milestone_instance_id, event_type, to_value, actor_id)
       VALUES ($1, $2, 'completed', 'completed', $3)`,
      [tenant.tenant_id, msInst.milestone_instance_id, actor.actor_id]
    );

    const msView = await q1(
      "SELECT * FROM v_milestone_instance_detail WHERE milestone_instance_id = $1",
      [msInst.milestone_instance_id]
    );
    assert(!!msView && msView.template_key === 'kickoff', 'v_milestone_instance_detail works');

    // ── Summary ──
    console.log('\n=====================================');
    console.log(`Results: ${passed} passed, ${failed} failed`);
    if (errors.length > 0) {
      console.log('\nFailed tests:');
      errors.forEach(e => console.log(`  - ${e}`));
    }

  } finally {
    // Always rollback — leave DB clean
    await client.query('ROLLBACK');
    await client.end();
  }

  if (failed > 0) {
    console.log('\nTESTS FAILED.');
    process.exit(1);
  } else {
    console.log('\nAll tests passed.');
  }
}

main().catch(err => { console.error(err); process.exit(1); });
