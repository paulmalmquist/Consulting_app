# PODCAST INTELLIGENCE SYSTEM — FULL ARCHITECTURE

## 1. SYSTEM OVERVIEW

### Purpose
Extract structured alpha signals from financial podcasts. This is not a transcription storage system—it's a narrative formation detector, positioning leak extractor, and crowd behavior analyzer.

The system transforms raw audio/video into:
- **Macro viewpoints** with direction, confidence, time horizon
- **Trade ideas** with crowding tags and narrative stage
- **Narrative velocity tracking** (early → crowded → dangerous)
- **Historical analog detection** ("History Rhymes" triggers)
- **Speaker track records** with Brier scores
- **Adversarial/authenticity scoring**
- **Daily intelligence briefs**

### Core Principle
Podcasts reveal narratives before they're widely distributed. Early-stage ideas, emerging consensus, speaker biases, and coordination attempts are all detectable in raw podcast audio. The system extracts these signals systematically, tracks how ideas spread across the podcast ecosystem, and flags when narratives transition from novel to crowded to dangerous.

---

## 2. INGESTION PIPELINE

### Input Sources

| Source | Method | Implementation |
|--------|--------|----------------|
| RSS feeds | Scheduled poll (feedparser) | `podcast_ingest_rss.py` |
| YouTube | yt-dlp audio extraction | `podcast_ingest_youtube.py` |
| Manual upload | FastAPI file upload endpoint | `podcast_ingest_upload.py` |
| Pasted transcript | Direct text input | `podcast_ingest_text.py` |

### Pipeline Architecture

```
[Audio/Video/Text Input]
    ↓
[Source Detection & Metadata Extraction]
    ├─ Title, episode number, publish date
    ├─ Guest/host identification (if available)
    └─ Duration, source URL
    ↓
[Audio Extraction] (if video) — ffmpeg
    ├─ Output: WAV/MP3
    └─ Validate duration < 5 hours
    ↓
[Transcription] — Local Whisper (whisper-large-v3)
    ├─ Device: CUDA if available, else CPU
    ├─ Output: raw text + timestamps
    └─ Store in transcript_raw table
    ↓
[Speaker Diarization] — pyannote.audio or whisperx
    ├─ Identify speaker turns
    ├─ Label speakers (by voice profile, not identity)
    └─ Segment transcript by speaker
    ↓
[Semantic Chunking] — sentence-transformers overlap chunking
    ├─ Detect topic boundaries (not fixed size)
    ├─ Respect speaker turn boundaries
    ├─ Target: 1000-1500 tokens per chunk
    └─ Create 2-sentence overlap between chunks
    ↓
[Store: podcast_episodes + podcast_transcript_chunks]
    ├─ Raw transcript for display
    ├─ Chunk-level metadata (timestamps, speakers)
    └─ Semantic embeddings for similarity search
    ↓
[Trigger Extraction Pipeline]
    └─ Enqueue episode for multi-pass extraction
```

### Transcription Service

**File:** `backend/app/services/podcast_transcription.py`

```python
class TranscriptionService:
    """Handles transcription, diarization, and chunking."""

    def __init__(self):
        self.model = whisper.load_model("large-v3")
        # Optional: whisperx for word-level timestamps + diarization
        self.diarization_pipeline = pipeline(
            "speaker-diarization",
            model_name="pyannote/speaker-diarization-3.1"
        )

    async def transcribe(self, audio_path: str) -> TranscriptResult:
        """
        Full transcription and diarization pipeline.

        Returns: TranscriptResult with:
            - raw_text: Full transcript
            - segments: Speaker-attributed segments with timestamps
            - chunks: Semantic chunks for extraction
            - metadata: Speaker count, language, duration confirmed
        """
        # 1. Run Whisper transcription
        result = self.model.transcribe(audio_path)
        raw_text = result["text"]

        # 2. Run speaker diarization
        diarization = self.diarization_pipeline(audio_path)

        # 3. Merge timestamps and speaker labels
        segments = self._merge_diarization(result, diarization)

        # 4. Semantic chunking (topic-aware, not fixed-size)
        chunks = self.semantic_chunk(segments)

        return TranscriptResult(
            raw_text=raw_text,
            segments=segments,
            chunks=chunks,
            metadata=TranscriptMetadata(
                duration_seconds=len(diarization),
                language=result.get("language", "en"),
                speaker_count=len(diarization.speakers)
            )
        )

    def semantic_chunk(
        self,
        segments: list[Segment],
        target_tokens: int = 1500,
        overlap_sentences: int = 2
    ) -> list[SemanticChunk]:
        """
        Chunk transcript by semantic boundaries, not fixed size.

        Strategy:
        1. Convert segments to sentences
        2. Compute embedding similarity between consecutive sentences
        3. Identify topic shift boundaries (low similarity)
        4. Combine into chunks of target_tokens
        5. Add overlap sentences between chunks
        6. Respect speaker turn boundaries

        Returns: SemanticChunk objects with metadata
        """
        encoder = SentenceTransformer('all-MiniLM-L6-v2')
        sentences = self._segment_to_sentences(segments)

        # Compute embeddings
        embeddings = encoder.encode([s.text for s in sentences])

        # Find topic boundaries (low cosine similarity)
        boundaries = self._find_topic_boundaries(
            embeddings,
            threshold=0.5  # cosine similarity
        )

        # Create chunks respecting boundaries and speaker turns
        chunks = self._create_chunks(
            sentences,
            boundaries,
            target_tokens,
            overlap_sentences
        )

        return chunks
```

### Ingest Service

**File:** `backend/app/services/podcast_ingest.py`

```python
class PodcastIngestService:
    """Orchestrates episode intake from various sources."""

    async def ingest_from_rss(self, source_id: UUID) -> list[UUID]:
        """Fetch new episodes from RSS feed."""
        source = await db.get_podcast_source(source_id)
        feed = feedparser.parse(source.feed_url)

        new_episode_ids = []
        for entry in feed.entries:
            # Check if episode already exists
            existing = await db.get_podcast_episode_by_guid(entry.id)
            if existing:
                continue

            # Extract audio URL
            audio_url = self._extract_audio_url(entry)
            if not audio_url:
                continue

            # Create episode record
            episode = PodcastEpisode(
                source_id=source_id,
                title=entry.title,
                description=entry.get('description', ''),
                publish_date=self._parse_date(entry.published),
                duration_seconds=int(entry.itunes_duration or 0),
                audio_url=audio_url,
                guid=entry.id,
                status='pending_transcription'
            )
            episode_id = await db.create_podcast_episode(episode)
            new_episode_ids.append(episode_id)

            # Queue for transcription
            await queue.enqueue('pod-transcription', episode_id)

        return new_episode_ids

    async def ingest_from_youtube(self, video_url: str) -> UUID:
        """Extract audio from YouTube and create episode."""
        ydl_opts = {
            'format': 'bestaudio/best',
            'postprocessors': [{
                'key': 'FFmpegExtractAudio',
                'preferredcodec': 'wav',
                'preferredquality': '192',
            }],
            'quiet': False,
        }

        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(video_url, download=True)
            audio_path = ydl.prepare_filename(info)

        # Create episode with uploaded audio
        episode = PodcastEpisode(
            source_id=None,  # YouTube manual upload
            title=info.get('title', ''),
            description=info.get('description', ''),
            publish_date=info.get('upload_date'),
            duration_seconds=info.get('duration', 0),
            audio_path=audio_path,
            guid=info.get('id'),
            status='pending_transcription'
        )
        episode_id = await db.create_podcast_episode(episode)
        await queue.enqueue('pod-transcription', episode_id)

        return episode_id

    async def ingest_from_upload(self, file: UploadFile) -> UUID:
        """Store uploaded audio file and create episode."""
        # Save to storage
        file_path = f"podcasts/{uuid4()}/{file.filename}"
        await storage.save_file(file_path, file.file)

        # Extract metadata from audio
        duration = self._get_audio_duration(file_path)

        # Create episode
        episode = PodcastEpisode(
            source_id=None,
            title=file.filename,
            audio_path=file_path,
            duration_seconds=duration,
            status='pending_transcription'
        )
        episode_id = await db.create_podcast_episode(episode)
        await queue.enqueue('pod-transcription', episode_id)

        return episode_id

    async def ingest_from_transcript(self, text: str, metadata: dict) -> UUID:
        """Accept pasted transcript directly."""
        episode = PodcastEpisode(
            source_id=None,
            title=metadata.get('title', 'Pasted Transcript'),
            publish_date=metadata.get('date'),
            status='transcription_provided'
        )
        episode_id = await db.create_podcast_episode(episode)

        # Store transcript as chunks
        chunks = self.semantic_chunk(
            self._text_to_segments(text),
            target_tokens=1500
        )
        await db.create_transcript_chunks(episode_id, chunks)

        # Trigger extraction
        await queue.enqueue('pod-extraction', episode_id)

        return episode_id
```

---

## 3. EXTRACTION PIPELINE — DUAL LLM ROUTING

### Architecture Overview

```
[Semantic Chunks from Episode]
    ↓
[Router: Classify chunk content type]
    │
    ├─→ Financial/macro commentary      → [Claude API]
    ├─→ Specific trade/position         → [GPT-4o API]
    ├─→ Guest introduction/credentials  → [GPT-4o API]
    └─→ Meta-discussion/process         → [Claude API]
    ↓
[Pass 1: Parallel Structured Extraction (GPT-4o)]
    ├─ Macro viewpoints extraction
    ├─ Trade ideas extraction
    ├─ Speaker identification
    └─ Asset class / ticker tagging
    ↓
[Pass 2: Parallel Nuanced Extraction (Claude)]
    ├─ Narrative detection (emerging vs. reinforcing vs. fading)
    ├─ Analog/historical rhyme detection
    ├─ Uncertainty/hedging analysis
    └─ Adversarial scoring
    ↓
[Pass 3: Single Claude Call — Cross-Chunk Synthesis]
    ├─ Episode-level narrative arc
    ├─ Agreements between speakers
    ├─ Disagreements between speakers
    ├─ Most novel idea
    └─ Most crowded idea
    ↓
[Pass 4: Single Claude Call — Adversarial Analysis]
    ├─ Authenticity score (genuine analysis vs. performance)
    ├─ Originality score (novel vs. recycled)
    ├─ Manipulation risk score
    └─ Timing analysis
    ↓
[Store: All extraction tables]
    ├─ podcast_macro_views
    ├─ podcast_trade_ideas
    ├─ podcast_narratives
    ├─ podcast_analogs
    ├─ podcast_uncertainty_markers
    ├─ podcast_adversarial_scores
    └─ podcast_speakers
```

### Why Dual LLM Routing

**Claude excels at:**
- Nuanced reasoning and context understanding
- Detecting hedging language and conversational subtext
- Chain-of-thought analysis of reasoning chains
- Open-ended narrative detection
- Historical context and analog identification
- Scoring authenticity based on subtle signals

**GPT-4o excels at:**
- Structured JSON output with high consistency
- Entity extraction and classification into fixed schemas
- Multi-entity parsing from unstructured text
- Fast processing for high-volume structured work
- Reliable tagging and categorization
- Cost efficiency on high-volume standardized tasks

**Cost Optimization:**
- GPT-4o: ~$0.003 per 1K input tokens (structured work)
- Claude: ~$0.008 per 1K input tokens (nuanced work)
- Route volume to GPT-4o, complexity to Claude
- Parallel execution where possible

### Extraction Service

**File:** `backend/app/services/podcast_extraction.py`

