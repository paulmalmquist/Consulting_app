---
name: supervised-build-review-loop
description: Run a supervised build-review-deploy-test loop across ChatGPT in the browser and VS Code with Claude Code. Use when the user wants a task taken from idea to reviewed plan to implementation to deploy to live-site verification, with repeated critique, remediation, and proof collection before calling it done.
---

# Supervised Build Review Loop

Use this skill when the work should be driven by two surfaces:

1. ChatGPT in the browser as reviewer, critic, and planner
2. VS Code with Claude Code as coder and implementer

The job is not complete until the live site is checked or a hard blocker is fully documented.

## Operating Rules

- Act like a staff engineer with QA responsibility.
- Prefer deterministic repo workflows over ad hoc improvisation.
- Pressure-test plans before major edits.
- Do not trust terminal success alone; verify in the actual app.
- Keep a running record of prompts, plans, diffs, commands, deploy output, test results, and live-site findings.
- If a tool hangs, recover and continue.
- Escalate reasoning depth when the task is ambiguous, architectural, repeatedly failing, or production-facing.

## Required Artifacts

Maintain a scratchpad in the repo or a local temp note with:

- objective
- assumptions
- known commands
- current status
- issues found
- next step
- ChatGPT project name
- ChatGPT chat/thread identifier or distinguishing title
- Claude Code conversation name in VS Code
- whether the ChatGPT GitHub extension is in use with `consulting_app` context
- latest blessed plan
- ChatGPT critiques
- Claude implementation summaries
- changed files
- test results
- deployment results
- live-site findings
- unresolved risks

For unattended or overnight runs, also maintain the repo baton-pass artifacts:

- machine-readable state: `verification/loop_state/repe_supervised_loop.json`
- human-readable log: `verification/loop_state/repe_supervised_loop.md`

These artifacts are the canonical handoff surface between ChatGPT review, Claude Code execution, and any heartbeat automation that resumes the loop later.

## Baton Pass Contract

For any multi-step or unattended run, create and keep a stable `run_id` in the state file, for example:

- `repe-meridian-integrity-2026-04-19`

The JSON state file should always be updated at the end of each meaningful step with:

- `run_id`
- `objective`
- `status`
- `current_phase`
- `current_owner`
- `chatgpt_project`
- `chatgpt_chat`
- `claude_conversation`
- `github_context_enabled`
- `last_completed_step`
- `next_expected_action`
- `blocking_issue`
- `files_touched`
- `tests_run`
- `deploy_status`
- `live_verification_status`
- `last_updated_at`

The markdown log should append one short entry per pass with:

- timestamp
- actor or surface
- what changed
- proof gathered
- risks
- next step

When resuming a loop, read the state file first, then the markdown log, then inspect the live app surfaces. Do not rely on conversational memory alone if these baton-pass artifacts exist.

## Phase 0: Orient

Before coding:

1. Identify the active repo and owning surface.
2. Find the relevant app, backend, test commands, and deploy workflow already used by the repo.
3. Locate Claude Code in VS Code.
4. Determine the Claude Code conversation name in the VS Code extension and record it in the scratchpad.
5. Locate ChatGPT in the browser.
6. Choose a ChatGPT project before starting or continuing the review loop. Do not proceed in a raw chat outside a project.
7. Use these default project-routing rules:
   - AI feature work: `Winston AI`
   - Meridian Capital / RE PE work: `Winston - Re PE`
   - Novendor internal environment work: `Winston - Novendor Enviro...` or the full Novendor-environment project name shown in ChatGPT
   - If a picture or image-based project is clearly the best fit, use that project
   - If none fit cleanly, fall back to `Winston Main`
8. If the correct ChatGPT project is still unclear after applying those rules, pause and ask the user which project to use before continuing.
9. Record the exact ChatGPT project name selected for the run.
10. Determine the unique ChatGPT chat/thread being used for the review loop and record a stable identifier such as the visible title or other unambiguous label.
11. When useful, use the ChatGPT GitHub extension with `consulting_app` as the repository context and record that choice in the scratchpad.
12. Default the live-site verification target to `https://paulmalmquist.com` unless the task explicitly requires a different preview or production URL.
13. Plan to test in a fresh incognito browser session so prior auth, cache, and local state do not mask regressions.
14. Use the default verification login unless the task says otherwise:
   - email: `info@novendor.ai`
   - password: `winston2026!`
15. Note any auth or URL override in the scratchpad before testing.
16. Start the scratchpad.
17. If the run may continue across handoffs, initialize `verification/loop_state/repe_supervised_loop.json` and `verification/loop_state/repe_supervised_loop.md`.

Do not proceed with review passes until the ChatGPT project, ChatGPT chat, and Claude Code conversation are each identified well enough that another operator could resume the same loop without guessing.

If the repo already has a deploy or post-deploy verification skill, script, or checklist, use that instead of inventing a new flow.

## Phase 1: Ingest The Job

Read the current task, plan, or request from user context.

If Claude Code already produced a plan, capture it. Otherwise ask Claude Code for a concrete implementation plan that includes:

- problem statement
- likely root cause
- files to change
- schema or API implications
- frontend implications
- tests to add or update
- deployment implications
- rollback notes
- acceptance criteria

## Phase 2: ChatGPT Plan Review Loop

Before major execution, take the plan to ChatGPT in the browser and request a hard critique.

Ask for:

1. what is missing
2. what is risky
3. what is overbuilt
4. what may fail in production
5. exact files, tests, and deploy checks to add
6. whether the plan is ready to execute

