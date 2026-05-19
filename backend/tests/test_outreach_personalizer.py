"""test_outreach_personalizer.py — Phase 1 constraint + flow tests.

Modeled on test_pitch_forge_constraints.py. Runs with no Postgres (cursor mocked
via the conftest `fake_cursor` fixture / direct patches) and no OPENAI_API_KEY
(the seed flow uses the deterministic pack; the AI path is mocked where tested).

Coverage:
1. Target creation is idempotent on (env_id, firm_slug)
2. Artemis target returns a microsite URL
3. Generated/fallback cold email is exactly 4 sentences
4. Generated/fallback cold email references one named insight
5. Public microsite payload returns the expected sections
6. Tracking accepts microsite_view
7. Tracking accepts microsite_cta
8. Regenerate increments regenerated_count
"""
from __future__ import annotations

import json
from unittest.mock import patch

import pytest

ENV_ID = "test-env-artemis"
SLUG = "artemis-real-estate-partners"
FIRM = "Artemis Real Estate Partners"
TARGET_ID = "11111111-1111-1111-1111-111111111111"


def _target_row(status: str = "pending", microsite_url=None) -> dict:
    return {
        "id": TARGET_ID,
        "env_id": ENV_ID,
        "business_id": None,
        "crm_account_id": None,
        "firm_name": FIRM,
        "firm_slug": SLUG,
        "status": status,
        "logo_url": None,
        "accent_hsl": None,
        "profile_json": {"sector": "Real estate investment management"},
        "microsite_url": microsite_url,
        "loom_url": None,
    }


def _insight_asset() -> dict:
    return {
        "id": "a0000000-0000-0000-0000-000000000001",
        "target_id": TARGET_ID,
        "asset_type": "insight",
        "position": 0,
        "payload": {
            "insights": [
                {
                    "title": "Investor reporting runs on spreadsheets",
                    "observation": "Likely spreadsheet-driven quarterly reporting.",
                    "novendor_angle": "Novendor builds a controlled reporting layer.",
                    "confidence": "medium",
                }
            ],
            "source": "deterministic_seed",
        },
        "generated_at": "2026-05-19T00:00:00Z",
        "regenerated_count": 0,
    }


def _loom_asset() -> dict:
    return {
        "id": "a0000000-0000-0000-0000-000000000002",
        "target_id": TARGET_ID,
        "asset_type": "loom_script",
        "position": 0,
        "payload": {"script": "A short personal walkthrough.", "source": "deterministic_seed"},
        "generated_at": "2026-05-19T00:00:00Z",
        "regenerated_count": 0,
    }


def _email_asset() -> dict:
    return {
        "id": "a0000000-0000-0000-0000-000000000003",
        "target_id": TARGET_ID,
        "asset_type": "cold_email",
        "position": 0,
        "payload": {
            "subject": "Investor reporting without the scramble",
            "body": "One. Two. Three. Four.",
            "references_insight": "Investor reporting runs on spreadsheets",
            "source": "deterministic_seed",
        },
        "generated_at": "2026-05-19T00:00:00Z",
        "regenerated_count": 0,
    }


# ---------------------------------------------------------------------------
# AI / deterministic asset pack (no key → deterministic path)
# ---------------------------------------------------------------------------

