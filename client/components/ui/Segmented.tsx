"use client";

import { cn } from "@/lib/utils";

interface SegmentedProps<T extends string> {
  label: string;
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}

/** A few options of which one is chosen, side by side. */
const Segmented = <T extends string>({ label, options, value, onChange, className }: SegmentedProps<T>) => (
  <div role="group" aria-label={label} className={cn("flex shrink-0 rounded-md border border-border bg-background p-0.5", className)}>
    {options.map((option) => (
      <button
        key={option.value}
        type="button"
        aria-pressed={value === option.value}
        onClick={() => value !== option.value && onChange(option.value)}
        className={cn(
          "cursor-pointer rounded px-2.5 py-1 text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
          value === option.value ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:text-foreground"
        )}
      >
        {option.label}
      </button>
    ))}
  </div>
);

export default Segmented;
