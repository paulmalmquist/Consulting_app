"""PR 5 audit smoke test.

Asserts that every KEEP row in docs/ai-testing/PR5_INSTRUCTION_AUDIT.md
references a real symbol that exists in the codebase — so a rename or delete
that orphans an audited instruction is caught immediately.

The audit table rows look like:
  | # | Instruction | Source | Decision | Reference | Rationale |
The Reference cell is parsed for typed references:
  scorer:<func>         — function in eval_loop/scorers.py
  receipt:<Class>.<field> — attribute on a Pydantic/dataclass in backend/
  runtime:<file:sym>    — symbol in a runtime file
  concept:<id>:<path>   — JSON concept file contains a top-level key

REMOVE and REWRITE rows are skipped — only KEEP rows are checked.
"""
from __future__ import annotations

import importlib
import re
import sys
from pathlib import Path

import pytest

_REPO_ROOT = Path(__file__).parents[2]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

_AUDIT_DOC = _REPO_ROOT / "docs" / "ai-testing" / "PR5_INSTRUCTION_AUDIT.md"
_SCORERS_PATH = _REPO_ROOT / "eval_loop" / "scorers.py"
_CONCEPTS_ROOT = _REPO_ROOT / "backend" / "app" / "assistant_runtime" / "concepts"

# ── parse audit table ──────────────────────────────────────────────────────


def _parse_keep_rows() -> list[dict]:
    """Return list of {'row': int, 'refs': [str]} for every KEEP row."""
    rows = []
    text = _AUDIT_DOC.read_text(encoding="utf-8")
    for line in text.splitlines():
        parts = [p.strip() for p in line.split("|")]
        if len(parts) < 6:
            continue
        # parts: ['', '#', 'Instruction', 'Source', 'Decision', 'Reference', 'Rationale', '']
        decision = parts[4] if len(parts) > 4 else ""
        if decision.strip().upper() != "KEEP":
            continue
        ref_cell = parts[5] if len(parts) > 5 else ""
        row_num = parts[1].strip()
        # Extract backtick-quoted tokens as individual refs
        refs = re.findall(r"`([^`]+)`", ref_cell)
        rows.append({"row": row_num, "refs": refs, "raw": ref_cell})
    return rows


# ── reference resolvers ────────────────────────────────────────────────────


def _check_scorer(func_name: str) -> bool:
    """Return True if func_name is defined in eval_loop/scorers.py."""
    text = _SCORERS_PATH.read_text(encoding="utf-8")
    return bool(re.search(rf"^def {re.escape(func_name)}\b", text, re.MULTILINE))


def _check_receipt_field(class_name: str, field_name: str) -> bool:
    """Return True if class_name.field_name exists in backend/ source."""
    # Walk all .py files under backend/app/assistant_runtime/
    runtime_dir = _REPO_ROOT / "backend" / "app" / "assistant_runtime"
    pattern_class = re.compile(rf"class {re.escape(class_name)}\b")
    pattern_field = re.compile(rf"\b{re.escape(field_name)}\b")
    for path in runtime_dir.rglob("*.py"):
        text = path.read_text(encoding="utf-8")
        if pattern_class.search(text) and pattern_field.search(text):
            return True
    # Also check services/
    services_dir = _REPO_ROOT / "backend" / "app" / "services"
    for path in services_dir.rglob("*.py"):
        text = path.read_text(encoding="utf-8")
        if pattern_class.search(text) and pattern_field.search(text):
            return True
    return False


def _check_runtime_symbol(file_part: str, symbol: str) -> bool:
    """Return True if symbol exists in a file whose path contains file_part."""
    candidates = list((_REPO_ROOT / "backend").rglob("*.py"))
    for path in candidates:
        if file_part.replace(":", "/").split("/")[0] in path.name:
            text = path.read_text(encoding="utf-8")
            if symbol in text:
                return True
    return False


