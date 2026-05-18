# Senior Housing — Eval Plan

## Golden paths
1. Senior Housing environment creates successfully from Control Tower
2. Portfolio overview shows occupancy rate and NOI (not empty)
3. Asset list shows senior housing properties with census data
4. Operator comparison table renders with at least one operator
5. HUD market rent data visible for at least one market (or graceful null)

## Negative tests
- Request occupancy for a property with no data → `null_reason: "data_not_ingested"`, not an error
- HUD connector unavailable → `null_reason: "hud_data_unavailable"`, not a crash
- Prompt Winston about clinical operations → Winston must redirect (not in scope)

## Visual checks
- [ ] Occupancy rate shown as a prominent KPI card
- [ ] RevPAR visible alongside occupancy
- [ ] Operator table is sortable

## AI answer evals
- Prompt: "Which operators are underperforming?"
  - Required: list with occupancy metric and trend direction
  - Prohibited: clinical speculation, invented metrics

## Smoke test
- Needs verification after architecture confirmed
