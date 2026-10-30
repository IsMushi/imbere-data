import type { ReactNode } from "react";

/**
 * Three interpretive sentences under the national ledger.
 *
 * Deliberately prose, not more figures: the ledger above already carries the national
 * totals, so this row adds the reading and nothing else. Each item is one kicker plus
 * one sentence, separated by the same hairline the rest of the page uses.
 */
export function Findings({
  items,
}: {
  items: { kicker: string; children: ReactNode }[];
}) {
  return (
    <div className="grid gap-x-10 gap-y-6 border-t border-line pt-6 sm:grid-cols-3">
      {items.map((item) => (
        <div key={item.kicker}>
          <div className="label">{item.kicker}</div>
          <p className="mt-2 text-[17px] leading-[1.55] text-ink">{item.children}</p>
        </div>
      ))}
    </div>
  );
}
