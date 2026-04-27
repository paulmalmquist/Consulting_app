# META PROMPT — Podcast Intelligence: Alpha Extraction from Long-Form Conversations
# Target: Winston trading & market intelligence platform
# Executor: Claude Code (autonomous, multi-step)
# Status: ACTIVE BUILD DIRECTIVE

---

## ORIENTATION — READ BEFORE WRITING ANY CODE

You are completing the Podcast Intelligence module inside Winston. Phase 0 is validated.
The ingestion pipeline works, the extraction pipeline produces real signals, and Supabase
has live data. This prompt drives the system from prototype to production across the
remaining build phases.

### What Already Exists (Validated Phase 0)

**Supabase schema deployed** — 16 tables in production (`425_podcast_intelligence.sql`):
  podcast_sources, podcast_episodes, podcast_speakers, podcast_episode_speakers,
  podcast_macro_views, podcast_trade_ideas, podcast_narratives, podcast_analogs,
  podcast_uncertainty_markers, podcast_narrative_velocity, speaker_predictions,
  speaker_track_records, podcast_divergences, podcast_adversarial_scores,
  podcast_daily_briefs, podcast_rhyme_suggestions

**Proof-of-concept pipeline** — `podcast_pipeline.py` (standalone, not yet in backend/):
  - YouTube transcript ingestion via yt-dlp (VTT auto-captions)
  - Sentence-boundary semantic chunking (800 words/chunk, 2-sentence overlap)
  - Dual LLM extraction: GPT-4o (structured) + Claude (nuanced)
  - Supabase writes for all signal types
  - Episode-level synthesis and adversarial scoring

**First live extraction** — Odd Lots "Is This the End of the US Exceptionalism Trade?":
  - 3 speakers identified (Joe Weisenthal, Tracy Aloway, Ozan Tarman / Deutsche Bank)
  - 4 macro views written (steepener trade, gold, US equities direction)
  - 2 trade ideas written
  - 34 narratives extracted (top: "European fiscal awakening" conviction 90, novelty 85)
  - 45 uncertainty markers captured
  - Adversarial score: authenticity 75, originality 70, manipulation risk 25

**Architecture documents**:
  - `docs/plans/PODCAST_INTELLIGENCE_ARCHITECTURE.md` — full system design
  - `docs/podcast-intelligence/tips.md` — extraction patterns and edge cases
  - `repo-b/db/schema/425_podcast_intelligence.sql` — complete schema

**RLS policies** — insert/select/update policies added for all 16 tables (open for now,
  tenant-scoped in production).

### Known Issues from Phase 0

K1 — Speaker name mismatch across chunks. GPT-4o sometimes uses "Ozan" in one chunk
     and "Tarman" or "the guest" in another. Pipeline logged 26 macro views in console
     but only 4 landed in Supabase because speaker_id lookups failed on name variants.
     FIX: fuzzy match on speaker lookup (Levenshtein or normalized prefix match).

K2 — Macro view count low relative to narrative count (4 vs 34). GPT-4o is conservative
     on what it calls a "macro view" — it skips opinions framed as questions or embedded
     in longer reasoning chains. Prompt needs tuning to capture implied views.

K3 — No analogs landed in Supabase (0 rows) despite Claude extracting 10 in console.
     Root cause: analog writer requires speaker_id, and Claude uses different name forms
     than GPT-4o registered. Same fuzzy match fix as K1.

K4 — Chunking is sentence-boundary only, not truly semantic. Topic shifts mid-sentence
     get split across chunks. For Phase 1+, use embedding-based topic boundary detection.

K5 — No audio transcription yet. Pipeline uses YouTube auto-captions only. Local Whisper
     integration is designed but not built. Diarization (speaker-attributed segments) not
     implemented.

K6 — No integration with History Rhymes, trading lab, or daily brief system yet.

K7 — No scheduled tasks. Pipeline is manual-run only.

K8 — Trade ideas extraction is thin (2 from a 35-minute episode). GPT-4o is missing
     implied positioning. Need a second extraction pass focused specifically on positioning
     language.

