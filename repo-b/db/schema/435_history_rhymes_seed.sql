-- Migration 435: History Rhymes + WSS Seed Data
-- Seeds all decision engine tables with clearly-labeled mock data.
-- Every row has source = 'seed' for provenance tracking.
-- This data matches the previous hardcoded frontend constants.

-- ═══════════════════════════════════════════════════════════════════════════════
-- 1. EPISODES — 8 historical episodes from seed_episodes.json
-- ═══════════════════════════════════════════════════════════════════════════════

INSERT INTO public.episodes (name, asset_class, category, start_date, peak_date, trough_date, end_date, duration_days, peak_to_trough_pct, recovery_duration_days, max_drawdown_pct, volatility_regime, macro_conditions_entering, catalyst_trigger, timeline_narrative, cross_asset_impact, narrative_arc, recovery_pattern, modern_analog_thesis, tags, dalio_cycle_stage, regime_type, is_non_event, source)
VALUES
('2007-2009 Global Financial Crisis', 'multi', 'crash', '2007-06-01', '2007-10-09', '2009-03-09', '2013-03-28', 2127, -57.0, 1472, -57.0, 'crisis',
 'Case-Shiller peaked Q1 2006 at 198. Subprime 18-21% of originations. Household debt 127% of disposable income. Top 5 banks leveraged 30:1+.',
 'Cascading counterparty failure from mortgage delinquencies. Bear Stearns Jun 2007 -> Lehman Sep 15 2008 -> AIG bailout -> Reserve Primary Fund breaks the buck.',
 'Housing peaked Q1 2006, Bear failed Jun 2007, Lehman filed Sep 15 2008. SPX bottomed Mar 2009 at 666. Recovery required QE1/QE2/QE3 and ZIRP for seven years.',
 '{"sp500": -57, "financials": -90, "oil_pct": -78, "hy_spreads_bps": 1000, "home_prices_national": -21}',
 'Textbook Soros reflexive loop: rising prices -> looser lending -> more buyers -> higher prices. Loop reversed catastrophically.',
 'Policy-driven recovery requiring unprecedented monetary intervention. QE1-3, ZIRP. Housing recovery 5+ years.',
 'Elevated CRE leverage, CMBS delinquency 12.3% Jan 2026 vs 2% pre-pandemic, $2.3T CRE loans maturing 2025-2028.',
 ARRAY['leverage_unwind', 'liquidity_crisis', 'housing', 'securitization', 'counterparty', 'systemic'],
 'top', 'deflationary_deleveraging', FALSE, 'seed'),

('2022 Luna/3AC/FTX Crypto Contagion Cascade', 'crypto', 'contagion', '2022-05-07', '2021-11-10', '2022-11-21', '2023-01-15', 618, -77.0, NULL, -77.0, 'crisis',
 'Crypto market cap >$3T Nov 2021. Terra/Luna UST at 19.5% APY. 3AC leveraged 25:1+. FTX valued at $32B.',
 'May 7 2022: large UST withdrawals from Anchor depeg to $0.985. Luna hyperinflates. 3AC, Celsius, FTX cascade.',
 'Three-wave cascade: Luna/UST (May), 3AC/Celsius (Jun-Jul), FTX/Alameda (Nov). BTC bottomed $15,500.',
 '{"btc": -77, "eth": -82, "total_crypto_market_pct": -73, "luna": -100, "solana": -96}',
 'Mirrored 2008: interconnected leverage, opaque counterparty exposure, cascading liquidations.',
 'Slow grind followed by ETF catalyst. BTC $15K-30K for months before ETF approval narrative.',
 'More regulated (ETFs, custodial segregation), but memecoin infrastructure creates concentrated retail risk.',
 ARRAY['leverage_unwind', 'counterparty', 'algorithmic_stablecoin', 'fraud', 'contagion', 'crypto'],
 'depression', 'deflationary_deleveraging', FALSE, 'seed'),

