# Podcast Intelligence — Extraction Patterns & Edge Cases

## Speaker Identification Patterns

### Common challenges:
- Hosts often introduce guests by full name at start, then use first name only
- Some podcasts have no intro — speakers jump right in
- Multi-guest panels: attribution gets confused after 20+ minutes
- Guest-on-guest podcasts (no clear host): treat both as equal weight

### Solutions:
- Use first 5 minutes to build speaker map (name → role → organization)
- If diarization fails, use linguistic cues: "As I mentioned on my show..." = host
- Track speaking patterns: guests tend to give longer answers, hosts ask questions
- When unsure, tag as "unattributed" rather than guess wrong

## Macro View Extraction Patterns

### High-signal phrases:
- "I think we're in a..." → regime classification
- "The Fed is going to..." → policy prediction
- "Liquidity is..." → liquidity regime signal
- "This cycle..." → cycle positioning
- "We're late/early in..." → timing signal
- "The market is pricing in..." → implied expectations vs speaker's view
- "What the bond market is telling us..." → cross-asset signal

### Low-signal / noise phrases to downweight:
- "Anything could happen" → non-prediction
- "Time will tell" → hedge with no content
- "It depends on..." without specifying conditions → vague
- Repeating the question back → filler

### Edge cases:
- Conditional predictions: "IF inflation stays above 3%, THEN rates stay higher" — store as conditional, extract both the condition and the prediction
- Negation: "I don't think we're in a recession" — direction is bullish (economy), not bearish
- Sarcasm/irony: "Oh sure, the Fed will definitely cut 200bps" — detect sarcasm markers (tone, context), invert direction
- Time-shifted views: "Six months ago I would have said bullish, now I'm neutral" — extract CURRENT view, note the shift
- Consensus framing: "Everyone thinks X" — this is about crowd positioning, not the speaker's own view

## Trade Idea Extraction Patterns

### Explicit trades (easy to catch):
- "We're long X"
- "We bought Y last week"
- "We're adding to our position in Z"
- "Short the [sector/asset]"

### Implied positioning (harder, more valuable):
- "I like the risk/reward in X" → implied long bias
- "That's where the opportunity is" → directional hint
- "I wouldn't touch that" → implied avoid/short
- "We've been reducing exposure to..." → selling signal
- "The asymmetry is in..." → where they see the best trade

### Crowding detection phrases:
- "Everyone is long X" → crowded
- "It's a consensus trade" → crowded
- "Nobody is talking about Y" → potential contrarian signal
- "The market is completely ignoring Z" → early/contrarian
- "This is the most hated trade" → contrarian indicator

### Edge cases:
- Talking their book: speaker is long and pumping. Flag with high manipulation_risk
- Past tense trades: "We took profit in Q3" — not a current position, tag as historical
- Hypothetical trades: "If I were starting fresh, I'd..." — tag as hypothetical, still extract
- Size/conviction disconnect: "We have a small position" with high verbal conviction — note the disconnect

## Narrative Detection Patterns

### Emerging narrative signals:
- First mention by a non-consensus speaker
- Speaker says "I haven't heard many people talk about this"
- Idea contradicts the prevailing view
- Low mention count + high novelty language

### Reinforcing narrative signals:
- Multiple speakers across different podcasts say the same thing
- Idea is evolving: initial thesis + new supporting evidence
- "As we discussed last time..." or "Building on what X said..."

### Narrative shift signals:
- "I've changed my mind on..."
- "The data has forced me to reconsider..."
- Speaker's current view contradicts their last appearance
- "Six months ago the story was X, now it's Y"

### Fading narrative signals:
- Fewer mentions over time (velocity declining)
- Speakers hedging more when discussing it
- "That trade is getting long in the tooth"
- Counter-narrative emerging from credible speakers

### Edge cases:
- Same narrative, different labels: "rate cuts", "Fed pivot", "dovish turn" — all the same narrative. Use embedding similarity to normalize labels
- Narrative nesting: "AI infrastructure spending" is part of "AI bull case" which is part of "tech cycle" — track at most granular level but link to parent narratives
- Fake novelty: repackaging old ideas with new language. Check semantic similarity against existing narratives before tagging as "emerging"

## Analog / History Rhymes Detection

### Common patterns:
- "This reminds me of 2008..."
- "It's like the late 90s..."
- "We saw this same pattern in..."
- "The last time [metric] was at this level was..."
- "History doesn't repeat but it rhymes..."
- "The playbook from [year/event] applies here"

### What to extract:
1. The referenced period (year, event name, or era)
2. WHY they think it rhymes (what specific similarity)
3. What's DIFFERENT this time (if mentioned — very valuable)
4. The implied prediction (if 2008 repeats → crash)
5. The speaker's confidence in the analog

### Edge cases:
- Vague analogs: "It feels like late cycle" — no specific year, but still a regime reference. Extract as regime classification
- Stacked analogs: "It's 2000 meets 1970" — extract both, note the combination
- Rejected analogs: "People say this is like 2008 but I disagree" — extract as speaker rejecting the analog (still informative)
- Self-referential: "As I said on the show last month..." — not a historical analog, just a callback

## Uncertainty & Hedging Language

### High-confidence markers:
- "I'm very confident that..."
- "This is as clear as it gets"
- "I would bet the house on..."
- Absence of qualifiers in strong directional statements
- Specific price targets with timeframes

