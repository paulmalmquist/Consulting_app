from app.observability.logger import sanitize_context, sanitize_headers


def test_redacts_sensitive_context_keys():
    out = sanitize_context(
        {
            "token": "abc",
            "nested": {"authorization": "Bearer xyz", "ok": "value"},
            "api_key": "secret-value",
            "normal": "shown",
        }
    )
    assert out["token"] == "[REDACTED]"
    assert out["nested"]["authorization"] == "[REDACTED]"
    assert out["nested"]["ok"] == "value"
    assert out["api_key"] == "[REDACTED]"
    assert out["normal"] == "shown"


def test_header_sanitization_allowlist_and_redaction():
    out = sanitize_headers(
        {
            "authorization": "Bearer secret",
            "cookie": "session=abc",
            "x-request-id": "req-1",
            "x-run-id": "run-1",
            "x-random": "drop-me",
        }
    )
    assert out["authorization"] == "[REDACTED]"
    assert out["cookie"] == "[REDACTED]"
    assert out["x-request-id"] == "req-1"
    assert out["x-run-id"] == "run-1"
    assert "x-random" not in out
