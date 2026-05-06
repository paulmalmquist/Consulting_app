"""Smoke test for the PR 5 instruction audit.

The audit at `docs/ai-testing/PR5_INSTRUCTION_AUDIT.md` is the durable
record of which model-facing prompt instructions are kept, rewritten, or
removed, and what each KEEP maps to. This test enforces the audit's
guarantees:

  1. The audit table parses cleanly — no row in TBD state.
  2. Every KEEP / REWRITE row's reference is resolvable: the cited file
     exists and the cited symbol/field appears in source.
  3. Every REMOVE row's verbatim instruction text does NOT appear
     anywhere under `backend/app/` — i.e., the removal actually happened.

Reference syntax recognized in the audit's `Reference` column:

  concept:<concept_id>:<field>     concept-object field path
  receipt:<class>.<field>          Pydantic / dataclass field
  scorer:<function_name>           function in eval_loop/scorers.py
  safety:<file>:<linerange>        runtime safety rule (file must exist)
  runtime:<file:line | symbol>     runtime invariant (file or symbol)
"""
from __future__ import annotations

import re
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
AUDIT_PATH = ROOT / "docs" / "ai-testing" / "PR5_INSTRUCTION_AUDIT.md"
BACKEND_APP = ROOT / "backend" / "app"
SCORERS_FILE = ROOT / "eval_loop" / "scorers.py"
TURN_RECEIPTS_FILE = ROOT / "backend" / "app" / "assistant_runtime" / "turn_receipts.py"
PROMPT_RECEIPTS_FILE = ROOT / "backend" / "app" / "services" / "prompt_receipts.py"
CONCEPTS_DIR = ROOT / "backend" / "app" / "assistant_runtime" / "concepts"


# ── Audit parser ──────────────────────────────────────────────────────────


def _read_audit_text() -> str:
    assert AUDIT_PATH.exists(), f"Audit file missing: {AUDIT_PATH}"
    return AUDIT_PATH.read_text(encoding="utf-8")


# Match lines that look like the body of the audit table:
#   | <num> | `instruction` | source_link | DECISION | references | rationale |
# A header row contains the literal "Decision" so we filter it out by checking
# that the cell parses to a known decision keyword.
_DECISIONS = {"KEEP", "REWRITE", "REMOVE", "TBD"}
_TABLE_ROW_RE = re.compile(
    r"^\|\s*(?P<num>\d+)\s*\|\s*"
    r"(?P<instruction>.+?)\s*\|\s*"
    r"(?P<source>.+?)\s*\|\s*"
    r"(?P<decision>[A-Z]+)\s*\|\s*"
    r"(?P<references>.+?)\s*\|\s*"
    r"(?P<rationale>.+?)\s*\|\s*$",
    re.MULTILINE,
)


def _parse_audit_rows() -> list[dict[str, str]]:
    text = _read_audit_text()
    rows = []
    for m in _TABLE_ROW_RE.finditer(text):
        decision = m.group("decision").strip().upper()
        if decision not in _DECISIONS:
            # Not an audit table row (e.g., the guardrails-preserved table).
            continue
        rows.append({
            "num": m.group("num").strip(),
            "instruction": m.group("instruction").strip(),
            "source": m.group("source").strip(),
            "decision": decision,
            "references": m.group("references").strip(),
            "rationale": m.group("rationale").strip(),
        })
    return rows


def _strip_backticks(s: str) -> str:
    s = s.strip()
    if s.startswith("`") and s.endswith("`"):
        return s[1:-1]
    return s


# ── Reference resolution ──────────────────────────────────────────────────


def _backend_app_files() -> list[Path]:
    return [p for p in BACKEND_APP.rglob("*") if p.is_file()]


@pytest.fixture(scope="module")
def backend_files_text() -> dict[Path, str]:
    """Read every backend/app file once. Used by the REMOVE-grep check."""
    out: dict[Path, str] = {}
    for p in _backend_app_files():
        if p.suffix in (".py", ".txt", ".md", ".yaml", ".yml", ".json"):
            try:
                out[p] = p.read_text(encoding="utf-8", errors="replace")
            except Exception:
                continue
    return out


@pytest.fixture(scope="module")
def scorers_text() -> str:
    return SCORERS_FILE.read_text(encoding="utf-8")


@pytest.fixture(scope="module")
def turn_receipts_text() -> str:
    return TURN_RECEIPTS_FILE.read_text(encoding="utf-8")


@pytest.fixture(scope="module")
def prompt_receipts_text() -> str:
    return PROMPT_RECEIPTS_FILE.read_text(encoding="utf-8")


