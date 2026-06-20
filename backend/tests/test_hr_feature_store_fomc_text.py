"""B5 tests: FOMC text connector (registry / extract / normalizer / ingest) +
silver loader + event-cadence freshness. TEXT ONLY — no embeddings/LLM/
classification. Fixtures only — NO network in any test.
"""

from __future__ import annotations

import re
from datetime import datetime, timezone
from pathlib import Path

import pytest

from app.services.hr_feature_store.connectors.fomc_text import client as fclient
from app.services.hr_feature_store.connectors.fomc_text import normalizer as fnorm
from app.services.hr_feature_store.connectors.fomc_text import series_registry as freg
from app.services.hr_feature_store.connectors.fomc_text.ingest import EMBEDDING_STATUS, run_ingest
from app.services.hr_feature_store.freshness import compute_status
from app.services.hr_feature_store.loader import upsert_silver_readings

FX = Path(__file__).parent / "fixtures" / "hr_feature_store" / "fomc_text"
VALID_HTML = (FX / "valid_statement.html").read_text(encoding="utf-8")
MISSING_BODY_HTML = (FX / "missing_body.html").read_text(encoding="utf-8")
BAD_HTML = (FX / "bad_shape.html").read_text(encoding="utf-8")
STMT_URL = "https://www.federalreserve.gov/newsevents/pressreleases/monetary20260617a.htm"
ID_RE = re.compile(r"^[a-z0-9_]+$")


# ── Registry ──────────────────────────────────────────────────────────────────

def test_registry_url_safe_text_no_quant_slot():
    for key, meta in freg.FOMC_TEXT_SERIES.items():
        assert ID_RE.match(key)
        assert meta["quant_slot"] is None  # text never claims a quant slot
        assert meta["cadence"] == "event"
        assert meta["canonical_name"]
    assert freg.FOMC_TEXT_SERIES["fomc_minutes"]["source_available"] is False


# ── extract_document (pure HTML parse) ────────────────────────────────────────

def test_extract_valid_statement():
    doc = fclient.extract_document(VALID_HTML, STMT_URL, "statement")
    assert doc["date"] == "2026-06-17"  # parsed from the URL
    assert doc["title"] and "FOMC statement" in doc["title"]
    assert doc["body"] and "federal funds rate" in doc["body"]
    assert doc["url"] == STMT_URL


def test_extract_missing_body():
    doc = fclient.extract_document(MISSING_BODY_HTML, STMT_URL, "statement")
    assert doc["title"]
    assert doc["body"] is None


def test_extract_non_string_raises():
    with pytest.raises(fclient.FomcTextShapeError):
        fclient.extract_document(None, STMT_URL, "statement")


# ── Normalizer (pure; text → provenance, value NULL) ──────────────────────────

def test_normalize_valid_doc():
    doc = fclient.extract_document(VALID_HTML, STMT_URL, "statement")
    rows = fnorm.normalize_documents("fomc_statement", [doc], source_quality="fixture")
    assert len(rows) == 1
    r = rows[0]
    assert r["connector"] == "fomc_text"
    assert r["series_key"] == "fomc_statement_text"
    assert r["value"] is None  # text: numeric value intentionally NULL
    assert r["quality_flag"] == "text"
    assert r["null_reason"] is None
    assert r["ts_source"] == "2026-06-17T00:00:00+00:00"
    p = r["provenance"]
    assert p["text"] == doc["body"]  # full text preserved in provenance
    assert p["url"] == STMT_URL and p["title"] and p["date"] == "2026-06-17"
    assert p["unit"] == "text" and p["char_count"] > 0 and p["text_sha256"]
    assert p["embedding_status"] == "embedding_materializer_not_configured"
    # no summarization/classification leaked into provenance
    assert "summary" not in p and "hawkish" not in p and "sentiment" not in p


def test_normalize_missing_text():
    doc = fclient.extract_document(MISSING_BODY_HTML, STMT_URL, "statement")
    r = fnorm.normalize_documents("fomc_statement", [doc])[0]
    assert r["value"] is None
    assert r["null_reason"] == "fomc_missing_text"


