import { redirect } from "next/navigation";
import { getBuilder } from "@/lib/auth";
import Link from "next/link";
import Image from "next/image";

export default async function RootPage() {
  // Send logged-in users straight to jobs
  const builder = await getBuilder().catch(() => null);
  if (builder) redirect("/jobs");

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6 text-center">
      <div className="mb-10">
        <Image
          src="/acc-logo.png"
          alt="Advanced Custom Cabinets"
          width={120}
          height={120}
          className="mx-auto mb-6 opacity-90"
        />
        <h1 className="font-heading text-4xl uppercase tracking-wide text-white mb-2">
          Advanced Custom Cabinets
        </h1>
        <p className="text-white/40 font-condensed uppercase tracking-widest text-sm">
          Custom Cabinets · Quality Millwork · Since 1998
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-4">
        <Link
          href="/login"
          className="bg-[#f08122] hover:bg-[#d9711e] text-white font-condensed uppercase tracking-widest text-sm px-8 py-3 rounded transition-colors"
        >
          Team Login
        </Link>
        <a
          href="https://www.advancedcabinets.net"
          className="border border-white/20 hover:border-white/40 text-white/60 hover:text-white font-condensed uppercase tracking-widest text-sm px-8 py-3 rounded transition-colors"
        >
          Visit Our Website →
        </a>
      </div>
    </main>
  );
}