class TestDeterministicPack:
    def test_seed_pack_is_deterministic_without_key(self):
        from app.services import outreach_personalizer_ai as ai

        assert ai.ai_available() is False  # conftest does not set OPENAI_API_KEY
        pack = ai.generate_asset_pack(firm_name=FIRM, sector="REPE", profile={})
        assert pack["source"] == "deterministic_seed"
        assert len(pack["insights"]) >= 3
        assert pack["loom_script"]["script"]
        assert pack["cold_email"]["body"]

    def test_cold_email_is_exactly_four_sentences(self):
        from app.services import outreach_personalizer_ai as ai

        pack = ai.generate_asset_pack(firm_name=FIRM, sector="REPE", profile={})
        body = pack["cold_email"]["body"]
        assert ai.count_sentences(body) == 4, body

    def test_cold_email_references_a_named_insight(self):
        from app.services import outreach_personalizer_ai as ai

        pack = ai.generate_asset_pack(firm_name=FIRM, sector="REPE", profile={})
        titles = [i["title"] for i in pack["insights"]]
        ref = pack["cold_email"]["references_insight"]
        assert ref in titles
        # Body must actually contain a salient token from the referenced insight.
        assert "investor reporting" in pack["cold_email"]["body"].lower()

    def test_count_sentences_helper(self):
        from app.services.outreach_personalizer_ai import count_sentences

        assert count_sentences("A. B. C. D.") == 4
        assert count_sentences("One sentence only.") == 1
        assert count_sentences("Has a colon: still one sentence.") == 1
        assert count_sentences("") == 0

    def test_validate_rejects_wrong_sentence_count(self):
        from app.services import outreach_personalizer_ai as ai

        insights = [{"title": "Investor reporting runs on spreadsheets"}]
        bad = {
            "subject": "x",
            "body": "Only three sentences here. Second one. Third one.",
            "references_insight": "Investor reporting runs on spreadsheets",
        }
        with pytest.raises(ValueError) as exc:
            ai._validate_cold_email(bad, insights)
        assert "exactly 4 sentences" in str(exc.value)

    def test_validate_rejects_unreferenced_insight(self):
        from app.services import outreach_personalizer_ai as ai

        insights = [{"title": "Investor reporting runs on spreadsheets"}]
        bad = {
            "subject": "x",
            "body": "Sentence one. Sentence two. Sentence three. Sentence four.",
            "references_insight": "Some other thing not in the list",
        }
        with pytest.raises(ValueError):
            ai._validate_cold_email(bad, insights)

    def test_ai_path_validates_and_returns_email(self):
        from app.services import outreach_personalizer_ai as ai

        insights = [
            {
                "title": "Investor reporting runs on spreadsheets",
                "observation": "x",
                "novendor_angle": "y",
                "confidence": "medium",
            }
        ]
        ai_email = json.dumps(
            {
                "subject": "Investor reporting without the scramble",
                "body": (
                    "Firms like yours run investor reporting on spreadsheets under "
                    "deadline. Novendor builds a controlled internal reporting layer. "
                    "It carries provenance and fail-closed behavior. If useful, I will "
                    "send a short walkthrough."
                ),
                "references_insight": "Investor reporting runs on spreadsheets",
            }
        )
        with patch.object(ai, "_chat", return_value=ai_email):
            result = ai.generate_cold_email(
                firm_name=FIRM, sector="REPE", profile={}, insights=insights
            )
        assert ai.count_sentences(result["body"]) == 4

    def test_regenerate_fails_closed_without_ai(self):
        from app.services import outreach_personalizer_ai as ai

        with pytest.raises(ValueError) as exc:
            ai.regenerate_asset(
                asset_type="cold_email",
                firm_name=FIRM,
                sector="REPE",
                profile={},
                insights=[{"title": "Investor reporting runs on spreadsheets"}],
            )
        assert "AI is not configured" in str(exc.value)


# ---------------------------------------------------------------------------
# DB service: regenerate increments regenerated_count
# ---------------------------------------------------------------------------

class TestRegenerateCount:
    def test_regenerate_asset_row_increments(self, fake_cursor):
        """The UPDATE path returns the incremented row and the SQL increments."""
        from app.services import outreach_personalizer as op_db

        fake_cursor.push_result([{**_email_asset(), "regenerated_count": 1}])
        row = op_db.regenerate_asset_row(
            target_id=TARGET_ID, asset_type="cold_email", payload={"body": "x"}
        )
        assert row["regenerated_count"] == 1
        sql = fake_cursor.queries[0][0]
        assert "regenerated_count + 1" in sql


# ---------------------------------------------------------------------------
# Route flow (TestClient + mocked cursor)
# ---------------------------------------------------------------------------

