# Wave A marketing redesign — verification receipt

Date: 2026-04-28
Branch: `main` (uncommitted)

## Routes checked

| Route | Type | Dark | Light | Mobile (375) | Tablet (768) |
|---|---|:-:|:-:|:-:|:-:|
| `/` | marketing | ✓ | ✓ | ✓ | ✓ |
| `/about` | marketing | ✓ | ✓ | ✓ | — |
| `/the-shift` | marketing | ✓ | ✓ | ✓ | — |
| `/research/messaging` | marketing (research) | ✓ | ✓ | ✓ | — |
| `/login` | non-marketing | ✓ | — | — | — |
| `/lab/environments` | non-marketing | ✓ (auth-walled → /login) | — | — | — |

`/app/*` was not screenshotted because every `/app/*` route redirects to `/login` when unauthenticated; the login page itself is the cleanest evidence that nothing in the marketing route group has bled into the auth surface.

## Smoke script

`repo-b/scripts/marketing-smoke.mjs` — Playwright headless Chromium, runs against `next dev` on `:3000`. 30 assertions, 0 failures after fixes. Output dump: `findings.json`.

## Screenshots captured (17 total)

```
home-desktop-dark.png                 home-desktop-light.png                home-desktop-light-persisted.png
home-tablet-dark.png                  home-mobile-dark.png
about-desktop-dark.png                about-desktop-light.png               about-mobile-dark.png
the-shift-desktop-dark.png            the-shift-desktop-light.png           the-shift-mobile-dark.png
research_messaging-desktop-dark.png   research_messaging-desktop-light.png  research_messaging-mobile-dark.png
login-desktop-dark.png                lab_environments-desktop-dark.png
findings.json
```

## What I verified

- **Abadi headline renders.** Computed `font-family` resolves to `Abadi` on every marketing h1 and h2. Sizes match design system: 84px on `.nv-h1` desktop, 44px on mobile, 68px (clamp) on the research hero.
- **Geist Mono eyebrows.** `font-family` on `.nv-eyebrow` resolves to a Geist Mono fallback chain; `letter-spacing: 0.14em`; uppercase.
- **Theme toggle persists across reload.** Setting `localStorage.nv-theme = 'light'` and reloading lands the page with `data-theme="light"` on `.marketing-shell` (the inline no-flash script in `layout.tsx` reads localStorage before hydration).
- **Dark and light mode render correctly on every Wave A page.** Same layout, sizes, and spacing in both — only color and shadow differ. Computed `--nv-bg` is `11 14 18` in dark, `250 252 255` in light.
- **No horizontal overflow at 375 / 768 / 1440.** Each viewport pass asserts `scrollWidth <= clientWidth` on `<html>`.
- **No marketing leak into `/login` or `/lab/environments`.** Both render with `__Inter_8b3a0b` (Winston body font), zero `.marketing-shell` element in the DOM, and the existing Bloomberg dark surface.
- **Sidebar active state.** Left-edge teal accent on the active nav row matches the design system's `.rail-item.active` pattern (verified by visual inspection).
- **Hero uses the center canvas.** The `1.2fr 1fr` grid puts the headline on the left with the engagement-model key-value panel on the right, so the center 70% of the viewport is occupied with content rather than an empty hero band.

## Issues found and fixed during the pass

### 1. Light-mode tokens leaking from `<html data-theme>` ancestor (critical)

**Symptom.** First pass reported `bg=rgb(250, 252, 255)` (light tokens) on every marketing route in dark mode. Diagnostic showed `htmlTheme: "light"`, `shellTheme: "dark"`, `shellBgVar: "250 252 255"`. Winston/Bloomberg sets `<html data-theme="light|dark">` for its app-wide theme, and the marketing CSS selector `[data-theme="light"] .marketing-shell` matched as a descendant — so when the user had Winston in light, marketing's "dark" wrapper inherited light tokens.

**Fix.** Tightened the selector from `[data-theme="light"] .marketing-shell` to `.marketing-shell[data-theme="light"]` (same element, not ancestor). Same change applied to all `.nv-*` overrides — `[data-theme="light"] .nv-card` → `.marketing-shell[data-theme="light"] .nv-card`, etc. Now the marketing wrapper's `data-theme` is the only source of truth for its theme; ancestor `data-theme` is ignored.

**Files changed:** `repo-b/src/app/(marketing)/marketing.css` (5 selectors).

### 2. `/research/messaging` still using pre-Wave-A patterns

**Symptom.** Smoke flagged the research page h1 as `Inter Tight` (not Abadi) — the page had `text-3xl font-semibold tracking-tight text-white` on its hand-rolled hero, plus a `rounded-3xl border border-nv-text/10 bg-nv-surface/55` wrapper.

**Fix.** Refactored to use `nv-page` / `nv-eyebrow` / `nv-h1` (clamped 44–68px since this is a content-page hero, not the marketing primary hero) / `nv-lede` / `<NvCard>` for the callout. Now Abadi 68px on desktop, 44px on mobile. The `MessagingRulebook` body and the right-rail TOC are unchanged.

**Files changed:** `repo-b/src/app/(marketing)/research/messaging/page.tsx`.

## Final verification

```
$ npm run typecheck    # ✓
$ npm run lint         # ✓ (only pre-existing warnings outside marketing)
$ npm run build        # ✓
$ node scripts/marketing-smoke.mjs    # 30 findings, 0 failures
```

## Result

**PASS.** Wave A ships visibly matching the Novendor Design System. Two regressions surfaced and fixed during the pass — the cascade leak being the more important of the two because it would have silently corrupted the visual identity for any user who had toggled Winston into light mode.