```python
class PodcastExtractionPipeline:
    """Orchestrates multi-pass extraction from podcast chunks."""

    def __init__(self):
        self.claude_client = Anthropic()
        self.openai_client = OpenAI()
        self.db = PostgresClient()

    async def extract_episode(self, episode_id: UUID) -> ExtractionResult:
        """
        Full extraction pipeline for a single episode.

        Process:
        1. Fetch transcript chunks
        2. Pass 1: Structured extraction (GPT-4o, parallelized)
        3. Pass 2: Nuanced extraction (Claude, parallelized)
        4. Pass 3: Cross-chunk synthesis (Claude, single call)
        5. Pass 4: Adversarial scoring (Claude, single call)
        6. Store all results

        Returns: ExtractionResult with all signals
        """
        episode = await self.db.get_podcast_episode(episode_id)
        chunks = await self.db.get_transcript_chunks(episode_id)

        # Mark episode as extracting
        await self.db.update_episode_status(episode_id, 'extracting')

        try:
            # Pass 1: Structured extraction (GPT-4o, parallel)
            structured_results = await asyncio.gather(*[
                self._extract_structured_gpt4o(chunk)
                for chunk in chunks
            ], return_exceptions=True)

            # Pass 2: Nuanced extraction (Claude, parallel)
            nuanced_results = await asyncio.gather(*[
                self._extract_nuanced_claude(chunk)
                for chunk in chunks
            ], return_exceptions=True)

            # Pass 3: Cross-chunk synthesis (Claude)
            synthesis = await self._synthesize_episode_claude(
                episode,
                chunks,
                structured_results,
                nuanced_results
            )

            # Pass 4: Adversarial scoring (Claude)
            adversarial = await self._score_adversarial_claude(
                episode,
                chunks,
                structured_results,
                synthesis
            )

            # Consolidate results
            extraction_result = ExtractionResult(
                episode_id=episode_id,
                macro_views=self._consolidate_macro_views(
                    structured_results,
                    synthesis
                ),
                trade_ideas=self._consolidate_trade_ideas(
                    structured_results,
                    synthesis
                ),
                narratives=synthesis.narratives,
                analogs=nuanced_results.analogs,
                uncertainty_markers=self._consolidate_uncertainty(
                    nuanced_results
                ),
                adversarial_scores=adversarial,
                speakers=self._consolidate_speakers(
                    structured_results,
                    chunks
                ),
                extraction_timestamp=datetime.now(timezone.utc)
            )

            # Store all results
            await self._store_extraction(episode_id, extraction_result)
            await self.db.update_episode_status(episode_id, 'extraction_complete')

            return extraction_result

        except Exception as e:
            await self.db.update_episode_status(
                episode_id,
                'extraction_failed',
                error=str(e)
            )
            raise

    async def _extract_structured_gpt4o(self, chunk: SemanticChunk) -> StructuredExtraction:
        """
        Pass 1: Structured extraction with GPT-4o.

        Extracts from chunk:
        1. MACRO VIEWPOINTS: Economic direction, rates, liquidity, cycles
        2. TRADE IDEAS: Explicit trades and implied positioning
        3. SPEAKERS: Identification, roles, organizations
        4. ASSETS: Tickers, asset classes mentioned
        """
        prompt = self._build_structured_extraction_prompt(chunk)

        response = await self.openai_client.chat.completions.create(
            model="gpt-4o",
            messages=[{
                "role": "user",
                "content": prompt
            }],
            temperature=0.0,  # Deterministic extraction
            response_format={
                "type": "json_schema",
                "json_schema": StructuredExtractionSchema
            }
        )

        return StructuredExtraction(**json.loads(
            response.choices[0].message.content
        ))

    async def _extract_nuanced_claude(self, chunk: SemanticChunk) -> NuancedExtraction:
        """
        Pass 2: Nuanced extraction with Claude.

        Extracts:
        1. NARRATIVE THREADS: Emerging, reinforcing, shifting narratives
        2. HISTORICAL ANALOGS: References to past periods
        3. UNCERTAINTY/HEDGING: Conviction indicators
        4. META-GAME: Positioning, coordination signals
        """
        prompt = self._build_nuanced_extraction_prompt(chunk)

        message = await self.claude_client.messages.create(
            model="claude-3-5-sonnet-20241022",
            max_tokens=2000,
            messages=[{
                "role": "user",
                "content": prompt
            }]
        )

        # Parse Claude's text response into structured format
        return self._parse_nuanced_response(message.content[0].text)

    async def _synthesize_episode_claude(
        self,
        episode: PodcastEpisode,
        chunks: list[SemanticChunk],
        structured_results: list[StructuredExtraction],
        nuanced_results: list[NuancedExtraction]
    ) -> EpisodeSynthesis:
        """
        Pass 3: Cross-chunk synthesis with Claude.

        Given ALL chunks and their extracted signals, synthesize:
        1. Episode-level narrative arc
        2. Key agreements between speakers
        3. Key disagreements
        4. Most novel idea (novelty > 80, not recycled)
        5. Most crowded idea (mentioned in 5+ chunks)
        6. Overall conviction level
        """
        structured_summary = self._summarize_structured(structured_results)
        nuanced_summary = self._summarize_nuanced(nuanced_results)

        prompt = f"""
        You are analyzing a financial podcast episode. Synthesize the extracted signals below.

        Episode: {episode.title}
        Duration: {episode.duration_seconds} seconds
        {episode.description}

        EXTRACTED STRUCTURED SIGNALS (from GPT-4o):
        {structured_summary}

        EXTRACTED NUANCED SIGNALS (from Claude):
        {nuanced_summary}

        Synthesize into episode-level insights:

        1. NARRATIVE ARC: How did the conversation evolve? Was there a thesis established, challenged, or refined?

        2. SPEAKER AGREEMENTS: What did all speakers agree on? (This often reveals shared assumptions)

        3. SPEAKER DISAGREEMENTS: Where did speakers diverge? How did they handle disagreement?

        4. MOST NOVEL IDEA: What was the most original insight expressed? Why is it novel?

        5. MOST CROWDED IDEA: What idea appeared most frequently? Is it in early, growth, or mature stage?

        6. CONVICTION PROFILE: What was the overall confidence level? Any major hedging patterns?

        7. EMERGING NARRATIVE STAGE: Is the main narrative idea early (1-2 mentions), growing (3-7 mentions), or approaching crowded (8+ mentions)?

        Provide your response as structured analysis.
        """

        message = await self.claude_client.messages.create(
            model="claude-3-5-sonnet-20241022",
            max_tokens=3000,
            messages=[{"role": "user", "content": prompt}]
        )

        return self._parse_synthesis_response(message.content[0].text)

    async def _score_adversarial_claude(
        self,
        episode: PodcastEpisode,
        chunks: list[SemanticChunk],
        structured_results: list[StructuredExtraction],
        synthesis: EpisodeSynthesis
    ) -> AdversarialScore:
        """
        Pass 4: Adversarial scoring with Claude.

        Score:
        1. AUTHENTICITY (0-100): Genuine analysis vs. performance/narrative
        2. ORIGINALITY (0-100): Novel insights vs. recycled talking points
        3. MANIPULATION RISK (0-100): Suspicious timing, coordination, book-talking

        Flags:
        - Recycled talking points (count)
        - Coordinated narrative signs
        - Timing alignment with recent market moves
        - Conflict of interest signals
        """
        prompt = f"""
        Perform an adversarial analysis of this podcast episode to assess signal quality.

        Episode: {episode.title}
        Publish date: {episode.publish_date}

        EPISODE CONTENT SUMMARY:
        {self._summarize_episode(chunks, synthesis)}

        EXTRACTED SIGNALS:
        {self._summarize_all_signals(structured_results, synthesis)}

        ADVERSARIAL SCORING RUBRIC:

        1. AUTHENTICITY (0-100):
           - 80-100: Genuine, thoughtful analysis with reasoning chains, acknowledges uncertainty
           - 60-79: Mostly genuine, some rhetorical flourishes, mostly hedged
           - 40-59: Mixed; some original analysis + some performance/recycled points
           - 20-39: Mostly performance; recycled talking points dominate
           - 0-19: Pure performance or narrative push; no genuine analysis

        2. ORIGINALITY (0-100):
           - 80-100: Novel insights, non-obvious connections, contrarian elements
           - 60-79: Mostly original with some recycled talking points
           - 40-59: Mix of original and recycled; not particularly novel
           - 20-39: Mostly recycled; little original thinking
           - 0-19: Purely recycled consensus narratives

        3. MANIPULATION RISK (0-100):
           - 0-20: Low; no concerning signals
           - 21-40: Moderate; minor flags but likely unintentional
           - 41-60: Elevated; some coordination or timing signals
           - 61-80: High; multiple manipulation flags
           - 81-100: Severe; clear coordinated narrative push or book-talking

        ANALYSIS:
        - What are the key authenticity indicators? Any hedging language or false certainty?
        - How much of this narrative is recycled from recent media/podcasts vs. original?
        - Timing analysis: Did this publish suspiciously aligned with market moves?
        - Speaker analysis: Any indication they're talking their own book or position?
        - Narrative coordination: Do speakers reinforce a single narrative too cleanly?

        Provide numerical scores and supporting evidence.
        """

        message = await self.claude_client.messages.create(
            model="claude-3-5-sonnet-20241022",
            max_tokens=2500,
            messages=[{"role": "user", "content": prompt}]
        )

        return self._parse_adversarial_response(message.content[0].text)
```

### Extraction Prompts

**File:** `backend/app/services/podcast_extraction_prompts.py`

These templates are called by the extraction service. Full prompts are detailed and include rubrics, examples, and scoring guidance.

---

## 4. NARRATIVE VELOCITY ENGINE

### Purpose

Track how narratives evolve across ALL podcasts in a rolling window. Detect when ideas transition from:
- **Early**: Novel, few mentions, limited speaker agreement
- **Growth**: Spreading, increasing conviction convergence
- **Crowded**: High mention frequency, many speakers, narrow conviction range, low hedging
- **Dangerous**: Perfect consensus, high confidence, potential trap formation

### Architecture

```
[All podcast_narratives from all episodes]
    ↓
[Normalize labels] (fuzzy match + embedding similarity)
    │   Cluster similar narrative descriptions
    └─ Handle plurals, synonyms ("inflation", "rising prices")
    ↓
[Compute rolling windows: 7d, 30d, 90d]
    │   For each window:
    │   - Count mentions
    │   - Count unique speakers
    │   - Average conviction scores
    │   - Variance in conviction (divergence)
    └─ Track direction of movement (velocity)
    ↓
[Calculate crowding metrics]
    │   mention_velocity = (mentions_this_window / mentions_prev_window)
    │   speaker_concentration = (top_3_speakers / total_speakers)
    │   conviction_convergence = 1 - (std_dev / mean_conviction)
    │   hedging_ratio = (hedged_statements / total_statements)
    └─ Crowding_risk = f(velocity, speakers, conviction_convergence, hedging)
    ↓
[Classify narrative stage]
    │   - Emerging: < 3 mentions, < 2 speakers, novelty > 70
    │   - Reinforcing: 3-7 mentions, 2-4 speakers, growing conviction
    │   - Crowding: 8-15 mentions, 5+ speakers, narrow conviction
    │   - Crowded: 15+ mentions, 7+ speakers, consensus, no hedging
    │   - Fading: Declining mentions, counter-narratives emerging
    └─ Write to podcast_narrative_velocity
    ↓
[Trigger alerts if crowding_risk >= 'elevated']
    └─ Post to daily brief, create divergence scan task
```

