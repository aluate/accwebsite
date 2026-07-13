import Link from "next/link";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";

export const runtime = "nodejs";

export default async function InstallerLayout({ children }: { children: React.ReactNode }) {
  await requireRole(["installer", "admin"]).catch(() => redirect("/login"));

  return (
    <div className="min-h-screen bg-[#111] text-white">
      {/* Nav */}
      <nav className="sticky top-0 z-10 bg-[#111]/95 backdrop-blur border-b border-white/10 px-4 py-3">
        <div className="flex items-center justify-between max-w-lg mx-auto">
          <div className="flex items-center gap-3">
            <span className="text-[#f08122] font-heading text-lg uppercase tracking-wider">ACC</span>
            <Link
              href="/installer"
              className="text-white/60 hover:text-white text-xs font-condensed uppercase tracking-wider transition-colors"
            >
              My Jobs
            </Link>
          </div>
          <form action="/api/auth/logout" method="POST">
            <button
              type="submit"
              className="text-white/30 hover:text-white text-xs font-condensed uppercase tracking-wider transition-colors"
            >
              Sign Out
            </button>
          </form>
        </div>
      </nav>
      <main className="max-w-lg mx-auto">
        {children}
      </main>
    </div>
  );
}
