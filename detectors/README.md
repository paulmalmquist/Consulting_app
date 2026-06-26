# Dead-code / dependency detectors (REPORT-ONLY)

Baseline inventory for the later quarantine→delete cleanup phase (Phase 4). These detectors are
**report-only**: they do not gate CI, nothing is deleted on their say-so, and a finding is a
*candidate* for review — not a confirmed removal. Many findings are false positives (App Router
entrypoints, dynamic imports, optional/try-except imports, intentional public-API aliases). Confirm
across **all** surfaces before quarantining anything (see the safe-deletion protocol in the plan).

`ruff` stays the in-file Python linter (already in CI, unchanged).

## Tools + commands

| Tool | Scope | Config | Command |
|---|---|---|---|
| **knip** | TS / Next.js (repo-b) | `repo-b/knip.json` | `cd repo-b && npx knip@5 --no-progress` |
| **vulture** | Python (backend) | `--min-confidence 80` (CLI) | `python -m vulture backend/app --min-confidence 80` |
| **deptry** | Python deps (backend) | `--requirements-files requirements.txt` | `cd backend && python -m deptry . --requirements-files requirements.txt` |

Baselines captured 2026-06-25: `baseline-knip.txt`, `baseline-vulture.txt`, `baseline-deptry.txt`.

## Baseline summary

- **knip unused-deps are FP-prone — verified 2026-06-25 (2 of 3 were false positives):**
  `@tanstack/react-virtual` = genuinely unused (0 refs) → removed. `nodemailer` = **actively imported**
  in `src/lib/marketing/mailer.ts` (knip missed the server-lib chain) → KEPT. `iconoir-react` = no
  import but a design-intent comment + the CLAUDE.md icon system → KEPT (conservative). Always grep
  before removing a knip-flagged dep.
- **knip:** 169 unused files · 427 unused exports · 41 unused exported types · 24 duplicate exports ·
  3 unused deps · 1 unused devDep · 1 unlisted · 1 unresolved import. Expect heavy false positives:
  the Next.js App Router pages are entrypoints, many components are dynamically/string-referenced, and
  the telemetry primitives intentionally export aliases (`Panel`/`TelemetryPanel`, etc.). Treat the
  **duplicate exports** and **unused deps** as the highest-signal starting points.
- **vulture (≥80% confidence):** ~10 findings — small + high-signal (genuine unused vars/imports,
  one unreachable-after-return). The likeliest real cleanups.
- **deptry:** 36 issues. Mostly **false positives**: `DEP002` flags `pytest`/`ruff`/`respx`/
  `python-multipart`/`pgvector`/`redis` (used via CLI / runtime / FastAPI form-parsing, not a plain
  `import`); `DEP001` flags optional-feature imports guarded by `try/except` (`twilio`, `sendgrid`,
  `pdf2image`, `faster_whisper`, `docx`, `proto_gen`). The genuine candidates are the **DEP003
  transitive** imports (`websockets`, `requests`, `anyio`) — pin them explicitly — and any DEP002 that
  is truly unreferenced after review.

## Rules

- Do NOT delete from these reports directly. They feed the Phase 4 quarantine→delete pairs.
- Do NOT flip these to fail-on-findings until an area is converged (Phase 7 spotless gate).
- Re-run after any removal — deletions expose newly-unused exports; iterate to convergence.