Use at least these passes for material work:

- Pass A: initial critique
- Pass B: revised plan after incorporating critique
- Pass C: final blessing check

A plan is "blessed" when ChatGPT says it is sufficiently complete and executable, even if imperfect. If it is not blessed, revise in Claude Code and repeat.

## Review Prompt Template

```text
Review this implementation plan/output like a tough principal engineer.
Tell me:
1. what is missing
2. what is risky
3. what will fail in production
4. what tests are missing
5. whether this is ready to execute/deploy
6. exact improvements to make before proceeding

Context:
[concise repo/app context]

Plan or output:
[paste plan or summary]
```

## Reasoning Control

- Simple copy or layout tweak: standard review depth
- Multi-file logic, auth, routing, DB, deploy, or flaky tests: deeper review
- Production bugs, migrations, architecture, agent workflows, or repeated failures: highest reasoning mode available

Each escalation should be noted in the scratchpad with the reason.

## Model Selection Control

Make an explicit judgment call on model and reasoning settings at the start of the run and whenever the task shape changes.

- Planning, critique, architecture, ambiguous debugging, repeated failures, or production-risk review:
  use the strongest available review model with higher reasoning or thinking enabled.
- Long or complex coding sessions with many files, careful refactors, or audit-grade backend work:
  prefer Opus-class coding quality, but turn extra thinking off once the plan is already blessed and execution is straightforward.
- Quick bug fixes, small UI tweaks, routine follow-through, deployment operations, CI cleanup, or simple verification loops:
  prefer Sonnet-class speed over heavyweight reasoning.
- If the task starts simple and becomes architectural, failing, or production-sensitive:
  escalate back up immediately and note why in the scratchpad.
- If the task starts heavy but collapses into repetitive implementation or deploy churn:
  step back down to the faster model and keep moving.

Record in the scratchpad:

- selected model or class for ChatGPT review
- selected model or class for Claude coding
- reasoning or thinking mode in use
- why that choice fits the current phase

## Phase 3: Execution Loop In VS Code

Once the plan is blessed, hand Claude Code the latest blessed plan plus critique and ask it to implement in small reviewable chunks.

Before handing execution back to Claude, choose the coding model intentionally:

- use Opus-class coding for substantial multi-step implementation
- use Sonnet-class coding for short fixes, deploy-only work, or low-complexity follow-through
- disable extra thinking during long deterministic coding passes unless the work becomes ambiguous again
- re-enable heavier reasoning if Claude starts thrashing, missing edge cases, or making architectural mistakes

Prefer this order:

1. schema or contracts
2. backend or service logic
3. frontend wiring or UI
4. tests
5. cleanup and guardrails

After each meaningful chunk:

- inspect changed files
- inspect Claude's explanation
- run relevant checks
- run tests
- fix obvious failures before moving on

If Claude's explanation is vague, ask for:

- exactly what changed
- why it changed
- what remains
- what could still break

## Claude Execution Prompt Template

```text
Implement this using the following reviewed plan and critique.
Work in small steps, explain each step, and do not skip tests.

Objective:
[objective]

Blessed plan:
[paste plan]

Critique to address:
[paste critique]

Requirements:
- make the smallest correct change set
- preserve existing behavior unless intentionally changing it
- add/update tests where needed
- explain changed files and why
- provide deploy notes and remaining risks
```

## Phase 4: Post-Implementation Capture Hook

After each coding pass, capture:

- Claude's final explanation
- changed files or git diff
- test results
- migration notes
- deploy notes

Summarize the bundle for ChatGPT review when the change is material:

- implemented changes
- test evidence
- unresolved risks
- deploy readiness

Then update both baton-pass artifacts:

- overwrite the JSON state with the current phase, owner, last completed step, next expected action, files touched, tests run, and blocker status
- append one markdown log entry with the evidence and handoff note

## Phase 5: Deploy

Use the repo's existing deploy workflow.

- watch deploy output closely
- if deploy fails, diagnose, fix, and retry
- if a PR path exists, inspect CI, merge blockers, and mainline status
- do not assume the deployment is current until the live site confirms it

## Phase 6: Live Site Test

Test the deployed result like a real user:

- open a fresh incognito browser window
- navigate to `https://paulmalmquist.com` unless the task explicitly targets another deploy URL
- log in with `info@novendor.ai` / `winston2026!` unless the task explicitly provides different credentials
- test the touched flows
- test nearby regression-prone flows
- record pass/fail, visible errors, UX gaps, data mismatches, broken states, and unauthorized or empty states

Terminal success does not count as completion.

## Phase 7: Remediation Loop

If live testing exposes issues:

1. write a precise remediation plan
2. send non-trivial issues back through ChatGPT critique
3. implement fixes in Claude Code
4. re-test locally
5. update the baton-pass artifacts before each deploy or major handoff
5. re-deploy
6. re-test live

Repeat until acceptable.

## Failure Handling

When something breaks, gather evidence first and classify the failure:

- local code issue
- test issue
- environment issue
- migration issue
- deployment, cache, or version issue
- auth or permissions issue
- data issue

Fix the highest-confidence issue first, then retest.

## Stop Conditions

Stop only when one is true:

1. the live site matches the intended outcome and no meaningful blockers remain
2. a hard blocker is documented with what blocked progress, what was tried, the best next step, and the exact files or systems involved

## Final Output

A good run ends with:

- what changed
- why it changed
- proof from tests and live verification
- unresolved risks
- what to watch next
