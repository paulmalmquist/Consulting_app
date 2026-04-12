# ChatGPT Agent Mode Handoff — Winston Front-End Regression

Use this prompt as-is in ChatGPT agent mode.

## Paste Into ChatGPT Agent Mode

You are testing Winston as a real user on the live site and must return a concise QA report.

### Live site and login
- Site: `https://paulmalmquist.com`
- Primary login URL: `https://paulmalmquist.com/login`
- Email: `info@novendor.ai`
- Password: `winston2026!`

### Goal
Test Winston's front-end agent mode based on the most recent development work and conversation history themes from today. Focus on real user behavior, not implementation details.

### Important rules
- Act like a real user exploring the application.
- Prefer the real front-end flows over guessing hidden URLs, but use direct URLs when navigation is ambiguous.
- If an environment is unavailable due to membership or permissions, record that clearly and continue with the environments you can access.
- If a route errors, capture the exact route, visible error text, and whether recovery was possible.
- For every failed test, include: `route`, `steps`, `expected`, `actual`, and `severity`.
- For every passed test, include the route and a one-line confirmation of what worked.
- Do not stop after the first failure. Continue through the test plan and return a full report.

### Login and navigation instructions
1. Open `https://paulmalmquist.com/login`.
2. Sign in with the credentials above.
3. If login succeeds and you land on an environment selector or `/app`, note which environments are visible.
4. Prioritize these environment routes if accessible:
   - Trading branded login: `https://paulmalmquist.com/trading/login`
   - Meridian branded login: `https://paulmalmquist.com/meridian/login`
   - Novendor branded login: `https://paulmalmquist.com/novendor/login`
5. After entering an environment, note the `envId` from the URL pattern `/lab/env/<envId>/...`.
6. For env-scoped agent mode, open `/lab/env/<envId>/copilot`.
7. Also test the global Winston surface at `https://paulmalmquist.com/app/winston` if available.

### Route map and how to navigate

#### Global workspace
- `https://paulmalmquist.com/app/winston`
- Purpose: global Winston companion surface

#### Trading environment
- Entry: `https://paulmalmquist.com/trading/login`
- Expected home after successful env-scoped access: `/lab/env/<envId>/markets`
- Key pages to test:
  - `/lab/env/<envId>/markets`
  - `/lab/env/<envId>/markets/portfolio`
  - `/lab/env/<envId>/markets/execution`
  - `/lab/env/<envId>/copilot`

#### Meridian environment
- Entry: `https://paulmalmquist.com/meridian/login`
- Expected home: `/lab/env/<envId>/re`
- Key pages to test:
  - `/lab/env/<envId>/re`
  - `/lab/env/<envId>/re/opportunities`
  - if opportunity links are visible, open one opportunity detail page
  - `/lab/env/<envId>/copilot`

#### Novendor environment
- Entry: `https://paulmalmquist.com/novendor/login`
- Expected home: `/lab/env/<envId>/consulting`
- Key pages to test:
  - `/lab/env/<envId>/consulting`
  - `/lab/env/<envId>/consulting/pipeline`
  - if opportunity cards are visible, open one opportunity detail page
  - `/lab/env/<envId>/copilot`

### Test plan

#### A. Authentication and session behavior
1. Verify the login form loads and accepts the credentials.
2. Verify successful redirect behavior after login.
3. Verify whether the app lands on `/app`, an environment home, or an unauthorized screen.
4. Verify the session survives page navigation.

#### B. Conversation boot and context carry-forward
1. Open the global Winston workspace if available.
2. Open an env-scoped copilot route if available.
3. Start a fresh conversation with a page-aware prompt.
4. Ask a follow-up that depends on the previous answer.
5. Refresh the page and verify whether the conversation can be resumed from recent threads or URL state.

Use prompts like:
- `What page am I on and what context do you have?`
- `What should I do next based on what is visible here?`
- `Now go one level deeper.`

#### C. Trading / markets decision-support tests
If Trading is accessible:
1. On `/markets`, ask:
   - `Summarize what matters on this page.`
2. On `/markets/portfolio`, ask:
   - `What changed in the portfolio today?`
   - `What looks highest conviction here?`
3. On `/markets/execution`, ask:
   - `What should I watch before making a paper trade?`
4. Verify whether the answers feel tied to the page, not generic market commentary.

#### D. Meridian / REPE tests
If Meridian is accessible:
1. On `/re`, ask:
   - `What stands out in this environment?`
2. On `/re/opportunities`, ask:
   - `Which opportunities look like distress candidates?`
   - `Which ones look like growth plays?`
   - `Which ones look like balanced core plus?`
3. If opportunity detail pages are available, open one and ask:
   - `Explain this opportunity and the main risks.`
4. Ask one trust-oriented question:
   - `Are any of these metrics missing or unavailable?`
5. Verify that Winston grounds answers and does not hallucinate precise finance values when data is missing.

#### E. Novendor / pipeline action tests
If Novendor is accessible:
1. On `/consulting/pipeline`, visually inspect the board and any chart/filter surface below it.
2. Ask:
   - `Which deals need action today?`
   - `What looks stale here?`
   - `Which stage is the bottleneck?`
3. If filters or chart interactions exist, use them and then ask:
   - `Given the current filtered view, what should I prioritize?`
4. Verify the answer reflects the visible state.

#### F. Write-intent and confirmation flow
On any accessible env-scoped copilot surface, test a write-intent request that should require confirmation.

Try prompts like:
- `Create a deal for this fund.`
- `Advance this opportunity to the next stage.`
- `Set the next action for this item to follow up tomorrow.`

For each:
1. Verify Winston does not immediately execute.
2. Verify a confirmation UI appears.
3. Verify the confirmation block shows parameters or missing fields.
4. If safe and reversible, click `Cancel` and confirm no action executes.
5. If a non-destructive action is available and clearly scoped, optionally test `Confirm` and verify the UI transitions to executing/executed.

#### G. Error handling and degraded behavior
1. Try a vague or unsupported request:
   - `Do the thing`
2. Try a context-sensitive request from the wrong page:
   - `Create an REPE asset` while not on an REPE page
3. Record whether Winston asks for clarification, fails gracefully, or behaves incorrectly.

### Required output format

Return a report with these sections:

#### 1. Access summary
- Was login successful?
- Which environments were visible?
- Which routes were accessible?
- Which routes were blocked or unauthorized?

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

#### 4. Agent-mode quality assessment
- Did Winston maintain context across turns?
- Did it use page context well?
- Did it behave safely on write-intent flows?
- Did it render structured or confirmation responses clearly?

#### 5. Recommended fixes
- Short list of the highest-value product fixes based on the run.

### Notes for this run
- This app has both a global Winston workspace and env-scoped copilot routes.
- Env-scoped copilot route pattern is `/lab/env/<envId>/copilot`.
- If you only get access to one environment, still complete the applicable subset of tests and note the access limitation.

## Expected report filename

If you save a local artifact, use: `winston-agent-mode-report-2026-04-11.md`
