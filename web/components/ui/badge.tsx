import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex w-fit items-center gap-1.5 rounded-sm border px-2 py-[3px] text-[12px] font-medium uppercase tracking-[0.12em] whitespace-nowrap transition-colors [&_svg]:pointer-events-none",
  {
    variants: {
      variant: {
        outline: "border-line bg-transparent text-ink-soft",
        real: "border-transparent bg-primary-soft text-primary-deep",
        modelled: "border-transparent bg-[#f9e6dc] text-accent",
        warn: "border-transparent bg-[#fdece2] text-[#a84300]",
        destructive: "border-transparent bg-destructive text-white",
      },
    },
    defaultVariants: { variant: "outline" },
  },
);

function Badge({
  className,
  variant,
  asChild = false,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "span";
  return (
    <Comp data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