('1970s Stagflation Cycle', 'macro', 'regime_shift', '1971-08-15', NULL, '1982-08-12', '1983-12-31', 4522, -48.0, NULL, -48.0, 'crisis',
 'Post-Bretton Woods monetary disorder. M2 growth ~15% YoY. Vietnam War fiscal deficits. Wage-price controls.',
 'Oct 1973 OAPEC oil embargo quadrupled oil. Second shock: Iranian Revolution 1979. Underlying: excessive M2 growth.',
 '1974-75 stagflation, 1976-79 false recovery, Volcker raised to 20%, 1980-82 double-dip. Inflation broken by 1983.',
 '{"sp500_real": -48, "bonds_real": -50, "gold_pct": 2328, "sixty_forty_failed": true}',
 '60/40 portfolio failed catastrophically. Gold was the only major winner.',
 'Required extreme tightening (20% fed funds). Double-dip recession was the cost.',
 'Supply-shock inflation from tariffs, geopolitical disruption, or energy crises combined with fiscal excess.',
 ARRAY['inflation', 'oil_shock', 'monetary_policy_error', 'stagflation', 'supply_shock'],
 'bubble', 'inflationary', FALSE, 'seed'),

('2020 COVID Crash and V-Shaped Recovery', 'multi', 'crash', '2020-02-19', '2020-02-19', '2020-03-23', '2020-08-18', 181, -33.9, 148, -33.9, 'crisis',
 'SPX at ATH, unemployment 3.5%, longest expansion in US history. VIX ~12.5.',
 'Exogenous pandemic shock. Fastest bear market in history: SPX -33.9% in 33 days. VIX >80.',
 'Feb 19 ATH -> Mar 23 bottom at 2,237. Fed cut to zero, unlimited QE. $5T+ fiscal. Recovered by Aug 18.',
 '{"sp500": -33.9, "vix_peak": 82.7, "oil": -65, "btc": -50, "nasdaq_2020_return": 43}',
 'Both a V-recovery template and cautionary tale (stimulative excess planted seeds of 2022 inflation).',
 'V-shaped, policy-driven. Unprecedented speed due to unprecedented response.',
 'Speed of drawdown + policy response = recovery speed. Subsequent cycles may not receive equivalent response.',
 ARRAY['exogenous_shock', 'policy_response', 'v_recovery', 'vix_spike', 'circuit_breaker'],
 'depression', 'crisis', FALSE, 'seed'),

('2017-2018 ICO Bubble (Crypto)', 'crypto', 'bubble', '2017-01-01', '2017-12-17', '2018-12-15', '2020-12-01', 1430, -84.2, 1080, -84.2, 'crisis',
 'ERC-20 enabled permissionless token creation. BTC ~$1K, ETH ~$8 entering 2017. No regulated derivatives.',
 'ICO mania: >2,000 ICOs raised >$10B. CryptoKitties congested Ethereum. Coinbase #1 App Store.',
 'BTC peaked $19,783 Dec 2017. ETH -94%. Recovery took 36 months. >50% ICO projects failed.',
 '{"btc": -84.2, "eth": -94, "total_crypto_market": -88, "ico_project_failure_rate": 50}',
 'Low-barrier token creation -> speculative frenzy -> concentration in worthless tokens -> crypto winter.',
 '36-month grind. Recovery driven by DeFi narrative (2020 summer).',
 '2024-2025 memecoin mania parallels: pump.fun = modern ICO factory, >98% failure. ETF flows provide structural bid.',
 ARRAY['ico', 'retail_frenzy', 'permissionless_tokens', 'regulatory', 'crypto_winter'],
 'bubble', 'crisis', FALSE, 'seed'),

