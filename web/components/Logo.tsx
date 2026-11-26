import Image from "next/image";

/**
 * Brandkit lockup (`public/images/`: `imbere-lockup.png` for light surfaces,
 * `imbere-lockup-light.png` reversed for navy — both written by
 * `scripts/make_icons.py` from the triangle mark + the wordmark donor, so the
 * typography is never redrawn). `tone="dark"` is the footer variant;
 * `tone="light"` is the navy-header variant, set directly on the blue with no
 * plate behind it.
 */
export function Logo({
  className = "",
  tone = "dark",
  size = "default",
}: {
  className?: string;
  tone?: "dark" | "light";
  /** `large` is the header lockup; the footer keeps the default. */
  size?: "default" | "large";
}) {
  const light = tone === "light";
  const scale = size === "large" ? "h-12 w-auto sm:h-14" : "h-10 w-auto sm:h-11";
  return (
    <span className={`flex items-center ${className}`.trim()}>
      <Image
        src={light ? "/images/imbere-lockup-light.png" : "/images/imbere-lockup.png"}
        alt="IMBERE Data — Insights Today. A Prosperous Rwanda."
        width={1774}
        height={887}
        className={scale}
        priority
      />
    </span>
  );
}
