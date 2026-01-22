import hashlib
import json
from typing import List

import httpx

from .config import get_settings


def _hash_embedding(text: str, size: int = 1536) -> list[float]:
    digest = hashlib.sha256(text.encode("utf-8")).digest()
    values = [(byte / 255.0) for byte in digest]
    embedding = (values * ((size // len(values)) + 1))[:size]
    return embedding


def embed_texts(texts: List[str]) -> List[List[float]]:
    settings = get_settings()
    if settings.llm_provider == "openai" and settings.openai_api_key:
        return _openai_embeddings(texts, settings.default_embedding_model)
    return [_hash_embedding(text) for text in texts]


def _openai_embeddings(texts: List[str], model: str) -> List[List[float]]:
    settings = get_settings()
    response = httpx.post(
        "https://api.openai.com/v1/embeddings",
        headers={"Authorization": f"Bearer {settings.openai_api_key}"},
        json={"model": model, "input": texts},
        timeout=30.0,
    )
    response.raise_for_status()
    payload = response.json()
    return [item["embedding"] for item in payload["data"]]


def chat_completion(system: str, user: str) -> str:
    settings = get_settings()
    if settings.llm_provider == "openai" and settings.openai_api_key:
        return _openai_chat(system, user, settings.default_chat_model)
    if settings.llm_provider == "anthropic" and settings.anthropic_api_key:
        return _anthropic_chat(system, user, settings.default_chat_model)
    return (
        "LLM not configured. Returning a demo response based on the retrieved documents."
    )


def _openai_chat(system: str, user: str, model: str) -> str:
    settings = get_settings()
    response = httpx.post(
        "https://api.openai.com/v1/chat/completions",
        headers={"Authorization": f"Bearer {settings.openai_api_key}"},
        json={
            "model": model,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            "temperature": 0.2,
        },
        timeout=45.0,
    )
    response.raise_for_status()
    payload = response.json()
    return payload["choices"][0]["message"]["content"]


def _anthropic_chat(system: str, user: str, model: str) -> str:
    settings = get_settings()
    response = httpx.post(
        "https://api.anthropic.com/v1/messages",
        headers={
            "x-api-key": settings.anthropic_api_key,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        },
        json={
            "model": model,
            "max_tokens": 600,
            "system": system,
            "messages": [{"role": "user", "content": user}],
        },
        timeout=45.0,
    )
    response.raise_for_status()
    payload = response.json()
    return "".join(chunk["text"] for chunk in payload.get("content", []))
