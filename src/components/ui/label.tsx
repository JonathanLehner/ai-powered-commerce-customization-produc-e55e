import { cn } from "@/lib/cn";

export function Label({ className, ...props }: React.ComponentProps<"label">) {
  return (
    <label
      data-slot="label"
      className={cn("block text-sm font-medium text-foreground", className)}
      {...props}
    />
  );
}
