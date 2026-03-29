import { NextRequest } from "next/server";
import { proxyOrFail } from "@/lib/v1Proxy";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  return proxyOrFail(request, "/v1/environments/" + params.id);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  return proxyOrFail(request, "/v1/environments/" + params.id);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  return proxyOrFail(request, "/v1/environments/" + params.id);
}
