# graveyard/ — quarantined, pending hard-delete approval

Code/files moved here are **quarantined**, not deleted: the move is reversible and content is
preserved in git history. This is the staging area for the Phase 4 quarantine→delete protocol — a
quarantine PR moves a verified-dead item here, CI must stay green with it gone from its original
location, and only AFTER that lives through a green cycle does a **separate hard-delete PR** remove it.

**Hard deletion is a human gate** (per the execution posture). Nothing here is `rm`'d without explicit
approval. To restore an item: `git mv graveyard/<path> <original-path>`.

## Currently quarantined

None.

## Hard-deleted (history)

### `telemetry-platform/{frontend,api}` — README-only stubs (deleted 2026-06-25)
- **What:** two documentation-only stub dirs, each a single `README.md` pointing at the real code
  (telemetry UI in `repo-b`, API in `backend`). They held no code.
- **Verified safe (B3 protocol):** zero importers across all surfaces; no reference anywhere outside
  `docs/`, plan files, and the stubs themselves; not in the TS module graph (knip), not a Python
  package. Re-confirmed empty at delete time.
- **Lifecycle:** quarantined (`git mv` → here) in PR #391 (green on `main`), then hard-deleted (human-
  gated approval) after a green CI cycle. Recoverable from git history if ever needed.