def _reference_resolves(
    ref: str,
    *,
    scorers_text: str,
    turn_receipts_text: str,
    prompt_receipts_text: str,
    backend_files_text: dict[Path, str],
) -> tuple[bool, str]:
    """Resolve a single reference token. Returns (resolved, reason)."""
    ref = ref.strip()

    if ref.startswith("scorer:"):
        name = ref[len("scorer:"):].strip()
        # Either a `def name(` definition or an exact symbol presence in scorers.py.
        if re.search(rf"\b{re.escape(name)}\b", scorers_text):
            return True, ""
        return False, f"scorer reference not found in {SCORERS_FILE.name}: {name}"

    if ref.startswith("receipt:"):
        spec = ref[len("receipt:"):].strip()
        # Format: <Class>.<field> — check both turn_receipts.py and prompt_receipts.py.
        if "." in spec:
            cls, field = spec.split(".", 1)
        else:
            cls, field = spec, ""
        for haystack in (turn_receipts_text, prompt_receipts_text):
            if cls in haystack and (not field or field in haystack):
                return True, ""
        return False, f"receipt reference not found: {spec}"

    if ref.startswith("concept:"):
        spec = ref[len("concept:"):].strip()
        # Format: <concept_id>:<field>. concept_id maps to a file under concepts/.
        # We check that the concept JSON exists and contains the field name.
        parts = spec.split(":", 1)
        concept_id = parts[0]
        # Resolve concept_id (e.g., "repe.noi_variance") to a file path.
        rel = concept_id.replace(".", "/") + ".json"
        path = CONCEPTS_DIR / rel
        if not path.exists():
            # The audit also accepts generic refs like `concept:required_context`
            # (no concept_id pinned). Fall through to a generic field check.
            field_path = parts[1] if len(parts) > 1 else parts[0]
            field_root = field_path.split(".")[0].split("[")[0]
            for json_path in CONCEPTS_DIR.rglob("*.json"):
                if field_root in json_path.read_text(encoding="utf-8"):
                    return True, ""
            return False, f"concept file missing: {path} (and no concept JSON contains {field_root})"
        text = path.read_text(encoding="utf-8")
        if len(parts) > 1:
            field_root = parts[1].split(".")[0].split("[")[0]
            if field_root not in text:
                return False, f"concept field {field_root} not in {path.name}"
        return True, ""

    if ref.startswith("safety:"):
        spec = ref[len("safety:"):].strip()
        # Format: <file>:<linerange> — file must exist.
        file_part = spec.split(":", 1)[0]
        candidate = ROOT / file_part
        if candidate.exists():
            return True, ""
        return False, f"safety reference file missing: {file_part}"

    if ref.startswith("runtime:"):
        spec = ref[len("runtime:"):].strip()
        # Format: <file>:<symbol>  OR  <file:line>  OR  bare symbol.
        # Try the file-prefix form first.
        file_part = spec.split(":", 1)[0] if ":" in spec else spec
        candidate = ROOT / file_part
        if candidate.exists():
            return True, ""
        # Bare symbol: search the whole backend tree.
        symbol = spec.split("(", 1)[0]
        for haystack in backend_files_text.values():
            if symbol in haystack:
                return True, ""
        return False, f"runtime reference unresolvable: {spec}"

    # Unstructured reference (English prose, e.g., "(none — runtime-enforced)").
    # Only valid for REMOVE rows — caller must check decision context.
    return True, ""


# ── Tests ─────────────────────────────────────────────────────────────────


def test_audit_table_parses_with_at_least_24_rows():
    rows = _parse_audit_rows()
    assert len(rows) >= 24, (
        f"Expected at least 24 audit rows; parser found {len(rows)}. "
        "Either rows were dropped from the audit or the table format drifted."
    )


def test_no_row_is_tbd():
    rows = _parse_audit_rows()
    tbd = [r["num"] for r in rows if r["decision"] == "TBD"]
    assert not tbd, f"Audit rows still in TBD state: {tbd}"


def test_decisions_are_well_known():
    rows = _parse_audit_rows()
    bad = [(r["num"], r["decision"]) for r in rows if r["decision"] not in {"KEEP", "REWRITE", "REMOVE"}]
    assert not bad, f"Audit rows with unknown decision: {bad}"


