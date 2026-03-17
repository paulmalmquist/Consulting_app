---
id: winston-session-bootstrap
kind: skill
status: active
source_of_truth: true
topic: repo-session-bootstrap
owners:
  - cross-repo
intent_tags:
  - docs
  - bootstrap
  - routing
triggers:
  - bootstrap
  - session startup
  - repo identity
  - working directory
  - Winston workspace
entrypoint: true
handoff_to:
  - winston-router
  - research-ingest
when_to_use: "Use when a request is really about starting, grounding, or sanity-checking a Winston repo-local session rather than doing feature work."
when_not_to_use: "Do not use once a narrower build, QA, deploy, sync, research, or domain skill has already been selected."
surface_paths:
  - BOOTSTRAP.md
  - TOOLS.md
  - IDENTITY.md
  - USER.md
  - SOUL.md
  - HEARTBEAT.md
  - RESEARCH.md
name: winston-session-bootstrap
description: "Bootstrap and grounding skill for Winston repo-local sessions. Use for session startup, repo identity, cwd sanity checks, research routing, and local operating assumptions before a narrower skill takes over."
---

# Winston Session Bootstrap

Use this skill to normalize the repo-local starting context, then hand off quickly.

## Load First

- `../../BOOTSTRAP.md`
- `../../TOOLS.md`
- `../../IDENTITY.md`
- `../../USER.md`
- `../../SOUL.md`
- `../../HEARTBEAT.md`
- `../../RESEARCH.md` only if the request is actually about research routing

## Working Rules

- Confirm the task is in the Winston repo root before doing anything else.
- Treat these files as startup context, not as the main execution plan for feature work.
- Once the request resolves to build, QA, deploy, sync, credit, dashboards, chat, or PDS, switch to the narrower skill.

## Prompt Lessons From These Files

- The bootstrap docs work best as a compact grounding bundle, not as six separate loose prompts.
- Repo identity, cwd, and research-tier rules are durable startup context; they should not be re-explained in downstream prompts.
- Good startup prompting here is short: repo, user expectation, operating stance, then handoff.

## Exit Condition

- State the active repo context in one sentence.
- Identify the next skill, agent, or surface that should own the task.

