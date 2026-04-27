# Pitch Forge — Hallboys Build Receipt

**Date:** 2026-04-26
**Status:** Shipped — ready for demo
**Triggered by:** Hallboys follow-up material brief (Sarat, CFO/CIO, Hall Boys Holdings)

---

## What was built

A bounded, scored proposal generation pipeline that takes client research and produces client-ready proposal bullets through a controlled AI loop. Not a dashboard. Not a report viewer. An operating surface that forces every use case through a structured critique before anything goes to the client.

**4 backend files:**
- `backend/app/services/pitch_forge_prompts.py` — 6 deterministic prompt templates with hard anti-filler rules baked in
- `backend/app/services/pitch_forge.py` — synchronous DB service for all pf_* tables
- `backend/app/services/pitch_forge_ai.py` — AI orchestration layer wrapping prompts + validation
- `backend/app/routes/pitch_forge.py` — FastAPI routes wired into main.py

**1 schema migration:**
- `repo-b/db/schema/10000_pitch_forge_core.sql` — 7 tables with RLS, env_id scoping, COMMENT ON TABLE

**1 frontend page:**
- `repo-b/src/app/lab/env/[envId]/pitch-forge/page.tsx` — 4-tab operating surface (Research Board, Pitch Builder, Red Team Panel, Final Output)

**1 seed script:**
- `scripts/seed_hallboys_pitch.py` — seeds Hallboys project with 5 sources, 20 claims, 5 use cases (each with a real flaw)

**1 test file:**
- `backend/tests/test_pitch_forge_constraints.py` — 20 tests covering all hard constraints

---

## What changed in main.py

Added 2 lines to `backend/app/main.py`:
```python
from app.routes import pitch_forge as pitch_forge_routes
app.include_router(pitch_forge_routes.router)
```

Routes register at `/api/pitch-forge/v1/*`.

---

## Database tables created

| Table | Purpose |
|---|---|
| `pf_project` | Top-level pitch project. One per client. Tracks iteration count (max 3), status, score. |
| `pf_source` | Research inputs with provenance. Source type, label, content, confidence. |
| `pf_claim` | Individual factual claims. Category: fact/constraint/inference/gap/risk. Gaps have `is_available=false`. |
| `pf_iteration` | Versioned draft snapshots. UNIQUE(project_id, iteration_num). Max 3 per project. |
| `pf_use_case` | Candidate use cases within an iteration. All 8 required fields + kill tracking. |
| `pf_red_team_review` | Structured critique per iteration. Score breakdown, kill list, fixable/fatal/missing distinction. |
| `pf_final_output` | Client-ready output. Only created when project status = passed (score ≥ 80). |

All tables: RLS enabled, `env_id TEXT NOT NULL`, `business_id UUID NOT NULL`.

---

## API routes

```
GET  /api/pitch-forge/v1/context
GET  /api/pitch-forge/v1/projects
POST /api/pitch-forge/v1/projects
GET  /api/pitch-forge/v1/projects/{id}/summary
GET  /api/pitch-forge/v1/projects/{id}/sources
POST /api/pitch-forge/v1/projects/{id}/sources
GET  /api/pitch-forge/v1/projects/{id}/claims
POST /api/pitch-forge/v1/projects/{id}/claims
POST /api/pitch-forge/v1/projects/{id}/synthesize-research
POST /api/pitch-forge/v1/projects/{id}/generate
POST /api/pitch-forge/v1/projects/{id}/iterations/{iter_id}/red-team
POST /api/pitch-forge/v1/projects/{id}/resolve-gaps
POST /api/pitch-forge/v1/projects/{id}/final-output
GET  /api/pitch-forge/v1/projects/{id}/final-output
```

---

## How to run the migration

```bash
# Apply schema (from repo root)
node repo-b/db/schema/apply.js 10000

# Or run SQL directly via Supabase MCP
# execute_sql with contents of repo-b/db/schema/10000_pitch_forge_core.sql
```

---

## How to seed the Hallboys demo project

```bash
# Get the Hall Boys env_id and business_id from your local Supabase instance
# Then run:
python scripts/seed_hallboys_pitch.py \
  --env-id <hall-boys-env-id> \
  --business-id <hall-boys-business-id>
```

