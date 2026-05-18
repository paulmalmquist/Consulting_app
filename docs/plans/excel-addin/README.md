# Excel Add-in Integration

**Status:** Draft  
**Last updated:** 2026-05-16

## Purpose

The Excel add-in provides Office integration for querying and writing controlled data from Excel. It allows users to query Winston AI, pull live data into spreadsheets, and write structured data back to the platform — bridging Excel-native workflows with the Novendor platform.

## Plan files

- [architecture.md](architecture.md) — Implementation map
- [roadmap.md](roadmap.md) — Phased delivery plan
- [backlog.md](backlog.md) — Active bugs and open work
- [qa-checklist.md](qa-checklist.md) — Verification steps
- [next-session.md](next-session.md) — Copy-paste-ready prompt for next session
- [release-readiness.md](release-readiness.md) — Release gate status

## Key locations

- `excel-addin/` — TypeScript add-in source
- `excel-addin/src/custom-functions/functions.ts` — Custom Excel functions
- `excel-addin/src/shared/` — Shared utilities (apiClient, auth, cache, storage, types, writeQueue)
- `excel-addin/src/taskpane/` — Task pane UI (App.tsx)
- `backend/app/schemas/lab_excel.py` — Excel-specific backend schemas
- `backend/app/services/lab_excel.py` — Excel backend service

## First recommended next session

Read `next-session.md`. Start by verifying the add-in loads in Excel and can authenticate against the platform API.
