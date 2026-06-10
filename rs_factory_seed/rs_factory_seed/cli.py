"""CLI: python -m rs_factory_seed build|verify [--profile small|medium] [--out DIR]."""

from __future__ import annotations

import argparse
import hashlib
import sys
import tempfile
from pathlib import Path

from .context import BuildContext
from .dataset import Dataset
from .generators import GENERATORS
from .writers import sqlite_dump, write_csv, write_schema_catalog, write_sqlite


def build_dataset(profile: str) -> tuple[BuildContext, Dataset]:
    ctx = BuildContext.create(profile=profile)
    ds = Dataset()
    for gen in GENERATORS:
        gen.run(ctx, ds)
    return ctx, ds


def _emit(ds: Dataset, out_dir: Path) -> Path:
    out_dir = Path(out_dir)
    write_csv(ds, out_dir / "csv")
    db = write_sqlite(ds, out_dir / "sqlite" / "relativity_factory_demo.sqlite")
    write_schema_catalog(ds, out_dir / "schema_catalog.csv")
    return db


def cmd_build(args) -> int:
    _ctx, ds = build_dataset(args.profile)
    db = _emit(ds, args.out)
    print(f"built profile={args.profile} -> {args.out}")
    for name in ds.names():
        print(f"  {name:28s} {len(ds.get(name).rows):>8d} rows")
    print(f"sqlite: {db}")
    return 0


def _fingerprint(out_dir: Path) -> dict[str, str]:
    fp: dict[str, str] = {}
    for csv_path in sorted((out_dir / "csv").glob("*.csv")):
        fp[csv_path.name] = hashlib.sha256(csv_path.read_bytes()).hexdigest()
    db = out_dir / "sqlite" / "relativity_factory_demo.sqlite"
    if db.exists():
        fp["__sqlite_dump__"] = hashlib.sha256(sqlite_dump(db).encode("utf-8")).hexdigest()
    return fp


def cmd_verify(args) -> int:
    """Build twice into temp dirs; confirm byte-identical artifacts."""
    fps = []
    for _ in range(2):
        with tempfile.TemporaryDirectory() as td:
            _ctx, ds = build_dataset(args.profile)
            _emit(ds, Path(td))
            fps.append(_fingerprint(Path(td)))
    a, b = fps
    diffs = [k for k in sorted(set(a) | set(b)) if a.get(k) != b.get(k)]
    if diffs:
        print("NON-DETERMINISTIC artifacts:", diffs)
        return 1
    print(f"determinism OK - {len(a)} artifacts identical across two builds (profile={args.profile})")
    return 0


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(prog="rs_factory_seed")
    sub = p.add_subparsers(dest="command", required=True)
    for name in ("build", "verify"):
        sp = sub.add_parser(name)
        sp.add_argument("--profile", default="small", choices=["small", "medium"])
        sp.add_argument("--out", default="output")
    args = p.parse_args(argv)
    return {"build": cmd_build, "verify": cmd_verify}[args.command](args)


if __name__ == "__main__":
    sys.exit(main())
