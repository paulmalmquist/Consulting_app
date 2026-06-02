# Telemetry Platform — Design Adaptation

**Status:** stub. Filled in Phase 4.

This environment adapts the shared dark design system; it does not replace it. The detailed
screen-by-screen spec lives in `telemetry-platform/docs/frontend-wireframe.md`.

Will record, per `01-shared-standards/design-system/`:

- Accent token choice (from the allowed dark-console ranges) and how the redline go/no-go indicator
  maps to semantic colors.
- Trace/chart color rules for multi-channel telemetry in dark mode (contrast, threshold bands,
  anomaly-region shading).
- Information density for the test console (it should read instrument-like, not SaaS-marketing).
- Any component-contract additions needed for the trace viewer or the go/no-go indicator — if a new
  pattern is legitimate, update `01-shared-standards/design-system/component-contracts.md` rather than
  copy-pasting a one-off variant.
