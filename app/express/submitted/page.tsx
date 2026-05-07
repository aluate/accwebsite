import { requireBuilder } from "@/lib/auth";

export default async function SubmittedPage({
  searchParams,
}: {
  searchParams: Promise<{ job?: string }>;
}) {
  const builder = await requireBuilder();
  const { job } = await searchParams;

  return (
    <div className="min-h-screen bg-[#111]">
      <header className="border-b border-white/10 px-6 py-4 flex items-center justify-between">
        <div>
          <p className="text-[#f08122] font-condensed uppercase tracking-[0.3em] text-xs">
            Advanced Custom Cabinets
          </p>
          <p className="text-white font-condensed uppercase tracking-widest text-sm mt-0.5">
            Express Order — {builder.name}
            {builder.company ? ` · ${builder.company}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-5">
          <a
            href="/express/orders"
            className="text-white/30 hover:text-white font-condensed uppercase tracking-widest text-xs transition-colors"
          >
            My Orders
          </a>
          <form action="/api/express/logout" method="POST">
            <button
              type="submit"
              className="text-white/30 hover:text-white font-condensed uppercase tracking-widest text-xs transition-colors"
            >
              Sign Out
            </button>
          </form>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-20 text-center">
        {/* Check mark */}
        <div className="w-16 h-16 rounded-full bg-[#f08122]/15 border border-[#f08122]/30 flex items-center justify-center mx-auto mb-8">
          <svg
            className="w-8 h-8 text-[#f08122]"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2.5}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>

        <h1 className="text-white font-condensed uppercase tracking-widest text-2xl mb-3">
          Order Submitted
        </h1>

        {job && (
          <p className="text-[#f08122] font-condensed uppercase tracking-widest text-sm mb-6">
            {job}
          </p>
        )}

        <p className="text-white/50 text-sm leading-relaxed mb-12 max-w-md mx-auto">
          Your order has been received. Our team will review it and reach out to
          confirm details and collect payment. Expect a call or email within one
          business day.
        </p>

        <a
          href="/express/new"
          className="inline-block bg-white/10 hover:bg-white/15 text-white font-condensed uppercase tracking-widest text-xs py-2.5 px-8 rounded transition-colors"
        >
          Start Another Order
        </a>
      </main>
    </div>
  );
}
