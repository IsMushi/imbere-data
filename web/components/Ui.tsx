"use client";

import type { ReactNode } from "react";
import { motion } from "framer-motion";

import { EASE, inView } from "@/components/Motion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { TableCell, TableRow } from "@/components/ui/table";

/**
 * Ledger cell. Deliberately not a card: figures sit in a band separated by hairlines,
 * the way a statistical annex presents a summary table.
 */
export function Kpi({
  label,
  value,
  note,
  tone = "default",
}: {
  label: string;
  value: ReactNode;
  note?: ReactNode;
  tone?: "default" | "accent" | "primary";
}) {
  const valueTone =
    tone === "accent"
      ? "text-accent"
      : tone === "primary"
        ? "text-primary-deep"
        : "text-ink";

  return (
    <div className="relative flex flex-col justify-between gap-3 px-5 py-6 sm:px-6">
      <span className={`tnum text-[clamp(32px,4vw,40px)] font-semibold leading-[0.95] tracking-[-0.03em] ${valueTone}`}>
        {value}
      </span>
      <div className="flex flex-col gap-1">
        <span className="text-[13.5px] font-medium leading-tight text-ink">{label}</span>
        {note ? (
          <span className="text-[12.5px] leading-snug text-ink-soft">{note}</span>
        ) : null}
      </div>
    </div>
  );
}

/**
 * A band of ledger cells. Hairlines only, no boxes: `sm` breaks to two columns,
 * `lg` to four. Static on purpose — the figures are what the reader came for, so they
 * are on screen immediately rather than settling into place.
 */
export function Ledger({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-2 divide-x divide-y divide-line/70 overflow-hidden rounded-xl border border-line bg-surface shadow-[0_1px_2px_rgba(13,35,67,0.05),0_10px_30px_-12px_rgba(13,35,67,0.12)] sm:grid-cols-2 lg:grid-cols-4 lg:divide-y-0">
      {children}
    </div>
  );
}

/**
 * Ledger cell placeholder. Same box model as `Kpi`, including the two-line label
 * reserve, so the band does not jump when the figures land.
 */
export function SkeletonKpi() {
  return (
    <div className="relative flex flex-col justify-between gap-3 px-5 py-6 sm:px-6">
      <Skeleton className="h-[36px] w-24" />
      <div className="flex flex-col gap-1">
        <Skeleton className="h-[13px] w-24" />
        <Skeleton className="h-[12px] w-36" />
      </div>
    </div>
  );
}

/** Bar-list placeholder: label and value line, track, optional note line. */
export function SkeletonBars({ rows = 5, note = false }: { rows?: number; note?: boolean }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i}>
          <div className="flex items-baseline justify-between gap-3">
            <Skeleton className="h-[11px]" style={{ width: `${60 - (i % 3) * 10}%` }} />
            <Skeleton className="h-[11px] w-10" />
          </div>
          <Skeleton className="mt-1.5 h-[5px] w-full" />
          {note ? <Skeleton className="mt-1.5 h-[9px] w-1/3" /> : null}
        </div>
      ))}
    </div>
  );
}

/** Body rows for a table that is still loading. Keep the real header so columns stay put. */
export function SkeletonTableRows({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <>
      {Array.from({ length: rows }, (_, r) => (
        <TableRow key={r}>
          {Array.from({ length: cols }, (_, c) => (
            <TableCell key={c} className="py-3">
              <Skeleton className={c === 0 ? "h-[12px] w-40" : "ml-auto h-[12px] w-12"} />
            </TableCell>
          ))}
        </TableRow>
      ))}
    </>
  );
}

