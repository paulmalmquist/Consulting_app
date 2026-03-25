import { eccError } from "@/lib/server/eccApi";
import { quickCapture } from "@/lib/server/eccStore";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    env_id?: string;
    body?: string;
    tags?: string[];
    attachment?: { filename: string; content_type?: string; size_bytes?: number } | null;
  };
  if (!body.body) {
    return eccError("body is required");
  }
  return Response.json(
    quickCapture({
      env_id: body.env_id,
      body: body.body,
      tags: body.tags,
      attachment: body.attachment,
    })
  );
}