### Design Invariants (non-negotiable)

P1 — Podcasts are narrative formation engines, not information sources. Extract signals, not summaries.
P2 — Dual LLM routing: GPT-4o for structured tagging, Claude for nuanced reasoning. Never single-model.
P3 — Every extraction records extraction_model. NOT nullable. Track which model produced what.
P4 — Speaker identity is a first-class entity. Deduplicate aggressively. Never create duplicate speakers.
P5 — Narrative labels must be normalized across episodes. "US exceptionalism" and "American exceptionalism"
     and "US market dominance" are the same narrative. Use embedding similarity for dedup.
P6 — Adversarial scoring is not optional. Every episode gets authenticity + originality + manipulation risk.
P7 — The system must detect crowding. When 5+ speakers across 3+ episodes say the same thing in 14 days,
     that's a signal, not confirmation.
P8 — Uncertainty markers are alpha. A speaker who says "I think" before every call is more calibrated
     than one who says "I'm certain" — track this and feed it into credibility scoring.
P9 — No Celery, no Redis. Databricks pipeline runner + Supabase for state. Match existing stack.
P10 — Free data sources first. YouTube captions before paid transcription. FRED before Bloomberg.

### Winston Stack Reference

  Frontend:  repo-b/  — Next.js 14, Tailwind bm-* classes
  Backend:   backend/ — FastAPI, Supabase Postgres w/ pgvector
  ML:        Databricks notebooks, MLflow experiment HistoryRhymesML
  DB:        Supabase project ozboonlsplroialdwuxj (us-east-1)
  Agents:    OpenAI GPT-4o + Anthropic Claude API (keys in backend/.env)
  Data:      yt-dlp, feedparser, ffmpeg, whisper (local)

  Key existing patterns to follow:
  - Route pattern:      backend/app/routes/ (93 files, FastAPI routers)
  - Service pattern:    backend/app/services/ai_gateway.py (streaming, tool dispatch)
  - Narrator pattern:   backend/app/services/run_narrator.py (step deduplication)
  - Schema pattern:     repo-b/db/schema/423_trading_lab.sql (signal tables)
  - Signal types:       repo-b/src/lib/trading-lab/types.ts (TradingSignal interface)
  - Scheduled tasks:    skills/market-rotation-engine/SKILL.md (fin-* prefix pattern)
  - Episode embeddings: HNSW index on episode_embeddings table (pgvector)

---

## BUILD ORDER — EXECUTE IN SEQUENCE

Do not start Phase N+1 until Phase N is committed and verified.

### PHASE 1: Production Ingestion Service (fix K1-K5)

