"""Starter seed for the Vultr Cloud Intelligence OS environment template.

Deterministic, idempotent. Populates a coherent BI demo for usage-based cloud /
GPU compute: regions, SKUs, customers, 90 days of GPU utilization, billing,
invoices, payments, revenue recognition, sales pipeline, support tickets,
incidents, marketing attribution, customer × day snapshots, and engineered
reconciliation exceptions.

Determinism strategy:
- All UUIDs derived via uuid5(NAMESPACE_DNS, f"{slug}:cloud_infra:{kind}:{key}")
  where slug = env_id. Re-running with the same env_id reproduces the same IDs.
- All numeric quantities derived via a seeded random.Random(env_id) to keep
  shape but vary across envs.
- All inserts use ON CONFLICT DO NOTHING so the pack is safely re-runnable.

Reconciliation exceptions are *engineered* rather than emergent — specific rows
in fact tables are deliberately omitted or perturbed so the 6-stage bridge
detects known breaks.
"""

from __future__ import annotations

import json
import math
import random
from datetime import date, datetime, timedelta, timezone
from uuid import NAMESPACE_DNS, uuid5

from . import SeedResult


NAME = "cloud_infra_starter"
VERSION = 1


# ─────────────────────────────────────────────────────────────────────────────
# Static reference data
# ─────────────────────────────────────────────────────────────────────────────

REGIONS: list[tuple[str, str, str, float, float, int, float, str]] = [
    # (region_key, region_name, country, lat, lon, dc_count, mw, tier)
    ("nyc", "New York",   "US", 40.7128, -74.0060, 3, 32.0, "tier1"),
    ("fra", "Frankfurt",  "DE", 50.1109,   8.6821, 2, 28.0, "tier1"),
    ("sgp", "Singapore",  "SG",  1.3521, 103.8198, 2, 24.0, "tier1"),
    ("lax", "Los Angeles","US", 34.0522,-118.2437, 2, 18.0, "tier1"),
    ("tok", "Tokyo",      "JP", 35.6762, 139.6503, 1, 12.0, "tier2"),
]

PRODUCTS: list[tuple[str, str, str, str]] = [
    # (product_key, family, display_name, unit_of_measure)
    ("compute_vm",      "compute",        "Cloud Compute",          "instance_hour"),
    ("gpu_h100",        "gpu",            "GPU H100",               "gpu_hour"),
    ("gpu_a100",        "gpu",            "GPU A100",               "gpu_hour"),
    ("gpu_l40s",        "gpu",            "GPU L40S",               "gpu_hour"),
    ("gpu_mi300x",      "gpu",            "GPU MI300X",             "gpu_hour"),
    ("bare_metal",      "bare_metal",     "Bare Metal",             "instance_hour"),
    ("k8s_engine",      "k8s",            "Kubernetes Engine",      "node_hour"),
    ("object_storage",  "object_storage", "Object Storage",         "gb_month"),
    ("block_storage",   "block_storage",  "Block Storage",          "gb_month"),
    ("bandwidth",       "bandwidth",      "Bandwidth Egress",       "tb"),
]

# (sku_key, product_key, display_name, gpu_model, cpu, ram, storage, list, cost, power)
SKUS: list[tuple[str, str, str, str | None, int, int, int, float, float, int]] = [
    ("h100-80gb",     "gpu_h100",      "H100 80GB",          "H100",    16,  192,  3840,  4.85, 2.15,  700),
    ("h100-sxm5",     "gpu_h100",      "H100 SXM5 8x",       "H100",   128, 1536, 30720, 38.40,17.20, 5600),
    ("a100-80gb",     "gpu_a100",      "A100 80GB",          "A100",    12,  128,  1920,  2.40, 1.05,  400),
    ("a100-40gb",     "gpu_a100",      "A100 40GB",          "A100",    12,  128,  1920,  1.85, 0.82,  400),
    ("l40s-48gb",     "gpu_l40s",      "L40S 48GB",          "L40S",     8,   96,   960,  1.40, 0.62,  350),
    ("mi300x-192gb",  "gpu_mi300x",    "MI300X 192GB",       "MI300X",  16,  256,  3840,  4.20, 1.95,  750),
    ("vc2-2c-4gb",    "compute_vm",    "VC2 2 vCPU / 4GB",   None,       2,    4,    80,  0.03, 0.012,  60),
    ("vc2-8c-16gb",   "compute_vm",    "VC2 8 vCPU / 16GB",  None,       8,   16,   320,  0.12, 0.048, 180),
    ("bm-epyc-256gb", "bare_metal",    "EPYC Bare Metal",    None,      64,  256,  3840,  1.80, 0.78,  450),
    ("os-standard",   "object_storage","Standard Object",    None,       0,    0,     0,  0.012,0.005,   0),
    ("bs-nvme",       "block_storage", "NVMe Block",         None,       0,    0,     0,  0.10, 0.045,   0),
    ("bw-egress",     "bandwidth",     "Bandwidth Egress",   None,       0,    0,     0,  0.01, 0.004,   0),
]

