/**
 * GET /api/re/v2/dashboards/spec/docs/dashboard_requests/[filename].md
 *
 * Returns the raw markdown content of a dashboard request spec file.
 * Only files under docs/dashboard_requests/ are accessible.
 * Path traversal is rejected.
 */

import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: { path: string[] } },
) {
  const requestedPath = params.path.join("/");

  // Security: only allow docs/dashboard_requests/ prefix, reject traversal
  if (!requestedPath.startsWith("docs/dashboard_requests/") || requestedPath.includes("..")) {
    return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  }

  const repoRoot = process.cwd();
  const candidates = [
    path.resolve(repoRoot, requestedPath),
    path.resolve(repoRoot, "..", requestedPath),
  ];
  const resolved = candidates.find((p) => fs.existsSync(p));
  if (!resolved) {
    return NextResponse.json({ error: `Not found: ${requestedPath}` }, { status: 404 });
  }

  const content = fs.readFileSync(resolved, "utf-8");
  return new NextResponse(content, {
    headers: { "Content-Type": "text/markdown; charset=utf-8" },
  });
}