### Medium-confidence markers:
- "I think..." (default — most statements)
- "Probably..."
- "The base case is..."
- "More likely than not..."

### Low-confidence markers:
- "Maybe..."
- "I'm not sure, but..."
- "It's hard to say..."
- "Could go either way..."
- "If X, then Y, but if Z, then W" (branching conditionals)

### Intellectual honesty markers (positive signal for credibility):
- "I was wrong about X"
- "I don't know"
- "That's outside my area of expertise"
- "Let me push back on myself..."
- Acknowledging both sides before stating view

### Overconfidence red flags:
- Never hedging, ever
- "There's no way X happens"
- Dismissing counterarguments without engagement
- Certainty about complex, multi-variable outcomes
- "This time is different" without explaining why

## Adversarial Detection Patterns

### Recycled talking points:
- Check semantic similarity of statements against last 30 days of extractions
- If a statement is >85% similar to an existing extraction from a different speaker, flag as recycled
- Track "talking point clusters" — groups of speakers all making nearly identical arguments

### Coordinated narratives:
- Multiple speakers on different podcasts in the same week pushing the same thesis
- Language similarity across speakers suggesting shared briefing/script
- Timing correlation with market moves (narrative push before/after large position changes)

### Suspicious timing:
- Large market move → 24 hours later → multiple podcasts discussing it with the same thesis
- Speaker goes on multiple podcasts in one week pushing same trade idea
- Narrative push coincides with known fund positioning changes

### Manipulation risk factors:
- Speaker has known large position in asset they're discussing (if detectable)
- Uncharacteristically strong conviction from usually-hedged speaker
- New narrative appears fully formed (no emergence phase)
- Unusual podcast booking pattern (normally monthly, suddenly weekly)

## LLM Prompt Engineering Tips

### For structured extraction (GPT-4o):
- Use JSON mode with explicit schema
- Provide 2-3 examples of good extractions in the prompt
- Ask for "null" rather than guessing when information isn't present
- Batch 3-5 chunks per call for cost efficiency
- Set temperature=0 for consistency

### For nuanced extraction (Claude):
- Use XML tags to structure the prompt and expected output
- Ask Claude to "think step by step" about narrative detection
- Provide conversation context (who are these speakers, what show is this)
- Ask Claude to explicitly rate its own confidence in each extraction
- Use temperature=0.3 for a balance of creativity and consistency

### Common prompt failures:
- Over-extraction: LLM finds "macro views" in every sentence. Solution: add "only extract genuine, substantive viewpoints, not passing comments"
- False analogs: LLM flags any mention of a year as a "history rhymes" reference. Solution: "Only extract when the speaker is explicitly drawing a comparison to a historical period, not merely mentioning a date"
- Sentiment confusion: LLM confuses discussing bearish scenarios with being bearish. Solution: "Distinguish between a speaker DISCUSSING a bearish scenario and ENDORSING a bearish view"
- Attribution errors: LLM attributes a guest's paraphrased view to the host. Solution: "Only attribute views to the speaker who expresses them as their own. If Speaker A says 'Some people think X', do not attribute view X to Speaker A"

## Data Quality Checks

### Transcription quality:
- If word error rate (WER) appears high, flag for manual review
- Financial terms often get mangled: "TIPS" → "tips", "VIX" → "vicks", "SOFR" → "sofer"
- Create a domain dictionary for Whisper post-processing: common financial terms, fund names, indices
- Multi-language episodes: detect language per segment, only extract from supported languages

### Extraction quality:
- Track extraction count per episode — if an episode yields 0 macro views, either the episode is off-topic or the extraction failed
- If Claude and GPT-4o disagree on direction for the same chunk, flag for review
- Spot-check: compare 10% of extractions against manual review weekly
- Track per-prompt extraction precision/recall over time

### Speaker deduplication:
- Same speaker on different podcasts with slightly different name: "Jim Bianco" vs "James Bianco" vs "Jim Bianco, Bianco Research"
- Use normalized_name (lowercase, stripped of titles/org) + fuzzy match
- When in doubt, create separate entries and merge later (never auto-merge)

## Edge Cases Compendium

1. **Live episodes**: Hosts reacting to breaking news mid-episode. Macro views may be gut reactions, not considered analysis. Tag as "reactive" and downweight confidence.

2. **Comedy/satire podcasts** that discuss finance: Still extract, but tag source as entertainment and apply higher adversarial scrutiny.

3. **Roundtable episodes** with 5+ speakers: Attribution is hard. Focus on consensus/disagreement detection rather than individual attribution.

4. **Extremely long episodes** (3+ hours): Chunk more aggressively. Later portions often have more candid/novel views as speakers relax.

5. **Repeated appearances**: Track speaker_id across episodes. Their view evolution over time is a signal itself.

6. **Sponsor segments**: Detect and exclude sponsor reads from extraction. Common markers: "This episode is brought to you by...", "Speaking of [product]..."

7. **Caller/audience questions**: Often reveal retail sentiment. Extract as "audience_sentiment" rather than expert view.

8. **Non-English content**: Some financial podcasts are in other languages. If Whisper supports the language, transcribe and extract. Note the language for credibility context.

9. **Private/paywalled podcasts**: May contain higher-signal content precisely because it's not public. Treat with higher base credibility but note access restrictions.

10. **Podcast cross-references**: "As [other speaker] said on [other podcast]..." — extract the cross-reference, it reveals narrative propagation paths.
