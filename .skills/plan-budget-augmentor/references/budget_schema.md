# Budget schema (`budget.csv`)

One row per line item. A work item usually has several rows (one or more labor, plus infra/license/services). The rollup script reads these columns exactly, so keep the header intact.

## Columns

| Column | Meaning | Allowed / format |
|---|---|---|
| `work_item_id` | Stable ID for the work item. Reuse across runs. | e.g., `R-03`, `T-09`, `DP-01` |
| `work_item` | Short name of the work item | free text |
| `plan_ref` | Where it lives in the plans | e.g., `03_RELATIVITY_INSTANTIATION.md §9` |
| `category` | Line-item type | `labor` \| `infra` \| `license` \| `services` |
| `item` | What this line buys | e.g., "Senior Data Engineer", "BigQuery storage", "Looker viewer seats" |
| `basis` | The estimating assumption in one phrase | e.g., "2 eng × 3 sprints", "5 TB active + slots", "20 viewers" |
| `qty` | Quantity (number) | number; for labor use person-sprints or person-weeks |
| `unit` | Unit `qty` is counted in | e.g., "person-sprint", "TB-month", "seat-month", "lump" |
| `unit_cost_low` | Low end of unit cost | number (USD); blank if unknown |
| `unit_cost_high` | High end of unit cost | number (USD); blank if unknown |
| `frequency` | How the cost recurs | `one_time` \| `monthly` \| `annual` |
| `confidence` | Estimate confidence | `H` \| `M` \| `L` |
| `source` | Where the number came from | e.g., "GCP pricing 2026-06", "internal rate card", "assumption" |
| `notes` | Flags and caveats | put `NEEDS-RESEARCH` here for placeholders |

## Categories

- **labor** — build effort. Size in person-sprints (or person-weeks). `unit_cost_*` is the blended cost per person-sprint. Almost always `frequency=one_time` (the cost of building it once).
- **infra** — cloud/platform run-cost: storage, compute/query, orchestration, networking, the controls a controlled-data path needs. Usually `monthly` or `annual`. One-time provisioning (e.g., enclave setup) is `one_time`.
- **license** — software/seats: BI author vs. viewer seats, connectors, ITAR-compliant tooling. Usually `annual` or `monthly`.
- **services** — outside help: a coach engagement, an implementation partner, a security review. Usually `one_time`.

## Estimating rules

- **Always a range.** Fill both `unit_cost_low` and `unit_cost_high`. If you only have a point estimate, set low = high and mark `confidence=M` or `L`.
- **No fabricated SKU prices.** If a unit price isn't known yet, leave `unit_cost_low`/`unit_cost_high` blank, set `confidence=L`, and put `NEEDS-RESEARCH` in `notes`. The rollup lists these so the user knows what to price next.
- **Labor without a rate card:** use a clearly-labeled assumption (e.g., blended `$/person-sprint` low–high) and put `source=assumption`. Don't bury the assumption.
- **Cost the pattern, not one line.** A pipeline work item implies storage + compute + orchestration + egress + monitoring, not just "compute". A controlled-data path implies enclave/isolation controls and possibly compliance tooling.

## Worked examples

**Labor row (one-time build effort):**
```
R-07,Telemetry data platform,03_RELATIVITY_INSTANTIATION.md §9,labor,Senior Data Engineer,"2 eng × 3 sprints",6,person-sprint,9000,14000,one_time,M,assumption,blended rate range
```

**Infra row (recurring, known shape, unknown price):**
```
R-07,Telemetry data platform,03_RELATIVITY_INSTANTIATION.md §9,infra,Warehouse storage + compute,"raw+silver+gold, high-rate channels",1,lump,,,monthly,L,,NEEDS-RESEARCH pick BigQuery vs Snowflake first
```

**License row (recurring, seats from roles):**
```
R-07,Telemetry data platform,03_RELATIVITY_INSTANTIATION.md §9,license,BI viewer seats,"20 program viewers",20,seat-month,15,30,monthly,M,assumption,
```

**Services row (one-time):**
```
T-12,Process improvement,02_OPERATING_MODEL_TEMPLATE.md §11,services,Agile coach engagement,"NCF used Artisan Agility analog",1,lump,20000,60000,one_time,L,assumption,scope-dependent
```

## How the rollup treats frequency

- `one_time` → counted in the **one-time** total.
- `monthly` → annualized (×12) into the **recurring annual** total.
- `annual` → added as-is to the **recurring annual** total.
- Multi-year TCO = one-time + (years × recurring annual). Default 3 years; override with `--years`.

Rows missing both unit costs contribute `0` to totals and appear in the **Needs research** list.
