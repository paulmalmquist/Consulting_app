# Design Tokens

## Color system

### Base semantic tokens
| Token | Usage |
|---|---|
| `--nv-bg-primary` | Primary page background |
| `--nv-bg-secondary` | Card, panel, drawer background |
| `--nv-bg-tertiary` | Nested panel, input background |
| `--nv-text-primary` | Body copy, labels |
| `--nv-text-secondary` | Metadata, captions, supporting text |
| `--nv-text-muted` | Disabled labels, placeholder text |
| `--nv-border` | Default border color |
| `--nv-border-strong` | Emphasized border |
| `--nv-focus` | Focus ring |

### Status tokens
| Token | Usage |
|---|---|
| `--nv-success` | Positive state, confirmation |
| `--nv-warning` | Caution state, partial data |
| `--nv-error` | Error state, blocked action |
| `--nv-info` | Neutral informational |
| `--nv-null` | Missing/unavailable data indicator |

### Cyberpunk accent tokens (environments choose from these)
| Token | Hex | Usage |
|---|---|---|
| `--nv-purple-400` | #a855f7 | Novendor brand primary |
| `--nv-purple-500` | #9333ea | Brand emphasis |
| `--nv-pink-400` | #f472b6 | Warm accent |
| `--nv-red-400` | #f87171 | Taillight accent |
| `--nv-amber-400` | #fbbf24 | Warning / trading signal |
| `--nv-green-400` | #4ade80 | Positive / gain |
| `--nv-copper-400` | #b87333 | Historical / analog signal |

## Typography

| Scale | Size | Weight | Use |
|---|---|---|---|
| `hero` | 3rem | 700 | Marketing headlines |
| `h1` | 1.875rem | 700 | Page titles |
| `h2` | 1.5rem | 600 | Section headers |
| `h3` | 1.25rem | 600 | Card headers |
| `body` | 0.875rem | 400 | Body text |
| `small` | 0.75rem | 400 | Captions, metadata |
| `label` | 0.75rem | 500 | Form labels, chips |
| `mono` | 0.875rem | 400 | Code, IDs, dates |

**Contrast rule:** Text must meet WCAG AA (4.5:1 for body, 3:1 for large text) against its background in both dark and light mode. Never use `--nv-text-muted` for anything that communicates status.

## Spacing

Use 4px base increments: 4, 8, 12, 16, 20, 24, 32, 40, 48, 64.
Do not invent intermediate values (e.g. 10, 14, 18).

## Border radius

| Level | Value | Use |
|---|---|---|
| `sm` | 4px | Chips, badges, small inputs |
| `md` | 6px | Cards, buttons, panels |
| `lg` | 8px | Drawers, modals, dialogs |
| `xl` | 12px | Large containers |

## Dark/light mode rule

- Internal operator surfaces: **dark mode** (`--nv-bg-primary` ≈ near-black or deep slate)
- Marketing pages and training/demo content visible to external users: **light mode**
- Never mix dark and light within a single surface without a deliberate context boundary

## Chart color rules

- Always test chart colors against the dark background used in internal surfaces
- Use `--nv-green-400` for positive/gain, `--nv-red-400` for negative/loss
- Use `--nv-amber-400` for caution states
- Never use low-contrast gray as the only differentiator between two data series
- For multi-series charts, use the accent color scale in order: purple → pink → amber → green → copper
