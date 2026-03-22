# Business Machine Excel Add-in

Production-oriented Excel Add-in for Business Machine / Novendor:
- Task pane for auth, environment binding, schema mapping, sync, and diagnostics.
- Custom functions namespace `BM.*` for pull/query/metric/push workflows.
- Guarded write model with queue + replay.

## Project Layout

- `manifest.xml`: Office Add-in manifest (task pane + custom functions).
- `custom-functions.json`: metadata for `BM.*` formulas.
- `src/custom-functions/functions.ts`: formula runtime.
- `src/taskpane/App.tsx`: task pane UX.
- `src/shared/*`: API client, storage, queue, workbook settings.

## Local Development

1. Install dependencies:

```bash
cd excel-addin
npm install
```

2. Install and trust local HTTPS certificates (required by Office Add-ins):

```bash
npx office-addin-dev-certs install
```

3. Start add-in dev assets:

```bash
npm run dev-server
```

4. Run `repo-c` backend API in another terminal:

```bash
cd ../repo-c
source .venv/bin/activate
uvicorn app.main:app --reload --port 8000
```

5. In task pane, set **Base API URL** to your backend (example: `http://localhost:8000`).

## Sideload in Excel Desktop (Mac)

1. Build or run dev server (`npm run dev-server`).
2. Open Excel (desktop app).
3. Go to `Insert` > `Add-ins` > `My Add-ins`.
4. Choose `Upload My Add-in`.
5. Select `excel-addin/manifest.xml`.
6. Open the add-in from the Home ribbon group: **Business Machine**.

If the add-in fails to load, run:

```bash
npm run validate
```

## Formula Catalog

- `=BM.ENV()`
- `=BM.ENV_NAME()`
- `=BM.PULL(entity, field, keyField, keyValue, [envId], [optionsJson])`
- `=BM.LOOKUP(entity, returnField, whereField, whereValue, [envId])`
- `=BM.QUERY(entity, [filterJson], [selectJson], [envId], [limit])`
- `=BM.METRIC(metricName, [paramsJson], [envId])`
- `=BM.PIPELINE_STAGE([envId])`
- `=BM.PUSH(entity, keyField, keyValue, field, value, [envId], [mode])`
- `=BM.UPSERT(entity, rowJson, [keyFieldsJson], [envId])`

## Write Safety Model

- Writes are blocked until **Enable Write Mode** is turned on in task pane.
- Formula writes default to queued mode.
- Queue replay is executed from **Sync Now**.
- Token is stored in `OfficeRuntime.storage`, never in worksheet cells.

## Test and Smoke Commands

```bash
npm run test
npm run build
npm run validate
npm run smoke
```

## Troubleshooting

- **Certificate errors**: run `npx office-addin-dev-certs install` again and restart Excel.
- **CORS failures**: ensure `repo-c/.env` includes `ALLOWED_ORIGINS` with `https://localhost:3007`.
- **Auth failures (`#BM_AUTH!`)**: check `EXCEL_API_KEY` server value and the task pane API key.
- **Write disabled (`WRITE_DISABLED`)**: enable write mode in task pane.
- **Network formula errors (`#BM_NETWORK!`)**: verify backend URL and API availability from task pane health check.
