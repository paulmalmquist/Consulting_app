export const runtime = "nodejs";

export async function OPTIONS() {
  return new Response(null, { status: 200, headers: { Allow: "POST, OPTIONS" } });
}

export async function POST(request: Request) {
  const body = await request.json();
  const backendUrl = process.env.BOS_API_ORIGIN || "http://localhost:8000";

  try {
    const res = await fetch(`${backendUrl}/api/re/v2/portfolio/waterfall`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = await res.json().catch(() => ({ error: "Portfolio waterfall failed" }));
    return Response.json(payload, { status: res.status });
  } catch (err) {
    console.error("[re/v2/portfolio/waterfall]", err);
    return Response.json({ error: "Portfolio waterfall failed" }, { status: 500 });
  }
}