export function SectionHeading({
  module,
  title,
  children,
}: {
  /** Two-digit module number, e.g. "02". Omitted on the overview page. */
  module?: string;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="mb-5">
      {module ? (
        <div className="flex items-baseline gap-2">
          <span className="tnum text-[14px] font-semibold text-primary">{module}</span>
          <span className="h-px w-6 bg-primary/40" aria-hidden />
        </div>
      ) : null}
      <h2 className="display-sm mt-1.5 text-[26px] leading-[1.18]">{title}</h2>
      {children ? (
        <p className="mt-2 max-w-[62ch] text-[17.5px] leading-relaxed text-ink-soft">{children}</p>
      ) : null}
    </div>
  );
}

const TAG_VARIANT = {
  neutral: "outline",
  real: "real",
  modelled: "modelled",
  warn: "warn",
} as const;

export function Tag({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: keyof typeof TAG_VARIANT;
  /** On dark surfaces the ink-filled variants need an override; `cn` lets it win. */
  className?: string;
}) {
  return (
    <Badge variant={TAG_VARIANT[tone]} className={className}>
      {children}
    </Badge>
  );
}

/**
 * Panel-level provenance line. Every panel on the site carries one: the reader
 * must always be able to tell a published figure from a modelled one.
 */
export function SourceNote({
  kind,
  children,
}: {
  kind: "measured" | "modelled" | "assumed";
  children: ReactNode;
}) {
  const dot =
    kind === "measured" ? "bg-primary" : kind === "modelled" ? "bg-accent" : "bg-teal";
  const word =
    kind === "measured" ? "Measured · published" : kind === "modelled" ? "Modelled · illustrative" : "Stated assumption";

  return (
    <p className="mt-4 flex flex-wrap items-baseline gap-x-2 gap-y-1 border-t border-line pt-3 text-[14px] leading-relaxed text-ink-soft">
      <span className="inline-flex items-center gap-1.5 font-medium text-ink">
        <span className={`h-1.5 w-1.5 rounded-full ${dot}`} aria-hidden />
        {word}
      </span>
      <span className="min-w-0">{children}</span>
    </p>
  );
}

/** Serif pull-quote used for the one argument each page is making. */
export function PullQuote({ label, children }: { label: string; children: ReactNode }) {
  return (
    <motion.div
      className="border-l-2 border-primary pl-5"
      initial={{ opacity: 0, y: 10 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={inView}
      transition={{ duration: 0.5, ease: EASE }}
    >
      <div className="label text-primary-deep">{label}</div>
      <p className="display-sm mt-2 max-w-[68ch] text-[20.5px] leading-[1.55] text-ink">{children}</p>
    </motion.div>
  );
}

/** Explicit async state: never leave the reader looking at a blank panel. */
export function PanelState({
  kind,
  children,
  onRetry,
  detail,
}: {
  kind: "loading" | "error" | "empty";
  children: ReactNode;
  onRetry?: () => void;
  /** Second line of an error panel. Defaults to the local-development hint. */
  detail?: ReactNode;
}) {
  return (
    <Card
      className={`items-start gap-4 p-6 sm:p-8 ${
        kind === "error" ? "border-accent/60 bg-accent/5" : kind === "empty" ? "border-line" : ""
      }`}
      role={kind === "error" ? "alert" : "status"}
      aria-live={kind === "error" ? "assertive" : "polite"}
    >
      <div className="flex items-start gap-3">
        {kind === "error" ? (
          <div className="mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-accent/10">
            <svg
              className="h-5 w-5 text-accent"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
        ) : null}
        <div className="flex-1 space-y-1">
          <p
            className={`text-[17px] font-medium leading-relaxed ${
              kind === "error" ? "text-accent" : kind === "empty" ? "text-ink" : "text-ink-soft"
            }`}
          >
            {children}
          </p>
          {kind === "error" ? (
            <p className="text-[15px] leading-relaxed text-ink-soft">
              {detail ?? "Make sure the API server is running and accessible."}
            </p>
          ) : null}
        </div>
      </div>
      {onRetry ? (
        <Button type="button" variant="default" size="sm" onClick={onRetry} className="ml-12">
          Retry connection
        </Button>
      ) : null}
    </Card>
  );
}
