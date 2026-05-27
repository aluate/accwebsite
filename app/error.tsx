"use client";

import Link from "next/link";

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center px-6 text-center">
      <p className="font-condensed uppercase tracking-widest text-[#f08122] text-xs mb-3">
        Database busy
      </p>
      <h1 className="font-heading text-2xl uppercase text-white mb-2">
        Page couldn&apos;t load
      </h1>
      <p className="text-white/40 text-sm max-w-sm mb-8">
        The database is temporarily busy. Wait a moment and try again — it clears up quickly.
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
