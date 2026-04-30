from __future__ import annotations

import ipaddress
import socket

from psycopg.conninfo import conninfo_to_dict, make_conninfo


def prefer_ipv4_hostaddr(conninfo: str) -> str:
    """Return a conninfo string pinned to an IPv4 address when one is available.

    GitHub-hosted runners do not always have IPv6 egress. Some managed Postgres
    hostnames publish AAAA records first, which can make libpq fail with
    "Network is unreachable" before trying IPv4. Supplying hostaddr preserves the
    original host for TLS/SNI while forcing the TCP target to an IPv4 address.
    """
    params = conninfo_to_dict(conninfo)
    host = params.get("host")
    if not host or params.get("hostaddr"):
        return conninfo
    if "," in host:
        return conninfo

    try:
        ip = ipaddress.ip_address(host)
    except ValueError:
        ip = None
    if ip is not None:
        return conninfo if ip.version == 4 else conninfo

    port = int(params.get("port") or 5432)
    try:
        infos = socket.getaddrinfo(host, port, socket.AF_INET, socket.SOCK_STREAM)
    except OSError:
        return conninfo
    if not infos:
        return conninfo

    ipv4_addr = infos[0][4][0]
    return make_conninfo(conninfo, hostaddr=ipv4_addr)
