# Overview era backdrops (Phase 9B)

These SVGs are **illustrative, generative vector art** — abstract aerospace motifs authored by hand,
one per Bottleneck Map innovation era. They are **not historical photographs** and carry **no
evidentiary meaning**. The Overview hero renders them behind a dark scrim purely to set era atmosphere;
every backdrop is labeled "Backdrop: illustrative · generative asset" in the UI.

| File | Era (`InnovationKey`) | Tone | Motif |
|---|---|---|---|
| `mission.svg` | mission | blue | analog launch pad + telemetry-room beep traces |
| `cost.svg` | cost | green | descending cost curve + downward booster |
| `reuse.svg` | reuse | amber | reusable-booster recovery arcs + landing pad |
| `manufacturing.svg` | manufacturing | violet | additive-manufacturing lattice + inspection grid |
| `dataops.svg` | dataops | cyan | dense signal field + mission-control glass |

Mapping and fallback live in `repo-b/src/components/telemetry/context/BottleneckMap/data.ts`
(`THEME_BACKDROPS`, `resolveBackdrop`). A missing/renamed asset degrades to the `tone` wash — the
component uses a CSS `background-image`, never an `<img>`, so there is no broken-image state.

Safe to relabel or replace with other licensed/curated assets later; keep the illustrative labeling and
never imply a backdrop is a real photo of the event.
