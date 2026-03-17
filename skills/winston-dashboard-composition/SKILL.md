---
id: winston-dashboard-composition
kind: skill
status: active
source_of_truth: true
topic: dashboard-composition
owners:
  - repo-b
  - backend
intent_tags:
  - build
  - dashboard
  - prompt
triggers:
  - dashboard composition
  - intent parsing
  - query transparency
  - blank widgets
  - entity_ids
  - dashboard generate
entrypoint: true
handoff_to:
  - feature-dev
  - qa-winston
when_to_use: "Use when the task involves dashboard intent parsing, composition logic, query manifests, data validation, or blank-widget/entity-resolution failures."
when_not_to_use: "Do not use for chat-route UX work unless the request explicitly centers the chat workspace rather than the dashboard builder."
surface_paths:
  - prompts/
  - repo-b/src/app/api/re/v2/dashboards/
  - repo-b/src/lib/dashboards/
  - backend/app/routes/
name: winston-dashboard-composition
description: "Dashboard composition and intent skill for Winston. Use for generate-route intent parsing, section/archetype composition, query transparency, data validation, and dashboard data hydration regressions."
---

# Winston Dashboard Composition

Use the latest corrective prompt first, then load older intent docs only for original design context.

## Load Order

- `../../prompts/composition-engine-v2.md`
- `../../prompts/llm-intent-data-validation-query-transparency.md` when touching manifests, validation, or the AI intent hop
- `../../prompts/fix-dashboard-entity-ids.md` when widgets render blank or scope hydration fails
- `../../prompts/dashboard-composition-engine.md` for the original section-based intent model

## Working Rules

- Keep intent parsing, composition, validation, and entity hydration as separate concerns.
- Prefer additive migration paths over deleting the older fallback flow until prompt-to-spec coverage is proven.
- If a corrective prompt exists, trust it over the first aspirational prompt.
- Test both structure and data: a spec that composes correctly but hydrates blank widgets is still broken.

## Prompt Lessons From The Source Docs

- The first dashboard prompt was directionally right but too open-ended; later prompts had to name exact files, locations, and fallback behavior.
- The corrections show the real failure pattern: prompt-only intent work without data validation and entity resolution is incomplete.
- The stable Winston prompting shape here is: current state, exact files, explicit symptom, phased changes, and verification.

## Exit Condition

- Verify at least one prompt-to-spec path.
- Verify one rendered dashboard with hydrated widget data, not placeholder structure alone.

