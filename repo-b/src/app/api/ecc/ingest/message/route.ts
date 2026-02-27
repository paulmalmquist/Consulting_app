import { eccError } from "@/lib/server/eccApi";
import { ingestMessage } from "@/lib/server/eccStore";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    env_id?: string;
    source?: "email" | "sms" | "slack" | "whatsapp" | "manual" | "seed";
    source_id?: string;
    sender?: string;
    subject?: string;
    body?: string;
    received_at?: string;
    attachments?: Array<{ filename: string; content_type?: string; size_bytes?: number }>;
    raw?: Record<string, unknown>;
  };

  if (!body.source || !body.source_id || !body.sender || !body.body) {
    return eccError("source, source_id, sender, and body are required");
  }

  return Response.json(
    ingestMessage({
      env_id: body.env_id,
      source: body.source,
      source_id: body.source_id,
      sender: body.sender,
      subject: body.subject,
      body: body.body,
      received_at: body.received_at,
      attachments: body.attachments,
      raw: body.raw,
    })
  );
}
