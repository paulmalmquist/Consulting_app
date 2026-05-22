"""pytest bootstrap: make the `weather_risk` package importable without install.

`pyproject.toml` already sets `pythonpath = ["src"]`, but adding `src/` to
`sys.path` here means the suite also resolves when pytest is invoked from the
repo root or with a different rootdir. The individual test files keep their own
`sys.path` insert too, so they remain runnable standalone.
"""
from __future__ import annotations

import sys
from pathlib import Path

SRC = Path(__file__).resolve().parents[1] / "src"
if str(SRC) not in sys.path:
    sys.path.insert(0, str(SRC))
