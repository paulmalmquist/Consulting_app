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


# ---------------------------------------------------------------------------
# Phase 2A — Loom URL edit/save + CRM account linking
# ---------------------------------------------------------------------------

VALID_LOOM = "https://www.loom.com/share/abc123DEF456"
NORMALIZED_LOOM = "https://www.loom.com/embed/abc123DEF456"
CRM_ID = "22222222-2222-2222-2222-222222222222"


class TestLoomValidator:
    def test_normalizer_accepts_share_and_embed(self):
        from app.services.outreach_personalizer import normalize_loom_url

        assert normalize_loom_url(VALID_LOOM) == NORMALIZED_LOOM
        assert (
            normalize_loom_url("https://loom.com/embed/xyz789") ==
            "https://www.loom.com/embed/xyz789"
        )

    def test_normalizer_clears_on_empty_or_none(self):
        from app.services.outreach_personalizer import normalize_loom_url

        assert normalize_loom_url(None) is None
        assert normalize_loom_url("") is None
        assert normalize_loom_url("   ") is None

    def test_normalizer_rejects_non_loom_and_unsafe(self):
        from app.services.outreach_personalizer import normalize_loom_url

        for bad in (
            "https://youtube.com/watch?v=1",
            "javascript:alert(1)",
            "data:text/html,<script>1</script>",
            "https://evil.com/loom.com/share/abc",
            "ftp://www.loom.com/share/abc",
        ):
            with pytest.raises(ValueError):
                normalize_loom_url(bad)


class TestPatchTarget:
    def test_patch_loom_url_valid_and_normalized(self, client, fake_cursor):
        fake_cursor.push_result([_target_row("assets_ready")])              # get_target_by_id (404 guard)
        fake_cursor.push_result(
            [{**_target_row("assets_ready"), "loom_url": NORMALIZED_LOOM}]
        )                                                                   # patch_target UPDATE
        fake_cursor.push_result([_insight_asset(), _email_asset()])         # list_assets

        r = client.patch(
            f"/api/outreach-personalizer/v1/targets/{TARGET_ID}",
            json={"loom_url": VALID_LOOM},
        )
        assert r.status_code == 200, r.text
        assert r.json()["target"]["loom_url"] == NORMALIZED_LOOM

    def test_patch_loom_url_invalid_returns_400(self, client, fake_cursor):
        fake_cursor.push_result([_target_row("assets_ready")])  # get_target_by_id
        r = client.patch(
            f"/api/outreach-personalizer/v1/targets/{TARGET_ID}",
            json={"loom_url": "https://youtube.com/watch?v=nope"},
        )
        assert r.status_code == 400, r.text
        assert r.json()["code"] == "outreach_personalizer.validation_error"

    def test_patch_loom_url_clear(self, client, fake_cursor):
        fake_cursor.push_result([_target_row("assets_ready")])              # get_target_by_id
        fake_cursor.push_result(
            [{**_target_row("assets_ready"), "loom_url": None}]
        )                                                                   # patch_target UPDATE
        fake_cursor.push_result([_insight_asset()])                        # list_assets
        r = client.patch(
            f"/api/outreach-personalizer/v1/targets/{TARGET_ID}",
            json={"loom_url": ""},
        )
        assert r.status_code == 200, r.text
        assert r.json()["target"]["loom_url"] is None

    def test_microsite_loom_state_pending_then_ready(self, client, fake_cursor):
        # pending (no loom_url)
        fake_cursor.push_result([_target_row("assets_ready")])             # get_public_target_by_slug
        fake_cursor.push_result([_insight_asset(), _loom_asset(), _email_asset()])
        p1 = client.get(f"/api/outreach-personalizer/v1/microsite/{SLUG}").json()
        assert p1["loom"]["state"] == "pending" and p1["loom"]["url"] is None

        # ready (valid loom_url → re-validated/normalized in payload)
        fake_cursor.push_result(
            [{**_target_row("assets_ready"), "loom_url": VALID_LOOM}]
        )                                                                  # get_public_target_by_slug
        fake_cursor.push_result([_insight_asset(), _loom_asset(), _email_asset()])
        p2 = client.get(f"/api/outreach-personalizer/v1/microsite/{SLUG}").json()
        assert p2["loom"]["state"] == "ready"
        assert p2["loom"]["url"] == NORMALIZED_LOOM

    def test_patch_crm_link_success(self, client, fake_cursor):
        fake_cursor.push_result([_target_row("assets_ready")])             # get_target_by_id
        fake_cursor.push_result([{"exists": 1}])                           # crm_account_exists
        fake_cursor.push_result(
            [{**_target_row("assets_ready"), "crm_account_id": CRM_ID}]
        )                                                                  # patch_target UPDATE
        fake_cursor.push_result([_insight_asset()])                        # list_assets
        fake_cursor.push_result(
            [{"crm_account_id": CRM_ID, "name": "Artemis RE", "website": "artemis.com"}]
        )                                                                  # crm_account_summary
        r = client.patch(
            f"/api/outreach-personalizer/v1/targets/{TARGET_ID}",
            json={"crm_account_id": CRM_ID},
        )
        assert r.status_code == 200, r.text
        assert r.json()["crm_account"]["name"] == "Artemis RE"

    def test_patch_crm_link_missing_returns_400(self, client, fake_cursor):
        fake_cursor.push_result([_target_row("assets_ready")])  # get_target_by_id
        fake_cursor.push_result([])                             # crm_account_exists → None → False
        r = client.patch(
            f"/api/outreach-personalizer/v1/targets/{TARGET_ID}",
            json={"crm_account_id": CRM_ID},
        )
        assert r.status_code == 400, r.text
        assert "does not exist" in r.json()["detail"]

    def test_patch_logo_and_accent_persist(self, client, fake_cursor):
        fake_cursor.push_result([_target_row("assets_ready")])             # get_target_by_id
        fake_cursor.push_result(
            [{**_target_row("assets_ready"),
              "logo_url": "https://cdn.example.com/a.png",
              "accent_hsl": "210 90% 60%"}]
        )                                                                  # patch_target UPDATE
        fake_cursor.push_result([_insight_asset()])                        # list_assets
        r = client.patch(
            f"/api/outreach-personalizer/v1/targets/{TARGET_ID}",
            json={"logo_url": "https://cdn.example.com/a.png", "accent_hsl": "210 90% 60%"},
        )
        assert r.status_code == 200, r.text
        t = r.json()["target"]
        assert t["logo_url"] == "https://cdn.example.com/a.png"
        assert t["accent_hsl"] == "210 90% 60%"

    def test_patch_unknown_target_404(self, client, fake_cursor):
        fake_cursor.push_result([])  # get_target_by_id → None → OutreachTargetNotFound
        r = client.patch(
            f"/api/outreach-personalizer/v1/targets/{TARGET_ID}",
            json={"loom_url": VALID_LOOM},
        )
        assert r.status_code == 404, r.text


