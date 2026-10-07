import { cn } from "@/lib/cn";

export function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex min-h-20 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground transition-colors outline-none",
        "placeholder:text-muted focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30",
        "aria-invalid:border-rose-400 aria-invalid:focus-visible:ring-rose-500/30",
        className,
      )}
      {...props}
    />
  );
}
