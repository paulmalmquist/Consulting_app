# Reusable Winston Proof-System Backlog

The HappyCo package exposed repeatable patterns that should become shared
Winston infrastructure before the next employer/client proof package.

## 1. Fixture-Backed Demo Package Contract

Owning surface: `backend/`

Create a shared convention for demo fixtures:

- compact seed JSON
- deterministic materializer service
- top-level metadata: `demo_mode`, `data_source`, `fixture_version`, `caveat`
- generated evidence rows with source IDs
- tests for counts, deterministic output, and evidence validity

Risk: low. This is mostly conventions and test helpers.

## 2. Local ML Artifact Reader

Owning surface: `backend/`

Extract a small helper that reads ignored local ML artifacts and fails soft:

- required artifact list
- `ml_status: "not_available"` when missing
- model metrics / feature importance / registry record parsing
- property/entity filtering

Risk: low-medium. Needs clear boundaries so production endpoints do not depend
on ignored local files.

## 3. Gated Proof Page Utility

Owning surface: `repo-b/`

Create a route-scoped invite helper:

- env-var invite code
- non-production fallback only when explicitly enabled
- HTTP-only cookie scoped to the package route
- generic locked state and tailored unlocked state

Risk: medium. Auth hardening must be explicit before using this for anything
more sensitive than demo packages.

## 4. Artifact Builder Receipts

Owning surface: `scripts/`, `artifacts/`

Standardize local artifact builders:

- workbook builder
- deck builder
- architecture diagram writer
- output manifest
- validation receipt JSON
- generated artifact index for runbooks

Risk: low. Keep outputs ignored unless a safe download handler is added.

## 5. Outlook Params Template Library

Owning surface: `docs/runbooks/`, local `skills/`

Create reusable templates for:

- mailbox search
- read-only receipt check
- draft-only follow-up
- explicit send override checklist

Risk: medium-high because mailbox data is sensitive. Templates must never include
real email text, private names, or send-enabled tracked params.

## 6. Proof Package QA Command

Owning surface: `scripts/`

Create one command that runs the standard proof package checks:

- focused backend tests
- frontend typecheck
- artifact regeneration
- JSON validation
- local route smoke
- screenshot capture when Playwright is available

Risk: low-medium. Must keep env/secrets optional and fail with clear messages.
