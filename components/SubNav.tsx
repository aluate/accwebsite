import Link from "next/link";
import { cn } from "@/lib/utils";

const ITEMS = [
  { label: "About", href: "/about" },
  { label: "Tour", href: "/tour" },
  { label: "Team", href: "/team" },
];

export function SubNav({ current }: { current: string }) {
  return (
    <div className="bg-[#2d2d2d] border-b border-white/10">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-2 text-xs font-condensed uppercase tracking-widest">
        <span className="text-white/30">Our Company</span>
        {ITEMS.map((item) => (
          <span key={item.href} className="flex items-center gap-2">
            <span className="text-white/20">|</span>
            <Link
              href={item.href}
              className={cn(
                "transition-colors",
                current === item.href ? "text-[#f08122]" : "text-white/60 hover:text-white"
              )}
            >
              {item.label}
            </Link>
          </span>
        ))}
      </div>
    </div>
  );
}
