# Podcast Intelligence — Phase 1 Gate Check

_Generated: 2026-04-22T17:00:40.209603Z_

Full end-to-end Phase 1 pipeline run: YouTube ingest → auto-caption transcription → sentence+speaker-turn chunking → 4-pass extraction (GPT-4o structured + Claude nuanced + Claude adversarial) → speaker resolver with fuzzy fallback → signals land in 7 tables.

## Episodes

| Source | Title | Duration | Transcript | Status |
|---|---|---|---|---|
| Macro Voices | MacroVoices #507 Michael Howell:  Is This The end of the  Ev | 72m | 70,773 | completed |
| Forward Guidance | Why the Oil Shock Could Trigger a Global Recession \| Weekly  | 56m | 55,980 | completed |
| Odd Lots (Bloomberg) | Is This the End of the US Exceptionalism Trade? | — | 35,824 | partial |

## Signal Yield per Episode

Counts broken out by `extraction_model` so Phase 0 (legacy standalone pipeline) and Phase 1 (backend service) rows are distinguishable on the same episode.

| Episode | Model | macro | trade | narr | analog | uncert | speakers |
|---|---|---:|---:|---:|---:|---:|---:|
| MacroVoices #507 Michael Howell:  Is Thi | `gpt-4o` | 51 | 13 | 0 | 0 | 112 | 11 |
|    | `claude-sonnet-4-5` | 0 | 0 | 65 | 18 |  |  |
| Why the Oil Shock Could Trigger a Global | `gpt-4o` | 54 | 18 | 0 | 0 | 124 | 11 |
|    | `claude-sonnet-4-5` | 0 | 0 | 78 | 17 |  |  |
| Is This the End of the US Exceptionalism | `gpt-4o` | 25 | 12 | 0 | 0 | 115 | 9 |
|    | `claude-sonnet-4` | 0 | 0 | 34 | 0 |  |  |
|    | `claude-sonnet-4-5` | 0 | 0 | 39 | 13 |  |  |

## K1/K3 Fix Validation — Odd Lots Episode (before vs after)

Same transcript, same model choice, different extraction pipeline.
The legacy run (Phase 0, gpt-4o / claude-sonnet-4) dropped signals when speaker names varied between chunks. Phase 1 resolver fixes this.

| Signal | Phase 0 | Phase 1 | Delta |
|---|---:|---:|---:|
| macro_views | 4 | 21 | +425% |
| trade_ideas | 2 | 10 | +400% |
| narratives | 34 | 39 | +15% |
| analogs | 0 | 13 | new |

## Speaker Attribution Coverage

| Speaker | Episodes | Macro Views | Trade Ideas | Analogs |
|---|---:|---:|---:|---:|
| Unnamed Speaker | 1 | 14 | 6 | 0 |
| Speaker 1 | 1 | 11 | 2 | 3 |
| Unnamed speaker | 1 | 10 | 5 | 0 |
| Unnamed Speaker | 1 | 10 | 3 | 0 |
| Speaker 2 | 1 | 8 | 6 | 0 |
| Unknown Speaker 2 | 1 | 8 | 2 | 0 |
| Patrick | 1 | 8 | 1 | 1 |
| Eric | 1 | 6 | 3 | 0 |
| Unnamed Speaker 1 | 1 | 6 | 3 | 0 |
| Speaker 1 | 1 | 6 | 1 | 0 |
| Unidentified Speaker | 1 | 6 | 0 | 0 |
| Speaker 2 | 1 | 5 | 2 | 0 |
| Michael | 1 | 5 | 1 | 6 |
| Joe Weisenthal | 1 | 3 | 1 | 0 |
| Joe Weisenthal | 1 | 3 | 0 | 2 |
| Michael Howell | 1 | 3 | 0 | 2 |
| Clint | 1 | 2 | 0 | 0 |
| Eric Townsend | 1 | 2 | 0 | 1 |
| Speaker_1 | 1 | 2 | 0 | 0 |
| Unnamed Speaker 1 | 1 | 2 | 0 | 0 |
| Unknown Speaker 1 | 1 | 1 | 2 | 1 |
| Tracy Aloway | 1 | 1 | 1 | 0 |
| Unnamed Speaker 2 | 1 | 1 | 1 | 0 |
| Ozan Tarman | 1 | 1 | 0 | 1 |
| Unnamed Speaker 2 | 1 | 1 | 0 | 0 |