('1998 LTCM Crisis (Non-Event Resolution)', 'macro', 'non_event', '1998-08-17', '1998-07-20', '1998-10-08', '1999-01-15', 151, -19.3, 99, -19.3, 'elevated',
 'Russian debt default Aug 1998. LTCM leveraged 25:1 with $125B notional. Asian crisis reverberating.',
 'Russia defaulted on domestic debt. LTCM convergence trades diverged. Fed organized $3.6B bailout.',
 'SPX fell 19.3%. Fed cut 3 times in 7 weeks. Recovered by Nov. Ended 1998 up 26.7%.',
 '{"sp500": -19.3, "recovery_months": 3, "fed_cuts": 3}',
 'Conditions resembled systemic crisis but resolved through targeted intervention.',
 'Sharp V-recovery after coordinated policy response. Crisis contained to single entity.',
 'Template for when crisis conditions appear but resolve benignly. Key: concentrated vs systemic risk.',
 ARRAY['leverage_unwind', 'sovereign_default', 'non_event', 'contained_crisis'],
 'expansion', 'crisis', TRUE, 'seed'),

('2011 US Debt Ceiling Crisis (Non-Event)', 'macro', 'non_event', '2011-07-22', '2011-04-29', '2011-10-03', '2012-03-01', 223, -19.4, 150, -19.4, 'elevated',
 'S&P downgraded US AAA->AA+. Debt ceiling brinkmanship. European sovereign crisis intensifying.',
 'Political gridlock on debt ceiling. S&P downgrade Aug 5 2011. VIX spiked to 48.',
 'SPX -19.4% Apr-Oct 2011. Downgrade triggered selloff but no recession. Operation Twist Sep 2011. Recovered by Mar 2012.',
 '{"sp500": -19.4, "vix_peak": 48, "treasuries": 5}',
 'Paradox: US downgrade caused flight TO Treasuries, not away.',
 'Gradual recovery, policy-assisted. No recession despite correction severity.',
 'Template for political/institutional crisis producing sharp correction without fundamental deterioration.',
 ARRAY['sovereign_downgrade', 'political_crisis', 'non_event', 'vix_spike'],
 'expansion', 'crisis', TRUE, 'seed'),

('2016 Brexit Shock (Non-Event)', 'macro', 'non_event', '2016-06-23', '2016-06-23', '2016-06-27', '2016-07-11', 18, -5.3, 14, -5.3, 'elevated',
 'UK referendum on EU membership. Polls tight. Markets priced in Remain victory.',
 'Leave won 51.9%. GBP fell to 31-year low.',
 'SPX -5.3% over 2 days. Recovery within 2 weeks. New ATH by Jul 11.',
 '{"sp500": -5.3, "gbp": -11, "ftse_recovery_days": 10}',
 'Market priced in catastrophe that did not materialize on investable timeframes.',
 'Rapid absorption. Markets repriced quickly once panic subsided.',
 'Template for political shocks producing violent short-term reactions but minimal medium-term impact.',
 ARRAY['political_shock', 'non_event', 'currency_crisis', 'rapid_recovery'],
 'expansion', 'crisis', TRUE, 'seed')

ON CONFLICT DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 2. WSS REALITY SIGNALS (Layer 1) — 7 rows from frontend mock
-- ═══════════════════════════════════════════════════════════════════════════════

INSERT INTO public.wss_reality_signals (signal_date, domain, signal_type, metric_name, value, trend_direction, acceleration_score, acceleration_change, confidence_score, source)
VALUES
('2026-03-28', 'Labor',      'behavioral', 'Tech job postings',           -12.0, 'down',          -3.2,  NULL, 0.82, 'seed'),
('2026-03-28', 'Labor',      'behavioral', 'Construction hiring',         -8.0,  'down',          -1.1,  NULL, 0.74, 'seed'),
('2026-03-28', 'Logistics',  'behavioral', 'Freight rates (Drewry WCI)',  -22.0, 'decel. decline', 4.5,  NULL, 0.88, 'seed'),
('2026-03-28', 'Energy',     'behavioral', 'Industrial elec. demand',      1.3,  'flat',          -0.8,  NULL, 0.71, 'seed'),
('2026-03-28', 'Consumer',   'behavioral', 'Airfare pricing index',        6.0,  'up',             2.1,  NULL, 0.79, 'seed'),
('2026-03-28', 'Housing',    'behavioral', 'Crane count (top 20 MSAs)',   -15.0, 'down',          -5.3,  NULL, 0.85, 'seed'),
('2026-03-28', 'Consumer',   'behavioral', 'BNPL usage growth',            18.0, 'accelerating',   6.7,  NULL, 0.77, 'seed')
ON CONFLICT DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 3. WSS DATA SIGNALS (Layer 2) — 6 rows from frontend mock
-- ═══════════════════════════════════════════════════════════════════════════════

