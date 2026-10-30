/**
 * Three ascending columns on a shared baseline — access, savings, resilience, and a nod to
 * "imbere" (forward). Vertical, because horizontal bars at this size read as a hamburger menu.
 * Flat feet on one baseline make it a chart rather than three floating pills; brightness
 * steps 70 → 85 → 100 carry the hierarchy that the brand orange cannot (#c95100 on the navy
 * header is barely 2:1 and would look like a smudge). The 70 floor matches the favicon: at
 * 55 the shortest column washed out against navy at tab size.
 *
 * The lockup inherits `currentColor`, so the surface decides the tone: the navy header passes
 * `text-white`, the paper footer passes `text-primary-deep`. No chip or plate is needed, and
 * the mark never carries a background of its own.
 */
export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`flex items-center gap-3 ${className}`.trim()}>
      <svg
        aria-hidden
        viewBox="0 0 24 24"
        className="h-6 w-6 shrink-0"
        fill="none"
        focusable="false"
      >
        <path d="M0 22V16.5A2.5 2.5 0 0 1 5 16.5V22Z" className="fill-current opacity-[0.7]" />
        <path d="M9.5 22V10.5A2.5 2.5 0 0 1 14.5 10.5V22Z" className="fill-current opacity-[0.85]" />
        <path d="M19 22V4.5A2.5 2.5 0 0 1 24 4.5V22Z" className="fill-current" />
      </svg>
      {/* Wordmark in Comfortaa, so the name speaks in the same face as the hero and section
          figures rather than the UI text face. "IMBERE" stays all caps and "Data" is title case
          at black weight, which is the only weight contrast the lockup needs. */}
      <span className="display text-[19.5px] leading-none">
        IMBERE <span className="font-black">Data</span>
      </span>
    </span>
  );
}
