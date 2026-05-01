---
name: novendor-icons-system
description: Pick the right icon system for Novendor surfaces. Marketing chrome and pages use Remix Icon (@remixicon/react) routed through repo-b/src/components/marketing/ui/icons.tsx. App / lab / operator chrome uses Iconoir (iconoir-react). State and status use Unicode marks (◉ ◌ ▲ ▼ ⚠ ! → ⌘K), not glyph icons. Triggers on "add an icon", "change this icon", "swap lucide", "use the icon system", or any visible icon change in marketing or app chrome. Reject the request if it asks to add a new lucide-react / heroicons / tabler import to a marketing surface.
---

# Novendor Icons System

Lucide / Heroicons / Tabler are everywhere on dashboard starter kits. Novendor's chrome should not look like a starter kit. Hard rules below.

## The split

| Surface | Library | npm package | Where it's wired |
|---|---|---|---|
| Marketing pages, marketing chrome (sidebar/topbar/cards) | Remix Icon | `@remixicon/react` | `repo-b/src/components/marketing/ui/icons.tsx` |
| App / lab / operator chrome (`/app`, `/lab`, `/operator`) | Iconoir | `iconoir-react` | (no central wrapper yet — when you add one, mirror the marketing pattern) |
| State / status (live, stale, up, down, manual, broken, route, command) | Unicode marks | n/a | inline text |

## Sizing convention

Marketing icons go through `repo-b/src/components/marketing/ui/icons.tsx`. The wrapper applies these defaults:

- `ICON_SIZE = 17` (px)
- `ICON_STROKE = 1.55`

Override `size` only when constrained by the surrounding chrome (e.g. inline 14px chevrons, 18px hamburger). Do **not** override `strokeWidth` per-instance — if a surface needs a different visual weight, define a new central icon export with its own canonical stroke.

## Status / state — use Unicode, not icons

Per `Novendor Design System.html`, symbolic Unicode marks should do most of the icon work. True icons are reserved for nav, file types, and map markers.

| Mark | Meaning |
|---|---|
| ◉ | live |
| ◌ | stale |
| ▲ | up |
| ▼ | down |
| ⚠ | manual |
| ! | broken |
| → | route |
| ⌘K | command palette |

Don't add an icon for any of those. Type the mark.

## How to add a marketing icon

1. Find the Remix icon name. Names follow the pattern `Ri<Name>Line` for outline (preferred) or `Ri<Name>Fill` for filled. Search the package: `node -e "const r = require('@remixicon/react'); console.log(Object.keys(r).filter(k => k.includes('Term-you-want')).slice(0, 10));"`. (`RiUserCircleLine` does NOT exist; the equivalent is `RiAccountCircleLine`.)
2. Open `repo-b/src/components/marketing/ui/icons.tsx`. Add the import to the top block. Add the wrapped export with `makeIcon`. Pick a stable name prefixed `Icon*` (e.g. `IconShield`, `IconBuilding`).
3. Use the wrapper in your page. Never import directly from `@remixicon/react` in a page file — re-export through `icons.tsx` first so the size/stroke convention stays enforced and the package is swap-able.

```tsx
import { IconBarChart } from '@/components/marketing/ui/icons';

<IconBarChart aria-label="Data" />
```

## How to swap an existing lucide icon

1. Identify the lucide name and its purpose (`grep -n "from 'lucide-react'" path/to/file.tsx`).
2. Pick the Remix equivalent. Common mappings:

| Lucide | Remix |
|---|---|
| `House` | `RiHomeLine` |
| `Compass` | `RiCompassLine` |
| `Workflow` | `RiFlowChart` |
| `ArrowRightLeft` | `RiArrowLeftRightLine` |
| `BarChart3` | `RiBarChartLine` |
| `Layers3` | `RiStackLine` |
| `Factory` / `Building2` | `RiBuilding2Line` |
| `ClipboardCheck` | `RiClipboardLine` |
| `UserRound` / `UserCircle` | `RiUserLine` / `RiAccountCircleLine` |
| `Mail` | `RiMailLine` |
| `Menu` | `RiMenuLine` |
| `Search` | `RiSearchLine` |
| `X` | `RiCloseLine` |
| `ChevronDown` / `Left` / `Right` | `RiArrowDownSLine` / `RiArrowLeftSLine` / `RiArrowRightSLine` |
| `Scale` | `RiScales3Line` |
| `Stethoscope` | `RiStethoscopeLine` |
| `Wallet` | `RiWallet3Line` |

3. Add the wrapped export to `icons.tsx`, swap the import in the page, drop the `size` / `strokeWidth` props at the call site (defaults apply).

## What to reject

- New `lucide-react`, `@heroicons/react`, `@tabler/icons-react`, or `react-icons` import in any marketing file. These libraries are too recognizable as starter-kit decoration. If a page genuinely needs an icon Remix doesn't have, escalate to the user with the specific need.
- Direct `@remixicon/react` import inside a page. Always re-export through `icons.tsx`.
- Adding a glyph icon for a state that has a Unicode mark. Use the mark.
- Mixing icon families inside one surface. Keep marketing on Remix, app on Iconoir, status on Unicode.
- Inflating the `ICON_SIZE` / `ICON_STROKE` defaults to "make icons more visible" — usually the surrounding spacing is the actual problem.

## Files

- `repo-b/src/components/marketing/ui/icons.tsx` — central marketing icon module
- `repo-b/src/components/marketing/layout/SidebarNav.tsx` — uses the wrapper
- `repo-b/src/components/marketing/layout/Topbar.tsx`, `AccountButton.tsx` — uses the wrapper
- `repo-b/src/components/marketing/search/InlineSearch.tsx` — uses the wrapper
- `repo-b/src/components/marketing/industries/IndustryVerticalPage.tsx` — uses the wrapper

Other marketing components (`shift/`, `home/`, `research/`, `assessment/`, `content/`) still import lucide directly. They will be migrated as they are touched. **If you touch a file that still imports lucide, swap it as part of your change** — never reintroduce lucide in a file you've migrated.

## Verification

After changing an icon:
- `npx tsc --noEmit` — clean
- Visually load the affected page — icon renders at 17px, 1.55 stroke, color picks up `currentColor`
- Grep for the old lucide import in the file you changed: `grep "from 'lucide-react'" path/to/file.tsx` should return nothing