### Service

**File:** `backend/app/services/podcast_narrative_velocity.py`

```python
class NarrativeVelocityEngine:
    """Tracks narrative emergence, growth, and crowding over time."""

    def __init__(self):
        self.db = PostgresClient()
        self.embedding_service = EmbeddingService()
        self.windows = [7, 30, 90]  # days

    async def update_narrative_velocity(self):
        """
        Recalculate all active narrative velocity windows.
        Called daily by scheduled task.
        """
        # 1. Fetch all narratives from last 90 days
        narratives = await self.db.get_narratives_since(
            days=90
        )

        # 2. Normalize/cluster similar narratives
        normalized = await self._normalize_narratives(narratives)

        # 3. For each unique narrative, compute velocity windows
        for narrative_group in normalized:
            for window_days in self.windows:
                velocity_data = await self._compute_window(
                    narrative_group,
                    window_days
                )

                # Upsert velocity record
                await self.db.upsert_narrative_velocity(
                    narrative_id=narrative_group.id,
                    window_days=window_days,
                    velocity_data=velocity_data
                )

        # 4. Check for crowding escalations
        crowding_alerts = await self._detect_crowding_escalations()

        # 5. Create/update crowding alerts
        for alert in crowding_alerts:
            await self.db.create_crowding_alert(alert)

    async def _normalize_narratives(
        self,
        narratives: list[PodcastNarrative]
    ) -> list[NarrativeGroup]:
        """
        Cluster narratives with similar semantic content.

        Strategy:
        1. Compute embeddings for each narrative description
        2. Use cosine similarity to group (threshold: 0.85)
        3. Handle synonyms/variations ("rising inflation", "price increases")
        4. Return deduplicated groups with representative label
        """
        # Embed all descriptions
        descriptions = [n.description for n in narratives]
        embeddings = await self.embedding_service.embed_batch(descriptions)

        # Cluster with similarity threshold
        groups = []
        processed = set()

        for i, (narr, emb) in enumerate(zip(narratives, embeddings)):
            if i in processed:
                continue

            group = [narr]
            processed.add(i)

            # Find similar narratives
            for j in range(i + 1, len(narratives)):
                if j in processed:
                    continue

                similarity = cosine_similarity(
                    embeddings[i:i+1],
                    embeddings[j:j+1]
                )[0][0]

                if similarity > 0.85:
                    group.append(narratives[j])
                    processed.add(j)

            # Create normalized group
            representative = self._select_representative(group)
            groups.append(NarrativeGroup(
                id=uuid4(),
                representative_narrative=representative,
                group_members=group,
                cluster_similarity=similarity
            ))

        return groups

    async def _compute_window(
        self,
        narrative_group: NarrativeGroup,
        window_days: int
    ) -> NarrativeVelocityData:
        """
        Compute all metrics for a narrative in a time window.

        Metrics:
        - mention_count: total mentions
        - velocity: change vs. previous window
        - unique_speakers: how many different speakers
        - conviction_avg: average conviction score
        - conviction_std: standard deviation (divergence)
        - hedging_ratio: fraction of hedged statements
        - crowding_risk: composite score
        - narrative_stage: emerging/reinforcing/crowded/fading
        """
        cutoff_date = datetime.now(timezone.utc) - timedelta(days=window_days)
        prev_cutoff = cutoff_date - timedelta(days=window_days)

        # This window
        narratives_this = [
            n for n in narrative_group.group_members
            if n.created_at >= cutoff_date
        ]

        # Previous window
        narratives_prev = [
            n for n in narrative_group.group_members
            if prev_cutoff <= n.created_at < cutoff_date
        ]

        # Compute metrics
        mention_count = len(narratives_this)
        mention_count_prev = len(narratives_prev)

        if mention_count_prev > 0:
            velocity = mention_count / mention_count_prev
        else:
            velocity = float('inf') if mention_count > 0 else 1.0

        unique_speakers = len(set(
            n.speaker_id for n in narratives_this
        ))

        convictions = [n.conviction_score for n in narratives_this]
        conviction_avg = mean(convictions) if convictions else 0
        conviction_std = stdev(convictions) if len(convictions) > 1 else 0

        hedged = sum(1 for n in narratives_this if n.is_hedged)
        hedging_ratio = hedged / mention_count if mention_count > 0 else 0

        # Crowding risk calculation
        crowding_risk = self._calculate_crowding_risk(
            mention_count=mention_count,
            velocity=velocity,
            unique_speakers=unique_speakers,
            conviction_avg=conviction_avg,
            conviction_std=conviction_std,
            hedging_ratio=hedging_ratio
        )

        # Narrative stage classification
        narrative_stage = self._classify_stage(
            mention_count,
            unique_speakers,
            conviction_std,
            hedging_ratio,
            crowding_risk
        )

        return NarrativeVelocityData(
            mention_count=mention_count,
            mention_velocity=velocity,
            unique_speakers=unique_speakers,
            conviction_avg=conviction_avg,
            conviction_std=conviction_std,
            hedging_ratio=hedging_ratio,
            crowding_risk=crowding_risk,
            narrative_stage=narrative_stage,
            window_days=window_days,
            computed_at=datetime.now(timezone.utc)
        )

    def _calculate_crowding_risk(
        self,
        mention_count: int,
        velocity: float,
        unique_speakers: int,
        conviction_avg: float,
        conviction_std: float,
        hedging_ratio: float
    ) -> float:
        """
        Calculate composite crowding risk score (0-100).

        High risk indicators:
        - High mention velocity (rapidly spreading)
        - Many mentions (8+)
        - Many unique speakers (5+)
        - High average conviction
        - Low std dev (narrow conviction)
        - Low hedging ratio (overconfident)
        """
        components = []

        # Mention velocity component (0-30 points)
        if velocity > 3:
            components.append(30)
        elif velocity > 2:
            components.append(25)
        elif velocity > 1.5:
            components.append(15)
        else:
            components.append(5)

        # Mention count component (0-25 points)
        if mention_count >= 15:
            components.append(25)
        elif mention_count >= 8:
            components.append(20)
        elif mention_count >= 3:
            components.append(10)
        else:
            components.append(0)

        # Speaker diversity component (0-20 points)
        if unique_speakers >= 7:
            components.append(20)
        elif unique_speakers >= 5:
            components.append(15)
        elif unique_speakers >= 3:
            components.append(8)
        else:
            components.append(0)

        # Conviction convergence component (0-15 points)
        divergence_score = 1 - (conviction_std / max(conviction_avg, 1))
        if conviction_avg > 75 and divergence_score > 0.8:
            components.append(15)
        elif conviction_avg > 70 and divergence_score > 0.7:
            components.append(10)
        else:
            components.append(0)

        # Hedging component (0-10 points, inverted)
        if hedging_ratio < 0.2:
            components.append(10)
        elif hedging_ratio < 0.4:
            components.append(5)
        else:
            components.append(0)

        return min(sum(components), 100)

    def _classify_stage(
        self,
        mention_count: int,
        unique_speakers: int,
        conviction_std: float,
        hedging_ratio: float,
        crowding_risk: float
    ) -> str:
        """
        Classify narrative stage based on metrics.

        Returns: emerging|reinforcing|crowding|crowded|fading
        """
        if mention_count < 3 and unique_speakers < 2:
            return 'emerging'
        elif mention_count < 8 and unique_speakers < 5:
            return 'reinforcing'
        elif crowding_risk >= 60:
            return 'crowded'
        elif crowding_risk >= 40:
            return 'crowding'
        else:
            return 'reinforcing'

    async def _detect_crowding_escalations(self) -> list[CrowdingAlert]:
        """
        Detect when narratives cross crowding thresholds.

        Create alert if:
        - Narrative moved from 'moderate' to 'elevated' risk
        - Narrative moved from 'elevated' to 'high' risk
        - Narrative reached 'extreme' risk
        """
        alerts = []

        # Fetch narratives with recent velocity updates
        updated_velocities = await self.db.get_recent_velocity_updates()

        for velocity_data in updated_velocities:
            # Compare to previous period
            prev_velocity = await self.db.get_narrative_velocity(
                narrative_id=velocity_data.narrative_id,
                window_days=velocity_data.window_days,
                offset_days=velocity_data.window_days
            )

            # Detect escalation
            if prev_velocity and velocity_data.crowding_risk > prev_velocity.crowding_risk:
                crowding_risk_prev = self._bucket_risk(prev_velocity.crowding_risk)
                crowding_risk_curr = self._bucket_risk(velocity_data.crowding_risk)

                if crowding_risk_curr > crowding_risk_prev:
                    alerts.append(CrowdingAlert(
                        narrative_id=velocity_data.narrative_id,
                        risk_level=crowding_risk_curr,
                        risk_prev=crowding_risk_prev,
                        escalation_date=datetime.now(timezone.utc),
                        velocity_data=velocity_data
                    ))

        return alerts

    def _bucket_risk(self, risk_score: float) -> int:
        """Bucket risk score: low(1), moderate(2), elevated(3), high(4), extreme(5)"""
        if risk_score < 30:
            return 1
        elif risk_score < 50:
            return 2
        elif risk_score < 65:
            return 3
        elif risk_score < 85:
            return 4
        else:
            return 5
```

### Crowding Risk Levels

| Level | Risk Score | Definition | Action |
|-------|-----------|------------|--------|
| Low | 0-29 | < 3 mentions, < 2 speakers, novel | Monitor |
| Moderate | 30-49 | 3-7 mentions, 2-4 speakers, growing | Track convergence |
| Elevated | 50-64 | 8-15 mentions, 5+ speakers, narrowing conviction | Alert + divergence check |
| High | 65-84 | 15+ mentions, 7+ speakers, high conviction, low hedging | High alert + trap candidate |
| Extreme | 85-100 | Consensus, high conviction, no hedging, perfect alignment | Severe alert + trap confirmation |

---

## 5. SPEAKER TRACK RECORD SYSTEM

### Purpose

Build credibility scores for speakers based on prediction accuracy (Brier scores), calibration, and domain expertise. Track who calls turns early, who recycles talking points, and who hedges appropriately.

### Architecture

```
[Extracted macro views + trade ideas]
    │   Each contains speaker_id, direction, conviction, time_horizon
    ↓
[Classify as resolvable predictions]
    │   Directional: up/down on asset/index
    │   Event: X happens by date Y
    │   Valuations: target price/ratio by date
    └─ Non-resolvable: opinions on structure, process
    ↓
[Store: speaker_predictions (status: open)]
    │   speaker_id, prediction_text, direction, target_date, conviction
    └─ Link to source episode
    ↓
[Daily resolution job: check market data]
    │   For each open prediction:
    │   - If target_date passed: check actual outcome
    │   - Compute Brier score: (forecast_probability - actual_outcome)^2
    │   - Update prediction status: resolved
    ↓
[Reaggregate: speaker_track_records]
    │   For each speaker, for each time window (6mo, 1yr, all-time):
    │   - Hit rate (% correct)
    │   - Brier score (calibration)
    │   - Domain accuracy (by asset class)
    │   - Bias analysis (systematic over/under optimism)
    └─ Compute credibility_score
    ↓
[Surface in speaker cards + leaderboards]
    └─ Show track record, recent predictions, resolution status
```

### Service

**File:** `backend/app/services/podcast_speaker_tracking.py`

