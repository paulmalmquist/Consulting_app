# AI Test Case: Execution Narration Layer
## Category: Complex multi-step architectural spec
## Source: Real snafu — raw tool spam exposed to UI (2026-03-19)
## Use: Nightly Winston AI feature testing — send as prompt, evaluate response quality

---

## Why This Is a Good Test Case

This spec was the source of a real production snafu: the Winston AI tool was exposing raw tool execution logs (repeated `repe.get_asset` calls, retry attempts, validation errors, internal identifiers) directly to the UI. This prompt tests whether Winston:

1. Can handle a long, structured, multi-deliverable architectural request
2. Produces a structured, actionable response (not hallucinated vagueness)
3. Correctly identifies which repo files to touch (repo-b frontend + backend services)
4. Routes to the right skill (`feature-dev` or `ai-copilot` agent per CLAUDE.md)
5. Doesn't time out or produce truncated output on a large spec

---

## Test Prompt to Send to Winston Chat

**IMPORTANT: This must be a realistic USER query, not an implementation spec. The AI tester sends this directly to the production Winston chat UI. Internal specs should NEVER be pasted into the chat.**

```
Compare the top 3 assets by NOI across all funds, and show me which ones have the highest cap rate improvement over the last 4 quarters.
```

This prompt tests execution narration because it requires multiple tool calls (asset lookup, NOI data, cap rate history) that should be narrated cleanly to the user rather than exposed as raw tool spam.

## DO NOT SEND (Internal Reference Only)

The full implementation spec for the execution narration layer lives in `META_PROMPT_CHAT_WORKSPACE.md` under Bug 0. It is reference material for the coding agent, NOT a test prompt.

---

## Expected Response Characteristics

A good Winston response to this prompt should:

- **Route correctly** to `agents/ai-copilot.md` + `.skills/feature-dev/SKILL.md`
- **Name specific files** — at minimum:
  - `backend/app/services/ai_gateway.py` (RunNarrator class)
  - `repo-b/src/components/winston/blocks/ToolActivityBlock.tsx` (StepRenderer)
  - `repo-b/src/lib/commandbar/assistantApi.ts` (step event handling)
- **Produce a step mapping table** for known MCP tools (repe.*, finance.*, rag.*)
- **Address the debug mode toggle** specifically
- **Not hallucinate file paths** that don't exist in the repo

## Red Flags (What Bad Output Looks Like)

- Generic answer with no file paths
- Suggests creating new files that already exist (e.g., suggests creating `ExecutionTimeline.tsx` when it already exists)
- Truncated mid-response
- Streaming stalls or produces tool call spam visible in the UI (meta-ironic given the subject)
- Produces a plan that requires MCP tools we don't have

---

## Evaluation Rubric

| Criterion | Pass | Fail |
|---|---|---|
| Response time to first token | < 3 seconds | > 8 seconds |
| File paths cited | ≥ 3 real repo paths | 0 real paths OR invented paths |
| Step model defined | Yes, with id/label/status | Missing or vague |
| Tool → step mapping provided | ≥ 5 tool mappings | Not provided |
| Debug mode addressed | Yes | Not mentioned |
| Response completeness | Full implementation plan | Truncated |
| Tool call spam in UI | Not visible | Visible (this is the bug being fixed) |

---

## Related Files in Repo

- `backend/app/services/ai_gateway.py` — SSE emit + tool execution wrapper
- `backend/app/services/assistant_blocks.py` — block builders
- `repo-b/src/components/commandbar/ExecutionTimeline.tsx` — existing tool activity UI (reuse this)
- `repo-b/src/lib/commandbar/assistantApi.ts` — SSE event handler
- `repo-b/src/components/winston/blocks/ToolActivityBlock.tsx` — to be created per meta prompt

## Tags

`streaming` `sse` `tool-narration` `ux` `execution-layer` `debug-mode` `step-model`
