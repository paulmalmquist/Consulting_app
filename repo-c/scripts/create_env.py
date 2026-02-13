import argparse

from app.db import (
    get_conn,
    ensure_extensions,
    ensure_platform_tables,
    generate_env_id,
    env_schema_name,
    create_env_schema,
    seed_environment,
    insert_audit_log,
    ensure_pipeline_seed,
    normalize_industry_type,
)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--client", required=True)
    parser.add_argument("--industry", required=False, default="general")
    parser.add_argument("--industry-type", required=False, default=None)
    args = parser.parse_args()

    industry_type = normalize_industry_type(args.industry_type or args.industry)
    industry = (args.industry or industry_type).strip() or "general"

    env_id = generate_env_id()
    schema_name = env_schema_name(env_id)

    with get_conn() as conn:
        ensure_extensions(conn)
        ensure_platform_tables(conn)
        create_env_schema(conn, schema_name)
        seed_environment(conn, schema_name, industry_type)
        conn.execute(
            """
            INSERT INTO platform.environments
            (env_id, client_name, industry, industry_type, schema_name, is_active, pipeline_stage_name)
            VALUES (%s, %s, %s, %s, %s, true, NULL)
            """,
            (env_id, args.client, industry, industry_type, schema_name),
        )
        ensure_pipeline_seed(conn, env_id, industry_type)
        stage_row = conn.execute(
            """
            SELECT stage_name
            FROM platform.pipeline_stages
            WHERE env_id = %s AND is_deleted = false
            ORDER BY order_index, created_at
            LIMIT 1
            """,
            (env_id,),
        ).fetchone()
        stage_name = stage_row[0] if stage_row else None
        conn.execute(
            """
            UPDATE platform.environments
            SET pipeline_stage_name = %s
            WHERE env_id = %s
            """,
            (stage_name, env_id),
        )
        insert_audit_log(
            conn,
            env_id,
            "cli",
            "create_environment",
            "environment",
            str(env_id),
            {"industry": industry, "industry_type": industry_type, "pipeline_stage_name": stage_name},
        )
        conn.commit()

    print(f"Created environment {env_id} ({schema_name})")


if __name__ == "__main__":
    main()
