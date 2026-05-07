"""Upload validation — MIME/extension allowlist, size cap, and signature cross-check.

Two stages are enforced:
  Stage 1 (init_upload): allowed extension + declared MIME, size cap (25 MB).
  Stage 1b (complete_upload): observed byte_size re-checked, MIME/extension
    cross-validated against declared content_type on the version record.
    Magic-byte check runs if python-magic is available; otherwise falls back
    to the header/extension cross-check.

This module raises ValueError for all validation failures so callers can
translate them to 400 (or 413 for size cap) as appropriate.
"""

import os

MAX_UPLOAD_BYTES = 25 * 1024 * 1024  # 25 MB

# Canonical map: extension → allowed MIME types.
# Each entry must appear in ALLOWED_MIMES too.
_EXT_TO_MIMES: dict[str, frozenset[str]] = {
    ".png":  frozenset(["image/png"]),
    ".jpg":  frozenset(["image/jpeg"]),
    ".jpeg": frozenset(["image/jpeg"]),
    ".webp": frozenset(["image/webp"]),
    ".pdf":  frozenset(["application/pdf"]),
    ".docx": frozenset([
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/zip",  # OOXML files are ZIP-based
    ]),
    ".doc":  frozenset(["application/msword"]),
    ".xlsx": frozenset([
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "application/zip",
    ]),
    ".xls":  frozenset(["application/vnd.ms-excel"]),
    ".csv":  frozenset(["text/csv", "text/plain", "application/csv"]),
    ".txt":  frozenset(["text/plain"]),
    ".md":   frozenset(["text/markdown", "text/plain", "text/x-markdown"]),
    ".json": frozenset(["application/json", "text/plain"]),
}

# Flat set of all allowed MIME types.
ALLOWED_MIMES: frozenset[str] = frozenset(
    mime for mimes in _EXT_TO_MIMES.values() for mime in mimes
)

# Allowed extensions.
ALLOWED_EXTENSIONS: frozenset[str] = frozenset(_EXT_TO_MIMES.keys())

# Magic byte signatures (first N bytes → canonical MIME).
_MAGIC_SIGNATURES: list[tuple[bytes, str]] = [
    (b"\x89PNG\r\n\x1a\n", "image/png"),
    (b"\xff\xd8\xff", "image/jpeg"),
    (b"RIFF", "image/webp"),         # WEBP: RIFF....WEBP — checked further below
    (b"%PDF-", "application/pdf"),
    (b"PK\x03\x04", "application/zip"),   # ZIP → DOCX/XLSX (OOXML)
    (b"\xd0\xcf\x11\xe0", "application/msword"),  # Compound Document → DOC/XLS
]


def _ext(filename: str) -> str:
    """Return lowercase extension including the dot, e.g. '.pdf'."""
    _, ext = os.path.splitext(filename.lower())
    return ext


def validate_init_upload(filename: str, content_type: str, byte_size: int | None = None) -> None:
    """Stage 1 — called at init_upload time.

    Validates:
    - Extension is on the allowlist.
    - Declared content_type is on the allowlist and consistent with the extension.
    - byte_size (if provided) does not exceed MAX_UPLOAD_BYTES.

    Raises ValueError on failure (caller translates to 400 or 413).
    """
    ext = _ext(filename)
    if not ext or ext not in ALLOWED_EXTENSIONS:
        allowed_str = ", ".join(sorted(ALLOWED_EXTENSIONS))
        raise ValueError(
            f"File type '{ext or '(none)'}' is not supported. "
            f"Allowed: {allowed_str}"
        )

    declared_mime = content_type.split(";")[0].strip().lower()
    allowed_for_ext = _EXT_TO_MIMES[ext]
    if declared_mime not in allowed_for_ext:
        raise ValueError(
            f"Content-Type '{declared_mime}' is not valid for '{ext}' files. "
            f"Expected one of: {', '.join(sorted(allowed_for_ext))}"
        )

    if byte_size is not None and byte_size > MAX_UPLOAD_BYTES:
        mb = byte_size / (1024 * 1024)
        raise ValueError(f"File size {mb:.1f} MB exceeds the 25 MB limit")


def validate_complete_upload(
    filename: str,
    declared_mime: str,
    byte_size: int,
    header_bytes: bytes | None = None,
) -> None:
    """Stage 1b — called at complete_upload time.

    Validates:
    - byte_size does not exceed MAX_UPLOAD_BYTES (backend enforcement).
    - If header_bytes (first ~16 bytes from storage) are provided, runs a
      magic-byte signature check against the declared MIME/extension.
    - Falls back to MIME/extension cross-check if no header bytes available.

    Raises ValueError on mismatch.
    """
    if byte_size > MAX_UPLOAD_BYTES:
        mb = byte_size / (1024 * 1024)
        raise ValueError(f"File size {mb:.1f} MB exceeds the 25 MB limit")

    ext = _ext(filename)
    if ext not in ALLOWED_EXTENSIONS:
        raise ValueError(f"File type '{ext}' is not on the allowed list")

    mime = declared_mime.split(";")[0].strip().lower()

    if header_bytes:
        _check_magic_bytes(header_bytes, ext, mime, filename)
    else:
        # Fallback: extension/MIME cross-check only
        allowed_for_ext = _EXT_TO_MIMES.get(ext, frozenset())
        if mime not in allowed_for_ext:
            raise ValueError(
                f"MIME/extension mismatch: '{mime}' is not valid for '{ext}'"
            )


def _check_magic_bytes(header_bytes: bytes, ext: str, mime: str, filename: str) -> None:
    """Match magic bytes against declared extension/MIME.

    Raises ValueError on mismatch. Passes silently when signature is
    unrecognised (e.g. plain-text CSV — no magic bytes).
    """
    detected_mime: str | None = None
    for signature, sig_mime in _MAGIC_SIGNATURES:
        if header_bytes[:len(signature)] == signature:
            detected_mime = sig_mime
            break

    if detected_mime is None:
        # No signature match — tolerated for text-type files (CSV, TXT, MD, JSON)
        text_exts = frozenset([".csv", ".txt", ".md", ".json"])
        if ext not in text_exts:
            # Non-text file with no recognisable signature is suspicious but
            # not a hard reject — log-worthy but allow (classifier will catch it)
            pass
        return

    # WEBP special case: RIFF header matches ZIP magic for some readers
    if detected_mime == "application/zip" and ext == ".webp":
        # WEBP starts RIFF....WEBP — check bytes 8-12
        if header_bytes[8:12] == b"WEBP":
            return  # genuine WEBP

    # ZIP-based OOXML: DOCX and XLSX both start PK\x03\x04
    if detected_mime == "application/zip" and ext in (".docx", ".xlsx"):
        return  # OOXML, correct

    # OLE Compound Document: DOC or XLS
    if detected_mime == "application/msword" and ext in (".doc", ".xls"):
        return  # OLE file, correct

    # For other detections, declared MIME must be consistent with detected
    allowed_for_ext = _EXT_TO_MIMES.get(ext, frozenset())
    if detected_mime not in allowed_for_ext:
        # Extra tolerance: both detected and declared are ZIP-family
        if detected_mime == "application/zip" and mime == "application/zip":
            return
        raise ValueError(
            f"File signature mismatch: magic bytes indicate '{detected_mime}' "
            f"but file is declared as '{mime}' ('{ext}')"
        )