# ---------------------------------------------------------------------------
# Phase 2B — Engagement rollup + CRM activity follow-through
# ---------------------------------------------------------------------------

BUSINESS_ID = "33333333-3333-3333-3333-333333333333"


class TestEngagementRollup:
    def test_rollup_service_counts_and_recent_order(self, fake_cursor):
        from app.services import outreach_personalizer as op_db

        fake_cursor.push_result([{
            "total_views": 3, "total_ctas": 1,
            "last_viewed_at": "2026-05-19T10:00:00Z",
            "last_cta_at": "2026-05-19T11:00:00Z",
        }])
        fake_cursor.push_result([
            {"event_type": "microsite_cta", "occurred_at": "2026-05-19T11:00:00Z"},
            {"event_type": "microsite_view", "occurred_at": "2026-05-19T10:00:00Z"},
        ])
        r = op_db.engagement_rollup(target_id=TARGET_ID)
        assert r["total_views"] == 3 and r["total_ctas"] == 1
        assert r["last_viewed_at"] == "2026-05-19T10:00:00Z"
        assert [e["event_type"] for e in r["recent_events"]] == [
            "microsite_cta", "microsite_view"
        ]

    def test_rollup_bulk_empty_short_circuits(self, fake_cursor):
        from app.services import outreach_personalizer as op_db

        assert op_db.engagement_rollup_bulk(target_ids=[]) == {}

    def test_get_target_detail_includes_engagement(self, client, fake_cursor):
        fake_cursor.push_result([_target_row("assets_ready")])              # get_target_by_id
        fake_cursor.push_result([_insight_asset(), _email_asset()])         # list_assets
        fake_cursor.push_result([{
            "total_views": 2, "total_ctas": 0,
            "last_viewed_at": "2026-05-19T09:00:00Z", "last_cta_at": None,
        }])                                                                 # rollup agg
        fake_cursor.push_result(
            [{"event_type": "microsite_view", "occurred_at": "2026-05-19T09:00:00Z"}]
        )                                                                   # recent
        r = client.get(f"/api/outreach-personalizer/v1/targets/{TARGET_ID}")
        assert r.status_code == 200, r.text
        b = r.json()
        assert b["engagement"]["total_views"] == 2
        assert b["engagement"]["recent_events"][0]["event_type"] == "microsite_view"
        assert b["crm_account"] is None  # target_row has no crm_account_id

    def test_list_targets_includes_engagement_summary(self, client, fake_cursor):
        fake_cursor.push_result([_target_row("assets_ready")])              # list_targets
        fake_cursor.push_result([{
            "target_id": TARGET_ID, "total_views": 5, "total_ctas": 2,
            "last_viewed_at": "x", "last_cta_at": "y",
        }])                                                                 # bulk rollup
        r = client.get(f"/api/outreach-personalizer/v1/targets?env_id={ENV_ID}")
        assert r.status_code == 200, r.text
        tg = r.json()["targets"][0]
        assert tg["engagement"]["total_views"] == 5
        assert tg["engagement"]["total_ctas"] == 2

    def test_list_targets_engagement_defaults_when_no_events(self, client, fake_cursor):
        fake_cursor.push_result([_target_row("assets_ready")])  # list_targets
        fake_cursor.push_result([])                             # bulk → no rows
        r = client.get(f"/api/outreach-personalizer/v1/targets?env_id={ENV_ID}")
        assert r.status_code == 200, r.text
        assert r.json()["targets"][0]["engagement"]["total_views"] == 0


