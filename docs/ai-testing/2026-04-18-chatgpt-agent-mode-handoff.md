# ChatGPT Agent Mode Handoff — 2026-04-18

Use this prompt as-is in ChatGPT agent mode.

## Paste Into ChatGPT Agent Mode

You are testing Winston on the live site as a real end user after deployment. Your goal is to verify that the most recently changed surfaces work as intended online.

### Live site and login
- Site: `https://paulmalmquist.com`
- Primary login URL: `https://paulmalmquist.com/login`
- Email: `info@novendor.ai`
- Password: `winston2026!`

### Goal
Verify four things:
1. the login account can access the expected environments,
2. Winston agent mode still works on global and env-scoped chat surfaces,
3. Novendor accounting behaves like a real operating surface,
4. NCF and any visible operator/executive pages fail gracefully instead of looking broken.

### Important rules
- Act like a real user, not a developer.
- Prefer visible navigation first, then use direct URLs if navigation is unclear.
- If a route is blocked or unauthorized, record that and keep going.
- Do not stop at the first failure.
- For failed checks, include: `severity`, `route`, `steps`, `expected`, `actual`.
- For passed checks, include the route and one short sentence of evidence.
- Avoid destructive writes. If a write-intent flow appears, test `Cancel` unless a clearly safe confirm step is explicitly required.

### Login and environment access instructions
1. Open `https://paulmalmquist.com/login`.
2. Sign in with `info@novendor.ai` and `winston2026!`.
3. Note where login lands you: `/app`, an environment home, or an environment selector.
4. Confirm whether this account can access these branded entries:
   - `https://paulmalmquist.com/novendor/login`
   - `https://paulmalmquist.com/meridian/login`
   - `https://paulmalmquist.com/trading/login`
   - `https://paulmalmquist.com/ncf/login`
5. For each successful environment entry, note the real `envId` from the URL pattern `/lab/env/<envId>/...`.

### Priority route map

#### Global Winston
- `https://paulmalmquist.com/app/winston`
- Purpose: global Winston companion surface

#### Env-scoped copilot
- `/lab/env/<envId>/copilot`
- Purpose: page-aware assistant behavior inside a specific environment

#### Novendor
- Expected home: `/lab/env/<envId>/consulting`
- Key routes:
  - `/lab/env/<envId>/consulting`
  - `/lab/env/<envId>/consulting/pipeline`
  - `/lab/env/<envId>/accounting`
  - `/lab/env/<envId>/copilot`

#### Meridian
- Expected home: `/lab/env/<envId>/re`
- Key routes:
  - `/lab/env/<envId>/re`
  - `/lab/env/<envId>/re/opportunities`
  - `/lab/env/<envId>/copilot`

#### Trading
- Expected home: `/lab/env/<envId>/markets`
- Key routes:
  - `/lab/env/<envId>/markets`
  - `/lab/env/<envId>/markets/portfolio`
  - `/lab/env/<envId>/markets/execution`
  - `/lab/env/<envId>/copilot`

#### NCF
- Expected home: `/lab/env/<envId>/ncf`
- Key routes:
  - `/lab/env/<envId>/ncf`
  - `/lab/env/<envId>/ncf/executive`

### Test plan

#### A. Authentication and access
1. Verify the base login form loads and accepts the provided credentials.
2. Verify the same account can reach Novendor, Meridian, Trading, and NCF branded logins without being rejected unexpectedly.
3. Record any environment that still lands on an unauthorized screen.
4. Refresh once after login and confirm the session survives.

#### B. Global Winston and env-scoped agent mode
1. Open `/app/winston` if accessible.
2. Open `/lab/env/<envId>/copilot` in at least one accessible environment.
3. Start with:
   - `What page am I on and what context do you have?`
4. Follow with:
   - `What should I do next based on what is visible here?`
   - `Now go one level deeper.`
5. Expected:
   - the first answer reflects the current page,
   - the follow-up preserves context,
   - the page does not reset into generic chat behavior.

#### C. Novendor consulting workflow
1. Open `/lab/env/<envId>/consulting/pipeline`.
2. Visually inspect whether the page looks complete and usable.
3. Ask Winston:
   - `Which deals need action today?`
   - `What looks stale here?`
   - `Which stage is the bottleneck?`
