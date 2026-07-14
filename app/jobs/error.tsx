"use client";

export default function JobsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const isTimeout = error.message?.includes("timed out") || error.message?.includes("timeout") || error.message?.includes("connect");
  return (
    <section className="max-w-6xl mx-auto px-4 sm:px-6 py-20 text-center">
      <p className="font-condensed uppercase tracking-widest text-xs text-[#f08122] mb-4">
        {isTimeout ? "Database connection timeout" : "Something went wrong"}
      </p>
      <p className="text-white/40 text-sm mb-8 max-w-md mx-auto leading-relaxed">
        {isTimeout
          ? "The database took too long to respond — this usually clears on retry. If it keeps happening, let Karl know."
          : "An unexpected error occurred loading this page."}
      </p>
      <button
        onClick={reset}
        className="bg-[#f08122] hover:bg-[#d9711e] text-white font-condensed uppercase tracking-widest text-xs py-2 px-6 rounded transition-colors"
      >
        Retry
      </button>
    </section>
  );
}
