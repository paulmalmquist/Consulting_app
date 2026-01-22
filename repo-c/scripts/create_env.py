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
)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--client", required=True)
    parser.add_argument("--industry", required=True)
    args = parser.parse_args()

    env_id = generate_env_id()
    schema_name = env_schema_name(env_id)

    with get_conn() as conn:
        ensure_extensions(conn)
        ensure_platform_tables(conn)
        create_env_schema(conn, schema_name)
        seed_environment(conn, schema_name, args.industry)
        conn.execute(
            """
            INSERT INTO platform.environments
            (env_id, client_name, industry, schema_name, is_active)
            VALUES (%s, %s, %s, %s, true)
            """,
            (env_id, args.client, args.industry, schema_name),
        )
        insert_audit_log(
            conn,
            env_id,
            "cli",
            "create_environment",
            "environment",
            str(env_id),
            {"industry": args.industry},
        )
        conn.commit()

    print(f"Created environment {env_id} ({schema_name})")


if __name__ == "__main__":
    main()
