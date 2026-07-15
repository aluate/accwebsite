"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function SpecError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[SpecEditorPage] error:", error);
  }, [error]);

  return (
    <section className="max-w-3xl mx-auto px-4 py-20 text-center">
      <p className="text-[#f08122] font-condensed uppercase tracking-widest text-xs mb-4">Spec Error</p>
      <h1 className="font-heading text-2xl uppercase tracking-wide text-white mb-3">Could not load this spec</h1>
      <p className="text-white/50 text-sm mb-2">{error.message || "An unexpected error occurred."}</p>
      {error.digest && <p className="text-white/25 text-xs font-condensed mb-8">Digest: {error.digest}</p>}
      <div className="flex gap-3 justify-center">
        <button
          onClick={reset}
          className="bg-[#f08122] hover:bg-[#d9711e] text-white font-condensed uppercase tracking-widest text-xs px-5 py-2.5 rounded transition-colors"
        >
          Try Again
        </button>
        <Link href=".."
          className="border border-white/20 hover:border-white/40 text-white/60 font-condensed uppercase tracking-widest text-xs px-5 py-2.5 rounded transition-colors"
        >
          ← Back to Specs
        </Link>
      </div>
    </section>
  );
}
