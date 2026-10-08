import Image from "next/image";
import Link from "next/link";
import { ProductTile, ProductTileGrid } from "@/components/ProductTiles";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { StorefrontCopy } from "@/lib/i18n";
import type { SectionType } from "@/lib/storefront-schema";
import type { ThemeKey } from "@/lib/types";
import { formatMoney } from "@/lib/util";
import { cn } from "@/lib/utils";

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
 * The eight approved sections, drawn with the shared shadcn components and the
 * shadcn tokens only. The store's own colours, type and hairlines arrive
 * through those tokens — `storeThemeStyle` maps them onto `<html>` on the live
 * storefront and onto the canvas in the editor — so a section never names a
 * theme colour itself and the same markup is what the editor previews.
 */

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
  if (tone === "dark") return "bg-foreground text-background";
  if (tone === "accent") return "bg-primary text-primary-foreground";
  return "bg-muted/60 text-foreground";
}

/** The eyebrow above a section heading: small, wide, quiet. */
const EYEBROW = "text-xs font-medium tracking-[0.14em] uppercase";

export function HeroSection({ props, ctx }: { props: Record<string, unknown>; ctx: StorefrontContext }) {
  const centred = str(props, "align", "left") === "center";
  const tone = str(props, "tone", "light");
  const light = tone === "light";
  const image = str(props, "imageUrl");

  return (
    <section className={toneClasses(tone)}>
      <div
        className={cn(
          "mx-auto grid w-full max-w-6xl gap-10 px-4 py-14 sm:px-6 sm:py-20",
          image ? "lg:grid-cols-2 lg:items-center" : "",
        )}
      >
        <div className={centred && !image ? "mx-auto max-w-2xl text-center" : ""}>
          {str(props, "eyebrow") ? (
            <p className={cn(EYEBROW, light ? "text-primary" : "opacity-80")}>
              {str(props, "eyebrow")}
            </p>
          ) : null}
          <h1 className="font-heading mt-4 text-3xl leading-[1.1] font-semibold tracking-tight text-balance sm:text-5xl">
            {str(props, "headline", ctx.t.welcome)}
          </h1>
          <p
            className={cn(
              "mt-5 max-w-xl text-base leading-relaxed",
              light ? "text-inksoft" : "opacity-85",
              centred && !image ? "mx-auto" : "",
            )}
          >
            {str(props, "body")}
          </p>
          {str(props, "ctaLabel") ? (
            <div className={cn("mt-8", centred && !image ? "flex justify-center" : "")}>
              <Link
                href={href(ctx, str(props, "ctaHref", "products"))}
                className={buttonVariants({
                  variant: light ? "default" : "outline",
                  size: "lg",
                })}
              >
                {str(props, "ctaLabel")}
              </Link>
            </div>
          ) : null}
        </div>
        {image ? (
          <div className="overflow-hidden rounded-xl border border-border bg-background">
            <Image
              src={image}
              alt=""
              width={1024}
              height={1024}
              priority
              sizes="(min-width: 1024px) 560px, 100vw"
              className="h-auto w-full object-cover"
              style={{ aspectRatio: "4 / 3" }}
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
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-center gap-3 px-4 py-2.5 text-sm sm:px-6">
        <span className="font-medium">{str(props, "text")}</span>
        {str(props, "ctaLabel") ? (
          <Link
            href={href(ctx, str(props, "ctaHref", "products"))}
            className="underline underline-offset-4 hover:no-underline"
          >
            {str(props, "ctaLabel")}
          </Link>
        ) : null}
      </div>
    </div>
  );
}

export function ValueProps({ props }: { props: Record<string, unknown>; ctx: StorefrontContext }) {
  const items = [
    { title: str(props, "itemOneTitle"), body: str(props, "itemOneBody") },
    { title: str(props, "itemTwoTitle"), body: str(props, "itemTwoBody") },
    { title: str(props, "itemThreeTitle"), body: str(props, "itemThreeBody") },
  ].filter((i) => i.title);

  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6">
      {str(props, "title") ? (
        <h2 className="font-heading text-2xl font-semibold tracking-tight text-foreground">
          {str(props, "title")}
        </h2>
      ) : null}
      <div className="mt-7 grid gap-5 md:grid-cols-3">
        {items.map((item) => (
          <Card key={item.title} className="h-full">
            <CardContent>
              <span aria-hidden className="block h-0.5 w-8 rounded-full bg-primary" />
              <h3 className="font-heading mt-4 text-base font-semibold text-foreground">
                {item.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-inksoft">{item.body}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}

export function ProductGrid({ props, ctx }: { props: Record<string, unknown>; ctx: StorefrontContext }) {
  const columns = str(props, "columns", "3") === "2" ? 2 : str(props, "columns", "3") === "4" ? 4 : 3;
  const limit = num(props, "limit", 6);
  const showPrice = props.showPrice !== false;
  const products = ctx.products.slice(0, limit);

  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border pb-5">
        <div>
          {str(props, "title") ? (
            <h2 className="font-heading text-2xl font-semibold tracking-tight text-foreground">
              {str(props, "title")}
            </h2>
          ) : null}
          {str(props, "subtitle") ? (
            <p className="mt-2 max-w-xl text-sm text-inksoft">{str(props, "subtitle")}</p>
          ) : null}
        </div>
        <Link href={href(ctx, "products")} className={buttonVariants({ variant: "ghost", size: "lg" })}>
          {ctx.t.viewAll}
        </Link>
      </div>

      {products.length === 0 ? (
        <p className="mt-8 rounded-xl border border-dashed border-border bg-muted/60 px-5 py-12 text-center text-sm text-muted-foreground">
          {ctx.t.noProducts}
        </p>
      ) : (
        <ProductTileGrid columns={columns} className="mt-8">
          {products.map((product) => (
            <ProductTile
              key={product.id}
              columns={columns}
              href={ctx.preview ? undefined : `/s/${ctx.slug}/products/${product.slug}`}
              name={product.name}
              tagline={product.tagline}
              price={showPrice ? formatMoney(product.price, product.currency, ctx.localeTag) : null}
              imageUrl={product.imageUrl}
              imageAlt={product.name}
              placeholder={ctx.t.previewSoon}
            />
          ))}
        </ProductTileGrid>
      )}
    </section>
  );
}

export function ImageWithText({ props, ctx }: { props: Record<string, unknown>; ctx: StorefrontContext }) {
  const image = str(props, "imageUrl");
  const right = str(props, "imageSide", "left") === "right";
  return (
    <section className="border-y border-border bg-muted/60">
      <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-14 sm:px-6 lg:grid-cols-2 lg:items-center">
        <div className={right ? "lg:order-2" : ""}>
          {image ? (
            <div className="overflow-hidden rounded-xl border border-border bg-background">
              <Image
                src={image}
                alt=""
                width={1024}
                height={1024}
                loading="lazy"
                sizes="(min-width: 1024px) 520px, 100vw"
                className="h-auto w-full object-cover"
                style={{ aspectRatio: "4 / 3" }}
              />
            </div>
          ) : (
            <div
              className="flex items-center justify-center rounded-xl border border-dashed border-border bg-background text-sm text-muted-foreground"
              style={{ aspectRatio: "4 / 3" }}
            >
              {ctx.t.imagePlaceholder}
            </div>
          )}
        </div>
        <div className={right ? "lg:order-1" : ""}>
          <h2 className="font-heading text-2xl font-semibold tracking-tight text-foreground">
            {str(props, "heading")}
          </h2>
          <p className="mt-4 text-sm leading-relaxed text-inksoft sm:text-base">{str(props, "body")}</p>
          <p className="mt-5 text-xs tracking-wide text-muted-foreground uppercase">{ctx.clientName}</p>
        </div>
      </div>
    </section>
  );
}

export function RichText({ props }: { props: Record<string, unknown>; ctx: StorefrontContext }) {
  const centred = str(props, "align", "left") === "center";
  return (
    <section className="mx-auto w-full max-w-3xl px-4 py-14 sm:px-6">
      <div className={centred ? "text-center" : ""}>
        <h2 className="font-heading text-xl font-semibold tracking-tight text-foreground">
          {str(props, "heading")}
        </h2>
        <p className="mt-4 whitespace-pre-line text-sm leading-relaxed text-inksoft">
          {str(props, "body")}
        </p>
      </div>
    </section>
  );
}

export function Testimonial({ props }: { props: Record<string, unknown>; ctx: StorefrontContext }) {
  return (
    <section className="mx-auto w-full max-w-4xl px-4 py-14 sm:px-6">
      <Card asChild>
        <figure className="px-8 py-10 text-center">
          <span aria-hidden className="mx-auto block h-0.5 w-10 rounded-full bg-primary" />
          <blockquote className="font-heading mt-6 text-xl leading-relaxed text-balance text-foreground">
            “{str(props, "quote")}”
          </blockquote>
          <figcaption className="mt-5 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{str(props, "author")}</span>
            {str(props, "role") ? ` · ${str(props, "role")}` : ""}
          </figcaption>
        </figure>
      </Card>
    </section>
  );
}

export function NewsletterSignup({ props, ctx }: { props: Record<string, unknown>; ctx: StorefrontContext }) {
  return (
    <section className="border-t border-border bg-muted/60">
      <div className="mx-auto w-full max-w-3xl px-4 py-14 text-center sm:px-6">
        <h2 className="font-heading text-xl font-semibold tracking-tight text-foreground">
          {str(props, "heading")}
        </h2>
        <p className="mt-3 text-sm text-inksoft">{str(props, "body")}</p>
        <form
          className="mx-auto mt-6 flex max-w-md flex-col gap-2 sm:flex-row"
          action={ctx.preview ? undefined : `/s/${ctx.slug}/products`}
        >
          <label htmlFor="newsletter-email" className="sr-only">
            {ctx.t.newsletterEmail}
          </label>
          <Input
            id="newsletter-email"
            type="email"
            name="email"
            placeholder="you@example.com"
            className="h-9 bg-background"
          />
          <Button type="submit" size="lg">
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
