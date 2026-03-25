# Winston Feature Radar — Noon Scan
**Date:** 2026-03-25
**Run:** noon-feature-ideas (supplementary to morning product-feature-radar)
**Note:** No morning radar file existed for today — this is the first feature-radar entry for 2026-03-25.

---

## New AI Capabilities Detected (March 24–25, 2026)

### 1. GPT-5.4 Native Computer Use — Winston UI Automation Opportunity
**Signal:** OpenAI's GPT-5.4 (landed March 5, now widely integrated) ships with significantly improved native computer use — operating UIs directly, not through purpose-built APIs.
**Gap in Winston:** Winston's AI gateway routes to models for text/RAG/reasoning, but has no computer-use dispatch pathway. Winston currently cannot automate tasks inside external REPE tools (Yardi, Argus, LP portals) even when a user asks it to.
**Proposed Winston upgrade:** Add a `computer_use` capability flag to the model dispatch layer in `ai_gateway.py`. When a user asks Winston to "pull the latest rent roll from Yardi" or "download the Q1 report from the LP portal," route to a computer-use-capable model tier and return structured output. This positions Winston as an operator, not just an analyst.
**Implementation score:** 7/10 — gateway dispatch change + new MCP tool category (`nv_computer_use`). Leverage existing `backend/app/mcp/` registry pattern.
**Surface:** `agents/ai-copilot.md`, `agents/mcp.md`

---

### 2. DeepSeek-V3.2 Thinking-in-Tool-Use — Winston Agentic Reasoning Upgrade
**Signal:** DeepSeek-V3.2 now integrates chain-of-thought reasoning directly into tool call sequences — the model can "think" mid-tool-use, not just before issuing a call. This is the first open-source model to support thinking in both thinking and non-thinking modes during tool invocation.
**Gap in Winston:** Winston's tool-calling flow (MCP → gateway → response blocks) is stateless between tool calls. There is no mid-sequence reasoning step — the model decides, calls, and renders. Complex multi-step REPE queries (e.g., "compute IRR for all assets with cap rate stress, then flag covenant violations") require chaining that currently breaks into separate user turns.
**Proposed Winston upgrade:** Introduce a `reasoning_budget` parameter in the MCP planner contract. For high-complexity queries (flagged by intent scorer), allocate a mid-chain thinking step before each tool call. Route to DeepSeek-V3.2 (cost-efficient open source) for these longer agentic chains to keep token budget under control.
**Implementation score:** 8/10 — high value for REPE multi-hop queries, moderate implementation complexity. Touches `winston-performance-architecture` and MCP planner contract.
**Surface:** `skills/winston-performance-architecture/SKILL.md`, `agents/mcp.md`

---

### 3. Gemini Embedding 2 Multimodal Retrieval — Winston Cross-Modal RAG
**Signal:** Google released Gemini Embedding 2 — a single embedding space spanning text, images, video, audio, and documents. This enables retrieval across modalities without separate pipelines.
**Gap in Winston:** Winston's RAG system (`rag_indexer`, `rag_reranker`, PsychRAG) is text-only. REPE workflows involve rent rolls as PDFs with embedded tables, site photos, floor plan images, and scanned loan documents. Users asking "show me assets with deferred maintenance visible in site photos" currently get no results because images are not indexed.
**Proposed Winston upgrade:** Add a multimodal ingestion path to `rag_indexer` using a Gemini Embedding 2 (or equivalent) connector. Index document images and attached photos into the same vector store as text. Expose a `modality` filter in the RAG query layer so users can restrict retrieval to "documents," "images," or "all."
**Implementation score:** 9/10 — high differentiation for REPE document workflows, directly addresses a gap competitors haven't solved well. Touches `agents/ai-copilot.md` and document pipeline skill.
**Surface:** `skills/winston-document-pipeline/SKILL.md`, `agents/ai-copilot.md`

---

