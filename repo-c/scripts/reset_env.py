import argparse
import uuid

from app.db import (
    get_conn,
    ensure_extensions,
    create_env_schema,
    seed_environment,
    insert_audit_log,
)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--env-id", required=True)
    args = parser.parse_args()

    env_uuid = uuid.UUID(args.env_id)
    with get_conn() as conn:
        ensure_extensions(conn)
        row = conn.execute(
            "SELECT schema_name, industry FROM platform.environments WHERE env_id = %s",
            (env_uuid,),
        ).fetchone()
        if not row:
            raise RuntimeError("Environment not found")
        schema_name, industry = row
        conn.execute(f"DROP SCHEMA IF EXISTS {schema_name} CASCADE")
        create_env_schema(conn, schema_name)
        seed_environment(conn, schema_name, industry)
        insert_audit_log(
            conn,
            env_uuid,
            "cli",
            "reset_environment",
            "environment",
            str(env_uuid),
            {},
        )
        conn.commit()

    print(f"Reset environment {env_uuid}")


if __name__ == "__main__":
    main()
