# Pitch Forge Deck — Autonomous Presentation Builder

**Owner:** Novendor / Hallboys engagement
**Status:** Active
**Trigger:** "build me a deck", "here's an idea for a presentation", "give me 3 iterations", "pitch deck for [topic]", "run pitch forge", "Sarat review this"

---

## What this skill does

Takes a pitch idea and runs a fully autonomous loop — no external API keys, no subprocess, no web UI:

1. I generate structured slide content directly (as Claude)
2. I build the `.pptx` using python-pptx in the sandbox
3. I run the Sarat Mode critique myself
4. If WEAK or REJECT, I rebuild incorporating the critique and repeat
5. I hand you the best `.pptx` with a link to open it

---

## Step 0 — Intake

Use `AskUserQuestion` before starting. Collect in a single question:

- **topic** — what is the pitch about? (required)
- **client_name** — who is the audience? (default: "the client")
- **iterations** — how many rounds? 1, 2, or 3 (default: 3)
- **constraints** — anything off-limits? (e.g. "no new headcount", "Acumatica is system of record")

If the user already provided some of these, only ask for what's missing. If the message is fully specified, skip the question and start.

---

## Step 1 — Generate slide content (I do this)

For each iteration, I generate a 12-slide JSON structure using this schema:

```json
{
  "title": "Presentation title",
  "subtitle": "One-line subtitle",
  "slides": [
    {
      "slide_num": 1,
      "layout": "title",
      "title": "...",
      "subtitle": "...",
      "notes": "Speaker note"
    },
    {
      "slide_num": 2,
      "layout": "section_header",
      "title": "...",
      "body": "One framing sentence",
      "notes": "..."
    }
  ]
}
```

**Layout options:**
- `title` — slide 1 only. Fields: title, subtitle
- `section_header` — divider slides. Fields: title, body
- `bullets` — standard content. Fields: title, subtitle (optional), points (list)
- `two_column` — comparison. Fields: title, left_header, left_points, right_header, right_points
- `stat_callout` — big number. Fields: title, stat, stat_label, body
- `quote` — pull quote. Fields: title, quote, attribution
- `table` — data grid. Fields: title, headers (list), rows (list of lists)
- `closing` — slide 12 only. Fields: title, body

**Hard rules on content:**
- Every claim ties to the specific client — no generic industry statements
- Impact claims require a number or timeframe ("3 hours saved per invoice cycle", not "significant time savings")
- Banned phrases — never write: streamline, leverage, unlock, synergy, transform, revolutionize, game-changing, cutting-edge, world-class, best-in-class, seamlessly, holistic, end-to-end, robust, scalable solution, empower, optimize, innovative, unlock value, drive efficiency
- Slide 1: always `title` layout
- Slide 12: always `closing` layout
- If rebuilding after critique: directly address every REJECT and WEAK section from the prior critique

---

## Step 2 — Build the .pptx (bash + python-pptx)

After generating the slide JSON, run:

```bash
pip install python-pptx --break-system-packages -q
```

Then write and execute a Python script that:
- Uses **Midnight Executive** palette: navy `1E2761`, ice blue `CADBFC`, white `FFFFFF`
- Dark navy header bar on content slides, full navy background on title/section/closing
- Calibri body font, Georgia for titles
- Layout-specific rendering per the schema above
- Slide number bottom-right on all slides except title and closing

Save output to: `C:\Projects\Consulting_app\demo_docs\pitch_forge_deck\iteration_<N>\presentation.pptx`

Also copy the final best deck to the workspace root so the user can open it directly.

---

## Step 3 — Run Sarat Mode critique (I do this)

After building, I run the critique internally using the `SARAT_CRITIQUE_LENSES` and `SARAT_OBJECTION_STACK` from `pitch_forge_prompts.py`.

Six required lenses — I assess every slide against all six:
1. **Economic Reality** — is the ROI claim defensible with the data we have?
2. **Operational Reality** — does this work with the actual team and systems in place?
3. **Tool vs Workflow** — are we selling a tool, or are we changing how work actually gets done?
4. **Reliability** — what happens when this breaks? Who owns it?
5. **Ownership Burden** — who maintains this after we leave?
6. **Redundancy** — does this duplicate something they already paid for?

Sarat's 5-objection stack (encoded into every critique):
1. "This sounds like a consulting project, not an operational change."
2. "What happens when the AP clerk is out? Does this still work?"
3. "We already have [X]. Why isn't that enough?"
4. "Who owns this after you leave?"
5. "Show me the number. Not a range — a number."

**Output per critique:**
```json
{
  "overall_verdict": "PASS | WEAK | REJECT",
  "section_verdicts": { "slide_title": "PASS | WEAK | REJECT" },
  "objection_scores": { "economic_reality": 0-10, ... },
  "sarat_voice_summary": "2-4 sentences in Sarat's voice",
  "kill_list": [{ "section": "...", "lens": "...", "reason": "specific, not vague" }],
  "fatal_issues": [...],
  "fixable_issues": [...],
  "score": 0-100
}
```

**Verdict logic:**
- `PASS` (score ≥ 80) → stop loop, proceed to delivery
- `WEAK` (score 60–79) → rebuild if iterations remain
- `REJECT` (score < 60) → rebuild if iterations remain
- At max iterations → stop regardless, deliver best score

---

## Step 4 — Rebuild (if needed)

When rebuilding, I:
1. Show the user what Sarat killed and why (concise — 3-4 lines max)
2. Generate a new slide JSON that directly fixes every REJECT and WEAK item
3. Build new `.pptx`
4. Critique again

I do NOT regenerate slides that passed. I fix the ones that didn't.

---

## Delivery

After the loop completes:

1. Copy best `.pptx` to `C:\Projects\Consulting_app` (workspace root)
2. Provide a `computer://` link so the user can open it immediately
3. Show a compact iteration table:

```
Iteration | Verdict | Score | Key change
1         | REJECT  | 54    | Initial deck
2         | WEAK    | 71    | Fixed ROI claim on slide 4, cut slide 7
3         | PASS    | 84    | Tightened ownership model, added real number on slide 9
```

4. Quote Sarat's final `sarat_voice_summary` verbatim

Keep the delivery message short. The user can open the deck.

---

## Notes

- `runner.py` in this directory is for **headless/scheduled execution only** (e.g. cron jobs, CLI pipelines). It requires `OPENAI_API_KEY`. Do NOT use it for conversational requests — I handle those directly.
- python-pptx only — no Node.js, no pptxgenjs, no external services
- Output directory: `demo_docs/pitch_forge_deck/iteration_<N>/`
- Final deck: `demo_docs/pitch_forge_deck/final/best_presentation.pptx` + copy to workspace root