### 4. Adaptive Thinking / Dynamic Compute Allocation — Winston Query Tier Routing
**Signal:** New frontier models support "adaptive thinking" — dynamically allocating computational budget based on prompt complexity. Simple queries skip the reasoning phase; complex ones get extended thinking.
**Gap in Winston:** The AI gateway today dispatches based on model name config, not prompt complexity. A simple "show fund list" and a complex "run Monte Carlo stress test across all assets" hit the same model tier, wasting tokens on simple queries and potentially under-resourcing complex ones.
**Proposed Winston upgrade:** Build a lightweight complexity classifier at the gateway entry point (can use a fast small model or heuristic scorer). Route "simple" queries (data retrieval, filter, display) to a fast/cheap tier; route "complex" queries (financial modeling, multi-asset computation, scenario generation) to the extended-thinking tier. Expose the tier decision in the UI as a subtle "thinking depth" indicator.
**Implementation score:** 8/10 — directly improves latency on simple queries AND quality on complex ones. Aligns with existing `winston-performance-architecture` skill.
**Surface:** `skills/winston-performance-architecture/SKILL.md`

---

### 5. SLM Fine-Tuning for REPE Domain — Winston Private Model Layer
**Signal:** The 2026 enterprise AI trend is fine-tuned small language models (SLMs) outperforming large generalist models on domain-specific tasks at dramatically lower cost. Mature AI enterprises are deploying private SLMs trained on proprietary domain data.
**Gap in Winston:** Winston currently has no fine-tuning pipeline. All domain knowledge is encoded in RAG + prompt context. As Winston accumulates REPE-specific data (fund structures, LP waterfall templates, covenant definitions), there is latent value in a fine-tuned REPE SLM that could reduce hallucination on domain terminology and cut per-query cost.
**Proposed Winston upgrade:** Design a fine-tuning data export pipeline that converts Winston's structured REPE data (deals, assets, fund metrics) into instruction-following training pairs. Define a `winston-repe-slm` model slot in the gateway that can be swapped in once fine-tuning is complete. Start with covenant and waterfall terminology — highest hallucination risk, most verifiable ground truth.
**Implementation score:** 6/10 — high long-term value, lower near-term urgency. Strategic investment. Flag for 60-day roadmap.
**Surface:** `agents/ai-copilot.md`, `agents/data.md`

---

### 6. Agentic AI in Proptech — Competitor Pressure Signal
**Signal:** $4.5B of the $16.7B proptech investment in 2025 went to AI companies. Investors are pouring billions into AI proptech in 2026 but winners are unclear. The market is moving from "pilot projects to mission-critical infrastructure" across deal underwriting and building operations.
**Strategic implication for Winston:** The window to establish defensible AI positioning in REPE is 12–18 months. Winston's multi-environment architecture (32 lab types, 258 pages, 208 services) is a structural moat — no competitor has matched the breadth. The risk is that well-funded vertical AI entrants (Cherre, Dealpath, Yardi's AI layer) achieve depth in one workflow before Winston deepens its existing surfaces.
**Recommendation:** Prioritize depth over breadth for the next 90 days. The chat workspace Bug 0 (execution narration regression) is the highest-leverage fix — it's the primary AI interaction surface and is currently degraded. Fix Bug 0 before launching new capabilities.
**Surface:** `META_PROMPT_CHAT_WORKSPACE.md` (Bug 0 fix), `skills/winston-remediation-playbook/SKILL.md`

---

## Impact Statement

New ideas beyond morning radar: **6**
(No morning radar file existed for 2026-03-25; this run produced the day's first feature-radar entry.)

Top priority recommendations ranked by implementation score:
1. Gemini Embedding 2 / Multimodal RAG — score 9/10
2. DeepSeek-V3.2 Thinking-in-Tool-Use / Mid-chain reasoning — score 8/10
3. Adaptive Thinking / Query Tier Routing — score 8/10
4. GPT-5.4 Computer Use dispatch — score 7/10
5. SLM Fine-tuning pipeline — score 6/10 (60-day horizon)
6. Bug 0 fix (strategic urgency, not a new feature) — address immediately
