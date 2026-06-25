# Databricks notebook source
# MAGIC %md
# MAGIC # Factory NCR Intelligence — deterministic synthetic corpus
# MAGIC Generates the synthetic NCR narrative corpus (SEED=20260609, stdlib-only, fully deterministic)
# MAGIC and writes it to novendor_1.telemetry.ncr_records. ~120 family records across 16 weeks in 6
# MAGIC defect families with engineered week-over-week dynamics (seal/thermal RISING, fastener torque
# MAGIC DECLINING, the rest flat) plus ~18 one-off noise records that should NOT cluster. Everything
# MAGIC downstream (embeddings, UMAP, HDBSCAN, c-TF-IDF, backlog forecast) is a REAL model run over
# MAGIC this corpus — the corpus is the only synthetic layer, and it is labeled as such in the UI.
# MAGIC
# MAGIC The generator is pure stdlib and import-safe outside Databricks: the spark write section is
# MAGIC guarded, so backend CI imports this file by path and asserts byte-identical regeneration.

# COMMAND ----------
import json
import random
from datetime import date, timedelta

SEED = 20260609
N_WEEKS = 16
# Fixed anchor (Monday) so the corpus is identical on every run, everywhere. Weeks are
# [anchor - 16w, anchor); week index 0 is the oldest.
ANCHOR = date(2026, 6, 8)

# Each family: workcell pool, severity weights, median time-to-close, reopen probability, and a
# per-week count schedule (len 16, oldest first) that encodes the intended dynamics.
FAMILIES = {
    "seal_thermal": {
        "workcells": ["assembly_wc_09", "assembly_wc_12"],
        "ttc_median": 11, "reopen_p": 0.08,
        "weekly": [1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 4, 4, 5],   # rising (slope ~ +0.44/wk in the trailing 8)
        "templates": [
            "Seal witness mark out of tolerance after thermal cycle at {wc}.",
            "Recurring seal deformation observed after high-temp cure and post-cure handling.",
            "Seal seating depth drift recorded at thermal-cycle exit inspection.",
            "Compression set on primary seal exceeds limit following thermal vacuum cycle.",
            "Post-cure seal extrusion found at gland edge during teardown inspection.",
        ],
    },
    "am_porosity": {
        "workcells": ["am_cell_01", "am_cell_03"],
        "ttc_median": 16, "reopen_p": 0.05,
        "weekly": [1, 2, 1, 1, 2, 1, 1, 2, 1, 1, 2, 1, 2, 1, 1, 1],   # flat
        "templates": [
            "Subsurface porosity cluster detected in printed channel wall via CT scan.",
            "Lack-of-fusion indication near channel transition radius on layer review.",
            "Isolated pore above acceptance size at wall midspan; MRB disposition pending.",
            "Porosity band at recoater interval boundary flagged by in-process monitoring.",
            "CT review shows gas porosity concentration near overhang support interface.",
        ],
    },
    "fastener_torque": {
        "workcells": ["integration_wc_02", "integration_wc_04"],
        "ttc_median": 6, "reopen_p": 0.03,
        "weekly": [1, 1, 2, 1, 1, 1, 1, 1, 3, 2, 2, 1, 1, 0, 0, 0],   # surfaced ~8 wks ago, being driven down (slope ~ -0.44/wk in the trailing 8)
        "templates": [
            "Torque audit found fasteners below spec on bracket installation at {wc}.",
            "Re-torque required after calibration recall on driver tooling.",
            "Torque value transcription error caught at buyoff review.",
            "Running torque out of family on locking feature; hardware quarantined.",
            "Witness paint slip indicates possible under-torque on panel fastener set.",
        ],
    },
    "surface_finish": {
        "workcells": ["machining_wc_05", "machining_wc_06"],
        "ttc_median": 9, "reopen_p": 0.04,
        "weekly": [1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1],   # flat
        "templates": [
            "Surface roughness Ra above requirement on sealing face; rework approved.",
            "Chatter marks on bore surface traced to tool wear at {wc}.",
            "Finish nonconformance at flange contact band found at final inspection.",
            "Scratch beyond polish-out limit on optical mounting surface.",
            "Machining witness lines exceed finish callout near datum feature.",
        ],
    },
    "weld_undercut": {
        "workcells": ["weld_wc_01", "weld_wc_02"],
        "ttc_median": 14, "reopen_p": 0.06,
        "weekly": [1, 1, 1, 0, 1, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 0],   # flat
        "templates": [
            "Undercut beyond limit at weld joint toe on radiographic review.",
            "Marginal undercut indication; engineering disposition use-as-is with rationale.",
            "Toe profile deviation flagged at visual weld inspection at {wc}.",
            "Localized undercut at repair boundary requires blend and re-inspection.",
            "Weld toe geometry out of profile tolerance on fillet termination.",
        ],
    },
    "harness_chafing": {
        "workcells": ["integration_wc_01", "integration_wc_03"],
        "ttc_median": 13, "reopen_p": 0.11,
        "weekly": [0, 1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1, 0, 1, 0, 1],   # flat
        "templates": [
            "Insulation abrasion found at routing clamp during harness inspection.",
            "Harness contact with bracket edge at routing bend; chafe guard missing.",
            "Clamp spacing deviation from routing drawing on harness run at {wc}.",
            "Chafing witness on convolute at panel pass-through grommet.",
            "Harness strain at connector backshell from routing interference.",
        ],
    },
}

