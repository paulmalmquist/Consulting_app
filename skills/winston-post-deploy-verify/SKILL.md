---
name: winston-post-deploy-verify
description: Verify that a merged Winston change is live on novendor.ai or the production backend and that the scoped user flow remains healthy. Use after deploys, merges, "verify deploy", "check if the fix worked", or production smoke requests.
---

# Winston Post-Deploy Verification

1. Identify the merged `main` commit and intended production targets.
2. Confirm the frontend Vercel deployment or backend Railway deployment
   corresponds to that commit.
3. Select the narrowest smoke flow that proves the changed behavior.
4. Use a scoped test/reviewer account when one exists. Never print credentials;
   obtain them from the approved secret store.
5. Capture page/API status, visible behavior, console/runtime errors, and the
   deployed commit.
6. Report PASS, PARTIAL, or FAIL. A deployment that is live but functionally
   broken is not successful.

Default frontend: `https://novendor.ai`.

Write a receipt under `docs/ops-reports/deploy/` only when the task requires a
durable artifact. Include commit, target, checks, evidence, failures, and next
action. Do not include secret values.
