"""DDQ (Due Diligence Questionnaire) Response Drafter.

Extracts questions from an uploaded DDQ document, searches the fund's document
corpus via RAG for answers, and drafts responses with source citations.
"""
from __future__ import annotations

import json
import uuid
from typing import Any
from uuid import UUID

from app.config import AI_GATEWAY_ENABLED, OPENAI_API_KEY, OPENAI_CHAT_MODEL_STANDARD
from app.db import get_cursor
from app.observability.logger import emit_log
from app.services.rag_indexer import semantic_search, RetrievedChunk
from app.services.text_extractor import extract_text


def process_ddq(
    *,
    document_id: UUID,
    fund_id: UUID,
    business_id: UUID,
    env_id: str,
) -> dict:
    """Process a DDQ document end-to-end.

    1. Download and extract text from the DDQ document.
    2. Parse numbered questions via LLM.
    3. For each question, search the fund's document corpus via RAG.
    4. Draft a response per question with source citations.
    5. Persist results in re_ddq_response.
    6. Return structured output.
    """
    # Step 1: Get document content
    doc_text = _get_document_text(document_id)

    # Step 2: Extract questions
    questions = _extract_questions(doc_text)
    if not questions:
        raise ValueError("Could not extract any questions from the document")

    # Step 3–4: For each question, RAG search + draft answer
    results: list[dict[str, Any]] = []
    answered = 0
    needs_input = 0

    for i, question in enumerate(questions):
        # RAG search against fund's document corpus
        chunks = semantic_search(
            question,
            business_id=business_id,
            env_id=uuid.UUID(env_id) if isinstance(env_id, str) else env_id,
            scope_entity_type="fund",
            scope_entity_id=str(fund_id),
            top_k=5,
            use_hybrid=True,
        )

        # Draft answer if we have relevant chunks
        sources = _format_sources(chunks)
        has_context = len(chunks) > 0 and chunks[0].score > 0.3

        if has_context:
            draft_answer = _draft_answer(question, chunks)
            confidence = min(0.95, max(0.4, chunks[0].score))
            flag_needs_input = False
            answered += 1
        else:
            draft_answer = "No supporting documents found. This question requires direct GP input."
            confidence = 0.0
            flag_needs_input = True
            needs_input += 1

        results.append({
            "index": i + 1,
            "question": question,
            "draft_answer": draft_answer,
            "sources": sources,
            "confidence": round(confidence, 2),
            "needs_input": flag_needs_input,
        })

    # Step 5: Persist
    ddq_id = _persist_ddq_response(
        env_id=env_id,
        business_id=business_id,
        fund_id=fund_id,
        document_id=document_id,
        questions=results,
        total_questions=len(questions),
        answered=answered,
        needs_input=needs_input,
    )

    emit_log(
        level="info",
        service="backend",
        action="ddq.process",
        message=f"DDQ processed: {len(questions)} questions, {answered} answered, {needs_input} need input",
        context={"document_id": str(document_id), "fund_id": str(fund_id)},
    )

    return {
        "ddq_id": str(ddq_id),
        "document_id": str(document_id),
        "fund_id": str(fund_id),
        "total_questions": len(questions),
        "answered": answered,
        "needs_input": needs_input,
        "questions": results,
    }


def _get_document_text(document_id: UUID) -> str:
    """Download and extract text from a document."""
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT dv.bucket, dv.object_key, dv.mime_type, dv.original_filename
            FROM app.document_versions dv
            JOIN app.documents d ON d.document_id = dv.document_id
            WHERE d.document_id = %s
            ORDER BY dv.version_number DESC LIMIT 1
            """,
            (str(document_id),),
        )
        row = cur.fetchone()
        if not row:
            raise LookupError(f"Document {document_id} not found")

    from app.services.documents import _storage
    import httpx

    signed = _storage.generate_signed_download_url(row["bucket"], row["object_key"])
    resp = httpx.get(signed, timeout=60)
    resp.raise_for_status()

    return extract_text(resp.content, row["mime_type"], row.get("original_filename", ""))


def _extract_questions(doc_text: str) -> list[str]:
    """Use LLM to parse numbered questions from DDQ document text."""
    if not AI_GATEWAY_ENABLED:
        raise RuntimeError("AI Gateway disabled: set OPENAI_API_KEY")

    import openai

    client = openai.OpenAI(api_key=OPENAI_API_KEY)
    response = client.chat.completions.create(
        model=OPENAI_CHAT_MODEL_STANDARD,
        messages=[
            {
                "role": "system",
                "content": (
                    "You extract questions from Due Diligence Questionnaires. "
                    "Return a JSON array of strings, each being one question from the document. "
                    "Include the full question text. Exclude section headers, instructions, and non-question text. "
                    "Return valid JSON only with no markdown."
                ),
            },
            {"role": "user", "content": f"Extract all questions from this DDQ document:\n\n{doc_text[:12000]}"},
        ],
        temperature=0,
        max_tokens=4000,
        response_format={"type": "json_object"},
    )
    raw = response.choices[0].message.content or "[]"
    parsed = json.loads(raw)
    # Handle both {"questions": [...]} and [...] formats
    if isinstance(parsed, dict):
        return parsed.get("questions", [])
    if isinstance(parsed, list):
        return parsed
    return []


def _draft_answer(question: str, chunks: list[RetrievedChunk]) -> str:
    """Draft an answer using RAG context."""
    if not AI_GATEWAY_ENABLED:
        raise RuntimeError("AI Gateway disabled: set OPENAI_API_KEY")

    context_block = "\n\n---\n\n".join([
        f"[Source: {c.source_filename or c.document_id}, Page {c.chunk_index + 1}]\n{c.chunk_text[:1500]}"
        for c in chunks[:5]
    ])

    import openai

    client = openai.OpenAI(api_key=OPENAI_API_KEY)
    response = client.chat.completions.create(
        model=OPENAI_CHAT_MODEL_STANDARD,
        messages=[
            {
                "role": "system",
                "content": (
                    "You are drafting answers for a Due Diligence Questionnaire on behalf of a real estate fund GP. "
                    "Use ONLY the provided source documents to answer. Be specific and cite the source document. "
                    "If the sources don't fully answer the question, note what additional information is needed. "
                    "Be professional, concise, and factual."
                ),
            },
            {
                "role": "user",
                "content": f"Question: {question}\n\nSource Documents:\n{context_block}",
            },
        ],
        temperature=0.2,
        max_tokens=1000,
    )
    return response.choices[0].message.content or "Unable to generate answer."


def _format_sources(chunks: list[RetrievedChunk]) -> list[dict]:
    """Format RAG chunks as source citations."""
    return [
        {
            "doc_id": c.document_id,
            "filename": c.source_filename,
            "chunk": c.chunk_text[:200],
            "score": round(c.score, 3),
            "page": c.chunk_index + 1,
        }
        for c in chunks[:5]
    ]


def _persist_ddq_response(
    *,
    env_id: str,
    business_id: UUID,
    fund_id: UUID,
    document_id: UUID,
    questions: list[dict],
    total_questions: int,
    answered: int,
    needs_input: int,
) -> str:
    """Save DDQ response to database."""
    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO re_ddq_response
                (env_id, business_id, fund_id, document_id, status, total_questions, answered, needs_input, questions_json)
            VALUES (%s, %s, %s, %s, 'completed', %s, %s, %s, %s::jsonb)
            RETURNING id
            """,
            (
                env_id, str(business_id), str(fund_id), str(document_id),
                total_questions, answered, needs_input, json.dumps(questions),
            ),
        )
        row = cur.fetchone()
        return str(row["id"])