INSERT INTO public.wss_data_signals (signal_date, metric_name, reported_value, expected_value, surprise_score, trend_direction, revision_history, source)
VALUES
('2026-03-28', 'CPI YoY',            3.1, 3.0,  0.1,  'sticky',      NULL, 'seed'),
('2026-03-28', 'Core PCE',           2.8, 2.7,  0.1,  'sticky',      NULL, 'seed'),
('2026-03-28', 'Nonfarm Payrolls',   151, 170, -19.0, 'cooling',     '{"prior_revision": "-26K"}', 'seed'),
('2026-03-28', 'PMI Mfg',            49.2, 50.1, -0.9, 'contraction', NULL, 'seed'),
('2026-03-28', 'Housing Starts',     1.37, 1.42, -0.05, 'declining',  '{"prior_revision": "-30K"}', 'seed'),
('2026-03-28', 'CMBS Delinq.',       12.3, 11.8,  0.5,  'rising',    '{"prior_revision": "+0.2"}', 'seed')
ON CONFLICT DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 4. WSS NARRATIVE STATE (Layer 3) — 6 rows from frontend mock
-- ═══════════════════════════════════════════════════════════════════════════════

INSERT INTO public.wss_narrative_state (signal_date, narrative_label, intensity_score, velocity_score, crowding_score, manipulation_risk, lifecycle_stage, source)
VALUES
('2026-03-28', 'Soft Landing',       0.72, -8.0,  0.85, 0.3, 'exhaustion', 'seed'),
('2026-03-28', 'AI Bubble',          0.61, 12.0,  0.45, 0.2, 'emerging',   'seed'),
('2026-03-28', 'CRE Apocalypse',     0.58, -3.0,  0.78, 0.4, 'crowded',    'seed'),
('2026-03-28', 'Crypto Supercycle',  0.44, 22.0,  0.31, 0.5, 'early',      'seed'),
('2026-03-28', 'Stagflation Risk',   0.35,  7.0,  0.22, 0.1, 'emerging',   'seed'),
('2026-03-28', 'Rate Cut Rally',     0.68, -15.0, 0.91, 0.6, 'exhaustion', 'seed')
ON CONFLICT DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 5. WSS POSITIONING SIGNALS (Layer 4) — 8 rows from frontend mock
-- ═══════════════════════════════════════════════════════════════════════════════

INSERT INTO public.wss_positioning_signals (signal_date, asset, positioning_type, metric, value_text, crowding_score, extreme_flag, trend_direction, source)
VALUES
('2026-03-28', 'SPY',          'options',        'Put/Call',        '0.82',     62, FALSE, 'neutral',       'seed'),
('2026-03-28', 'QQQ',          'options',        'Net Gamma',       '-2.1B',    78, TRUE,  'negative',      'seed'),
('2026-03-28', 'BTC',          'onchain',        'Funding Rate',    '0.012%',   55, FALSE, 'long',          'seed'),
('2026-03-28', 'ETH',          'onchain',        'Exchange Flows',  '-42K',     38, FALSE, 'accumulation',  'seed'),
('2026-03-28', 'Office REITs', 'short_interest',  'Short Interest',  '18.2%',   89, TRUE,  'short',         'seed'),
('2026-03-28', 'HY Credit',   'fund_flow',       'Fund Flows',      '-$1.2B',  71, TRUE,  'outflows',      'seed'),
('2026-03-28', 'Stablecoins',  'stablecoin',     'Supply +30d',     '+$3.8B',  25, FALSE, 'expansion',     'seed'),
('2026-03-28', 'Gold',         'fund_flow',       'CFTC Net Long',   '312K',    82, TRUE,  'crowded long',  'seed')
ON CONFLICT DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 6. WSS NARRATIVE SILENCE — 5 rows from frontend mock
-- ═══════════════════════════════════════════════════════════════════════════════

