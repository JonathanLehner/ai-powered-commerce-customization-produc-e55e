import { StarIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/** A rating out of five as stars. The label is read out instead of the drawing. */
export function Stars({ rating, label, className }: { rating: number; label: string; className?: string }) {
  return (
    <span role="img" aria-label={label} className={cn("inline-flex items-center gap-0.5", className)}>
      {[1, 2, 3, 4, 5].map((star) => (
        <StarIcon
          key={star}
          aria-hidden
          className={cn(
            "size-4",
            star <= Math.round(rating) ? "fill-amber-400 text-amber-400" : "fill-transparent text-muted-foreground/40",
          )}
        />
      ))}
    </span>
  );
}
