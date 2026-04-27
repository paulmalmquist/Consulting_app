---
name: clean-tree
description: Cleans the working tree — stages and commits file reorganizations, updates .gitignore for any untracked noise, and deploys what needs deploying (Vercel frontend, Railway backend). Run after any root folder cleanup, file move session, or before a deploy when the tree is dirty with unrelated artifacts. Triggers on "clean the tree", "clean up and deploy", "commit and deploy", "file the tree", "tidy up before deploy".
---

# Clean Tree

End-to-end working tree hygiene: audit untracked files, update `.gitignore` for noise that should never commit, stage real changes, commit, then deploy.

## When to Run

- After any file-move or root-cleanup session
- Before a deploy when `git status` has unrelated `??` noise
- When Paul says "clean the tree", "tidy up and deploy", "commit and push this"
- After pitch-forge, audit runs, or any script that drops output files at root

## Phase 1 — Audit Untracked Files

Run `git status --short` and classify every `??` entry:

| Category | Examples | Action |
|---|---|---|
| Generated outputs | `deal-opportunities-*.md`, `audit/verification_run_*`, `*.log` | Add to `.gitignore` |
| Binary assets that shouldn't commit | `*.pptx`, `*.pdf`, `*.png` at root | Add to `.gitignore` or move to `docs/assets/` |
| Scratch / temp files | `managed_agent_test.txt`, `*token*.txt`, `~$*` | Add to `.gitignore` or delete |
| Real content that belongs in the repo | New skill files, schema files, source code, docs | Stage and commit |
| Misplaced files | Loose `.md` files at root that belong in `docs/`, `demo_docs/`, `skills/` | Move to correct folder, then stage |

**Decision rule:** if a file would confuse a future agent reading the repo, either move it or ignore it. Never commit noise.

## Phase 2 — Update .gitignore

- Add patterns for any newly identified noise categories
- Keep patterns as general as possible (`deal-opportunities-*.md` not a specific filename)
- Binary blobs (`*.pptx`, `*.xlsx`, large `*.png`) belong in `.gitignore` unless they are versioned design deliverables
- Add new ignored paths under the nearest semantic comment block in `.gitignore`
- Verify with `git check-ignore -v <file>` before assuming a pattern works

## Phase 3 — Stage and Commit Real Changes

```bash
git add <specific files only — never git add -A blindly>
git status   # confirm staged set looks right
git commit -m "chore: clean working tree — move files, update .gitignore"
```

Commit message conventions:
- `chore: clean working tree` for pure file-move / gitignore work
- `fix(lint): remove unused import` for lint-only fixes
- `chore: update .gitignore` if only the ignore file changed

## Phase 4 — Fix Any Blocking CI Issues First

Before deploying, check the latest CI run:

```bash
gh run list --limit 5
gh run view <run-id> --log-failed
```

Common fast fixes:
- **F401 unused import (ruff):** remove the import, commit, push
- **Type errors:** fix the offending line, commit, push
- **Test failures:** check `docs/ops-reports/regression/` for context before touching test code

Only proceed to deploy once CI is green or the fix is committed.

## Phase 5 — Deploy

### Frontend (Vercel / repo-b)
```bash
cd repo-b
vercel deploy --prod
```
Or push to main and let Vercel auto-deploy. Use `vercel ls` to confirm.

### Backend (Railway)
```bash
cd backend
railway up --service authentic-sparkle
railway logs --tail
```

### Both at once (most common)
Push main — Vercel picks it up automatically. Then:
```bash
cd backend && railway up --service authentic-sparkle
```

## Phase 6 — Verify

After deploy, check that things landed:
- `vercel ls` → confirm latest deployment is READY
- `railway logs --tail` → no startup errors
- If anything UI-facing changed, run `skills/winston-post-deploy-verify/SKILL.md`

## Guardrails

- Never `git add -A` — always add specific files. Secrets and generated outputs end up committed that way.
- Never `--no-verify` on commits — fix the hook failure instead.
- If `.gitignore` changes cause previously-tracked files to now be ignored, you must `git rm --cached <file>` them first.
- Check `git diff --cached` before committing to confirm the staged diff is clean.
- Do not deploy if there are uncommitted changes to `backend/` or `repo-b/` that haven't been reviewed.