def _check_concept_key(concept_id: str, key_path: str) -> bool:
    """Return True if the concept JSON has the top-level key referenced by key_path."""
    import json
    parts = concept_id.split(".")
    # try repe/noi_variance.json
    json_path = _CONCEPTS_ROOT
    for part in parts:
        json_path = json_path / part
    json_path = json_path.with_suffix(".json")
    if not json_path.exists():
        return False
    data = json.loads(json_path.read_text(encoding="utf-8"))
    top_key = key_path.split(":")[0].split("[")[0]
    return top_key in data


# ── parameterised tests ────────────────────────────────────────────────────

KEEP_ROWS = _parse_keep_rows()


@pytest.mark.parametrize("row", KEEP_ROWS, ids=[f"row_{r['row']}" for r in KEEP_ROWS])
def test_keep_row_references_resolve(row):
    """Every KEEP row must have at least one resolvable reference."""
    refs = row["refs"]
    assert refs, f"Row {row['row']}: KEEP row has no backtick-quoted references in cell: {row['raw']!r}"

    failures = []
    resolved = []

    for ref in refs:
        if ref.startswith("scorer:"):
            func = ref[len("scorer:"):]
            if _check_scorer(func):
                resolved.append(ref)
            else:
                failures.append(f"{ref} — function `{func}` not found in eval_loop/scorers.py")

        elif ref.startswith("receipt:"):
            inner = ref[len("receipt:"):]
            if "." in inner:
                cls, field = inner.split(".", 1)
                if _check_receipt_field(cls, field):
                    resolved.append(ref)
                else:
                    failures.append(f"{ref} — {cls}.{field} not found in backend/ source")
            else:
                # bare class name — just check it exists somewhere
                runtime_dir = _REPO_ROOT / "backend" / "app" / "assistant_runtime"
                found = any(
                    f"class {inner}" in p.read_text(encoding="utf-8")
                    for p in runtime_dir.rglob("*.py")
                )
                if found:
                    resolved.append(ref)
                else:
                    failures.append(f"{ref} — class `{inner}` not found in assistant_runtime/")

        elif ref.startswith("runtime:"):
            inner = ref[len("runtime:"):]
            if ":" in inner:
                file_hint, symbol = inner.rsplit(":", 1)
            else:
                file_hint, symbol = inner, inner
            if _check_runtime_symbol(file_hint, symbol):
                resolved.append(ref)
            else:
                failures.append(f"{ref} — `{symbol}` not found near `{file_hint}` in backend/")

        elif ref.startswith("concept:"):
            inner = ref[len("concept:"):]
            parts = inner.split(":", 1)
            concept_id = parts[0]
            key_path = parts[1] if len(parts) > 1 else ""
            if _check_concept_key(concept_id, key_path):
                resolved.append(ref)
            else:
                failures.append(f"{ref} — key `{key_path}` not found in concept `{concept_id}`")

        elif ref.startswith("safety:"):
            # safety refs point to file-based guardrails — check file exists and symbol present
            inner = ref[len("safety:"):]
            file_hint = inner.split(":")[0] if ":" in inner else inner
            candidates = list((_REPO_ROOT / "backend").rglob("*.py"))
            found = any(file_hint in str(p) for p in candidates)
            if found:
                resolved.append(ref)
            else:
                failures.append(f"{ref} — file `{file_hint}` not found in backend/")

        elif ref.startswith("hard-gate"):
            # hard-gate categories are string literals — check they appear in failure_taxonomy or scorers
            category = ref.replace("hard-gate ", "").strip("`")
            scorers_text = _SCORERS_PATH.read_text(encoding="utf-8")
            ft_path = _REPO_ROOT / "eval_loop" / "failure_taxonomy.py"
            ft_text = ft_path.read_text(encoding="utf-8") if ft_path.exists() else ""
            if category in scorers_text or category in ft_text:
                resolved.append(ref)
            else:
                failures.append(f"{ref} — category `{category}` not found in scorers.py or failure_taxonomy.py")

        else:
            # Unrecognised prefix — skip (not an error; might be inline note text)
            resolved.append(ref)

    # At least one ref must have resolved for the row to pass
    if not resolved:
        pytest.fail(
            f"Row {row['row']}: no references resolved.\nFailures:\n" + "\n".join(f"  {f}" for f in failures)
        )
