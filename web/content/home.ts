/**
 * All editable wording for the landing page and the top menu, in one place. Change a string
 * here and it updates wherever it is used; no numbers live in this file.
 */
export const HERO = {
  headline: "Having a bank account is not the same as being safe.",
  body: "MINALOC and LODA pick a targeting rule every time social-protection money is spent. IMBERE puts five rules on one budget: who reaches the poorest households, how much leaks to the non-poor, and what each poor household reached actually costs.",
  // Rendered only when /api/targeting answers; {ratio} is filled from the response, so the figure
  // cannot go stale and no number is typed into this file.
  consequence:
    "On the default budget the proxy-means rule reaches {ratio}× more poor households than universal coverage.",
  branch: {
    total: "Financially included adults",
    formal: "Use at least one formal financial service",
    informal: "Use only informal mechanisms",
  },
  // The second hero slide: the inclusion rate, then what inclusion did not buy.
  slide: {
    included: "are financially included. But",
    vulnerable: "remain financially vulnerable, and",
    poverty: "live below the poverty line.",
  },
  primaryCta: "Try the simulator",
  secondaryCta: "See the proof",
  // The tag says "Measured", so this line may only claim what is actually published. The
  // household layer is synthetic and says so here, above the fold, before anyone asks.
  trust: "Published NISR figures: EICV7 and FinScope 2024. Household rows are calibrated synthetic.",
};

export const MENU = {
  cta: "Try the simulator",
  items: [
    { href: "/", label: "Overview", short: "Overview" },
    { href: "/#risk-map", label: "Risk map", short: "Map" },
    { href: "/simulator", label: "Shock test", short: "Shock" },
    { href: "/targeting", label: "Who to help", short: "Who" },
    { href: "/proof", label: "Proof", short: "Proof" },
    { href: "/methodology", label: "How it works", short: "How" },
  ],
};
