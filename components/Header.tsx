"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Menu } from "lucide-react";
import { cn } from "@/lib/utils";

const PUBLIC_NAV = [
  { label: "Home", href: "/" },
  {
    label: "Our Company",
    children: [
      { label: "About", href: "/about" },
      { label: "Tour", href: "/tour" },
      { label: "Team", href: "/team" },
    ],
  },
  { label: "Contact", href: "/contact" },
];

const INTERNAL_NAV = [
  { label: "Jobs", href: "/jobs" },
  { label: "Schedule", href: "/schedule" },
  { label: "Engineering", href: "/engineer" },
];

const INTERNAL_PREFIXES = ["/jobs", "/schedule", "/admin", "/installer", "/engineer", "/login", "/change-password"];

export function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const isInternal = INTERNAL_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"));
  const isCompanyActive = ["/about", "/tour", "/team"].includes(pathname);

  return (
    <header className="bg-[#3d3d3d] border-b border-white/10 sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        <Link href={isInternal ? "/jobs" : "/"} className="shrink-0">
          <Image
            src="/logo.png"
            alt="Advanced Cabinets"
            width={180}
            height={40}
            priority
            className="h-9 w-auto"
          />
        </Link>

        {isInternal ? (
          /* Internal nav — Jobs + Schedule only */
          <>
            <nav className="hidden md:flex items-center gap-1">
              {INTERNAL_NAV.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "px-3 py-2 text-sm font-condensed font-medium uppercase tracking-wide transition-colors",
                    pathname === item.href || pathname.startsWith(item.href + "/")
                      ? "text-[#f08122]"
                      : "text-white hover:text-[#f08122]"
                  )}
                >
                  {item.label}
                </Link>
              ))}
              <button
                onClick={signOut}
                className="px-3 py-2 text-sm font-condensed font-medium uppercase tracking-wide text-white/30 hover:text-white/70 transition-colors"
              >
                Sign Out
              </button>
            </nav>

            {/* Mobile */}
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger
                render={
                  <Button variant="ghost" size="icon" className="md:hidden text-white hover:text-[#f08122] hover:bg-white/10">
                    <Menu className="h-5 w-5" />
                    <span className="sr-only">Open menu</span>
                  </Button>
                }
              />
              <SheetContent side="right" className="w-72 bg-[#2d2d2d] border-white/10">
                <div className="mb-6 mt-2">
                  <Image src="/logo.png" alt="Advanced Cabinets" width={160} height={36} className="h-8 w-auto" />
                </div>
                <nav className="flex flex-col gap-1">
                  {INTERNAL_NAV.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setOpen(false)}
                      className={cn(
                        "px-3 py-2.5 text-sm font-condensed uppercase tracking-wide",
                        pathname === item.href || pathname.startsWith(item.href + "/")
                          ? "text-[#f08122]"
                          : "text-white"
                      )}
                    >
                      {item.label}
                    </Link>
                  ))}
                  <div className="mt-4 pt-4 border-t border-white/10">
                    <button
                      onClick={signOut}
                      className="w-full text-left px-3 py-2.5 text-sm font-condensed uppercase tracking-wide text-white/30 hover:text-white/60 transition-colors"
                    >
                      Sign Out
                    </button>
                  </div>
                </nav>
              </SheetContent>
            </Sheet>
          </>
        ) : (
          /* Public marketing nav */
          <>
            <nav className="hidden md:flex items-center gap-1">
              {PUBLIC_NAV.map((item) =>
                item.children ? (
                  <div
                    key={item.label}
                    className="relative"
                    onMouseEnter={() => setDropdownOpen(true)}
                    onMouseLeave={() => setDropdownOpen(false)}
                  >
                    <button
                      className={cn(
                        "px-3 py-2 text-sm font-condensed font-medium uppercase tracking-wide transition-colors",
                        isCompanyActive ? "text-[#f08122]" : "text-white hover:text-[#f08122]"
                      )}
                    >
                      {item.label}
                    </button>
                    {dropdownOpen && (
                      <div className="absolute top-full left-0 bg-[#2d2d2d] border border-white/10 rounded shadow-lg min-w-[140px] py-1">
                        {item.children.map((child) => (
                          <Link
                            key={child.href}
                            href={child.href}
                            className={cn(
                              "block px-4 py-2 text-sm font-condensed uppercase tracking-wide transition-colors",
                              pathname === child.href
                                ? "text-[#f08122]"
                                : "text-white hover:text-[#f08122]"
                            )}
                          >
                            {child.label}
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <Link
                    key={item.href}
                    href={item.href!}
                    className={cn(
                      "px-3 py-2 text-sm font-condensed font-medium uppercase tracking-wide transition-colors",
                      pathname === item.href
                        ? "text-[#f08122]"
                        : "text-white hover:text-[#f08122]"
                    )}
                  >
                    {item.label}
                  </Link>
                )
              )}
            </nav>

            {/* Mobile */}
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger
                render={
                  <Button variant="ghost" size="icon" className="md:hidden text-white hover:text-[#f08122] hover:bg-white/10">
                    <Menu className="h-5 w-5" />
                    <span className="sr-only">Open menu</span>
                  </Button>
                }
              />
              <SheetContent side="right" className="w-72 bg-[#2d2d2d] border-white/10">
                <div className="mb-6 mt-2">
                  <Image src="/logo.png" alt="Advanced Cabinets" width={160} height={36} className="h-8 w-auto" />
                </div>
                <nav className="flex flex-col gap-1">
                  <Link href="/" onClick={() => setOpen(false)} className={cn("px-3 py-2.5 text-sm font-condensed uppercase tracking-wide", pathname === "/" ? "text-[#f08122]" : "text-white")}>Home</Link>
                  <div className="px-3 py-1 text-xs text-white/40 uppercase tracking-widest mt-2">Our Company</div>
                  {[{ label: "About", href: "/about" }, { label: "Tour", href: "/tour" }, { label: "Team", href: "/team" }].map((item) => (
                    <Link key={item.href} href={item.href} onClick={() => setOpen(false)}
                      className={cn("px-5 py-2 text-sm font-condensed uppercase tracking-wide", pathname === item.href ? "text-[#f08122]" : "text-white/80")}>
                      {item.label}
                    </Link>
                  ))}
                  <Link href="/contact" onClick={() => setOpen(false)} className={cn("px-3 py-2.5 text-sm font-condensed uppercase tracking-wide mt-1", pathname === "/contact" ? "text-[#f08122]" : "text-white")}>Contact</Link>
                </nav>
              </SheetContent>
            </Sheet>
          </>
        )}
      </div>
    </header>
  );
}
