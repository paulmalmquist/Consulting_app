/**
 * Temporary audit endpoint stub.
 */
export const runtime = "nodejs";

export async function GET() {
  return Response.json({ items: [] });
}
