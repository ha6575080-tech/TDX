import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

function envIsConfigured(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  const urlOk = url.startsWith("https://") && !url.includes("PLACEHOLDER");
  const keyOk =
    anonKey.length > 10 &&
    anonKey !== "PASTE_ANON_KEY_HERE" &&
    anonKey !== "your-anon-key" &&
    !anonKey.includes("YOUR");
  return urlOk && keyOk;
}

const PROTECTED_PATHS = ["/dashboard", "/admin", "/statistics", "/tasks"];

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  // If env keys are still placeholders (not configured yet), skip session
  // handling entirely so the app runs fine with static demo data.
  if (!envIsConfigured()) {
    return supabaseResponse;
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // IMPORTANT: Avoid writing any logic between createServerClient and
  // supabase.auth.getUser(). A simple mistake could make it very hard to debug
  // issues with users being randomly logged out.

  // Do not run code between createServerClient and supabase.auth.getUser()
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;
  const isProtected = PROTECTED_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  );

  // No session on a protected route → redirect to /login.
  if (!user && isProtected) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  // If there is a user, but no session, refresh the session via the cookie.
  return supabaseResponse;
}