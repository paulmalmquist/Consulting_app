# Eval Charter

## What evals are for

Evals prove that both the shared contract and the environment-specific behavior work. Code that looks right is not the same as code that works. An eval is the evidence.

There are two categories:

**1. Shared contract evals** — prove that the platform-wide design system, AI runtime, and fail-closed rules still work after a change.

**2. Environment evals** — prove that the environment-specific golden paths, AI behaviors, and visual expectations still hold.

## What every environment must have

Every environment must have an `eval-plan.md` with sections covering:

| Section | What it proves |
|---|---|
| Golden paths | Core user flows work end-to-end |
| Negative tests | Fail-closed behaviors return null/refused correctly |
| Visual / screenshot evals | Key pages look correct |
| AI answer evals | Winston says the right things and refuses the wrong things |
| Tool-call evals | Confirmation gates and receipts work |
| Regression checks | Existing functionality not broken |
| Smoke tests | Minimum production verification |

## What counts as a passing eval

- **Golden path:** Core flow completes without error, returns expected data shape.
- **Negative test:** Given a triggering condition, the response is null/refused with the correct reason — AND the UI renders the null gracefully.
- **Screenshot eval:** Key page looks correct at 1280×800 in dark mode. No broken layout, no empty where data is expected.
- **AI answer eval:** Winston's answer contains required elements (data source, null_reason where applicable, scope declaration) and does not contain prohibited elements (invented numbers, out-of-scope claims).
- **Tool-call eval:** Confirmation gate appears before write. Receipt is issued after confirmation. No write without confirmation.
- **Regression:** Feature that worked before still works. No new 500 errors. No new console errors on happy path.

## Eval fail cases

An eval fails if:
- The page loads with a 500 error
- Winston returns an invented number instead of a null
- A confirmation gate is bypassed on a write
- A receipt is not issued after a confirmed write
- A null_reason is missing from a null response
- The UI shows an empty state where data is expected
- A previously passing test is now failing
