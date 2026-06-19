"""FOMC text client. Live fetch is strict + lazy-httpx (public, no key). HTML →
doc-dict extraction is a PURE function (`extract_document`) tested with fixtures;
the live page-scrape (`fetch_documents`) is best-effort and needs live
verification before a real ingest. No embedding, no LLM, no summarization.
"""

from __future__ import annotations

import html as _html
import re
from typing import Any

from .config import FomcTextSettings

_TAG_RE = re.compile(r"<[^>]+>")
_P_RE = re.compile(r"<p\b[^>]*>(.*?)</p>", re.IGNORECASE | re.DOTALL)
_TITLE_RE = re.compile(r"<title[^>]*>(.*?)</title>", re.IGNORECASE | re.DOTALL)
_H_RE = re.compile(r"<h[1-4][^>]*>(.*?)</h[1-4]>", re.IGNORECASE | re.DOTALL)
_DATE_IN_URL = re.compile(r"monetary(\d{8})")
_STATEMENT_HREF = re.compile(r'href="(/newsevents/pressreleases/monetary\d{8}a\.htm)"', re.IGNORECASE)


class FomcTextFetchError(RuntimeError):
    """FOMC live fetch failed (network/HTTP)."""


class FomcTextShapeError(RuntimeError):
    """A document/response was not the expected shape."""


def _strip(text: str) -> str:
    return _html.unescape(_TAG_RE.sub("", text)).strip()


def _date_from_url(url: str) -> str | None:
    m = _DATE_IN_URL.search(url or "")
    if not m:
        return None
    raw = m.group(1)  # YYYYMMDD
    return f"{raw[0:4]}-{raw[4:6]}-{raw[6:8]}"


def extract_document(html: Any, url: str, text_type: str) -> dict[str, Any]:
    """Pure HTML → doc dict. Raises FomcTextShapeError if `html` is not a string."""
    if not isinstance(html, str):
        raise FomcTextShapeError("FOMC document is not HTML text")
    title_m = _TITLE_RE.search(html) or _H_RE.search(html)
    title = _strip(title_m.group(1)) if title_m else None
    paragraphs = [_strip(p) for p in _P_RE.findall(html)]
    paragraphs = [p for p in paragraphs if p]
    body = "\n".join(paragraphs) if paragraphs else None
    return {
        "date": _date_from_url(url),
        "title": title or None,
        "url": url,
        "body": body,
        "text_type": text_type,
    }


def _get(url: str, settings: FomcTextSettings) -> str:
    import httpx  # noqa: PLC0415 — lazy; live path only

    try:
        resp = httpx.get(url, timeout=settings.timeout_seconds)
    except Exception as exc:
        raise FomcTextFetchError(f"FOMC request failed for {url}: {exc}") from exc
    if resp.status_code != 200:
        raise FomcTextFetchError(f"FOMC {url} → HTTP {resp.status_code}")
    return resp.text


def fetch_documents(series_def: dict[str, Any], *, limit: int | None = None,
                    settings: FomcTextSettings | None = None) -> list[dict[str, Any]]:
    """Live best-effort scrape of FOMC statements → doc dicts. NEEDS live
    verification of the Fed page structure before a real ingest. Not unit-tested
    (no network); unit tests exercise `extract_document` + the normalizer.
    """
    settings = settings or FomcTextSettings.from_env()
    index_html = _get(f"{settings.base_url}/newsevents/pressreleases/monetary-policy.htm", settings)
    hrefs = _STATEMENT_HREF.findall(index_html)
    if limit:
        hrefs = hrefs[: int(limit)]
    docs: list[dict[str, Any]] = []
    for href in hrefs:
        full = f"{settings.base_url}{href}"
        docs.append(extract_document(_get(full, settings), full, series_def["text_type"]))
    return docs
