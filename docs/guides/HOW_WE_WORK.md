# How Paul + Claude Work Together

> Rules of engagement for our Claude Cowork sessions.
> Informed by Allie K. Miller's Forbes walkthrough (Feb 24, 2026) and our own patterns.
> Source: https://www.forbes.com/sites/jodiecook/2026/02/24/how-to-use-claude-cowork-to-run-your-business-with-ai/

---

## The core principle

Every hour spent on work a robot can do is an hour stolen from work that actually moves the business forward. Claude handles the busywork. Paul handles the growth decisions.

---

## Rules for Paul

### 1. Write detailed prompts — every time
Vague prompts produce vague outputs. Before starting a task, specify:
- What you want created or found
- What source material to use (which folder, file, or URL)
- What format the output should be in
- How interactive or shareable the result needs to be
- Any constraints or things to avoid

Bad: *"make a report"*
Good: *"read the audit report in the Consulting_app folder, extract every broken feature, and produce a prioritized fix list as a Word doc grouped by root cause, with effort estimates for each item"*

### 2. Point Claude at the right folder up front
Claude works best when it knows exactly where to look. At the start of any file-heavy session, confirm the workspace folder is selected and say which subfolder matters. Don't make Claude guess or search broadly when you know the path.

### 3. Intervene early, not after
Claude shows a to-do list as it works. If a step looks wrong, say so before Claude reaches it — not after it's spent time heading in the wrong direction. A short mid-task redirect is cheaper than a full redo.

### 4. Use parallel threads for independent work
Don't queue tasks sequentially when they don't depend on each other. Kick off multiple threads — one for research, one for document creation, one for code — and let them all run. Come back to finished outputs instead of waiting on each one.

### 5. Expect a "last mile" phase
The first version Claude produces is the starting point, not the finish line. Allie Miller's team ran a five-hour hackathon and the refinement phase took as long as the build phase. Budget time for a second pass. Be specific about what's missing or off.

### 6. Make the final call on anything consequential
Claude does the legwork. Paul makes the decisions. Vendor selection, investment strategy, code architecture, what gets shipped — those are judgment calls that stay with you. Use Claude's outputs as inputs to your thinking, not as final answers.

### 7. Don't micromanage the process, just the output
Once the task is running, step away. Queue follow-up instructions if you have them, then leave Claude to work. Come back and evaluate what came out. The goal is to free your attention, not redirect it into watching a progress bar.

---

## Rules for Claude

### 1. Always clarify before doing significant work
For any task that involves multiple steps, files, or decisions, ask one focused clarifying question before starting. What format? Which folder? What's the intended audience? One question is fine. Five questions is not.

### 2. Use the most capable model for important work
Prioritize quality on tasks that matter — audits, reports, code architecture, client-facing outputs. Speed can be traded for quality on drafts and quick lookups.

### 3. Show the plan, then execute
On multi-step tasks, briefly state the approach before diving in. This gives Paul the chance to redirect before time is spent going the wrong way. Especially for anything that touches code or produces a deliverable.

### 4. Produce real files, not just chat responses
If the output is a report, document, spreadsheet, or code file — create the actual file and provide a link. Don't just paste content into the conversation. Paul needs things he can open, share, and hand to a team.

### 5. Track progress openly
Use the to-do list for anything with more than two steps. Show what's done, what's in progress, what's next. This lets Paul intervene if something is heading wrong and gives him confidence that the full task is covered.

### 6. Don't modify files without being asked
Unless explicitly told to change code or data files, treat the codebase as read-only. Audit, analyze, and report — but don't edit. This is especially true in sessions where the goal is testing or research.

### 7. Be honest about limitations and uncertainty
If something isn't working, say so clearly and explain why. If the root cause is a missing environment variable, a missing API route, or absent data — name it specifically. Don't dress up failures as "areas for improvement." Paul can handle direct feedback.

### 8. Think in systems, not one-off tasks
Every task exists in context. A broken investment creation endpoint isn't just a bug — it's a gap in the fund manager's workflow. A missing environment variable isn't just a config issue — it blocks an entire feature category. Surface those connections.

### 9. Produce outputs that can be handed off
Every document, prompt, or analysis should be written so a team member (or a future Claude session) can pick it up and continue. No context trapped in the conversation. Everything lives in the files.

### 10. Respect existing architecture
Read `RULES.MD` before touching any financial logic, ledger code, or backend routes. The platform has hard constraints around financial determinism, ledger discipline, and data integrity that take precedence over convenience.

---

## How a good session looks

1. Paul opens Cowork and selects the workspace folder
2. Paul writes a specific, detailed prompt
3. Claude asks one clarifying question if needed, then states the plan
4. Claude runs the task and tracks progress via to-do list
5. Paul intervenes early if a step looks wrong
6. Claude delivers a real file (doc, spreadsheet, code, prompt)
7. Paul reviews, gives targeted feedback
8. Claude refines — this phase takes time, that's normal
9. Final output is saved to the workspace folder with a clear filename

---

## What Claude Cowork is for (and what it isn't)

**Use it for:**
- Analyzing large folders of documents (transcripts, reports, tickets)
- Building dashboards, reports, and prototypes from existing data
- Research, comparison, and structured summaries
- Producing first drafts of code, documents, and presentations
- Running parallel workstreams independently

**Keep these with Paul:**
- Final decisions on what gets built or shipped
- Vendor/partner selection
- Investment and financial judgment calls
- Anything that requires knowing the business context that isn't written down

---

*Last updated: March 2, 2026*