```python
class SpeakerTrackingService:
    """Manages speaker track records and prediction resolution."""

    def __init__(self):
        self.db = PostgresClient()
        self.market_data_service = MarketDataService()

    async def create_speaker_prediction(
        self,
        speaker_id: UUID,
        episode_id: UUID,
        prediction_text: str,
        prediction_type: str,  # directional, event, valuation
        direction: Optional[str],  # bullish, bearish, neutral
        confidence_stated: float,  # 0-100
        target_date: Optional[date],
        asset_classes: list[str],
        tickers: list[str]
    ) -> UUID:
        """
        Store a speaker prediction from an episode.

        prediction_type:
        - directional: "SPY will go up 10% by March 2027"
        - event: "Fed will cut rates by March 2027"
        - valuation: "AAPL will be $250 by December 2026"
        """
        prediction = SpeakerPrediction(
            speaker_id=speaker_id,
            episode_id=episode_id,
            prediction_text=prediction_text,
            prediction_type=prediction_type,
            direction=direction,
            confidence_stated=confidence_stated,
            target_date=target_date,
            asset_classes=asset_classes,
            tickers=tickers,
            created_at=datetime.now(timezone.utc),
            status='open'
        )

        prediction_id = await self.db.create_speaker_prediction(prediction)

        # If target_date is today or earlier, attempt immediate resolution
        if target_date and target_date <= date.today():
            await self.resolve_prediction(prediction_id)

        return prediction_id

    async def resolve_prediction(self, prediction_id: UUID):
        """
        Attempt to resolve a single prediction.

        Resolution logic:
        1. Check if target_date has passed
        2. Fetch actual market data for target_date
        3. Compare prediction to actual outcome
        4. Calculate Brier score
        5. Update prediction with resolution
        """
        prediction = await self.db.get_speaker_prediction(prediction_id)

        if not prediction.target_date or prediction.status != 'open':
            return

        if prediction.target_date > date.today():
            return  # Target date hasn't passed yet

        # Resolve based on type
        if prediction.prediction_type == 'directional':
            resolution = await self._resolve_directional(prediction)
        elif prediction.prediction_type == 'event':
            resolution = await self._resolve_event(prediction)
        elif prediction.prediction_type == 'valuation':
            resolution = await self._resolve_valuation(prediction)
        else:
            return  # Can't resolve this type

        # Update prediction
        await self.db.update_speaker_prediction(prediction_id, {
            'status': 'resolved',
            'resolution_date': date.today(),
            'actual_outcome': resolution.actual_outcome,
            'brier_score': resolution.brier_score,
            'was_correct': resolution.was_correct,
            'resolution_notes': resolution.notes
        })

    async def _resolve_directional(
        self,
        prediction: SpeakerPrediction
    ) -> ResolutionResult:
        """
        Resolve directional predictions.

        Extract from prediction_text:
        - Ticker/index
        - Direction (up/down)
        - Target percentage (if stated)

        Check: Did the asset move in stated direction by target_date?
        """
        # Parse ticker from prediction
        ticker = prediction.tickers[0] if prediction.tickers else None
        if not ticker:
            return ResolutionResult(
                was_correct=None,
                brier_score=None,
                actual_outcome=None,
                notes="Could not identify ticker"
            )

        # Get price at prediction date and target date
        # Assuming prediction.created_at is "prediction date"
        price_at_prediction = await self.market_data_service.get_price(
            ticker,
            prediction.created_at.date()
        )
        price_at_target = await self.market_data_service.get_price(
            ticker,
            prediction.target_date
        )

        if not price_at_prediction or not price_at_target:
            return ResolutionResult(
                was_correct=None,
                brier_score=None,
                actual_outcome=None,
                notes="Could not fetch market data"
            )

        # Calculate actual move
        pct_change = (price_at_target - price_at_prediction) / price_at_prediction * 100

        # Was it correct?
        was_correct = (
            (prediction.direction == 'bullish' and pct_change > 0) or
            (prediction.direction == 'bearish' and pct_change < 0) or
            (prediction.direction == 'neutral' and abs(pct_change) < 5)
        )

        # Brier score: (forecast_prob - actual_outcome)^2
        # Convert stated confidence to probability
        forecast_prob = prediction.confidence_stated / 100
        actual_outcome = 1 if was_correct else 0
        brier_score = (forecast_prob - actual_outcome) ** 2

        return ResolutionResult(
            was_correct=was_correct,
            brier_score=brier_score,
            actual_outcome=actual_outcome,
            notes=f"{ticker} moved {pct_change:.1f}% (target: {prediction.direction})"
        )

    async def aggregate_speaker_track_record(
        self,
        speaker_id: UUID,
        time_window_months: Optional[int] = None
    ) -> SpeakerTrackRecord:
        """
        Aggregate resolved predictions for a speaker.

        Compute:
        - Hit rate: % of correct predictions
        - Brier score: calibration (lower is better)
        - Domain accuracy: by asset class
        - Bias: systematic over/under optimism
        - Credibility score: composite
        """
        # Fetch all resolved predictions
        predictions = await self.db.get_speaker_predictions(
            speaker_id=speaker_id,
            status='resolved',
            months=time_window_months
        )

        if not predictions:
            return SpeakerTrackRecord(
                speaker_id=speaker_id,
                hit_rate=None,
                brier_score=None,
                prediction_count=0,
                domain_accuracy={},
                credibility_score=None
            )

        # Hit rate
        correct = sum(1 for p in predictions if p.was_correct)
        hit_rate = correct / len(predictions)

        # Brier score (average)
        brier_scores = [p.brier_score for p in predictions if p.brier_score]
        brier_score = mean(brier_scores) if brier_scores else None

        # Domain accuracy (by asset class)
        domain_accuracy = {}
        for domain in ['equities', 'fixed_income', 'forex', 'commodities']:
            domain_preds = [
                p for p in predictions
                if domain in [ac.lower() for ac in p.asset_classes]
            ]
            if domain_preds:
                domain_correct = sum(1 for p in domain_preds if p.was_correct)
                domain_accuracy[domain] = domain_correct / len(domain_preds)

        # Bias (for directional predictions)
        bullish_preds = [p for p in predictions if p.direction == 'bullish']
        bullish_correct = sum(1 for p in bullish_preds if p.was_correct)
        bullish_accuracy = (bullish_correct / len(bullish_preds)
                           if bullish_preds else None)

        bearish_preds = [p for p in predictions if p.direction == 'bearish']
        bearish_correct = sum(1 for p in bearish_preds if p.was_correct)
        bearish_accuracy = (bearish_correct / len(bearish_preds)
                           if bearish_preds else None)

        bias = None
        if bullish_accuracy and bearish_accuracy:
            bias = bullish_accuracy - bearish_accuracy  # Positive = bullish bias

        # Credibility score (composite)
        credibility_score = self._calculate_credibility(
            hit_rate=hit_rate,
            brier_score=brier_score,
            domain_accuracy=domain_accuracy,
            bias=bias,
            prediction_count=len(predictions)
        )

        return SpeakerTrackRecord(
            speaker_id=speaker_id,
            hit_rate=hit_rate,
            brier_score=brier_score,
            prediction_count=len(predictions),
            domain_accuracy=domain_accuracy,
            bullish_accuracy=bullish_accuracy,
            bearish_accuracy=bearish_accuracy,
            bias=bias,
            credibility_score=credibility_score,
            as_of_date=date.today()
        )

    def _calculate_credibility(
        self,
        hit_rate: float,
        brier_score: Optional[float],
        domain_accuracy: dict,
        bias: Optional[float],
        prediction_count: int
    ) -> float:
        """
        Calculate credibility score (0-100).

        Formula:
        0.4 * hit_rate +
        0.2 * (1 - min(brier_score, 1)) +
        0.2 * avg(domain_accuracy) +
        0.1 * (1 - abs(bias)) +
        0.1 * log(prediction_count) / log(50)  # sample size weight
        """
        score = 0

        # Hit rate (40%)
        score += 0.4 * hit_rate * 100

        # Brier score (20%)
        if brier_score is not None:
            calibration = 1 - min(brier_score, 1)
            score += 0.2 * calibration * 100

        # Domain accuracy (20%)
        if domain_accuracy:
            avg_domain = mean(domain_accuracy.values())
            score += 0.2 * avg_domain * 100

        # Bias (10%)
        if bias is not None:
            no_bias_score = 1 - abs(bias)
            score += 0.1 * no_bias_score * 100

        # Sample size (10%)
        sample_weight = min(log(prediction_count) / log(50), 1)
        score += 0.1 * sample_weight * 100

        return min(score, 100)
```

---

## 6. INTEGRATION ARCHITECTURE

### A. History Rhymes Integration

When `podcast_analogs` are detected:

1. Check if analog period exists in `rhyme_periods` table
2. If yes: create `auto_suggested_rhyme_id` link
3. If no: create entry in `podcast_rhyme_suggestions` for manual review
4. Surface accepted analogs in daily brief under "HISTORICAL PARALLELS"

**File:** `backend/app/services/podcast_integration.py`

```python
async def link_rhymes(episode_id: UUID):
    """Link podcast analogs to History Rhymes engine."""
    analogs = await self.db.get_podcast_analogs(episode_id)

    for analog in analogs:
        # Search for matching rhyme period
        rhyme_period = await self.rhyme_engine.find_matching_period(
            analog.period_description,
            analog.similarity_keywords
        )

        if rhyme_period:
            # Direct link
            await self.db.create_rhyme_podcast_link(
                rhyme_period_id=rhyme_period.id,
                podcast_episode_id=episode_id,
                analog_id=analog.id
            )
        else:
            # Create suggestion for manual review
            await self.db.create_rhyme_suggestion(
                podcast_episode_id=episode_id,
                analog_description=analog.description,
                reasoning=analog.reasoning,
                suggested_period_keywords=analog.similarity_keywords
            )
```

### B. Divergence Engine Integration

When `podcast_macro_views` conflict with market data:

1. Compare speaker view direction vs. actual market moves/flows
2. Create `podcast_divergences` entry
3. If severity >= 'significant': candidate for trap lab
4. Optionally promote to `trading_signals` (source: 'podcast_divergence')

```python
async def scan_divergences():
    """Daily divergence scan between podcast views and market reality."""
    views = await self.db.get_macro_views_last_7_days()

    for view in views:
        for ticker in view.tickers:
            # Get actual market move
            actual_move = await self.market_data.get_move_pct(
                ticker,
                since=view.created_at
            )

            # Compare to stated direction
            divergence_severity = self._calculate_divergence_severity(
                stated_direction=view.direction,
                actual_move=actual_move,
                stated_conviction=view.conviction
            )

            if divergence_severity >= 'moderate':
                divergence = PodcastDivergence(
                    podcast_episode_id=view.episode_id,
                    macro_view_id=view.id,
                    ticker=ticker,
                    stated_direction=view.direction,
                    stated_conviction=view.conviction,
                    actual_move=actual_move,
                    divergence_severity=divergence_severity,
                    speaker_credibility=view.speaker_credibility
                )
                await self.db.create_podcast_divergence(divergence)

                # Promote if significant
                if divergence_severity == 'significant':
                    await self._promote_to_trap_lab(divergence)
```

### C. Trap Lab Integration

When narrative crowding + data divergence:

1. Compute `trap_probability` from:
   - Narrative velocity (crowding risk)
   - Divergence severity vs. market data
   - Speaker credibility (are credible voices hedging?)
   - Adversarial scores (manipulation risk)
2. Feed into trap lab as candidate

