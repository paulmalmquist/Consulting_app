from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .contracts import validate_with_schema
from .paths import LOGS_DIR, ensure_runtime_dirs


INDEX = "index.jsonl"


def _sha(s: str) -> str:
    return hashlib.sha256(s.encode("utf-8")).hexdigest()


def _next_seq(session_id: str) -> int:
    prefix = f"-{session_id}-"
    seq = 0
    if not LOGS_DIR.exists():
        return 1
    for p in LOGS_DIR.glob(f"*{prefix}*.json"):
        try:
            s = int(p.stem.split("-")[-1])
            seq = max(seq, s)
        except Exception:
            continue
    return seq + 1


def _last_hash() -> str:
    idx = LOGS_DIR / INDEX
    if not idx.exists():
        return ""
    lines = idx.read_text(encoding="utf-8").splitlines()
    if not lines:
        return ""
    last = json.loads(lines[-1])
    return str(last.get("hash_self", ""))


def write_execution_log(log: dict[str, Any], log_schema: dict[str, Any]) -> Path:
    ensure_runtime_dirs()
    ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    session_id = str(log["session_id"])
    seq = _next_seq(session_id)
    log["timestamp_utc"] = datetime.now(timezone.utc).isoformat()
    log["hash_prev"] = _last_hash()
    base = json.dumps(log, sort_keys=True, separators=(",", ":"))
    log["hash_self"] = _sha(base + log["hash_prev"])
    validate_with_schema(log_schema, log)
    file_path = LOGS_DIR / f"{ts}-{session_id}-{seq}.json"
    file_path.write_text(json.dumps(log, indent=2, sort_keys=True) + "\n", encoding="utf-8")

    idx_entry = {
        "path": str(file_path.relative_to(LOGS_DIR.parent)),
        "session_id": session_id,
        "timestamp_utc": log["timestamp_utc"],
        "hash_self": log["hash_self"],
        "file_sha256": _sha(file_path.read_text(encoding="utf-8")),
    }
    with (LOGS_DIR / INDEX).open("a", encoding="utf-8") as fh:
        fh.write(json.dumps(idx_entry, sort_keys=True) + "\n")
    return file_path


def append_soft_delete_ledger(execution_id: str, files: list[str]) -> None:
    ensure_runtime_dirs()
    entry = {
        "execution_id": execution_id,
        "timestamp_utc": datetime.now(timezone.utc).isoformat(),
        "files": files,
    }
    with (LOGS_DIR / "soft_delete_ledger.jsonl").open("a", encoding="utf-8") as fh:
        fh.write(json.dumps(entry, sort_keys=True) + "\n")


def verify_log_chain() -> tuple[bool, str]:
    idx = LOGS_DIR / INDEX
    if not idx.exists():
        return True, "No logs"
    prev = ""
    for ln in idx.read_text(encoding="utf-8").splitlines():
        if not ln.strip():
            continue
        row = json.loads(ln)
        p = LOGS_DIR.parent / row["path"]
        if not p.exists():
            return False, f"Missing log file: {p}"
        j = json.loads(p.read_text(encoding="utf-8"))
        if j.get("hash_prev", "") != prev:
            return False, f"Hash chain mismatch: {p}"
        file_sha = _sha(p.read_text(encoding="utf-8"))
        if row.get("file_sha256") != file_sha:
            return False, f"File checksum mismatch: {p}"
        prev = j.get("hash_self", "")
    return True, "ok"
