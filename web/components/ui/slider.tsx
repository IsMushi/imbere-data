"use client";

import * as React from "react";
import * as SliderPrimitive from "@radix-ui/react-slider";

import { cn } from "@/lib/utils";

function Slider({
  className,
  defaultValue,
  value,
  min = 0,
  max = 100,
  valueText,
  thumbLabel,
  ...props
}: React.ComponentProps<typeof SliderPrimitive.Root> & {
  /** Read out instead of the raw number, e.g. "RWF 300m". Applied to each thumb. */
  valueText?: string;
  /** Accessible name for the thumb, which is the element with role="slider". */
  thumbLabel?: string;
}) {
  const values = React.useMemo(
    () => (Array.isArray(value) ? value : Array.isArray(defaultValue) ? defaultValue : [min]),
    [value, defaultValue, min],
  );

  return (
    <SliderPrimitive.Root
      data-slot="slider"
      defaultValue={defaultValue}
      value={value}
      min={min}
      max={max}
      className={cn(
        "relative flex w-full touch-none items-center select-none data-[disabled]:opacity-50",
        className,
      )}
      {...props}
    >
      <SliderPrimitive.Track
        data-slot="slider-track"
        className="relative h-[6px] w-full grow overflow-hidden rounded-full bg-line"
      >
        <SliderPrimitive.Range
          data-slot="slider-range"
          className="absolute h-full bg-primary"
        />
      </SliderPrimitive.Track>
      {values.map((_, index) => (
        <SliderPrimitive.Thumb
          data-slot="slider-thumb"
          key={index}
          aria-label={thumbLabel}
          aria-valuetext={valueText}
          className={cn(
            "block size-4 shrink-0 rounded-full border-[2.5px] border-primary bg-surface shadow-[0_1px_3px_rgba(13,35,67,0.25)] transition-[box-shadow,border-color]",
            "outline-none after:absolute after:-inset-2.5 after:content-['']",
            "hover:border-primary-deep focus-visible:border-primary-deep focus-visible:ring-4 focus-visible:ring-primary/20",
            "disabled:pointer-events-none",
          )}
        />
      ))}
    </SliderPrimitive.Root>
  );
}

export { Slider };
