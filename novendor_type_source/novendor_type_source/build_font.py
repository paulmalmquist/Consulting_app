#!/usr/bin/env python3
"""Build Novendor Circuit from source contours.

Usage:
  python build_font.py

Outputs are written to ./dist. This script intentionally generates the compiled
font locally from the editable source files in ./src.
"""
from __future__ import annotations

import json
from pathlib import Path
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parent
SRC = ROOT / "src" / "glyphs.json"
DIST = ROOT / "dist"

LOWER_MAP = {"n": "N", "o": "O", "v": "V", "e": "E", "d": "D", "r": "R"}


def make_glyph(contours):
    pen = TTGlyphPen(None)
    if not contours:
        return pen.glyph()
    for contour in contours:
        pen.moveTo(tuple(contour[0]))
        for point in contour[1:]:
            pen.lineTo(tuple(point))
        pen.closePath()
    return pen.glyph()


def main() -> None:
    data = json.loads(SRC.read_text())
    upm = int(data["unitsPerEm"])
    glyph_defs = data["glyphs"]

    glyph_order = [".notdef", "space"] + sorted(glyph_defs.keys())
    glyphs = {".notdef": make_glyph([]), "space": make_glyph([])}
    metrics = {".notdef": (600, 0), "space": (360, 0)}

    for name in sorted(glyph_defs.keys()):
        glyphs[name] = make_glyph(glyph_defs[name]["contours"])
        metrics[name] = (int(glyph_defs[name]["advance"]), 0)

    cmap = {32: "space"}
    for name in glyph_defs.keys():
        cmap[ord(name)] = name
    for lower, upper in LOWER_MAP.items():
        cmap[ord(lower)] = upper

    fb = FontBuilder(upm, isTTF=True)
    fb.setupGlyphOrder(glyph_order)
    fb.setupCharacterMap(cmap)
    fb.setupGlyf(glyphs)
    fb.setupHorizontalMetrics(metrics)
    fb.setupHorizontalHeader(ascent=820, descent=-180)
    fb.setupOS2(sTypoAscender=820, sTypoDescender=-180, usWinAscent=900, usWinDescent=220)
    fb.setupNameTable({
        "familyName": data["family"],
        "styleName": "Regular",
        "uniqueFontIdentifier": "Novendor Circuit Regular 1.0",
        "fullName": "Novendor Circuit Regular",
        "psName": "NovendorCircuit-Regular",
        "version": "Version 1.000",
    })
    fb.setupPost()
    fb.setupMaxp()

    DIST.mkdir(exist_ok=True)
    ttf_path = DIST / "NovendorCircuit-Regular.ttf"
    fb.save(ttf_path)

    # Optional webfont outputs. WOFF2 requires brotli support in fontTools.
    for flavor, suffix in [("woff", "woff"), ("woff2", "woff2")]:
        try:
            font = TTFont(ttf_path)
            font.flavor = flavor
            font.save(DIST / f"NovendorCircuit-Regular.{suffix}")
        except Exception as exc:
            print(f"Skipped {suffix}: {exc}")

    print(f"Built {ttf_path}")


if __name__ == "__main__":
    main()
