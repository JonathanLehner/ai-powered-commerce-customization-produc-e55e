import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * The one product tile the shop grid, the storefront's Product grid section and
 * the gift portal catalogue all render.
 *
 * Every tile is a 4:5 portrait frame — the ratio product photography is cropped
 * to — so a row of them lines up whatever shape the mockups are, and the price
 * is tabular so a column of prices lines up too. The hover is deliberately
 * quiet: the image lifts a little and the frame's hairline darkens, and nothing
 * moves the text.
 */
export function ProductTileGrid({
  columns = 3,
  children,
  className,
}: {
  columns?: 2 | 3 | 4;
  children: ReactNode;
  className?: string;
}) {
  return (
    <ul
      className={cn(
        "grid gap-x-5 gap-y-9 sm:grid-cols-2",
        columns === 4 ? "lg:grid-cols-4" : columns === 3 ? "lg:grid-cols-3" : "",
        className,
      )}
    >
      {children}
    </ul>
  );
}

export function ProductTile({
  href,
  name,
  tagline,
  price,
  badge,
  meta,
  imageUrl,
  imageAlt,
  placeholder,
  priority = false,
  columns = 3,
}: {
  /** Omitted in the gift portal, where a gift has no page of its own. */
  href?: string;
  name: string;
  tagline?: string;
  /** Already formatted in the store's language and currency. */
  price: string | null;
  badge?: ReactNode;
  /** A second, quieter line under the price — sizes, availability. */
  meta?: ReactNode;
  imageUrl: string | null;
  imageAlt: string;
  /** What to say in the frame when the product has no mockup yet. */
  placeholder: string;
  priority?: boolean;
  columns?: 2 | 3 | 4;
}) {
  const sizes =
    columns === 4
      ? "(min-width: 1024px) 300px, (min-width: 640px) 45vw, 92vw"
      : columns === 2
        ? "(min-width: 640px) 48vw, 92vw"
        : "(min-width: 1024px) 380px, (min-width: 640px) 45vw, 92vw";

  const body = (
    <>
      <div
        className="relative overflow-hidden rounded-lg border border-border bg-muted transition-colors group-hover:border-foreground/25"
        style={{ aspectRatio: "4 / 5" }}
      >
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt={imageAlt}
            width={720}
            height={900}
            priority={priority}
            loading={priority ? "eager" : "lazy"}
            sizes={sizes}
            className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.03]"
          />
        ) : (
          <span className="absolute inset-0 flex items-center justify-center px-4 text-center text-xs text-muted-foreground">
            {placeholder}
          </span>
        )}
        {badge ? <span className="absolute top-2.5 left-2.5">{badge}</span> : null}
      </div>

      <div className="mt-3 flex items-baseline justify-between gap-3">
        <h3 className="min-w-0 text-sm font-medium text-foreground">{name}</h3>
        {price ? (
          <p className="shrink-0 text-sm font-medium tabular-nums text-foreground">{price}</p>
        ) : null}
      </div>
      {tagline ? (
        <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{tagline}</p>
      ) : null}
      {meta ? <p className="mt-1 text-xs text-muted-foreground">{meta}</p> : null}
    </>
  );

  return (
    <li className="group">
      {href ? (
        <Link
          href={href}
          className="block rounded-sm outline-offset-4 focus-visible:outline-2 focus-visible:outline-ring"
        >
          {body}
        </Link>
      ) : (
        body
      )}
    </li>
  );
}
