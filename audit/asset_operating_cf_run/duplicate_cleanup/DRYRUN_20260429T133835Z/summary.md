# Released-snapshot duplicate cleanup

**Run ID:** `DRYRUN_20260429T133835Z`
**Run at:** 2026-04-29T13:38:36.462061+00:00

## Per-table changes

| Table | Canonical kept | Superseded | Index created |
|---|---|---|---|
| `re_authoritative_fund_state_qtr` | 6 | 12 | `CREATE UNIQUE INDEX IF NOT EXISTS idx_re_authoritative_fund_...` |
| `re_authoritative_asset_state_qtr` | 4 | 6 | `CREATE UNIQUE INDEX IF NOT EXISTS idx_re_authoritative_asset...` |
| `re_authoritative_investment_state_qtr` | 34 | 38 | `CREATE UNIQUE INDEX IF NOT EXISTS idx_re_authoritative_inves...` |
| `re_authoritative_fund_gross_to_net_qtr` | 6 | 9 | `CREATE UNIQUE INDEX IF NOT EXISTS idx_re_authoritative_fund_...` |

## Detail CSVs

- `fund_changes.csv`
- `asset_changes.csv`
- `investment_changes.csv`
- `bridge_changes.csv`