# HappyCo Post-Merge / Deploy Smoke Checklist

Last updated: 2026-05-22

Run this checklist after merging a HappyCo PR and after every deploy that
touches the HappyCo package. It is a fast manual pass — gates, routes, copy
honesty. It is not a substitute for the focused backend/frontend tests in
[`final-package-runbook.md`](final-package-runbook.md).

Mark each item pass or fail. If anything fails, stop and fix before sharing the
package or recording a Loom.

## Gate behavior

- [ ] `/happyco` loads in its locked state — tailored HappyCo content is hidden.
- [ ] An invalid invite code fails — access is denied, no content leaks.
- [ ] A valid invite code unlocks — the `happyco_demo_access` cookie is set and
      tailored content renders.
- [ ] No invite code appears in the page source, in the HTML, or in any
      client-side bundle.

## Routes and navigation

- [ ] The `/happyco` primary CTA opens `/happyco/demo`.
- [ ] `/happyco/demo` has no Winston login and no Hall Boys operator shell — it
      is the clean demo surface.
- [ ] The benchmark variance visual on the demo reads clearly — Parkline Commons
      is visibly the underperformer.
- [ ] `/happyco/weather-risk` renders fully — KPI strip, risk table, market
      summary, model/run-receipt evidence, chart gallery — or degrades honestly
      if data is absent.
- [ ] `/happyco/artifacts` is gated and shows honest artifact status —
      local/private vs downloadable, no fake downloads.

## Honesty checks

- [ ] No invite code is exposed anywhere in source or rendered pages.
- [ ] No false claims in shipped copy — scan against
      [`claims-and-caveats.md`](claims-and-caveats.md).
- [ ] The weather-risk page describes the sample bundle as a local-fallback
      bundle with placeholder charts, not as a live Databricks run.
- [ ] The Databricks evidence shown matches reality — `bundle validate` passes;
      `deploy`/`run` not done; a prior receipt-backed run exists.

## Infrastructure health

- [ ] API and proxy routes are healthy — `/api/operator/v1/property-ops/*`
      respond with deterministic synthetic JSON and demo caveats.
- [ ] The gated artifact API verifies the invite cookie — unknown keys return
      404, missing access returns 403.
- [ ] No artifact is reachable on a public static path.

## Sign-off

- [ ] All items above pass.
- [ ] Any failures are logged with the exact route/symptom and a fix is filed
      through the `azure-devops-intake` skill.
- [ ] A dated note of this smoke run is appended to the latest QA receipt or the
      runbook.

Note: repo-b on Vercel does not auto-deploy on push to `main`. After a merge
that touches `repo-b/`, run the manual `repo-b` production deploy before running
this checklist against the deployed site.
