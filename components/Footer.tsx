import Link from "next/link";
import { SITE } from "@/data/site";

export function Footer() {
  return (
    <footer className="bg-[#3d3d3d] border-t border-white/10">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm font-heading text-white/40">
        <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-8">
          <a href="#header" className="hover:text-white transition-colors uppercase tracking-wide text-xs">
            Back to Top
          </a>
          <a href={`tel:${SITE.phone.replace(/\./g, "")}`} className="hover:text-white transition-colors">
            {SITE.phone}
          </a>
          <span>{SITE.address}</span>
        </div>
        <p className="text-xs">© Advanced Custom Cabinets {new Date().getFullYear()}</p>
      </div>
    </footer>
  );
}
