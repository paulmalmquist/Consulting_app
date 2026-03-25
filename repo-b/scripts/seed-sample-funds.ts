/**
 * Seed realistic sample funds into a REPE environment.
 *
 * Usage:
 *   npx tsx repo-b/scripts/seed-sample-funds.ts \
 *     --env-id <env_id> \
 *     --business-id <business_id> \
 *     --base-url http://localhost:3000
 */

const SAMPLE_FUNDS = [
  {
    name: "Granite Peak Value-Add Fund IV",
    strategy: "equity",
    fund_type: "closed_end",
    status: "investing",
    vintage_year: 2023,
    target_size: "350000000",
    term_years: 7,
    base_currency: "USD",
    quarter_cadence: "quarterly",
    inception_date: "2023-03-01",
    target_sectors_json: ["Multifamily", "Industrial"],
    target_geographies_json: ["Southeast", "Sunbelt"],
    target_leverage_min: "0.55",
    target_leverage_max: "0.70",
    target_hold_period_min_years: 3,
    target_hold_period_max_years: 5,
  },
  {
    name: "Iron Ridge Debt Partners II",
    strategy: "debt",
    fund_type: "closed_end",
    status: "harvesting",
    vintage_year: 2020,
    target_size: "225000000",
    term_years: 5,
    base_currency: "USD",
    quarter_cadence: "quarterly",
    inception_date: "2020-06-15",
    target_sectors_json: ["Office", "Industrial", "Multifamily"],
    target_geographies_json: ["National"],
    target_leverage_min: "0.0",
    target_leverage_max: "0.0",
    target_hold_period_min_years: 2,
    target_hold_period_max_years: 4,
  },
  {
    name: "Summit Creek Opportunity Fund I",
    strategy: "equity",
    fund_type: "closed_end",
    status: "fundraising",
    vintage_year: 2025,
    target_size: "500000000",
    term_years: 10,
    base_currency: "USD",
    quarter_cadence: "quarterly",
    inception_date: "2025-01-10",
    target_sectors_json: ["Data Center", "Life Science", "Industrial"],
    target_geographies_json: ["National"],
    target_leverage_min: "0.50",
    target_leverage_max: "0.65",
    target_hold_period_min_years: 4,
    target_hold_period_max_years: 7,
  },
  {
    name: "Cascade Industrial Co-Invest",
    strategy: "equity",
    fund_type: "co_invest",
    status: "closed",
    vintage_year: 2018,
    target_size: "75000000",
    term_years: 5,
    base_currency: "USD",
    quarter_cadence: "quarterly",
    inception_date: "2018-09-01",
    target_sectors_json: ["Industrial"],
    target_geographies_json: ["Pacific Northwest"],
    target_leverage_min: "0.60",
    target_leverage_max: "0.65",
    target_hold_period_min_years: 3,
    target_hold_period_max_years: 5,
  },
  {
    name: "Ridgeline Core Plus SMA",
    strategy: "equity",
    fund_type: "sma",
    status: "investing",
    vintage_year: 2024,
    target_size: "150000000",
    term_years: 0,
    base_currency: "USD",
    quarter_cadence: "monthly",
    inception_date: "2024-04-01",
    target_sectors_json: ["Multifamily", "Senior Housing"],
    target_geographies_json: ["Southeast", "Mid-Atlantic"],
    target_leverage_min: "0.45",
    target_leverage_max: "0.55",
    target_hold_period_min_years: 5,
    target_hold_period_max_years: 10,
  },
];

async function main() {
  const args = process.argv.slice(2);
  const getArg = (name: string): string => {
    const idx = args.indexOf(`--${name}`);
    if (idx === -1 || idx + 1 >= args.length) {
      console.error(`Missing required argument: --${name}`);
      process.exit(1);
    }
    return args[idx + 1];
  };

  const envId = getArg("env-id");
  const businessId = getArg("business-id");
  const baseUrl = args.includes("--base-url") ? getArg("base-url") : "http://localhost:3000";

  console.log(`Seeding funds into env=${envId} business=${businessId} via ${baseUrl}\n`);

  // Check existing funds to avoid duplicates
  const listRes = await fetch(`${baseUrl}/api/re/v1/funds?env_id=${envId}&business_id=${businessId}`);
  if (!listRes.ok) {
    console.error(`Failed to list existing funds: ${listRes.status} ${await listRes.text()}`);
    process.exit(1);
  }
  const existing: Array<{ name: string }> = await listRes.json();
  const existingNames = new Set(existing.map((f) => f.name.toLowerCase()));

  for (const fund of SAMPLE_FUNDS) {
    if (existingNames.has(fund.name.toLowerCase())) {
      console.log(`SKIP (exists): ${fund.name}`);
      continue;
    }

    const body = {
      env_id: envId,
      business_id: businessId,
      ...fund,
    };

    const res = await fetch(`${baseUrl}/api/re/v1/funds`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (res.ok) {
      const created = await res.json();
      console.log(`OK: ${fund.name} → ${created.fund_id}`);
    } else {
      const errText = await res.text();
      console.error(`FAIL: ${fund.name} → ${res.status} ${errText}`);
    }
  }

  console.log("\nDone.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
