"""Basic smoke checks for Excel add-in API endpoints."""

import argparse
import sys

import httpx


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", default="http://localhost:8000")
    parser.add_argument("--api-key", default="")
    parser.add_argument("--env-id", default="")
    args = parser.parse_args()

    headers = {"Authorization": f"Bearer {args.api_key}"} if args.api_key else {}

    with httpx.Client(base_url=args.base_url, timeout=20.0, headers=headers) as client:
        health = client.get("/health")
        print("/health", health.status_code, health.text)
        if health.status_code != 200:
            return 1

        init = client.post("/v1/excel/session/init", json={})
        print("/v1/excel/session/init", init.status_code)
        if init.status_code != 200:
            return 1

        me = client.get("/v1/excel/me")
        print("/v1/excel/me", me.status_code)
        if me.status_code not in {200, 401}:
            return 1

        schema_url = "/v1/excel/schema"
        if args.env_id:
            schema_url = f"{schema_url}?env_id={args.env_id}"
        schema = client.get(schema_url)
        print(schema_url, schema.status_code)
        if schema.status_code != 200:
            return 1

    print("Excel smoke checks passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
