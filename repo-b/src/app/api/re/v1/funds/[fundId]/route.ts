export const runtime = "nodejs";

export async function OPTIONS() {
  return new Response(null, {
    status: 200,
    headers: { Allow: "GET, OPTIONS" },
  });
}

export async function GET(
  _request: Request,
  { params }: { params: { fundId: string } }
) {
  return Response.json(
    {
      error_code: "FUND_NOT_FOUND",
      message: `Fund ${params.fundId} not found.`,
    },
    { status: 404 }
  );
}

