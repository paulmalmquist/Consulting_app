# Winston Codebase Evolution Engine

Nightly autonomous coding session. Rotates through 7 improvement focuses and applies targeted fixes directly to the codebase each night at 2am.

## Schedule
Runs nightly at **2:00 AM local time**.

## Focus Rotation (by day of week)
| Day | Focus |
|---|---|
| Sunday | Dead Code Hunter — unused imports, variables, re-exports |
| Monday | TypeScript Quality — hunt `any` types, add proper interfaces |
| Tuesday | Error Handling — find API routes missing try/catch |
| Wednesday | TODO Resolver — resolve simple TODOs, document complex ones |
| Thursday | Consistency Patrol — normalize naming and patterns |
| Friday | Performance Scan — useMemo gaps, N+1 patterns, expensive re-renders |
| Saturday | Documentation — JSDoc/docstrings for undocumented public functions |

## Output
Each run writes a log to `docs/code-evolution/YYYY-MM-DD.md` with:
- What was changed and why
- Feature groundwork scaffolded from that day's feature-radar report
- What was skipped (too risky)
- Patterns noticed for future runs

## Feature Radar Integration
Before doing any codebase work, the engine reads `docs/feature-radar/[TODAY].md` and `docs/feature-radar/[TODAY]-competitor-derived.md`. Any features tagged "Easy build" or "Quick win" that align with the night's focus area may get scaffolded (stub functions, placeholder routes, new types) so they're ready for full implementation.

## To Create the Scheduled Task
Open a fresh Cowork session and say:

> "Create a scheduled task called `winston-code-evolution` that runs nightly at 2am. Read the prompt from `/sessions/funny-eager-cori/mnt/Consulting_app/docs/code-evolution/SETUP.md`."

Or paste the prompt below directly into the schedule skill.

---

## Full Task Prompt (copy-paste ready)

```
You are running the Winston Codebase Evolution Engine — a nightly autonomous coding session for the Winston / Novendor platform.

## Repo Location
All code lives at: /sessions/funny-eager-cori/mnt/Consulting_app/
- repo-b/ — Next.js frontend (TypeScript, React, Tailwind)
- backend/ — FastAPI backend (Python)
- backend/app/mcp/ — MCP tool registry and schemas
- backend/app/services/ — Core AI and domain services
- repo-b/src/components/ — React components
- repo-b/src/app/ — Next.js app router pages and API routes

## What You Do
Each night you run ONE focused improvement pass on the codebase. The focus area rotates by day of week. Determine today's day using `date +%u` (1=Monday, 7=Sunday), then execute the matching focus:

- Sunday (7): Dead Code Hunter — find unused imports, variables, and re-exported symbols
- Monday (1): TypeScript Quality — hunt `any` types and weak typing; add proper interfaces or types
- Tuesday (2): Error Handling — find API routes or services missing try/catch or proper error responses
- Wednesday (3): TODO Resolver — find TODO/FIXME/HACK comments; resolve simple ones, document complex ones
- Thursday (4): Consistency Patrol — find inconsistent naming, patterns, or conventions and normalize them
- Friday (5): Performance Scan — missing useMemo/useCallback, N+1 patterns, repeated expensive computations
- Saturday (6): Documentation — add JSDoc or docstrings to undocumented public functions and exported components

## Execution Steps

1. Determine today's focus using `date +%u`.

2. Read today's feature ideas reports from /sessions/funny-eager-cori/mnt/Consulting_app/docs/feature-radar/:
   - Look for files matching today's date: [YYYY-MM-DD].md and [YYYY-MM-DD]-competitor-derived.md
   - If today's files don't exist, use the most recent ones available (check by filename sort)
   - Extract any features marked "Easy build (3-5 days)" or "Quick win" — these are candidates to scaffold tonight
   - You don't have to implement them fully, but if one aligns with your nightly focus AND is clearly scoped, you can lay the groundwork (stub a function, add a type, create a placeholder route)

3. Scan the relevant part of the codebase using Grep and Glob. Aim for 3-8 specific improvement opportunities — don't try to fix everything, fix the most impactful ones.

4. Apply fixes directly using the Edit tool. Rules:
   - Make surgical edits — don't rewrite files wholesale
   - Don't change behavior, only improve quality
   - If a fix is risky or unclear, skip it and note it in the log
   - Maximum 10 file edits per night — stay focused

5. Write a log entry to /sessions/funny-eager-cori/mnt/Consulting_app/docs/code-evolution/[TODAY'S DATE YYYY-MM-DD].md:

# Code Evolution — [DATE]
**Focus:** [Today's focus area]
**Files touched:** [count]
**Feature ideas reviewed:** [titles from feature-radar, if any]

## Changes Made
### [filename]
- [What was changed and why]

## Feature Groundwork (if any)
### [feature name from radar]
- [What was stubbed/scaffolded and where]

## Skipped (too risky or complex)
- [filename]: [Why skipped]

## Patterns Noticed
[1-2 sentences on recurring issues spotted that future runs should address]

## Constraints
- Never delete files
- Never change test files unless clearly broken
- Never touch .env, migration files, or schema files
- Keep each change small enough that it's obviously safe in isolation
- Log everything including decisions NOT to change
```