INSERT INTO public.wss_narrative_silence (narrative_label, last_active_date, dropoff_velocity, prior_intensity, current_intensity, significance_score, source)
VALUES
('China Property Crisis',   '2025-12-15', -85.0, 0.78, 0.12, 0.91, 'seed'),
('Bank Term Funding',       '2025-11-01', -88.0, 0.65, 0.08, 0.87, 'seed'),
('Japan Carry Trade',       '2026-01-10', -79.0, 0.71, 0.15, 0.83, 'seed'),
('CMBS Maturity Wall',      '2026-02-01', -67.0, 0.55, 0.18, 0.76, 'seed'),
('Student Loan Restart',    '2025-10-15', -92.0, 0.60, 0.05, 0.72, 'seed')
ON CONFLICT DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 7. HONEYPOT PATTERNS — 7 trap templates from SKILL.md
-- ═══════════════════════════════════════════════════════════════════════════════

INSERT INTO public.honeypot_patterns (name, description, pattern_type, apparent_signal, actual_outcome, consensus_level, flow_narrative_mismatch, crowding_level, source)
VALUES
('Bear Trap Bottom Call',
 'Everyone agrees it is the bottom. Shorts are crowded. The bounce is mechanical, not fundamental.',
 'bear_trap',
 'Consensus bottom call with short covering rally',
 'New leg down after short squeeze exhausts',
 0.85, TRUE, 'extreme', 'seed'),

('Soft Landing Euphoria',
 'Fed orchestrates perfect landing. Market prices in rate cuts before data confirms.',
 'narrative_trap',
 'Rate cut expectations priced in, soft landing consensus',
 'Inflation re-accelerates, cuts delayed, repricing violent',
 0.90, FALSE, 'crowded', 'seed'),

('Crypto Bottom Formation',
 'Stablecoin supply expanding, funding rates normalizing. Looks like accumulation.',
 'bull_trap',
 'On-chain metrics suggest accumulation phase',
 'Dead cat bounce, liquidity withdrawn, new lows',
 0.70, TRUE, 'moderate', 'seed'),

('CRE Recovery Narrative',
 'Office vacancy stabilizing, REIT prices bottoming, value buyers emerging.',
 'narrative_trap',
 'Vacancy rate flattening, price stabilization',
 'Maturity wall forces refinancing cascade, extend-and-pretend collapses',
 0.75, TRUE, 'elevated', 'seed'),

('AI Productivity Revolution',
 'AI adoption accelerating, enterprise spending confirmed. The next internet.',
 'narrative_trap',
 'Capex confirms AI buildout, productivity gains measured',
 'Revenue gap between capex and monetization triggers correction',
 0.80, FALSE, 'crowded', 'seed'),

('Yield Curve Inversion False Alarm',
 'Curve inverted for 18+ months without recession. Maybe this time is different.',
 'bear_trap',
 'Extended inversion without recession, curve steepening',
 'Recession follows steepening, not inversion — the signal is the un-inversion',
 0.65, FALSE, 'moderate', 'seed'),

('Geopolitical Premium Fade',
 'Market stops reacting to escalation headlines. Priced in.',
 'narrative_trap',
 'Declining volatility response to escalation headlines',
 'Actual supply disruption or conflict escalation catches market offsides',
 0.60, TRUE, 'low', 'seed')
ON CONFLICT DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 8. AGENT CALIBRATION — 5 agents + aggregate
-- ═══════════════════════════════════════════════════════════════════════════════