CAMPAIGNS: list[tuple[str, str, str, int, float]] = [
    # (campaign_key, channel, name, start_offset_days, spend)
    ("ps_q1_brand",     "paid_search",  "Q1 Brand Search",     -120, 180000),
    ("content_ai_blog", "content",      "AI Infra Blog Series", -180,  90000),
    ("devrel_ai_kits",  "devrel",       "AI Starter Kits",      -150, 120000),
    ("conf_nvidia_gtc", "conf",         "NVIDIA GTC Sponsorship", -60, 250000),
    ("free_credit_100", "free_credit",  "$100 Free Credit",     -365, 600000),
    ("partner_resell",  "partner",      "Reseller Channel",     -200, 320000),
]

SUPPORT_CATEGORIES: list[tuple[str, str, str | None, str]] = [
    ("billing",        "Billing",        "invoice_dispute",        "high"),
    ("provisioning",   "Provisioning",   "instance_launch_fail",   "high"),
    ("network",        "Network",        "egress_throttle",        "normal"),
    ("performance",    "Performance",    "gpu_throughput",         "high"),
    ("storage",        "Storage",        "volume_attach_fail",     "high"),
    ("api",            "API",            "rate_limit",             "normal"),
    ("auth",           "Auth",           "mfa_lockout",            "high"),
    ("compliance",     "Compliance",     "kyc_review",             "urgent"),
]

SALES_REPS: list[tuple[str, str, str, str, float]] = [
    ("rep_amena",   "Amena Park",     "ai_growth",     "AMER",  4_500_000),
    ("rep_carlos",  "Carlos Vega",    "enterprise",    "AMER",  6_000_000),
    ("rep_lin",     "Lin Zhou",       "enterprise",    "APAC",  4_800_000),
    ("rep_johanna", "Johanna Werner", "enterprise",    "EMEA",  5_200_000),
    ("rep_kofi",    "Kofi Mensah",    "smb",           "EMEA",  2_100_000),
    ("rep_priya",   "Priya Iyer",     "smb",           "APAC",  1_900_000),
]

CUSTOMER_NAMES: list[tuple[str, str]] = [
    # (customer_id_suffix, display_name) — picked to look real but be obviously synthetic
    ("helios",       "Helios AI"),
    ("aurora",       "Aurora Labs"),
    ("kestrel",      "Kestrel Robotics"),
    ("northwind",    "Northwind Genomics"),
    ("verity",       "Verity Imaging"),
    ("borealis",     "Borealis Climate"),
    ("monolith",     "Monolith Research"),
    ("sablecore",    "Sable Core"),
    ("echelon",      "Echelon Trading"),
    ("nimbus",       "Nimbus Mobility"),
    ("orchard",      "Orchard Bio"),
    ("polestar",     "Polestar Sim"),
    ("riverbend",    "Riverbend Media"),
    ("seraph",       "Seraph Defense"),
    ("trident",      "Trident Cyber"),
    ("ursa",         "Ursa Models"),
    ("vector",       "Vector Voice"),
    ("welkin",       "Welkin Weather"),
    ("xeno",         "Xeno Therapeutics"),
    ("yoke",         "Yoke Logistics"),
    ("zenith",       "Zenith Education"),
    ("alta",         "Alta Hosting"),
    ("brio",         "Brio Streaming"),
    ("crest",        "Crest Analytics"),
    ("delos",        "Delos Foundry"),
    ("ember",        "Ember GameWorks"),
    ("fjord",        "Fjord Genomics"),
    ("granite",      "Granite Quant"),
    ("hatch",        "Hatch Fintech"),
    ("ironclad",     "Ironclad Sec"),
    ("juniper",      "Juniper Studio"),
    ("kimber",       "Kimber Models"),
    ("ledger",       "Ledger Bio"),
    ("magma",        "Magma Sim"),
    ("nova",         "Nova MedTech"),
    ("opal",         "Opal Vision"),
    ("plume",        "Plume Telemetry"),
    ("quartz",       "Quartz Research"),
    ("ravine",       "Ravine Genomics"),
    ("sigil",        "Sigil Robotics"),
    ("tuna",         "Tuna Compute"),
    ("upland",       "Upland Sim"),
    ("verge",        "Verge Imaging"),
    ("willow",       "Willow Voice"),
    ("xander",       "Xander Models"),
    ("yarrow",       "Yarrow Maps"),
    ("zephyr",       "Zephyr Trading"),
    ("aspen",        "Aspen Translate"),
    ("birch",        "Birch Forecast"),
    ("cedar",        "Cedar Underwriting"),
    ("dover",        "Dover Robotics"),
    ("evergreen",    "Evergreen GenAI"),
    ("fennel",       "Fennel Analytics"),
    ("garnet",       "Garnet Quant"),
    ("hawthorn",     "Hawthorn Studios"),
    ("ivy",          "Ivy Education"),
    ("jet",          "Jet Streaming"),
    ("kindle",       "Kindle Sec"),
    ("larch",        "Larch Foundry"),
    ("magnolia",     "Magnolia Bio"),
    ("nutmeg",       "Nutmeg Voice"),
]

SEGMENTS = ("self_service", "smb", "enterprise", "ai_customer", "reseller", "startup")
SEGMENT_WEIGHTS = (5, 6, 4, 6, 1, 5)  # weighted toward AI / startups for a GPU-cloud demo


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

