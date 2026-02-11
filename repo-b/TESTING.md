# Testing

## Install deps

```bash
cd repo-b
npm install
npx playwright install chromium webkit
```

## Run unit tests (registry)

```bash
cd repo-b
npm run test:unit
```

## Run Lab department routing + selection e2e

```bash
cd repo-b
npm run test:e2e -- --project=chromium --workers=1 tests/lab-dept-routing.spec.ts tests/lab-environments-navigation.spec.ts tests/env-ux-crm.spec.ts
npm run test:e2e -- --project=webkit --workers=1 tests/lab-dept-routing.spec.ts tests/lab-environments-navigation.spec.ts tests/env-ux-crm.spec.ts
```

## Run accounting subsystem e2e

```bash
cd repo-b
npm run test:e2e -- --project=chromium --workers=1 tests/accounting-subsystem.spec.ts
npm run test:e2e -- --project=webkit --workers=1 tests/accounting-subsystem.spec.ts
```

## Run smoke e2e

```bash
cd repo-b
npm run test:e2e -- --project=chromium --workers=1 tests/smoke.spec.ts
```
