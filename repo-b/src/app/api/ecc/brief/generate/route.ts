import { generateTodayBrief } from "@/lib/server/eccStore";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const url = new URL(request.url);
  const envId = url.searchParams.get("env_id") || undefined;
  const type = (url.searchParams.get("type") || "am") as "am" | "pm";
  return Response.json(generateTodayBrief(envId, type));
}
