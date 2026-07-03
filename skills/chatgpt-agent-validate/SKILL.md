---
name: chatgpt-agent-validate
description: Produce a self-contained ChatGPT-agent-mode prompt that visually validates what a coding session just shipped on novendor.ai. Use when the user wants browser-based independent verification of a build, fix, or deploy. Triggers on "validate via chatgpt agent", "give me a chatgpt prompt to verify this", "hand this off to chatgpt agent mode for visual check", "produce a browser validation prompt", "agent-mode validation of what we just shipped". The skill outputs a copy-paste prompt — Claude does NOT run the validation itself.
---

# ChatGPT Agent Mode Validation Handoff

This skill produces a copy-paste prompt that ChatGPT's agent mode (or any browser-using autonomous agent) can run to independently verify what your coding session just shipped on `novendor.ai`.

The point is **rendered truth**: what the page actually shows in the user's eyes, observed by an agent that didn't write the code, didn't read your tests, and has no incentive to declare success. It complements unit tests and type checks — it does not replace them.

## When to use

- After a user-facing change ships to production or a Vercel preview and you want a human-equivalent visual check before claiming "done".
- When a numeric / chart / KPI / table change is suspected of looking wrong rendered (even if the numbers passed the test suite).
- When a fix lands on production and you want the result confirmed by an outside agent that didn't write it.
- When the user says one of: "validate via chatgpt agent", "give me a chatgpt prompt to verify", "hand this off for visual check", "produce a browser validation prompt", "agent-mode validation".

## When NOT to use

- For pure backend changes with no user-facing surface — run unit/integration tests instead.
- For changes you haven't actually deployed yet — the prompt is for live verification against a real URL.
- As a substitute for writing tests.
- When the suspect surface is gated behind interactive multi-step state the agent can't reasonably reach (e.g. a user-specific draft saved in another browser session) — produce manual repro steps instead.

## Inputs to gather before writing the prompt

Before producing the prompt, collect these. If you can't fill in any of (1)–(4), stop and ask the user — don't ship a vague prompt.

1. **What was changed.** Read `git log -1 --stat` and the conversation context. Boil it down to one sentence: "X was changed because Y." Be concrete — file path, function name, page, KPI, or column.
2. **Where it shows up.** The exact URL pattern (`/app/...`, `/lab/env/[envId]/...`) where the change is visible. If unknown, grep the changed files for route definitions or routing config. If the URL needs an `env_id` / `fund_id` / similar, supply the actual UUID from the seed fixture or database.
3. **Pass criteria.** What should the agent see if the fix worked? List 3–6 specific, observable statements (e.g., "the trend chart's y-axis is in % not absolute units", "no `__missing_data__` text anywhere on the page", "tooltip on Q4 2024 shows 14.3% not 456%"). Each criterion must be something the agent can confirm by looking, not by reasoning.
4. **Fail criteria.** What would mean the fix didn't land? Same format — concrete and observable.
5. **Suspect cases.** Specific data points / quarters / accounts / rows you want zoomed-in on, with expected values where known.
6. **Out-of-scope guardrails.** Buttons the agent must NOT click — `Promote`, `Release`, `Recompute`, `Delete`, `Submit`, `Save`, `Pay`, `Send`, etc. Be explicit; agent mode is autonomous and will click things to "make progress".

## Login details (always include verbatim in produced prompt)

`novendor.ai` uses Supabase email/password auth. Paul has chosen to include the demo-admin credentials directly in the *produced prompt* so the agent can run end-to-end without prompting — but the credentials are **never stored in this file**. Pull the password at generation time and substitute it into the produced prompt:

```bash
vercel env pull /tmp/creds.env --environment production --yes   # from the linked project
# read NOVENDOR_ADMIN_PASSWORD from the pulled file; insert into the produced prompt; delete the pull
```

- Public homepage: `https://novendor.ai`. Login entry point is the **person icon in the top-right of the header** — clicking it opens the login form. (Direct alternate: `https://novendor.ai/login`.)
- Email: `info@novendor.ai`
- Password: `<NOVENDOR_ADMIN_PASSWORD — pulled at generation time, never committed>`
- After login, the workspace home is at `/app`. If the agent sees "Application error", a blank page, or an unexpected redirect after login, tell it to stop and report — don't push past auth failures.
- Hard limit: agent must not retry login more than twice. Failed login = stop and report.

## Output template — paste this into ChatGPT agent mode

Produce the prompt below verbatim, filling in the bracketed sections from your "Inputs to gather" notes. Hand the produced prompt to the user as a fenced code block they can copy.