class TestTargetRoutes:
    def test_create_then_idempotent(self, client, fake_cursor):
        # ── First POST: no existing target → create + seed (deterministic) ──
        fake_cursor.push_result([])                                  # get_target_by_slug → None
        fake_cursor.push_result([_target_row()])                     # create_target RETURNING
        fake_cursor.push_result([_insight_asset()])                  # insert_asset insight
        fake_cursor.push_result([_loom_asset()])                     # insert_asset loom
        fake_cursor.push_result([_email_asset()])                    # insert_asset cold_email
        fake_cursor.push_result(
            [_target_row("assets_ready", f"/for/{SLUG}")]
        )                                                            # update_target RETURNING
        fake_cursor.push_result(
            [_target_row("assets_ready", f"/for/{SLUG}")]
        )                                                            # get_target_by_id
        fake_cursor.push_result(
            [_insight_asset(), _loom_asset(), _email_asset()]
        )                                                            # list_assets

        r = client.post(
            f"/api/outreach-personalizer/v1/targets?env_id={ENV_ID}",
            json={"firm_name": FIRM, "firm_slug": SLUG, "profile_json": {}},
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["created"] is True
        assert body["microsite_url"] == f"/for/{SLUG}"            # (2) microsite URL
        assert body["public_path"] == f"/for/{SLUG}"

        # ── Second POST: existing target → idempotent return ──
        fake_cursor.push_result([_target_row("assets_ready", f"/for/{SLUG}")])  # get_target_by_slug
        fake_cursor.push_result([_insight_asset(), _email_asset()])            # list_assets
        r2 = client.post(
            f"/api/outreach-personalizer/v1/targets?env_id={ENV_ID}",
            json={"firm_name": FIRM, "firm_slug": SLUG, "profile_json": {}},
        )
        assert r2.status_code == 200, r2.text
        assert r2.json()["created"] is False

    def test_public_microsite_payload_sections(self, client, fake_cursor):
        fake_cursor.push_result([_target_row("assets_ready", f"/for/{SLUG}")])  # get_public_target_by_slug
        fake_cursor.push_result(
            [_insight_asset(), _loom_asset(), _email_asset()]
        )                                                                       # list_assets

        r = client.get(f"/api/outreach-personalizer/v1/microsite/{SLUG}")
        assert r.status_code == 200, r.text
        p = r.json()
        assert p["ready"] is True
        assert p["firm"]["name"] == FIRM
        assert isinstance(p["insights"], list) and p["insights"]
        assert "loom" in p and p["loom"]["state"] == "pending"  # no loom_url
        assert "cold_email_preview" in p
        assert "cta" in p and p["cta"]["href"]
        assert "styling" in p

    def test_microsite_not_found_is_fail_closed(self, client, fake_cursor):
        fake_cursor.push_result([])  # get_public_target_by_slug → None
        r = client.get("/api/outreach-personalizer/v1/microsite/unknown-firm")
        assert r.status_code == 404
        assert r.json()["code"] == "outreach_personalizer.microsite_not_found"

    def test_track_accepts_microsite_view(self, client, fake_cursor):
        fake_cursor.push_result([_target_row("assets_ready")])  # get_public_target_by_slug
        fake_cursor.push_result([{"id": "ev-1"}])               # record_microsite_event RETURNING
        r = client.post(
            f"/api/outreach-personalizer/v1/microsite/{SLUG}/track",
            json={"event_type": "microsite_view"},
        )
        assert r.status_code == 200, r.text
        assert r.json()["ok"] is True

    def test_track_accepts_microsite_cta(self, client, fake_cursor):
        fake_cursor.push_result([_target_row("assets_ready")])  # get_public_target_by_slug
        fake_cursor.push_result([{"id": "ev-2"}])               # record_microsite_event RETURNING
        r = client.post(
            f"/api/outreach-personalizer/v1/microsite/{SLUG}/track",
            json={"event_type": "microsite_cta", "metadata": {"cta_kind": "email"}},
        )
        assert r.status_code == 200, r.text
        assert r.json()["ok"] is True

    def test_track_rejects_bad_event_type(self, client, fake_cursor):
        r = client.post(
            f"/api/outreach-personalizer/v1/microsite/{SLUG}/track",
            json={"event_type": "click"},
        )
        assert r.status_code == 422

    def test_regenerate_increments_via_route(self, client, fake_cursor):
        from app.services import outreach_personalizer_ai as ai

        fake_cursor.push_result([_target_row("assets_ready")])              # get_target_by_id
        fake_cursor.push_result([_insight_asset(), _email_asset()])         # list_assets
        fake_cursor.push_result(
            [{**_email_asset(), "regenerated_count": 1}]
        )                                                                   # regenerate_asset_row UPDATE

        ai_email = json.dumps(
            {
                "subject": "Investor reporting without the scramble",
                "body": (
                    "Firms like yours run investor reporting on spreadsheets under "
                    "deadline. Novendor builds a controlled internal reporting layer. "
                    "It carries provenance and fail-closed behavior. If useful, I will "
                    "send a short walkthrough."
                ),
                "references_insight": "Investor reporting runs on spreadsheets",
            }
        )
        with patch.object(ai, "ai_available", return_value=True):
            with patch.object(ai, "_chat", return_value=ai_email):
                r = client.post(
                    f"/api/outreach-personalizer/v1/targets/{TARGET_ID}/regenerate/cold_email"
                )
        assert r.status_code == 200, r.text
        assert r.json()["asset"]["regenerated_count"] == 1
