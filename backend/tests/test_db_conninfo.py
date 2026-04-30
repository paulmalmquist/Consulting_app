from __future__ import annotations

import socket

from psycopg.conninfo import conninfo_to_dict

from app.db_conninfo import prefer_ipv4_hostaddr


def test_prefer_ipv4_hostaddr_adds_ipv4_without_replacing_host(monkeypatch):
    def fake_getaddrinfo(host, port, family, socktype):
        assert host == "db.example.test"
        assert port == 5432
        assert family == socket.AF_INET
        assert socktype == socket.SOCK_STREAM
        return [
            (
                socket.AF_INET,
                socket.SOCK_STREAM,
                6,
                "",
                ("203.0.113.10", 5432),
            )
        ]

    monkeypatch.setattr(socket, "getaddrinfo", fake_getaddrinfo)

    resolved = prefer_ipv4_hostaddr(
        "postgresql://user:pass@db.example.test:5432/postgres?sslmode=require"
    )
    params = conninfo_to_dict(resolved)

    assert params["host"] == "db.example.test"
    assert params["hostaddr"] == "203.0.113.10"
    assert params["sslmode"] == "require"


def test_prefer_ipv4_hostaddr_preserves_explicit_hostaddr(monkeypatch):
    called = False

    def fake_getaddrinfo(*args, **kwargs):
        nonlocal called
        called = True
        return []

    monkeypatch.setattr(socket, "getaddrinfo", fake_getaddrinfo)

    conninfo = "postgresql://user:pass@db.example.test/postgres?hostaddr=203.0.113.10"

    assert prefer_ipv4_hostaddr(conninfo) == conninfo
    assert called is False
