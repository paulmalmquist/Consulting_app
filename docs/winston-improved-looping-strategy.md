# Winston Improved Looping Strategy

## Purpose

This document captures the improved local validation strategy for Winston after the first serious round of runtime hardening, live eval work, and production testing.

The main lesson is simple:

Winston was tested well as a runtime skeleton, but not well enough as a real product used from real pages with real human phrasing.

The improved loop fixes that.

Winston must be tested as:

`context -> lane -> skill -> retrieval -> tools -> receipts -> UI`

The loop must optimize for:

1. trustworthiness
2. diagnosability
3. reproducibility
4. speed of local iteration

It must punish:

1. hidden fallback behavior
2. generic degraded messages that hide the real issue
3. smooth answers with wrong receipts
4. cross-environment contamination
5. page-level capability gaps masked by backend-only tests

## Core Principle

Do not let Winston pass just because it did not hallucinate.

A safe degraded answer is better than a fake answer, but it is still a failure if the page should reasonably support the request.

The loop must distinguish between:

1. safe failure on unsupported context
2. unjustified failure on supported context
3. wrong answer with good wording
4. correct answer with truthful receipts

The last one is the only real win.

## What Went Wrong In The Earlier Testing

The earlier loop did several things right:

1. tested receipts
2. tested degraded behavior
3. tested ambiguity
4. tested retrieval-empty paths
5. tested denied writes
6. tested contamination
7. tested frontend rendering of receipts

But it under-tested the real usage pattern:

1. authenticated live browser state
2. actual route-level context propagation
3. broad human prompts on real pages
4. the distinction between entity context existing and grounded analysis being available

Example miss:

On a real fund detail page, Winston correctly knew the user was on a specific fund, but still responded:

`Not available in the current context.`

That means:

1. UI context was probably correct
2. backend execution was probably not grounded enough for the requested skill
3. the degraded copy was too generic and hid the real failure mode

This should have been caught by a page-level golden scenario, not just a backend scenario.

## Improved Looping Strategy

### 1. Test The Real Product Surface First

Every major Winston surface should have golden scenarios taken from real use, not synthetic toy prompts.

Priority surfaces:

1. RE environment overview pages
2. fund detail pages
3. asset detail pages
4. Novendor operational surfaces
5. public/personal pages where Winston is present
6. any page with potential write behavior

Each page-level scenario must include:

1. route
2. environment
3. selected entity
4. visible context assumptions
5. prompt
6. expected lane
7. expected skill
8. expected retrieval behavior
9. expected degraded behavior if applicable
10. expected answer traits
11. forbidden answer traits

### 2. Capture Request IDs From The Real UI

Every live test should begin with a real browser-issued request, not just a direct runtime call.

Workflow:

1. run the prompt from the real page
2. capture the `[winston-assistant]` console trace
3. record the `request_id`
4. inspect Railway logs with that exact id
5. compare frontend-visible context vs backend-resolved context vs final receipt

This closes the gap between:

1. what the page thought it sent
2. what the backend thought it received
3. what Winston actually did

### 3. Treat Page Contracts As First-Class

Winston should not only be tested by abstract skills like `lookup_entity` or `run_analysis`.

It should also be tested by page capability.

Examples:

1. fund detail page should support a broad performance summary
2. RE overview page should support environment-level portfolio questions
3. write-capable pages should produce pending-action behavior instead of silent failure
4. public pages should answer page-local questions without pretending to know internal business data

This creates a second validation layer:

1. runtime correctness
2. page usefulness

Winston must pass both.

### 4. Make Fallback Usage Visible And Unacceptable By Default

Legacy fallback should be treated as debt, not as invisible resilience.

For every fallback invocation, record:

1. `fallback_used`
2. `fallback_reason`
3. environment
4. route
5. scenario id
6. whether fallback changed lane
7. whether fallback changed skill
8. whether fallback changed retrieval behavior

Metrics to track:

1. fallback rate
2. low-confidence dispatch rate
3. invalid dispatch schema rate
4. dispatch/code disagreement rate

The goal is not zero immediately.

The goal is to see the buckets clearly and drive them down intentionally.

### 5. Force Grounding For Grounded Skills

Some skills should never be allowed to answer from vibes.

Retrieval-required skills should include at least:

1. `generate_lp_summary`
2. `explain_metric`
3. `run_analysis`
4. debt-watch / variance / occupancy / underwriting comparison requests
5. broad “performance” prompts on fund or asset pages when the answer depends on data

Rules:

1. if a skill requires grounding, retrieval cannot be silently skipped
2. if retrieval is empty, return `retrieval_empty`
3. if the page only supports visible-metrics summarization, that should be a separate deterministic path
4. do not allow polished unsupported analysis

### 6. Tighten Ambiguity Handling Before Retrieval

Ambiguity must be resolved before Winston spends time retrieving or analyzing.

Priority ambiguity cases:

1. `this one`
2. `the other fund`
3. `the second one`
4. `run it for this asset`
5. stale page context competing with current route context
6. multiple selected entities in scope

Rule:

If the target entity is ambiguous, degrade early with `ambiguous_context`.

Do not guess.

### 7. Test Denied Writes Like A Real Operator Would Ask