**Goal**: Move from standalone script to proper backend service with robust speaker handling,
real transcription, and multiple input sources.

  Step 1.1: Speaker Fuzzy Matching
    File: backend/app/services/podcast_speaker_resolver.py

    Build a SpeakerResolver class that:
    - Maintains an in-memory cache of known speakers per episode extraction run
    - On lookup: tries exact match → normalized match → prefix match → Levenshtein (threshold 0.8)
    - Handles common patterns: "Joe" matches "Joe Weisenthal", "the guest" maps to non-host speaker,
      "Tarman" matches "Ozan Tarman"
    - Falls back to "unattributed" speaker (create one per episode) rather than dropping signals
    - Cross-episode: when a speaker appears on multiple podcasts, merge by normalized_name

    Acceptance: re-run Odd Lots extraction, get 26 macro views and 10 analogs in Supabase (not 4 and 0).

  Step 1.2: Ingestion Service
    File: backend/app/services/podcast_ingest.py

    Support four input modes:
    a) YouTube URL → yt-dlp auto-captions (VTT) → parse → store
    b) RSS feed URL → feedparser → iterate episodes → download audio → transcribe
    c) Audio file upload → store in Supabase storage → transcribe
    d) Pasted transcript text → store directly

    For YouTube: also extract metadata (title, description, published_at, duration, thumbnail_url).
    For RSS: store feed URL in podcast_sources, poll on schedule, detect new episodes by guid.

    File: backend/app/services/podcast_transcription.py

    Transcription service:
    - Primary: local Whisper (large-v3) when audio is available
    - Fallback: YouTube auto-captions via yt-dlp when available
    - Store transcription_model in episode record ("whisper-large-v3" or "youtube_auto_captions")
    - Post-processing: financial term dictionary correction (VIX, SOFR, TIPS, etc.)
    - Diarization: whisperx or pyannote for speaker-attributed segments (stretch goal for 1.2)

  Step 1.3: Semantic Chunking Upgrade
    File: backend/app/services/podcast_chunker.py

    Replace sentence-boundary chunking with embedding-based topic detection:
    - Embed each sentence with sentence-transformers (all-MiniLM-L6-v2 for speed)
    - Compute cosine similarity between consecutive sentence embeddings
    - Split at similarity valleys (topic boundaries)
    - Target: 800-1200 words per chunk
    - Respect speaker turns as natural boundaries
    - Each chunk metadata: chunk_index, estimated_start_time, primary_speaker, topic_hint

    Acceptance: chunks should align with topic shifts, not arbitrary word counts.

  Step 1.4: FastAPI Routes
    File: backend/app/routes/podcast_intelligence.py
    File: backend/app/schemas/podcast_intelligence.py

    Endpoints:
    POST  /api/podcast/ingest/youtube    — accepts {url}, returns {episode_id, status}
    POST  /api/podcast/ingest/rss        — accepts {feed_url}, returns {source_id, episodes_found}
    POST  /api/podcast/ingest/upload     — accepts multipart audio file
    POST  /api/podcast/ingest/transcript — accepts {title, text, source_name}
    GET   /api/podcast/episodes          — list with filters (source, date range, extraction_status)
    GET   /api/podcast/episodes/{id}     — full episode detail with signal counts

    Pydantic schemas for all request/response models. Follow existing pattern from
    backend/app/schemas/.

  Step 1.5: Background Extraction Trigger
    When an episode is created (any input mode), set extraction_status = 'pending'.
    Build an async extraction runner that picks up pending episodes and runs the full pipeline.
    For now: triggered via API endpoint POST /api/podcast/episodes/{id}/extract.
    Later (Phase 4): triggered automatically by scheduled task.

  GATE CHECK: Insert 3 episodes from different sources. All produce signals in all extraction
  tables. Speaker names resolve correctly across chunks. Zero orphaned signals.

### PHASE 2: Extraction Pipeline Hardening (fix K2, K8)

