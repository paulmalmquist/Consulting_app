# Feature: Fund Management (ARGUS Taliance) — Altus Group — 2026-03-18

**Source:** Altus Group — https://www.altusgroup.com/argus/ (product suite)

## What It Does (User-Facing)
A dedicated fund management module that models and manages the performance of real estate funds — tracking fund-level capital, distributions, waterfall calculations, and investor reporting in a single platform connected to asset-level valuation data.

## Functional Components

- **Data source:** Asset-level valuations from ARGUS Enterprise; fund structure definitions; LP commitment schedules
- **Processing:** Fund-level aggregation of NAV, returns (TVPI, DPI, IRR); waterfall calculation engine; capital account tracking per LP; distribution calculation
- **Trigger:** Quarterly reporting cycle; on-demand; data refresh from ARGUS Enterprise
- **Output:** Fund performance summary; LP capital account statements; waterfall distribution reports
- **Delivery:** In-app; investor portal (likely); PDF export for LP reporting

## Winston Equivalent
Winston has LP/waterfall calculations, capital account snapshots, and LP Summary reporting — this is a direct match in scope. Winston may have functional parity on fund accounting. The key gap is whether Winston's fund management connects seamlessly to asset-level valuation models in the same way ARGUS Taliance connects to ARGUS Enterprise. If Winston's valuation data (Direct Cap) and fund waterfall module are fully integrated end-to-end, this is "Already in Winston."

## Architectural Pattern
Hierarchical data model (LP → Fund → Asset) + waterfall calculation engine (preferred return, promote splits, clawback logic) + templated LP reporting. Standard private equity fund accounting pattern — mature, well-understood. Winston's 83 MCP tools likely cover this.
