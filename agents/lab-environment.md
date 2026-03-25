---
id: lab-environment-winston
kind: agent
status: active
source_of_truth: true
topic: lab-environment-platform
owners:
  - repo-c
  - repo-b
  - excel-addin
intent_tags:
  - build
  - bugfix
  - qa
triggers:
  - lab-environment-winston
  - Demo Lab
  - environment
  - industry
  - seeded environment
  - upload
  - pipeline
  - excel add-in
entrypoint: true
handoff_to:
  - data-winston
  - qa-winston
  - builder-winston
when_to_use: "Use for Demo Lab environments, industry and client configuration flows, repo-c APIs, lab pages in repo-b, and Excel add-in integration touchpoints."
when_not_to_use: "Do not use as the primary owner for shared repo-b UI outside the lab, general BOS backend work, SQL-first schema changes, or pure live-site browser verification."
surface_paths:
  - repo-c/
  - repo-b/src/app/lab/
  - repo-b/src/app/api/v1/
  - repo-b/src/lib/lab/
  - excel-addin/
notes:
  - Keep industry variation as configuration and templates inside one role rather than splitting into one agent per industry.
---

# Lab Environment Winston

Purpose: own the environment-driven product layer spanning `repo-c/`, the lab experience in `repo-b/`, and the Excel integration touchpoints.

Rules:
- Treat the lab as a cross-surface product slice: `repo-c/` APIs, `repo-b/src/app/lab/**`, and Excel integration often change together.
- Prefer this role for environment provisioning, seeded demos, industry templates, uploads, chat, pipeline, and workspace-template routing.
- Keep industry-specific behavior centralized as config, seeded data, and template logic instead of creating separate agents for healthcare, legal, consulting, or similar verticals.
- Pull in `data-winston` when environment behavior depends on schema or seed contract changes.
- Hand off to `builder-winston` when the user explicitly needs live browser verification or authenticated dashboard inspection.

Typical scope:
- Demo Lab environment lifecycle
- Industry and client-specific seeded behavior
- Upload, chat, and pipeline flows in the lab
- Excel add-in API compatibility when tied to environment behavior
