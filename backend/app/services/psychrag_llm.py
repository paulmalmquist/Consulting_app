from __future__ import annotations

from typing import Any

import httpx
import openai

from app.config import (
    ANTHROPIC_API_KEY,
    OPENAI_API_KEY,
    PSYCHRAG_ANTHROPIC_MODEL,
    PSYCHRAG_OPENAI_MODEL_FALLBACK,
)


THERAPY_SYSTEM_PROMPT = """You are a compassionate, evidence-based clinical psychology AI assistant.

Your job is to provide supportive dialogue, psychoeducation, and skill coaching grounded in cited clinical literature.

Rules:
- You are not a replacement for a licensed therapist.
- Keep responses focused, warm, and professionally bounded.
- Use CBT first, then ACT or DBT skills when clinically appropriate.
- Do not diagnose, prescribe medication, or imply human monitoring.
- If the provided context is insufficient, say so plainly.
- When a source meaningfully informs your response, cite it as [Source: Title, Section, p.start-end].
"""


def _format_sources(citations: list[dict[str, Any]]) -> str:
    if not citations:
        return "No retrieved clinical context."
    lines: list[str] = []
    for item in citations:
        page_bits = []
        if item.get("page_start") is not None:
            page_bits.append(str(item.get("page_start")))
        if item.get("page_end") is not None and item.get("page_end") != item.get("page_start"):
            page_bits.append(str(item.get("page_end")))
        page = "-".join(page_bits)
        location = ", ".join(filter(None, [item.get("chapter"), item.get("section"), f"p.{page}" if page else None]))
        lines.append(
            f"- {item.get('title', 'Clinical source')}"
            + (f" ({location})" if location else "")
            + f": {item.get('content', '')[:600]}"
        )
    return "\n".join(lines)


def _fallback_supportive_response(message: str, citations: list[dict[str, Any]]) -> str:
    source_line = ""
    if citations:
        top = citations[0]
        location = ", ".join(filter(None, [top.get("chapter"), top.get("section")]))
        source_line = f" [Source: {top.get('title', 'Clinical source')}{', ' + location if location else ''}]"
    return (
        "It makes sense that this feels heavy right now. Let’s slow it down together and focus on one manageable step."
        "\n\nA CBT-style move here is to name the strongest thought driving the distress, then test whether it is a fact, a prediction, or a fear."
        "\n\nWhat is the exact thought that keeps looping right now, and what feeling does it drive in your body?"
        f"{source_line}"
    )


async def _anthropic_completion(prompt: str, history: list[dict[str, str]]) -> tuple[str, dict[str, Any]] | None:
    if not ANTHROPIC_API_KEY or not PSYCHRAG_ANTHROPIC_MODEL:
        return None
    async with httpx.AsyncClient(timeout=45.0) as client:
        response = await client.post(
            "https://api.anthropic.com/v1/messages",
            headers={
                "x-api-key": ANTHROPIC_API_KEY,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            },
            json={
                "model": PSYCHRAG_ANTHROPIC_MODEL,
                "max_tokens": 700,
                "system": THERAPY_SYSTEM_PROMPT,
                "messages": history + [{"role": "user", "content": prompt}],
            },
        )
    if response.status_code >= 400:
        return None
    payload = response.json()
    content = "".join(block.get("text", "") for block in payload.get("content", []) if block.get("type") == "text").strip()
    if not content:
        return None
    usage = payload.get("usage") or {}
    return content, {
        "model_used": PSYCHRAG_ANTHROPIC_MODEL,
        "token_count_input": usage.get("input_tokens"),
        "token_count_output": usage.get("output_tokens"),
        "fallback_used": False,
    }


async def _openai_completion(prompt: str, history: list[dict[str, str]]) -> tuple[str, dict[str, Any]] | None:
    if not OPENAI_API_KEY:
        return None
    client = openai.AsyncOpenAI(api_key=OPENAI_API_KEY)
    response = await client.chat.completions.create(
        model=PSYCHRAG_OPENAI_MODEL_FALLBACK,
        temperature=0.4,
        messages=[
            {"role": "system", "content": THERAPY_SYSTEM_PROMPT},
            *history,
            {"role": "user", "content": prompt},
        ],
    )
    message = response.choices[0].message.content if response.choices else None
    if not message:
        return None
    usage = getattr(response, "usage", None)
    return message.strip(), {
        "model_used": PSYCHRAG_OPENAI_MODEL_FALLBACK,
        "token_count_input": getattr(usage, "prompt_tokens", None) if usage else None,
        "token_count_output": getattr(usage, "completion_tokens", None) if usage else None,
        "fallback_used": True,
    }


async def generate_clinical_response(
    *,
    patient_message: str,
    citations: list[dict[str, Any]],
    history: list[dict[str, str]],
) -> dict[str, Any]:
    prompt = (
        f"Patient message:\n{patient_message}\n\n"
        f"Retrieved clinical context:\n{_format_sources(citations)}\n\n"
        "Respond in 2-4 short paragraphs. End with either a reflection, a gentle question, or one concrete coping skill."
    )

    anthropic_result = await _anthropic_completion(prompt, history)
    if anthropic_result is not None:
        content, meta = anthropic_result
        return {"content": content, **meta}

    openai_result = await _openai_completion(prompt, history)
    if openai_result is not None:
        content, meta = openai_result
        return {"content": content, **meta}

    return {
        "content": _fallback_supportive_response(patient_message, citations),
        "model_used": "local-fallback",
        "token_count_input": None,
        "token_count_output": None,
        "fallback_used": True,
    }


def build_crisis_response(resources: list[str]) -> str:
    resource_block = "\n".join(f"- {item}" for item in resources)
    return (
        "I’m really glad you said this out loud. I’m concerned that you may be at risk right now."
        "\n\nI’m not a crisis service, but I want to help you take the next safest step immediately:"
        f"\n{resource_block}"
        "\n\nIf you can, tell me whether you are safe in this moment and whether there is a trusted person nearby you can contact right now."
    )


def summarize_session(messages: list[dict[str, Any]], crisis_level: str) -> tuple[str, list[str]]:
    user_topics = [row["content"] for row in messages if row["role"] == "user"][-3:]
    assistant_text = " ".join(row["content"] for row in messages if row["role"] == "assistant").lower()
    techniques: list[str] = []
    for key in ("cbt", "act", "dbt", "values", "breathing", "grounding"):
        if key in assistant_text:
            techniques.append(key)
    if not techniques:
        techniques = ["supportive_reflection"]
    summary = (
        "Session focused on "
        + ("; ".join(topic[:140] for topic in user_topics) if user_topics else "emotional support and symptom reflection")
        + f". Crisis level remained {crisis_level}. Suggested techniques: {', '.join(sorted(set(techniques)))}."
    )
    return summary, sorted(set(techniques))
