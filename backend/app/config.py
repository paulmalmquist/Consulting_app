import os
import sys
from urllib.parse import urlparse
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL: str = os.getenv("DATABASE_URL", "")
SUPABASE_URL: str = os.getenv("SUPABASE_URL", "")
SUPABASE_SERVICE_ROLE_KEY: str = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
STORAGE_BUCKET: str = os.getenv("STORAGE_BUCKET", "documents")
def _expand_localhost_origins(origins_csv: str) -> list[str]:
    # Keep CORS deterministic while tolerating localhost/127.0.0.1 dev host aliases.
    out: list[str] = []
    seen: set[str] = set()
    for raw in origins_csv.split(","):
        origin = raw.strip()
        if not origin:
            continue
        if origin not in seen:
            out.append(origin)
            seen.add(origin)
        parsed = urlparse(origin)
        if not parsed.scheme or not parsed.hostname or parsed.port is None:
            continue
        if parsed.hostname == "localhost":
            alias = f"{parsed.scheme}://127.0.0.1:{parsed.port}"
        elif parsed.hostname == "127.0.0.1":
            alias = f"{parsed.scheme}://localhost:{parsed.port}"
        else:
            alias = ""
        if alias and alias not in seen:
            out.append(alias)
            seen.add(alias)
    return out


ALLOWED_ORIGINS: list[str] = _expand_localhost_origins(
    os.getenv("ALLOWED_ORIGINS", "http://localhost:3000,https://www.paulmalmquist.com,https://paulmalmquist.com")
)

# ── MCP / Work system feature flags ─────────────────────────────────
MCP_API_TOKEN: str = os.getenv("MCP_API_TOKEN", "")
ENABLE_MCP_WRITES: bool = os.getenv("ENABLE_MCP_WRITES", "false").lower() == "true"
MCP_ACTOR_NAME: str = os.getenv("MCP_ACTOR_NAME", "codex_service_user")
MCP_RATE_LIMIT_RPM: int = int(os.getenv("MCP_RATE_LIMIT_RPM", "60"))
MCP_MAX_INPUT_BYTES: int = int(os.getenv("MCP_MAX_INPUT_BYTES", "200000"))
MCP_MAX_OUTPUT_BYTES: int = int(os.getenv("MCP_MAX_OUTPUT_BYTES", "200000"))
MCP_TOOL_TIMEOUT_SEC: int = int(os.getenv("MCP_TOOL_TIMEOUT_SEC", "60"))
MCP_ALLOWED_REPO_ROOTS: list[str] = [
    r.strip()
    for r in os.getenv("MCP_ALLOWED_REPO_ROOTS", "backend,repo-b,docs,scripts").split(",")
    if r.strip()
]
MCP_DENY_GLOBS: list[str] = [
    g.strip()
    for g in os.getenv(
        "MCP_DENY_GLOBS",
        ".env,.env.*,**/.env,**/.env.*,**/node_modules/**,**/.git/**",
    ).split(",")
    if g.strip()
]


_db_validated = False


def require_database_url() -> str:
    """Return DATABASE_URL or raise RuntimeError.

    Replaces the old import-time sys.exit so that code paths that don't
    need the database (e.g. MCP bm.list_tools) can still start.
    """
    global _db_validated
    if not DATABASE_URL:
        raise RuntimeError(
            "DATABASE_URL is not set.  Set it in .env or environment."
        )
    _db_validated = True
    return DATABASE_URL


# Backwards compat: keep the hard exit for the REST server entrypoint.
# The MCP server will call require_database_url() lazily instead.
if os.getenv("_BM_SKIP_DB_CHECK") != "1" and not DATABASE_URL:
    print("FATAL: DATABASE_URL is not set. Exiting.", file=sys.stderr)
    sys.exit(1)
