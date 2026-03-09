export const runtime = "nodejs";

export async function OPTIONS() {
  return new Response(null, { status: 200, headers: { Allow: "POST, OPTIONS" } });
}

export async function POST(
  request: Request,
  { params }: { params: { fundId: string } }
) {
  const body = await request.json();
  const backendUrl = process.env.BOS_API_URL || "http://localhost:8000";

  try {
    const res = await fetch(`${backendUrl}/api/re/v2/funds/${params.fundId}/monte-carlo-waterfall`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = await res.json().catch(() => ({ error: "Backend waterfall computation failed" }));
    return Response.json(payload, { status: res.status });
  } catch (err) {
    console.error("[re/v2/funds/[fundId]/monte-carlo-waterfall]", err);
    return Response.json({ error: "Monte Carlo waterfall failed" }, { status: 500 });
  }
}