def test_normalize_missing_date():
    doc = {"date": None, "title": "x", "url": "https://example/no-date", "body": "b", "text_type": "statement"}
    r = fnorm.normalize_documents("fomc_statement", [doc])[0]
    assert r["null_reason"] == "fomc_missing_date"
    assert r["ts_source"] is None


def test_normalize_bad_shape_raises():
    with pytest.raises(fnorm.FomcTextShapeError):
        fnorm.normalize_documents("fomc_statement", "not-a-list")
    with pytest.raises(fnorm.FomcTextShapeError):
        fnorm.normalize_documents("fomc_statement", [123])


def test_normalize_refuses_unsourced_series():
    with pytest.raises(ValueError):
        fnorm.normalize_documents("fomc_minutes", [{"date": "2026-01-01", "body": "x"}])


# ── Loader idempotency (FakeCursor) ───────────────────────────────────────────

def test_silver_upsert_tally_with_fomc_rows(fake_cursor):
    fake_cursor.push_result([{"inserted": True}])
    doc = fclient.extract_document(VALID_HTML, STMT_URL, "statement")
    rows = fnorm.normalize_documents("fomc_statement", [doc])
    counts = upsert_silver_readings(rows)
    assert counts["inserted"] == 1


# ── Event cadence freshness ───────────────────────────────────────────────────

def test_event_cadence_fresh_then_stale():
    now = datetime(2026, 6, 16, tzinfo=timezone.utc)
    assert compute_status(datetime(2026, 6, 13, tzinfo=timezone.utc), now, "event")[0] == "fresh"  # 3d
    assert compute_status(datetime(2026, 6, 1, tzinfo=timezone.utc), now, "event")[0] == "stale"   # 15d


# ── Ingest: statement writes; minutes unavailable; dry-run no write ───────────

def _fake_fetch(meta, limit=None):
    return [fclient.extract_document(VALID_HTML, STMT_URL, "statement")]


def test_ingest_statement_and_minutes_unavailable():
    calls = {"upsert": 0}

    def upsert_spy(rows):
        calls["upsert"] += 1
        return {"inserted": len(rows), "updated": 0, "skipped": 0, "unavailable": 0}

    out = run_ingest(write=True, fetch_fn=_fake_fetch, upsert_fn=upsert_spy, status_fn=lambda *a, **k: True)
    by = {i["series"]: i for i in out["series"]}
    assert by["fomc_minutes"]["status"] == "unavailable"
    assert by["fomc_minutes"]["null_reason"] == "minutes_source_not_configured"
    assert by["fomc_statement"]["rows"] == 1
    assert by["fomc_statement"]["embedding_status"] == EMBEDDING_STATUS  # not embedded
    assert calls["upsert"] == 1


def test_ingest_dry_run_does_not_write():
    calls = {"upsert": 0, "status": 0}
    out = run_ingest(
        series=["fomc_statement"], write=False, fetch_fn=_fake_fetch,
        upsert_fn=lambda rows: calls.__setitem__("upsert", calls["upsert"] + 1) or {},
        status_fn=lambda *a, **k: calls.__setitem__("status", calls["status"] + 1) or True,
    )
    assert out["mode"] == "dry-run"
    assert calls == {"upsert": 0, "status": 0}


# ── Scope guards (no embedding/LLM, no episode_embeddings, no ADE) ────────────

def test_no_embedding_llm_or_ade_imports():
    from app.services.hr_feature_store.connectors.fomc_text import config as fcfg
    from app.services.hr_feature_store.connectors.fomc_text import ingest as fing

    for mod in (fclient, fnorm, freg, fcfg, fing):
        src = Path(mod.__file__).read_text(encoding="utf-8")
        for banned in ("import openai", "from openai", "import anthropic", "from anthropic",
                       ".embeddings.create", "encode_state_vector", "episode_embeddings",
                       "ade_connectors", "cre_source_registry"):
            assert banned not in src, f"{banned} leaked into {mod.__name__}"
