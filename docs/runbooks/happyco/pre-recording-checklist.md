# HappyCo Pre-Recording Checklist

Last updated: 2026-05-22

Run this checklist before recording the HappyCo Loom. It covers what to open,
what to close, what to verify, and what must never appear on screen. The script
itself is in [`loom-storyboard.md`](loom-storyboard.md).

The goal: a clean 5-7 minute recording with no leaked secrets, no broken routes,
and no overclaims.

## Environment

- [ ] Decide where you are recording against — local dev or the deployed gated
      site. Use whichever currently renders all 4 HappyCo routes cleanly.
- [ ] If recording local: start the dev server and confirm it is up before
      opening any tab.
- [ ] If recording deployed: confirm the latest deploy is live and the gated
      routes work.
- [ ] Have the invite code ready in a password manager or a note that stays off
      screen. Do not paste it into a visible field.

## Open these tabs (in order)

- [ ] `/happyco` — unlock it before recording so the invite-code field is never
      on camera. Verify tailored content is visible.
- [ ] `/happyco/demo` — confirm it loads with no Winston login and no Hall Boys
      shell.
- [ ] `/happyco/weather-risk` — confirm the KPI strip, risk table, market
      summary, model/run-receipt evidence, and chart gallery all render.
- [ ] Databricks `bundle validate` output — either a terminal with the passing
      result or the bundle file open. Confirm it shows the validate PASS.
- [ ] `/happyco/artifacts` — confirm the hub lists artifacts and shows honest
      local/private vs downloadable status.
- [ ] The Azure DevOps board — the HappyCo Epic 386, Feature 391, the User
      Stories, and the six PRs.

## Close or hide these

- [ ] Any window, tab, or terminal showing the invite code.
- [ ] Any `.env` file, Databricks token, or profile secret.
- [ ] File explorer windows showing `artifacts/happyco/` or other git-ignored
      local paths.
- [ ] Email clients, personal messages, calendar notifications.
- [ ] Unrelated browser tabs, bookmarks bars with sensitive links.
- [ ] Desktop notifications — turn on do-not-disturb / focus mode.

## Verify before you hit record

- [ ] All 4 HappyCo routes render or degrade honestly — no error pages.
- [ ] The weather-risk page shows the placeholder-chart state honestly; you are
      ready to explain it, not hide it.
- [ ] No HappyCo production claim is visible anywhere in the shipped copy.
- [ ] The Databricks evidence on screen matches reality: `bundle validate`
      passes; `bundle deploy`/`run` are not done; a prior receipt-backed run
      exists.
- [ ] Your script matches [`claims-and-caveats.md`](claims-and-caveats.md).
- [ ] You have rehearsed the weather-risk sentence:
      "The site contract is wired. The local fallback bundle validates the
      interface, and the live Databricks score run is the next gated step to
      replace placeholder chart artifacts with real generated charts."

## What NOT to show on camera

- The invite code, the invite-code input field mid-typing, or any URL with the
  code as a query parameter.
- Local git-ignored artifact paths or a file browser of `artifacts/happyco/`.
- Databricks tokens, auth profiles, or `.env` content.
- The placeholder chart PNGs presented as finished analytics.
- Anything the claims sheet marks as a disallowed claim.

## After recording

- [ ] Watch the recording back once, specifically scanning for a leaked invite
      code or secret in any frame.
- [ ] If anything sensitive appears, re-record. Do not trim and ship.
- [ ] Keep the recording link private until it is reviewed.
