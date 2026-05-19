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