```python
async def compute_trap_probability(episode_id: UUID) -> float:
    """Compute probability this episode signals a trap formation."""
    episode = await self.db.get_podcast_episode(episode_id)

    # Component 1: Narrative crowding (0-40 points)
    narratives = await self.db.get_episode_narratives(episode_id)
    avg_crowding_risk = mean([
        n.crowding_risk for n in narratives
    ])
    crowding_score = min(avg_crowding_risk / 100 * 40, 40)

    # Component 2: Data divergence (0-30 points)
    divergences = await self.db.get_episode_divergences(episode_id)
    high_severity_count = sum(
        1 for d in divergences
        if d.divergence_severity in ['significant', 'extreme']
    )
    divergence_score = min(high_severity_count / len(divergences) * 30, 30) if divergences else 0

    # Component 3: Speaker credibility hedging (0-20 points)
    speakers = await self.db.get_episode_speakers(episode_id)
    low_credibility_count = sum(
        1 for s in speakers
        if s.credibility_score < 50
    )
    credibility_score = min(low_credibility_count / len(speakers) * 20, 20) if speakers else 0

    # Component 4: Adversarial signals (0-10 points)
    adversarial = await self.db.get_adversarial_score(episode_id)
    manipulation_risk = adversarial.manipulation_risk
    adversarial_score = min(manipulation_risk / 100 * 10, 10)

    trap_probability = crowding_score + divergence_score + credibility_score + adversarial_score

    return min(trap_probability, 100)
```

### D. Trading Lab Integration

Promote high-conviction podcast signals to `trading_signals`:

- source: 'podcast'
- category: maps from `view_type`
- strength: from conviction + speaker credibility
- evidence: jsonb with episode_id, speaker, statement

```python
async def promote_to_trading_signals(episode_id: UUID):
    """Promote high-conviction signals to trading lab."""
    episode = await self.db.get_podcast_episode(episode_id)
    trade_ideas = await self.db.get_episode_trade_ideas(episode_id)

    for trade_idea in trade_ideas:
        # Only promote high conviction
        if trade_idea.conviction < 70:
            continue

        # Skip if low speaker credibility
        speaker = await self.db.get_speaker(trade_idea.speaker_id)
        if speaker.credibility_score and speaker.credibility_score < 40:
            continue

        signal = TradingSignal(
            source='podcast',
            source_episode_id=episode_id,
            category=trade_idea.idea_type,
            direction=trade_idea.direction,
            tickers=trade_idea.tickers,
            asset_classes=trade_idea.asset_classes,
            strength=self._calculate_signal_strength(
                conviction=trade_idea.conviction,
                credibility=speaker.credibility_score,
                novelty=trade_idea.novelty
            ),
            evidence={
                'episode_id': episode_id,
                'episode_title': episode.title,
                'speaker': speaker.name,
                'speaker_credibility': speaker.credibility_score,
                'statement': trade_idea.description,
                'crowding_stage': trade_idea.narrative_stage
            },
            created_at=datetime.now(timezone.utc)
        )

        await self.trading_lab_service.create_signal(signal)
```

### E. Daily Brief Integration

Section: "FROM PODCASTS TODAY"

Pre-computed in `podcast_daily_briefs` table:

```python
async def generate_daily_brief():
    """Generate podcast intelligence for daily brief."""
    today = date.today()
    yesterday = today - timedelta(days=1)

    # Recent episodes and signals
    episodes = await self.db.get_episodes_since(yesterday)

    # Top emerging ideas (high novelty, < 5 mentions)
    emerging = await self.db.get_narratives(
        narrative_stage='emerging',
        novelty_min=70,
        since=yesterday
    )
    top_emerging = sorted(
        emerging,
        key=lambda x: x.novelty,
        reverse=True
    )[:3]

    # Most repeated narrative (highest mention count)
    all_narratives = await self.db.get_narratives_since(yesterday)
    most_repeated = max(
        all_narratives,
        key=lambda x: x.mention_count
    ) if all_narratives else None

    # Most contrarian take (novelty > 80, but low speaker agreement)
    contrarian = [
        n for n in all_narratives
        if n.novelty > 80 and len(n.speakers) <= 2
    ]
    most_contrarian = contrarian[0] if contrarian else None

    # Biggest disagreement (speakers diverging on direction)
    disagreements = await self._compute_disagreements(episodes)
    biggest = disagreements[0] if disagreements else None

    # New analog references (rhyme suggestions)
    suggestions = await self.db.get_rhyme_suggestions(since=yesterday)

    # Crowding alerts
    alerts = await self.db.get_crowding_alerts(since=yesterday)
    alert_elevated = [a for a in alerts if a.risk_level >= 3]

    # Trap candidates
    trap_candidates = await self._compute_trap_candidates(episodes)

    brief = PodcastDailyBrief(
        date=today,
        episode_count=len(episodes),
        top_emerging_ideas=top_emerging,
        most_repeated_narrative=most_repeated,
        most_contrarian_take=most_contrarian,
        biggest_disagreement=biggest,
        new_analog_references=suggestions,
        crowding_alerts=alert_elevated,
        trap_candidates=trap_candidates,
        generated_at=datetime.now(timezone.utc)
    )

    await self.db.create_podcast_daily_brief(brief)
```

---

## 7. API ROUTES

**File:** `backend/app/routes/podcast_intelligence.py`

### Ingestion Endpoints

```
POST   /api/podcast/sources              — Create/manage podcast sources
       Body: { name, feed_url, source_type, description }
       Returns: PodcastSourceResponse

GET    /api/podcast/sources              — List tracked sources
       Query: ?status=active|inactive
       Returns: list[PodcastSourceResponse]

POST   /api/podcast/ingest/rss           — Trigger RSS fetch for a source
       Body: { source_id }
       Returns: { episode_ids: list[UUID], fetch_status }

POST   /api/podcast/ingest/youtube       — Ingest from YouTube URL
       Body: { video_url, title (optional) }
       Returns: PodcastEpisodeResponse

POST   /api/podcast/ingest/upload        — Upload audio file
       Body: multipart/form-data with audio file
       Returns: PodcastEpisodeResponse

POST   /api/podcast/ingest/transcript    — Paste raw transcript
       Body: { transcript_text, title, date, speakers (optional) }
       Returns: PodcastEpisodeResponse
```

### Episodes

```
GET    /api/podcast/episodes             — List episodes
       Query: ?status=pending|transcribing|extracting|complete&limit=20&offset=0&date_from=&date_to=
       Returns: list[PodcastEpisodeResponse]

GET    /api/podcast/episodes/{id}        — Get episode detail
       Returns: PodcastEpisodeDetailResponse (includes all signals)

GET    /api/podcast/episodes/{id}/transcript — Get full transcript
       Returns: { raw_text, chunks: list[{text, speaker, timestamp}] }

POST   /api/podcast/episodes/{id}/extract  — Manually trigger extraction
       Returns: { status: 'queued' }

GET    /api/podcast/episodes/{id}/signals  — Get all extracted signals
       Returns: { macro_views, trade_ideas, narratives, analogs, divergences, adversarial }
```

### Extracted Intelligence

```
GET    /api/podcast/macro-views          — Query macro views
       Query: ?direction=bullish|bearish&asset_class=equities&conviction_min=70&date_from=&date_to=&speaker_id=
       Returns: list[PodcastMacroViewResponse]

GET    /api/podcast/trade-ideas          — Query trade ideas
       Query: ?crowding_stage=emerging|crowding|crowded&conviction_min=70&idea_type=&ticker=
       Returns: list[PodcastTradeIdeaResponse]

GET    /api/podcast/narratives           — Query narratives
       Query: ?narrative_stage=emerging|crowding|crowded&novelty_min=70&date_from=
       Returns: list[PodcastNarrativeResponse]

GET    /api/podcast/analogs              — Query historical analogs
       Query: ?period=&similarity_min=70
       Returns: list[PodcastAnalogResponse]

GET    /api/podcast/divergences          — Query divergences
       Query: ?severity=moderate|significant|extreme&ticker=&date_from=
       Returns: list[PodcastDivergenceResponse]

GET    /api/podcast/uncertainty-markers  — Query uncertainty/hedging signals
       Query: ?episode_id=&speaker_id=
       Returns: list[UncertaintyMarkerResponse]
```

### Aggregations & Track Records

```
GET    /api/podcast/narrative-velocity   — Get narrative velocity data
       Query: ?narrative_id=&window_days=7|30|90&limit=10
       Returns: list[NarrativeVelocityResponse]

GET    /api/podcast/speakers             — List speakers with track records
       Query: ?credibility_min=50&prediction_count_min=5&sort=credibility|hit_rate
       Returns: list[SpeakerProfileResponse]

GET    /api/podcast/speakers/{id}        — Speaker detail + full analysis
       Returns: SpeakerDetailResponse (track record, predictions, credibility, bias)

GET    /api/podcast/speakers/{id}/predictions — Speaker prediction history
       Query: ?status=open|resolved&asset_class=&limit=20
       Returns: list[SpeakerPredictionResponse]

GET    /api/podcast/speakers/{id}/track-record — Speaker track record
       Query: ?time_window_months=6|12|null (all-time)
       Returns: SpeakerTrackRecordResponse
```

### Intelligence Products

```
GET    /api/podcast/daily-brief          — Get today's podcast brief
       Returns: PodcastDailyBriefResponse

GET    /api/podcast/daily-brief/{date}   — Get brief for specific date
       Returns: PodcastDailyBriefResponse

GET    /api/podcast/crowding-alerts      — Active crowding alerts
       Query: ?risk_level=elevated|high|extreme&limit=20
       Returns: list[CrowdingAlertResponse]

GET    /api/podcast/rhyme-suggestions    — Pending rhyme suggestions
       Query: ?status=pending|accepted|rejected
       Returns: list[RhymeSuggestionResponse]

POST   /api/podcast/rhyme-suggestions/{id}/accept — Accept a suggestion
       Body: { rhyme_period_id (optional, for linking to existing) }
       Returns: { status: 'accepted' }

POST   /api/podcast/rhyme-suggestions/{id}/reject — Reject a suggestion
       Body: { reason (optional) }
       Returns: { status: 'rejected' }
```

---

## 8. PYDANTIC SCHEMAS

**File:** `backend/app/schemas/podcast_intelligence.py`

Core response models:

