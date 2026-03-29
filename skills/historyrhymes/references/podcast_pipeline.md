# Podcast Ingestion Pipeline — Technical Specification

> **See also:** Full architecture at `docs/plans/PODCAST_INTELLIGENCE_ARCHITECTURE.md`, schema at `repo-b/db/schema/425_podcast_intelligence.sql`, extraction tips at `docs/podcast-intelligence/tips.md`.

## Overview

Convert podcasts from passive listening into structured alpha extraction: narrative signals, macro viewpoints, positioning insights, analog triggers, and adversarial signals.

## Input Sources

| Source Type | Method | Notes |
|-------------|--------|-------|
| RSS feeds (Spotify, Apple) | Poll RSS XML → extract mp3 URL | Most finance podcasts publish RSS |
| YouTube | `yt-dlp` → audio → transcript | For video-only shows |
| Manual upload | mp3/wav file in uploads/ | User-provided recordings |
| Pasted transcript | Text input directly | Fastest for quick extraction |

## Pipeline Stages

### Stage 1: Ingest & Transcribe

```
Input → audio file OR text transcript
If audio:
  → Whisper API (or local whisper.cpp) → raw transcript
  → Speaker diarization (pyannote.audio or assembly.ai)
  → Timestamped segments with speaker labels
```

### Stage 2: Semantic Chunking

Split transcript into semantic chunks (not fixed-size):
- Topic boundaries detected via embedding similarity drops
- Average chunk: 200-500 words (roughly 1-3 minutes of speech)
- Overlap: 50 words between chunks for context continuity
- Preserve speaker attribution per chunk

### Stage 3: Extraction (per chunk)

Run Claude extraction on each chunk with structured output:

**A. Speaker Context**
```json
{
  "speaker_name": "Raoul Pal",
  "role": "macro strategist",
  "domain_expertise": ["macro", "crypto", "rates"],
  "credibility_signals": ["manages capital", "20yr experience"]
}
```

**B. Macro Viewpoints**
```json
{
  "view_type": "macro",
  "statement": "We're entering a liquidity-driven reflation phase",
  "direction": "bullish",
  "confidence_implied": 0.8,
  "time_horizon": "6-12 months",
  "asset_classes": ["crypto", "equities"],
  "reasoning": "Global M2 turning, China stimulus, Fed pivot likely"
}
```

**C. Trade Ideas / Positioning**
```json
{
  "trade": "Long SOL, short BTC dominance",
  "conviction": "high",
  "crowded_vs_contrarian": "early",
  "risk_reward_mentioned": "3:1 upside",
  "stop_loss_mentioned": false
}
```

**D. Narrative Detection**
```json
{
  "narrative_label": "AI infrastructure supercycle",
  "sentiment": "bullish",
  "conviction": 0.9,
  "novelty_score": 0.3,
  "lifecycle_stage": "crowded"
}
```

**E. Analog References**
```json
{
  "referenced_episode": "2020 DeFi summer",
  "comparison_statement": "This feels like DeFi summer but for AI agents",
  "reasoning": "New primitive enabling composability",
  "differences_noted": ["regulatory environment different", "institutional capital present"],
  "auto_suggest_rhyme": true
}
```

**F. Uncertainty Detection**
```json
{
  "hedging_language": ["I think", "probably", "if X happens"],
  "confidence_calibration": "moderate",
  "intellectual_honesty": "high",
  "overconfidence_flag": false
}
```

### Stage 4: Aggregate Across Podcasts

Daily aggregation job produces:

**Narrative Velocity Table:**
- Which narratives are accelerating across multiple speakers?
- Which narratives are decelerating (silence detection)?
- What's the conviction-weighted consensus?

**Speaker Divergence Matrix:**
- Where do respected speakers disagree?
- Which disagreements have the largest conviction gap?

**Crowding Detection:**
- When >3 speakers from different backgrounds converge → "crowded narrative forming"
- When conviction + source diversity both high → increase trap probability input

### Stage 5: Integration

| Target System | What Gets Fed |
|---------------|---------------|
| History Rhymes episode library | Auto-suggested new analog references |
| WSS Narrative Layer (Layer 3) | Narrative velocity, intensity, lifecycle stage |
| WSS Meta-Game Layer (Layer 5) | Crowding signals, coordinated narrative detection |
| Multi-Agent Forecaster | Narrative/Behavioral Agent receives podcast extractions |
| Daily Brief | Top emerging ideas, most contrarian take, biggest disagreements |
| Speaker Profiles | Prediction tracking, Brier score updates on resolution |

## Adversarial Filters

### Coordinated Narrative Detection
If the same talking point appears across 3+ podcasts within 48 hours with similar framing → flag as potentially coordinated. Score: `coordination_risk = (source_overlap × timing_overlap × framing_similarity)`.

### Recycled Content Detection
Compare extracted viewpoints against the last 30 days of extractions. If a speaker repeats the same view without new evidence → reduce novelty_score, mark as "stale conviction."

### Suspicious Timing
If a strong directional viewpoint correlates with large market moves in the preceding 24-48 hours → flag as potentially reactive (not predictive). Score: `timing_suspicion = correlation(viewpoint_direction, recent_price_move)`.

## Scheduled Task: `fin-podcast-ingest`

**Cadence:** Daily at 6:00 AM (after overnight podcast publishes)
**Pipeline:**
1. Check RSS feeds for new episodes
2. Download and transcribe new audio
3. Run extraction pipeline
4. Aggregate daily narrative state
5. Update speaker profiles
6. Push narrative signals to WSS Layer 3
7. Auto-suggest rhyme entries if analog references detected
8. Generate podcast section for daily brief

## Podcast Watchlist (Initial)

| Show | Domain | Update Frequency |
|------|--------|-----------------|
| Macro Voices | Macro, rates, commodities | Weekly |
| Bankless | Crypto, DeFi, Ethereum | 3x/week |
| The Pomp Podcast | Crypto, macro | 3x/week |
| Odd Lots (Bloomberg) | Macro, markets | 2x/week |
| Real Vision | Macro, crypto, equities | Daily |
| All-In Podcast | Tech, macro, venture | Weekly |
| Unchained | Crypto, regulation | 2x/week |
| Forward Guidance | Macro, rates | 2x/week |
| On The Margin | Crypto, macro | Weekly |
| Up First (NPR) | General macro context | Daily |
