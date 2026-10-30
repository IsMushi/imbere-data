"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Logo } from "@/components/Logo";

const LINKS = [
  { href: "/", label: "Dashboard", short: "Dashboard" },
  { href: "/simulator", label: "Simulator", short: "Simulator" },
  { href: "/targeting", label: "Targeting", short: "Targeting" },
  { href: "/methodology", label: "Methodology", short: "Method" },
];

/**
 * Brand-blue bar, the same surface as the overview hero, so the two read as one band
 * rather than a paper strip sitting above a colour panel.
 */
export function Nav() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 bg-primary-deep">
      {/* Two rows below `sm`: four section labels plus the mark do not fit at 390px, and a
          clipped tab strip hides a page. Above `sm` it collapses back to one row, pinned to a
          fixed 76px. */}
      <div className="shell flex flex-col sm:h-[76px] sm:flex-row sm:items-stretch sm:gap-6">
        <Link
          href="/"
          className="flex shrink-0 items-center py-3 focus-visible:outline-white sm:py-0"
        >
          <Logo className="text-white" />
        </Link>

        <nav
          aria-label="Sections"
          className="flex items-stretch gap-4 overflow-x-auto border-t border-white/10 text-[14.5px] [scrollbar-width:none] sm:ml-auto sm:gap-6 sm:border-t-0"
        >
          {LINKS.map((l) => {
            const active = l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                aria-current={active ? "page" : undefined}
                className={`flex items-center whitespace-nowrap py-3.5 transition-colors focus-visible:outline-white sm:py-0 ${
                  active
                    ? "font-medium text-white"
                    : "text-primary-soft hover:text-white"
                }`}
              >
                <span className="sm:hidden">{l.short}</span>
                <span className="hidden sm:inline">{l.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