class TestLogCrmActivity:
    def test_fails_closed_without_crm_account(self, client, fake_cursor):
        fake_cursor.push_result([_target_row("assets_ready")])  # no crm_account_id
        r = client.post(
            f"/api/outreach-personalizer/v1/targets/{TARGET_ID}/crm-activity",
            json={},
        )
        assert r.status_code == 400, r.text
        assert "not linked to a CRM account" in r.json()["detail"]

    def test_fails_closed_without_business_id(self, client, fake_cursor):
        fake_cursor.push_result(
            [{**_target_row("assets_ready"), "crm_account_id": CRM_ID, "business_id": None}]
        )
        r = client.post(
            f"/api/outreach-personalizer/v1/targets/{TARGET_ID}/crm-activity",
            json={},
        )
        assert r.status_code == 400, r.text
        assert "business_id" in r.json()["detail"]

    def test_logs_activity_via_existing_crm_service(self, client, fake_cursor):
        from app.routes import outreach_personalizer as route

        fake_cursor.push_result([{
            **_target_row("assets_ready"),
            "crm_account_id": CRM_ID, "business_id": BUSINESS_ID,
        }])                                                                 # get_target_by_id
        fake_cursor.push_result([{
            "total_views": 4, "total_ctas": 2,
            "last_viewed_at": "a", "last_cta_at": "b",
        }])                                                                 # rollup agg
        fake_cursor.push_result(
            [{"event_type": "microsite_cta", "occurred_at": "b"}]
        )                                                                   # recent
        with patch.object(
            route.crm_svc,
            "create_activity",
            return_value={"crm_activity_id": "act-1", "subject": "x"},
        ) as m:
            r = client.post(
                f"/api/outreach-personalizer/v1/targets/{TARGET_ID}/crm-activity",
                json={"note": "sent via email"},
            )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["ok"] is True
        assert body["activity"]["crm_activity_id"] == "act-1"
        assert body["engagement"]["total_views"] == 4
        kwargs = m.call_args.kwargs
        assert str(kwargs["crm_account_id"]) == CRM_ID
        assert "Outreach Personalizer" in kwargs["body"]
        assert "sent via email" in kwargs["body"]

    def test_unknown_target_404(self, client, fake_cursor):
        fake_cursor.push_result([])  # get_target_by_id → None
        r = client.post(
            f"/api/outreach-personalizer/v1/targets/{TARGET_ID}/crm-activity",
            json={},
        )
        assert r.status_code == 404, r.text


# ---------------------------------------------------------------------------
# Phase 2C — opportunity link (PATCH) + pipeline advancement
# ---------------------------------------------------------------------------

OPP_ID = "44444444-4444-4444-4444-444444444444"
STAGE_CURRENT_ID = "55555555-5555-5555-5555-555555555555"
STAGE_NEXT_ID = "66666666-6666-6666-6666-666666666666"


def _target_linked(
    *,
    business_id: str | None = BUSINESS_ID,
    crm_account_id: str | None = CRM_ID,
    crm_opportunity_id: str | None = OPP_ID,
    status: str = "assets_ready",
) -> dict:
    """Phase 2C target row with linkage fields parameterised so each gate
    failure mode can be exercised by setting exactly one field to None."""
    return {
        **_target_row(status),
        "business_id": business_id,
        "crm_account_id": crm_account_id,
        "crm_opportunity_id": crm_opportunity_id,
    }


