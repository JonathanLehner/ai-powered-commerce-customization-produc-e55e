import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { classNames } from "@/lib/util";

/** The 4:5 portrait crop every product image on a storefront is shown in. */
export const PRODUCT_RATIO = "4 / 5";

/**
 * One product in a grid, wherever that grid appears: the published storefront,
 * the storefront editor's canvas, `/products` and a gift catalogue.
 *
 * The image is the card. There is no border and no shadow — the crop, the
 * consistent ratio and the tabular price carry the layout — and the hover is a
 * slow, small scale inside the frame plus a hairline ring, so a grid of twelve
 * products does not flicker as the pointer crosses it.
 */
export function ProductCard({
  href,
  name,
  price,
  tagline,
  imageUrl,
  placeholder,
  badge,
  footnote,
  eager = false,
  sizes = "(min-width: 1024px) 300px, (min-width: 640px) 45vw, 92vw",
}: {
  href: string;
  name: string;
  /** Already formatted for the shop's language and currency. */
  price: ReactNode;
  tagline?: string;
  imageUrl: string | null;
  /** Shown in place of a photograph the store has not generated yet. */
  placeholder: string;
  badge?: ReactNode;
  footnote?: ReactNode;
  /** Only the first row of the first grid on a page should load eagerly. */
  eager?: boolean;
  sizes?: string;
}) {
  return (
    <Link href={href} className="group block focus-visible:outline-none">
      <div
        className="relative overflow-hidden rounded-card bg-secondary ring-1 ring-line transition group-hover:ring-ink/20 group-focus-visible:ring-2 group-focus-visible:ring-ring"
        style={{ aspectRatio: PRODUCT_RATIO }}
      >
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt={name}
            fill
            priority={eager}
            loading={eager ? "eager" : "lazy"}
            sizes={sizes}
            className="object-cover transition-transform duration-500 ease-out group-hover:scale-[1.03] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
          />
        ) : (
          <span className="absolute inset-0 flex items-center justify-center px-4 text-center text-xs text-muted">
            {placeholder}
          </span>
        )}
        {badge ? <span className="absolute top-3 left-3">{badge}</span> : null}
      </div>

      <div className="mt-3 flex items-start justify-between gap-3">
        <h3 className="text-sm leading-snug font-medium text-ink group-hover:underline group-hover:decoration-ink/25 group-hover:underline-offset-4">
          {name}
        </h3>
        <p className="shrink-0 text-sm font-medium tabular-nums text-ink">{price}</p>
      </div>
      {tagline ? <p className="mt-1 line-clamp-1 text-xs text-muted">{tagline}</p> : null}
      {footnote ? <p className={classNames("text-xs text-muted", tagline ? "mt-0.5" : "mt-1")}>{footnote}</p> : null}
    </Link>
  );
}
