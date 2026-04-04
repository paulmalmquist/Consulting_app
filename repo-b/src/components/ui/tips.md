# Motion & SVG Animation Tips

Lessons learned building the Winston Loader — bowtie physics animation system.

---

## 1. Centered SVG rotation in CSS context

**The problem:** CSS `transform-origin` on SVG elements defaults to `0 0` — the top-left of the SVG coordinate space, *not* the element's geometric center. A 24×24 bowtie SVG rotates around its top-left corner, orbiting wildly around the container, rather than spinning in place.

**The fix:**
```tsx
<SvgIcon
  style={{
    transformBox: "fill-box",
    transformOrigin: "center",
  }}
/>
```

- `transformBox: "fill-box"` — makes the transform reference box the element's own bounding box (not the SVG viewport or the CSS containing block). This is the critical step.
- `transformOrigin: "center"` — with `fill-box` in effect, "center" resolves to the element's own geometric center (12, 12 for a 24×24 viewBox). Without `fill-box`, "center" resolves to the containing block's center, which is wrong.

Apply at the **usage site** as an inline `style` prop, not inside the SVG definition — the SVG itself stays unopinionated about transforms so it can be reused anywhere.

---

## 2. Physics encoded in keyframe shapes (no motion library needed)

`cubic-bezier` easing curves *are* the physics — no Framer Motion or spring library required.

| Motion feel | Technique |
|---|---|
| Spin-up inertia | Start at `scale(0.92)` → reach `scale(1)` by 8% of the cycle. The scale compression implies mass gathering before it releases. |
| Friction / drag | Long period (2.8s), strong ease-out curve: `cubic-bezier(0.25, 0.1, 0.1, 1)` — decelerates hard as it approaches the cycle boundary. |
| Weight mid-rotation | `scale(1.03)` at 45% of the slow-spin cycle. A tiny breath of expansion gives each revolution a felt cost. |
| Overshoot settle | Multi-step keyframes: `−6°@55% → +4°@78% → −2°@90% → 0°@100%`. Encodes real rotational inertia finding rest. |
| Cognitive rocking | Asymmetric timing: `+18°@30%`, `−18°@65%`, `0°@100%`. More time in each extreme than at center — feels deliberate, not mechanical. |

Rule of thumb: if the motion implies physics, put it in the keyframe *shape*, not the easing parameter. The easing parameter controls how fast you move between keyframes; the keyframe positions control *what* you're animating. Use both layers.

---

## 3. Stacked CSS animations for entrance + loop

CSS `animation` accepts a comma-separated list. Use this for "enter once, then loop" sequences:

```css
/* loading_fast phase: entrance plays once, spin kicks in at 0.25s */
animation:
  loader-appear 0.28s cubic-bezier(0.34, 1.4, 0.64, 1) forwards,
  loader-spin-fast 1.1s cubic-bezier(0.4, 0, 0.2, 1) 0.25s infinite;
```

The `0.25s` delay on `loader-spin-fast` means the spin begins while `loader-appear` is still finishing — this creates the feel of "the spin-up is the entrance" rather than two distinct events happening in sequence.

`forwards` fill mode on the entrance animation holds the final state so it doesn't snap back to the pre-animation values when the loop takes over.

---

## 4. The chosen motion variant

**Variant A — Premium / Minimal** was selected and is what shipped:

- The bowtie IS the animation. No outer rings, no orbiting halo elements, no decoration doing the work.
- The container shell (the FAB button shape) is always static.
- Phase transitions are encoded purely in which animation class is applied to the bowtie SVG.
- On `complete`, the bowtie settles with a physics overshoot, then the arrival ring fires as a separate one-shot `<span>` that pulses out and fades — a ripple, not a spin.

**Why this over the outer-ring approach:**

The outer-ring pattern (static icon, ring spinning around it) reads as "a loading indicator *decorated* with the Winston logo." The bowtie-spins approach reads as "Winston is *doing* something" — the icon itself has agency. For an AI assistant with a character, the second reading is the right one.

---

## 5. The loader lifecycle (phase model)

```
idle → loading_fast → loading_slow → thinking → complete → idle
```

- `loading_fast`: immediately on any API call or route change. Energetic, doesn't block.
- `loading_slow`: auto-promoted after 300ms if still loading. Implies the operation costs something.
- `thinking`: when AI is streaming. Rocking motion — cognitive, not mechanical.
- `complete`: fires when all work finishes. Settle animation plays once, then returns to idle.

The backdrop overlay appears only on `loading_slow` and `thinking` — fast loads don't interrupt the UI with a dimmed overlay.

Labels appear only after 800ms of sustained loading, preventing microcopy flicker on fast operations.
