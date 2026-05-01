# Novendor Circuit Typeface Source Kit

A small custom display face inspired by the Novendor wordmark image. It is designed for short labels, badges, headers, and product UI accents. Uppercase and lowercase inputs map to the same glyphs.

## Included source

- `src/glyphs.json` — editable contour source for N, O, V, E, D, R.
- `build_font.py` — local build script for TTF, WOFF, and WOFF2.
- `web/novendor-circuit.css` — `@font-face` starter CSS.
- `specimens/novendor-specimen.svg` — vector preview specimen.
- `glyphs/*.svg` — individual editable SVG glyph references.

## Build locally

```bash
python -m pip install fonttools brotli
python build_font.py
```

Generated fonts will appear in `dist/`.

## Notes

This is a V1 wordmark/display font, not a full text family. It intentionally covers only the characters needed for `NOVENDOR` plus space. Add more glyphs by extending `src/glyphs.json` and adding the character mapping in `build_font.py`.
