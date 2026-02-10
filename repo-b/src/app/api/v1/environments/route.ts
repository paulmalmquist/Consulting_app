/**
 * Temporary environments endpoint until backend is deployed.
 * Returns stub data to unblock frontend development.
 *
 * TODO: Replace with actual FastAPI backend deployment
 */
export const runtime = "nodejs";

export async function GET() {
  return Response.json({
    env_id: "stub-env-001",
    name: "Temporary Environment",
    created_at: new Date().toISOString(),
    status: "pending_backend_deployment",
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    console.log("[stub] POST /v1/environments", body);

    return Response.json(
      {
        env_id: `stub-${Date.now()}`,
        name: body.name || "New Environment",
        created_at: new Date().toISOString(),
        status: "created",
        message: "Stub environment - backend not deployed yet",
      },
      { status: 201 }
    );
  } catch (error) {
    return Response.json(
      { error: "Invalid request", message: String(error) },
      { status: 400 }
    );
  }
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, x-bm-request-id",
    },
  });
}