INSERT INTO public.hr_agent_calibration (agent_name, calibration_date, direction, confidence, rolling_90d_brier, rolling_90d_accuracy, prediction_count, current_weight, reasoning, source)
VALUES
('Macro',      '2026-03-28', 'Bearish', 68, 0.19, 0.62, 47, 0.28,
 'Late-cycle tightening with sticky inflation and rising delinquencies. CRE maturity wall accelerating into 2026-2027. Real rates restrictive. Consumer credit stress visible in BNPL growth and card delinquency trends.',
 'seed'),
('Quant',      '2026-03-28', 'Neutral', 52, 0.21, 0.58, 47, 0.22,
 'Mean-reversion signals mixed. Momentum still positive on longer timeframes but decelerating. Cross-sectional dispersion elevated — stock-picking regime, not directional. Vol term structure in contango.',
 'seed'),
('Narrative',  '2026-03-28', 'Bearish', 71, 0.17, 0.65, 47, 0.24,
 'Soft landing narrative approaching exhaustion (crowding 0.85, velocity -8). Rate cut rally narrative exhausted (0.91 crowding). CRE apocalypse crowded but supported by data. Silence on Japan carry trade and CMBS maturity wall is concerning.',
 'seed'),
('Contrarian', '2026-03-28', 'Bullish', 61, 0.23, 0.54, 47, 0.14,
 'Positioning already defensive — Office REIT shorts crowded at 89, HY outflows accelerating. When everyone is bearish and positioned for it, the risk is the other way. Stablecoin supply expanding (+$3.8B) despite bearish narrative.',
 'seed'),
('Red Team',   '2026-03-28', 'TRAP', 73, 0.15, 0.68, 47, 0.12,
 'Flow/narrative mismatch detected — bearish narrative but buying flows. 3 low-origin sources amplified in current narrative mix. Crowding in Office REIT shorts creates unwind risk. Meta-level L2: crowd is aware but not institution-modeled. FTX-bottom honeypot at 0.61 proximity.',
 'seed')
ON CONFLICT DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 9. TRAP CHECKS — 6 checks from frontend mock
-- ═══════════════════════════════════════════════════════════════════════════════

INSERT INTO public.wss_trap_checks (check_date, check_name, status, variant, value, explanation, action_adjustment, source)
VALUES
('2026-03-28', 'Consensus Divergence', 'CLEAR',    'success', '3/5 agents agree',
 'Measures agreement across the 5 forecasting agents. When 4+ agree, watch for groupthink.',
 NULL, 'seed'),
('2026-03-28', 'Flow / Narrative',     'MISMATCH', 'warning', 'Bearish narrative, buying flows',
 'Compares what people say (bearish narrative) vs what they do (buying flows). Mismatch signals potential reversal.',
 'Bearish narrative but buying flows detected. Reduce conviction on short thesis.', 'seed'),
('2026-03-28', 'Crowding Score',       'ELEVATED', 'warning', '0.68 - Office REIT shorts',
 'How concentrated positioning is. High crowding means the trade is popular and vulnerable to unwind.',
 'Office REIT shorts are crowded (0.68). Size down if short.', 'seed'),
('2026-03-28', 'Honeypot Match',       'CLEAR',    'success', 'Nearest: 0.61 (FTX bottom)',
 'Nearest historical trap pattern. Higher score = current setup looks more like a past trap.',
 NULL, 'seed'),
('2026-03-28', 'Info Provenance',      'WARNING',  'danger',  '3 low-origin sources amplified',
 'Source quality of dominant narratives. Low-origin sources being amplified suggests manufactured consensus.',
 '3 low-origin sources amplified. Discount these narratives when making decisions.', 'seed'),
('2026-03-28', 'Meta Level',           'L2',       'accent',  'Crowd-aware, not institution-modeled',
 'How many layers of awareness exist. L1 = retail unaware. L2 = crowd-aware. L3 = institution-modeled.',
 NULL, 'seed')
