# Repository Audit Notes

This file captures a point-in-time engineering audit run for the Business Machine monorepo.

## Commands executed

- `find . -maxdepth 2 -mindepth 1 | sort`
- `sed -n '1,220p' README.md`
- `sed -n '1,220p' scripts/dev_all.sh`
- `sed -n '1,220p' dev.sh`
- `timeout 180 ./dev.sh`
- `backend/.venv/bin/python -m pytest tests -q`
- `repo-c/.venv/bin/python -m pytest tests -q`
- `repo-b npm run lint`
- `PORT=3010 npm run dev` + curl health checks
- `rg --line-number --ignore-case "stub|mock|fake|placeholder|TODO|hardcode|sample|demo|lorem" backend repo-b repo-c`
- `vercel --version`

## High-level outcomes

- Frontend dev server starts and serves routes.
- Backend service exits without `DATABASE_URL`.
- Demo Lab backend fails import/runtime due missing `python-multipart` dependency.
- Backend test suite passes in isolation.
- Frontend lint command is interactive (ESLint not initialized), so CI-friendly lint path is not currently available.

## Follow-up

See the assistant response in chat for a detailed, file-cited assessment and prioritized plan.
