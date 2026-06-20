"""B7 infra tests: feature-store k8s manifests are present, default-off, name-stable,
reference only the expected secrets, and wire the topic constants — static checks
only (no live deploy). A kustomize build runs when kubectl is available, else skips.
"""

from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

import pytest

from app.events.topics import Topics

REPO = Path(__file__).resolve().parents[2]
BASE = REPO / "infra" / "k8s" / "base" / "history-rhymes-feature-store"
OVL = REPO / "infra" / "k8s" / "overlays" / "gke-prod" / "history-rhymes-feature-store"

BASE_FILES = ["namespace.yaml", "serviceaccounts.yaml", "configmap.yaml",
              "ingest-deployment.yaml", "materializer-deployment.yaml", "kustomization.yaml"]
OVL_FILES = ["kustomization.yaml", "secret-provider-classes.yaml", "config-patch.yaml",
             "serviceaccounts-patch.yaml", "README.md"]

FS_ENABLED_FLAGS = ["FS_FRED_ENABLED", "FS_CENSUS_ENABLED", "FS_VIX_ENABLED",
                    "FS_FOMC_TEXT_ENABLED", "FS_DEFILLAMA_ENABLED", "FS_MATERIALIZER_ENABLED"]


def _read(p: Path) -> str:
    return p.read_text(encoding="utf-8")


def test_all_manifests_present():
    for f in BASE_FILES:
        assert (BASE / f).exists(), f"missing base/{f}"
    for f in OVL_FILES:
        assert (OVL / f).exists(), f"missing overlay/{f}"


def test_configmap_default_off():
    cm = _read(BASE / "configmap.yaml")
    for flag in FS_ENABLED_FLAGS:
        assert f'{flag}: "false"' in cm, f"{flag} must default false"
    assert 'BQ_ENABLED: "false"' in cm  # no BigQuery writes by default


def test_deployment_names_stable_and_replicas_zero():
    ing = _read(BASE / "ingest-deployment.yaml")
    mat = _read(BASE / "materializer-deployment.yaml")
    assert "name: hr-feature-store-ingest" in ing
    assert "name: hr-feature-store-materializer" in mat
    assert "replicas: 0" in ing and "replicas: 0" in mat  # maximally disabled


def test_secret_provider_class_only_expected_secrets():
    spc = _read(OVL / "secret-provider-classes.yaml")
    # Inspect only the actual secret resource lines, not comments.
    resource_lines = [ln.lower() for ln in spc.splitlines() if "resourcename" in ln.lower()]
    assert any("winston-database-url" in ln for ln in resource_lines)
    assert any("winston-fred-api-key" in ln for ln in resource_lines)
    # public/keyless sources must NOT introduce secrets; no unrelated lane secrets
    for forbidden in ("census", "defillama", "fomc", "databricks", "confluent", "polymarket"):
        assert not any(forbidden in ln for ln in resource_lines), f"unexpected secret: {forbidden}"


def test_topic_constants_exist_and_follow_convention():
    for const in ("HR_FEATURE_STORE_READINGS", "HR_FEATURE_STORE_PIPELINE_STATUS",
                  "HR_FEATURE_STORE_MATERIALIZED"):
        val = getattr(Topics, const)
        assert val.startswith("winston.hr.feature_store.") and val.endswith(".v1")
    cm = _read(BASE / "configmap.yaml")
    for val in (Topics.HR_FEATURE_STORE_READINGS, Topics.HR_FEATURE_STORE_PIPELINE_STATUS,
                Topics.HR_FEATURE_STORE_MATERIALIZED):
        assert val in cm  # EVENT_SINK_TOPICS lists them


def test_secret_volume_csi_wiring():
    for dep, spc in (("ingest-deployment.yaml", "hr-feature-store-ingest"),
                     ("materializer-deployment.yaml", "hr-feature-store-materializer")):
        text = _read(BASE / dep)
        assert "secrets-store-gke.csi.k8s.io" in text
        assert f"secretProviderClass: {spc}" in text
        assert "/var/run/winston-secrets" in text


def test_no_episode_embeddings_or_ade_in_manifests():
    for d, files in ((BASE, BASE_FILES), (OVL, OVL_FILES)):
        for f in files:
            src = _read(d / f)
            assert "episode_embeddings" not in src
            assert "ade_connectors" not in src
            assert "ade_op" not in src


@pytest.mark.parametrize("path", [BASE, OVL])
def test_kustomize_build_succeeds(path):
    kubectl = shutil.which("kubectl") or shutil.which("kustomize")
    if not kubectl:
        pytest.skip("kubectl/kustomize not available")
    cmd = ([kubectl, "kustomize", str(path)] if kubectl.endswith("kustomize")
           else [kubectl, "kustomize", str(path)])
    res = subprocess.run(cmd, capture_output=True, text=True)
    assert res.returncode == 0, f"kustomize build failed: {res.stderr[:500]}"
    assert "kind: Deployment" in res.stdout
