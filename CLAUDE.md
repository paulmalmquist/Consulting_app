# CLAUDE.md — Business Machine Operating Rules

This repo contains:
- repo-b/ (Next.js 14 + TS + Tailwind) — primary UI (Business OS + Demo Lab UI)
- backend/ (FastAPI) — Business OS API under /api/*
- repo-c/ (FastAPI) — Demo Lab API under /v1/*

You are Claude (coding agent). Your job is to make changes safely, keep the app shippable, and keep deployments green.

---

## 0) Non-negotiables

### Always push
- Every meaningful change must be committed and pushed to the remote branch.
- Prefer small commits with clear messages over one massive commit.
- After pushing, provide:
  - branch name
  - commit SHAs
  - a short changelog (what changed + why)

### Always deploy to Vercel (frontend)
- After pushing frontend changes (repo-b), ensure Vercel will build and deploy.
- If Vercel build might fail, proactively fix:
  - TypeScript errors
  - ESLint issues
  - Next.js route/build errors
- If Vercel env vars are required, explicitly list them and where they should be set (Vercel Project Settings → Environment Variables).

### Never leak secrets
- Do not print `.env.local` contents or any API keys in logs, diffs, or messages.
- Treat `.env.local` as sensitive even if tracked. Avoid adding new secrets to git.
- Prefer `.env.example` updates and Vercel env var configuration.

---

## 1) Default workflow (every task)

1) **Repo inventory (2–5 min)**
   - Identify exactly which app(s) are affected: repo-b, backend, repo-c.
   - Confirm the current routing + data flow impacted.

2) **Plan**
   - Write a short checklist of files to modify.
   - Define acceptance criteria and tests.

3) **Implement**
   - Make minimal, targeted changes.
   - Avoid large refactors unless explicitly requested.

4) **Run locally (or simulate)**
   - repo-b: `npm run lint` + `npm run build` (or documented equivalents)
   - backend/repo-c: run type checks / unit tests if present
   - If you cannot run commands, still reason through build constraints and add tests.

5) **Tests**
   - Add/update tests for new behavior.
   - Use existing test stack (Playwright/Vitest/Jest). If missing, propose the smallest addition.

6) **Commit + Push**
   - Commit message format:
     - `feat(lab): ...`
     - `fix(api): ...`
     - `chore: ...`
   - Push branch to origin.

7) **Vercel deployment readiness**
   - Ensure Next build passes.
   - Confirm routes are static/dynamic correctly.
   - Check env var usage doesn’t break production.

8) **Deliver**
   - Provide:
     - summary
     - changed files list
     - how to verify manually
     - tests added and how to run
     - branch + commits

---

## 2) Vercel-specific build rules (repo-b)

- Treat `next build` as the source of truth. If it fails, fix it before considering the task done.
- Keep server/client boundaries correct:
  - No browser-only APIs in server components without guards.
  - No Node-only APIs in client components.
- Avoid runtime-only env vars in the client:
  - Client-side env vars must be prefixed with `NEXT_PUBLIC_`.

---

## 3) API base URL caveat (important)

repo-b contains clients for two backends:
- Business OS: `/api/*` (backend/)
- Demo Lab: `/v1/*` (repo-c/)

A single `NEXT_PUBLIC_API_BASE_URL` cannot target both unless there is a proxy/split.
If touching API calls:
- Prefer same-origin routes for the UI where possible.
- If you must split bases, introduce:
  - `NEXT_PUBLIC_BOS_API_BASE_URL`
  - `NEXT_PUBLIC_LAB_API_BASE_URL`
and refactor clients accordingly with minimal blast radius.

---

## 4) Database / schema rules

- Schema lives in `schema.sql` and `business_os_schema.sql` (seed/extensions).
- If you change DB schema:
  - Update schema files.
  - Update any apply scripts (ex: `repo-b/db/scripts/apply_schema.js` if used).
  - Add a migration note in a `MIGRATIONS.md` section or the PR description.
- Never assume production DB is resettable. Avoid destructive changes.

---

## 5) UI fundamentals (lab + business OS)

- Prefer deterministic navigation:
  - URL should be the source of truth for selected environment/department/capability.
- Always add test IDs for new UX paths:
  - `data-testid="..."` (stable, predictable)
- Accessibility minimums:
  - icon-only buttons must have `aria-label`
  - selected states should use `aria-current="page"` where applicable

---

## 6) Quality bar (don’t ship junk)

### Logging
- No noisy console logs in production UI.
- Server logs should be structured and actionable.

### Error handling
- No silent failures:
  - render an error state
  - or show a toast
  - or return a typed error response

### Performance sanity
- Avoid waterfalls (client fetching that could be server fetched).
- Don’t add heavyweight deps unless necessary.

---

## 7) “Definition of Done” checklist

A task is only done when:
- [ ] change is implemented
- [ ] tests updated/added
- [ ] `lint` and `build` will pass on Vercel
- [ ] changes committed and pushed
- [ ] verification steps documented
- [ ] no secrets exposed

---

## 8) Default commands (adjust if repo differs)

repo-b:
- `npm install`
- `npm run dev`
- `npm run lint`
- `npm run build`
- `npm run test` (if present)

backend:
- `uvicorn app.main:app --reload --port 8000` (or project convention)
- `pytest` (if present)

repo-c:
- `./dev.sh` or `uvicorn ...` (per repo-c docs)

---

## 9) Communication style

- Be concise and specific.
- Use file paths.
- If something is ambiguous, choose the safest path and document assumptions.
- Always propose the smallest viable change that meets the goal.