def _u(slug: str, *parts: str) -> str:
    return str(uuid5(NAMESPACE_DNS, f"{slug}:cloud_infra:{':'.join(parts)}"))


def _seg(rng: random.Random) -> str:
    return rng.choices(SEGMENTS, weights=SEGMENT_WEIGHTS, k=1)[0]


def _support_tier(segment: str) -> str:
    return {
        "self_service": "community",
        "smb": "standard",
        "enterprise": "enterprise",
        "ai_customer": "enterprise",
        "reseller": "partner",
        "startup": "standard",
    }.get(segment, "standard")


def _contract_type(segment: str) -> str:
    return {
        "self_service": "self_service",
        "smb": "self_service",
        "enterprise": "committed",
        "ai_customer": "reserved",
        "reseller": "committed",
        "startup": "self_service",
    }.get(segment, "self_service")


def _committed_amount(segment: str, rng: random.Random) -> float | None:
    if segment in ("enterprise", "reseller"):
        return float(rng.randint(20, 240) * 25_000)
    if segment == "ai_customer":
        return float(rng.randint(50, 800) * 25_000)
    return None


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0)


# ─────────────────────────────────────────────────────────────────────────────
# Apply
# ─────────────────────────────────────────────────────────────────────────────

def apply(cur, env_id: str, business_id: str, *, actor: str) -> SeedResult:
    rows: dict[str, int] = {}
    notes: list[str] = []
    rng = random.Random(env_id)
    today = date.today()
    asof_dt = _now()

    # Pipeline stages (cloud-ops shape).
    # Wrapped in a SAVEPOINT so a failure here (e.g. v1.environments FK miss,
    # or env_id not castable to uuid) doesn't poison the parent transaction
    # and silently skip the rest of the pack.
    stages = [
        ("prospect",  "Prospect",  0, "slate"),
        ("trial",     "Trial",     1, "blue"),
        ("activated", "Activated", 2, "amber"),
        ("growing",   "Growing",   3, "green"),
        ("at_risk",   "At Risk",   4, "rose"),
        ("churned",   "Churned",   5, "zinc"),
    ]
    cur.execute("SAVEPOINT pipeline_stages_seed")
    try:
        for key, label, sort_order, color in stages:
            cur.execute(
                """
                INSERT INTO v1.pipeline_stages (env_id, key, label, sort_order, color_token)
                VALUES (%s::uuid, %s, %s, %s, %s)
                ON CONFLICT (env_id, key) DO NOTHING
                """,
                (env_id, key, label, sort_order, color),
            )
        cur.execute("RELEASE SAVEPOINT pipeline_stages_seed")
        rows["v1.pipeline_stages"] = len(stages)
    except Exception as exc:
        cur.execute("ROLLBACK TO SAVEPOINT pipeline_stages_seed")
        notes.append(f"skipped pipeline_stages seed: {exc}")

    # Regions
    for rk, name, country, lat, lon, dcs, mw, tier in REGIONS:
        cur.execute(
            """
            INSERT INTO dim_cloud_region
              (env_id, business_id, region_key, region_name, country, latitude, longitude,
               data_center_count, power_capacity_mw, tier)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (env_id, region_key) DO NOTHING
            """,
            (env_id, business_id, rk, name, country, lat, lon, dcs, mw, tier),
        )
    rows["dim_cloud_region"] = len(REGIONS)

    # Data centers (1-3 per region)
    dc_count = 0
    for rk, name, _country, _lat, _lon, dcs, mw, _tier in REGIONS:
        for i in range(dcs):
            dc_key = f"{rk}-dc{i+1}"
            cur.execute(
                """
                INSERT INTO dim_cloud_data_center
                  (env_id, business_id, dc_key, region_key, name, rack_count,
                   commissioned_at, power_capacity_kw, cooling_capacity_btu)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (env_id, dc_key) DO NOTHING
                """,
                (env_id, business_id, dc_key, rk, f"{name} DC{i+1}",
                 200 + i*40, today - timedelta(days=900 + i*120),
                 (mw / dcs) * 1000, (mw / dcs) * 3_412_000),
            )
            dc_count += 1
    rows["dim_cloud_data_center"] = dc_count

    # Products
    for pk, family, name, uom in PRODUCTS:
        cur.execute(
            """
            INSERT INTO dim_cloud_product
              (env_id, business_id, product_key, family, display_name, unit_of_measure)
            VALUES (%s, %s, %s, %s, %s, %s)
            ON CONFLICT (env_id, product_key) DO NOTHING
            """,
            (env_id, business_id, pk, family, name, uom),
        )
    rows["dim_cloud_product"] = len(PRODUCTS)

    # SKUs
    for sk, pk, name, gpu, cpu, ram, storage, listp, costp, power in SKUS:
        cur.execute(
            """
            INSERT INTO dim_cloud_sku
              (env_id, business_id, sku_key, product_key, display_name, gpu_model,
               cpu_cores, ram_gb, storage_gb, list_price_per_hour_usd,
               cost_per_hour_usd, power_w, marked_demo)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (env_id, sku_key) DO NOTHING
            """,
            (env_id, business_id, sk, pk, name, gpu, cpu, ram, storage,
             listp, costp, power, True),
        )
    rows["dim_cloud_sku"] = len(SKUS)

    # Sales reps
    for rep_key, name, team, region, quota in SALES_REPS:
        cur.execute(
            """
            INSERT INTO dim_cloud_sales_rep
              (env_id, business_id, rep_key, name, team, region, quota_usd)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (env_id, rep_key) DO NOTHING
            """,
            (env_id, business_id, rep_key, name, team, region, quota),
        )
    rows["dim_cloud_sales_rep"] = len(SALES_REPS)

    # Campaigns
    for ck, channel, name, start_off, spend in CAMPAIGNS:
        cur.execute(
            """
            INSERT INTO dim_cloud_campaign
              (env_id, business_id, campaign_key, channel, name, start_date, spend_usd)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (env_id, campaign_key) DO NOTHING
            """,
            (env_id, business_id, ck, channel, name, today + timedelta(days=start_off), spend),
        )
    rows["dim_cloud_campaign"] = len(CAMPAIGNS)

    # Support categories
    for ck, cat, sub, sev in SUPPORT_CATEGORIES:
        cur.execute(
            """
            INSERT INTO dim_cloud_support_category
              (env_id, business_id, category_key, category, subcategory, severity_default)
            VALUES (%s, %s, %s, %s, %s, %s)
            ON CONFLICT (env_id, category_key) DO NOTHING
            """,
            (env_id, business_id, ck, cat, sub, sev),
        )
    rows["dim_cloud_support_category"] = len(SUPPORT_CATEGORIES)

    # Customers — 60 from CUSTOMER_NAMES
    customers: list[tuple[str, str, str, str, str | None]] = []  # (cid, name, segment, contract_type, rep_key)
    for suffix, display in CUSTOMER_NAMES:
        cid = f"cust_{suffix}"
        segment = _seg(rng)
        signup = today - timedelta(days=rng.randint(30, 540))
        country = rng.choice(["US", "DE", "SG", "JP", "GB", "CA", "BR", "AU"])
        rep_key = rng.choice([r[0] for r in SALES_REPS])
        contract_type = _contract_type(segment)
        risk_flags = []
        if rng.random() < 0.08:
            risk_flags.append("delinquent_payment")
        if rng.random() < 0.05:
            risk_flags.append("kyc_review")
        cur.execute(
            """
            INSERT INTO dim_cloud_customer
              (env_id, business_id, customer_id, account_id, parent_account_id,
               display_name, signup_date, country, segment, salesforce_owner_id,
               contract_type, account_status, support_tier, kyc_status, risk_flags)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb)
            ON CONFLICT (env_id, customer_id) DO NOTHING
            """,
            (env_id, business_id, cid, f"acct_{suffix}", None, display, signup, country,
             segment, rep_key, contract_type, "active", _support_tier(segment),
             "verified" if "kyc_review" not in risk_flags else "review",
             json.dumps(risk_flags)),
        )
        customers.append((cid, display, segment, contract_type, rep_key))
    rows["dim_cloud_customer"] = len(customers)

    # Contracts (one per non-self-service customer)
    contract_count = 0
    for cid, _name, segment, ctype, _rep in customers:
        if ctype == "self_service":
            continue
        committed = _committed_amount(segment, rng)
        contract_key = _u(env_id, "contract", cid)
        start = today - timedelta(days=rng.randint(30, 365))
        end = start + timedelta(days=rng.choice([365, 730, 1095]))
        discount = float(rng.randint(0, 25))
        cur.execute(
            """
            INSERT INTO dim_cloud_contract
              (env_id, business_id, contract_key, customer_id, contract_type,
               committed_amount_usd, start_date, end_date, discount_pct)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (env_id, contract_key) DO NOTHING
            """,
            (env_id, business_id, contract_key, cid, ctype, committed, start, end, discount),
        )
        contract_count += 1
    rows["dim_cloud_contract"] = contract_count

    # ── GPU utilization: 90 days × hourly × region × GPU SKU ──
    # To keep row counts sane: hourly per region × GPU SKU but only for SKUs that
    # belong to a GPU product. 5 regions × 6 GPU SKUs × 90 days × 24h = 64,800 rows.
    gpu_skus = [s for s in SKUS if s[1].startswith("gpu_")]
    capacity_by_region_sku: dict[tuple[str, str], float] = {}
    for region in REGIONS:
        rk = region[0]
        # Capacity per region × SKU is roughly proportional to region MW
        region_mw = region[6]
        for sk_row in gpu_skus:
            sk, _pk, _n, _gpu, _cpu, _ram, _storage, listp, costp, power = sk_row
            # Available GPU-hours per hour ≈ available GPUs in that region for that SKU
            gpus_in_region = max(8, int(region_mw * 80 / (power / 100 + 1)))
            # Add deterministic per-region/SKU jitter
            gpus_in_region = int(gpus_in_region * (0.6 + (hash((rk, sk)) % 100) / 100.0))
            capacity_by_region_sku[(rk, sk)] = float(gpus_in_region)

    # Build GPU utilization rows in memory, then batch-insert via executemany.
    # Per-row execute() against a remote DB is dominated by RTT — batching cuts
    # ~65k inserts from minutes-to-hours down to seconds.
    days = 90
    gpu_util_batch: list[tuple] = []
    for d in range(days):
        day_dt = (asof_dt - timedelta(days=days - 1 - d)).replace(hour=0)
        growth = 0.55 + 0.35 * (d / max(1, days - 1))
        for region in REGIONS:
            rk = region[0]
            for sk_row in gpu_skus:
                sk = sk_row[0]
                listp = sk_row[7]
                costp = sk_row[8]
                avail = capacity_by_region_sku[(rk, sk)]
                for h in range(24):
                    ts = day_dt.replace(hour=h)
                    diurnal = 0.85 + 0.15 * math.sin((h - 6) / 24 * math.pi * 2)
                    region_factor = 1.05 if rk == "fra" else 1.02 if rk == "nyc" else 0.95
                    util = min(avail * 0.99, max(0.0, avail * growth * diurnal * region_factor))
                    realized = listp * (0.92 + (hash((rk, sk, d, h)) % 17) / 200.0)
                    gpu_util_batch.append(
                        (env_id, business_id, rk, sk, ts, avail, util,
                         avail * 0.05, realized, costp)
                    )
    cur.executemany(
        """
        INSERT INTO fact_cloud_gpu_utilization
          (env_id, business_id, region_key, sku_key, usage_hour,
           available_gpu_hours, utilized_gpu_hours, reserved_gpu_hours,
           realized_price_per_hour_usd, cost_per_hour_usd)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT (env_id, region_key, sku_key, usage_hour) DO NOTHING
        """,
        gpu_util_batch,
    )
    rows["fact_cloud_gpu_utilization"] = len(gpu_util_batch)

    # Daily capacity rollups (region × SKU × day) — batched
    cap_batch: list[tuple] = []
    for d in range(days):
        cap_date = today - timedelta(days=days - 1 - d)
        growth = 0.55 + 0.35 * (d / max(1, days - 1))
        for (rk, sk), avail in capacity_by_region_sku.items():
            util = avail * 24 * growth * 0.95
            cap_batch.append(
                (env_id, business_id, rk, sk, cap_date,
                 avail * 24, util, avail * 24 * 0.05,
                 util / (avail * 24) if avail else 0)
            )
    cur.executemany(
        """
        INSERT INTO fact_cloud_capacity_daily
          (env_id, business_id, region_key, sku_key, capacity_date,
           available_units, utilized_units, reserved_units, oversubscription_ratio)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT (env_id, region_key, sku_key, capacity_date) DO NOTHING
        """,
        cap_batch,
    )
    rows["fact_cloud_capacity_daily"] = len(cap_batch)

    # Customer × hourly resource usage — batched
    top_customers = customers[:30]
    usage_batch: list[tuple] = []
    for cid, _name, segment, _ctype, _rep in top_customers:
        cust_regions = rng.sample([r[0] for r in REGIONS], k=rng.choice([1, 2]))
        cust_skus = rng.sample([s[0] for s in gpu_skus], k=rng.choice([1, 2, 3]))
        for d in range(days):
            day_dt = (asof_dt - timedelta(days=days - 1 - d)).replace(hour=0)
            for h in range(0, 24, 2):
                ts = day_dt.replace(hour=h)
                rk = rng.choice(cust_regions)
                sk = rng.choice(cust_skus)
                qty = float(rng.randint(2, 80))
                resource_key = _u(env_id, "resource", cid, sk, rk)
                usage_id = _u(env_id, "usage", str(resource_key), ts.isoformat(), "gpu_hour")
                usage_batch.append(
                    (env_id, business_id, usage_id, resource_key,
                     cid, sk, rk, ts, qty, "gpu_hour", "platform_telemetry_demo",
                     _u(env_id, "usagerec", cid, str(d), str(h)))
                )
    cur.executemany(
        """
        INSERT INTO fact_cloud_resource_usage_hourly
          (env_id, business_id, usage_id, resource_key, customer_id, sku_key, region_key,
           usage_hour, usage_quantity, usage_unit, source_system, source_record_id)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT (env_id, usage_id) DO NOTHING
        """,
        usage_batch,
    )
    rows["fact_cloud_resource_usage_hourly"] = len(usage_batch)

    # Billing / invoice / payment / revenue recognition — collected then batched.
    months = []
    for m in range(3):
        d = today.replace(day=1)
        for _ in range(m):
            d = (d - timedelta(days=1)).replace(day=1)
        months.append(d)
    months = sorted(set(months))

    # Engineered exception list — used to drop / mismatch specific rows below
    excepted_customers_no_invoice = {customers[i][0] for i in (3, 11, 27)}      # usage_not_invoiced
    excepted_invoice_no_usage     = {customers[i][0] for i in (5,)}             # invoice_no_usage
    excepted_recognition_lag      = {customers[i][0] for i in (8, 22)}          # recognition_lag
    excepted_cash_not_collected   = {customers[i][0] for i in (15,)}            # cash_not_collected
    excepted_contract_mismatch    = {customers[i][0] for i in (19,)}            # contract_mismatch
    excepted_discount_mismatch    = {customers[i][0] for i in (33,)}            # discount_mismatch

    bill_batch: list[tuple] = []
    inv_header_batch: list[tuple] = []
    inv_line_batch: list[tuple] = []
    pay_batch: list[tuple] = []
    revrec_batch: list[tuple] = []

    for period_start in months:
        if period_start.month == 12:
            period_end = period_start.replace(year=period_start.year + 1, month=1, day=1) - timedelta(days=1)
        else:
            period_end = period_start.replace(month=period_start.month + 1, day=1) - timedelta(days=1)
        for cid, _name, segment, ctype, _rep in top_customers:
            cust_skus = rng.sample([s[0] for s in gpu_skus], k=rng.choice([1, 2, 3]))
            invoice_total = 0.0
            for sk in cust_skus:
                sku_row = next(s for s in SKUS if s[0] == sk)
                listp = sku_row[7]
                qty = float(rng.randint(400, 6000))
                rated = qty * listp
                disc = rated * (rng.choice([0, 0, 0.05, 0.10, 0.15]))
                if cid in excepted_customers_no_invoice and period_start == months[-1]:
                    continue
                bill_batch.append(
                    (env_id, business_id, _u(env_id, "billline", cid, sk, str(period_start)),
                     cid, sk, rng.choice([r[0] for r in REGIONS]),
                     period_start, period_end, rated - disc, qty, listp, disc,
                     "billing_engine_demo", _u(env_id, "billrec", cid, sk, str(period_start)))
                )
                invoice_total += rated - disc

            if cid in excepted_invoice_no_usage and period_start == months[-1]:
                invoice_total = float(rng.randint(8000, 22000))
            if invoice_total <= 0:
                continue
            invoice_key = _u(env_id, "inv", cid, str(period_start))
            inv_header_batch.append(
                (env_id, business_id, invoice_key, cid,
                 f"INV-{period_start.strftime('%Y%m')}-{cid[5:9].upper()}",
                 period_start, period_end, "USD",
                 "paid" if rng.random() > 0.15 else "issued")
            )

            tax = invoice_total * 0.0
            issued = datetime.combine(period_end + timedelta(days=2), datetime.min.time(), tzinfo=timezone.utc)
            paid_at = issued + timedelta(days=rng.randint(7, 35)) if rng.random() > 0.15 else None
            if cid in excepted_cash_not_collected and period_start == months[-1]:
                paid_at = None
            inv_line_batch.append(
                (env_id, business_id, _u(env_id, "invline", invoice_key),
                 invoice_key, cid, period_start, invoice_total, tax, "USD",
                 issued, paid_at, "paid" if paid_at else "issued",
                 "netsuite_demo", _u(env_id, "nsrec", invoice_key))
            )

            if paid_at:
                pay_batch.append(
                    (env_id, business_id, _u(env_id, "pay", invoice_key),
                     invoice_key, cid, paid_at, invoice_total,
                     rng.choice(["wire", "ach", "credit_card"]))
                )

            recog_amount = invoice_total
            if cid in excepted_recognition_lag and period_start == months[-1]:
                recog_amount = invoice_total * 0.40
            revrec_batch.append(
                (env_id, business_id, _u(env_id, "revrec", cid, str(period_start)),
                 cid, period_start, recog_amount, invoice_total - recog_amount,
                 "netsuite_demo", _u(env_id, "nsrevrec", cid, str(period_start)))
            )

    cur.executemany(
        """
        INSERT INTO fact_cloud_billing_line_item
          (env_id, business_id, line_id, customer_id, sku_key, region_key,
           period_start, period_end, rated_amount_usd, quantity, unit_price_usd,
           discount_amount_usd, source_system, source_record_id)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT (env_id, line_id) DO NOTHING
        """,
        bill_batch,
    )
    cur.executemany(
        """
        INSERT INTO dim_cloud_invoice
          (env_id, business_id, invoice_key, customer_id, invoice_number,
           period_start, period_end, currency, status)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT (env_id, invoice_key) DO NOTHING
        """,
        inv_header_batch,
    )
    cur.executemany(
        """
        INSERT INTO fact_cloud_invoice
          (env_id, business_id, invoice_line_id, invoice_key, customer_id,
           period_start, invoice_amount_usd, tax_usd, currency, issued_at,
           paid_at, status, source_system, source_record_id)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT (env_id, invoice_line_id) DO NOTHING
        """,
        inv_line_batch,
    )
    cur.executemany(
        """
        INSERT INTO fact_cloud_payment
          (env_id, business_id, payment_id, invoice_key, customer_id,
           paid_at, amount_usd, method)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT (env_id, payment_id) DO NOTHING
        """,
        pay_batch,
    )
    cur.executemany(
        """
        INSERT INTO fact_cloud_revenue_recognition
          (env_id, business_id, recognition_id, customer_id, period_month,
           recognized_revenue_usd, deferred_revenue_usd, source_system, source_record_id)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT (env_id, recognition_id) DO NOTHING
        """,
        revrec_batch,
    )
    rows["fact_cloud_billing_line_item"] = len(bill_batch)
    rows["dim_cloud_invoice"] = len(inv_header_batch)
    rows["fact_cloud_invoice"] = len(inv_line_batch)
    rows["fact_cloud_payment"] = len(pay_batch)
    rows["fact_cloud_revenue_recognition"] = len(revrec_batch)

    # Sales pipeline — ~25 opportunities, snapshot today
    pipeline_count = 0
    stages_pipeline = ("prospect", "qualified", "proposal", "negotiation", "closed_won", "closed_lost")
    stage_weights   = (3, 5, 4, 3, 4, 1)
    for i in range(28):
        cid = customers[i % len(customers)][0]
        rep = rng.choice([r[0] for r in SALES_REPS])
        stage = rng.choices(stages_pipeline, weights=stage_weights, k=1)[0]
        amount = float(rng.randint(20, 1200) * 1000)
        prob = {"prospect": 10, "qualified": 25, "proposal": 50, "negotiation": 75,
                "closed_won": 100, "closed_lost": 0}[stage]
        close_date = today + timedelta(days=rng.randint(-30, 90))
        committed_cap = amount * 0.6 if stage in ("proposal", "negotiation", "closed_won") else None
        lost_reason = "price" if stage == "closed_lost" else None
        cur.execute(
            """
            INSERT INTO fact_cloud_sales_pipeline
              (env_id, business_id, opportunity_id, customer_id, rep_key, stage,
               amount_usd, close_probability, expected_close_date,
               committed_capacity_usd, lost_reason, snapshot_date)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (env_id, opportunity_id, snapshot_date) DO NOTHING
            """,
            (env_id, business_id, f"opp_{i:04d}", cid, rep, stage, amount, prob,
             close_date, committed_cap, lost_reason, today),
        )
        pipeline_count += 1
    rows["fact_cloud_sales_pipeline"] = pipeline_count

    # Support tickets — ~80 tickets across last 60 days
    ticket_count = 0
    for i in range(80):
        cid = customers[rng.randint(0, len(customers) - 1)][0]
        cat = rng.choice(SUPPORT_CATEGORIES)[0]
        opened = asof_dt - timedelta(days=rng.randint(0, 60), hours=rng.randint(0, 23))
        sev = rng.choice(["low", "normal", "normal", "high", "high", "urgent"])
        resolved = opened + timedelta(hours=rng.randint(1, 96)) if rng.random() > 0.18 else None
        sla_breach = (resolved is None) or ((resolved - opened).total_seconds() / 3600 > 24)
        cur.execute(
            """
            INSERT INTO fact_cloud_support_ticket
              (env_id, business_id, ticket_id, customer_id, category_key, opened_at,
               resolved_at, severity, sla_breached, escalated, region_key, sku_key,
               customer_satisfaction)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (env_id, ticket_id) DO NOTHING
            """,
            (env_id, business_id, f"tkt_{i:05d}", cid, cat, opened, resolved, sev,
             sla_breach, sev in ("urgent", "critical"),
             rng.choice([r[0] for r in REGIONS]),
             rng.choice([s[0] for s in gpu_skus]) if rng.random() > 0.3 else None,
             round(rng.uniform(2.5, 5.0), 2) if resolved else None),
        )
        ticket_count += 1
    rows["fact_cloud_support_ticket"] = ticket_count

    # Incidents — 6 across last 60 days
    incident_count = 0
    for i in range(6):
        rk = rng.choice([r[0] for r in REGIONS])
        started = asof_dt - timedelta(days=rng.randint(2, 60), hours=rng.randint(0, 23))
        resolved = started + timedelta(minutes=rng.randint(20, 600))
        sev = rng.choice(["minor", "major", "major", "critical"])
        cur.execute(
            """
            INSERT INTO fact_cloud_incident
              (env_id, business_id, incident_id, region_key, sku_key, started_at,
               resolved_at, severity, customers_impacted, root_cause)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (env_id, incident_id) DO NOTHING
            """,
            (env_id, business_id, f"inc_{i:04d}", rk,
             rng.choice([s[0] for s in gpu_skus]) if rng.random() > 0.4 else None,
             started, resolved, sev, rng.randint(1, 60),
             rng.choice(["network_partition", "psu_failure", "cooling_alert",
                         "noisy_neighbor", "config_drift"])),
        )
        incident_count += 1
    rows["fact_cloud_incident"] = incident_count

    # Marketing attribution — ~40 customers attributed to one campaign
    attr_count = 0
    for cid, _name, _segment, _ct, _rep in customers[:40]:
        ck = rng.choice([c[0] for c in CAMPAIGNS])
        first_t = asof_dt - timedelta(days=rng.randint(60, 540))
        signup_t = first_t + timedelta(days=rng.randint(1, 30))
        activation_t = signup_t + timedelta(days=rng.randint(1, 14))
        attributed = float(rng.randint(2, 240) * 1000)
        cur.execute(
            """
            INSERT INTO fact_cloud_marketing_attribution
              (env_id, business_id, attribution_id, customer_id, campaign_key,
               first_touch_at, last_touch_at, signup_at, activation_at,
               attributed_revenue_usd)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (env_id, attribution_id) DO NOTHING
            """,
            (env_id, business_id, _u(env_id, "attr", cid, ck), cid, ck,
             first_t, signup_t, signup_t, activation_t, attributed),
        )
        attr_count += 1
    rows["fact_cloud_marketing_attribution"] = attr_count

    # Product activation — top 30 customers × random GPU product
    pa_count = 0
    for cid, _n, _s, _ct, _rep in customers[:30]:
        for pk in rng.sample([p[0] for p in PRODUCTS if p[1] == "gpu"], k=rng.choice([1, 2])):
            first_dep = asof_dt - timedelta(days=rng.randint(20, 360))
            cur.execute(
                """
                INSERT INTO fact_cloud_product_activation
                  (env_id, business_id, customer_id, product_key,
                   first_deployed_at, days_to_activation)
                VALUES (%s, %s, %s, %s, %s, %s)
                ON CONFLICT (env_id, customer_id, product_key) DO NOTHING
                """,
                (env_id, business_id, cid, pk, first_dep, rng.randint(1, 21)),
            )
            pa_count += 1
    rows["fact_cloud_product_activation"] = pa_count

    # Customer × day snapshot — batched
    snap_batch: list[tuple] = []
    for cid, _n, segment, _ct, _rep in top_customers:
        for d in range(30):
            sd = today - timedelta(days=29 - d)
            base_rev = {"ai_customer": 8000, "enterprise": 4500, "reseller": 3500,
                        "smb": 900, "startup": 600, "self_service": 120}.get(segment, 500)
            usage_rev = base_rev * (0.85 + (hash((cid, d)) % 30) / 100.0)
            recog = usage_rev * 0.95
            ar = max(0.0, usage_rev * rng.uniform(0.0, 1.5))
            tickets = rng.choice([0, 0, 0, 1, 1, 2, 3])
            risk = rng.uniform(5, 35) if "delinquent" not in segment else rng.uniform(50, 90)
            snap_batch.append(
                (env_id, business_id, cid, sd, usage_rev, recog, ar, tickets, round(risk, 2))
            )
    cur.executemany(
        """
        INSERT INTO fact_cloud_customer_daily_snapshot
          (env_id, business_id, customer_id, snapshot_date,
           daily_usage_revenue_usd, daily_recognized_revenue_usd,
           outstanding_ar_usd, support_tickets_open, churn_risk_score)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT (env_id, customer_id, snapshot_date) DO NOTHING
        """,
        snap_batch,
    )
    rows["fact_cloud_customer_daily_snapshot"] = len(snap_batch)

    # Reconciliation exceptions — engineered to match the breaks above
    excs: list[tuple[str, str, str, str, float, str]] = []
    last_period = months[-1]
    for cid in excepted_customers_no_invoice:
        excs.append((f"exc_uni_{cid}", cid, "usage_not_invoiced", "warning",
                     float(rng.randint(15, 180) * 1000),
                     "Hourly usage telemetry exists for the period but no billing line items were rated. Likely missed cycle in the billing engine."))
    for cid in excepted_invoice_no_usage:
        excs.append((f"exc_ino_{cid}", cid, "invoice_no_usage", "critical",
                     float(rng.randint(8, 22) * 1000),
                     "Invoice issued by accounting with no underlying telemetry. Suspected manual adjustment without source-system audit trail."))
    for cid in excepted_recognition_lag:
        excs.append((f"exc_lag_{cid}", cid, "recognition_lag", "warning",
                     float(rng.randint(20, 90) * 1000),
                     "Cash collected but revenue recognition only 40% posted. NetSuite revrec schedule appears to lag billing by one period."))
    for cid in excepted_cash_not_collected:
        excs.append((f"exc_cnc_{cid}", cid, "cash_not_collected", "critical",
                     float(rng.randint(40, 220) * 1000),
                     "Invoice issued and recognized but no payment received past due date. Customer flagged for AR review."))
    for cid in excepted_contract_mismatch:
        excs.append((f"exc_cmm_{cid}", cid, "contract_mismatch", "warning",
                     float(rng.randint(12, 65) * 1000),
                     "Customer billed at list price for one or more SKUs despite an active committed contract. Contract terms not applied by billing engine."))
    for cid in excepted_discount_mismatch:
        excs.append((f"exc_dmm_{cid}", cid, "discount_mismatch", "warning",
                     float(rng.randint(8, 30) * 1000),
                     "Discount applied on billing line does not match the contract discount_pct. Likely manual override outside the rate card."))

    exc_count = 0
    for exc_id, cid, etype, sev, amount, note in excs:
        cur.execute(
            """
            INSERT INTO fact_cloud_reconciliation_exception
              (env_id, business_id, exception_id, customer_id, exception_type,
               severity, period_start, period_end, amount_usd, notes)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (env_id, exception_id) DO NOTHING
            """,
            (env_id, business_id, exc_id, cid, etype, sev, last_period,
             (last_period.replace(day=28) + timedelta(days=4)).replace(day=1) - timedelta(days=1),
             amount, note),
        )
        exc_count += 1
    rows["fact_cloud_reconciliation_exception"] = exc_count

    return SeedResult(
        pack_name=NAME,
        pack_version=VERSION,
        rows_created=rows,
        notes=notes or [
            "cloud_infra_starter: regions, SKUs, customers, 90d hourly GPU utilization, "
            "billing, invoices, payments, revrec, pipeline, support, incidents, attribution, "
            "and engineered reconciliation exceptions seeded.",
        ],
    )
