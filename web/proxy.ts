import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

const publicPaths = ["/", "/login", "/register", "/_not-found"];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Cookie-authenticated mutations must originate from this application.
  // Non-browser clients (including cron) may omit Origin and use their own auth.
  if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) {
    const origin = request.headers.get("origin");
    if (request.headers.get("sec-fetch-site") === "cross-site" ||
        (origin && origin !== request.nextUrl.origin)) {
      return NextResponse.json({ error: "Forbidden request origin" }, { status: 403 });
    }
  }
  // API handlers validate identity themselves; avoid a duplicate auth round trip.
  if (pathname.startsWith("/api/")) return NextResponse.next();

  // Allow public pages through without auth check
  if (publicPaths.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return NextResponse.next();
  }

  return await updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
