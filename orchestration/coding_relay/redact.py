"""Secret redaction for every artifact the relay writes.

All run-folder writes go through runs.RunPaths.write(), which calls
redact() on the text first. The goal is to keep tokens that leak into CLI
output (builder logs, test output, diffs) out of the receipts on disk.
Redaction is best-effort pattern matching, not a guarantee; the relay also
never prints environment variables anywhere.

Two pattern tiers:
- SECRET_PATTERNS: aggressive, used for redaction. Over-matching only
  costs a mangled line in a receipt.
- STOP_PATTERNS: high-confidence literal-secret shapes, used by
  safety.secrets_in_diff to terminate a run. Kept narrower so ordinary
  code like `token = create_access_token(user)` does not kill a run.
"""
from __future__ import annotations

import re

# High-confidence literal secret shapes (also all redacted).
STOP_PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    ("github-pat", re.compile(r"github_pat_[A-Za-z0-9_]{20,}")),
    ("github-token", re.compile(r"gh[pousr]_[A-Za-z0-9]{20,}")),
    ("openai-key", re.compile(r"sk-[A-Za-z0-9_-]{20,}")),
    ("aws-key", re.compile(r"AKIA[0-9A-Z]{16}")),
    ("slack-token", re.compile(r"xox[baprs]-[A-Za-z0-9-]{10,}")),
    ("gcp-api-key", re.compile(r"AIza[0-9A-Za-z_-]{35}")),
    ("databricks-token", re.compile(r"dapi[0-9a-f]{30,}")),
    ("jwt", re.compile(r"eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}")),
    ("private-key", re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----")),
    ("bearer-token", re.compile(r"(?i)\bbearer\s+[A-Za-z0-9_\-.=]{20,}")),
    (
        "db-url-credential",
        re.compile(r"(postgres(?:ql)?|mysql|mongodb(?:\+srv)?)://[^:/\s]+:[^@\s]+@"),
    ),
    # Quoted literal assigned to a secret-named key (FOO_TOKEN = "abc...").
    (
        "literal-assignment",
        re.compile(
            r"(?i)\b([a-z0-9_-]*(?:api[_-]?key|apikey|access[_-]?key|client[_-]?secret|"
            r"private[_-]?key|secret|token|password|passwd))\b(\s*[=:]\s*)"
            r"['\"]([A-Za-z0-9_\-./+]{12,})['\"]"
        ),
    ),
]

# Redaction-only additions (aggressive; may match non-secrets).
_REDACT_EXTRA: list[tuple[str, re.Pattern[str]]] = [
    # PEM block bodies (multi-line).
    (
        "private-key-block",
        re.compile(
            r"-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]{0,20000}?-----END [A-Z ]*PRIVATE KEY-----"
        ),
    ),
    # Unquoted assignment to a secret-named key (covers DATABRICKS_TOKEN=dapi...,
    # DB_PASSWORD=..., MY_SECRET=...). The trailing lookahead rejects values
    # followed by "(" so ordinary code like `token = create_access_token(user)`
    # is left intact in receipts.
    (
        "generic-assignment",
        re.compile(
            r"(?i)\b([a-z0-9_-]*(?:api[_-]?key|apikey|access[_-]?key|client[_-]?secret|"
            r"private[_-]?key|secret|token|password|passwd))\b(\s*[=:]\s*)"
            r"['\"]?([A-Za-z0-9_\-./+]{12,})['\"]?(?=[\s'\",;)\]}]|$)"
        ),
    ),
]

# Order matters: the multi-line PEM block must run before the single-line
# BEGIN pattern, or the block body would survive with only its header gone.
SECRET_PATTERNS: list[tuple[str, re.Pattern[str]]] = (
    _REDACT_EXTRA[:1] + STOP_PATTERNS + _REDACT_EXTRA[1:]
)


def redact(text: str) -> str:
    """Replace anything secret-shaped with a [REDACTED:<label>] marker."""
    if not text:
        return text
    out = text
    for label, pattern in SECRET_PATTERNS:
        if label in ("generic-assignment", "literal-assignment"):
            out = pattern.sub(lambda m: f"{m.group(1)}{m.group(2)}[REDACTED:{label}]", out)
        elif label == "db-url-credential":
            out = pattern.sub(lambda m: f"{m.group(1)}://[REDACTED:{label}]@", out)
        else:
            out = pattern.sub(f"[REDACTED:{label}]", out)
    return out
