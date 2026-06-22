#!/usr/bin/env python3
"""Delta time travel, scripted as a demo transcript.

Simulates the bad day: a units bug ships and zeroes a part family's strength
margins in the gold feature store. Shows the damage with a checksum, reads the
prior truth with VERSION AS OF, restores it with one statement, and proves the
checksum matches. Rollback is a statement, not a war room.

    python time_travel_demo.py            # full corrupt -> inspect -> restore loop
"""

from __future__ import annotations

import sys

from databricks_client import RsFactoryClient

TABLE = "gold_print_quality_train"


def checksum(client: RsFactoryClient, version: int | None = None) -> tuple[int, float]:
    at = f" VERSION AS OF {version}" if version is not None else ""
    rows = client.sql_rows(
        f"SELECT COUNT(*), ROUND(SUM(COALESCE(min_strength_margin, 0)), 6) "
        f"FROM {client.qualified_schema}.{TABLE}{at}"
    )
    return int(rows[0][0]), float(rows[0][1])


def main() -> int:
    client = RsFactoryClient()
    q = f"{client.qualified_schema}.{TABLE}"
    client.start_warehouse()
    client.wait_for_warehouse()

    print(f"== Delta time travel on {q} ==\n")

    history = client.sql_dicts(f"DESCRIBE HISTORY {q} LIMIT 3")
    base_version = int(history[0]["version"])
    print(f"[1] DESCRIBE HISTORY -> current version {base_version} "
          f"(operation: {history[0]['operation']})")

    n0, sum0 = checksum(client)
    print(f"[2] checksum before: rows={n0} sum(margin)={sum0}")

    damaged = client.sql(
        f"UPDATE {q} SET min_strength_margin = 0 WHERE part_family = 'ENG-VALVE'"
    )
    affected = (damaged.get("result") or {}).get("data_array", [["?"]])[0][0]
    print(f"[3] 'units bug ships': UPDATE zeroed min_strength_margin for "
          f"part_family ENG-VALVE ({affected} rows)")

    n1, sum1 = checksum(client)
    print(f"[4] checksum after damage: rows={n1} sum(margin)={sum1}  <-- the drift a DQ check would page on")
    if sum1 == sum0:
        print("    WARNING: no drift detected; ENG-VALVE family may be empty in this build")

    n_old, sum_old = checksum(client, version=base_version)
    print(f"[5] SELECT ... VERSION AS OF {base_version}: rows={n_old} sum={sum_old}  <-- prior truth, still queryable")

    client.sql(f"RESTORE TABLE {q} TO VERSION AS OF {base_version}")
    n2, sum2 = checksum(client)
    print(f"[6] RESTORE TABLE ... VERSION AS OF {base_version}")
    print(f"[7] checksum after restore: rows={n2} sum(margin)={sum2}")

    ok = (n2, sum2) == (n0, sum0)
    print(f"\n{'RESTORED EXACTLY' if ok else 'MISMATCH AFTER RESTORE'}: "
          f"before={sum0} damaged={sum1} restored={sum2}")
    history = client.sql_dicts(f"DESCRIBE HISTORY {q} LIMIT 3")
    print("history tail now:",
          ", ".join(f"v{h['version']}:{h['operation']}" for h in history))
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
