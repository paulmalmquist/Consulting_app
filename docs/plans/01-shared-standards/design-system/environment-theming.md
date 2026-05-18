# Environment Theming

## What theming is

Environment theming is the controlled variation layer that gives each environment a distinct feel while staying within the shared design system.

Theming is NOT:
- Inventing new component behaviors
- Overriding token values for the whole app
- Removing required shell elements

Theming IS:
- Choosing which accent tokens to use prominently
- Adjusting information density (compact vs. spacious)
- Setting surface-specific chart color priorities
- Choosing typography weight emphasis for domain-specific hierarchy
- Setting the ambient mood (e.g. cyberpunk high-contrast vs. controlled document-heavy)

## Theming rules

1. Every environment must document its theming choices in its own `design-adaptation.md`.
2. An environment may use any tokens from the allowed accent set in `tokens.md`.
3. An environment may NOT redefine semantic tokens (--nv-error, --nv-success, etc.).
4. An environment's accent choices should reflect its domain character:
   - Trading / quant surfaces → amber, green, copper (Bloomberg/terminal cues)
   - Legal / compliance surfaces → restrained, blue-gray, minimal accent
   - Executive / reporting surfaces → purple brand primary, clean hierarchy
   - Demo / showcase surfaces → full accent palette allowed
5. Environments must not use low-contrast gray as their dominant accent.

## Common theming patterns by domain

| Domain | Accent recommendation | Density | Mood |
|---|---|---|---|
| REPE / Fund analytics | purple primary, amber for alerts | High | Executive authority |
| Trading / quant | amber primary, green/red for gain/loss | Very high | Terminal / signal |
| Legal / compliance | minimal accent, blue-gray | Medium | Controlled, audit-safe |
| PDS / operations | purple primary | Medium | Operational efficiency |
| Supply chain / data | green primary, amber for alerts | High | Data products |
| CRM / accounting | purple primary | Medium | Operator clarity |
| Demo / showcase | full palette | Medium | Demonstration energy |
| Marketing | light mode, purple primary | Low | Trust and clarity |
