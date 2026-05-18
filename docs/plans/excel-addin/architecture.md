# Excel Add-in — Architecture

**Last updated:** 2026-05-16  
**Status:** Draft — needs verification

## Frontend (Add-in)

### Source structure
| File | Purpose |
|---|---|
| `excel-addin/src/custom-functions/functions.ts` | Custom Excel functions (=WINSTON(), etc.) |
| `excel-addin/src/taskpane/App.tsx` | Task pane React UI |
| `excel-addin/src/taskpane/index.tsx` | Task pane entry point |
| `excel-addin/src/shared/apiClient.ts` | API client for platform calls |
| `excel-addin/src/shared/auth.ts` | Auth handling |
| `excel-addin/src/shared/cache.ts` | Response cache |
| `excel-addin/src/shared/constants.ts` | Constants (API URL, etc.) |
| `excel-addin/src/shared/errors.ts` | Error handling |
| `excel-addin/src/shared/excelTable.ts` | Excel table utilities |
| `excel-addin/src/shared/storage.ts` | Local storage utilities |
| `excel-addin/src/shared/types.ts` | TypeScript types |
| `excel-addin/src/shared/workbookSettings.ts` | Workbook-level settings |
| `excel-addin/src/shared/writeQueue.ts` | Write queue (batching writes to platform) |

### Key capabilities (verify)
- Custom functions for data retrieval
- Task pane for query UI
- Write queue for structured data writes back to platform
- Auth via platform session

## Backend map

### Routes
- Needs repo verification — identify any dedicated Excel add-in routes
- Likely proxied through `repo-b` API routes

### Services
| File | Purpose |
|---|---|
| `backend/app/services/lab_excel.py` | Excel integration service |

### Schemas
| File | Purpose |
|---|---|
| `backend/app/schemas/lab_excel.py` | Excel-specific schemas |

### Frontend API routes (repo-b side)
- Needs repo verification — check `repo-b/src/app/api/` for excel-related routes

## Data map

- Write queue batches writes to platform tables (Supabase)
- Read operations pull from lab/environment API endpoints
- Needs repo verification for specific tables involved in Excel writes

## Auth map

- `excel-addin/src/shared/auth.ts` — handles auth
- Likely uses same session/JWT as the web platform
- Needs repo verification for how Office add-in auth is scoped

## Test map

- Needs repo verification — check `excel-addin/` for test files
- Office add-in testing is typically done with Office Add-in Testing tools or manual in Excel

## Needs verification

- [ ] How the add-in authenticates (JWT session vs. dedicated token)
- [ ] Which custom functions exist in functions.ts
- [ ] What the write queue writes and to which tables
- [ ] API base URL in constants.ts (local vs. production)
- [ ] Whether there are dedicated backend routes for Excel or if it uses generic lab routes
