"use client";

import { useEffect, useState } from "react";

/**
 * True once `active` has been true for longer than `delayMs`.
 *
 * Both interactive pages wait on a POST to an engine that sleeps on a free tier. A cold start is
 * 30–60 s, which is far longer than a reader will wait on an unexplained skeleton, so after a
 * couple of seconds the page explains itself instead of shimmering silently. The delay is what
 * keeps a warm 4–6 s answer from flashing an explanation nobody needs.
 */
export function useSlowNotice(active: boolean, delayMs = 2500): boolean {
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    if (!active) {
      setSlow(false);
      return;
    }
    const timer = setTimeout(() => setSlow(true), delayMs);
    return () => clearTimeout(timer);
  }, [active, delayMs]);

  return slow;
}