**Unattributed fallback:** 4 episode-scoped unattributed rows, 5 macro views routed to them (vs being dropped).

## Sample Extracted Signals

### MacroVoices #507 Michael Howell:  Is This The end of the  Everything Bubble

**Top macro views:**
- `bullish` conf=90.00 horizon=structural — **Michael**
  > We're in a monetary inflation world, not a financial repression world.
  · asset=commodities
- `bullish` conf=85.00 horizon=1-3_months — **Patrick**
  > The Fed is shifting into a regime where cutting rates becomes not just likely but necessary.
  · asset=fixed_income
- `bearish` conf=85.00 horizon=structural — **Unnamed Speaker**
  > US M2 money supply could be growing at 7-8% in 2026.
  · asset=money supply
- `bearish` conf=80.00 horizon=immediate — **Unidentified Speaker**
  > Bank reserves are now well below the three trillion threshold in the US causing problems in the repo markets.
  · asset=money_market

**History-rhymes / analogs:**
- `cyclical` → **previous gold consolidations (2-4 months)** (Unattributed)
  > Duration pattern of consolidation phases before breakouts
- `technical` → **previous three gold consolidations** (Unattributed)
  > Pattern recognition of symmetrical triangle formations during consolidation phases
- `technical` → **December 2024 market drop** (Patrick)
  > Similar drop below 50-day, followed by rally to double top retest, then eventual correction in February 2025
- `structural` → **Federal debt growth 2000-2024** (Michael Howell)
  > Federal debt up 10x since 2000 while S&P up less than 5x, but gold up 12x - establishing pattern for future extrapolation

**Top narratives:**
- `reinforcing` conv=95.00 novelty=75.00 — **US-China Capital War**
- `shifting` conv=95.00 novelty=65.00 — **Debt maturity wall threatens liquidity crisis**
- `reinforcing` conv=95.00 novelty=85.00 — **Debt-Liquidity Nexus as Core Market Driver**
- `shifting` conv=90.00 novelty=65.00 — **Everything Bubble Ending**
- `emerging` conv=90.00 novelty=75.00 — **Fed losing control of interest rate mechanism**

**Adversarial score:** authenticity=85.00 originality=72.00 manipulation_risk=35.00
> This is a substantive technical analysis with genuine insights into liquidity cycles, repo markets, and monetary architecture. While Howell is clearly promoting his liquidity indices service, the discussion demonstrates deep expertise and original analytical frameworks (65-month cycle, debt-liquidity nexus). Some generic phrases appear ('asset bubbles,' 'risk on/risk off,' 'tail risks') but the co

### Why the Oil Shock Could Trigger a Global Recession | Weekly Roundup

**Top macro views:**
- `bearish` conf=90.00 horizon=1-3_months — **Unknown Speaker 2**
  > The odds of a recession just went up huge.
  · asset=bonds
- `neutral` conf=90.00 horizon=immediate — **Speaker 1**
  > They are not hiking.
  · asset=interest rates
- `bearish` conf=90.00 horizon=1-3_months — **Speaker 2**
  > Odds of a recession just went up huge.
  · asset=equities,bonds
- `bearish` conf=90.00 horizon=immediate — **Unnamed Speaker**
  > There's a massive gap between farmers' production costs and the prices they're receiving.
  · asset=commodities,agricultural

**History-rhymes / analogs:**
- `policy` → **Neocon era / Iraq War period** (Unknown Speaker 1)
  > References return of war-hawk figures like Lindsey Graham and Condoleezza Rice, comparing current political climate to earlier neoconservative dominance
