"use client";

import { MotionConfig, motion, useReducedMotion, type Variants } from "framer-motion";
import type { CSSProperties, ReactNode } from "react";

/**
 * House motion. IMBERE reads like a statistical annex, so movement is short and small:
 * a panel settles into place instead of performing. `MotionProvider` honours the OS
 * "reduce motion" setting for transform and layout animations; width-based bars ask
 * `useReducedMotion` themselves, since widths are not transforms.
 */
export const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

/** Shared viewport for scroll reveals: fire once, a little before the element centres. */
export const inView = { once: true, margin: "0px 0px -64px 0px" } as const;

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: EASE } },
};

/** Parent variants: children animate one after another when the group enters view. */
export function stagger(step = 0.05, delay = 0): Variants {
  return {
    hidden: {},
    show: { transition: { staggerChildren: step, delayChildren: delay } },
  };
}

export function MotionProvider({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}

/** Reveal a block once, as it scrolls into view. */
export function FadeIn({
  children,
  className,
  delay = 0,
  y = 10,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  y?: number;
}) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={inView}
      transition={{ duration: 0.45, ease: EASE, delay }}
    >
      {children}
    </motion.div>
  );
}

/** Container for `StaggerItem` children. */
export function Stagger({
  children,
  className,
  step = 0.05,
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  step?: number;
  delay?: number;
}) {
  return (
    <motion.div
      className={className}
      initial="hidden"
      whileInView="show"
      viewport={inView}
      variants={stagger(step, delay)}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div className={className} variants={fadeUp}>
      {children}
    </motion.div>
  );
}

/**
 * A bar that grows to `value` percent of its track. Used wherever a figure is encoded
 * as length, so a scenario change reads as movement rather than a jump cut.
 */
export function MotionBar({
  value,
  className,
  style,
  as = "div",
  duration = 0.7,
  delay = 0,
}: {
  /** Percentage of the track to fill, 0–100. */
  value: number;
  className?: string;
  style?: CSSProperties;
  as?: "div" | "span";
  duration?: number;
  delay?: number;
}) {
  const reduced = useReducedMotion();
  const width = `${Math.max(0, Math.min(100, value))}%`;

  if (reduced) {
    const staticStyle = { ...style, width };
    return as === "span" ? (
      <span className={className} style={staticStyle} />
    ) : (
      <div className={className} style={staticStyle} />
    );
  }

  const animated = {
    className,
    style,
    initial: { width: "0%" },
    animate: { width },
    transition: { duration, ease: EASE, delay },
  };

  return as === "span" ? <motion.span {...animated} /> : <motion.div {...animated} />;
}
