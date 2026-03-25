// src/app/api/brief/route.ts
export const runtime = 'edge';

export async function GET(): Promise<Response> {
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  const url = `https://raw.githubusercontent.com/paulmalmquist/Consulting_app/main/docs/ops-reports/digests/winston-daily-brief-${today}.md`;

  const res = await fetch(url);

  if (!res.ok) {
    return new Response(
      `No brief found for ${today}. Expected file: winston-daily-brief-${today}.md`,
      { status: 404, headers: { 'Content-Type': 'text/plain' } }
    );
  }

  const text = await res.text();

  return new Response(text, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}