The seed creates:
- 1 project: "Hall Boys Holdings"
- 5 sources with provenance
- 20 claims (5 constraints, 9 facts, 2 inferences, 3 gaps, 1 risk)
- 1 iteration (status=draft) with 5 use cases

Each use case has an intentional flaw that the red team will flag.

---

## How to test

```bash
# Run constraint tests from repo root
cd backend && pytest tests/test_pitch_forge_constraints.py -v

# Expected: 20 tests, all pass
# Tests cover: max iterations, banned phrases, economic value validation,
# constraint injection, gap surfacing, kill validation, score thresholds
```

---

## Demo path (3–5 minutes)

**Setup:** Run seed script, open `/lab/env/<hallboys-env-id>/pitch-forge`

**Step 1 — Open project (30 sec)**
- Click "Hall Boys Holdings" in the project list
- Show project status: `red_team`, iteration 1/3, no score yet

**Step 2 — Research Board (60 sec)**
- Switch to Research Board tab
- Show 5 constraints (red): "No custom software", "Single AP clerk not eliminated", etc.
- Show 9 facts (green): Acumatica, 300 employees, QEM nationwide logistics, etc.
- Show 3 data gaps (gray): "Not available: AP invoice volume per week — needed to size opportunity"
- Point out: every claim has a source. Missing data is not hidden.

**Step 3 — Pitch Builder (60 sec)**
- Switch to Pitch Builder tab
- Walk through 2–3 of the 5 seeded use cases
- Show: workflow name, current pain, intervention, who uses it, change tomorrow, impact estimate
- Point out: each use case has an intentional flaw (visible in the `flaw` field if exposed, or will be found by red team)

**Step 4 — Run Red Team (60 sec)**
- Click "Run Red Team" button
- Wait for AI critique to complete (~15 sec)
- Red Team Panel auto-opens
- Show: score (expected ~60–70), score breakdown chart
- Show kill list: 2–3 use cases killed with specific criterion + reason
  - Example: "QEM Scheduling — fake_precision — dispatch volume is unconfirmed, estimated impact cannot be defended"
  - Example: "Claude Governance Library — no_economic_delta — 50% efficiency improvement has no data backing"
- Show fixable issues: things that can be fixed with specific research
- Show verdict: `rebuild` or `research_refill`

**Step 5 — Generate Rebuild (60 sec)**
- Click "Generate Proposal" (now iteration 2)
- Show Pitch Builder — iteration 2 tab
- Compare: killed use cases are gone, surviving ones are sharper, impact estimates are more specific
- Optional: run red team again on iteration 2, show score improve to 75–85+

**Step 6 — Export Final Output (30 sec)**
- If score ≥ 80, click "Export Final Output"
- Final Output tab shows bullet-email formatted text
- Click "Copy to clipboard"
- Paste into email window to demonstrate paste-readiness
- Point out: no "streamline", no "unlock", no white paper prose — just specific, client-named bullets

**What the demo proves:**
- The system produces a sharper, more client-specific proposal than a normal AI chat session
- Every kill is explainable and tied to a specific, named criterion
- Missing data is surfaced honestly, not papered over
- The output can be handed directly to Sarat without editing

---

## What is not yet built

- `synthesize-research` frontend trigger (currently API-only — call via curl or add a button)
- `resolve-gaps` frontend trigger (same — API-only)
- Diff view between iteration 1 and iteration 2 raw proposals (backend field exists, frontend not wired)
- Multi-project comparison view
- Export to `.docx` or deck format (uses `bullet_email` only)

These are follow-on features, not blockers for the demo.

---

## Verification checklist

- [ ] Schema migration applied without errors
- [ ] `python -m pytest backend/tests/test_pitch_forge_constraints.py` — all 20 tests pass
- [ ] Seed script runs without errors
- [ ] `/api/pitch-forge/v1/projects?env_id=<id>` returns the seeded Hallboys project
- [ ] `/api/pitch-forge/v1/projects/<id>/summary` returns sources, claims, iterations
- [ ] Frontend page loads at `/lab/env/<id>/pitch-forge`
- [ ] "Run Red Team" button triggers AI critique and renders results
- [ ] Killed use cases appear with red badge and specific kill reason
- [ ] Score breakdown renders correctly for each dimension
- [ ] Final output export returns text with no banned phrases
