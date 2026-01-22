import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const protectedPaths = ["/lab"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isProtected = protectedPaths.some((path) => pathname.startsWith(path));

  if (!isProtected) {
    return NextResponse.next();
  }

  const hasSession = Boolean(request.cookies.get("demo_lab_session")?.value);
  if (!hasSession) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/lab/:path*"]
};
