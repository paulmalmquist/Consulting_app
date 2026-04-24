# Meridian Financial Lineage Audit Report

This audit pack reconstructs authoritative period states for sampled Meridian funds, investments, and assets.
The authoritative serving layer is backed by persisted snapshot rows keyed by audit run id and snapshot version.

## Trust posture

- Released authoritative snapshots do not exist yet after this runner. The run is promoted to `verified` when exact tie-outs pass, but unreleased states remain fail-closed for general consumers.
- Legacy quarter-close and fund-state tables remain comparison surfaces only.

## Sample coverage

- Institutional Growth Fund VII — positive multi-asset JV chain
- Meridian Real Estate Fund III — fee-bearing equity chain
- Meridian Credit Opportunities Fund I — debt and negative-cash-flow sample