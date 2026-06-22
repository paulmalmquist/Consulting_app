# History Rhymes — Weekly Research Brief Auto-Ingest Runbook

**Owner:** History Rhymes execution layer
**Script:** `scripts/hr_research_ingest.py`
**Route it feeds:** `POST /api/hr/v1/research/briefs` (single orchestration owner)
**Status:** Active. The ingest script is built and tested; the external
scheduler wiring is an ops action (this runbook).

This runbook covers the weekly path: a research brief is produced → its markdown
lands on disk → the script submits it to the route → candidates appear in the
planning UI without manual paste.

---

## 1. How the weekly research brief is generated

There is **no in-repo automated generator** for the 7-section research brief.
It is produced by the **weekly History Rhymes research prompt** (LLM/agent
session or human analyst) following the rotating-pillar cadence:

| Week (ISO-week rotation) | Pillar |
|---|---|
| Week 1 | Novel Signals & Data Sources |
| Week 2 | Methodology & Model Improvements |
| Week 3 | Competitive & Structural Intelligence |
| Week 4 | Adversarial & Regime-Change Research |

Do not confuse this with `scripts/hr_weekly_brief.py` — that persists the
**execution-layer regime brief** (`hr_weekly_briefs`), a different artifact.

The canonical structural template for the 7-section research brief is
`docs/historyrhymes/briefs/SAMPLE_7section_research_brief.md`. The parser
contract is the 7 sections (Executive Summary, Thematic Findings, Enhancement
Path, Adversarial Stress Test, Signal Pulse, Open Questions, Honeypot Alert).
Briefs that do not match degrade **fail-closed** (persisted, warnings, zero
candidates) — they are never "recovered."

## 2. Where the markdown lands

Save the generated brief as a markdown file under:

```
docs/historyrhymes/briefs/HR_Weekly_Brief_<YYYY-MM-DD>.md
```

The `YYYY-MM-DD` in the filename is auto-detected as `brief_date`. If absent,
the script falls back to today (UTC). The directory already exists.

## 3. Exact ingest command

```bash
python scripts/hr_research_ingest.py \
  --input docs/historyrhymes/briefs/HR_Weekly_Brief_$(date +%F).md \
  --base-url https://<deployed-backend-base-url>
```

Metadata is derived deterministically (no AI): `brief_date` from filename/today,
`week_type` from the ISO-week 4-rotation, `pillar_name` from the rotation,
`title` from the first `# ` heading, `source_filename` from the file basename.
Override any of these with `--brief-date`, `--week-type`, `--pillar`, `--title`.

Dry-run (no network, safe for validation / scheduler smoke):

```bash
python scripts/hr_research_ingest.py --input <brief.md> --dry-run
```

## 4. Required environment variables

| Variable | Where | Required | Default | Purpose |
|---|---|---|---|---|
| `HR_RESEARCH_API_BASE` | script env | No | `http://127.0.0.1:8000` | Backend base URL if `--base-url` is not passed |

The script itself needs **only network reachability** to the backend. The
**target backend** must be running with its own DB config (`DATABASE_URL`,
etc.) — for production point at the deployed FastAPI base (Railway service
`authentic-sparkle`, fronting `novendor.ai`). The script does not touch the DB
directly; the route owns all persistence.

## 5. Expected success JSON (stdout, exit 0)

```json
{
  "brief_id": "2f1c…",
  "brief_date": "2026-05-18",
  "week_type": "Week 1",
  "pillar_name": "Novel Signals & Data Sources",
  "candidate_count": 3,
  "degraded": false,
  "confidence": 1.0,
  "warnings": [],
  "posted_to": "https://<base>/api/hr/v1/research/briefs"
}
```

## 6. Expected degraded-but-successful JSON (stdout, exit 0)

A weak/malformed brief still **persists** with warnings and zero candidates.
This is a healthy fail-closed outcome, not a failure — exit code is **0**.

```json
{
  "brief_id": "9ab3…",
  "brief_date": "2026-05-18",
  "week_type": "Week 1",
  "pillar_name": "Novel Signals & Data Sources",
  "candidate_count": 0,
  "degraded": true,
  "confidence": 0.0,
  "warnings": [
    "No Enhancement Path section found; no enhancement candidates extracted.",
    "Only 1/7 canonical sections recognized (need >= 4). Treating as degraded; structure not recovered."
  ],
  "posted_to": "https://<base>/api/hr/v1/research/briefs"
}
```