```python
# Source management
class PodcastSourceResponse(BaseModel):
    id: UUID
    name: str
    feed_url: str
    source_type: str
    description: Optional[str]
    episode_count: int
    last_fetched: Optional[datetime]
    status: str  # active, inactive

# Episodes
class PodcastEpisodeResponse(BaseModel):
    id: UUID
    source_id: Optional[UUID]
    title: str
    description: Optional[str]
    publish_date: date
    duration_seconds: int
    status: str  # pending_transcription, transcribing, extracting, complete
    transcript_chunks_count: int
    created_at: datetime

class PodcastEpisodeDetailResponse(BaseModel):
    episode: PodcastEpisodeResponse
    transcript_raw: str
    transcript_chunks: list[TranscriptChunkResponse]
    signals: EpisodeSignalsResponse

# Signals
class PodcastMacroViewResponse(BaseModel):
    id: UUID
    episode_id: UUID
    speaker_id: UUID
    speaker_name: str
    statement: str
    direction: str  # bullish, bearish, neutral
    confidence_implied: int  # 0-100
    time_horizon: str  # days, weeks, months, quarters, years
    asset_classes: list[str]
    tickers: list[str]
    narrative_id: Optional[UUID]  # linked narrative
    created_at: datetime

class PodcastTradeIdeaResponse(BaseModel):
    id: UUID
    episode_id: UUID
    speaker_id: UUID
    speaker_name: str
    description: str
    direction: str  # long, short
    idea_type: str  # equity, fixed_income, macro, crypto
    asset_classes: list[str]
    tickers: list[str]
    conviction: int  # 0-100
    risk_reward_ratio: Optional[str]  # "3:1"
    narrative_stage: str  # emerging, reinforcing, crowded
    created_at: datetime

class PodcastNarrativeResponse(BaseModel):
    id: UUID
    episode_id: UUID
    description: str
    narrative_type: str  # emerging, reinforcing, shifting, fading
    novelty_score: int  # 0-100
    speaker_count: int
    mention_count: int  # if aggregated
    conviction_avg: float
    is_hedged: bool
    created_at: datetime

class PodcastAnalogResponse(BaseModel):
    id: UUID
    episode_id: UUID
    speaker_id: UUID
    period_description: str  # "2008 financial crisis"
    reasoning: str  # Why the speaker thinks it's similar
    similarity_keywords: list[str]
    similarity_score: int  # 0-100
    differences_noted: Optional[str]
    rhyme_suggestion_id: Optional[UUID]  # if suggested to rhyme engine
    created_at: datetime

class PodcastDivergenceResponse(BaseModel):
    id: UUID
    episode_id: UUID
    macro_view_id: UUID
    ticker: str
    stated_direction: str
    stated_conviction: int
    actual_move_pct: float
    divergence_severity: str  # low, moderate, significant, extreme
    divergence_days: int
    speaker_credibility: Optional[float]
    created_at: datetime

# Track records
class SpeakerProfileResponse(BaseModel):
    id: UUID
    name: str
    organization: Optional[str]
    episode_count: int
    prediction_count: int
    hit_rate: Optional[float]
    brier_score: Optional[float]
    credibility_score: Optional[float]
    bullish_accuracy: Optional[float]
    bearish_accuracy: Optional[float]
    domain_accuracy: dict  # { "equities": 0.75, "fixed_income": 0.65 }
    domain_expertise: list[str]
    credibility_trend: str  # improving, stable, declining

class SpeakerTrackRecordResponse(BaseModel):
    speaker_id: UUID
    time_window: str  # "6 months", "1 year", "all-time"
    hit_rate: Optional[float]
    brier_score: Optional[float]
    prediction_count: int
    correct_predictions: int
    domain_accuracy: dict
    bullish_accuracy: Optional[float]
    bearish_accuracy: Optional[float]
    bias: Optional[float]  # negative = bearish bias, positive = bullish bias
    credibility_score: float
    recent_predictions: list[SpeakerPredictionResponse]
    as_of_date: date

class SpeakerPredictionResponse(BaseModel):
    id: UUID
    speaker_id: UUID
    episode_id: UUID
    prediction_text: str
    prediction_type: str  # directional, event, valuation
    direction: Optional[str]  # bullish, bearish, neutral
    confidence_stated: int  # 0-100
    target_date: Optional[date]
    asset_classes: list[str]
    tickers: list[str]
    status: str  # open, resolved
    actual_outcome: Optional[float]  # 0 or 1 for directional
    brier_score: Optional[float]
    was_correct: Optional[bool]
    resolution_date: Optional[date]
    created_at: datetime

# Aggregations
class NarrativeVelocityResponse(BaseModel):
    narrative_id: UUID
    narrative_description: str
    window_days: int
    mention_count: int
    mention_velocity: float  # change from previous window
    unique_speakers: int
    conviction_avg: float
    conviction_std: float
    hedging_ratio: float
    crowding_risk: int  # 0-100
    narrative_stage: str  # emerging, reinforcing, crowding, crowded, fading
    computed_at: datetime

class CrowdingAlertResponse(BaseModel):
    id: UUID
    narrative_id: UUID
    narrative_description: str
    risk_level: int  # 1=low, 2=moderate, 3=elevated, 4=high, 5=extreme
    risk_level_name: str
    previous_risk_level: Optional[int]
    escalation_date: datetime
    mention_count: int
    unique_speakers: int
    top_speakers: list[str]
    conviction_convergence: float

# Daily brief
class PodcastDailyBriefResponse(BaseModel):
    date: date
    episode_count: int
    top_emerging_ideas: list[PodcastNarrativeResponse]
    most_repeated_narrative: Optional[PodcastNarrativeResponse]
    most_contrarian_take: Optional[PodcastNarrativeResponse]
    biggest_disagreement: Optional[dict]  # { position_a, speakers_a, position_b, speakers_b }
    new_analog_references: list[RhymeSuggestionResponse]
    crowding_alerts: list[CrowdingAlertResponse]
    trap_candidates: list[TrapCandidateResponse]
    generated_at: datetime

# Adverse signals
class AdversarialScoreResponse(BaseModel):
    episode_id: UUID
    authenticity_score: int  # 0-100
    originality_score: int  # 0-100
    manipulation_risk_score: int  # 0-100
    recycled_talking_point_count: int
    coordination_flags: list[str]
    timing_suspicious: bool
    conflict_of_interest_signals: list[str]
    assessment_summary: str
```

---

## 9. FRONTEND COMPONENTS

Location: `repo-b/src/components/podcast/`

### PodcastEpisodeCard.tsx

Summary panel for each episode:

```tsx
export const PodcastEpisodeCard: React.FC<{
  episode: PodcastEpisodeResponse
  signals: EpisodeSignalsResponse
}> = ({ episode, signals }) => {
  return (
    <Card>
      <Header>
        <Title>{episode.title}</Title>
        <Meta>{episode.publish_date} • {formatDuration(episode.duration_seconds)}</Meta>
      </Header>

      <Content>
        {/* Macro views: show direction arrows */}
        <Section label="Macro Views">
          {signals.macro_views.slice(0, 3).map(view => (
            <MacroViewBadge direction={view.direction} label={view.statement.slice(0, 60)} />
          ))}
        </Section>

        {/* Trade ideas */}
        <Section label="Trade Ideas">
          <Count>{signals.trade_ideas.length}</Count>
        </Section>

        {/* Narratives and tags */}
        <Section label="Narratives">
          {signals.narratives.map(n => (
            <NarrativeTag type={n.narrative_type} label={n.description.slice(0, 40)} />
          ))}
        </Section>

        {/* Analog references */}
        {signals.analogs.length > 0 && (
          <Section label="Historical Parallels">
            {signals.analogs.slice(0, 2).map(a => (
              <AnalogReference period={a.period_description} score={a.similarity_score} />
            ))}
          </Section>
        )}

        {/* Adversarial score gauge */}
        <Section label="Signal Quality">
          <ScoreGauge
            authenticity={signals.adversarial.authenticity_score}
            originality={signals.adversarial.originality_score}
            manipulation_risk={signals.adversarial.manipulation_risk_score}
          />
        </Section>
      </Content>

      <Footer>
        <Link to={`/podcast/episodes/${episode.id}`}>Full Analysis</Link>
      </Footer>
    </Card>
  )
}
```

### PodcastInsightDashboard.tsx

Main dashboard view:

```tsx
export const PodcastInsightDashboard: React.FC = () => {
  const [narrativeVelocity, setNarrativeVelocity] = useState<NarrativeVelocityData[]>([])
  const [episodes, setEpisodes] = useState<PodcastEpisodeResponse[]>([])
  const [speakers, setSpeakers] = useState<SpeakerProfileResponse[]>([])
  const [crowdingAlerts, setCrowdingAlerts] = useState<CrowdingAlertResponse[]>([])

  return (
    <div className="podcast-dashboard">
      {/* Active narrative velocity chart */}
      <Section title="Narrative Velocity (7-day rolling)">
        <LineChart
          data={narrativeVelocity.filter(nv => nv.window_days === 7)}
          xAxis="narrative_description"
          yAxis="mention_velocity"
          color={v => crowdingRiskColor(v.crowding_risk)}
        />
      </Section>

      {/* Crowding risk heatmap */}
      <Section title="Crowding Risk By Narrative">
        <Heatmap
          data={narrativeVelocity}
          cells={v => ({
            label: v.narrative_description.slice(0, 30),
            value: v.crowding_risk,
            color: crowdingRiskColor(v.crowding_risk)
          })}
        />
      </Section>

      {/* Recent episodes list */}
      <Section title="Recent Episodes">
        {episodes.map(ep => <PodcastEpisodeCard episode={ep} />)}
      </Section>

      {/* Speaker leaderboard */}
      <Section title="Top Speakers (by credibility)">
        <Leaderboard
          data={speakers.sort((a, b) => (b.credibility_score || 0) - (a.credibility_score || 0))}
          columns={['name', 'credibility_score', 'hit_rate', 'prediction_count']}
        />
      </Section>

      {/* Crowding alerts */}
      <Section title="Active Crowding Alerts">
        {crowdingAlerts.map(alert => (
          <CrowdingAlertCard alert={alert} />
        ))}
      </Section>
    </div>
  )
}
```

### PodcastNarrativeFlow.tsx

Visualization of narrative evolution:

```tsx
export const PodcastNarrativeFlow: React.FC = () => {
  const [narratives, setNarratives] = useState<NarrativeVelocityResponse[]>([])

  return (
    <div className="narrative-flow">
      {/* Timeline view: narrative emergence and stages */}
      <TimelineVisualization
        narratives={narratives.map(n => ({
          label: n.narrative_description,
          stage: n.narrative_stage,
          velocity: n.mention_velocity,
          risk: n.crowding_risk,
          date: n.computed_at
        }))}
        stageColors={{
          emerging: 'blue',
          reinforcing: 'green',
          crowding: 'yellow',
          crowded: 'orange',
          fading: 'gray'
        }}
      />

      {/* Sankey diagram: narrative flow through stages */}
      <SankeyDiagram
        nodes={narratives.map(n => `${n.narrative_description} (${n.narrative_stage})`)}
        links={computeNarrativeFlows(narratives)}
      />
    </div>
  )
}
```

### PodcastSpeakerCard.tsx

Individual speaker analysis:

```tsx
export const PodcastSpeakerCard: React.FC<{
  speaker: SpeakerProfileResponse
  trackRecord: SpeakerTrackRecordResponse
}> = ({ speaker, trackRecord }) => {
  return (
    <Card>
      <Header>
        <Title>{speaker.name}</Title>
        <Organization>{speaker.organization}</Organization>
      </Header>

      <Content>
        {/* Track record over time */}
        <Section title="Track Record">
          <LineChart
            data={trackRecord.recent_predictions}
            xAxis="resolution_date"
            yAxis={(p: SpeakerPredictionResponse) => p.was_correct ? 1 : 0}
            cumulative={true}
          />
        </Section>

        {/* Domain accuracy radar */}
        <Section title="Domain Expertise">
          <RadarChart
            data={Object.entries(trackRecord.domain_accuracy).map(([domain, accuracy]) => ({
              axis: domain,
              value: accuracy * 100
            }))}
          />
        </Section>

        {/* Bias profile */}
        <Section title="Directional Bias">
          <BiasIndicator
            bullishAccuracy={trackRecord.bullish_accuracy}
            bearishAccuracy={trackRecord.bearish_accuracy}
            bias={trackRecord.bias}
          />
        </Section>

        {/* Credibility trend */}
        <Section title="Credibility Score">
          <ScoreTrend
            current={trackRecord.credibility_score}
            trend={speaker.credibility_trend}
          />
        </Section>

        {/* Recent predictions */}
        <Section title="Recent Predictions">
          {trackRecord.recent_predictions.map(pred => (
            <PredictionRow
              prediction={pred}
              status={pred.status}
              outcome={pred.was_correct}
            />
          ))}
        </Section>
      </Content>
    </Card>
  )
}
```

