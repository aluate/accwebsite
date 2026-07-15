"use client";
import { useEffect } from "react";
import Link from "next/link";

export default function RouteError({
  error, reset,
}: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error("[InstallerPage] error:", error); }, [error]);
  const isTimeout = error.message?.includes("timeout") || error.message?.includes("timed out") || error.message?.includes("connect");
  return (
    <section className="max-w-4xl mx-auto px-4 py-20 text-center">
      <p className="text-[#f08122] font-condensed uppercase tracking-widest text-xs mb-4">
        {isTimeout ? "Database timeout" : "Something went wrong"}
      </p>
      <p className="text-white/40 text-sm mb-8 max-w-md mx-auto leading-relaxed">
        {isTimeout
          ? "The database took too long to respond — this usually clears on retry."
          : "An unexpected error occurred loading this page."}
      </p>
      <div className="flex gap-3 justify-center">
        <button onClick={reset}
          className="bg-[#f08122] hover:bg-[#d9711e] text-white font-condensed uppercase tracking-widest text-xs py-2 px-6 rounded transition-colors">
          Retry
        </button>
        <Link href="/jobs"
          className="border border-white/20 hover:border-white/40 text-white/60 font-condensed uppercase tracking-widest text-xs py-2 px-6 rounded transition-colors">
          ← Jobs
        </Link>
      </div>
    </section>
  );
}