def test_keep_and_rewrite_references_resolve(
    scorers_text, turn_receipts_text, prompt_receipts_text, backend_files_text
):
    """For every KEEP / REWRITE row, at least one parseable reference token
    in the row's references column must resolve. Rationale: an instruction
    is kept only if it maps to something concrete; the test enforces that
    the cited symbol/file actually exists."""
    rows = _parse_audit_rows()
    failures: list[str] = []
    # Token kinds the test recognizes as structured references.
    structured_prefixes = ("scorer:", "receipt:", "concept:", "safety:", "runtime:")
    for r in rows:
        if r["decision"] not in {"KEEP", "REWRITE"}:
            continue
        refs_field = r["references"]
        # A row may list multiple references separated by `+`. Strip backticks.
        candidates = [c.strip() for c in re.split(r"\+", refs_field)]
        # Pull out structured tokens — the rest is rationale prose.
        structured: list[str] = []
        for c in candidates:
            cleaned = c.strip()
            for prefix in structured_prefixes:
                idx = cleaned.find(prefix)
                if idx != -1:
                    # Token runs to end of cell or until whitespace+English-word.
                    tail = cleaned[idx:]
                    # Cut off any trailing parenthetical prose.
                    cut = re.split(r"\s\(", tail, maxsplit=1)[0]
                    # Strip enclosing markdown backticks/punctuation that the
                    # references column uses for code formatting.
                    cut = cut.strip().strip("`").strip(".,;:")
                    structured.append(cut.strip())
                    break
        if not structured:
            failures.append(
                f"Row #{r['num']} ({r['decision']}) has no structured reference tokens. "
                f"References cell: {refs_field!r}"
            )
            continue
        # At least one must resolve.
        any_resolved = False
        unresolved_msgs: list[str] = []
        for token in structured:
            ok, reason = _reference_resolves(
                token,
                scorers_text=scorers_text,
                turn_receipts_text=turn_receipts_text,
                prompt_receipts_text=prompt_receipts_text,
                backend_files_text=backend_files_text,
            )
            if ok:
                any_resolved = True
                break
            unresolved_msgs.append(f"{token!r}: {reason}")
        if not any_resolved:
            failures.append(
                f"Row #{r['num']} ({r['decision']}) — no reference resolved: "
                + "; ".join(unresolved_msgs)
            )
    assert not failures, "\n".join(failures)


def test_removed_instructions_no_longer_appear_in_backend_app(backend_files_text):
    """For every REMOVE row, the verbatim instruction text must not appear
    anywhere under backend/app/. This is the test that catches a partial
    removal — instruction marked REMOVE in the audit but still present in
    a prompt file."""
    rows = _parse_audit_rows()
    removed = [r for r in rows if r["decision"] == "REMOVE"]
    assert removed, "Audit has zero REMOVE rows — strip-down was theatrical"
    failures: list[str] = []
    for r in removed:
        verbatim = _strip_backticks(r["instruction"])
        # Trim leading numbering like "1. " from quoted bullets.
        verbatim = re.sub(r"^\d+\.\s*", "", verbatim).strip()
        if not verbatim:
            failures.append(f"Row #{r['num']} (REMOVE) has empty instruction text after parsing.")
            continue
        # The instruction may have markdown-escaped characters; normalize the
        # candidate text the same way the file would store it.
        # Search every prompt-relevant file in backend/app/.
        hits: list[str] = []
        for path, text in backend_files_text.items():
            if verbatim in text:
                # Allow the audit doc itself to mention the text.
                rel = str(path.relative_to(ROOT)).replace("\\", "/")
                hits.append(rel)
        if hits:
            failures.append(
                f"Row #{r['num']} (REMOVE) text still appears in backend/app/: {hits}\n"
                f"  text: {verbatim!r}"
            )
    assert not failures, "\n".join(failures)


def test_keep_count_dominates_remove_count():
    """Sanity check that the audit isn't an over-correction: most
    instructions should be kept, with a smaller number of intentional
    removals. If REMOVE >= KEEP, that's a signal the audit went too far."""
    rows = _parse_audit_rows()
    keep = sum(1 for r in rows if r["decision"] == "KEEP")
    remove = sum(1 for r in rows if r["decision"] == "REMOVE")
    assert keep > remove, (
        f"REMOVE ({remove}) >= KEEP ({keep}) — audit over-corrected. "
        "User #4 forbids weakening confirmation, fail-closed, or state-lock guardrails."
    )


def test_remove_count_is_nonzero():
    """The audit must produce at least one removal — otherwise the
    strip-down was performative."""
    rows = _parse_audit_rows()
    remove = sum(1 for r in rows if r["decision"] == "REMOVE")
    assert remove > 0, (
        "Audit has zero REMOVE rows. The mechanical rule requires actual "
        "strip-down; an all-KEEP audit means the audit didn't apply the rule."
    )
