from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from orchestration.coding_relay.redact import redact  # noqa: E402


def test_github_tokens_redacted():
    assert "ghp_" not in redact("x ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ012345 y")
    assert "github_pat_" not in redact("github_pat_11ABCDEFGHIJKLMNOPQRST_more")


def test_openai_and_aws_and_slack():
    assert "sk-" not in redact("key sk-abcdefghijklmnopqrstuvwxyz123456")
    assert "AKIA" not in redact("id AKIAIOSFODNN7EXAMPLE")
    assert "xoxb-" not in redact("tok xoxb-123456789012-abcdef")


def test_db_url_password_redacted_but_scheme_kept():
    out = redact("postgres://winston:s3cretpass@db.example.com:5432/app")
    assert "s3cretpass" not in out
    assert out.startswith("postgres://")
    assert "@db.example.com" in out


def test_generic_assignment_keeps_key_name():
    out = redact("API_KEY=abcdefghijklmnop123456")
    assert "abcdefghijklmnop123456" not in out
    assert "API_KEY" in out
    out = redact('password: "supersecretvalue99"')
    assert "supersecretvalue99" not in out


def test_underscore_prefixed_env_names_redacted():
    # Assembled at runtime so the source file itself never contains a
    # token-shaped literal (GitHub push protection flags those).
    fake_dapi = "dapi" + "0123456789abcdef" * 2
    out = redact(f"DATABRICKS_TOKEN={fake_dapi}")
    assert fake_dapi not in out
    out = redact("DB_PASSWORD=hunter2hunter2hunter2")
    assert "hunter2hunter2hunter2" not in out
    assert "DB_PASSWORD" in out
    out = redact("MY_SECRET: some_long_secret_value_123")
    assert "some_long_secret_value_123" not in out


def test_jwt_and_pem_and_gcp_redacted():
    jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdef123"
    assert jwt not in redact(f"key: {jwt}")
    pem = "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBg\nqhkiG9w0BAQEFAASC\n-----END PRIVATE KEY-----"
    out = redact(pem)
    assert "MIIEvQIBADANBg" not in out
    assert "AIza" not in redact("gcp AIzaSyA1234567890abcdefghijklmnopqrstuvw")


def test_clean_text_untouched():
    text = "nothing secret here, just a diff line + return 42\n"
    assert redact(text) == text


def test_ordinary_code_assignments_untouched():
    text = "token = create_access_token(user)\n"
    assert redact(text) == text


def test_empty_text():
    assert redact("") == ""
