---
name: novendor-cyberpunk-accents
description: Apply the Novendor cyberpunk neon accent palette (purple ramp, pink reflect, red taillight) as restrained secondary mood on marketing surfaces — hero gradients, ambient panel washes, decorative dividers, brand mood. Triggers on "add a neon touch", "punch the saturation", "cyberpunk accent", "neon strip", "use the new purple/pink palette", "add a halo", "marketing brand mood", or any request that references the cyberpunk tokens (--nv-purple-*, --nv-pink-*, --nv-red-taillight). Reject the request if it asks to use these colors for data state, alerts, KPIs, table cells, or anything semantic.
---

# Novendor Cyberpunk Accents

The cyberpunk neons are **decorative-only** secondary accents. They sit on top of the existing `.nv-*` design system (Abadi/Geist + teal/copper) and never replace it. Use them to give marketing surfaces a deliberate brand mood; never on functional UI.

## Tokens

Declared in `repo-b/src/app/(marketing)/marketing.css` inside the `.marketing-shell` block, with light-mode parallels under `.marketing-shell[data-theme="light"]`. Same names, different values per theme — components don't need to know which theme is active.

| Token | Hex (dark) | Role |
|---|---|---|
| `--nv-purple-glow` | `#F2E0FF` | Sign halo / brightest highlight |
| `--nv-purple-neon` | `#C896FF` | Bright accent |
| `--nv-purple-hot` | `#B040FF` | Wet reflect / primary neon |
| `--nv-purple-deep` | `#5840FF` | Electric haze / blue-purple |
| `--nv-purple-shadow` | `#1A1340` | Deep base |
| `--nv-pink-reflect` | `#FF6FE0` | Hot magenta scatter |
| `--nv-pink-mist` | `#A070FF` | Lavender mist |
| `--nv-red-taillight` | `#FF2A4D` | Warm anchor |
| `--nv-red-ember` | `#E04060` | Mid red |
| `--nv-red-strip` | `#6E1428` | Deep red |

Reference via `rgb(var(--nv-purple-hot))` or with alpha: `rgb(var(--nv-purple-hot) / 0.18)`.

## Utility classes

Already shipped in `marketing.css`. Use these instead of writing one-off CSS:

| Class | Effect |
|---|---|
| `.nv-hero-neon` | After-pseudo overlay layering purple haze + pink scatter + base ink. Apply on a `<HeroBackground>` ancestor when you want a neon mood instead of the default teal/copper wash. |
| `.nv-accent-strip` | After-pseudo gradient bottom rule (purple → pink → red taillight). Drop on `nv-section-head` to add a single decorative strip. Use **once or twice** per page max. |
| `.nv-wash-neon` | Subtle radial purple+pink wash. Apply to a section background to add ambient mood without dominating. |
| `.nv-glow-purple` / `.nv-glow-pink` | Inline text-shadow halo. Use on a single short word inside a hero or pull-quote, never on body text. |
| `.nv-dot-purple` / `.nv-dot-pink` | Inline 5px halo dot, mirrors `.nv-eyebrow-dot` but in the cyberpunk palette. Use on a section eyebrow when the section is intentionally branded. |
| `.nv-outline-neon` (purple), `.nv-outline-neon--cyan`, `.nv-outline-neon--pink` | 1px inset hairline outline + soft halo, applied to a panel or `<NvCard>` to give it a brand-mood edge. Use on opt-in cards only — never on every card on a page. Plays nicely with `liftOnHover` (hover override included). |

## When to use these

✅ **Yes:**
- Hero background overlays on the homepage and `/the-shift` (manifesto) — set the brand mood for the public site
- One or two section dividers per long-form page (the case-example or manifesto section, not every section)
- Decorative pull-quote treatment on `/about` or `/the-shift`
- Marketing illustrations and brand imagery (SVG illustrations, social cards)
- Industry hero overlays where the imagery itself is moody (consumer-credit at night, etc.)

❌ **No:**
- Data state (success/warning/risk) — those stay on `--nv-sem-*`
- Alerts, badges, error messages, validation copy
- KPI numbers, table cells, chart series, axis labels
- Buttons, links, focus rings (those stay on `--nv-accent-teal`)
- Body text or any heading that needs to read at all sizes
- App surfaces (`/app/**`, `/lab/**`, `/operator/**`) — these tokens exist only inside `.marketing-shell`
- More than ~2 accent surfaces per page — restraint is the point

## How to apply (recipes)

### 1. Add a neon mood overlay to a hero

```tsx
<HeroBackground imageSrc={bgSrc} overlayOpacity={0}>
  <div className="nv-hero-neon" style={{ position: 'absolute', inset: 0 }} />
  <p className="nv-eyebrow"><span className="nv-eyebrow-dot" />Manifesto</p>
  <h1 className="nv-h1">…</h1>
</HeroBackground>
```

Set `overlayOpacity={0}` so the default teal/copper overlay doesn't fight the neon haze.

### 2. Decorative strip under a section head

```tsx
<div className="nv-section-head nv-accent-strip">
  <p className="nv-eyebrow"><span className="nv-dot-pink" />Case example · illustrative</p>
</div>
```

The `::after` rule draws a 1px gradient line at the bottom of the section head. The hairline already there continues to draw the structural divider; the strip just punches it.

### 3. Single-word glow inside a hero

```tsx
<h1 className="nv-h1">
  Operations are moving to a <em className="nv-glow-purple">unified</em> execution engine.
</h1>
```

Use **only** on the same word that already carries `<em>` (the teal-accent word). The glow replaces the teal color — pick one or the other per page, not both. For most pages, keep the standard teal `<em>` treatment.

### 4. Ambient section wash

```tsx
<section className="nv-section nv-wash-neon">
  …
</section>
```

The wash is a 5–10% opacity radial gradient. It should be barely perceptible — if you can see distinct color bands, opacity is too high.

## What to reject

If the user asks to:
- Color KPIs or metric badges in cyberpunk → use `--nv-sem-*` instead. Tell them the cyberpunk palette is decorative-only.
- Make the entire site look like the cyberpunk swatch → push back. The design system stays dominant; neons sit on top sparingly.
- Use it inside `/app`, `/lab`, `/operator`, `/login` → reject. These tokens are scoped under `.marketing-shell` and won't resolve in those surfaces. Even if the user adds them globally, mixing operator console design and marketing mood breaks the visual contract.
- Apply it to data viz / chart fills → reject. Use the existing chart palette. Cyberpunk reads as branding, not data.

## Files involved

- `repo-b/src/app/(marketing)/marketing.css` — token declarations + utility classes
- `repo-b/src/app/_typography.css` — typography contract (no cyberpunk rules here; this is for fonts only)
- Marketing pages under `repo-b/src/app/(marketing)/**` — opt in via the utility classes

## Verification

After applying:
- `npm run typecheck` and `npm run lint` clean
- Strict legacy-class grep stays empty: `grep -r "text-3xl\|text-4xl\|text-5xl\|font-semibold\|tracking-tight\|rounded-3xl\|rounded-full" repo-b/src/app/\(marketing\)/ --include="*.tsx"`
- Visually: count the cyberpunk surfaces on the affected page. If more than 2, reduce.
- Light mode: toggle and confirm the strip/glow is muted (light-mode parallels are already declared and reduce opacity to ~70%).
- App surfaces: load `/app/...` and `/lab/...` and confirm no purple/pink bleed.
