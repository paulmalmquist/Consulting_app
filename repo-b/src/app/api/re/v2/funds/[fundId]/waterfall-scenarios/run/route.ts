export const runtime = "nodejs";

export async function OPTIONS() {
  return new Response(null, { status: 200, headers: { Allow: "POST, OPTIONS" } });
}

/**
 * POST /api/re/v2/funds/[fundId]/waterfall-scenarios/run
 *
 * Proxy to backend waterfall scenario computation.
 *
 * NOTE: Priority 9 fix required in backend:
 * When a scenario has zero overrides (cap_rate_delta_bps=0, noi_stress_pct=0, exit_date_shift_months=0),
 * the backend should detect this and return base metrics without recomputation.
 * Currently unnecessary recomputation causes -20% IRR swings with zero scenario overrides.
 */
export async function POST(
  request: Request,
  { params }: { params: { fundId: string } }
) {
  const body = await request.json();
  const backendUrl = process.env.BOS_API_URL || "http://localhost:8000";

  try {
    const res = await fetch(`${backendUrl}/api/re/v2/funds/${params.fundId}/waterfall-scenarios/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      return Response.json({ error: "Backend waterfall computation failed" }, { status: res.status });
    }

    const result = await res.json();
    return Response.json(result);
  } catch (err) {
    console.error("[re/v2/funds/[fundId]/waterfall-scenarios/run]", err);
    return Response.json({ error: "Waterfall computation failed" }, { status: 500 });
  }
}
