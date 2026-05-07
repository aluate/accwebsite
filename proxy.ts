import { NextRequest, NextResponse } from "next/server";

const COOKIE_NAME = "acc_builder_session";

// Runs before rendering — lightweight cookie-presence check only.
// Full session validation (DB lookup) happens server-side in each page / route handler.
export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Express Wizard feature flag.
  // ACC is not a catalog-ordering shop yet (2026-05). All /express/** paths
  // return 404 unless EXPRESS_ENABLED is explicitly "true". The code stays in
  // the repo for a future Phase 2 revival.
  if (pathname.startsWith("/express") || pathname.startsWith("/api/express")) {
    if (process.env.EXPRESS_ENABLED !== "true") {
      return new NextResponse("Not Found", { status: 404 });
    }
  }

  // Protect /express/** except /express/login (only relevant when flag enabled).
  if (pathname.startsWith("/express") && !pathname.startsWith("/express/login")) {
    const token = req.cookies.get(COOKIE_NAME)?.value;
    if (!token) {
      const loginUrl = req.nextUrl.clone();
      loginUrl.pathname = "/express/login";
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.next();
}

export const proxyConfig = {
  matcher: ["/express/:path*", "/api/express/:path*"],
};
