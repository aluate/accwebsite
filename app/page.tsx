import { redirect } from "next/navigation";

// Phase 1B+ (2026-05): for the accspec.net deployment, the root URL bounces
// straight to /jobs. The /jobs layout will redirect to /login if not authed.
// Marketing pages (/about, /team, /tour, /projects/*, /contact) still resolve
// at their own URLs but aren't linked from the tool.
export default function HomePage() {
  redirect("/jobs");
}
