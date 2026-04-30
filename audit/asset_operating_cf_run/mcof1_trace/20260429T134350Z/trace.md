# MCOF I asset CF builder trace

Run: 20260429T134350Z
As-of: 2026Q2

## Summary
- Total assets: 8
- Builder produced acquisition CF: 0
- Builder produced any inflow: 6
- IRR computed cleanly: 0

## Per-asset trace

| asset_name | type | inv_type | stage | op_rows | exits | proj | qs_rows | has_acq | has_inflow | cf_pts | irr | null_reason | proposed_fix |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Bellmont Residential – Charlot | cmbs | debt | operating | 6 | 0 | 0 | 12 | ✗ | ✓ | 7 | — | missing_acquisition | seed: populate repe_asset.acquisition_date + cost_basis |
| Midtown Towers – Atlanta GA | cmbs | debt | operating | 6 | 0 | 0 | 12 | ✗ | ✓ | 7 | — | missing_acquisition | seed: populate repe_asset.acquisition_date + cost_basis |
| Riverdale Multifamily – Dallas | cmbs | debt | operating | 6 | 0 | 0 | 12 | ✗ | ✓ | 7 | — | missing_acquisition | seed: populate repe_asset.acquisition_date + cost_basis |
| Riverside Park – Miami FL | cmbs | debt | operating | 6 | 0 | 0 | 12 | ✗ | ✓ | 7 | — | missing_acquisition | seed: populate repe_asset.acquisition_date + cost_basis |
| Stratford Village – Denver CO | cmbs | debt | operating | 6 | 0 | 0 | 12 | ✗ | ✓ | 7 | — | missing_acquisition | seed: populate repe_asset.acquisition_date + cost_basis |
| Summit Heights – Nashville TN | cmbs | debt | operating | 6 | 0 | 0 | 12 | ✗ | ✓ | 7 | — | missing_acquisition | seed: populate repe_asset.acquisition_date + cost_basis |
| Vertex Multifamily – Tampa FL | cmbs | debt | exited | 6 | 0 | 0 | 12 | ✗ | ✗ | 7 | — | missing_acquisition | seed: populate repe_asset.acquisition_date + cost_basis ; builder: operating rows exist but produced no positive CF (check revenue/opex sign or terminal value) |
| Westridge Commons – Austin TX | cmbs | debt | exited | 6 | 0 | 0 | 12 | ✗ | ✗ | 7 | — | missing_acquisition | seed: populate repe_asset.acquisition_date + cost_basis ; builder: operating rows exist but produced no positive CF (check revenue/opex sign or terminal value) |

## Sample operating rows

- **Bellmont Residential – Charlotte NC**: q=2024Q4 rev=999375.000000000000 oi=0E-12 opex=29981.250000000000 capex=0E-12 dbt=1412500.000000000000
- **Midtown Towers – Atlanta GA**: q=2024Q4 rev=1289062.500000000000 oi=0E-12 opex=38671.880000000000 capex=0E-12 dbt=1800000.000000000000
- **Riverdale Multifamily – Dallas TX**: q=2024Q4 rev=833750.000000000000 oi=0E-12 opex=25012.500000000000 capex=0E-12 dbt=1300000.000000000000
- **Riverside Park – Miami FL**: q=2024Q4 rev=1426000.000000000000 oi=0E-12 opex=42780.000000000000 capex=0E-12 dbt=1787500.000000000000
- **Stratford Village – Denver CO**: q=2024Q4 rev=892125.000000000000 oi=0E-12 opex=26763.750000000000 capex=0E-12 dbt=1025000.000000000000
- **Summit Heights – Nashville TN**: q=2024Q4 rev=761250.000000000000 oi=0E-12 opex=22837.500000000000 capex=0E-12 dbt=1050000.000000000000
- **Vertex Multifamily – Tampa FL**: q=2024Q4 rev=741125.000000000000 oi=0E-12 opex=22233.750000000000 capex=0E-12 dbt=1025000.000000000000
- **Westridge Commons – Austin TX**: q=2024Q4 rev=1091500.000000000000 oi=0E-12 opex=32745.000000000000 capex=0E-12 dbt=1475000.000000000000