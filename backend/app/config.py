import os
import sys
from urllib.parse import urlparse
from dotenv import load_dotenv

load_dotenv()

def _clean_env_value(value: str | None) -> str:
    return value.strip() if value else ""


DATABASE_URL: str = _clean_env_value(os.getenv("DATABASE_URL", ""))
# psycopg3 prepare_threshold: number of executions before using prepared statements.
# Set to 0 or leave unset to disable (required for PgBouncer transaction mode).
DB_PREPARE_THRESHOLD: int | None = int(os.getenv("DB_PREPARE_THRESHOLD", "0")) or None
SUPABASE_URL: str = _clean_env_value(os.getenv("SUPABASE_URL", ""))
SUPABASE_SERVICE_ROLE_KEY: str = _clean_env_value(os.getenv("SUPABASE_SERVICE_ROLE_KEY", ""))
STORAGE_BUCKET: str = _clean_env_value(os.getenv("STORAGE_BUCKET", "documents")) or "documents"


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
    os.getenv("ALLOWED_ORIGINS", "https://www.paulmalmquist.com,https://paulmalmquist.com")
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


# ── AI Gateway ──────────────────────────────────────────────────────
OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY", "")
OPENAI_CHAT_MODEL: str = os.getenv("OPENAI_CHAT_MODEL", "gpt-5-mini")
OPENAI_EMBEDDING_MODEL: str = os.getenv("OPENAI_EMBEDDING_MODEL", "text-embedding-3-small")
AI_GATEWAY_ENABLED: bool = OPENAI_API_KEY != ""
AI_MAX_TOOL_ROUNDS: int = int(os.getenv("AI_MAX_TOOL_ROUNDS", "5"))
RAG_TOP_K: int = int(os.getenv("RAG_TOP_K", "5"))
RAG_CHUNK_TOKENS: int = int(os.getenv("RAG_CHUNK_TOKENS", "400"))
RAG_CHUNK_OVERLAP: int = int(os.getenv("RAG_CHUNK_OVERLAP", "50"))

# ── Multi-model dispatch ──────────────────────────────────────────
OPENAI_CHAT_MODEL_FAST: str = os.getenv("OPENAI_CHAT_MODEL_FAST", "gpt-5-mini")
OPENAI_CHAT_MODEL_STANDARD: str = os.getenv("OPENAI_CHAT_MODEL_STANDARD", "gpt-5")
OPENAI_CHAT_MODEL_REASONING: str = os.getenv("OPENAI_CHAT_MODEL_REASONING", "gpt-5")
OPENAI_CHAT_MODEL_CODING: str = os.getenv("OPENAI_CHAT_MODEL_CODING", "gpt-5")
OPENAI_CHAT_MODEL_AGENTIC: str = os.getenv("OPENAI_CHAT_MODEL_AGENTIC", "gpt-5")
OPENAI_CHAT_MODEL_VERIFY: str = os.getenv("OPENAI_CHAT_MODEL_VERIFY", "gpt-5-mini")
OPENAI_CHAT_MODEL_FALLBACK: str = os.getenv("OPENAI_CHAT_MODEL_FALLBACK", "gpt-5-mini")

# ── Pipeline feature flags (all default off for safe rollout) ────
ENABLE_QUERY_EXPANSION: bool = os.getenv("ENABLE_QUERY_EXPANSION", "false").lower() == "true"
ENABLE_STRUCTURED_RAG: bool = os.getenv("ENABLE_STRUCTURED_RAG", "false").lower() == "true"
ENABLE_ANSWER_VERIFICATION: bool = os.getenv("ENABLE_ANSWER_VERIFICATION", "false").lower() == "true"
ENABLE_CONTEXT_COMPRESSION: bool = os.getenv("ENABLE_CONTEXT_COMPRESSION", "false").lower() == "true"
ENABLE_SEMANTIC_CACHE: bool = os.getenv("ENABLE_SEMANTIC_CACHE", "false").lower() == "true"
ENABLE_ADAPTIVE_RETRIEVAL: bool = os.getenv("ENABLE_ADAPTIVE_RETRIEVAL", "false").lower() == "true"
ENABLE_AGENTIC_EXECUTOR: bool = os.getenv("ENABLE_AGENTIC_EXECUTOR", "false").lower() == "true"