**Goal**: Maximize signal yield per episode. Current pipeline misses implied views and
positioning language. Add extraction passes and cross-chunk synthesis.

  Step 2.1: Extraction Prompt Tuning
    File: backend/app/services/podcast_extraction_prompts.py

    Store all extraction prompts as versioned templates. Each prompt gets a version string
    (e.g. "macro_v2", "narrative_v1"). Log which prompt version produced each extraction.

    GPT-4o structured extraction prompt improvements:
    - Add explicit instruction: "Extract views even when framed as questions or embedded
      in longer reasoning chains. 'Isn't the real question whether rates stay higher for longer?'
      IS a macro view (bearish bonds, medium confidence)."
    - Add "implied_positioning" pass: scan for phrases like "I like the risk/reward in X",
      "That's where the opportunity is", "I wouldn't touch that"
    - Add examples of good extractions (3 positive, 2 negative) in the prompt

    Claude nuanced extraction prompt improvements:
    - Separate narrative detection from analog detection (two focused prompts vs one combined)
    - Add meta-game detection pass: "Is this speaker talking their book? Are they marketing
      a view they're already positioned for?"
    - Add explicit cross-reference instruction: "If a speaker mentions another podcast, show,
      or speaker's view, extract that as a cross-reference signal."

  Step 2.2: Multi-Pass Extraction Architecture
    File: backend/app/services/podcast_extraction.py

    Four-pass extraction per episode:
    Pass 1 — GPT-4o: macro views, trade ideas, speakers, tickers (parallel across chunks)
    Pass 2 — Claude: narratives, analogs, uncertainty markers (parallel across chunks)
    Pass 3 — Claude: episode-level synthesis (single call, all chunks + Pass 1-2 results)
             Output: summary, dominant narrative, agreements, disagreements, novel vs crowded
    Pass 4 — Claude: adversarial scoring (single call)
             Output: authenticity, originality, manipulation risk, recycled talking points

    Error handling: if any pass fails on a chunk, mark extraction_status = 'partial',
    log the error, continue with remaining chunks. Never fail the whole episode.

  Step 2.3: Positioning-Specific Extraction Pass
    Add a dedicated positioning extraction pass (GPT-4o) that focuses exclusively on:
    - Explicit trades and position disclosures
    - Implied positioning language
    - Risk/reward commentary
    - Portfolio construction hints
    - What speakers are NOT saying (notable omissions)

    This addresses K8 (thin trade idea extraction). Run after Pass 1, use Pass 1 context
    to avoid duplicates.

  Step 2.4: Narrative Label Normalization
    File: backend/app/services/podcast_narrative_normalizer.py

    Before writing a narrative to Supabase:
    1. Embed the narrative_label using text-embedding-3-small
    2. Query existing narrative labels via pgvector similarity
    3. If cosine similarity > 0.88 with an existing label, use the existing label
    4. If 0.75 < similarity < 0.88, flag for human review
    5. If < 0.75, create new label

    This ensures "US exceptionalism", "American exceptionalism", "US market dominance",
    and "end of US outperformance" all map to the same narrative thread.

    Store a narrative_label_embeddings table or column for fast lookup.

  GATE CHECK: Re-extract the Odd Lots episode. Expect: 15+ macro views (not 4), 5+ trade
  ideas (not 2), 10+ analogs landed in DB (not 0), all narratives normalized.

### PHASE 3: Narrative Velocity + Speaker Tracking

**Goal**: Aggregate signals across episodes over time. Detect crowding. Track speaker accuracy.

  Step 3.1: Narrative Velocity Engine
    File: backend/app/services/podcast_narrative_velocity.py

    Daily aggregation job:
    - For each unique normalized narrative_label active in the last 90 days:
      - Count mentions in 7d, 30d, 90d windows
      - Count unique speakers per window
      - Compute velocity: mentions_this_window / mentions_previous_window
      - Compute acceleration: velocity_this_window / velocity_previous_window
      - Average conviction across mentions
      - Compute divergence_score: does market data confirm or contradict? (requires market data feed)
      - Assign crowding_risk:
        low:      < 3 mentions, < 2 speakers in 30d
        moderate: 3-7 mentions, 2-4 speakers
        elevated: 8-15 mentions, 5+ speakers, conviction converging above 70
        high:     15+ mentions, high conviction, low novelty (everyone saying same thing)
        extreme:  all of the above + acceleration positive + no hedging language detected

    Write results to podcast_narrative_velocity table.

    When crowding_risk transitions from moderate → elevated or higher, generate an alert.
    Store alerts in a podcast_crowding_alerts concept (can be a jsonb field in daily_briefs
    or a separate lightweight table).

  Step 3.2: Speaker Prediction Extraction
    File: backend/app/services/podcast_prediction_extractor.py

    Post-processing pass on macro_views and trade_ideas:
    - Identify resolvable predictions (has direction + asset + implied timeframe)
    - Create speaker_predictions entries with:
      prediction_text, predicted_direction, target_asset, target_date (inferred from time_horizon)
      resolution_status = 'open'
    - Skip vague statements ("things could go either way")
    - Skip conditional predictions unless the condition is already met

    Examples of resolvable predictions from the Odd Lots episode:
    - "Higher term premium in Treasuries" → bearish bonds, 1-3 months
    - "Gold will be there for you in times of uncertainty" → bullish gold, 3-12 months

  Step 3.3: Prediction Resolution Engine
    File: backend/app/services/podcast_prediction_resolver.py

    Daily job:
    - Query all open predictions where target_date <= today + 7d buffer
    - For directional predictions: pull actual asset returns from market data
      (yfinance for equities/commodities, FRED for rates/macro)
    - Score: correct if predicted direction matches actual direction over the time horizon
    - Compute Brier score: (forecast_probability - actual_outcome)^2
    - Update speaker_predictions with resolution_status, actual_value, brier_score
    - Reaggregate speaker_track_records:
      hit_rate = correct / (correct + incorrect)
      avg_brier_score = mean of all resolved brier scores
      domain_accuracy = accuracy broken out by asset class
      calibration_score = how well-calibrated are their confidence levels?
      recency_weighted_score = exponential decay weighting recent predictions higher

  Step 3.4: Credibility Score Formula
    Update podcast_speakers.credibility_score using:

    credibility = (
      0.30 * hit_rate_recent_6mo +
      0.20 * calibration_score +
      0.20 * domain_accuracy[relevant_domain] +
      0.15 * avg_brier_score_inverted +
      0.15 * intellectual_honesty_score
    )

    intellectual_honesty_score = derived from uncertainty_markers:
    - Higher score for speakers who hedge appropriately, admit uncertainty, and acknowledge
      counterarguments
    - Lower score for speakers who never hedge (overconfidence) or always hedge (adds no signal)

    Credibility score updates monthly. Start at 50 (neutral) for new speakers.

  Step 3.5: API Routes for Aggregations
    GET  /api/podcast/narrative-velocity       — list active narratives with velocity + crowding
    GET  /api/podcast/narrative-velocity/{label} — detail for one narrative thread
    GET  /api/podcast/speakers                 — ranked by credibility_score
    GET  /api/podcast/speakers/{id}            — detail with track record
    GET  /api/podcast/speakers/{id}/predictions — prediction history with resolutions
    GET  /api/podcast/crowding-alerts          — active crowding alerts

  GATE CHECK: Ingest 10+ episodes spanning 2+ weeks. Narrative velocity table populated.
  At least one narrative shows velocity > 1.0. Speaker predictions created for resolvable
  views. Credibility scores updated for speakers with 3+ resolved predictions.

