from __future__ import annotations

from hashlib import sha256

from app.connectors.cre.base import ConnectorContext


def fetch(context: ConnectorContext) -> dict:
    question_text = context.filters.get("question_text", "miami default")
    digest = sha256(question_text.encode("utf-8")).hexdigest()
    bucket = int(digest[:6], 16) % 35
    probability = 0.33 + (bucket / 100)
    return {
        "rows": [
            {
                "market_id": f"KX-{digest[:10].upper()}",
                "event_title": question_text,
                "event_cutoff": str(context.filters.get("event_date", "2026-12-31")),
                "last_traded_probability": round(min(probability, 0.92), 4),
            }
        ]
    }