# ── RAG quality controls ─────────────────────────────────────────
RAG_MIN_SCORE: float = float(os.getenv("RAG_MIN_SCORE", "0.30"))
RAG_RRF_K: int = int(os.getenv("RAG_RRF_K", "60"))
RAG_EMBEDDING_CACHE_SIZE: int = int(os.getenv("RAG_EMBEDDING_CACHE_SIZE", "512"))
RAG_CACHE_TTL_SECONDS: int = int(os.getenv("RAG_CACHE_TTL_SECONDS", "300"))

# ── Re-ranking ───────────────────────────────────────────────────
COHERE_API_KEY: str = os.getenv("COHERE_API_KEY", "")
RAG_RERANK_METHOD: str = os.getenv("RAG_RERANK_METHOD", "cohere" if os.getenv("COHERE_API_KEY", "") else "llm")
RAG_OVERFETCH: int = int(os.getenv("RAG_OVERFETCH", "75"))

# ── Langfuse observability ─────────────────────────────────────────
LANGFUSE_PUBLIC_KEY: str = os.getenv("LANGFUSE_PUBLIC_KEY", "")
LANGFUSE_SECRET_KEY: str = os.getenv("LANGFUSE_SECRET_KEY", "")
LANGFUSE_HOST: str = os.getenv("LANGFUSE_HOST", "https://cloud.langfuse.com")

# ── PsychRAG clinical module ────────────────────────────────────────
ANTHROPIC_API_KEY: str = os.getenv("ANTHROPIC_API_KEY", "")
PSYCHRAG_ANTHROPIC_MODEL: str = os.getenv("PSYCHRAG_ANTHROPIC_MODEL", "")
PSYCHRAG_OPENAI_MODEL_FALLBACK: str = os.getenv("PSYCHRAG_OPENAI_MODEL_FALLBACK", "gpt-4o")
PSYCHRAG_EMBEDDING_MODEL: str = os.getenv("PSYCHRAG_EMBEDDING_MODEL", "text-embedding-3-large")
PSYCHRAG_EMBEDDING_DIMENSION: int = int(os.getenv("PSYCHRAG_EMBEDDING_DIMENSION", "3072"))
PSYCHRAG_TOP_K: int = int(os.getenv("PSYCHRAG_TOP_K", "5"))
PSYCHRAG_SUPPORT_EMAIL: str = os.getenv("PSYCHRAG_SUPPORT_EMAIL", "support@example.com")

# ── Trade execution layer ───────────────────────────────────────────
IBKR_HOST: str = os.getenv("IBKR_HOST", "127.0.0.1")
IBKR_PAPER_PORT: int = int(os.getenv("IBKR_PAPER_PORT", "4002"))
IBKR_LIVE_PORT: int = int(os.getenv("IBKR_LIVE_PORT", "4001"))
IBKR_CLIENT_ID: int = int(os.getenv("IBKR_CLIENT_ID", "7"))
TRADES_RECONNECT_INTERVAL_SEC: int = int(os.getenv("TRADES_RECONNECT_INTERVAL_SEC", "15"))
TRADES_SLIPPAGE_ALERT_BPS: int = int(os.getenv("TRADES_SLIPPAGE_ALERT_BPS", "50"))
TRADES_ENABLE_LIVE_SUBMISSION: bool = os.getenv("TRADES_ENABLE_LIVE_SUBMISSION", "false").lower() == "true"

_db_validated = False


def require_database_url() -> str:
    """Return DATABASE_URL or raise RuntimeError.

    Replaces the old import-time sys.exit so that code paths that don't
    need the database (e.g. MCP bm.list_tools) can still start.
    """
    global _db_validated
    database_url = _clean_env_value(DATABASE_URL)
    if not database_url:
        raise RuntimeError(
            "DATABASE_URL is not set.  Set it in .env or environment."
        )
    _db_validated = True
    return database_url


# Backwards compat: keep the hard exit for the REST server entrypoint.
# The MCP server will call require_database_url() lazily instead.
if os.getenv("_BM_SKIP_DB_CHECK") != "1" and not DATABASE_URL:
    print("FATAL: DATABASE_URL is not set. Exiting.", file=sys.stderr)
    sys.exit(1)