### PHASE 4: Integration Layer + Automation

**Goal**: Wire podcast intelligence into History Rhymes, trading lab, daily brief, and trap lab.
Automate everything.

  Step 4.1: History Rhymes Integration
    File: backend/app/services/podcast_rhyme_integration.py

    When podcast_analogs are extracted:
    1. Check if the referenced period maps to an existing episode in the `episodes` table
       (History Rhymes episode library). Use embedding similarity on episode name + description.
    2. If match found (cosine > 0.8): link via auto_suggested_rhyme_id, create podcast_rhyme_suggestions
       entry with status='auto_linked'
    3. If no match: create podcast_rhyme_suggestions entry with status='pending'
    4. Surface pending suggestions in daily brief and via API

    Reverse integration: when History Rhymes engine finds a high-confidence analog match,
    check if any recent podcast speakers have referenced the same period. If yes, boost
    the analog confidence. If credible speakers (credibility > 70) reference it, boost more.

  Step 4.2: Trading Lab Signal Promotion
    File: backend/app/services/podcast_signal_promoter.py

    Promote high-quality podcast signals to trading_signals table:
    - Source: 'podcast'
    - Promotion criteria:
      a) Macro view with confidence_implied >= 70 AND speaker credibility >= 60
      b) Trade idea with conviction = 'high' AND crowding_tag != 'crowded'
      c) Narrative with crowding_risk = 'elevated' or higher (promoted as warning signal)
    - Map podcast signal fields to trading_signals fields:
      category → from view_type (macro, sector, etc.)
      direction → from direction
      strength → weighted average of confidence_implied * speaker_credibility / 100
      evidence → jsonb with {episode_id, speaker_name, statement, extraction_model}
      tickers → from tickers array

    Never auto-promote to live positions. Promoted signals enter the trading lab
    with status='active' and source='podcast' for human review.

  Step 4.3: Divergence Engine
    File: backend/app/services/podcast_divergence_engine.py

    Daily scan:
    - For each active macro view from the last 7 days:
      - Pull actual market data for the relevant asset class
      - Compare speaker direction vs actual price movement
      - If divergence > 2 standard deviations: create podcast_divergences entry
    - For narrative-level divergences:
      - If a narrative has crowding_risk >= 'elevated' AND market data contradicts
        the implied direction, flag as divergence_type = 'narrative_vs_flows'
    - Compute trap_probability:
      trap_probability = (
        0.30 * crowding_risk_score +
        0.25 * divergence_severity +
        0.20 * (1 - avg_speaker_credibility) +
        0.15 * adversarial_manipulation_risk +
        0.10 * flow_narrative_mismatch_score
      )
    - If trap_probability > 0.7: escalate to trap lab (if exists) or flag in daily brief

  Step 4.4: Daily Brief Generator
    File: backend/app/services/podcast_daily_brief.py

    Daily at 8 AM (after all overnight processing):
    - Query all episodes analyzed in the last 24 hours
    - Aggregate into podcast_daily_briefs record:
      episodes_analyzed: count
      top_emerging_ideas: top 3 narratives by novelty_score from today's episodes
      most_repeated_narrative: highest mention_count in last 7d velocity window
      most_contrarian_take: lowest crowding_tag frequency + highest novelty
      biggest_disagreement: find macro views with opposing directions on same asset
      new_divergences_count: divergences created today
      new_analog_references: analogs extracted today
      crowding_alerts: narratives that crossed into elevated+ today
      trap_candidates: divergences with trap_probability > 0.5
      full_summary: Claude-generated 200-word brief synthesizing all of the above

    Integration point: feed this into the existing daily digest system at
    docs/ops-reports/digests/ and the daily brief scheduled task.

  Step 4.5: Scheduled Task Wiring
    Create scheduled tasks following the existing pattern (skills/market-rotation-engine):

    pod-rss-fetch          Every 4 hours    Poll active RSS sources, ingest new episodes
    pod-transcription      On new episode    Queue transcription for pending episodes
    pod-extraction         After transcript  Run full 4-pass extraction pipeline
    pod-narrative-velocity Daily 6:00 AM     Recalculate all narrative velocity windows
    pod-prediction-resolve Daily 7:00 AM     Check and resolve open predictions vs market data
    pod-speaker-rerank     Daily 7:30 AM     Reaggregate speaker track records + credibility
    pod-daily-brief        Daily 8:00 AM     Generate daily podcast intelligence brief
    pod-divergence-scan    Daily 9:00 AM     Scan for new divergences vs market data
    pod-signal-promote     Daily 9:30 AM     Promote qualifying signals to trading lab

    Output folders:
    docs/podcast-intelligence/daily/        — daily briefs
    docs/podcast-intelligence/velocity/     — narrative velocity snapshots
    docs/podcast-intelligence/divergences/  — divergence reports

  Step 4.6: Adversarial Layer Hardening
    File: backend/app/services/podcast_adversarial_engine.py

    Beyond per-episode scoring, add cross-episode adversarial detection:
    - Recycled talking point detection: embed each macro view statement, compare against
      all statements from last 30 days. If cosine > 0.85 from different speaker, flag as recycled.
    - Coordinated narrative detection: if 3+ speakers across 3+ different podcasts express
      semantically identical views within 7 days, flag as "coordinated_narrative"
    - Timing suspicion: if a narrative push coincides with a large market move (>2σ) in the
      same asset within 48 hours, increase manipulation_risk
    - Silence detection: if a previously dominant narrative (mention_count > 10 in prior 30d)
      drops to 0 mentions in 7 days, flag as "narrative_silence" — possible completed positioning

  GATE CHECK: Full end-to-end automated flow. RSS source adds episode → auto-transcribe →
  auto-extract → signals land in DB → velocity updated → daily brief generated → divergences
  detected → qualified signals promoted to trading lab. Manual intervention = zero.