ON CONFLICT DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 10. HR PREDICTIONS — 24 resolved predictions for Brier history
-- ═══════════════════════════════════════════════════════════════════════════════

INSERT INTO public.hr_predictions (prediction_date, asset_class, scenario_bull_prob, scenario_base_prob, scenario_bear_prob, direction, direction_confidence, time_horizon_days, target_date, top_analog_id, rhyme_score, agent_weights, trap_detector_flag, crowding_score, synthesis_narrative, resolved, resolution_date, actual_outcome, brier_score, source)
SELECT
  '2025-10-01'::timestamptz + (n * interval '7 days'),
  'multi',
  0.18 + (random() * 0.08),
  0.50 + (random() * 0.10),
  0.25 + (random() * 0.08),
  CASE WHEN random() > 0.5 THEN 'down' ELSE 'flat' END,
  0.55 + (random() * 0.20),
  30,
  ('2025-10-01'::date + (n * 7) + 30),
  (SELECT id FROM public.episodes WHERE name LIKE '2022 Luna%' LIMIT 1),
  0.72 + (random() * 0.12),
  '{"macro": 0.28, "quant": 0.22, "narrative": 0.24, "contrarian": 0.14, "red_team": 0.12}',
  CASE WHEN random() > 0.7 THEN TRUE ELSE FALSE END,
  0.55 + (random() * 0.25),
  'Ensemble prediction for week ' || n,
  TRUE,
  '2025-10-01'::timestamptz + (n * interval '7 days') + interval '30 days',
  -0.02 + (random() * 0.06),
  0.15 + (random() * 0.12),
  'seed'
FROM generate_series(1, 24) AS n
ON CONFLICT DO NOTHING;

-- One current unresolved prediction
INSERT INTO public.hr_predictions (prediction_date, asset_class, scenario_bull_prob, scenario_base_prob, scenario_bear_prob, direction, direction_confidence, time_horizon_days, target_date, top_analog_id, rhyme_score, agent_weights, trap_detector_flag, crowding_score, synthesis_narrative, divergence_analysis, resolved, source)
VALUES (
  '2026-03-28',
  'multi',
  0.20,
  0.52,
  0.28,
  'down',
  0.65,
  30,
  '2026-04-27',
  (SELECT id FROM public.episodes WHERE name LIKE '2022 Luna%' LIMIT 1),
  0.78,
  '{"macro": 0.28, "quant": 0.22, "narrative": 0.24, "contrarian": 0.14, "red_team": 0.12}',
  TRUE,
  0.68,
  'Bearish lean driven by late-cycle tightening, CRE stress, and narrative exhaustion. Flow/narrative mismatch is primary trap risk. Contrarian agent provides bullish offset due to defensive positioning overshoot.',
  'Key divergence from 2022 Rate Cycle: labor market holding longer, consumer spending resilient despite credit stress signals. CMBS delinquency trajectory steeper than 2022 analog.',
  FALSE,
  'seed'
)
ON CONFLICT DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 11. ANALOG MATCH — current top match
-- ═══════════════════════════════════════════════════════════════════════════════

