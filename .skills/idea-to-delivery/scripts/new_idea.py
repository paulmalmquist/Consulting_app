#!/usr/bin/env python3
"""Scaffold a dated idea folder: idea record + ADR stub + paired-plan stub.

Usage:
    python new_idea.py "coolant-channel completeness check" [--dir docs/ideas]

Creates docs/ideas/YYYY-MM-DD-<slug>/ containing:
    idea-record.md, adr-001.md, code-devops-plan.md
copied from this skill's assets/ with the title and date filled in.
"""
import argparse, datetime, re, sys
from pathlib import Path

ASSETS = Path(__file__).resolve().parent.parent / "assets"

def slugify(s):
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")[:60]

def fill(text, title, date):
    return (text.replace("<short title>", title)
                .replace("<decision title>", title)
                .replace("<story title>", title)
                .replace("YYYY-MM-DD", date))

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("title")
    ap.add_argument("--dir", default="docs/ideas")
    args = ap.parse_args()
    date = datetime.date.today().isoformat()
    folder = Path(args.dir) / f"{date}-{slugify(args.title)}"
    folder.mkdir(parents=True, exist_ok=True)
    pairs = [
        ("idea-record-template.md", "idea-record.md"),
        ("adr-template.md", "adr-001.md"),
        ("code-devops-plan-template.md", "code-devops-plan.md"),
    ]
    for src, dst in pairs:
        sp = ASSETS / src
        if not sp.exists():
            print(f"warn: missing asset {sp}", file=sys.stderr); continue
        (folder / dst).write_text(fill(sp.read_text(encoding="utf-8"), args.title, date), encoding="utf-8")
    print(f"Scaffolded {folder}")
    for _, dst in pairs:
        print(f"  {folder / dst}")
    print("\nNext: develop the idea record (phase 1), then run azure-devops-intake to create tas