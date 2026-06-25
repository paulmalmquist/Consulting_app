# Claude Routing Audit — 2026-06-24

## Scope

Reviewed 35 top-level Claude Code transcripts active from June 11 through
June 24, 2026:

- 453 user turns
- 12,935 tool calls
- 383 recorded tool errors
- 30 sessions using plan mode

The audit used the repository, git history, current plans, machine-local Claude
session metadata, and current instruction files. Secret values were excluded.

## Transcript inventory

### June 24

| Session | Primary work |
|---|---|
| `e6e2030c` | replay tracing and forensics |
| `a0edea6f` | Confluent contracts and Lakebase |
| `97e1e442` | stream service/start control |
| `93e75912` | telemetry frontend refactor |
| `7a5121fa` | refactor-plan execution |
| `75d41879` | streaming lineage |
| `5337240b` | Stargate Rules vs ML |
| `503a2bd8` | telemetry architecture page |
| `3917113b` | Automated Data Engineering repair |
| `38ee9ea6` | notebook/RUL gate work |
| `37f88b92` | Stargate enrichment plan |
| `10426ece` | channel names and Confluent lifecycle |
| `06b2b86b` | Relativity real-data narrative |

### June 22–23

| Session | Primary work |
|---|---|
| `2ed9d25a` | ADE productization and bug work |
| `c971674b` | ML fundamentals notebook |
| `8e9676ac` | two-agent builder harness |
| `52b2e826` | Claude/Codex plan relay |
| `25526afb` | worktree/branch consolidation |

### June 18–20

| Session | Primary work |
|---|---|
| `40de9cad` | ML Algorithm Decision Lab |
| `050f17ad` | telemetry research-gap audit |
| `f3f1483f` | telemetry control tower |
| `f2447af9` | ADE Ops and telemetry build |
| `d885b9b3` | skeptical telemetry audit |
| `4f7af774` | trades landing page |
| `963a6a41` | command/skill/harness proposals |
| `31d2f1aa` | SpaceX-derived plan |

### June 11–17

| Session | Primary work |
|---|---|
| `73ec8abf` | sequential platform plan |
| `95ce5583` | whole-repo review |
| `9248ee21` | feature discovery from prior plans |
| `8a053d0c` | Kafka/Kubernetes and CI cleanup |
| `566018a1` | RS Factory planning |
| `4c6ae50c` | History Rhymes cockpit refactor |
| `3987bba0` | Spaceflight Bottleneck Map |
| `e560df30` | consolidated platform build |
| `84f978e5` | Hone Health assessment |

## Repeated usage patterns

- 28 sessions resumed a selected plan or prior work; 48 user turns were the
  exact command `continue`.
- 31 sessions touched Databricks, Confluent, Railway, Vercel, Lakebase, or
  another live external system.
- 29 sessions emphasized provenance, real versus synthetic data, or fail-closed
  behavior.
- 28 sessions involved branches, worktrees, commits, PRs, or merges.
- 152 subagent calls were made; most were generic read-only Explore agents.
- Work commonly spans frontend, backend, data, ML, infrastructure, and evidence
  under one acceptance contract.

The observed delivery rhythm is:

`inspect → plan → approve → implement → test → PR/merge → production verify`

## Repeated failure modes

- 108 write-before-read errors.
- 45 wrong or missing paths, including accidental `repo-b/repo-b`.
- Five unknown-skill failures for `azure-devops-intake`,
  `.skills/azure-devops-intake`, and `winston-session-bootstrap`.
- Concurrent agents changed the shared checkout branch/index and duplicated PR
  work.
- Sessions repeatedly rediscovered deployment topology, database ownership,
  test commands, and serving paths.
- Large startup instructions and pasted plans accumulated stale product detail.

## Instruction findings

- `CLAUDE.md` was 480 lines and referenced nonexistent skills and retired
  surfaces.
- Repo skills existed in `skills/` and `.skills/`, but there was no project
  `.claude/skills/` discovery layer.
- The routing validator scanned every markdown file as if it shared one
  frontmatter schema, then crashed on valid skills that used another format.
- The routing test constructed `C:\C:\...` on Windows.
- `repo-c/`, old local paths, old production domains, and contradictory deploy
  rules remained in active instructions.
- Universal ADO intake did not match actual usage and was often not executable.
- `docs/tips.md` had become a large knowledge base rather than short startup
  memory.

## Decisions implemented

- Compact `CLAUDE.md`; machine routing in `config/instruction-routing.json`.
- Generated `.claude/skills/` wrappers and generated instruction index.
- R0/R1/R2 ADO policy.
- Dedicated worktree before mutation.
- One primary writer; supporting agents read-only by default.
- Full delivery remains the CODE-session default.
- Frontend deploys from merged main; backend deploys from a clean main checkout.
- Durable lessons go to `docs/tips.md`; temporary state does not.

## Deferred

- Splitting or archiving the large `docs/tips.md`.
- Cleaning machine-local Claude memory and credential-bearing historical notes.
- Converting OpenClaw role docs into Claude Code custom subagents.
- Broad normalization of historical skills that remain available but are not
  globally routed.