### PHASE 5: Frontend (build after backend is solid)

**Goal**: Surface podcast intelligence in the Winston UI.

  Step 5.1: Podcast Episode Card
    File: repo-b/src/components/podcast/PodcastEpisodeCard.tsx

    Summary panel per episode:
    - Title, source, date, duration, speaker badges
    - Direction arrows for macro views (bullish/bearish counts)
    - Narrative tags (sorted by conviction)
    - Analog reference pills (clickable, link to History Rhymes if matched)
    - Adversarial score gauge (three-bar: authenticity, originality, manipulation risk)
    - Expandable: full transcript, per-chunk extractions

  Step 5.2: Narrative Velocity Dashboard
    File: repo-b/src/components/podcast/NarrativeVelocityDashboard.tsx

    - Line chart: narrative mention velocity over time (multiple narratives overlaid)
    - Crowding risk heatmap (narratives × time, colored by risk level)
    - Current alerts panel (narratives at elevated+ crowding)
    - Click narrative → detail view with all episodes/speakers mentioning it

  Step 5.3: Speaker Leaderboard
    File: repo-b/src/components/podcast/SpeakerLeaderboard.tsx

    - Ranked table: name, credibility score, hit rate, Brier score, bias profile
    - Click speaker → detail card with prediction history, domain accuracy radar,
      credibility trend line, recent appearances

  Step 5.4: Daily Brief Widget
    File: repo-b/src/components/podcast/PodcastDailyBrief.tsx

    - Rendered daily brief for the trading dashboard
    - "FROM PODCASTS TODAY" section with:
      Top emerging ideas (with links)
      Most repeated narrative (with velocity sparkline)
      Most contrarian take (with speaker credibility badge)
      Biggest disagreement (side-by-side)
      Crowding alerts with severity badges
      Trap candidates with probability scores

  Step 5.5: Integration into Existing Surfaces
    - Add podcast signals as a source type in the trading lab signal table
    - Add podcast analog references in the History Rhymes analog match display
    - Add "FROM PODCASTS TODAY" section to the existing daily brief/digest page
    - Add podcast narrative velocity as an overlay option on market charts

