import { NextRequest } from "next/server";
import { createFallbackDocument } from "@/lib/labV1Fallback";
import { proxyOrFallback } from "@/lib/v1Proxy";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  return proxyOrFallback(request, `/v1/environments/${params.id}/upload`, async () => {
    const form = await request.formData().catch(() => null);
    const file = form?.get("file");
    if (!(file instanceof File)) {
      return Response.json({ message: "file is required" }, { status: 400 });
    }
    const created = createFallbackDocument(params.id, {
      filename: file.name || "upload.bin",
      mime_type: file.type || "application/octet-stream",
      size_bytes: typeof file.size === "number" ? file.size : 0,
    });
    return Response.json({ ok: true, document: created });
  });
}