def _opp_summary(
    *,
    business_id: str = BUSINESS_ID,
    status: str = "open",
    stage_order: int | None = 1,
    is_closed: bool = False,
    is_won: bool = False,
    stage_label: str = "Discovery",
) -> dict:
    """Phase 2C opportunity-summary row (crm_opportunity_summary shape)."""
    return {
        "crm_opportunity_id": OPP_ID,
        "name": "Verify Opp",
        "amount": "0.00",
        "status": status,
        "business_id": business_id,
        "crm_account_id": CRM_ID,
        "crm_pipeline_stage_id": STAGE_CURRENT_ID,
        "stage_key": "discovery",
        "stage_label": stage_label,
        "stage_order": stage_order,
        "is_closed": is_closed,
        "is_won": is_won,
    }


def _next_stage_row(label: str = "Qualified") -> dict:
    return {
        "crm_pipeline_stage_id": STAGE_NEXT_ID,
        "key": "qualified",
        "label": label,
        "stage_order": 2,
    }


class TestOpportunityLink:
    def test_patch_links_opportunity_success(self, client, fake_cursor):
        # Existing target has business_id + account but no opportunity yet
        starting = _target_linked(crm_opportunity_id=None)
        fake_cursor.push_result([starting])                          # get_target_by_id
        fake_cursor.push_result([{"exists": 1}])                     # crm_opportunity_exists
        fake_cursor.push_result(
            [{**starting, "crm_opportunity_id": OPP_ID}]
        )                                                            # patch_target UPDATE
        fake_cursor.push_result([_insight_asset()])                  # list_assets
        fake_cursor.push_result(
            [{"crm_account_id": CRM_ID, "name": "Artemis RE", "website": None}]
        )                                                            # crm_account_summary
        fake_cursor.push_result([_opp_summary()])                    # crm_opportunity_summary

        r = client.patch(
            f"/api/outreach-personalizer/v1/targets/{TARGET_ID}",
            json={"crm_opportunity_id": OPP_ID},
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["target"]["crm_opportunity_id"] == OPP_ID
        assert body["crm_opportunity"]["crm_opportunity_id"] == OPP_ID

    def test_patch_opp_link_rejected_without_business_id(self, client, fake_cursor):
        fake_cursor.push_result(
            [_target_linked(business_id=None, crm_opportunity_id=None)]
        )                                                            # get_target_by_id
        r = client.patch(
            f"/api/outreach-personalizer/v1/targets/{TARGET_ID}",
            json={"crm_opportunity_id": OPP_ID},
        )
        assert r.status_code == 400, r.text
        assert "business_id" in r.json()["detail"]

    def test_patch_opp_link_rejected_when_opportunity_missing_or_wrong_business(
        self, client, fake_cursor
    ):
        fake_cursor.push_result([_target_linked(crm_opportunity_id=None)])  # get_target_by_id
        fake_cursor.push_result([])                                  # crm_opportunity_exists → False
        r = client.patch(
            f"/api/outreach-personalizer/v1/targets/{TARGET_ID}",
            json={"crm_opportunity_id": OPP_ID},
        )
        assert r.status_code == 400, r.text
        assert "does not exist or belongs to a different business" in r.json()["detail"]

    def test_patch_clears_opportunity_link(self, client, fake_cursor):
        # Target currently has opp linked; PATCH with null clears it.
        starting = _target_linked()
        fake_cursor.push_result([starting])                          # get_target_by_id
        fake_cursor.push_result(
            [{**starting, "crm_opportunity_id": None}]
        )                                                            # patch_target UPDATE
        fake_cursor.push_result([_insight_asset()])                  # list_assets
        fake_cursor.push_result(
            [{"crm_account_id": CRM_ID, "name": "Artemis RE", "website": None}]
        )                                                            # crm_account_summary
        # No crm_opportunity_summary call (updated.crm_opportunity_id is None)

        r = client.patch(
            f"/api/outreach-personalizer/v1/targets/{TARGET_ID}",
            json={"crm_opportunity_id": None},
        )
        assert r.status_code == 200, r.text
        assert r.json()["target"]["crm_opportunity_id"] is None
        assert r.json()["crm_opportunity"] is None

    def test_patch_cannot_clear_account_while_opportunity_linked(
        self, client, fake_cursor
    ):
        """Clear-order guard: must fail at the route, NOT at the migration 612
        CHECK constraint. Only one DB call (get_target_by_id) — no patch_target
        invocation, exact operator message returned."""
        fake_cursor.push_result([_target_linked()])  # get_target_by_id
        r = client.patch(
            f"/api/outreach-personalizer/v1/targets/{TARGET_ID}",
            json={"crm_account_id": None},
        )
        assert r.status_code == 400, r.text
        assert (
            r.json()["detail"]
            == "Clear the linked CRM opportunity before clearing the CRM account."
        )

    def test_patch_can_clear_both_in_one_call(self, client, fake_cursor):
        """Atomic clear of both account + opportunity satisfies the CHECK and
        the route guard."""
        starting = _target_linked()
        fake_cursor.push_result([starting])                          # get_target_by_id
        fake_cursor.push_result(
            [{**starting, "crm_account_id": None, "crm_opportunity_id": None}]
        )                                                            # patch_target UPDATE
        fake_cursor.push_result([_insight_asset()])                  # list_assets
        # No crm_account_summary call (updated.crm_account_id None),
        # no crm_opportunity_summary call (updated.crm_opportunity_id None).

        r = client.patch(
            f"/api/outreach-personalizer/v1/targets/{TARGET_ID}",
            json={"crm_account_id": None, "crm_opportunity_id": None},
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["target"]["crm_account_id"] is None
        assert body["target"]["crm_opportunity_id"] is None


class TestAdvancePipeline:
    URL = f"/api/outreach-personalizer/v1/targets/{TARGET_ID}/advance-pipeline"

    def test_fails_without_business_id(self, client, fake_cursor):
        fake_cursor.push_result([_target_linked(business_id=None)])  # get_target_by_id
        # Gate fails at step 1 — no further DB.
        r = client.post(self.URL, json={})
        assert r.status_code == 400, r.text
        assert r.json()["detail"] == (
            "Env has no business_id; pipeline operations unavailable."
        )

    def test_fails_without_crm_account(self, client, fake_cursor):
        fake_cursor.push_result([_target_linked(crm_account_id=None)])
        r = client.post(self.URL, json={})
        assert r.status_code == 400, r.text
        assert r.json()["detail"] == "Link a CRM account first."

    def test_fails_without_opportunity(self, client, fake_cursor):
        fake_cursor.push_result([_target_linked(crm_opportunity_id=None)])
        r = client.post(self.URL, json={})
        assert r.status_code == 400, r.text
        assert (
            r.json()["detail"]
            == "Link a CRM opportunity to enable pipeline moves."
        )

    def test_fails_when_opportunity_business_mismatch(self, client, fake_cursor):
        fake_cursor.push_result([_target_linked()])                  # get_target_by_id
        # crm_opportunity_summary returns opp belonging to a different business
        fake_cursor.push_result(
            [_opp_summary(business_id="99999999-9999-9999-9999-999999999999")]
        )
        r = client.post(self.URL, json={})
        assert r.status_code == 400, r.text
        assert (
            r.json()["detail"]
            == "Linked opportunity belongs to a different business."
        )

    def test_fails_when_opportunity_closed(self, client, fake_cursor):
        fake_cursor.push_result([_target_linked()])                  # get_target_by_id
        fake_cursor.push_result([_opp_summary(status="won")])        # crm_opportunity_summary
        r = client.post(self.URL, json={})
        assert r.status_code == 400, r.text
        assert (
            r.json()["detail"]
            == "Opportunity is closed; reopen it in CRM to advance."
        )

    def test_fails_when_current_stage_is_terminal(self, client, fake_cursor):
        fake_cursor.push_result([_target_linked()])                  # get_target_by_id
        fake_cursor.push_result(
            [_opp_summary(is_closed=True, stage_label="Closed-Won")]
        )                                                            # crm_opportunity_summary
        r = client.post(self.URL, json={})
        assert r.status_code == 400, r.text
        assert (
            r.json()["detail"] == "Opportunity already at terminal stage."
        )

    def test_fails_when_no_next_stage(self, client, fake_cursor):
        fake_cursor.push_result([_target_linked()])                  # get_target_by_id
        fake_cursor.push_result([_opp_summary(stage_order=99)])      # crm_opportunity_summary
        fake_cursor.push_result([])                                  # _next_open_stage → None
        r = client.post(self.URL, json={})
        assert r.status_code == 400, r.text
        assert (
            r.json()["detail"] == "No valid next stage is configured."
        )

    def test_succeeds_with_valid_next_stage(self, client, fake_cursor):
        """All four conditions met → calls crm_svc.move_opportunity_stage with
        the deterministic computed next stage, returns moved opportunity and
        recomputed gate state."""
        from app.routes import outreach_personalizer as route

        fake_cursor.push_result([_target_linked()])                  # get_target_by_id
        fake_cursor.push_result([_opp_summary()])                    # gate: crm_opportunity_summary
        fake_cursor.push_result([_next_stage_row()])                 # gate: _next_open_stage
        # crm_svc.move_opportunity_stage mocked — no DB consumed.
        fake_cursor.push_result([_target_linked()])                  # fresh get_target_by_id
        fake_cursor.push_result(
            [_opp_summary(stage_order=2, stage_label="Qualified")]
        )                                                            # fresh gate: crm_opportunity_summary
        fake_cursor.push_result([])                                  # fresh gate: _next_open_stage → terminal

        moved_payload = {
            "crm_opportunity_id": OPP_ID,
            "name": "Verify Opp",
            "amount": "0.00",
            "status": "open",
            "expected_close_date": None,
            "stage_key": "qualified",
            "stage_label": "Qualified",
        }
        with patch.object(
            route.crm_svc,
            "move_opportunity_stage",
            return_value=moved_payload,
        ) as m:
            r = client.post(self.URL, json={"note": "smoke"})

        assert r.status_code == 200, r.text
        body = r.json()
        assert body["ok"] is True
        assert body["opportunity"]["stage_label"] == "Qualified"
        # Recomputed gate: we advanced into the last stage, so next call has no next stage.
        assert body["pipeline"]["available"] is False
        assert body["pipeline"]["blocking_reason"] == (
            "No valid next stage is configured."
        )
        # The mock was called with the deterministic computed next stage id.
        kwargs = m.call_args.kwargs
        assert str(kwargs["crm_opportunity_id"]) == OPP_ID
        assert str(kwargs["to_stage_id"]) == STAGE_NEXT_ID
        assert str(kwargs["business_id"]) == BUSINESS_ID
        assert kwargs["note"] == "smoke"

    def test_unknown_target_404(self, client, fake_cursor):
        fake_cursor.push_result([])  # get_target_by_id → None
        r = client.post(self.URL, json={})
        assert r.status_code == 404, r.text


# ---------------------------------------------------------------------------
# Phase 3 — scaffold-env gate + endpoint
# ---------------------------------------------------------------------------

SCAFFOLDED_ENV_ID = "77777777-7777-7777-7777-777777777777"


def _scaffold_target(
    *,
    business_id: str | None = BUSINESS_ID,
    crm_account_id: str | None = CRM_ID,
    crm_opportunity_id: str | None = None,
    scaffolded_env_id: str | None = None,
    status: str = "assets_ready",
) -> dict:
    """Phase 3 target row with linkage fields parameterised so each gate
    failure mode can be exercised by setting exactly one field. Defaults to
    the 'ready-to-scaffold' state (business + account + assets_ready, no
    existing scaffolded env)."""
    return {
        **_target_row(status),
        "business_id": business_id,
        "crm_account_id": crm_account_id,
        "crm_opportunity_id": crm_opportunity_id,
        "scaffolded_env_id": scaffolded_env_id,
    }


def _env_summary_row(
    *,
    env_id: str = SCAFFOLDED_ENV_ID,
    lifecycle_state: str = "verified",
    default_home_route: str = "/lab/env/{env_id}/re",
) -> dict:
    """The op_db.env_summary() shape: row from app.environments + computed
    dashboard_url via the same substitution env_v2._build_response uses."""
    return {
        "env_id": env_id,
        "slug": "artemis-real-estate-partners",
        "template_key": "repe",
        "lifecycle_state": lifecycle_state,
        "default_home_route": default_home_route,
        "theme_accent": "271 62% 63%",
        # Note: op_db.env_summary computes dashboard_url in Python after the
        # SELECT — tests push the SELECT result; the helper adds the URL.
    }


class TestScaffoldEnvGate:
    """Direct unit tests against op_db.compute_scaffold_env_state. The seven
    failure modes map 1-to-1 to operator-facing blocking_reason strings."""

    def test_fails_without_business_id(self):
        from app.services import outreach_personalizer as op_db

        state = op_db.compute_scaffold_env_state(
            target=_scaffold_target(business_id=None)
        )
        assert state["available"] is False
        assert state["blocking_reason"] == (
            "Env has no business_id; environment scaffolding unavailable."
        )
        assert state["env_summary"] is None

    def test_fails_without_crm_account(self):
        from app.services import outreach_personalizer as op_db

        state = op_db.compute_scaffold_env_state(
            target=_scaffold_target(crm_account_id=None)
        )
        assert state["available"] is False
        assert state["blocking_reason"] == (
            "Link a CRM account before creating an outreach environment."
        )

    def test_fails_when_assets_not_ready(self):
        from app.services import outreach_personalizer as op_db

        state = op_db.compute_scaffold_env_state(
            target=_scaffold_target(status="pending")
        )
        assert state["available"] is False
        assert state["blocking_reason"] == "Outreach assets are not ready yet."

    def test_already_linked_returns_existing_env_summary(self):
        from app.services import outreach_personalizer as op_db

        # Pass pre-fetched env to avoid the env_summary() DB lookup; this is the
        # exact path GET /targets/{id} uses.
        env = {**_env_summary_row(), "dashboard_url": "/lab/env/" + SCAFFOLDED_ENV_ID + "/re"}
        state = op_db.compute_scaffold_env_state(
            target=_scaffold_target(scaffolded_env_id=SCAFFOLDED_ENV_ID),
            env=env,
        )
        assert state["available"] is False
        assert state["blocking_reason"] == "Environment already exists."
        assert state["env_summary"] == env

    def test_stored_env_missing_fails_closed(self, fake_cursor):
        """target.scaffolded_env_id set but app.environments row gone →
        'Stored scaffolded environment was not found.' Path covers the
        env_summary() DB lookup returning None."""
        from app.services import outreach_personalizer as op_db

        fake_cursor.push_result([])  # env_summary() → None
        state = op_db.compute_scaffold_env_state(
            target=_scaffold_target(scaffolded_env_id=SCAFFOLDED_ENV_ID)
        )
        assert state["available"] is False
        assert state["blocking_reason"] == "Stored scaffolded environment was not found."
        assert state["env_summary"] is None

    def test_available_when_template_present(self, fake_cursor):
        """Happy path → available=True with no env_summary. Pushes empty result
        for the template existence check (returns truthy via push_result with a
        non-empty list)."""
        from app.services import outreach_personalizer as op_db

        fake_cursor.push_result([{"?column?": 1}])  # _template_exists → True
        state = op_db.compute_scaffold_env_state(target=_scaffold_target())
        assert state["available"] is True
        assert state["blocking_reason"] is None
        assert state["env_summary"] is None

    def test_fails_when_template_missing(self, fake_cursor):
        from app.services import outreach_personalizer as op_db

        fake_cursor.push_result([])  # _template_exists → False
        state = op_db.compute_scaffold_env_state(target=_scaffold_target())
        assert state["available"] is False
        assert state["blocking_reason"] == "Environment template is not available."


class TestScaffoldEnv:
    """Route-level tests for POST /targets/{id}/scaffold-env. Mirrors Phase 2C
    TestAdvancePipeline conventions: client + fake_cursor + patch.object on
    route.env_v2.create_environment_v2."""

    URL = f"/api/outreach-personalizer/v1/targets/{TARGET_ID}/scaffold-env"

    def test_unknown_target_404(self, client, fake_cursor):
        fake_cursor.push_result([])  # get_target_by_id → None
        r = client.post(self.URL, json={})
        assert r.status_code == 404, r.text

    def test_fails_without_business_id(self, client, fake_cursor):
        fake_cursor.push_result([_scaffold_target(business_id=None)])
        r = client.post(self.URL, json={})
        assert r.status_code == 400, r.text
        assert r.json()["detail"] == (
            "Env has no business_id; environment scaffolding unavailable."
        )

    def test_fails_without_crm_account(self, client, fake_cursor):
        fake_cursor.push_result([_scaffold_target(crm_account_id=None)])
        r = client.post(self.URL, json={})
        assert r.status_code == 400, r.text
        assert r.json()["detail"] == (
            "Link a CRM account before creating an outreach environment."
        )

    def test_fails_when_assets_not_ready(self, client, fake_cursor):
        fake_cursor.push_result([_scaffold_target(status="pending")])
        r = client.post(self.URL, json={})
        assert r.status_code == 400, r.text
        assert r.json()["detail"] == "Outreach assets are not ready yet."

    def test_idempotent_returns_existing_env(self, client, fake_cursor):
        """Already-linked target → 200 with created=False (NOT 400)."""
        from app.routes import outreach_personalizer as route

        fake_cursor.push_result(
            [_scaffold_target(scaffolded_env_id=SCAFFOLDED_ENV_ID)]
        )                                       # get_target_by_id
        fake_cursor.push_result([_env_summary_row()])  # env_summary

        with patch.object(
            route.env_v2,
            "create_environment_v2",
            side_effect=AssertionError("must not call env_v2 on idempotent path"),
        ) as m:
            r = client.post(self.URL, json={})

        assert r.status_code == 200, r.text
        body = r.json()
        assert body["ok"] is True
        assert body["created"] is False
        assert body["env"]["env_id"] == SCAFFOLDED_ENV_ID
        assert body["scaffold"]["blocking_reason"] == "Environment already exists."
        assert m.call_count == 0

    def test_pipeline_error_response_returns_400(self, client, fake_cursor):
        """env_v2 returns a response with errors[] populated → 400 with safe
        message that includes the pipeline's error string."""
        from app.routes import outreach_personalizer as route
        from app.schemas.lab_v2 import CreateEnvironmentV2Response

        fake_cursor.push_result([_scaffold_target()])  # get_target_by_id
        fake_cursor.push_result([{"?column?": 1}])     # _template_exists → True

        bad_result = CreateEnvironmentV2Response(
            env_id=None, slug="x", template_key="repe", template_version=1,
            lifecycle_state="failed", stages=[], links={},
            warnings=[], errors=["seed pack unknown"], dry_run=False,
        )
        with patch.object(
            route.env_v2, "create_environment_v2", return_value=bad_result
        ):
            r = client.post(self.URL, json={})

        assert r.status_code == 400, r.text
        assert "seed pack unknown" in r.json()["detail"]

    def test_pipeline_lookup_error_returns_400_template_unavailable(
        self, client, fake_cursor
    ):
        """env_v2.get_template raises LookupError on unknown template_key →
        400 with the exact 'Environment template is not available.' message."""
        from app.routes import outreach_personalizer as route

        fake_cursor.push_result([_scaffold_target()])  # get_target_by_id
        fake_cursor.push_result([{"?column?": 1}])     # _template_exists → True

        with patch.object(
            route.env_v2,
            "create_environment_v2",
            side_effect=LookupError("Unknown template_key: repe"),
        ):
            r = client.post(self.URL, json={})

        assert r.status_code == 400, r.text
        assert r.json()["detail"] == "Environment template is not available."

    def test_create_succeeds_persists_scaffolded_env_id(self, client, fake_cursor):
        """All gate conditions pass → env_v2.create_environment_v2 called with
        the right manifest, scaffolded_env_id persisted on the target row, and
        the response carries the recomputed gate ('Environment already
        exists.' + env_summary)."""
        from app.routes import outreach_personalizer as route
        from app.schemas.lab_v2 import CreateEnvironmentV2Response

        fake_cursor.push_result([_scaffold_target()])           # get_target_by_id (initial)
        fake_cursor.push_result([{"?column?": 1}])              # _template_exists → True
        # env_v2.create_environment_v2 is mocked — no DB consumed by it.
        fake_cursor.push_result([
            {**_scaffold_target(scaffolded_env_id=SCAFFOLDED_ENV_ID)}
        ])                                                      # set_scaffolded_env_id UPDATE
        fake_cursor.push_result([
            {**_scaffold_target(scaffolded_env_id=SCAFFOLDED_ENV_ID)}
        ])                                                      # get_target_by_id (fresh)
        fake_cursor.push_result([_env_summary_row()])           # env_summary (fresh gate)

        good_result = CreateEnvironmentV2Response(
            env_id=SCAFFOLDED_ENV_ID, slug="artemis-real-estate-partners",
            template_key="repe", template_version=1,
            lifecycle_state="verified", stages=[],
            links={"dashboard_url": f"/lab/env/{SCAFFOLDED_ENV_ID}/re"},
            warnings=[], errors=[], dry_run=False,
        )
        with patch.object(
            route.env_v2, "create_environment_v2", return_value=good_result
        ) as m:
            r = client.post(self.URL, json={"note": "smoke"})

        assert r.status_code == 200, r.text
        body = r.json()
        assert body["ok"] is True
        assert body["created"] is True
        assert body["env"]["env_id"] == SCAFFOLDED_ENV_ID
        # Recomputed gate: scaffolded → "Environment already exists."
        assert body["scaffold"]["available"] is False
        assert body["scaffold"]["blocking_reason"] == "Environment already exists."
        # The mock was called with the right manifest fields.
        kwargs = m.call_args.kwargs
        manifest = m.call_args.args[0]
        assert manifest.client_name == FIRM
        assert manifest.template_key == "repe"
        assert manifest.slug == SLUG
        assert kwargs.get("actor") == "outreach_personalizer"

    def test_public_microsite_payload_excludes_scaffold(self, client, fake_cursor):
        """Regression guard: the public microsite payload MUST NOT include any
        Phase 3 keys. Push a target with scaffolded_env_id set and assert no
        leakage. Trips future accidental leaks via route refactors."""
        # Build a public-ready target that ALSO carries a scaffolded_env_id.
        public_target = {
            **_target_row("assets_ready", microsite_url=f"/for/{SLUG}"),
            "scaffolded_env_id": SCAFFOLDED_ENV_ID,
        }
        fake_cursor.push_result([public_target])                # get_public_target_by_slug
        fake_cursor.push_result([_insight_asset(), _loom_asset(), _email_asset()])

        r = client.get(f"/api/outreach-personalizer/v1/microsite/{SLUG}")
        assert r.status_code == 200, r.text
        payload = r.json()
        # Public payload must not expose any scaffold-related affordance.
        assert "scaffold" not in payload
        assert "scaffolded_env_id" not in payload
        assert "dashboard_url" not in payload
        # The pre-existing payload contract is still intact.
        assert payload["ready"] is True
        assert "firm" in payload and "loom" in payload and "cta" in payload
