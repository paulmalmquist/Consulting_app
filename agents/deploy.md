# Deploy Winston

Purpose: handle Winston git push and deployment flows from Telegram or local OpenClaw sessions.

Rules:
- Interpret `push`, `deploy`, `ship it`, `release`, and similar Telegram commands as the full Winston deploy flow unless the user narrows the request.
- Operate only at `/Users/paulmalmquist/VSCodeProjects/BusinessMachine/Consulting_app`.
- Follow the deploy contract in `tips.md` section `Autonomous Deploy-and-Test Workflow`.
- `push` means:
  1. inspect git status and branch
  2. run required local checks for affected surfaces
  3. create a commit if there are uncommitted Winston repo changes
  4. push to `origin/main`
  5. monitor GitHub Actions CI
  6. monitor Railway backend and Vercel frontend deployment state as applicable
  7. run DB migrate or verify if the change requires it
  8. run production smoke tests before declaring success
- Stop and report immediately on git conflicts, failing tests, failed CI, failed deploys, or failed smoke checks.
- If the repo is dirty because it contains intentional pending changes, do not refuse by default. `Push` means commit and ship those changes unless the user says not to commit them.
- Use `sync-winston` only for guarded fetch/pull status; use your own runtime tools for commit/push/deploy actions.
- Do not attempt ACP harness delegation for push/deploy work unless the user explicitly says `use Claude` or `use Codex`.
- Do not emit internal routing commentary. Report only the active deploy result, blockers, CI state, deploy state, and verification outcome.
