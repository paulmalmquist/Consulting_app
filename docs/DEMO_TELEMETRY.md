# Telemetry Demo: start here

The live telemetry app at `https://novendor.ai` is a governed-ML and data-product operating model:
champion/challenger, promotion gates, conformal uncertainty, abstention / fail-closed, lineage and
drill-through, export and source-kind honesty. Thesis: **launch became a data problem.**

## Canonical demo package

- **[Phase 9: Relativity Onsite Demo Package](plans/03-implementation-plans/active/0013-telemetry-phase9-demo.md)**.
  The 5-minute and 90-second scripts, the whiteboard version, the MES/Lakebase facsimile bridge appendix,
  the room-by-room talk track, objection handling, and the pre-flight checklist.

## Receipts and reference

- **[Phase 8 acceptance note](plans/03-implementation-plans/active/0012-telemetry-phase8-acceptance.md)**.
  Production version verified, drill/export receipt matrix, source-kind examples, preserved evidence values.
- **[Phase 8 plan](plans/03-implementation-plans/active/0012-telemetry-presentation-readiness.md)**. The
  full build history (8A through 8I).

## Before a demo

Run the preflight: `python scripts/streaming/stargate/preflight_demo.py --base https://novendor.ai`
(read-only). Log in with the scoped reviewer credential (`telemetry`, not admin). The two strongest beats
(RUL conformal 0.86 / 15-of-100, and the FD004 abstention) live on the hidden-but-resolving Evidence page;
pre-open the deep-link: `https://novendor.ai/lab/env/telemetry-demo/telemetry/evidence`.
