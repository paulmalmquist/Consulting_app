/**
 * Temporary health check endpoint until backend is deployed.
 * This allows the frontend proxy at /v1/health to work.
 *
 * TODO: Replace with actual FastAPI backend deployment (Railway/Render)
 */
export async function GET() {
  return Response.json({
    ok: true,
    message: "Temporary Next.js health endpoint - backend deployment pending",
    timestamp: new Date().toISOString(),
  });
}

export const runtime = "nodejs";