# One-off noise topics — intentionally heterogeneous so HDBSCAN should mark them noise.
NOISE_TOPICS = [
    ("paint_finish", "logistics_wc_01", "Paint thickness above spec on secondary structure panel."),
    ("fod", "integration_wc_05", "FOD found during closeout inspection; lockwire fragment recovered."),
    ("doc_error", "quality_wc_01", "Traveler step signed out of sequence; documentation correction required."),
    ("calibration", "quality_wc_01", "Calibration sticker expired on inspection gauge at point of use."),
    ("packaging", "logistics_wc_01", "Protective packaging damaged in transit; hardware inspection required."),
    ("label", "logistics_wc_02", "Part identification label illegible after cleaning operation."),
    ("storage", "logistics_wc_02", "Shelf-life-controlled material found past expiration in staging area."),
    ("esd", "integration_wc_05", "ESD wrist strap log gap during electronics handling operation."),
    ("tooling", "machining_wc_05", "Fixture locating pin wear beyond limit found at setup verification."),
    ("software", "quality_wc_02", "Test script revision mismatch against released configuration."),
    ("contamination", "am_cell_01", "Cleanliness verification failed particle count at final rinse."),
    ("shipping", "logistics_wc_01", "Shock indicator tripped on inbound crate; receiving inspection hold."),
    ("training", "quality_wc_02", "Operator certification lapsed for critical process step."),
    ("material", "machining_wc_06", "Raw material cert missing heat lot traceability detail."),
    ("plumbing", "integration_wc_02", "B-nut witness mark absent after proof pressure test."),
    ("adhesive", "assembly_wc_09", "Adhesive working life exceeded before bond assembly complete."),
    ("marking", "weld_wc_01", "Permanent marking depth exceeds allowable on thin-wall section."),
    ("environment", "am_cell_03", "Humidity excursion in powder storage; lot quarantined for review."),
]

SEVERITIES = ["minor", "major", "critical"]
SEVERITY_WEIGHTS = [0.62, 0.33, 0.05]


def generate_corpus(seed: int = SEED) -> list[dict]:
    """Deterministic synthetic NCR corpus. Returns records sorted by (opened_at, ncr_key)."""
    rng = random.Random(seed)
    records = []
    for week in range(N_WEEKS):
        week_start = ANCHOR - timedelta(weeks=N_WEEKS - week)
        for family, spec in FAMILIES.items():
            for _ in range(spec["weekly"][week]):
                wc = rng.choice(spec["workcells"])
                template = rng.choice(spec["templates"])
                opened = week_start + timedelta(days=rng.randrange(7))
                ttc = max(1, round(rng.gauss(spec["ttc_median"], spec["ttc_median"] * 0.4)))
                closed = opened + timedelta(days=ttc)
                records.append({
                    "defect_family": family,
                    "workcell": wc,
                    "severity": rng.choices(SEVERITIES, SEVERITY_WEIGHTS)[0],
                    "summary": template.format(wc=wc),
                    "opened_at": opened.isoformat(),
                    "closed_at": closed.isoformat() if closed <= ANCHOR else None,
                    "reopened": rng.random() < spec["reopen_p"],
                })
        # ~1.1 noise records per week: always 1, sometimes 2.
        n_noise = 1 + (1 if rng.random() < 0.15 else 0)
        for _ in range(n_noise):
            topic, wc, summary = rng.choice(NOISE_TOPICS)
            opened = week_start + timedelta(days=rng.randrange(7))
            ttc = max(1, round(rng.gauss(8, 4)))
            closed = opened + timedelta(days=ttc)
            records.append({
                "defect_family": f"noise_{topic}",
                "workcell": wc,
                "severity": rng.choices(SEVERITIES, SEVERITY_WEIGHTS)[0],
                "summary": summary,
                "opened_at": opened.isoformat(),
                "closed_at": closed.isoformat() if closed <= ANCHOR else None,
                "reopened": rng.random() < 0.04,
            })
    records.sort(key=lambda r: (r["opened_at"], r["summary"]))
    for i, r in enumerate(records, start=1):
        r["ncr_key"] = f"ncr_2026_{i:05d}"
    return records


# COMMAND ----------
# Spark write section — only runs inside Databricks (backend CI imports this file locally and only
# calls generate_corpus()).
try:
    _SPARK = spark  # type: ignore[name-defined]  # noqa: F821
except NameError:
    _SPARK = None

if _SPARK is not None:
    TEL = "novendor_1.telemetry"
    corpus = generate_corpus()
    df = _SPARK.createDataFrame(corpus)
    df = df.select("ncr_key", "defect_family", "workcell", "severity", "summary",
                   "opened_at", "closed_at", "reopened")
    df.write.mode("overwrite").option("overwriteSchema", "true").saveAsTable(f"{TEL}.ncr_records")
    n = _SPARK.table(f"{TEL}.ncr_records").count()
    families = sorted({r["defect_family"] for r in corpus if not r["defect_family"].startswith("noise_")})
    result = {
        "table": f"{TEL}.ncr_records", "rows": n, "seed": SEED, "weeks": N_WEEKS,
        "families": families,
        "noise_rows": sum(1 for r in corpus if r["defect_family"].startswith("noise_")),
        "open_rows": sum(1 for r in corpus if r["closed_at"] is None),
    }
    print(json.dumps(result, indent=2))
    dbutils.notebook.exit(json.dumps(result))  # type: ignore[name-defined]  # noqa: F821
