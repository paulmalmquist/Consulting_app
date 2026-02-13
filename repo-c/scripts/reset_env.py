import argparse
import uuid

from app.db import (
    get_conn,
    ensure_extensions,
    create_env_schema,
    seed_environment,
    insert_audit_log,
    ensure_platform_tables,
    ensure_pipeline_seed,
)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--env-id", required=True)
    args = parser.parse_args()

    env_uuid = uuid.UUID(args.env_id)
    with get_conn() as conn:
        ensure_extensions(conn)
        ensure_platform_tables(conn)
        row = conn.execute(
            """
            SELECT schema_name, COALESCE(industry_type, industry)
            FROM platform.environments
            WHERE env_id = %s
            """,
            (env_uuid,),
        ).fetchone()
        if not row:
            raise RuntimeError("Environment not found")
        schema_name, industry_type = row
        conn.execute(f"DROP SCHEMA IF EXISTS {schema_name} CASCADE")
        create_env_schema(conn, schema_name)
        seed_environment(conn, schema_name, industry_type)
        conn.execute(
            """
            UPDATE platform.pipeline_cards
            SET is_deleted = true, deleted_at = now(), updated_at = now()
            WHERE env_id = %s AND is_deleted = false
            """,
            (env_uuid,),
        )
        conn.execute(
            """
            UPDATE platform.pipeline_stages
            SET is_deleted = true, deleted_at = now(), updated_at = now()
            WHERE env_id = %s AND is_deleted = false
            """,
            (env_uuid,),
        )
        ensure_pipeline_seed(conn, env_uuid, industry_type)
        stage_row = conn.execute(
            """
            SELECT stage_name
            FROM platform.pipeline_stages
            WHERE env_id = %s AND is_deleted = false
            ORDER BY order_index, created_at
            LIMIT 1
            """,
            (env_uuid,),
        ).fetchone()
        stage_name = stage_row[0] if stage_row else None
        conn.execute(
            """
            UPDATE platform.environments
            SET pipeline_stage_name = %s
            WHERE env_id = %s
            """,
            (stage_name, env_uuid),
        )
        insert_audit_log(
            conn,
            env_uuid,
            "cli",
            "reset_environment",
            "environment",
            str(env_uuid),
            {"industry_type": industry_type, "pipeline_stage_name": stage_name},
        )
        conn.commit()

    print(f"Reset environment {env_uuid}")


if __name__ == "__main__":
    main()
