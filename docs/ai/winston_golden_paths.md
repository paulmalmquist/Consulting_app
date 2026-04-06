# Winston Golden Path Test Specifications

## Meridian / REPE

### GP-1: Fund Summary
- Prompt: "give me a summary of the funds"
- Expected intent/skill: fund_summary / list_funds
- Expected scope: environment + business
- Expected tool: repe.list_funds
- Expected response block: table or structured list of funds
- Degraded fallback: list fund names with basic metadata
- Audit: read-only, no pending action

### GP-2: Fund Metrics with Slot-Fill
- Prompt: "get fund metrics for Meridian Real Estate Fund III"
- Follow-up: "2026Q1"
- Expected intent/skill: fund_metrics
- Expected scope: fund entity resolved by name
- Expected continuation: pending_query with missing_slots=["quarter"]
- Expected tool: repe.get_fund_metrics or query template
- Expected response block: metrics table (IRR, TVPI, DPI, NAV)
- Degraded fallback: return fund identity + available quarters
- Audit: read-only

### GP-3: Asset Ranking with Metric Slot-Fill
- Prompt: "best performing assets"
- Follow-up: "NOI"
- Expected continuation: pending_query with missing_slots=["metric"]
- Expected tool: repe.rank_assets or query template
- Expected response block: ranked table
- Degraded fallback: ask for supported metric or default to canonical

### GP-4: Asset Metric Lookup
- Prompt: "what is the NOI for Riverfront Apartments"
- Expected scope: asset entity resolved by name
- Expected tool: repe.get_asset_metrics
- Expected response block: metric value + context
- Degraded fallback: return asset identity + explain missing data

### GP-5: Budget Comparison
- Prompt: "compare actual vs budget"
- Expected scope: environment-level
- Expected tool: query template or analytics skill
- Degraded fallback: list available budget lines

### GP-6: Create Fund with Confirmation
- Prompt: "create a new fund"
- Expected: missing fields collected via slot-fill
- Expected: confirmation block with all fields
- Expected: after confirm -> tool executes -> DB row executed
- Expected response block: confirmation -> execution result
- Audit: pending_action created, confirmed, executed

## Resume

### GP-7: Resume Timeline Lookup
- Prompt: "when did Paul start at JLL"
- Follow-up: "yes" (if clarification needed)
- Expected scope: resume environment
- Expected tool: RAG retrieval or structured query
- Expected response block: timeline answer with confidence
- Degraded fallback: answer from RAG with confidence note

### GP-8: Resume Experience Summary
- Prompt: "summarize Paul's experience at Kayne Anderson"
- Expected scope: resume environment
- Expected tool: RAG retrieval
- Expected response block: narrative summary

### GP-9: Resume Timeline Explanation
- Prompt: "what does this timeline show"
- Expected scope: resume workspace page context
- Expected response block: structured explanation

### GP-10: Outreach Draft
- Prompt: draft employer outreach email
- Expected: draft tool -> preview -> consent -> send
- Expected: audit log entry
- Status: NOT YET IMPLEMENTED (Phase 3)

## PDS

### GP-11: Project Risk
- Prompt: "what projects are at risk right now"
- Expected scope: PDS environment
- Expected tool: PDS query or analytics skill
- Degraded fallback: list projects with available risk data

### GP-12: Budget Variance
- Prompt: "explain budget variance for [project]"
- Expected scope: project entity
- Degraded fallback: return known project + available budget lines

### GP-13: Change Order Approval
- Prompt: draft change-order approval note
- Status: BLOCKED by pending action execution (Phase 1A)
