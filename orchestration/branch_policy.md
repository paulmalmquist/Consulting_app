# Branch Policy

- Protected branches: `main`, `master`, `production`.
- Session branch: `feature/{session_id}/{intent}`.
- Session creation auto-provisions branch and worktree.
- Mutations on protected branches are blocked.
- Git hooks enforce commit/push guardrails.
