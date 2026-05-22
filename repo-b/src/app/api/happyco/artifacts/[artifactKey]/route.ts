import fs from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { HAPPYCO_COOKIE_NAME } from "@/lib/happyco/proof";
import { HAPPYCO_ARTIFACTS } from "@/lib/happyco/artifacts";

export const runtime = "nodejs";

type Params = {
  params: { artifactKey: string };
};

export async function GET(request: NextRequest, { params }: Params) {
  if (request.cookies.get(HAPPYCO_COOKIE_NAME)?.value !== "granted") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { artifactKey } = params;
  const artifact = HAPPYCO_ARTIFACTS.find((item) => item.key === artifactKey);
  if (!artifact) {
    return NextResponse.json({ error: "Unknown artifact" }, { status: 404 });
  }

  const repoRoot = path.resolve(process.cwd(), "..");
  const fullPath = path.resolve(process.cwd(), artifact.relativePath);
  if (!fullPath.startsWith(repoRoot + path.sep)) {
    return NextResponse.json({ error: "Invalid artifact path" }, { status: 404 });
  }

  try {
    const bytes = await fs.readFile(fullPath);
    return new NextResponse(bytes, {
      headers: {
        "Content-Type": artifact.contentType,
        "Content-Disposition": `attachment; filename="${artifact.fileName}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Artifact is not available on this server. Upload to gated storage pending." },
      { status: 404 },
    );
  }
}