Denied-write testing should use normal human phrasing, not just explicit admin verbs.

Required prompts:

1. `make a new fund called Sunrise`
2. `create a new deal called Meridian West`
3. `update this record`
4. `change occupancy to 92`
5. `fix this number`

Expected behavior:

1. write intent detected
2. confirmation required
3. no silent write
4. pending action receipt emitted where appropriate
5. frontend renders pending state cleanly

### 8. Attack Cross-Environment Contamination Aggressively

This is one of Winston’s biggest trust risks.

Run bait scenarios that try to leak state:

1. Novendor-style ask while on Meridian
2. REPE-style ask on PDS
3. stale prior-turn reference after route switch
4. same prompt across multiple environments

Track:

1. contamination rate
2. context leak rate
3. retrieval leak rate
4. answer leak rate

A low overall pass rate is easier to recover from than cross-environment contamination.

Contamination must trend to zero.

### 9. Build Golden Scenarios From Real Human Language

The loop should no longer over-index on explicit, technical prompts only.

Add real prompt families like:

1. `give me a rundown of this fund's performance`
2. `how is this fund doing`
3. `what am I looking at`
4. `what data is this based on`
5. `why is NOI down vs underwriting`
6. `who should I follow up with today`
7. `create a deal called Meridian West`
8. `what's going on here`
9. `use whatever data you have`
10. `why'd you say that`

Each family should expand into:

1. terse
2. executive
3. sloppy
4. pronoun-heavy
5. ambiguous
6. broad
7. justification/source-seeking
8. write-intent variant

### 10. Distinguish Runtime Passes From Product Passes

A scenario can pass the runtime and still fail the product.

Example:

1. entity context resolved
2. no hallucination
3. degraded safely
4. but the page should reasonably support the ask

That should be treated as a product failure, not a reassuring pass.

Add a separate judgment layer:

1. `runtime_pass`
2. `product_pass`

Both should be visible in reports.

### 11. Improve Logging So Diagnosis Is One-Step

Current logs are useful but incomplete.

Every assistant turn should log, by `request_id`:

1. context resolution
2. dispatch selection
3. retrieval receipt summary
4. retrieval empty reason
5. tool receipts
6. pending action receipt
7. final `TurnReceipt.status`
8. final `degraded_reason`

That allows one-command inspection in Railway:

```bash
railway logs --service authentic-sparkle --since 15m --filter "req_<request_id>"
```

Without that, too much diagnosis still relies on inference.

### 12. Keep Latency Honest

Latency should be tracked separately from correctness.

For every run, record:

1. total duration
2. time to first token
3. context resolution time
4. retrieval time
5. tool time
6. rendering time

Then classify each scenario:

1. fast and correct
2. slow and correct
3. fast and wrong
4. slow and wrong

These are very different problems.

Slow and wrong is the highest priority.

## The New Loop Order

### Loop 1: Page Truth Smoke Loop

Run on every meaningful change.

Focus:

1. a few high-value real pages
2. real operator prompts
3. request id capture
4. real backend log verification

Examples:

1. fund detail page
2. RE overview page
3. Novendor follow-up page
4. write-intent page

### Loop 2: Runtime Regression Loop

Run after each batch of runtime changes.

Focus:

1. receipts
2. degraded behavior
3. denied writes
4. ambiguity
5. retrieval empty
6. contamination
7. latency budgets

### Loop 3: Mutation + Chaos Loop

Run after the base flows are green.

Focus:

1. ugly phrasing
2. broken context
3. empty retrieval
4. wrong-scope retrieval
5. malformed tool output
6. slow stream
7. missing receipt fields

### Loop 4: Longer Continuous Loop

Only after the first three are stable.

Focus:

1. drift detection
2. environment scorecards
3. pairwise comparison with last-good baseline
4. fallback reduction
5. contamination trend

## Minimum Golden Scenarios That Must Exist

The loop is not mature unless it includes at least:

1. fund detail page + `give me a rundown of this fund's performance`
2. fund detail page + `what data is this based on`
3. RE overview page + `give me a rundown of each fund's performance`
4. missing entity + `run a downside scenario on this asset`
5. denied write + `create a new deal called Meridian West`
6. ambiguity + `show me this one`
7. retrieval empty + debt watch or occupancy prompt
8. contamination bait across at least Meridian and Novendor

## Reporting Expectations

Each cycle should answer:

1. what failed most often
2. what improved
3. what got slower
4. what still hallucinates
5. what still falls back
6. what still contaminates
7. which environment is weakest
8. which page contracts are weakest
9. which files are most implicated

## What Not To Do

Do not:

1. add more framework modules just to feel sophisticated
2. count safe degraded responses as product wins
3. over-trust backend-only tests
4. use regex sprawl as the main routing brain
5. let polished answer text outweigh wrong receipts
6. chase prose quality before grounding and usefulness

## Working Standard

Winston is not “good” when it merely avoids hallucinating.

Winston is good when:

1. it knows what page and entity it is on
2. it chooses the right skill and lane
3. it grounds when grounding is required
4. it refuses unsafe actions cleanly
5. it explains what it did in receipts
6. it stays scoped to the current environment
7. it is actually useful on the page where the user asked

That is the standard this loop should enforce.
