import { CountUp } from "@/components/Motion";

/**
 * One total on the left, a bracket, and its two parts on the right.
 *
 * The connector is drawn with CSS borders rather than SVG so it stays attached when the cards
 * reflow: there is no viewBox to distort and no measurement to redo on resize. The geometry
 * leans on one invariant — the branch column is an even two-row grid, so its row centres sit at
 * exactly 25% and 75% of the column height, which is where the spine and its stubs are drawn.
 * The stacked layout uses the same trick sideways: two even columns put their centres at 25%
 * and 75% across.
 *
 * Two branches is deliberate: the component renders a partition, so it must not be used for
 * overlapping categories. `total` should equal the sum of `branches`.
 *
 * `stacked` forces the narrow arrangement (total on top, branches below) at every width, for
 * placements that are tall rather than wide — the hero's right-hand column, for instance.
 * `inverted` is the variant for the deep blue band.
 */
export function BranchDiagram({
  total,
  branches,
  stacked = false,
  inverted = false,
}: {
  total: { value: number | null; label: string };
  branches: [
    { value: number | null; label: string },
    { value: number | null; label: string },
  ];
  stacked?: boolean;
  inverted?: boolean;
}) {
  const line = inverted ? "bg-white/45" : "bg-ink/20";
  const dot = inverted ? "bg-white" : "bg-primary";

  return (
    <div
      className={
        stacked
          ? "flex flex-col"
          : "grid sm:grid-cols-[minmax(0,1fr)_56px_minmax(0,1fr)]"
      }
    >
      <div className={stacked ? "mx-auto w-full max-w-[360px]" : "flex sm:items-center"}>
        <Card
          value={total.value}
          label={total.label}
          emphasis
          inverted={inverted}
          stacked={stacked}
        />
      </div>

      {/* Fork used when the total sits above the branches. Curves, not a right-angle bracket:
          a horizontal rail reads as a separator, while a line that leaves the total downwards
          and arrives at each branch downwards reads as a split. */}
      {stacked ? (
        <div aria-hidden="true" className="relative h-14 sm:h-20">
          <svg
            className={`absolute inset-0 h-full w-full ${inverted ? "text-white/45" : "text-ink/20"}`}
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            focusable="false"
          >
            <path
              d="M50 0 V38"
              stroke="currentColor"
              strokeWidth={1}
              fill="none"
              vectorEffect="non-scaling-stroke"
            />
            <path
              d="M50 38 C50 78, 25 60, 25 100"
              stroke="currentColor"
              strokeWidth={1}
              fill="none"
              vectorEffect="non-scaling-stroke"
            />
            <path
              d="M50 38 C50 78, 75 60, 75 100"
              stroke="currentColor"
              strokeWidth={1}
              fill="none"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
          <span
            className={`absolute left-1/2 top-[38%] h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full ${dot}`}
          />
        </div>
      ) : (
        <div aria-hidden="true" className="relative h-8 sm:hidden">
          <span className={`absolute left-1/2 top-0 h-4 w-px ${line}`} />
          <span className={`absolute left-1/4 right-1/4 top-4 h-px ${line}`} />
          <span className={`absolute left-1/4 top-4 h-4 w-px ${line}`} />
          <span className={`absolute right-1/4 top-4 h-4 w-px ${line}`} />
          <span
            className={`absolute left-1/2 top-4 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full ${dot}`}
          />
        </div>
      )}

      {/* Bracket used when the total sits to the left of the branches. */}
      {!stacked && (
        <div aria-hidden="true" className="relative hidden sm:block">
          <span className={`absolute left-0 top-1/2 h-px w-1/2 ${line}`} />
          <span className={`absolute left-1/2 top-1/4 h-1/2 w-px ${line}`} />
          <span className={`absolute left-1/2 top-1/4 h-px w-1/2 ${line}`} />
          <span className={`absolute left-1/2 top-3/4 h-px w-1/2 ${line}`} />
          <span
            className={`absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full ${dot}`}
          />
        </div>
      )}

      <div className={stacked ? "grid grid-cols-2" : "grid grid-cols-2 sm:grid-cols-1 sm:grid-rows-2"}>
        {branches.map((branch) => (
          <div
            key={branch.label}
            className={
              stacked
                ? "flex items-stretch px-1.5"
                : "flex items-center px-1.5 sm:px-0 sm:py-2"
            }
          >
            <Card
              value={branch.value}
              label={branch.label}
              inverted={inverted}
              stacked={stacked}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function Card({
  value,
  label,
  emphasis = false,
  inverted = false,
  stacked = false,
}: {
  value: number | null;
  label: string;
  emphasis?: boolean;
  inverted?: boolean;
  stacked?: boolean;
}) {
  const size = emphasis
    ? stacked
      ? "text-[36px] sm:text-[40px] lg:text-[46px] xl:text-[54px]"
      : "text-[40px] sm:text-[52px]"
    : stacked
      ? "text-[24px] sm:text-[26px] lg:text-[30px] xl:text-[34px]"
      : "text-[28px] sm:text-[32px]";

  return (
    <div
      className={`w-full rounded-lg border px-4 py-4 sm:px-5 sm:py-5 ${
        inverted ? "border-white/15 bg-white/5" : "border-line bg-surface"
      }`}
    >
      <div
        className={`tnum font-semibold leading-none tracking-[-0.03em] ${
          inverted ? "text-white" : "text-ink"
        } ${size}`}
      >
        {value == null ? (
          "—"
        ) : (
          <CountUp value={value} suffix={<span className="pct-sign">%</span>} />
        )}
      </div>
      <div
        className={`mt-2 text-[13px] leading-snug ${
          inverted ? "text-primary-soft" : "text-ink-soft"
        }`}
      >
        {label}
      </div>
    </div>
  );
}
