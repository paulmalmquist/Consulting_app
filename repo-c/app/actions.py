import uuid
from typing import Any

from .db import insert_audit_log


def assess_risk(text: str) -> str:
    lowered = text.lower()
    if any(keyword in lowered for keyword in ["approve", "diagnosis", "settlement"]):
        return "high"
    if any(keyword in lowered for keyword in ["change", "policy", "invoice"]):
        return "medium"
    return "low"


def execute_action(conn, schema_name: str, env_id: uuid.UUID, action: dict[str, Any]):
    action_type = action.get("type")
    if action_type == "create_ticket":
        ticket_id = uuid.uuid4()
        with conn.cursor() as cur:
            cur.execute(
                f"""
                INSERT INTO {schema_name}.tickets
                (ticket_id, status, title, body, intent, risk, source, metadata)
                VALUES (%s, 'open', %s, %s, %s, %s, 'chat', %s::jsonb)
                """,
                (
                    ticket_id,
                    action.get("title", "New ticket"),
                    action.get("body", ""),
                    action.get("intent", ""),
                    action.get("risk", "low"),
                    "{}",
                ),
            )
            conn.commit()
        insert_audit_log(
            conn,
            env_id,
            "Demo Lab",
            "create_ticket",
            "ticket",
            str(ticket_id),
            {"source": "chat"},
        )
        return {"ticket_id": str(ticket_id)}
    if action_type == "add_crm_note":
        note_id = uuid.uuid4()
        with conn.cursor() as cur:
            cur.execute(
                f"""
                INSERT INTO {schema_name}.crm_notes
                (id, note, related_entity, metadata)
                VALUES (%s, %s, %s, %s::jsonb)
                """,
                (
                    note_id,
                    action.get("note", ""),
                    action.get("related_entity", ""),
                    "{}",
                ),
            )
            conn.commit()
        insert_audit_log(
            conn,
            env_id,
            "Demo Lab",
            "add_crm_note",
            "crm_note",
            str(note_id),
            {"source": "chat"},
        )
        return {"note_id": str(note_id)}
    return {"status": "noop"}
