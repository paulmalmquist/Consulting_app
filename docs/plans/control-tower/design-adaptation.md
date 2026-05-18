# Control Tower — Design Adaptation

## Purpose in the design system

Control Tower is the meta-surface. It does not belong to a business domain — it manages the platform infrastructure. Its visual language should feel like an admin console: authoritative, clear, low affect.

## Accent choices
- Primary accent: `--nv-purple-400` (brand primary)
- Status indicators: `--nv-success` (provisioned), `--nv-warning` (in-progress), `--nv-error` (failed)
- No decorative accents

## Density
Medium. Environment lists should be scannable. Status chips must be immediately readable without hover.

## Component emphasis
- Status chips are primary information — must be high contrast
- Environment cards must show: name, type, status, last updated
- Provisioning progress must use a visible step indicator (not just a spinner)

## What Control Tower must NOT do
- Use cyberpunk accents (this is an admin surface, not a product surface)
- Show placeholder/demo content as if it were real environment data
- Obscure environment status behind hover states
