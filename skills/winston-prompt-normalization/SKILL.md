---
id: winston-prompt-normalization
kind: skill
status: active
source_of_truth: true
topic: prompt-normalization
owners:
  - docs
  - cross-repo
intent_tags:
  - docs
  - prompts
  - refactor
triggers:
  - convert prompt to skill
  - normalize meta prompt
  - prompt cleanup
  - instruction cleanup
  - retire prompt
entrypoint: true
handoff_to:
  - instruction-index
  - architect-winston
when_to_use: "Use when the task is to scan Winston prompt docs, decide whether they should become skills, and create or update the normalized skill plus routing docs."
when_not_to_use: "Do not use for carrying out the product work inside a prompt after an active domain skill already owns that workflow."
surface_paths:
  - CLAUDE.md
  - docs/
  - skills/
  - .skills/
name: winston-prompt-normalization
description: "Normalize Winston meta prompts into durable skills. Use for scanning prompt docs, classifying keep vs convert vs archive, creating skill wrappers, and updating CLAUDE.md plus docs/instruction-index.md."
---

# Winston Prompt Normalization

Use this skill when the instruction system itself is the work product.

## Load Order

- `../../CLAUDE.md`
- `../../docs/instruction-index.md`
- the prompt docs named in the request
- if the request is broad, scan:
  - `../../docs/WINSTON_*PROMPT*.md`
  - `../../docs/plans/*META_PROMPT*.md`
  - `../../META_PROMPT_CHAT_WORKSPACE.md`
  - `../../PDS_META_PROMPTS.md`

## Classification Rules

- Convert to a skill when a prompt encodes a repeatable workflow, stable owning surfaces, reusable validation steps, or recurring operator language.
- Keep a prompt as reference when it is mostly deep implementation detail, evidence, or a long spec that the skill can load selectively.
- Archive a prompt when it is obsolete, superseded, or already just historical scaffolding.
- Do not create a new skill when an active skill already owns the workflow. Extend the existing skill and demote the prompt to reference instead.

## Extraction Pattern

Create or update the skill with only the durable contract:

- route triggers and `when_to_use`
- load order
- working rules
- prompt lessons
- exit condition

Leave long implementation detail in the source prompt or move it into a reference file instead of copying it into `SKILL.md`.

## Required Repo Updates

- add or update the skill under `skills/` or `.skills/`
- register it in `../../CLAUDE.md` intent taxonomy and at least one concrete routing example
- register it in `../../docs/instruction-index.md`
- if a raw prompt is now secondary, update its status or notes so it reads as reference material rather than the primary workflow
- validate with:
  - `npm run validate:instructions`
  - `npm run test:instructions`

## Scan Checklist

1. Inventory prompt-like docs and group them by owning surface.
2. Map each prompt to an existing skill, a new skill, or archive/reference status.
3. Prefer merging into an existing skill over creating overlapping skills.
4. Keep one primary entrypoint per workflow.
5. Summarize the result as:
   - already normalized
   - convert now
   - keep as reference
   - archive

## Exit Condition

- The repo has a reusable skill for the normalization pass.
- `CLAUDE.md` and `docs/instruction-index.md` know about it.
- Validation passes, or failures are reported clearly.
