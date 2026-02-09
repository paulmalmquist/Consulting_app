import os
import sys
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL: str = os.getenv("DATABASE_URL", "")
SUPABASE_URL: str = os.getenv("SUPABASE_URL", "")
SUPABASE_SERVICE_ROLE_KEY: str = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
STORAGE_BUCKET: str = os.getenv("STORAGE_BUCKET", "documents")
ALLOWED_ORIGINS: list[str] = [
    o.strip() for o in os.getenv("ALLOWED_ORIGINS", "http://localhost:3000").split(",")
]

if not DATABASE_URL:
    print("FATAL: DATABASE_URL is not set. Exiting.", file=sys.stderr)
    sys.exit(1)