```text
Task: visually verify [one-sentence description of what was just shipped] on novendor.ai.

Context: a coding agent just [what it did, in one sentence with the file path or page]. I need rendered truth — what the page actually shows — not interpretation. Do NOT ask any chat assistant on the page about the result; I want what the page renders.

Step 1 — Log in
1. Open https://novendor.ai
2. Click the person icon in the top-right of the header. The login form should open within a few seconds. If it doesn't, navigate directly to https://novendor.ai/login.
3. Enter:
   - Email: info@novendor.ai
   - Password: [NOVENDOR_ADMIN_PASSWORD — substituted at generation time from vercel env pull; never committed]
4. Submit. You should land on /app or a workspace home. Confirm the page renders with navigation visible. If you see "Application error", a blank screen, or an unexpected redirect, stop and report — do not retry login more than twice.

Step 2 — Navigate to the affected surface
[Insert exact URL with any required IDs, OR a click path: "Left nav → REPE → Funds → click <fund name> → IRR Timeline tab".]

Step 3 — Verify the fix
For each pass criterion below, take a screenshot and write one line stating pass or fail with what you observed.

PASS if you observe ALL of:
- [criterion 1, concrete and observable]
- [criterion 2]
- [criterion 3]

FAIL if you observe ANY of:
- [fail criterion 1]
- [fail criterion 2]

Step 4 — Zoom on suspect cases
[Optional. List specific data points / quarters / rows to hover or click. For each, capture the tooltip or detail view and report the exact rendered value. Note expected values where you have them so I can spot drift.]

Step 5 — Audit-mode cross-check
[Include this section ONLY when the change touches a REPE / authoritative-state surface. Otherwise delete this whole step.]
For each affected page, append `?audit_mode=1` to the URL and reload. Capture a screenshot of the AuditDrawer panel — specifically the trust_status, snapshot_version, null_reasons, formulas, and provenance fields. These tell us which builder produced the rendered values.

Step 6 — Report back
Reply with:
- A one-line verdict: PASS / PARTIAL / FAIL
- A short table: criterion → observed → pass/fail
- All screenshots inline
- Any P0 console errors from DevTools (ignore React hydration warnings #418/#423/#425; those are pre-existing)

Do NOT:
- Edit, save, submit, or promote anything
- Click any state-mutating buttons (Promote / Release / Recompute / Delete / Submit / Save / Pay / Send / [add task-specific buttons])
- Open the Winston / chat panel and ask it about the result — I want rendered chart/page truth, not assistant interpretation
- Retry login more than twice. If login fails, stop and tell me which step failed
- Navigate outside novendor.ai (no Google searches, no checking GitHub)

If anything is ambiguous (multiple matching items, empty list, unexpected redirect, missing data), stop and ask before guessing.
```

## After producing the prompt

1. Hand the prompt to the user inside a fenced code block. Tell them to paste it into a fresh ChatGPT agent-mode task.
2. Optional: save the prompt under `docs/ops-reports/agent-validations/{YYYY-MM-DD}-{short-feature-slug}.md` so the history is grep-able later.
3. When the agent reports back, the user pastes the report into the next message. Cross-reference its findings against your understanding of the change. If the agent finds a regression you didn't expect, fix it before claiming done — don't argue with the screenshots.

## Quality bar — common failure modes to avoid in the produced prompt

- **Vague pass criteria** ("the page works", "the chart looks right"). The agent will rationalize a marginal render as a pass. Each criterion must name a specific element and a specific observable property.
- **Missing IDs.** "Navigate to a fund page" without specifying which fund forces the agent to guess. Always supply the actual UUID or name to look up.
- **No fail criteria.** Without explicit fail criteria, the agent will default to "looks fine" because it has no shape for what "broken" would look like.
- **Missing guardrails.** Listing only generic "don't click promote" — name the actual buttons that exist on the surface you're verifying.
- **Asking the agent to interpret numbers.** "Tell me if 456% looks right" — the agent has no domain knowledge. Instead: "Capture the value rendered at Q4 2024. I'll judge whether it's right."
- **No audit-mode step on REPE surfaces.** REPE is the only place where the source-of-truth check lives in the AuditDrawer. Skipping it on REPE pages means you only verified the rendering, not the data.

## Don't

- Don't run the validation yourself — that defeats the purpose of independent verification. The whole point is a different agent looking with different judgment.
- Don't make the agent's job easier by hand-waving — give it precise URLs, IDs, and observable criteria.
- Don't chain this with `winston-post-deploy-verify` in the same session. That skill has Claude verify directly; this skill hands off to a different agent. Pick one per change.
- Note on credentials: the produced prompt includes the demo-admin password for `info@novendor.ai` by Paul's explicit instruction, but the value is pulled from the Vercel env (`NOVENDOR_ADMIN_PASSWORD`) at generation time and substituted into the placeholder — it is never stored in this file or anywhere tracked. If the password rotates, nothing here needs updating.
