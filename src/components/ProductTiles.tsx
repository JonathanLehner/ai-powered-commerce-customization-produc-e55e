import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * The one product tile the shop grid, the storefront's product sections and
 * the gift portal catalogue all render.
 *
 * Every tile is cropped to the store's product image shape (`--sf-product-ratio`,
 * portrait unless the store chose otherwise), so a row of them lines up whatever
 * shape the mockups are, and the price is tabular so a column of prices lines
 * up too. Hovering shows the second photo when there is one; nothing moves the
 * text.
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
        "grid grid-cols-2 gap-x-3 gap-y-8 sm:gap-x-5 sm:gap-y-10",
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
  secondImageUrl,
  imageAlt,
  placeholder,
  priority = false,
  columns = 3,
  swatches,
  action,
  as: Item = "li",
  className,
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
  /** Shown on hover, where the pointer can hover. */
  secondImageUrl?: string | null;
  imageAlt: string;
  /** What to say in the frame when the product has no mockup yet. */
  placeholder: string;
  priority?: boolean;
  columns?: 2 | 3 | 4;
  /** The colours the product comes in, as small dots. */
  swatches?: { name: string; hex: string }[];
  /** Quick add, under the card's link. */
  action?: ReactNode;
  as?: "li" | "div";
  className?: string;
}) {
  const sizes =
    columns === 4
      ? "(min-width: 1024px) 300px, 46vw"
      : columns === 2
        ? "(min-width: 640px) 48vw, 46vw"
        : "(min-width: 1024px) 380px, 46vw";

  const body = (
    <>
      <div
        className="relative overflow-hidden rounded-[var(--radius)] bg-muted"
        style={{ aspectRatio: "var(--sf-product-ratio, 4 / 5)" }}
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
            className={cn(
              "sf-motion h-full w-full object-cover transition-[transform,opacity] duration-500 ease-out",
              secondImageUrl ? "[@media(hover:hover)]:group-hover:opacity-0" : "group-hover:scale-[1.03]",
            )}
          />
        ) : (
          <span className="absolute inset-0 flex items-center justify-center px-4 text-center text-xs text-muted-foreground">
            {placeholder}
          </span>
        )}
        {secondImageUrl ? (
          <Image
            src={secondImageUrl}
            alt=""
            width={720}
            height={900}
            loading="lazy"
            sizes={sizes}
            className="sf-motion absolute inset-0 h-full w-full object-cover opacity-0 transition-opacity duration-500 ease-out [@media(hover:hover)]:group-hover:opacity-100"
          />
        ) : null}
        {badge ? <span className="absolute top-2.5 left-2.5 flex flex-wrap gap-1">{badge}</span> : null}
      </div>

      <div className="mt-3 flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
        <h3 className="min-w-0 text-sm leading-snug font-medium text-foreground">{name}</h3>
        {price ? <p className="shrink-0 text-sm font-medium tabular-nums text-foreground">{price}</p> : null}
      </div>
      {tagline ? <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{tagline}</p> : null}
      {meta ? <p className="mt-1 text-xs text-muted-foreground">{meta}</p> : null}
    </>
  );

  return (
    <Item className={cn("group", className)}>
      {href ? (
        <Link href={href} className="block rounded-sm outline-offset-4 focus-visible:outline-2 focus-visible:outline-ring">
          {body}
        </Link>
      ) : (
        body
      )}
      {swatches && swatches.length > 1 ? (
        <ul className="mt-2 flex items-center gap-1.5" aria-label={swatches.map((s) => s.name).join(", ")}>
          {swatches.slice(0, 5).map((swatch) => (
            <li
              key={swatch.name}
              title={swatch.name}
              className="size-3.5 rounded-full border border-foreground/20"
              style={{ background: swatch.hex }}
            />
          ))}
          {swatches.length > 5 ? <li className="text-[11px] text-muted-foreground">+{swatches.length - 5}</li> : null}
        </ul>
      ) : null}
      {action}
    </Item>
  );
}
