import { CheckIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * One vertical rhythm for every marketing section, so the public pages space
 * alike however they are composed: the band owns the padding and the optional
 * tint, the inner column owns the measure.
 *
 * `tone="muted"` is the alternating band. Two of them never sit next to each
 * other, so the hairline it draws cannot double up.
 */
export function Section({
  id,
  tone = "plain",
  width = "wide",
  className,
  children,
}: {
  id?: string;
  tone?: "plain" | "muted";
  width?: "wide" | "prose";
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      className={cn(tone === "muted" && "border-y border-border bg-muted", id && "scroll-mt-20")}
    >
      <div
        className={cn(
          "mx-auto w-full px-4 py-14 sm:px-6 sm:py-20",
          width === "wide" ? "max-w-6xl" : "max-w-4xl",
          className,
        )}
      >
        {children}
      </div>
    </section>
  );
}

/** The heading of a section, and the one line that can sit under it. */
export function SectionHeading({
  children,
  lead,
  className,
}: {
  children: React.ReactNode;
  lead?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("max-w-2xl", className)}>
      <h2 className="font-heading text-2xl font-semibold tracking-tight text-balance text-foreground sm:text-3xl">
        {children}
      </h2>
      {lead ? <p className="mt-3 text-base leading-relaxed text-muted-foreground">{lead}</p> : null}
    </div>
  );
}

/**
 * A feature list. The tick is the one place the teal accent is spent on body
 * copy, which is what makes the four lists on these pages read as one thing.
 */
export function CheckList({
  items,
  className,
}: {
  items: readonly string[];
  className?: string;
}) {
  return (
    <ul className={cn("space-y-2.5", className)}>
      {items.map((item) => (
        <li key={item} className="flex gap-2.5 text-sm leading-relaxed text-muted-foreground">
          <CheckIcon aria-hidden className="mt-0.5 size-4 shrink-0 text-primary" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}
