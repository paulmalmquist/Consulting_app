import argparse
import json
import uuid

from app.db import get_conn
from app.text import chunk_text
from app.llm import embed_texts


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--env-id", required=True)
    parser.add_argument("--file", required=True)
    parser.add_argument("--mime", default="text/plain")
    args = parser.parse_args()

    env_uuid = uuid.UUID(args.env_id)
    with open(args.file, "r", encoding="utf-8") as handle:
        text = handle.read()

    chunks = chunk_text(text)
    embeddings = embed_texts(chunks)

    with get_conn() as conn:
        row = conn.execute(
            "SELECT schema_name FROM platform.environments WHERE env_id = %s",
            (env_uuid,),
        ).fetchone()
        if not row:
            raise RuntimeError("Environment not found")
        schema_name = row[0]
        doc_id = uuid.uuid4()
        conn.execute(
            f"""
            INSERT INTO {schema_name}.documents
            (doc_id, filename, storage_path, mime_type, size_bytes)
            VALUES (%s, %s, %s, %s, %s)
            """,
            (
                doc_id,
                args.file,
                f"local://{args.file}",
                args.mime,
                len(text.encode("utf-8")),
            ),
        )
        for index, (chunk, embedding) in enumerate(zip(chunks, embeddings)):
            chunk_id = uuid.uuid4()
            embedding_str = "[" + ",".join(f"{value:.6f}" for value in embedding) + "]"
            conn.execute(
                f"""
                INSERT INTO {schema_name}.doc_chunks
                (chunk_id, doc_id, chunk_index, content, embedding, metadata)
                VALUES (%s, %s, %s, %s, %s::vector, %s::jsonb)
                """,
                (
                    chunk_id,
                    doc_id,
                    index,
                    chunk,
                    embedding_str,
                    json.dumps({"source": args.file}),
                ),
            )
        conn.commit()

    print(f"Ingested {args.file} into {schema_name}")


if __name__ == "__main__":
    main()
