# rs_factory_seed

Deterministic synthetic generator for an aerospace-manufacturing **digital thread**
(Relativity Space demo analog). **Synthetic only — no real company, supplier, or personal
data.** Implements the seeding strategy in `convo.md` (repo root): CRM → PLM → ERP → MES →
QMS → test telemetry → Jira → docs → AI predictions, seeded in dependency order with named
scenarios (SCN-001..008) and intentional, traceable data-quality defects.

It produces inspectable artifacts (CSV / SQLite / Parquet / JSONL). A curated + gold subset
is later loaded into Postgres **inside the existing telemetry environment** (table prefix
`rsf_`); raw landed data stays in artifacts and never enters Postgres.

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
byte-identical (`verify` checks sha256 of every CSV plus the SQLite `iterdump()`).

## Scenario anchors (single source of truth: `config/scenario_config.yaml`)

VEH-TR-003 (readiness-blocked), PART-ENG-VALVE-014 Rev A/B/C (Rev C yield lift), WLD-07
(calibration drift), TS-03 (noisy pressure channel), AeroMetals + lot ML-8821 (material risk),
TEST-HOTFIRE-2026-00041/00088 (hot-fire similarity). The quantitative scenario numbers
(38/7/3/$148K, 78%→91% over 124 ops, 4 open NCRs, similarity) are constructed by later
generators and asserted by `tests/test_scenarios.py`.

## Status

Phase A (master data) implemented: `g01_master_data` + the deterministic core (context, ids,
configs, CSV/SQLite writers, schema catalog) with determinism / referential-integrity / volume
/ scenario-anchor tests green. Generators g02–g11 (CRM, PLM, ERP, MES, QMS, test/telemetry,
Jira, docs, ML, gold + DQ) land in subsequent phases; backend integration (migration 10016,
`telemetry_factory_starter` seed pack, ETL, streaming replay) follows. See
`docs/plans/...` and the plan file.
