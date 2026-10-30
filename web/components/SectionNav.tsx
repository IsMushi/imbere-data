"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Sticky "on this page" bar for long reference pages.
 *
 * A methodology page runs several screens deep, so the section list has to stay reachable
 * and has to say where you are. Pass a module-level constant as `items` — the scroll
 * listener is keyed on that array, and a fresh array per render would rebind it each time.
 *
 * Below `sm` the list is one scrolling row rather than a wrapped block: six anchors stacked
 * three deep turned a 44px bar into a 90px lid over the text it was meant to navigate.
 */
export function SectionNav({ items }: { items: { href: string; label: string }[] }) {
  const [active, setActive] = useState(items[0]?.href ?? "");
  const nav = useRef<HTMLElement | null>(null);
  const links = useRef(new Map<string, HTMLAnchorElement>());

  useEffect(() => {
    const onScroll = () => {
      // The active section is the last one whose top has passed under this bar, so the
      // cutoff is measured from the bar itself instead of guessed per breakpoint.
      const cutoff = (nav.current?.getBoundingClientRect().bottom ?? 0) + 8;
      let current = items[0]?.href ?? "";
      for (const item of items) {
        const el = document.getElementById(item.href.slice(1));
        if (el && el.getBoundingClientRect().top <= cutoff) current = item.href;
      }
      setActive(current);
    };

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [items]);

  // Keep the current section visible in the mobile scroller. Only the horizontal axis is
  // touched, so a section change never drags the page vertically.
  useEffect(() => {
    const scroller = nav.current;
    const link = links.current.get(active);
    if (!scroller || !link || scroller.scrollWidth <= scroller.clientWidth + 1) return;
    const target = link.offsetLeft - scroller.clientWidth / 2 + link.offsetWidth / 2;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    scroller.scrollTo({ left: Math.max(0, target), behavior: reduce ? "auto" : "smooth" });
  }, [active]);

  return (
    <nav
      ref={nav}
      aria-label="On this page"
      // Two header rows below `sm`, one 76px row above it, so the bar parks under both.
      className="sticky top-[104px] z-30 mt-8 overflow-x-auto border-y border-line bg-paper/95 text-[14px] backdrop-blur [scrollbar-width:none] sm:top-[76px] sm:overflow-x-visible [&::-webkit-scrollbar]:hidden"
    >
      <div className="flex gap-x-5 py-2.5 sm:flex-wrap sm:gap-y-1">
        {items.map((item) => {
          const isActive = active === item.href;
          return (
            <a
              key={item.href}
              ref={(el) => {
                if (el) links.current.set(item.href, el);
                else links.current.delete(item.href);
              }}
              href={item.href}
              aria-current={isActive ? "true" : undefined}
              className={`shrink-0 whitespace-nowrap border-b-2 pb-1 transition-colors ${
                isActive
                  ? "border-primary font-medium text-primary-deep"
                  : "border-transparent text-ink-soft hover:text-primary-deep"
              }`}
            >
              {item.label}
            </a>
          );
        })}
      </div>
    </nav>
  );
}
