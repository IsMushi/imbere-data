/**
 * All editable wording for the landing page and the top menu, in one place. Change a string
 * here and it updates wherever it is used; no numbers live in this file.
 */
export const HERO = {
  eyebrow: "Financial inclusion & poverty",
  headline: "Having a bank account is not the same as being safe.",
  body: "Almost every Rwandan can use financial services. Still, many families fall into poverty after one bad season. IMBERE shows who needs help first.",
  stats: {
    included: "can use financial services",
    vulnerable: "are financially vulnerable",
    poverty: "live below the poverty line",
  },
  primaryCta: "Try the simulator",
  secondaryCta: "See the proof",
  trust: "Real NISR data: EICV7 and FinScope 2024",
  risk: {
    title: "Highest modelled risk",
    badge: "Estimate",
    loading: "Loading district risk…",
    published: "published poverty",
    note: "Mean predicted poverty risk from the proxy-means model. The published rate beside each district is EICV7 2023/24.",
  },
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
