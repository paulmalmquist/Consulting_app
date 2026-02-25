import { NextRequest } from "next/server";

export const runtime = "nodejs";

export async function OPTIONS() {
  return new Response(null, {
    status: 200,
    headers: { Allow: "GET, POST, OPTIONS" },
  });
}

export async function GET() {
  // Fallback behavior for deployments without a BOS API upstream.
  return Response.json([]);
}

export async function POST(_request: NextRequest) {
  return Response.json(
    {
      error_code: "FUND_CREATE_UNAVAILABLE",
      message:
        "Fund creation requires a configured BOS API upstream. Set NEXT_PUBLIC_BOS_API_BASE_URL.",
    },
    { status: 503 }
  );
}