---

## WORLD SIGNAL SURVEILLANCE INTEGRATION

The podcast system is one input layer into a broader 5-layer signal surveillance engine.
Once the podcast module is production-stable, wire it into the cross-layer synthesis:

  Layer 1 — Reality (pre-data signals): job postings, construction, shipping, energy demand
  Layer 2 — Data (reported metrics): CPI, PMI, housing starts, cap rates, CMBS spreads
  Layer 3 — Narrative (THIS MODULE): podcast extraction, news ingestion, social sentiment
  Layer 4 — Positioning (capital flows): ETF flows, options positioning, on-chain flows
  Layer 5 — Meta-Game (trap detection): consensus scoring, cross-layer alignment, adversarial risk

  The podcast module feeds Layer 3 and contributes to Layer 5:
  - Narrative velocity → Layer 3 narrative_state table
  - Adversarial scores → Layer 5 meta_signals table
  - Crowding detection → Layer 5 trap_probability
  - Speaker predictions → cross-reference with Layer 2 data for divergence detection
  - Analog references → feed into History Rhymes Layer 1 analog matching

  signal_state_vector (the unified cross-layer vector for History Rhymes matching) should
  include podcast-derived dimensions:
  - dominant_narrative_embedding (256-dim from top narrative)
  - narrative_velocity_composite (scalar: acceleration of top 5 narratives)
  - crowding_risk_index (scalar: weighted average across all active narratives)
  - speaker_consensus_score (scalar: how much do credible speakers agree?)
  - adversarial_risk_composite (scalar: average manipulation risk across recent episodes)

---

## HISTORY RHYMES ANALOG MATCHING ENHANCEMENT