INSERT INTO public.analog_matches (query_date, asset_class, matches, source)
VALUES (
  '2026-03-28',
  'multi',
  jsonb_build_array(
    jsonb_build_object(
      'episode_id', (SELECT id::text FROM public.episodes WHERE name LIKE '2022 Luna%' LIMIT 1),
      'episode_name', '2022 Luna/3AC/FTX Crypto Contagion Cascade',
      'rhyme_score', 0.78,
      'cosine_sim', 0.84,
      'dtw_distance', 0.31,
      'categorical_match', 0.65,
      'key_similarity', 'tightening + leverage stress',
      'key_divergence', 'labor market holding longer this cycle',
      'rank', 1
    )
  )
  || jsonb_build_array(
    jsonb_build_object(
      'episode_name', '2007-2009 Global Financial Crisis',
      'rhyme_score', 0.71,
      'cosine_sim', 0.79,
      'dtw_distance', 0.38,
      'categorical_match', 0.55,
      'key_similarity', 'CRE leverage + extend-and-pretend',
      'key_divergence', 'banking system better capitalized post Dodd-Frank',
      'rank', 2
    ),
    jsonb_build_object(
      'episode_name', '1970s Stagflation Cycle',
      'rhyme_score', 0.58,
      'cosine_sim', 0.62,
      'dtw_distance', 0.52,
      'categorical_match', 0.60,
      'key_similarity', 'sticky inflation + supply shocks',
      'key_divergence', 'no oil embargo equivalent, labor market structure different',
      'rank', 3
    )
  ),
  'seed'
)
ON CONFLICT DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 12. EPISODE SIGNALS — seed current state vector for divergence comparison
-- ═══════════════════════════════════════════════════════════════════════════════

-- Current state (2026-03-28)
INSERT INTO public.episode_signals (episode_id, signal_date, sp500_return_1m, sp500_return_3m, sp500_return_12m, vix_level, vix_term_structure, yield_curve_10y2y, credit_spread_hy, fed_funds_rate, cpi_yoy, pmi_manufacturing, unemployment_rate, btc_return_1m, btc_mvrv_zscore, crypto_fear_greed, btc_dominance, case_shiller_yoy, housing_starts_saar, mortgage_rate_30y, cmbs_delinquency_rate, office_vacancy_rate, aaii_bull_pct, aaii_bear_pct, put_call_ratio, margin_debt_yoy)
VALUES
-- Current snapshot (no episode_id — standalone current state)
(NULL, '2026-03-28', -2.1, -4.5, 8.2, 22.5, 'contango', -0.15, 3.8, 5.25, 3.1, 49.2, 4.1, 5.2, 1.8, 52, 54.2, 3.8, 1370, 6.85, 12.3, 18.5, 32.1, 41.2, 0.82, -8.5)
ON CONFLICT DO NOTHING;

-- GFC entering state (for divergence comparison)
INSERT INTO public.episode_signals (episode_id, signal_date, sp500_return_1m, sp500_return_3m, sp500_return_12m, vix_level, vix_term_structure, yield_curve_10y2y, credit_spread_hy, fed_funds_rate, cpi_yoy, pmi_manufacturing, unemployment_rate, case_shiller_yoy, housing_starts_saar, mortgage_rate_30y, cmbs_delinquency_rate, office_vacancy_rate, aaii_bull_pct, aaii_bear_pct, put_call_ratio, margin_debt_yoy)
SELECT id, '2007-06-01', -1.8, 5.2, 18.1, 14.2, 'contango', 0.05, 2.9, 5.25, 2.7, 55.0, 4.5, 5.2, 1490, 6.42, 1.2, 12.8, 44.5, 28.3, 0.72, 12.5
FROM public.episodes WHERE name LIKE '2007%' LIMIT 1
ON CONFLICT DO NOTHING;

-- 2022 Crypto entering state
INSERT INTO public.episode_signals (episode_id, signal_date, sp500_return_1m, sp500_return_3m, sp500_return_12m, vix_level, vix_term_structure, yield_curve_10y2y, credit_spread_hy, fed_funds_rate, cpi_yoy, pmi_manufacturing, unemployment_rate, btc_return_1m, btc_mvrv_zscore, crypto_fear_greed, btc_dominance, aaii_bull_pct, aaii_bear_pct, put_call_ratio, margin_debt_yoy)
SELECT id, '2022-05-07', -8.8, -13.3, -1.2, 30.2, 'contango', -0.22, 4.1, 0.75, 8.3, 55.4, 3.6, -15.2, 0.9, 22, 42.1, 18.5, 52.1, 1.05, -18.2
FROM public.episodes WHERE name LIKE '2022 Luna%' LIMIT 1
ON CONFLICT DO NOTHING;
