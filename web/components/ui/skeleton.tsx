import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Placeholder block for a value that is still loading. Decorative by design: the
 * surrounding panel carries `role="status"` and the loading copy, so screen
 * readers are not read a pile of empty boxes.
 */
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden
      className={cn(
        "animate-pulse rounded-[1px] bg-line/80 motion-reduce:animate-none",
        className,
      )}
      {...props}
    />
  );
}

export { Skeleton };
