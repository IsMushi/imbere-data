"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { MENU } from "@/content/home";

/**
 * Deep-blue bar, the same surface as the overview hero, so the two read as one band
 * rather than a paper strip sitting above a colour panel.
 */
export function Nav() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 bg-primary-deep">
      {/* Two rows below `sm`: the mark, then the section strip. The action sits at the end of
          the row from `sm` up; on a phone the hero's own button is the primary action and a
          second one in the bar would crowd the wordmark. The link name stays the full label
          even where the short form is visible. */}
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
          {MENU.items.map((l) => {
            // An in-page anchor ("/#risk-map") is not a page, so it never claims the current
            // state; Overview owns the landing page.
            const active = l.href.includes("#")
              ? false
              : l.href === "/"
                ? pathname === "/"
                : pathname.startsWith(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                aria-label={l.label}
                aria-current={active ? "page" : undefined}
                className={`flex items-center whitespace-nowrap py-3.5 transition-colors focus-visible:outline-white sm:py-0 ${
                  active ? "font-medium text-white" : "text-primary-soft hover:text-white"
                }`}
              >
                <span className="sm:hidden">{l.short}</span>
                <span className="hidden sm:inline">{l.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="hidden items-center sm:flex">
          <Button asChild className="bg-white text-primary-deep hover:bg-primary-soft">
            <Link href="/simulator">{MENU.cta}</Link>
          </Button>
        </div>
      </div>
    </header>
  );
}
