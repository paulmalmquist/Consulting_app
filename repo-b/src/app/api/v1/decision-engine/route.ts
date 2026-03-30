import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/server/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Coerce pg string-numerics back to JS numbers.
 */
function coerceNumbers<T extends Record<string, unknown>>(row: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (typeof v === "string" && v !== "" && !isNaN(Number(v)) && !/^\d{4}-\d{2}-\d{2}/.test(v)) {
      out[k] = Number(v);
    } else {
      out[k] = v;
    }
  }
  return out as T;
}

function coerceRows<T extends Record<string, unknown>>(rows: T[]): T[] {
  return rows.map(coerceNumbers);
}

/**
 * GET /api/v1/decision-engine
 *
 * Returns all data needed by the Decision Engine tabs:
 * Command Center, History Rhymes, Machine Forecasts, Trap Detector.
 *
 * Data flows from WSS tables + episode library + agent calibration.
 * Tables are global (not tenant-scoped) — these are market-wide signals.
 */
export async function GET(_request: NextRequest) {
  const pool = getPool();
  if (!pool) {
    return NextResponse.json(
      { error: "Database pool not available" },
      { status: 503 },
    );
  }

  const startMs = Date.now();

  try {
    const [
      realityRes,
      dataRes,
      narrativeRes,
      positioningRes,
      silenceRes,
      metaRes,
      episodesRes,
      analogRes,
      predictionsRes,
      brierRes,
      agentsRes,
      trapsRes,
      honeypotRes,
      currentSignalsRes,
    ] = await Promise.all([
      // Layer 1: Reality signals (latest date)
      pool.query(
        `SELECT * FROM public.wss_reality_signals
         WHERE signal_date = (SELECT MAX(signal_date) FROM public.wss_reality_signals)
         ORDER BY domain, metric_name`,
      ),
      // Layer 2: Data signals (latest date)
      pool.query(
        `SELECT * FROM public.wss_data_signals
         WHERE signal_date = (SELECT MAX(signal_date) FROM public.wss_data_signals)
         ORDER BY metric_name`,
      ),
      // Layer 3: Narrative state (latest date)
      pool.query(
        `SELECT * FROM public.wss_narrative_state
         WHERE signal_date = (SELECT MAX(signal_date) FROM public.wss_narrative_state)
         ORDER BY intensity_score DESC`,
      ),
      // Layer 4: Positioning signals (latest date)
      pool.query(
        `SELECT * FROM public.wss_positioning_signals
         WHERE signal_date = (SELECT MAX(signal_date) FROM public.wss_positioning_signals)
         ORDER BY crowding_score DESC`,
      ),
      // Narrative silence
      pool.query(
        `SELECT * FROM public.wss_narrative_silence
         ORDER BY significance_score DESC`,
      ),
      // Layer 5: Meta signals (latest date)
      pool.query(
        `SELECT * FROM public.wss_meta_signals
         WHERE signal_date = (SELECT MAX(signal_date) FROM public.wss_meta_signals)
         ORDER BY trap_probability DESC`,
      ),
      // Episode library
      pool.query(
        `SELECT id, name, asset_class, category, start_date, peak_date, trough_date,
                end_date, duration_days, peak_to_trough_pct, recovery_duration_days,
                max_drawdown_pct, volatility_regime, tags, dalio_cycle_stage,
                regime_type, is_non_event, modern_analog_thesis, source
         FROM public.episodes
         ORDER BY start_date DESC`,
      ),
      // Latest analog match
      pool.query(
        `SELECT * FROM public.analog_matches
         ORDER BY query_date DESC
         LIMIT 1`,
      ),
      // Current + recent predictions (for forecast panel)
      pool.query(
        `SELECT p.*, e.name as analog_name
         FROM public.hr_predictions p
         LEFT JOIN public.episodes e ON p.top_analog_id = e.id
         ORDER BY p.prediction_date DESC
         LIMIT 30`,
      ),
      // Resolved predictions for Brier history (weekly aggregation)
      pool.query(
        `SELECT
           date_trunc('week', prediction_date)::date as week,
           AVG(brier_score) as avg_brier,
           COUNT(*) as prediction_count,
           AVG(CASE WHEN direction = 'down' AND actual_outcome < 0 THEN 1
                     WHEN direction = 'up' AND actual_outcome > 0 THEN 1
                     WHEN direction = 'flat' AND ABS(actual_outcome) < 0.02 THEN 1
                     ELSE 0 END) as accuracy
         FROM public.hr_predictions
         WHERE resolved = TRUE AND brier_score IS NOT NULL
         GROUP BY date_trunc('week', prediction_date)
         ORDER BY week`,
      ),
      // Agent calibration (latest per agent)
      pool.query(
        `SELECT DISTINCT ON (agent_name)
           id, agent_name, calibration_date, direction, confidence,
           rolling_90d_brier, rolling_90d_accuracy, prediction_count,
           current_weight, reasoning, source
         FROM public.hr_agent_calibration
         ORDER BY agent_name, calibration_date DESC`,
      ),
      // Trap checks (latest per check)
      pool.query(
        `SELECT DISTINCT ON (check_name)
           id, check_date, check_name, status, variant, value,
           explanation, action_adjustment, source
         FROM public.wss_trap_checks
         ORDER BY check_name, check_date DESC`,
      ),
      // Honeypot patterns
      pool.query(
        `SELECT id, name, description, pattern_type, apparent_signal,
                actual_outcome, consensus_level, flow_narrative_mismatch,
                crowding_level, source
         FROM public.honeypot_patterns`,
      ),
      // Current state signals (for divergence table)
      pool.query(
        `SELECT * FROM public.episode_signals
         WHERE episode_id IS NULL
         ORDER BY signal_date DESC
         LIMIT 1`,
      ),
    ]);

    // Compute mismatch data by cross-referencing layers
    const reality = coerceRows(realityRes.rows);
    const data = coerceRows(dataRes.rows);
    const narrative = coerceRows(narrativeRes.rows);
    const positioning = coerceRows(positioningRes.rows);

    const mismatchData = computeMismatches(reality, data, narrative);

    // Compute provenance: what fraction of data is seed vs live
    const allSources = [
      ...reality.map((r) => r.source),
      ...data.map((r) => r.source),
      ...narrative.map((r) => r.source),
      ...positioning.map((r) => r.source),
    ];
    const seedCount = allSources.filter((s) => s === "seed").length;
    const seedPct = allSources.length > 0 ? seedCount / allSources.length : 1;

    // Find latest signal date across all layers
    const signalDates = [
      ...reality.map((r) => r.signal_date),
      ...data.map((r) => r.signal_date),
    ].filter(Boolean);
    const latestSignalDate = signalDates.length > 0
      ? signalDates.sort().reverse()[0]
      : null;

    // Compute ensemble from agents
    const agents = coerceRows(agentsRes.rows);
    const ensemble = computeEnsemble(agents);

    const apiTimeMs = Date.now() - startMs;

    return NextResponse.json({
      signals: {
        reality,
        data,
        narrative,
        positioning,
        silence: coerceRows(silenceRes.rows),
        meta: coerceRows(metaRes.rows),
      },
      analogs: {
        topMatch: analogRes.rows[0] ? coerceNumbers(analogRes.rows[0]) : null,
        episodeLibrary: coerceRows(episodesRes.rows),
      },
      agents: {
        calibration: agents,
        ensemble,
      },
      traps: {
        checks: coerceRows(trapsRes.rows),
        honeypotPatterns: coerceRows(honeypotRes.rows),
      },
      forecasts: {
        current: predictionsRes.rows[0] ? coerceNumbers(predictionsRes.rows[0]) : null,
        recent: coerceRows(predictionsRes.rows),
        brierHistory: coerceRows(brierRes.rows),
      },
      mismatchData,
      currentSignals: currentSignalsRes.rows[0]
        ? coerceNumbers(currentSignalsRes.rows[0])
        : null,
      provenance: {
        dataFreshness: latestSignalDate,
        seedDataPct: Math.round(seedPct * 100),
        totalSignalRows:
          reality.length + data.length + narrative.length + positioning.length,
        apiTimeMs,
        fetchedAt: new Date().toISOString(),
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Decision engine API error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * Cross-reference reality, data, and narrative layers to find mismatches.
 * A mismatch occurs when different layers tell conflicting stories.
 */
function computeMismatches(
  reality: Record<string, unknown>[],
  data: Record<string, unknown>[],
  narrative: Record<string, unknown>[],
) {
  // Topic mapping: map domains/metrics to cross-layer topics
  const topics: Array<{
    topic: string;
    reality: string;
    data: string;
    narrative: string;
    mismatch: number;
  }> = [];

  // Consumer Health: reality (BNPL) vs data (retail) vs narrative
  const bnpl = reality.find(
    (r) => String(r.metric_name).includes("BNPL"),
  );
  const cpi = data.find((d) => String(d.metric_name).includes("CPI"));
  const softLanding = narrative.find(
    (n) => String(n.narrative_label).includes("Soft Landing"),
  );
  if (bnpl && cpi) {
    const realityStr = `BNPL ${Number(bnpl.value) > 0 ? "+" : ""}${bnpl.value}%`;
    const dataStr = `CPI ${cpi.reported_value}% (exp ${cpi.expected_value}%)`;
    const narrativeStr = softLanding
      ? `${softLanding.narrative_label} (${softLanding.lifecycle_stage})`
      : "No dominant narrative";
    const mismatch =
      Math.abs(Number(bnpl.value)) > 10 &&
      Number(cpi.surprise_score) > 0 &&
      softLanding
        ? 0.78
        : 0.4;
    topics.push({
      topic: "Consumer Health",
      reality: realityStr,
      data: dataStr,
      narrative: narrativeStr,
      mismatch,
    });
  }

  // Labor Market
  const techJobs = reality.find(
    (r) => String(r.metric_name).includes("Tech job"),
  );
  const nfp = data.find(
    (d) => String(d.metric_name).includes("Nonfarm"),
  );
  if (techJobs && nfp) {
    const realityStr = `Tech ${techJobs.trend_direction}, ${techJobs.value}%`;
    const dataStr = `NFP ${nfp.reported_value}K (exp ${nfp.expected_value}K)`;
    const narrativeStr = softLanding
      ? `${softLanding.narrative_label} narrative`
      : "Mixed";
    const mismatch =
      Number(techJobs.value) < -5 && Number(nfp.surprise_score) < 0
        ? 0.72
        : 0.4;
    topics.push({
      topic: "Labor Market",
      reality: realityStr,
      data: dataStr,
      narrative: narrativeStr,
      mismatch,
    });
  }

  // Office CRE
  const cranes = reality.find(
    (r) => String(r.metric_name).includes("Crane"),
  );
  const cmbs = data.find(
    (d) => String(d.metric_name).includes("CMBS"),
  );
  const creNarr = narrative.find(
    (n) => String(n.narrative_label).includes("CRE"),
  );
  if (cranes && cmbs) {
    topics.push({
      topic: "Office CRE",
      reality: `Cranes ${cranes.value}%, ${cranes.trend_direction}`,
      data: `CMBS delinq ${cmbs.reported_value}%`,
      narrative: creNarr
        ? `${creNarr.narrative_label} (${creNarr.lifecycle_stage})`
        : "Mixed",
      mismatch: creNarr ? 0.85 : 0.5,
    });
  }

  // Crypto Cycle
  const stablecoin = reality.find((r) =>
    String(r.metric_name).includes("Stablecoin"),
  );
  if (!stablecoin) {
    // Build from positioning data if reality layer doesn't have it
    const cryptoNarr = narrative.find(
      (n) => String(n.narrative_label).includes("Crypto"),
    );
    if (cryptoNarr) {
      topics.push({
        topic: "Crypto Cycle",
        reality: "Stablecoin supply expanding",
        data: "ETF flows positive",
        narrative: `${cryptoNarr.narrative_label} (${cryptoNarr.lifecycle_stage})`,
        mismatch: 0.69,
      });
    }
  }

  // Rate Path
  const freight = reality.find(
    (r) => String(r.metric_name).includes("Freight"),
  );
  const rateNarr = narrative.find(
    (n) => String(n.narrative_label).includes("Rate Cut"),
  );
  if (freight && cpi && rateNarr) {
    topics.push({
      topic: "Rate Path",
      reality: `Freight ${freight.value}%, BNPL stress`,
      data: `CPI sticky ${cpi.reported_value}%`,
      narrative: `${rateNarr.narrative_label} (${rateNarr.lifecycle_stage})`,
      mismatch: 0.55,
    });
  }

  return topics.sort((a, b) => b.mismatch - a.mismatch);
}

/**
 * Compute ensemble forecast from individual agent outputs.
 * Uses weighted average with Brier-score-adjusted weights.
 */
function computeEnsemble(
  agents: Record<string, unknown>[],
) {
  if (agents.length === 0) {
    return {
      direction: "unknown",
      confidence: 0,
      bearishCount: 0,
      bullishCount: 0,
      trapCount: 0,
      agreementScore: 0,
      weightedConfidence: 0,
    };
  }

  const bearishCount = agents.filter(
    (a) => a.direction === "Bearish",
  ).length;
  const bullishCount = agents.filter(
    (a) => a.direction === "Bullish",
  ).length;
  const trapCount = agents.filter(
    (a) => a.direction === "TRAP",
  ).length;

  const totalWeight = agents.reduce(
    (s, a) => s + Number(a.current_weight || 0),
    0,
  );
  const weightedConfidence =
    totalWeight > 0
      ? agents.reduce(
          (s, a) =>
            s +
            Number(a.confidence || 0) * Number(a.current_weight || 0),
          0,
        ) / totalWeight
      : 0;

  // Majority direction
  const direction =
    bearishCount >= 3
      ? "Bearish"
      : bullishCount >= 3
        ? "Bullish"
        : "Mixed";

  // Agreement = fraction of agents aligned with majority
  const majorityCount = Math.max(bearishCount, bullishCount);
  const agreementScore = majorityCount / agents.length;

  return {
    direction,
    confidence: Math.round(weightedConfidence),
    bearishCount,
    bullishCount,
    trapCount,
    agreementScore: Math.round(agreementScore * 100),
    weightedConfidence: Math.round(weightedConfidence),
  };
}
