import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "border border-transparent bg-primary text-primary-foreground hover:bg-primary-deep",
        outline:
          "border border-line bg-surface text-ink hover:border-primary hover:text-primary-deep",
        secondary:
          "border border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/60",
        ghost: "border border-transparent text-ink-soft hover:bg-hover hover:text-hover-foreground",
        link: "text-primary-deep underline decoration-primary/30 underline-offset-2 hover:decoration-primary",
        destructive: "border border-transparent bg-destructive text-white hover:bg-destructive/90",
      },
      size: {
        default: "h-9 px-3.5 text-[15.5px]",
        sm: "h-8 px-3 text-[15px]",
        lg: "h-10 px-5 text-[16px]",
        icon: "size-9",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps
  extends React.ComponentProps<"button">,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

function Button({ className, variant, size, asChild = false, ...props }: ButtonProps) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}

export { Button, buttonVariants };
