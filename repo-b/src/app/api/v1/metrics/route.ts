/**
 * Temporary metrics endpoint stub.
 */
export const runtime = "nodejs";

export async function GET() {
  return Response.json({
    total_documents: 0,
    total_executions: 0,
    active_environments: 0,
    queue_depth: 0,
  });
}