A scheduler should **not** alarm on `degraded: true` with exit 0. Alarm only on
non-zero exit.

## 7. Failure exit codes

| Exit | Meaning | Example stderr |
|---|---|---|
| `0` | Brief ingested (includes degraded — see §6) | — |
| `1` | Hard failure: network error, non-2xx response, or unreadable input | `{"error": "https://…/api/hr/v1/research/briefs returned HTTP 422: …"}` |

A non-2xx from the route is a genuine submission failure (bad payload, backend
down). A *degraded extraction* is **not** a non-2xx — the route returns HTTP 200
for it, so it never reaches exit 1.

## 8. Manual recovery steps

1. **Inspect the payload offline:** rerun with `--dry-run`. Confirm
   `brief_date`, `week_type`, `pillar_name`, `title` are correct.
2. **Degraded (exit 0, `degraded: true`):** the brief persisted but did not
   match the 7-section contract. Diff the brief against
   `docs/historyrhymes/briefs/SAMPLE_7section_research_brief.md`, fix the
   headings/Enhancement Path structure, then re-run the ingest command.
3. **Exit 1 — non-2xx:** check backend reachability and `--base-url` /
   `HR_RESEARCH_API_BASE`. A `422` is almost always payload validation (empty
   markdown, malformed `--brief-date`). Read the `error` body; tail backend
   logs (`railway logs --service authentic-sparkle`).
4. **Exit 1 — input not found:** verify the brief file path / that the
   generator actually wrote the file.
5. **Re-run is safe but NON-idempotent (important):** the route has no dedupe
   on `brief_date` — each successful submit **appends** a new brief row plus a
   fresh candidate set. `…/briefs/latest` reflects the newest submission, so a
   corrected re-run "wins" for the UI, but stale earlier rows remain. For a
   clean weekly state, submit once per brief; if you re-ran several times while
   fixing structure, the latest row is authoritative and the extras are inert
   history.

## 9. Post-run verification

```bash
# Latest research brief (should show the new brief_id + candidate_count)
curl -s https://<base>/api/hr/v1/research/briefs/latest | jq

# Enhancement candidates (status defaults to all)
curl -s https://<base>/api/hr/v1/research/enhancement-candidates | jq '.count'

# One candidate's generated planning markdown
curl -s https://<base>/api/hr/v1/research/enhancement-candidates/<id>/planning-markdown | jq -r '.planning_markdown'
```

UI check: open `/lab/env/<envId>/historyrhymes/planning` — the latest brief
panel and candidate cards should reflect the new submission; degraded briefs
show the amber warnings banner with zero candidates.

---

## Scheduler wiring (external — no canonical in-repo scheduler)

This repo has **no canonical scheduler config that owns HR script execution**.
The GitHub Actions workflows under `.github/workflows/` are CI/eval-specific
(e.g. `winston-eval-weekly.yml`) and must not be overloaded with this job. The
History Rhymes daily/weekly jobs run via the **external OpenClaw / orchestration
scheduler**; `docs/LATEST.md` is the human-readable registry (the
`hr-research-ingest` row is already present there).

Wire the job in whichever external scheduler owns the weekly cadence,
**immediately after the weekly research brief is produced**. Ready-to-use forms:

**cron (host / Railway cron service):**
```
# Sunday 05:00 UTC, after the weekly research brief is generated
0 5 * * 0  cd /app && HR_RESEARCH_API_BASE=https://<base> \
  python scripts/hr_research_ingest.py \
  --input docs/historyrhymes/briefs/HR_Weekly_Brief_$(date +\%F).md \
  || echo "hr-research-ingest failed (exit $?)"
```

**GitHub Actions (if/when this becomes a GH-owned job — requires a backend
reachable from runners + a secret for the base URL; create the workflow only
when those exist):**
```yaml
on:
  schedule:
    - cron: "0 5 * * 0"
  workflow_dispatch:
jobs:
  ingest:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with: { python-version: "3.x" }
      - run: |
          python scripts/hr_research_ingest.py \
            --input "docs/historyrhymes/briefs/HR_Weekly_Brief_$(date +%F).md" \
            --base-url "${{ secrets.HR_RESEARCH_API_BASE }}"
```

**Manual (until scheduled):** run the §3 command after each weekly brief.

Whatever scheduler is used: treat exit 0 (including `degraded: true`) as
success; alarm only on non-zero exit; keep the stdout JSON in run logs for
audit.