### PodcastDailyBrief.tsx

Rendered daily brief:

```tsx
export const PodcastDailyBrief: React.FC<{
  brief: PodcastDailyBriefResponse
}> = ({ brief }) => {
  return (
    <div className="podcast-daily-brief">
      <Header>
        <Title>FROM PODCASTS TODAY</Title>
        <Date>{formatDate(brief.date)}</Date>
        <EpisodeCount>{brief.episode_count} episodes analyzed</EpisodeCount>
      </Header>

      {/* Top emerging ideas */}
      <Section title="Top Emerging Ideas">
        {brief.top_emerging_ideas.map(idea => (
          <IdeaPanel
            description={idea.description}
            novelty={idea.novelty_score}
            speakers={idea.speaker_count}
            link={`/podcast/narratives/${idea.id}`}
          />
        ))}
      </Section>

      {/* Most repeated narrative */}
      {brief.most_repeated_narrative && (
        <Section title="Most Repeated Narrative">
          <RepeatedNarrativePanel
            narrative={brief.most_repeated_narrative}
            mentionCount={brief.most_repeated_narrative.mention_count}
          />
        </Section>
      )}

      {/* Most contrarian take */}
      {brief.most_contrarian_take && (
        <Section title="Most Contrarian Take">
          <ContraryPanel
            narrative={brief.most_contrarian_take}
            novelty={brief.most_contrarian_take.novelty_score}
          />
        </Section>
      )}

      {/* Biggest disagreement */}
      {brief.biggest_disagreement && (
        <Section title="Biggest Disagreement">
          <DisagreementPanel
            disagreement={brief.biggest_disagreement}
          />
        </Section>
      )}

      {/* Crowding alerts */}
      {brief.crowding_alerts.length > 0 && (
        <Section title={`Crowding Alerts (${brief.crowding_alerts.length})`}>
          {brief.crowding_alerts.map(alert => (
            <CrowdingAlertCard alert={alert} severity="high" />
          ))}
        </Section>
      )}

      {/* Trap candidates */}
      {brief.trap_candidates.length > 0 && (
        <Section title="Trap Formation Candidates">
          {brief.trap_candidates.map(trap => (
            <TrapCandidateCard trap={trap} />
          ))}
        </Section>
      )}

      {/* Historical analogs */}
      {brief.new_analog_references.length > 0 && (
        <Section title="Historical Parallels">
          {brief.new_analog_references.map(ref => (
            <AnalogReferenceCard reference={ref} />
          ))}
        </Section>
      )}
    </div>
  )
}
```

---

## 10. SCHEDULED TASKS

All tasks are implemented as FastAPI background jobs or Celery tasks.

| Task | Schedule | Function | File |
|------|----------|----------|------|
| `pod-rss-fetch` | Every 4 hours | Poll all active RSS sources, ingest new episodes | `tasks/podcast_rss_fetch.py` |
| `pod-transcription` | On new episode (queue-based) | Transcribe pending episodes, run diarization | `tasks/podcast_transcription.py` |
| `pod-extraction` | After transcription (queue-based) | Run full extraction pipeline | `tasks/podcast_extraction.py` |
| `pod-narrative-velocity` | Daily 6 AM | Recalculate narrative velocity windows | `tasks/podcast_narrative_velocity.py` |
| `pod-prediction-resolution` | Daily 7 AM | Check and resolve open predictions | `tasks/podcast_prediction_resolution.py` |
| `pod-speaker-rerank` | Daily 7:30 AM | Reaggregate speaker track records | `tasks/podcast_speaker_rerank.py` |
| `pod-divergence-scan` | Daily 9 AM | Check for new divergences vs market data | `tasks/podcast_divergence_scan.py` |
| `pod-crowding-alert` | Daily 10 AM | Generate crowding alerts | `tasks/podcast_crowding_alert.py` |
| `pod-daily-brief` | Daily 8 AM | Generate daily podcast intelligence brief | `tasks/podcast_daily_brief.py` |

---

## 11. DATABASE SCHEMA

**File:** `repo-b/db/schema/425_podcast_intelligence.sql`

```sql
-- Core episode tables
CREATE TABLE podcast_sources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    feed_url TEXT,
    source_type VARCHAR(50),  -- rss, youtube, manual
    description TEXT,
    active BOOLEAN DEFAULT true,
    last_fetched TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE TABLE podcast_episodes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_id UUID REFERENCES podcast_sources(id),
    title VARCHAR(500) NOT NULL,
    description TEXT,
    publish_date DATE,
    duration_seconds INTEGER,
    audio_url TEXT,
    audio_path TEXT,
    guid VARCHAR(500),
    status VARCHAR(50),  -- pending_transcription, transcribing, extracting, complete, failed
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    CONSTRAINT unique_guid UNIQUE(source_id, guid)
);

CREATE TABLE podcast_transcript_raw (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    episode_id UUID NOT NULL REFERENCES podcast_episodes(id) ON DELETE CASCADE,
    raw_text TEXT NOT NULL,
    language VARCHAR(10),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE TABLE podcast_transcript_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    episode_id UUID NOT NULL REFERENCES podcast_episodes(id) ON DELETE CASCADE,
    chunk_index INTEGER NOT NULL,
    text TEXT NOT NULL,
    start_time NUMERIC,  -- seconds
    end_time NUMERIC,
    primary_speaker VARCHAR(255),
    topic_hint VARCHAR(255),
    embedding VECTOR(384),  -- if using pgvector
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Extraction tables
CREATE TABLE podcast_macro_views (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    episode_id UUID NOT NULL REFERENCES podcast_episodes(id) ON DELETE CASCADE,
    speaker_id UUID,
    statement TEXT NOT NULL,
    direction VARCHAR(20),  -- bullish, bearish, neutral
    confidence_implied INTEGER,  -- 0-100
    time_horizon VARCHAR(50),  -- days, weeks, months, quarters, years
    asset_classes TEXT[],
    tickers TEXT[],
    narrative_id UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE TABLE podcast_trade_ideas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    episode_id UUID NOT NULL REFERENCES podcast_episodes(id) ON DELETE CASCADE,
    speaker_id UUID,
    description TEXT NOT NULL,
    direction VARCHAR(20),  -- long, short
    idea_type VARCHAR(50),
    asset_classes TEXT[],
    tickers TEXT[],
    conviction INTEGER,  -- 0-100
    risk_reward_ratio VARCHAR(20),
    narrative_stage VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE TABLE podcast_narratives (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    episode_id UUID NOT NULL REFERENCES podcast_episodes(id) ON DELETE CASCADE,
    description TEXT NOT NULL,
    narrative_type VARCHAR(50),  -- emerging, reinforcing, shifting, fading
    novelty_score INTEGER,  -- 0-100
    is_hedged BOOLEAN,
    conviction_score INTEGER,  -- 0-100
    speaker_count INTEGER DEFAULT 1,
    mention_count INTEGER DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE TABLE podcast_analogs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    episode_id UUID NOT NULL REFERENCES podcast_episodes(id) ON DELETE CASCADE,
    speaker_id UUID,
    period_description VARCHAR(255) NOT NULL,
    reasoning TEXT,
    similarity_keywords TEXT[],
    similarity_score INTEGER,  -- 0-100
    differences_noted TEXT,
    rhyme_suggestion_id UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE TABLE podcast_uncertainty_markers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    episode_id UUID NOT NULL REFERENCES podcast_episodes(id) ON DELETE CASCADE,
    speaker_id UUID,
    statement TEXT,
    hedging_language VARCHAR(255),
    uncertainty_level VARCHAR(50),  -- low, moderate, high
    conviction_expressed INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE TABLE podcast_adversarial_scores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    episode_id UUID NOT NULL REFERENCES podcast_episodes(id) ON DELETE CASCADE,
    authenticity_score INTEGER,
    originality_score INTEGER,
    manipulation_risk_score INTEGER,
    recycled_talking_point_count INTEGER DEFAULT 0,
    coordination_flags TEXT[],
    timing_suspicious BOOLEAN DEFAULT false,
    conflict_of_interest_signals TEXT[],
    assessment_summary TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE TABLE podcast_speakers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    episode_id UUID REFERENCES podcast_episodes(id) ON DELETE CASCADE,
    name VARCHAR(255),
    organization VARCHAR(255),
    role VARCHAR(255),
    credibility_score NUMERIC,
    appearance_count INTEGER DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Speaker tracking
CREATE TABLE speaker_predictions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    speaker_id UUID NOT NULL REFERENCES podcast_speakers(id),
    episode_id UUID NOT NULL REFERENCES podcast_episodes(id),
    prediction_text TEXT NOT NULL,
    prediction_type VARCHAR(50),  -- directional, event, valuation
    direction VARCHAR(20),
    confidence_stated INTEGER,
    target_date DATE,
    asset_classes TEXT[],
    tickers TEXT[],
    status VARCHAR(50),  -- open, resolved
    actual_outcome NUMERIC,
    brier_score NUMERIC,
    was_correct BOOLEAN,
    resolution_date DATE,
    resolution_notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE TABLE speaker_track_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    speaker_id UUID NOT NULL REFERENCES podcast_speakers(id),
    time_window_months INTEGER,  -- NULL for all-time
    hit_rate NUMERIC,
    brier_score NUMERIC,
    prediction_count INTEGER,
    domain_accuracy JSONB,
    bullish_accuracy NUMERIC,
    bearish_accuracy NUMERIC,
    bias NUMERIC,
    credibility_score NUMERIC,
    as_of_date DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Narrative tracking
CREATE TABLE podcast_narrative_velocity (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    narrative_id UUID NOT NULL REFERENCES podcast_narratives(id) ON DELETE CASCADE,
    window_days INTEGER NOT NULL,
    mention_count INTEGER,
    mention_velocity NUMERIC,
    unique_speakers INTEGER,
    conviction_avg NUMERIC,
    conviction_std NUMERIC,
    hedging_ratio NUMERIC,
    crowding_risk INTEGER,  -- 0-100
    narrative_stage VARCHAR(50),
    computed_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE TABLE crowding_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    narrative_id UUID NOT NULL REFERENCES podcast_narratives(id),
    risk_level INTEGER,  -- 1-5
    previous_risk_level INTEGER,
    escalation_date TIMESTAMP WITH TIME ZONE,
    velocity_data JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Integration tables
CREATE TABLE podcast_divergences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    episode_id UUID NOT NULL REFERENCES podcast_episodes(id),
    macro_view_id UUID REFERENCES podcast_macro_views(id),
    ticker VARCHAR(20),
    stated_direction VARCHAR(20),
    stated_conviction INTEGER,
    actual_move_pct NUMERIC,
    divergence_severity VARCHAR(50),
    divergence_days INTEGER,
    speaker_credibility NUMERIC,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE TABLE podcast_daily_briefs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    date DATE UNIQUE,
    episode_count INTEGER,
    top_emerging_ideas JSONB,
    most_repeated_narrative JSONB,
    most_contrarian_take JSONB,
    biggest_disagreement JSONB,
    new_analog_references JSONB,
    crowding_alerts JSONB,
    trap_candidates JSONB,
    generated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Indexes
CREATE INDEX idx_podcast_episodes_status ON podcast_episodes(status);
CREATE INDEX idx_podcast_episodes_publish_date ON podcast_episodes(publish_date);
CREATE INDEX idx_podcast_transcript_chunks_episode_id ON podcast_transcript_chunks(episode_id);
CREATE INDEX idx_podcast_macro_views_episode_id ON podcast_macro_views(episode_id);
CREATE INDEX idx_podcast_macro_views_speaker_id ON podcast_macro_views(speaker_id);
CREATE INDEX idx_podcast_narratives_episode_id ON podcast_narratives(episode_id);
CREATE INDEX idx_podcast_narratives_narrative_stage ON podcast_narratives(narrative_stage);
CREATE INDEX idx_speaker_predictions_speaker_id ON speaker_predictions(speaker_id);
CREATE INDEX idx_speaker_predictions_status ON speaker_predictions(status);
CREATE INDEX idx_speaker_predictions_target_date ON speaker_predictions(target_date);
CREATE INDEX idx_podcast_narrative_velocity_narrative_id ON podcast_narrative_velocity(narrative_id);
CREATE INDEX idx_podcast_narrative_velocity_window ON podcast_narrative_velocity(narrative_id, window_days);
CREATE INDEX idx_crowding_alerts_narrative_id ON crowding_alerts(narrative_id);
CREATE INDEX idx_podcast_divergences_episode_id ON podcast_divergences(episode_id);
CREATE INDEX idx_podcast_divergences_ticker ON podcast_divergences(ticker);
CREATE INDEX idx_podcast_daily_briefs_date ON podcast_daily_briefs(date);
```

