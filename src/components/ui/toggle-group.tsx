"use client";

import * as ToggleGroupPrimitive from "@radix-ui/react-toggle-group";
import { cn } from "@/lib/cn";

export function ToggleGroup({
  className,
  ...props
}: React.ComponentProps<typeof ToggleGroupPrimitive.Root>) {
  return (
    <ToggleGroupPrimitive.Root
      data-slot="toggle-group"
      className={cn("flex flex-wrap items-center gap-2", className)}
      {...props}
    />
  );
}

/**
 * A chip. `aria-pressed` is not what a radio-style toggle group publishes —
 * Radix marks the chosen item with `data-state="on"` and `aria-checked` — so the
 * selected styling is driven off `data-state`.
 */
export function ToggleGroupItem({
  className,
  ...props
}: React.ComponentProps<typeof ToggleGroupPrimitive.Item>) {
  return (
    <ToggleGroupPrimitive.Item
      data-slot="toggle-group-item"
      className={cn(
        "inline-flex min-w-11 items-center justify-center gap-2 rounded-lg border border-border bg-background px-3.5 py-2 text-sm text-foreground transition-colors",
        "hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none",
        "data-[state=on]:border-primary data-[state=on]:bg-accent data-[state=on]:font-medium data-[state=on]:text-accent-foreground",
        "disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-background",
        className,
      )}
      {...props}
    />
  );
}
