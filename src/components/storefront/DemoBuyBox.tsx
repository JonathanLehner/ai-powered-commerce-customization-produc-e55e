"use client";

import Link from "next/link";
import { useState } from "react";

/**
 * The gallery and buy box of a template's demo product page, laid out the way
 * the template's product page sets them. A demo has no basket, so adding says
 * so instead.
 */
export function DemoBuyBox({
  product,
  layout,
  labels,
}: {
  product: {
    name: string;
    price: string;
    /** Each photo with its prebuilt widths, worked out on the server. */
    images: { src: string; srcSet?: string }[];
    colour: { name: string; hex: string };
    sizes: string[];
    personalise: boolean;
    tags: string[];
  };
  layout: { gallery: "thumbnails" | "grid" | "stacked"; side: "left" | "right"; showTags: boolean; trustNote: string };
  labels: {
    colour: string;
    size: string;
    personalise: string;
    textPlaceholder: string;
    addToBasket: string;
    demoNote: string;
    breadcrumbShop: string;
    shopHref: string;
  };
}) {
  const [active, setActive] = useState(0);
  const [size, setSize] = useState(product.sizes[1] ?? product.sizes[0] ?? "");
  const [tried, setTried] = useState(false);
  const image = ({ src, srcSet }: { src: string; srcSet?: string }, eager: boolean, alt: string) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      srcSet={srcSet}
      sizes="(min-width: 1024px) 50vw, 100vw"
      alt={alt}
      loading={eager ? "eager" : "lazy"}
      className="h-full w-full object-cover"
    />
  );

  const gallery =
    layout.gallery === "thumbnails" ? (
      <div>
        <div className="aspect-square overflow-hidden rounded-[var(--radius)] border border-border bg-muted">
          {product.images[active] ? image(product.images[active], true, product.name) : null}
        </div>
        {product.images.length > 1 ? (
          <div className="mt-3 flex gap-3">
            {product.images.map((src, i) => (
              <button
                key={src.src}
                type="button"
                onClick={() => setActive(i)}
                aria-label={`${product.name} ${i + 1}`}
                aria-pressed={i === active}
                className={`size-20 overflow-hidden rounded-[var(--radius)] border ${i === active ? "border-foreground" : "border-border"}`}
              >
                {image(src, false, "")}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    ) : (
      <div className={layout.gallery === "grid" ? "grid grid-cols-2 gap-3" : "grid gap-3"}>
        {product.images.map((src, i) => (
          <div key={src.src} className="aspect-square overflow-hidden rounded-[var(--radius)] border border-border bg-muted">
            {image(src, i === 0, i === 0 ? product.name : "")}
          </div>
        ))}
      </div>
    );

  return (
    <div className="mt-2">
      <nav aria-label={labels.breadcrumbShop} className="text-sm text-muted-foreground">
        <Link href={labels.shopHref} className="hover:text-foreground hover:underline">
          {labels.breadcrumbShop}
        </Link>
        <span aria-hidden> / </span>
        <span className="text-foreground">{product.name}</span>
      </nav>
      <div className="mt-6 grid gap-10 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:gap-14">
        <div className={layout.side === "right" ? "lg:order-2" : ""}>{gallery}</div>
        <div className="lg:sticky lg:top-24 lg:self-start">
          <h1 className="font-heading text-[clamp(1.8rem,3.4vw,2.6rem)] leading-tight font-semibold tracking-tight text-foreground">{product.name}</h1>
          <p className="mt-3 text-xl font-medium text-foreground">{product.price}</p>
          {layout.showTags && product.tags.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {product.tags.map((tag) => (
                <span key={tag} className="rounded-full border border-border px-2.5 py-0.5 text-xs text-muted-foreground">
                  {tag}
                </span>
              ))}
            </div>
          ) : null}

          <div className="mt-8 space-y-6">
            <div>
              <p className="text-sm font-medium text-foreground">
                {labels.colour}: <span className="font-normal text-muted-foreground">{product.colour.name}</span>
              </p>
              <span
                aria-hidden
                className="mt-2 inline-block size-8 rounded-full border border-border ring-2 ring-foreground ring-offset-2 ring-offset-background"
                style={{ background: product.colour.hex }}
              />
            </div>
            {product.sizes.length > 0 ? (
              <fieldset>
                <legend className="text-sm font-medium text-foreground">{labels.size}</legend>
                <div className="mt-2 flex flex-wrap gap-2">
                  {product.sizes.map((s) => (
                    <button
                      key={s}
                      type="button"
                      aria-pressed={s === size}
                      onClick={() => setSize(s)}
                      className={`h-10 min-w-12 rounded-[var(--radius)] border px-3 text-sm font-medium ${
                        s === size ? "border-foreground bg-foreground text-background" : "border-input text-foreground hover:border-foreground"
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </fieldset>
            ) : null}
            {product.personalise ? (
              <label className="block">
                <span className="text-sm font-medium text-foreground">{labels.personalise}</span>
                <input
                  type="text"
                  maxLength={18}
                  placeholder={labels.textPlaceholder}
                  className="mt-2 h-10 w-full rounded-[var(--radius)] border border-input bg-background px-3 text-sm text-foreground"
                />
              </label>
            ) : null}
            <button type="button" className="sf-btn sf-btn-primary w-full" onClick={() => setTried(true)}>
              {labels.addToBasket}
            </button>
            <p role="status" className="min-h-5 text-sm text-muted-foreground">
              {tried ? labels.demoNote : layout.trustNote}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
