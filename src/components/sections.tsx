import Image from "next/image";
import Link from "next/link";
import { ArrowRightIcon, PackageCheckIcon, SparklesIcon, TruckIcon } from "lucide-react";
import { ProductCard } from "@/components/ProductCard";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { StorefrontCopy } from "@/lib/i18n";
import type { SectionType } from "@/lib/storefront-schema";
import type { ThemeKey } from "@/lib/types";
import { formatMoney } from "@/lib/util";

export interface StorefrontProductCard {
  id: string;
  name: string;
  slug: string;
  price: number;
  currency: string;
  imageUrl: string | null;
  tagline: string;
}

export interface StorefrontContext {
  storeName: string;
  clientName: string;
  slug: string;
  logoUrl: string | null;
  theme: ThemeKey;
  products: StorefrontProductCard[];
  /** When true the section renders inside the editor and links are inert. */
  preview: boolean;
  /** The store language's built-in section copy. */
  t: StorefrontCopy["sections"];
  /** BCP-47 tag prices in these sections are formatted for. */
  localeTag: string;
}

/**
 * The published sections.
 *
 * Nothing here reaches for the theme's hex values any more: the storefront
 * layout writes the store's colour ramp, ink, surfaces, radius and typeface onto
 * the page as design tokens, so `bg-primary`, `text-ink` and `border-line` are
 * already the client's brand. The same components therefore paint the live
 * storefront and the editor canvas, and a store that changes theme restyles
 * everywhere at once.
 */

/** The outer rhythm every section shares, so a page of them reads as one page. */
const SECTION = "mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 sm:py-20";

function href(ctx: StorefrontContext, target: string): string {
  if (ctx.preview) return "#";
  if (target === "cart") return `/s/${ctx.slug}/cart`;
  return `/s/${ctx.slug}/products`;
}

function str(props: Record<string, unknown>, key: string, fallback = ""): string {
  const value = props[key];
  return value === undefined || value === null ? fallback : String(value);
}

function num(props: Record<string, unknown>, key: string, fallback: number): number {
  const value = Number(props[key]);
  return Number.isFinite(value) ? value : fallback;
}

/** The three tones a section can be set to, as token classes. */
function toneClasses(tone: string): string {
  if (tone === "dark") return "bg-ink text-white";
  if (tone === "accent") return "bg-primary text-primary-foreground";
  return "bg-secondary text-ink";
}

export function HeroSection({ props, ctx }: { props: Record<string, unknown>; ctx: StorefrontContext }) {
  const centred = str(props, "align", "left") === "center";
  const tone = str(props, "tone", "light");
  const light = tone === "light";
  const image = str(props, "imageUrl");

  return (
    <section className={toneClasses(tone)}>
      <div
        className={`mx-auto grid w-full max-w-6xl items-center gap-10 px-4 py-16 sm:px-6 sm:py-24 ${
          image ? "lg:grid-cols-2" : ""
        }`}
      >
        <div className={centred && !image ? "mx-auto max-w-2xl text-center" : "max-w-xl"}>
          {str(props, "eyebrow") ? (
            <p
              className={`text-xs font-semibold tracking-[0.16em] uppercase ${
                light ? "text-accent-foreground" : "opacity-80"
              }`}
            >
              {str(props, "eyebrow")}
            </p>
          ) : null}
          <h1 className="mt-4 text-[2rem] leading-[1.08] font-semibold tracking-tight text-balance sm:text-5xl">
            {str(props, "headline", ctx.t.welcome)}
          </h1>
          {str(props, "body") ? (
            <p className={`mt-5 text-base leading-relaxed ${light ? "text-inksoft" : "text-white/85"}`}>
              {str(props, "body")}
            </p>
          ) : null}
          {str(props, "ctaLabel") ? (
            <div className={`mt-8 ${centred && !image ? "flex justify-center" : ""}`}>
              <Button asChild size="lg" variant={light ? "default" : "outline"}>
                <Link href={href(ctx, str(props, "ctaHref", "products"))}>
                  {str(props, "ctaLabel")}
                  <ArrowRightIcon aria-hidden className="size-4" />
                </Link>
              </Button>
            </div>
          ) : null}
        </div>
        {image ? (
          <div
            className="relative overflow-hidden rounded-card bg-background/40"
            style={{ aspectRatio: "4 / 3" }}
          >
            <Image
              src={image}
              alt=""
              fill
              priority
              sizes="(min-width: 1024px) 560px, 100vw"
              className="object-cover"
            />
          </div>
        ) : null}
      </div>
    </section>
  );
}

