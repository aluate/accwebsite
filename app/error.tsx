"use client";

import Link from "next/link";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const isTimeout =
    error.message?.toLowerCase().includes("timeout") ||
    error.message?.toLowerCase().includes("timed out");

  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center px-6 text-center">
      <p className="font-condensed uppercase tracking-widest text-[#f08122] text-xs mb-3">
        {isTimeout ? "Database busy" : "Something went wrong"}
      </p>
      <h1 className="font-heading text-2xl uppercase text-white mb-2">
        {isTimeout ? "Could not load page" : "Unexpected error"}
      </h1>
      <p className="text-white/40 text-sm max-w-sm mb-8">
        {isTimeout
          ? "The database is temporarily busy. Wait a moment and try again."
          : "An error occurred loading this page. Try refreshing."}
      </p>
      <div className="flex items-center gap-4">
        <button
          onClick={reset}
          className="px-5 py-2 bg-[#f08122] hover:bg-[#d4701e] text-white font-condensed uppercase tracking-widest text-sm rounded transition-colors"
        >
          Try again
        </button>
        <Link
          href="/jobs"
          className="px-5 py-2 border border-white/15 hover:border-white/30 text-white/60 hover:text-white font-condensed uppercase tracking-widest text-sm rounded transition-colors"
        >
          Back to Jobs
        </Link>
      </div>
    </div>
  );
}
