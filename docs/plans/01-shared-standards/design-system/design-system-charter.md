# Design System Charter

## What this is

The design system is the shared visual and interaction language for the entire Novendor / BusinessMachine platform. It prevents every environment from becoming its own mini design system. Environments adapt the design system — they do not replace it.

## The two-layer model

**Layer 1 — Global design system** (`01-shared-standards/design-system/`)
Defines: tokens, component contracts, shell rules, accessibility baselines.
Changes here affect every environment.

**Layer 2 — Environment theme adapters** (each env's `design-adaptation.md`)
Defines: which accent tokens the environment uses, information density, surface-specific emphasis, chart color choices.
Changes here affect only that environment.

## What the design system controls

- Color tokens (base, semantic, and accent ranges)
- Typography scale (size, weight, line-height, contrast)
- Spacing scale (padding, gap, margin increments)
- Border radius and shadow levels
- Card structure and behavior
- Table structure and behavior
- Drawer/panel behavior
- Chart color rules (especially dark mode contrast)
- Loading state patterns
- Empty state patterns
- Error state patterns
- Shell and navigation structure
- Dark/light mode rules (internal surfaces = dark, marketing = light)

## What the design system does NOT control

- Domain-specific labels and copy
- Which charts or tables an environment uses
- Information hierarchy choices within an environment's pages
- Accent color selection (environments choose from allowed ranges)

## Governance rule

If an environment's component looks or behaves differently from the shared contract, that is drift — not intentional theming. The correct fix is:

1. Check whether the shared contract needs to be updated to accommodate a legitimate new pattern.
2. If yes, update `01-shared-standards/design-system/component-contracts.md`.
3. If no, fix the environment to match the contract.

Never fix drift by copy-pasting a new component variant without updating the contract.