The research document specifies a Rhyme Score methodology. Podcast analogs enhance this:

  When a credible speaker (credibility > 60) references a historical analog:
  1. The analog matching engine should boost the Rhyme Score for that episode by
     0.05 * (speaker_credibility / 100) * (confidence_implied / 100)
  2. If 3+ speakers reference the same historical period within 14 days,
     auto-generate a "consensus analog" alert
  3. If a speaker references an analog that the quantitative matching engine
     ALSO identified independently (cosine > 0.7), that's a strong signal —
     boost by additional 0.10 and flag for immediate review
  4. Track analog accuracy: when a speaker says "this looks like 2008" and
     subsequent market action confirms the analog, credit the speaker's track record

  Honeypot integration: if a podcast analog reference matches a known honeypot pattern
  (cosine > 0.85 against honeypot_patterns table), flag the podcast signal with
  "WARNING: matches known trap pattern [pattern_name]" and reduce the Rhyme Score boost.

---

## EXTRACTION PROMPT LIBRARY

Store all prompts in backend/app/services/podcast_extraction_prompts.py with version tracking.

  PROMPT_STRUCTURED_V2   — GPT-4o macro views + trade ideas + speakers (fix K2, K8)
  PROMPT_NARRATIVE_V1    — Claude narrative detection (focused, no analogs)
  PROMPT_ANALOG_V1       — Claude analog/rhyme detection (focused, no narratives)
  PROMPT_UNCERTAINTY_V1  — Claude hedging/confidence language analysis
  PROMPT_SYNTHESIS_V1    — Claude episode-level synthesis (cross-chunk)
  PROMPT_ADVERSARIAL_V1  — Claude adversarial scoring
  PROMPT_POSITIONING_V1  — GPT-4o implied positioning extraction (new, addresses K8)
  PROMPT_META_GAME_V1    — Claude meta-game signal detection (talking book, narrative marketing)

  Each prompt version is logged with every extraction. When prompts are updated,
  old extractions retain their version tags. This enables A/B testing prompt changes
  against extraction quality.

---

## SCHEDULED TASK OUTPUT SPEC

Each scheduled task writes structured JSON to docs/podcast-intelligence/:

  daily/YYYY-MM-DD.json              — daily brief
  velocity/YYYY-MM-DD.json           — narrative velocity snapshot
  divergences/YYYY-MM-DD.json        — divergence report
  speaker-rankings/YYYY-MM-DD.json   — speaker credibility rankings

  Format matches existing docs/daily-intel/ and docs/ops-reports/ patterns.
  LATEST.md should be updated to include podcast intelligence outputs.

---

## SUCCESS CRITERIA

The system is complete when:

S1 — Podcasts generate structured signals in 7 distinct categories (macro views, trade ideas,
     narratives, analogs, uncertainty markers, adversarial scores, speaker predictions).
     VALIDATED: Phase 0 produces all 7 categories.

S2 — Recurring narratives are detected early, tracked through lifecycle stages, and flagged
     when they become crowded. Narrative velocity engine produces actionable crowding alerts.

S3 — Speaker accuracy is tracked over time with Brier scores. Credibility scores update
     monthly. Speakers with 10+ resolved predictions have meaningful accuracy profiles.

S4 — System flags when "everyone is saying the same thing" via:
     a) Narrative velocity crowding_risk >= elevated
     b) Adversarial coordinated_narrative flags
     c) Speaker consensus score > 0.8 across 5+ speakers

S5 — Podcast insights influence forecasts and positioning via:
     a) Trading lab signal promotion (source='podcast')
     b) History Rhymes analog boosting from speaker references
     c) Divergence detection feeding trap lab
     d) Daily brief integration

S6 — Adversarial filter catches recycled talking points (>85% cosine similarity),
     coordinated narratives (3+ speakers, 7 days), and suspicious timing (narrative
     push within 48h of 2σ market move).

S7 — Full automation: RSS → transcribe → extract → aggregate → brief → promote.
     Zero manual intervention after initial source configuration.

S8 — 10+ podcast sources tracked. 50+ episodes ingested. 500+ signals extracted.
     Narrative velocity showing real crowding patterns across the corpus.

---

## FINAL NOTE

Podcasts are not information.
They are: narrative formation engines, positioning leaks, crowd behavior previews.
The system that reads them must be smarter than the system that produces them.

Treat every extraction as a signal about the speaker, not just about the market.
Track who is right, who is early, who is recycling, and who is coordinating.
That metadata IS the alpha.
