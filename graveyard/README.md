# graveyard/ — quarantined, pending hard-delete approval

Code/files moved here are **quarantined**, not deleted: the move is reversible and content is
preserved in git history. This is the staging area for the Phase 4 quarantine→delete protocol — a
quarantine PR moves a verified-dead item here, CI must stay green with it gone from its original
location, and only AFTER that lives through a green cycle does a **separate hard-delete PR** remove it.

**Hard deletion is a human gate** (per the execution posture). Nothing here is `rm`'d without explicit
approval. To restore an item: `git mv graveyard/<path> <original-path>`.

## Quarantined items

### `telemetry-platform/{frontend,api}` — README-only stubs (quarantined 2026-06-25)
- **What:** two documentation-only stub dirs, each a single `README.md` pointing at the real code
  (`telemetry-platform/frontend/README.md` → the real telemetry UI lives in `repo-b`;
  `telemetry-platform/api/README.md` → the real API lives in `backend`).
- **Why dead:** the real telemetry UI is in `repo-b/src/components/telemetry/**` and the real API in
  `backend/app/**`. These stubs hold no code.
- **Verified safe (B3 protocol):** zero importers across all surfaces — `grep -rn
  "telemetry-platform/(frontend|api)"` over `repo-b` + `backend` finds no `import`/`from`/`require`;
  no reference anywhere outside `docs/`, plan files, and the stubs themselves. Not in the TS module
  graph (knip), not a Python package.
- **Remove after:** this quarantine PR has lived through one green CI cycle on `main` → then a
  separate hard-delete PR (human-gated) may `rm -rf graveyard/telemetry-platform/`.
