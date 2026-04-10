import {
  buildStateLockViolationResponse,
  checkReleasedStateLock,
} from "@/lib/server/authoritativeStateLock";
import { getPool } from "@/lib/server/db";
import {
  computeFundBaseScenario,
  type BaseScenarioLiquidationMode,
} from "@/lib/server/reBaseScenario";

export const runtime = "nodejs";

export async function OPTIONS() {
  return new Response(null, { status: 200, headers: { Allow: "GET, OPTIONS" } });
}

/**
 * Authoritative State Lockdown — Phase 5: this legacy base-scenario
 * route refuses to compute or serve a value for a (fund, quarter) that
 * has a released authoritative snapshot. Returns 409 with redirect.
 * See docs/SYSTEM_RULES_AUTHORITATIVE_STATE.md.
 */
export async function GET(
  request: Request,
  { params }: { params: { fundId: string } }
) {
  const pool = getPool();
  if (!pool) {
    return Response.json(
      { error_code: "DB_UNAVAILABLE", message: "Database not available" },
      { status: 503 }
    );
  }

  const { searchParams } = new URL(request.url);
  const quarter = searchParams.get("quarter") || "2026Q1";
  const scenarioId = searchParams.get("scenario_id");
  const liquidationMode = (searchParams.get("liquidation_mode") || "current_state") as BaseScenarioLiquidationMode;

  if (liquidationMode !== "current_state" && liquidationMode !== "hypothetical_sale") {
    return Response.json(
      { error_code: "INVALID_MODE", message: "liquidation_mode must be current_state or hypothetical_sale" },
      { status: 400 }
    );
  }

  // Authoritative State Lockdown — refuse to serve if a released
  // snapshot exists for this period.
  const lock = await checkReleasedStateLock(pool, "fund", params.fundId, quarter);
  if (lock) {
    return buildStateLockViolationResponse({
      entityType: "fund",
      entityId: params.fundId,
      quarter,
      lock,
    });
  }

  try {
    const result = await computeFundBaseScenario({
      pool,
      fundId: params.fundId,
      quarter,
      scenarioId,
      liquidationMode,
    });
    return Response.json(result);
  } catch (err) {
    console.error("[re/v2/funds/[fundId]/base-scenario] error", err);
    return Response.json(
      { error_code: "BASE_SCENARIO_FAILED", message: String(err) },
      { status: 500 }
    );
  }
}
