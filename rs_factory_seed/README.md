# rs_factory_seed

Deterministic synthetic generator for an aerospace-manufacturing **digital thread**
(Relativity Space demo analog). **Synthetic only — no real company, supplier, or personal
data.** Implements the seeding strategy in `convo.md` (repo root): CRM → PLM → ERP → MES →
QMS → test telemetry → Jira → docs → AI predictions, seeded in dependency order with named
scenarios (SCN-001..008) and intentional, traceable data-quality defects.

It produces inspectable artifacts (CSV / SQLite / Parquet / JSONL). A curated + gold subset
is later loaded into Postgres **inside the existing telemetry environment** (table prefix
`rsf_`); raw landed data stays in artifacts and never enters Postgres.

PR 1 intentionally emits CSV and SQLite only. Parquet, JSONL, gold views, and backend loading
belong to later PRs.

## Usage

```bash
cd rs_factory_seed
python -m rs_factory_seed build  --profile small      # write output/{csv,sqlite}/ + schema_catalog.csv
python -m rs_factory_seed verify --profile small      # build twice, assert byte-identical (determinism gate)
python -m pytest tests -q                              # determinism + referential integrity + volumes + scenario anchors
```

Profiles: `small` (default) and `medium` (`rs_factory_seed/config/volume_config.yaml`).

## Determinism

`MASTER_SEED = 20260610`; every table draws from its own named substream (order-independent,
stable hash of the table name). The timeline is fixed (`2025-10-01 .. AS_OF 2026-06-08`) — no
wall-clock reads. Writers sort by natural key with a fixed column order, so re-runs are
byte-identical (`verify` checks every emitted non-SQLite artifact plus the SQLite `iterdump()`).

## Scenario anchors (single source of truth: `config/scenario_config.yaml`)

VEH-TR-003 (readiness-blocked), PART-ENG-VALVE-014 Rev A/B/C (Rev C yield lift), WLD-07
(calibration drift), TS-03 (noisy pressure channel), AeroMetals + lot ML-8821 (material risk),
TEST-HOTFIRE-2026-00041/00088 (hot-fire similarity). The quantitative scenario numbers
(38/7/3/$148K, 78%→91% over 124 ops, 4 open NCRs, similarity) are constructed by later
generators and asserted by `tests/test_scenarios.py`.

## Status

PR 1 / Phase A is complete through:

- `g01_master_data`: facilities, work centers, machines, operators, suppliers, customers,
  vehicles, parts, revisions, and BOM.
- `g02_crm_demand`: missions, payload commitments, build plans, and milestones.
- `g03_plm_changes`: engineering changes and specifications.
- `g04_erp_materials`: supplier variants, purchase orders, material lots, serialized items,
  genealogy, and material consumption.
- `g05_mes_work_orders`: work orders, operation executions, labor, machine assignments, and
  holds, including the configured SCN-004 Rev B/C operation split and SCN-007 DQ tags.

The suite covers deterministic artifacts, declared natural-key uniqueness, stable IDs, row
volumes, referential integrity, scenario anchors, MES distributions, and intentional defects.

## PR 2 handoff

Keep the package generator-only. Add `g06` through `g11`, waveform/scoring/DQ helpers,
Parquet and JSONL writers, SQLite gold views, and Q01-Q12 scenario queries. Do not add the
Postgres migration, telemetry seed pack, backend runtime dependencies, replay producer, or UI
tabs until PR 3/4.
