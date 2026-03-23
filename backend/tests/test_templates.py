"""Tests for /api/templates endpoint (no DB required)."""


def _mock_templates(fake_cursor):
    fake_cursor.push_result([
        {
            "key": "enterprise",
            "label": "Enterprise",
            "description": "Enterprise template",
            "departments": [
                "finance", "operations", "hr", "sales", "legal", "it", "compliance"
            ],
        },
        {
            "key": "growth",
            "label": "Growth",
            "description": "Growth template",
            "departments": ["finance", "operations", "hr", "sales"],
        },
        {
            "key": "starter",
            "label": "Starter",
            "description": "Starter template",
            "departments": ["finance", "operations", "hr"],
        },
    ])


def test_list_templates(client, fake_cursor):
    _mock_templates(fake_cursor)
    resp = client.get("/api/templates")
    assert resp.status_code == 200
    templates = resp.json()
    assert isinstance(templates, list)
    assert len(templates) >= 3  # starter, growth, enterprise

    keys = {t["key"] for t in templates}
    assert "starter" in keys
    assert "growth" in keys
    assert "enterprise" in keys


def test_template_has_required_fields(client, fake_cursor):
    _mock_templates(fake_cursor)
    resp = client.get("/api/templates")
    for tmpl in resp.json():
        assert "key" in tmpl
        assert "label" in tmpl
        assert "description" in tmpl
        assert "departments" in tmpl
        assert isinstance(tmpl["departments"], list)


def test_starter_template_departments(client, fake_cursor):
    _mock_templates(fake_cursor)
    resp = client.get("/api/templates")
    starter = next(t for t in resp.json() if t["key"] == "starter")
    assert set(starter["departments"]) == {"finance", "operations", "hr"}


def test_enterprise_template_has_all_departments(client, fake_cursor):
    _mock_templates(fake_cursor)
    resp = client.get("/api/templates")
    enterprise = next(t for t in resp.json() if t["key"] == "enterprise")
    assert len(enterprise["departments"]) == 7
