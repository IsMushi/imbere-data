export const nf = new Intl.NumberFormat("en-US");

export function num(n: number | null | undefined, digits = 0): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(n);
}

export function pct(n: number | null | undefined, digits = 1): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return `${n.toFixed(digits)}%`;
}

export function signed(n: number, digits = 1): string {
  const s = n > 0 ? "+" : "";
  return `${s}${n.toFixed(digits)}`;
}

/** Compact RWF so a billion-franc figure stays readable on a card. */
export function rwf(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  if (Math.abs(n) >= 1e9) return `RWF ${(n / 1e9).toFixed(1)}bn`;
  if (Math.abs(n) >= 1e6) return `RWF ${(n / 1e6).toFixed(1)}m`;
  if (Math.abs(n) >= 1e3) return `RWF ${(n / 1e3).toFixed(0)}k`;
  return `RWF ${nf.format(Math.round(n))}`;
}

/**
 * The same figure without the currency prefix, for a display cell whose label already
 * names the unit — "RWF 18.5bn" is too wide for a quarter-width ledger cell and wraps.
 */
export function rwfValue(n: number | null | undefined): string {
  return rwf(n).replace(/^RWF /, "");
}

export function compact(n: number): string {
  if (Math.abs(n) >= 1e6) return `${(n / 1e6).toFixed(1)}m`;
  if (Math.abs(n) >= 1e4) return `${(n / 1e3).toFixed(1)}k`;
  if (Math.abs(n) >= 1e3) return `${(n / 1e3).toFixed(1)}k`;
  return nf.format(Math.round(n));
}
