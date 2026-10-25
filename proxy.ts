// Proxy (formerly "middleware") runs before a page renders.
//
// It only does a QUICK check: "is there a session cookie at all?" If not, it
// sends a real HTTP 307 redirect to /login before any HTML streams. It does NOT
// look the session up in the database; a cookie can be expired or forged, so
// every page and service still checks the session properly. This is only the
// fast, friendly first door.
import { NextResponse, type NextRequest } from "next/server";

export function proxy(req: NextRequest) {
  if (!req.cookies.has("woona_session")) {
    const login = new URL("/login", req.url);
    login.searchParams.set("next", req.nextUrl.pathname);
    return NextResponse.redirect(login);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/business/:path*", "/rider/:path*", "/admin/:path*"],
};
