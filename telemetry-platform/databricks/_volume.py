"""
Telemetry Platform — Unity Catalog volume helpers (Files API).

The shared DatabricksClient has no Files API, so this adds the minimal pieces needed to stage parsed
dataset files into a managed volume and load them into Delta via read_files/COPY INTO. We extend the
client at call time rather than editing the shared class.

Volume layout: /Volumes/novendor_1/telemetry/raw/<dataset>/<file>
"""

from urllib.request import Request, urlopen
from urllib.error import HTTPError

from _bootstrap import get_client, TEL

VOLUME = "raw"
VOLUME_FQ = f"{TEL}.{VOLUME}"
VOLUME_ROOT = f"/Volumes/novendor_1/telemetry/{VOLUME}"


def ensure_volume(client) -> None:
    """Create the managed volume if absent (idempotent)."""
    client.execute_sql(
        f"CREATE VOLUME IF NOT EXISTS {VOLUME_FQ} "
        f"COMMENT 'Raw staged telemetry files before Bronze load.'"
    )


def upload_file(client, local_path: str, volume_subpath: str) -> str:
    """
    Upload a local file to the volume via the Files API (PUT, raw bytes).
    volume_subpath is relative to VOLUME_ROOT, e.g. 'cmapss/train_FD001.txt'.
    Returns the full /Volumes path. Never logs file contents.
    """
    dest = f"{VOLUME_ROOT}/{volume_subpath}"
    url = f"{client.base_url}/api/2.0/fs/files{dest}?overwrite=true"
    with open(local_path, "rb") as f:
        data = f.read()
    req = Request(url, data=data, method="PUT")
    req.add_header("Authorization", f"Bearer {client.pat}")
    req.add_header("Content-Type", "application/octet-stream")
    try:
        with urlopen(req, timeout=300) as resp:
            _ = resp.read()
    except HTTPError as e:
        body = e.read().decode() if e.fp else ""
        raise RuntimeError(f"Files API PUT {dest} -> {e.code}: {body[:200]}")
    return dest