- `cyclical` → **Historical farm recessions** (Unattributed)
  > Farmers facing one of the worst recessions in recent history with 40%+ bankruptcy increases, cure for low prices is supply destruction
- `structural` → **Ukraine-Russia conflict agricultural disruption** (Unattributed)
  > Historical geopolitical conflicts affecting agricultural supply chains show 50-300% price increases in months
- `structural` → **Asymmetric warfare / guerrilla tactics** (Unattributed)
  > Iran can sustain pressure with minimal resources (drones, beach positions) against superior military force

**Top narratives:**
- `reinforcing` conv=95.00 novelty=60.00 — **Bonds are structurally broken as investments**
- `emerging` conv=95.00 novelty=85.00 — **Hedge-Without-Degrossing Creates Max Pain**
- `reinforcing` conv=95.00 novelty=40.00 — **War propaganda making truth impossible**
- `emerging` conv=95.00 novelty=85.00 — **Fiscal Doom Loop**
- `emerging` conv=95.00 novelty=60.00 — **SPR Depletion Crisis**

**Adversarial score:** authenticity=82.00 originality=71.00 manipulation_risk=23.00
> This appears to be a genuine trading/macro analysis podcast with authentic market commentary and position disclosure. The speakers demonstrate real-time uncertainty and self-critique ('I'm probably going to be wrong a million times'), which suggests genuine analysis rather than scripted narrative. However, some recency bias and standard macro frameworks reduce originality. Minimal book-talking det

### Is This the End of the US Exceptionalism Trade?

**Top macro views:**
- `bullish` conf=80.00 horizon=3-12_months — **Unnamed speaker**
  > If things get very ugly with US rates at 5% or more, the US Fed will come with QE.
  · tickers=US30 asset=fixed_income
- `bearish` conf=80.00 horizon=3-12_months — **Unnamed Speaker 1**
  > Our official call is that terminal rate in Europe is all the way down to 1.5
  · asset=interest rates
- `bullish` conf=80.00 horizon=structural — **Unnamed Speaker 1**
  > Europe is arguably now the leading I mean without clearly the most advanced place in the world for aerospace technology.
  · asset=industrial
- `bullish` conf=80.00 horizon=1-4_weeks — **Joe Weisenthal**
  > It's not surprising that gold is now perceived like that's the one thing, right? Like the one thing that will be there for you.
  · asset=commodities

**History-rhymes / analogs:**
- `policy` → **Trump 1.0 tax cuts** (Joe Weisenthal)
  > Comparing potential Trump 2.0 tax cut timeline and execution to first-term approach
- `structural` → **2008 GFC** (Unattributed)
  > Mentioned alongside Brexit as catastrophic comparison if all three key actors (Trump, Powell, China) refuse to compromise
- `structural` → **Brexit** (Unattributed)
  > Referenced as potential worst-case scenario if Trump, Powell, and China all maintain hardline positions without compromise
- `behavioral` → **emerging market crises** (Unattributed)
  > Describing US market behavior (equities, treasuries, dollar all falling together) as characteristic of EM selloffs; discussing US institutional credibility questions typically reserved for EM analysis

**Top narratives:**
- `reinforcing` conv=95.00 novelty=60.00 — **Consensus Collapse**
- `reinforcing` conv=90.00 novelty=25.00 — **Gold as ultimate safe haven in policy chaos**
- `emerging` conv=90.00 novelty=95.00 — **US exhibiting emerging market dynamics**
- `emerging` conv=90.00 novelty=95.00 — **Europe Fiscal Expansion**
- `shifting` conv=85.00 novelty=70.00 — **End of US Exceptionalism**

**Adversarial score:** authenticity=75.00 originality=65.00 manipulation_risk=35.00
> This appears to be genuine market analysis rather than book promotion. Ozan Tarman engages in substantive debate about positioning, acknowledges uncertainty ('I go back and forth'), and offers specific trade ideas with real risk considerations. However, there are several market clichés ('talking their book,' 'pain trade,' 'crowded trade') and some self-promotional elements (mentioning client dinne
