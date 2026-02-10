/**
 * Temporary chat endpoint stub.
 * TODO: Replace with actual FastAPI backend
 */
export const runtime = "nodejs";

export async function POST() {
  return Response.json(
    {
      message: "Backend not deployed - chat functionality unavailable",
      response: "The FastAPI backend needs to be deployed to Railway/Render for chat to work.",
    },
    { status: 503 }
  );
}
