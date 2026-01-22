from dataclasses import dataclass
import os


@dataclass(frozen=True)
class Settings:
    supabase_url: str
    supabase_service_role_key: str
    supabase_db_url: str
    supabase_storage_bucket: str
    allowed_origins: list[str]
    llm_provider: str
    openai_api_key: str
    anthropic_api_key: str
    default_embedding_model: str
    default_chat_model: str


def get_settings() -> Settings:
    allowed_origins = os.getenv("ALLOWED_ORIGINS", "").split(",")
    return Settings(
        supabase_url=os.getenv("SUPABASE_URL", ""),
        supabase_service_role_key=os.getenv("SUPABASE_SERVICE_ROLE_KEY", ""),
        supabase_db_url=os.getenv("SUPABASE_DB_URL", ""),
        supabase_storage_bucket=os.getenv("SUPABASE_STORAGE_BUCKET", "demo-uploads"),
        allowed_origins=[origin.strip() for origin in allowed_origins if origin.strip()],
        llm_provider=os.getenv("LLM_PROVIDER", "openai"),
        openai_api_key=os.getenv("OPENAI_API_KEY", ""),
        anthropic_api_key=os.getenv("ANTHROPIC_API_KEY", ""),
        default_embedding_model=os.getenv("DEFAULT_EMBEDDING_MODEL", ""),
        default_chat_model=os.getenv("DEFAULT_CHAT_MODEL", ""),
    )
