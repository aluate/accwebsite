import { NextRequest, NextResponse } from "next/server";

// DocuSign OAuth callback — used only for the one-time consent grant.
// After the user clicks "Grant Access" on the DocuSign consent page,
// DocuSign redirects here with ?code=...  We don't need the code for
// JWT Bearer auth; we just confirm consent was given and redirect home.
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const error = req.nextUrl.searchParams.get("error");

  if (error) {
    return NextResponse.redirect(
      new URL(`/admin?docusign_consent=denied&reason=${encodeURIComponent(error)}`, req.url)
    );
  }

  if (code) {
    return NextResponse.redirect(
      new URL("/admin?docusign_consent=granted", req.url)
    );
  }

  // Fallback
  return NextResponse.redirect(new URL("/admin", req.url));
}