---

## 12. IMPLEMENTATION PHASES

### Phase 1 — Ingestion + Storage (Weeks 1-2)

**Deliverable:** Ingest podcasts from multiple sources, transcribe, chunk, store.

Files to create:
- `repo-b/db/schema/425_podcast_intelligence.sql` (full schema with indexes)
- `backend/app/services/podcast_transcription.py` (Whisper + diarization)
- `backend/app/services/podcast_ingest.py` (RSS, YouTube, upload, text)
- `backend/app/routes/podcast_intelligence.py` (ingest endpoints: /ingest/*, /episodes)
- `backend/app/schemas/podcast_intelligence.py` (ingest request/response models)
- Environment variables: WHISPER_MODEL, WHISPER_DEVICE, API keys

**Testing:**
- Ingest test RSS feed
- Upload test audio file
- Verify transcription + chunking output
- Spot-check chunks for semantic coherence

---

### Phase 2 — Extraction + UI (Weeks 3-4)

**Deliverable:** Dual LLM extraction, structured signals, basic UI.

Files to create:
- `backend/app/services/podcast_extraction.py` (4-pass extraction pipeline)
- `backend/app/services/podcast_extraction_prompts.py` (full prompt templates)
- Extend routes with extraction endpoints: /extract, /macro-views, /trade-ideas, /narratives, /analogs
- Extend schemas with response models for all extracted signals
- `repo-b/src/components/podcast/PodcastEpisodeCard.tsx` (signal summary)
- `repo-b/src/components/podcast/PodcastInsightDashboard.tsx` (main view)

**Testing:**
- Extract test episode end-to-end
- Verify structured output from GPT-4o
- Verify narrative detection from Claude
- Check cross-chunk synthesis accuracy
- UI: verify card renders correctly

---

### Phase 3 — Speaker Tracking + Aggregation (Weeks 5-6)

**Deliverable:** Speaker credibility scores, prediction resolution, narrative velocity.

Files to create:
- `backend/app/services/podcast_speaker_tracking.py` (Brier scores, track records)
- `backend/app/services/podcast_narrative_velocity.py` (velocity calculation, crowding detection)
- Extend routes with speaker endpoints: /speakers, /speakers/{id}, /narrative-velocity
- Scheduled tasks:
  - `backend/tasks/podcast_narrative_velocity.py` (daily 6 AM)
  - `backend/tasks/podcast_prediction_resolution.py` (daily 7 AM)
  - `backend/tasks/podcast_speaker_rerank.py` (daily 7:30 AM)
- `repo-b/src/components/podcast/PodcastSpeakerCard.tsx` (track record visualization)
- `repo-b/src/components/podcast/PodcastNarrativeFlow.tsx` (narrative evolution chart)

**Testing:**
- Create test predictions, resolve them
- Verify Brier score calculation
- Run narrative velocity engine on test data
- Verify crowding risk classification

---

### Phase 4 — Full Integration + Intelligence Products (Weeks 7-8)

**Deliverable:** Integration with existing systems, daily briefs, trading lab signals.

Files to create:
- `backend/app/services/podcast_integration.py` (rhymes, divergences, traps, signals)
- `backend/app/services/podcast_daily_brief.py` (brief generation)
- Scheduled tasks:
  - `backend/tasks/podcast_daily_brief.py` (daily 8 AM)
  - `backend/tasks/podcast_divergence_scan.py` (daily 9 AM)
  - `backend/tasks/podcast_crowding_alert.py` (daily 10 AM)
  - `backend/tasks/podcast_rss_fetch.py` (every 4 hours)
  - `backend/tasks/podcast_transcription.py` (queue-based)
  - `backend/tasks/podcast_extraction.py` (queue-based)
- Extend routes with intelligence endpoints: /daily-brief, /crowding-alerts, /rhyme-suggestions
- `repo-b/src/components/podcast/PodcastDailyBrief.tsx` (full brief widget)
- Wire into existing daily brief system
- Wire signal promotion into trading lab

**Testing:**
- End-to-end flow: RSS ingest → transcription → extraction → signals → brief
- Verify rhyme suggestions surface
- Verify divergence detection
- Verify trap probability calculation
- Verify trading signals promote correctly

---

## 13. CONFIGURATION & DEPENDENCIES

### Environment Variables

```bash
# Transcription
WHISPER_MODEL=large-v3
WHISPER_DEVICE=cuda  # or cpu
WHISPER_COMPUTE_TYPE=float32  # or float16

# API Keys
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...

# Database
DATABASE_URL=postgresql://...

# Storage
PODCAST_STORAGE_PATH=/mnt/podcasts  # or S3 bucket

# Extraction
PODCAST_EXTRACTION_BATCH_SIZE=5  # chunks per LLM call (to manage costs)
PODCAST_EXTRACTION_TIMEOUT_MINUTES=30

# Narrative velocity
PODCAST_NARRATIVE_VELOCITY_WINDOWS=7,30,90  # days

# Ingest
PODCAST_RSS_FETCH_INTERVAL=14400  # seconds (4 hours)
PODCAST_MAX_EPISODE_AGE=30  # days

# Queue
TASK_QUEUE_BACKEND=redis  # or memory for dev
REDIS_URL=redis://localhost:6379
```

### Python Dependencies

```
# Transcription
openai-whisper==20240930
whisperx==3.1.1
pyannote.audio==3.0
ffmpeg-python==1.0.16
pydub==0.25.1

# Vector embeddings
sentence-transformers==2.2.2
pgvector==0.3.0

# Audio/video
yt-dlp==2024.1.1
feedparser==6.0.10

# APIs
anthropic==0.25.0
openai==1.3.0
aiohttp==3.9.0

# Database
sqlalchemy==2.0.0
psycopg2-binary==2.9.0
asyncpg==0.29.0

# FastAPI & async
fastapi==0.104.0
uvicorn==0.24.0
pydantic==2.5.0

# Scheduled tasks
celery==5.3.0 (or APScheduler for simpler needs)

# Utilities
python-dateutil==2.8.2
numpy==1.24.0
scipy==1.11.0
```

### External Services

- **Anthropic Claude API**: ~$0.008 per 1K input tokens (nuanced extraction)
- **OpenAI GPT-4o API**: ~$0.003 per 1K input tokens (structured extraction)
- **Postgres with pgvector**: Vector similarity search for semantic chunking
- **Redis**: Task queue for background jobs
- **S3 or local storage**: Podcast audio files

---

## 14. SUCCESS CRITERIA

The system is successful when:

1. **Structured signal extraction**: Podcasts generate signals (macro views, trade ideas, narratives), not notes
2. **Early narrative detection**: Recurring narratives are identified before they reach mainstream consensus
3. **Speaker accuracy tracking**: Prediction accuracy (Brier scores) accumulates over time; leaderboards emerge
4. **Crowding detection**: System flags when "everyone is saying the same thing" with alerts and risk scoring
5. **Podcast-driven insights**: Extracted signals influence daily forecasts and positioning in the trading lab
6. **Adversarial filtering**: System catches recycled talking points, suspicious timing, and coordination attempts
7. **Daily intelligence**: Podcast signals appear in the daily brief with actionable intelligence
8. **Historical rhyme integration**: Podcasts auto-suggest analogs to the History Rhymes engine
9. **Speaker credibility ranking**: Leaderboard of speakers with track records, allowing selective attention
10. **Trap formation early warning**: High narrative crowding + data divergence surfaces as trap candidates weeks before market moves

---

## 15. TECHNICAL NOTES

### Semantic Chunking Rationale

Fixed-size chunks (500 tokens) don't work for financial conversations because topics shift mid-sentence. Example:
- "The Fed's pivot on rates is bullish... but we're seeing stress in duration positioning which suggests crowding in rate cuts."

A fixed 500-token chunk might split this across boundaries, losing context. Semantic chunking respects topic shifts and speaker turns, keeping related ideas together.

### Dual LLM Routing Rationale

Neither model alone is sufficient:
- Claude is slower and more expensive, but excels at subtlety (detecting hedging, narrative nuance, historical context)
- GPT-4o is faster and cheaper, but less reliable on open-ended analysis
- Route volume (trade ideas, macro views) to GPT-4o; route complexity (analog detection, adversarial scoring) to Claude
- Parallelization masks latency differences

### Narrative Normalization

Podcasts describe the same idea differently:
- "Inflation is sticky" vs. "Price increases aren't coming down" vs. "CPI won't fall fast"

Fuzzy matching on raw text fails. Instead, embed descriptions and cluster on cosine similarity (threshold 0.85). Handles synonyms, plurals, and rephrasing automatically.

### Brier Score Rationale

Accuracy alone (hit rate) doesn't account for calibration. A speaker who says "probably up 60%" and is right 60% of the time has better calibration than one who says "definitely up 100%" and is right 70% of the time.

Brier score = (forecast_probability - actual_outcome)^2

This penalizes both wrong predictions AND overconfident correct predictions. Lower is better.

### Crowding Risk Calculation

The formula weights:
- Mention velocity (rapid spread)
- Total mentions (absolute crowding)
- Speaker diversity (consensus building)
- Conviction convergence (narrow views)
- Hedging absence (overconfidence)

High scores indicate trap risk. Escalation alerts fire when score crosses thresholds.

---

## Appendix: Glossary

| Term | Definition |
|------|-----------|
| **Narrative** | An idea, thesis, or market view expressed in podcasts (e.g., "stagflation incoming") |
| **Narrative stage** | Where a narrative sits in its lifecycle: emerging, reinforcing, crowding, crowded, fading |
| **Crowding risk** | Probability a narrative is entering trap formation (composite score 0-100) |
| **Brier score** | Calibration metric for predictions (0=perfect, 1=worst) |
| **Semantic chunk** | Transcript segment bounded by topic shift, not fixed size |
| **Diarization** | Speaker identification and turn segmentation |
| **Analog** | Historical parallel mentioned in podcast ("This is like 2008") |
| **Divergence** | Mismatch between stated view and actual market data |
| **Trap candidate** | Episode/narrative with high crowding + low data confirmation |
| **Authenticity score** | 0-100 rating: is this genuine analysis or performance? |
| **Manipulation risk** | 0-100 rating: does this signal suspicious coordination or timing? |

---

This architecture document provides complete specification for implementation. Each section includes concrete file paths, code sketches, table schemas, and testing criteria. The phased approach allows incremental delivery while maintaining system coherence.