export function PromoBanner({ props, ctx }: { props: Record<string, unknown>; ctx: StorefrontContext }) {
  const tone = str(props, "tone", "accent");
  return (
    <div className={toneClasses(tone)}>
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-center gap-x-3 gap-y-1 px-4 py-3 text-sm sm:px-6">
        <span className="font-medium">{str(props, "text")}</span>
        {str(props, "ctaLabel") ? (
          <Link
            href={href(ctx, str(props, "ctaHref", "products"))}
            className="underline underline-offset-4 opacity-90 hover:opacity-100"
          >
            {str(props, "ctaLabel")}
          </Link>
        ) : null}
      </div>
    </div>
  );
}

/** One quiet mark per value prop, so the three read as a set rather than a list. */
const VALUE_ICONS = [PackageCheckIcon, TruckIcon, SparklesIcon];

export function ValueProps({ props }: { props: Record<string, unknown>; ctx: StorefrontContext }) {
  const items = [
    { title: str(props, "itemOneTitle"), body: str(props, "itemOneBody") },
    { title: str(props, "itemTwoTitle"), body: str(props, "itemTwoBody") },
    { title: str(props, "itemThreeTitle"), body: str(props, "itemThreeBody") },
  ].filter((i) => i.title);

  return (
    <section className={SECTION}>
      {str(props, "title") ? (
        <h2 className="max-w-2xl text-2xl font-semibold tracking-tight text-balance text-ink sm:text-3xl">
          {str(props, "title")}
        </h2>
      ) : null}
      <div className="mt-10 grid gap-5 md:grid-cols-3">
        {items.map((item, index) => {
          const Icon = VALUE_ICONS[index % VALUE_ICONS.length];
          return (
            <Card key={item.title} className="p-6">
              <Icon aria-hidden className="size-5 text-accent-foreground" />
              <h3 className="mt-4 text-base font-semibold text-ink">{item.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-inksoft">{item.body}</p>
            </Card>
          );
        })}
      </div>
    </section>
  );
}

export function ProductGrid({ props, ctx }: { props: Record<string, unknown>; ctx: StorefrontContext }) {
  const columns = str(props, "columns", "3");
  const limit = num(props, "limit", 6);
  const showPrice = props.showPrice !== false;
  const products = ctx.products.slice(0, limit);
  const colClass =
    columns === "2"
      ? "grid-cols-2"
      : columns === "4"
        ? "grid-cols-2 lg:grid-cols-4"
        : "grid-cols-2 lg:grid-cols-3";
  const sizes =
    columns === "4"
      ? "(min-width: 1024px) 280px, (min-width: 640px) 45vw, 46vw"
      : "(min-width: 1024px) 360px, (min-width: 640px) 45vw, 46vw";

  return (
    <section className={SECTION}>
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-line pb-5">
        <div>
          {str(props, "title") ? (
            <h2 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
              {str(props, "title")}
            </h2>
          ) : null}
          {str(props, "subtitle") ? (
            <p className="mt-2 max-w-xl text-sm text-muted">{str(props, "subtitle")}</p>
          ) : null}
        </div>
        <Link
          href={href(ctx, "products")}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-accent-foreground hover:underline hover:underline-offset-4"
        >
          {ctx.t.viewAll}
          <ArrowRightIcon aria-hidden className="size-3.5" />
        </Link>
      </div>

      {products.length === 0 ? (
        <p className="mt-10 rounded-card border border-dashed border-line bg-secondary px-5 py-12 text-center text-sm text-muted">
          {ctx.t.noProducts}
        </p>
      ) : (
        <ul className={`mt-10 grid gap-x-5 gap-y-10 ${colClass}`}>
          {products.map((product, index) => (
            <li key={product.id}>
              <ProductCard
                href={ctx.preview ? "#" : `/s/${ctx.slug}/products/${product.slug}`}
                name={product.name}
                price={
                  showPrice ? formatMoney(product.price, product.currency, ctx.localeTag) : null
                }
                tagline={product.tagline}
                imageUrl={product.imageUrl}
                placeholder={ctx.t.previewSoon}
                eager={index < 2}
                sizes={sizes}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function ImageWithText({ props, ctx }: { props: Record<string, unknown>; ctx: StorefrontContext }) {
  const image = str(props, "imageUrl");
  const right = str(props, "imageSide", "left") === "right";
  return (
    <section className="border-y border-line bg-secondary">
      <div className="mx-auto grid w-full max-w-6xl items-center gap-10 px-4 py-16 sm:px-6 sm:py-20 lg:grid-cols-2">
        <div className={right ? "lg:order-2" : ""}>
          {image ? (
            <div
              className="relative overflow-hidden rounded-card bg-background"
              style={{ aspectRatio: "4 / 3" }}
            >
              <Image
                src={image}
                alt=""
                fill
                loading="lazy"
                sizes="(min-width: 1024px) 520px, 100vw"
                className="object-cover"
              />
            </div>
          ) : (
            <div
              className="flex items-center justify-center rounded-card border border-dashed border-line bg-background text-sm text-muted"
              style={{ aspectRatio: "4 / 3" }}
            >
              {ctx.t.imagePlaceholder}
            </div>
          )}
        </div>
        <div className={right ? "lg:order-1" : ""}>
          <h2 className="text-2xl font-semibold tracking-tight text-balance text-ink sm:text-3xl">
            {str(props, "heading")}
          </h2>
          <p className="mt-4 text-sm leading-relaxed text-inksoft sm:text-base">{str(props, "body")}</p>
          <p className="mt-6 text-xs tracking-wide text-muted uppercase">{ctx.clientName}</p>
        </div>
      </div>
    </section>
  );
}

export function RichText({ props }: { props: Record<string, unknown>; ctx: StorefrontContext }) {
  const centred = str(props, "align", "left") === "center";
  return (
    <section className="mx-auto w-full max-w-3xl px-4 py-16 sm:px-6">
      <div className={centred ? "text-center" : ""}>
        <h2 className="text-xl font-semibold tracking-tight text-ink sm:text-2xl">
          {str(props, "heading")}
        </h2>
        <p className="mt-4 text-sm leading-7 whitespace-pre-line text-inksoft">{str(props, "body")}</p>
      </div>
    </section>
  );
}

export function Testimonial({ props }: { props: Record<string, unknown>; ctx: StorefrontContext }) {
  return (
    <section className="mx-auto w-full max-w-3xl px-4 py-16 sm:px-6 sm:py-20">
      <figure className="text-center">
        <blockquote className="text-xl leading-relaxed text-balance text-ink sm:text-2xl">
          “{str(props, "quote")}”
        </blockquote>
        <figcaption className="mt-6 text-sm text-muted">
          <span className="font-medium text-ink">{str(props, "author")}</span>
          {str(props, "role") ? ` · ${str(props, "role")}` : ""}
        </figcaption>
      </figure>
    </section>
  );
}

export function NewsletterSignup({
  props,
  ctx,
}: {
  props: Record<string, unknown>;
  ctx: StorefrontContext;
}) {
  return (
    <section className="border-t border-line bg-secondary">
      <div className="mx-auto w-full max-w-2xl px-4 py-16 text-center sm:px-6 sm:py-20">
        <h2 className="text-xl font-semibold tracking-tight text-balance text-ink sm:text-2xl">
          {str(props, "heading")}
        </h2>
        <p className="mt-3 text-sm text-inksoft">{str(props, "body")}</p>
        <form
          className="mx-auto mt-7 flex max-w-md flex-col gap-2 sm:flex-row"
          action={ctx.preview ? undefined : `/s/${ctx.slug}/products`}
        >
          <label htmlFor="newsletter-email" className="sr-only">
            {ctx.t.newsletterEmail}
          </label>
          <Input id="newsletter-email" type="email" name="email" placeholder="you@example.com" />
          <Button type="submit" className="shrink-0">
            {str(props, "buttonLabel", ctx.t.notifyMe)}
          </Button>
        </form>
      </div>
    </section>
  );
}

export const SECTION_COMPONENTS: Record<
  SectionType,
  (args: { props: Record<string, unknown>; ctx: StorefrontContext }) => React.ReactElement
> = {
  HeroSection,
  PromoBanner,
  ValueProps,
  ProductGrid,
  ImageWithText,
  RichText,
  Testimonial,
  NewsletterSignup,
};

export function RenderSection({
  type,
  props,
  ctx,
}: {
  type: SectionType;
  props: Record<string, unknown>;
  ctx: StorefrontContext;
}) {
  const Component = SECTION_COMPONENTS[type];
  if (!Component) return null;
  return <Component props={props} ctx={ctx} />;
}