4. If visible filters exist, change one and ask:
   - `Given the current view, what should I prioritize?`
5. Expected:
   - the answer reflects the visible board/state,
   - the app feels like an operating surface, not a broken shell.

#### D. Novendor accounting command desk
1. Open `/lab/env/<envId>/accounting`.
2. Verify the page has:
   - top control bar,
   - queue-oriented main table,
   - right rail,
   - bottom trend band or equivalent lower summary area.
3. Verify these tabs exist and switch cleanly:
   - `Needs Attention`
   - `Subscriptions`
   - `Receipts`
   - `Transactions`
   - `Invoices`
4. In `Needs Attention`, click one queue row if available.
5. Verify a right-side detail drawer opens and can be closed.
6. Verify the right rail shows receipt intake activity or a clean empty state.
7. Verify the page does not show raw errors, broken placeholders, or obviously dead sections.
8. Do not upload a receipt unless a safe sample file is already available in the browser session. This run is mainly a post-deploy regression, not a live data-entry exercise.

#### E. NCF executive verification
1. Open `/lab/env/<envId>/ncf/executive` if NCF access is available.
2. Verify the page loads instead of redirecting to unauthorized.
3. Look for an executive metrics surface that clearly distinguishes live vs unwired cards.
4. Expected:
   - at least one metric can appear live,
   - unwired metrics fail closed with a professional unavailable state,
   - the page does not leak stack traces or raw backend errors.

#### F. Meridian and Trading spot checks
If Meridian is accessible:
1. Open `/lab/env/<envId>/re`.
2. Ask:
   - `What stands out in this environment?`
   - `Which opportunities look worth attention?`

If Trading is accessible:
1. Open `/lab/env/<envId>/markets` or `/markets/portfolio`.
2. Ask:
   - `Summarize what matters on this page.`
   - `What should I watch before making a paper trade?`

Expected:
- answers are grounded in the visible page,
- answers do not read like generic finance filler.

#### G. Operator/executive landing-page sanity check
If any Hall Boys or other multi-entity operator environment is visible in navigation:
1. Open its home or executive route.
2. Check whether the first screen explains what is happening, what is at risk, and what needs attention.
3. Verify the page does not show raw fixture-path errors, raw Python file paths, or other developer leakage.

#### H. Safe write-intent behavior
1. On any env-scoped copilot page, try one write-intent prompt:
   - `Advance this item to the next stage.`
   - `Set the next action for this item to follow up tomorrow.`
2. Expected:
   - Winston does not execute immediately,
   - a confirmation flow or clarification step appears,
   - cancelling the action leaves the page unchanged.

### Required output format

Return a report with these sections:

#### 1. Access summary
- Was login successful?
- Which environments were accessible?
- Which environments were unauthorized or broken?
- What `envId` values did you observe?

#### 2. Passes
- Flat bullet list of passed checks with route and brief evidence.

#### 3. Failures
- Flat bullet list ordered by severity.
- For each failure include:
  - `Severity`
  - `Route`
  - `Steps`
  - `Expected`
  - `Actual`

#### 4. Agent-mode quality
- Did Winston understand page context?
- Did it maintain context across turns?
- Did it behave safely on write-intent requests?
- Did any answer feel generic or ungrounded?

#### 5. Deployment confidence
- One short paragraph: would a real end user feel the deployment worked?

#### 6. Recommended fixes
- Short list of the highest-value product fixes from this run.

### Notes for this run
- The most important routes in this regression are `/app/winston`, `/lab/env/<envId>/copilot`, `/lab/env/<envId>/consulting/pipeline`, `/lab/env/<envId>/accounting`, and `/lab/env/<envId>/ncf/executive`.
- This login is expected to have broad environment access. If NCF or another branded environment is still blocked, treat that as a meaningful regression.
- Prefer `Cancel` over `Confirm` in write flows unless the action is obviously safe and reversible.

## Expected report filename

If you save a local artifact, use: `winston-agent-mode-report-2026-04-18.md`
