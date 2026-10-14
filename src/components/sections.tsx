import { ArrowRight, Clock, Mail, MapPin, Phone, Star } from "lucide-react";
import type React from "react";
import { collectionProducts } from "@/lib/collections";
import { mix } from "@/lib/store-design";
import type { SectionType } from "@/lib/storefront-schema";
import { cn } from "@/lib/utils";
import { Carousel, CountdownClock, NewsletterForm, QuickAdd, SlideshowFrame, VideoPlayer } from "./storefront/client";
import {
  Cta,
  EYEBROW,
  num,
  on,
  resolveHref,
  SectionHeading,
  SectionShell,
  SfIcon,
  SfImage,
  SmartLink,
  str,
  ViewAll,
  type SectionProps,
  type StorefrontContext,
  type StorefrontProductCard,
} from "./storefront/kit";
import { ProductBadges, ProductCard } from "./storefront/ProductCard";

export type { StorefrontCollection, StorefrontContext, StorefrontProductCard } from "./storefront/kit";

/**
 * The approved sections, drawn with the shadcn tokens and the storefront kit
 * only. The store's colours, type, corners, buttons and density arrive through
 * CSS variables (`storeThemeStyle` maps them onto `<html>` on the live
 * storefront and onto the canvas in the editor), so a section never names a
 * colour itself and the same markup is what the editor previews.
 */

/** A section's products: a collection's, in its order, or everything published. */
function sourceProducts(ctx: StorefrontContext, source: string) {
  const collection = ctx.collections?.find((c) => c.id === source);
  return { collection, products: collection ? collectionProducts(collection.productIds, ctx.products) : ctx.products };
}

function viewAllHref(ctx: StorefrontContext, collection: { handle: string } | undefined) {
  if (ctx.preview) return "#";
  return collection ? `${ctx.base}/collections/${collection.handle}` : `${ctx.base}/products`;
}

/** Shown in the editor where a live page would show nothing. */
function EditorHint({ ctx, children }: { ctx: StorefrontContext; children: React.ReactNode }) {
  if (!ctx.preview) return null;
  return (
    <p className="rounded-[var(--radius)] border border-dashed border-border px-5 py-10 text-center text-sm text-muted-foreground">{children}</p>
  );
}

const paragraphs = (text: string) => text.split(/\n{2,}/).filter((p) => p.trim() !== "");

function Stars({ rating, label }: { rating: number; label: string }) {
  if (rating <= 0) return null;
  return (
    <span role="img" aria-label={label} className="inline-flex gap-0.5 text-[var(--sf-primary-text)]">
      {Array.from({ length: 5 }, (_, i) => (
        <Star key={i} aria-hidden className={cn("size-4", i < rating ? "fill-current" : "opacity-30")} />
      ))}
    </span>
  );
}

/* ------------------------------------------------------------------ heroes */

export function HeroSection({ props, ctx, index }: SectionProps) {
  const tone = str(props, "tone", "light");
  const own = tone === "dark" ? "inverse" : tone === "accent" ? "primary" : "surface";
  const hasImage = Boolean(str(props, "imageUrl"));
  const centred = str(props, "align") === "center" && !hasImage;
  return (
    <SectionShell props={{ ...props, align: centred ? "center" : "left" }} ctx={ctx} own={own}>
      <div className={cn("grid items-center gap-10 lg:gap-16", hasImage ? "lg:grid-cols-[1.05fr_1fr]" : "")}>
        <div className={centred ? "mx-auto min-w-0 max-w-3xl" : "min-w-0 max-w-2xl"}>
          {str(props, "eyebrow") ? <p className={EYEBROW}>{str(props, "eyebrow")}</p> : null}
          <h1 className="font-heading mt-4 text-[clamp(2.4rem,5.6vw,4.5rem)] leading-[1.02] font-semibold tracking-tight text-balance hyphens-auto break-words text-foreground">
            {str(props, "headline", ctx.t.welcome)}
          </h1>
          {str(props, "body") ? (
            <p className={cn("mt-5 max-w-xl text-lg leading-relaxed text-pretty text-inksoft", centred ? "mx-auto" : "")}>
              {str(props, "body")}
            </p>
          ) : null}
          <div className={cn("mt-8 flex flex-wrap gap-3", centred ? "justify-center" : "")}>
            <Cta ctx={ctx} label={str(props, "ctaLabel")} target={str(props, "ctaHref", "products")} />
            <Cta ctx={ctx} label={str(props, "secondaryLabel")} target={str(props, "secondaryHref", "products")} variant="secondary" />
          </div>
        </div>
        {hasImage ? (
          <div className="aspect-[4/3] overflow-hidden rounded-[calc(var(--radius)*1.6)] bg-muted lg:aspect-[5/6]">
            <SfImage props={props} field="imageUrl" sizes="(min-width: 1024px) 560px, 100vw" priority={index === 0} />
          </div>
        ) : null}
      </div>
    </SectionShell>
  );
}

const HERO_HEIGHTS: Record<string, string> = {
  medium: "min-h-[440px] sm:min-h-[60vh]",
  large: "min-h-[560px] sm:min-h-[78vh]",
  screen: "min-h-[100svh]",
};

const HERO_POSITIONS: Record<string, string> = {
  center: "items-center justify-center text-center",
  "bottom-left": "items-end justify-start text-left",
  "bottom-center": "items-end justify-center text-center",
  left: "items-center justify-start text-left",
};

/** The photo, video or brand gradient a full-bleed hero or slide sits on. */
function HeroMedia({
  props,
  ctx,
  field,
  priority,
  title,
}: {
  props: Record<string, unknown>;
  ctx: StorefrontContext;
  field: string;
  priority: boolean;
  title: string;
}) {
  const video = str(props, "videoUrl");
  const overlay = Math.min(80, Math.max(0, num(props, "overlay", 35))) / 100;
  const { primary } = ctx.design.colors;
  const image = <SfImage props={props} field={field} sizes="100vw" priority={priority} />;
  return (
    <div className="absolute inset-0 -z-10">
      {video ? (
        <VideoPlayer url={video} poster={image} title={title} loop labels={{ play: ctx.t.play, pause: ctx.t.pause }} inert={ctx.preview} />
      ) : str(props, field) ? (
        image
      ) : (
        <div className="h-full w-full" style={{ background: `linear-gradient(135deg, ${primary}, ${mix(primary, "#000000", 0.55)})` }} />
      )}
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: `linear-gradient(to top, rgb(0 0 0 / ${Math.min(0.9, overlay + 0.25)}), rgb(0 0 0 / ${overlay * 0.5}) 60%, rgb(0 0 0 / ${overlay * 0.35}))` }}
      />
    </div>
  );
}

/** The copy over a full-bleed photo: always white, with white buttons. */
function OverlayCopy({
  ctx,
  eyebrow,
  headline,
  body,
  cta,
  secondary,
  first,
}: {
  ctx: StorefrontContext;
  eyebrow: string;
  headline: string;
  body: string;
  cta: [string, string];
  secondary?: [string, string];
  first: boolean;
}) {
  const Heading = first ? "h1" : "h2";
  return (
    <div className="max-w-3xl text-white [text-shadow:0_1px_24px_rgb(0_0_0/0.25)]">
      {eyebrow ? <p className="text-xs font-semibold tracking-[0.18em] text-white/90 uppercase">{eyebrow}</p> : null}
      {headline ? (
        <Heading className="font-heading mt-3 text-[clamp(2.5rem,7vw,5.5rem)] leading-[0.98] font-semibold tracking-tight text-balance">
          {headline}
        </Heading>
      ) : null}
      {body ? <p className="mt-4 max-w-xl text-base leading-relaxed text-white/90 sm:text-lg [.text-center_&]:mx-auto">{body}</p> : null}
      <div className="mt-7 flex flex-wrap gap-3 [.text-center_&]:justify-center">
        <Cta ctx={ctx} label={cta[0]} target={cta[1]} variant="media" />
        {secondary ? (
          <Cta ctx={ctx} label={secondary[0]} target={secondary[1]} variant="secondary" className="border-white text-white" />
        ) : null}
      </div>
    </div>
  );
}

export function ImageHero({ props, ctx, index }: SectionProps) {
  const first = index === 0;
  return (
    <SectionShell props={{ ...props, background: "none" }} ctx={ctx} bleed>
      <div
        {...(first ? { "data-sf-overlay-hero": "" } : {})}
        className={cn(
          "relative isolate flex overflow-hidden px-5 pb-12 sm:px-10 sm:pb-16 lg:px-16",
          HERO_HEIGHTS[str(props, "height", "large")] ?? HERO_HEIGHTS.large,
          HERO_POSITIONS[str(props, "position", "bottom-left")] ?? HERO_POSITIONS["bottom-left"],
          str(props, "position") === "center" || str(props, "position") === "left" ? "py-16" : "pt-24",
        )}
      >
        <HeroMedia props={props} ctx={ctx} field="imageUrl" priority={first} title={str(props, "headline")} />
        <OverlayCopy
          ctx={ctx}
          first={first}
          eyebrow={str(props, "eyebrow")}
          headline={str(props, "headline")}
          body={str(props, "body")}
          cta={[str(props, "ctaLabel"), str(props, "ctaHref", "products")]}
          secondary={[str(props, "secondaryLabel"), str(props, "secondaryHref", "products")]}
        />
      </div>
    </SectionShell>
  );
}

export function Slideshow({ props, ctx, index }: SectionProps) {
  const first = index === 0;
  const slides = [1, 2, 3].filter((n) => str(props, `slide${n}Headline`) || str(props, `slide${n}Image`));
  const height = HERO_HEIGHTS[str(props, "height", "large")] ?? HERO_HEIGHTS.large;
  if (slides.length === 0) return <EditorHint ctx={ctx}>{ctx.t.imagePlaceholder}</EditorHint>;
  return (
    <SectionShell props={{ ...props, background: "none" }} ctx={ctx} bleed>
      <div {...(first ? { "data-sf-overlay-hero": "" } : {})}>
        <SlideshowFrame
          autoplay={on(props, "autoplay")}
          label={str(props, `slide${slides[0]}Headline`) || ctx.storeName}
          labels={{ previous: ctx.t.previous, next: ctx.t.next, pause: ctx.t.pause, play: ctx.t.play, slide: ctx.t.slide }}
        >
          {slides.map((n, i) => {
            const slide = {
              [`slide${n}Image`]: props[`slide${n}Image`],
              [`slide${n}ImageFocal`]: props[`slide${n}ImageFocal`],
              [`slide${n}ImageSmall`]: props[`slide${n}ImageSmall`],
              overlay: props.overlay,
            };
            return (
              <div key={n} className={cn("relative isolate flex items-end overflow-hidden px-5 pt-24 pb-16 sm:px-10 sm:pb-20 lg:px-16", height)}>
                <HeroMedia props={slide} ctx={ctx} field={`slide${n}Image`} priority={first && i === 0} title={str(props, `slide${n}Headline`)} />
                <OverlayCopy
                  ctx={ctx}
                  first={first && i === 0}
                  eyebrow={str(props, `slide${n}Eyebrow`)}
                  headline={str(props, `slide${n}Headline`)}
                  body={str(props, `slide${n}Body`)}
                  cta={[str(props, `slide${n}CtaLabel`), str(props, `slide${n}CtaHref`, "products")]}
                />
              </div>
            );
          })}
        </SlideshowFrame>
      </div>
    </SectionShell>
  );
}

/* ------------------------------------------------------------ conversion */

export function PromoBanner({ props, ctx }: SectionProps) {
  const tone = str(props, "tone", "accent");
  const own = tone === "dark" ? "inverse" : tone === "light" ? "surface" : "primary";
  const message = str(props, "text");
  const href = resolveHref(ctx, str(props, "ctaHref", "products"));
  const link =
    str(props, "ctaLabel") && href ? (
      <SmartLink href={href} className="font-semibold underline underline-offset-4 hover:no-underline">
        {str(props, "ctaLabel")}
      </SmartLink>
    ) : null;

  if (props.scrolling === true) {
    const run = Array.from({ length: 8 }, (_, i) => (
      <span key={i} aria-hidden={i > 0} className="inline-flex items-center gap-10 pr-10">
        <span>{message}</span>
        <span aria-hidden>✦</span>
      </span>
    ));
    return (
      <SectionShell props={{ ...props, width: "full" }} ctx={ctx} own={own} bleed>
        <div className="sf-motion flex items-center overflow-hidden py-3 text-sm font-semibold tracking-[0.08em] uppercase">
          <div className="sf-marquee flex shrink-0 whitespace-nowrap">
            {run}
            {run}
          </div>
        </div>
        {link ? <div className="pb-3 text-center text-sm">{link}</div> : null}
      </SectionShell>
    );
  }

  return (
    <SectionShell props={props} ctx={ctx} own={own}>
      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 py-3 text-sm">
        <span className="font-medium">{message}</span>
        {link}
      </div>
    </SectionShell>
  );
}

export function Countdown({ props, ctx }: SectionProps) {
  const hasImage = Boolean(str(props, "imageUrl"));
  const units = { days: ctx.t.days, hours: ctx.t.hours, minutes: ctx.t.minutes, seconds: ctx.t.seconds };
  const centred = !hasImage && str(props, "align") === "center";
  return (
    <SectionShell props={props} ctx={ctx} own="inverse">
      <div className={cn("grid items-center gap-10", hasImage ? "lg:grid-cols-2" : "")}>
        {hasImage ? (
          <div className="aspect-[4/3] overflow-hidden rounded-[calc(var(--radius)*1.6)] bg-muted">
            <SfImage props={props} field="imageUrl" sizes="(min-width: 1024px) 560px, 100vw" />
          </div>
        ) : null}
        <div className={cn(centred ? "mx-auto max-w-2xl text-center" : "")}>
          {str(props, "eyebrow") ? <p className={EYEBROW}>{str(props, "eyebrow")}</p> : null}
          <h2 className="font-heading mt-3 text-[clamp(2rem,4.6vw,3.6rem)] leading-[1.02] font-semibold tracking-tight text-balance text-foreground">
            {str(props, "heading")}
          </h2>
          {str(props, "body") ? <p className="mt-4 text-base leading-relaxed text-inksoft">{str(props, "body")}</p> : null}
          {str(props, "endsAt") ? (
            <CountdownClock
              endsAt={str(props, "endsAt")}
              ended={str(props, "endedText")}
              units={units}
              className={cn("mt-7 text-foreground", centred ? "justify-center" : "")}
            />
          ) : (
            <EditorHint ctx={ctx}>{ctx.t.countdownHint}</EditorHint>
          )}
          <div className={cn("mt-8 flex", centred ? "justify-center" : "")}>
            <Cta ctx={ctx} label={str(props, "ctaLabel")} target={str(props, "ctaHref", "products")} />
          </div>
        </div>
      </div>
    </SectionShell>
  );
}

export function NewsletterSignup({ props, ctx }: SectionProps) {
  const hasImage = Boolean(str(props, "imageUrl"));
  const centred = !hasImage && str(props, "align") === "center";
  const form = ctx.storeId || ctx.demoNote ? (
    <NewsletterForm
      storeId={ctx.storeId ?? ""}
      source="section"
      inert={ctx.preview}
      demoNote={ctx.demoNote}
      className={cn("mt-6", centred ? "mx-auto" : "")}
      labels={{ email: ctx.t.newsletterEmail, placeholder: ctx.t.newsletterEmail, button: str(props, "buttonLabel", ctx.t.notifyMe) }}
    />
  ) : null;
  return (
    <SectionShell props={{ ...props, width: hasImage ? "normal" : props.width }} ctx={ctx} own="surface">
      <div className={cn("grid items-center gap-10", hasImage ? "lg:grid-cols-2" : "")}>
        {hasImage ? (
          <div className="aspect-[4/3] overflow-hidden rounded-[calc(var(--radius)*1.6)] bg-muted">
            <SfImage props={props} field="imageUrl" sizes="(min-width: 1024px) 560px, 100vw" />
          </div>
        ) : null}
        <div className={centred ? "text-center" : ""}>
          <h2 className="font-heading text-[clamp(1.6rem,3.2vw,2.4rem)] leading-tight font-semibold tracking-tight text-balance text-foreground">
            {str(props, "heading")}
          </h2>
          {str(props, "body") ? <p className={cn("mt-3 max-w-xl text-base text-inksoft", centred ? "mx-auto" : "")}>{str(props, "body")}</p> : null}
          {form}
        </div>
      </div>
    </SectionShell>
  );
}

/* --------------------------------------------------------------- products */

export function ProductGrid({ props, ctx }: SectionProps) {
  const columnsSetting = str(props, "columns", "3");
  const columns = columnsSetting === "2" ? 2 : columnsSetting === "4" ? 4 : 3;
  const { collection, products: source } = sourceProducts(ctx, str(props, "source"));
  const products = source.slice(0, num(props, "limit", 6));
  return (
    <SectionShell props={props} ctx={ctx} label={str(props, "title")}>
      <SectionHeading
        props={props}
        title={str(props, "title")}
        subtitle={str(props, "subtitle")}
        action={<ViewAll href={viewAllHref(ctx, collection)} label={ctx.t.viewAll} />}
      />
      {products.length === 0 ? (
        <p className="rounded-[var(--radius)] border border-dashed border-border bg-muted/60 px-5 py-12 text-center text-sm text-muted-foreground">
          {ctx.t.noProducts}
        </p>
      ) : (
        <ul
          className={cn(
            "grid grid-cols-2 gap-x-3 gap-y-8 text-left sm:gap-x-5 sm:gap-y-10",
            columns === 4 ? "lg:grid-cols-4" : columns === 3 ? "lg:grid-cols-3" : "",
          )}
        >
          {products.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              ctx={ctx}
              columns={columns}
              showPrice={on(props, "showPrice")}
              showBadges={on(props, "showBadges")}
              showSwatches={on(props, "showSwatches")}
              quickAdd={on(props, "quickAdd")}
            />
          ))}
        </ul>
      )}
    </SectionShell>
  );
}

function ProductRow({ products, ctx, props, label }: { products: StorefrontProductCard[]; ctx: StorefrontContext; props: Record<string, unknown>; label: string }) {
  return (
    <Carousel label={label} previous={ctx.t.previous} next={ctx.t.next}>
      {products.map((product) => (
        <ProductCard
          key={product.id}
          product={product}
          ctx={ctx}
          columns={4}
          showBadges={on(props, "showBadges")}
          showSwatches={on(props, "showSwatches")}
          quickAdd={on(props, "quickAdd")}
          className="w-[46%] shrink-0 snap-start text-left sm:w-[31%] lg:w-[23%]"
        />
      ))}
    </Carousel>
  );
}

export function ProductCarousel({ props, ctx }: SectionProps) {
  const { collection, products: source } = sourceProducts(ctx, str(props, "source"));
  const products = source.slice(0, num(props, "limit", 10));
  const title = str(props, "title");
  const href = viewAllHref(ctx, collection);
  if (products.length === 0) {
    return (
      <SectionShell props={props} ctx={ctx}>
        <SectionHeading props={props} title={title} />
        <EditorHint ctx={ctx}>{ctx.t.noProducts}</EditorHint>
      </SectionShell>
    );
  }
  if (str(props, "layout") === "side") {
    return (
      <SectionShell props={{ ...props, align: "left" }} ctx={ctx} label={title}>
        <div className="grid gap-8 lg:grid-cols-[minmax(14rem,18rem)_minmax(0,1fr)] lg:gap-12">
          <div className="lg:pt-6">
            <h2 className="font-heading text-[clamp(1.6rem,3vw,2.3rem)] leading-tight font-semibold tracking-tight text-foreground">{title}</h2>
            {str(props, "subtitle") ? <p className="mt-3 text-base leading-relaxed text-inksoft">{str(props, "subtitle")}</p> : null}
            {str(props, "ctaLabel") ? (
              <SmartLink href={href} className="sf-btn sf-btn-primary mt-6">
                {str(props, "ctaLabel")}
              </SmartLink>
            ) : null}
          </div>
          <div className="min-w-0">
            <ProductRow products={products} ctx={ctx} props={props} label={title} />
          </div>
        </div>
      </SectionShell>
    );
  }
  return (
    <SectionShell props={props} ctx={ctx} label={title}>
      <SectionHeading
        props={props}
        title={title}
        subtitle={str(props, "subtitle")}
        action={str(props, "ctaLabel") ? <ViewAll href={href} label={str(props, "ctaLabel")} /> : undefined}
      />
      <ProductRow products={products} ctx={ctx} props={props} label={title} />
    </SectionShell>
  );
}

export function FeaturedProduct({ props, ctx }: SectionProps) {
  const product = ctx.products.find((p) => p.id === str(props, "product")) ?? ctx.products[0];
  if (!product) {
    return (
      <SectionShell props={props} ctx={ctx}>
        <EditorHint ctx={ctx}>{ctx.t.noProducts}</EditorHint>
      </SectionShell>
    );
  }
  const right = str(props, "imageSide") === "right";
  const href = ctx.preview ? "#" : `${ctx.base}/products/${product.slug}`;
  return (
    <SectionShell props={{ ...props, align: "left" }} ctx={ctx} own="surface" label={product.name}>
      <div className="grid items-center gap-8 lg:grid-cols-2 lg:gap-16">
        <div className={cn("grid grid-cols-[1fr] gap-3", product.secondImageUrl ? "sm:grid-cols-[3fr_1fr]" : "", right ? "lg:order-2" : "")}>
          <div className="relative overflow-hidden rounded-[calc(var(--radius)*1.4)] bg-background" style={{ aspectRatio: "var(--sf-product-ratio, 4 / 5)" }}>
            {product.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={product.imageUrl} alt={product.name} loading="lazy" className="h-full w-full object-cover" />
            ) : null}
            {product.badges?.length ? (
              <span className="absolute top-3 left-3 flex gap-1">
                <ProductBadges badges={product.badges} ctx={ctx} />
              </span>
            ) : null}
          </div>
          {product.secondImageUrl ? (
            <div className="hidden overflow-hidden rounded-[calc(var(--radius)*1.4)] bg-background sm:block" style={{ aspectRatio: "var(--sf-product-ratio, 4 / 5)" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={product.secondImageUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
            </div>
          ) : null}
        </div>
        <div>
          {str(props, "eyebrow") ? <p className={EYEBROW}>{str(props, "eyebrow")}</p> : null}
          <h2 className="font-heading mt-3 text-[clamp(1.9rem,4vw,3.2rem)] leading-[1.04] font-semibold tracking-tight text-balance text-foreground">
            {str(props, "heading") || product.name}
          </h2>
          <p className="mt-3 text-xl font-medium tabular-nums text-foreground">{product.price}</p>
          <p className="mt-4 max-w-lg text-base leading-relaxed text-inksoft">{str(props, "body") || product.tagline}</p>
          {product.swatches && product.swatches.length > 1 ? (
            <ul className="mt-5 flex gap-2" aria-label={product.swatches.map((s) => s.name).join(", ")}>
              {product.swatches.slice(0, 8).map((swatch) => (
                <li key={swatch.name} title={swatch.name} className="size-6 rounded-full border border-foreground/20" style={{ background: swatch.hex }} />
              ))}
            </ul>
          ) : null}
          <div className="mt-6 max-w-md">
            {product.quickAdd && ctx.storeId ? (
              <QuickAdd
                storeId={ctx.storeId}
                productId={product.id}
                variants={product.quickAdd.variants}
                inert={ctx.preview}
                expanded={product.quickAdd.variants.length > 1}
                labels={{ add: ctx.t.addToBasket, choose: ctx.t.chooseOption, added: ctx.t.added, soldOut: ctx.t.badgeSoldOut }}
              />
            ) : null}
            <SmartLink href={href} className="sf-btn sf-btn-secondary mt-3 w-full">
              {ctx.t.viewProduct}
            </SmartLink>
          </div>
        </div>
      </div>
    </SectionShell>
  );
}

const TILE_RATIOS: Record<string, string> = { square: "1 / 1", portrait: "4 / 5", landscape: "4 / 3" };

export function CollectionTiles({ props, ctx }: SectionProps) {
  const collections = ctx.collections ?? [];
  const chosen = [1, 2, 3, 4]
    .map((n) => ({ n, collection: collections.find((c) => c.id === str(props, `tile${n}Collection`)) }))
    .filter((tile) => tile.collection);
  const tiles = (chosen.length > 0 ? chosen : collections.slice(0, 4).map((collection, i) => ({ n: i + 1, collection }))).map(({ n, collection }) => {
    const firstProduct = collectionProducts(collection!.productIds, ctx.products)[0];
    return {
      n,
      collection: collection!,
      label: str(props, `tile${n}Label`) || collection!.name || "",
      image: str(props, `tile${n}Image`) || collection!.imageUrl || firstProduct?.imageUrl || "",
    };
  });
  const title = str(props, "title");
  if (tiles.length === 0) {
    return (
      <SectionShell props={props} ctx={ctx}>
        <SectionHeading props={props} title={title} />
        <EditorHint ctx={ctx}>{ctx.t.noCollections}</EditorHint>
      </SectionShell>
    );
  }
  const ratio = TILE_RATIOS[str(props, "ratio", "portrait")] ?? TILE_RATIOS.portrait;
  const tile = (t: (typeof tiles)[number], className?: string) => (
    <li key={t.collection.id} className={className}>
      <SmartLink
        href={ctx.preview ? "#" : `${ctx.base}/collections/${t.collection.handle}`}
        className="group relative isolate block overflow-hidden rounded-[calc(var(--radius)*1.4)] bg-muted focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
      >
        <span className="block" style={{ aspectRatio: ratio }}>
          {t.image ? (
            <SfImage
              props={{ img: t.image, imgFocal: props[`tile${t.n}ImageFocal`] ?? "50 50", imgSmall: str(props, `tile${t.n}Image`) ? props[`tile${t.n}ImageSmall`] : "" }}
              field="img"
              sizes="(min-width: 1024px) 25vw, 50vw"
              className="sf-motion transition-transform duration-700 ease-out group-hover:scale-[1.04]"
            />
          ) : null}
        </span>
        <span className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/10 to-transparent" />
        <span className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-4 text-white sm:p-5">
          <span className="font-heading text-lg leading-tight font-semibold tracking-tight sm:text-xl">{t.label}</span>
          <ArrowRight aria-hidden className="sf-motion size-5 shrink-0 transition-transform group-hover:translate-x-1" />
        </span>
      </SmartLink>
    </li>
  );
  return (
    <SectionShell props={props} ctx={ctx} label={title}>
      <SectionHeading props={props} title={title} subtitle={str(props, "subtitle")} />
      {str(props, "layout") === "carousel" ? (
        <Carousel label={title || ctx.storeName} previous={ctx.t.previous} next={ctx.t.next}>
          {tiles.map((t) => tile(t, "w-[70%] shrink-0 snap-start sm:w-[40%] lg:w-[24%]"))}
        </Carousel>
      ) : (
        <ul className={cn("grid grid-cols-2 gap-3 sm:gap-5", tiles.length >= 4 ? "lg:grid-cols-4" : tiles.length === 3 ? "lg:grid-cols-3" : "")}>
          {tiles.map((t) => tile(t))}
        </ul>
      )}
    </SectionShell>
  );
}

/* ---------------------------------------------------------------- content */

export function ValueProps({ props, ctx }: SectionProps) {
  const items = (["One", "Two", "Three"] as const)
    .map((n) => ({ icon: str(props, `item${n}Icon`, "sparkles"), title: str(props, `item${n}Title`), body: str(props, `item${n}Body`) }))
    .filter((i) => i.title);
  return (
    <SectionShell props={props} ctx={ctx} label={str(props, "title")}>
      <SectionHeading props={props} title={str(props, "title")} />
      <ul className="grid gap-x-8 gap-y-10 md:grid-cols-3">
        {items.map((item) => (
          <li key={item.title} className="border-t border-border pt-6">
            <span className="inline-flex size-11 items-center justify-center rounded-full bg-muted text-[var(--sf-primary-text)] [.text-center_&]:mx-auto">
              <SfIcon name={item.icon} className="size-5" />
            </span>
            <h3 className="font-heading mt-4 text-lg font-semibold tracking-tight text-foreground">{item.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-inksoft">{item.body}</p>
          </li>
        ))}
      </ul>
    </SectionShell>
  );
}

export function MultiColumn({ props, ctx }: SectionProps) {
  const media = str(props, "media", "icon");
  const columns = [1, 2, 3, 4]
    .map((n) => ({ n, icon: str(props, `column${n}Icon`, "sparkles"), title: str(props, `column${n}Title`), body: str(props, `column${n}Body`) }))
    .filter((c) => c.title || c.body)
    .slice(0, Number(str(props, "columns", "3")) || 3);
  const across = columns.length;
  return (
    <SectionShell props={props} ctx={ctx} label={str(props, "title")}>
      <SectionHeading props={props} title={str(props, "title")} subtitle={str(props, "subtitle")} />
      <ul className={cn("grid gap-x-8 gap-y-12 sm:grid-cols-2", across >= 4 ? "lg:grid-cols-4" : across === 3 ? "lg:grid-cols-3" : "")}>
        {columns.map((column, i) => (
          <li key={column.n}>
            {media === "image" ? (
              <div className="mb-5 aspect-[4/3] overflow-hidden rounded-[calc(var(--radius)*1.4)] bg-muted">
                <SfImage props={props} field={`column${column.n}Image`} sizes="(min-width: 1024px) 30vw, 90vw" />
              </div>
            ) : media === "number" ? (
              <span className="font-heading block text-4xl font-semibold text-[var(--sf-primary-text)] tabular-nums">{String(i + 1).padStart(2, "0")}</span>
            ) : (
              <span className="inline-flex size-12 items-center justify-center rounded-full bg-muted text-[var(--sf-primary-text)] [.text-center_&]:mx-auto">
                <SfIcon name={column.icon} className="size-6" />
              </span>
            )}
            <h3 className="font-heading mt-4 text-lg font-semibold tracking-tight text-foreground">{column.title}</h3>
            {column.body ? <p className="mt-2 text-sm leading-relaxed text-inksoft">{column.body}</p> : null}
          </li>
        ))}
      </ul>
    </SectionShell>
  );
}

export function ImageWithText({ props, ctx }: SectionProps) {
  const right = str(props, "imageSide", "left") === "right";
  return (
    <SectionShell props={{ ...props, align: "left" }} ctx={ctx} own="surface" label={str(props, "heading")}>
      <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
        <div className={right ? "lg:order-2" : ""}>
          {str(props, "imageUrl") ? (
            <div className="aspect-[4/3] overflow-hidden rounded-[calc(var(--radius)*1.6)] bg-background lg:aspect-[5/6]">
              <SfImage props={props} field="imageUrl" sizes="(min-width: 1024px) 560px, 100vw" />
            </div>
          ) : (
            <div className="flex aspect-[4/3] items-center justify-center rounded-[calc(var(--radius)*1.6)] border border-dashed border-border bg-background px-6 text-center text-sm text-muted-foreground">
              {ctx.t.imagePlaceholder}
            </div>
          )}
        </div>
        <div className={right ? "lg:order-1" : ""}>
          {str(props, "eyebrow") ? <p className={EYEBROW}>{str(props, "eyebrow")}</p> : null}
          <h2 className="font-heading mt-3 text-[clamp(1.8rem,3.6vw,2.8rem)] leading-[1.06] font-semibold tracking-tight text-balance text-foreground">
            {str(props, "heading")}
          </h2>
          <div className="mt-5 space-y-4 text-base leading-relaxed text-inksoft">
            {paragraphs(str(props, "body")).map((p, i) => (
              <p key={i} className="whitespace-pre-line">
                {p}
              </p>
            ))}
          </div>
          <div className="mt-7 flex">
            <Cta ctx={ctx} label={str(props, "ctaLabel")} target={str(props, "ctaHref", "products")} />
          </div>
        </div>
      </div>
    </SectionShell>
  );
}

export function Story({ props, ctx }: SectionProps) {
  const second = Boolean(str(props, "secondImageUrl"));
  return (
    <SectionShell props={{ ...props, align: "left" }} ctx={ctx} label={str(props, "heading")}>
      <div className="grid items-center gap-12 lg:grid-cols-12 lg:gap-10">
        <div className="relative lg:col-span-6">
          <div className="aspect-[4/5] overflow-hidden rounded-[calc(var(--radius)*1.6)] bg-muted sm:mr-16">
            {str(props, "imageUrl") ? (
              <SfImage props={props} field="imageUrl" sizes="(min-width: 1024px) 45vw, 90vw" />
            ) : (
              <EditorHint ctx={ctx}>{ctx.t.imagePlaceholder}</EditorHint>
            )}
          </div>
          {second ? (
            <div className="absolute right-0 -bottom-8 hidden aspect-square w-[42%] overflow-hidden rounded-[calc(var(--radius)*1.4)] border-4 border-background bg-muted sm:block">
              <SfImage props={props} field="secondImageUrl" sizes="20vw" />
            </div>
          ) : null}
        </div>
        <div className="lg:col-span-5 lg:col-start-8">
          {str(props, "eyebrow") ? <p className={EYEBROW}>{str(props, "eyebrow")}</p> : null}
          <h2 className="font-heading mt-3 text-[clamp(2rem,4.2vw,3.4rem)] leading-[1.02] font-semibold tracking-tight text-balance text-foreground">
            {str(props, "heading")}
          </h2>
          <div className="mt-6 space-y-4 text-base leading-[1.75] text-inksoft">
            {paragraphs(str(props, "body")).map((p, i) => (
              <p key={i} className="whitespace-pre-line">
                {p}
              </p>
            ))}
          </div>
          {str(props, "statValue") ? (
            <div className="mt-8 border-l-2 border-[var(--sf-primary-text)] pl-5">
              <p className="font-heading text-5xl font-semibold tracking-tight text-foreground">{str(props, "statValue")}</p>
              <p className="mt-1 text-sm text-muted-foreground">{str(props, "statLabel")}</p>
            </div>
          ) : null}
          {str(props, "signature") ? <p className="font-heading mt-8 text-2xl text-foreground italic">{str(props, "signature")}</p> : null}
          <div className="mt-8 flex">
            <Cta ctx={ctx} label={str(props, "ctaLabel")} target={str(props, "ctaHref", "products")} />
          </div>
        </div>
      </div>
    </SectionShell>
  );
}

export function Stats({ props, ctx }: SectionProps) {
  const stats = [1, 2, 3, 4].map((n) => ({ value: str(props, `stat${n}Value`), label: str(props, `stat${n}Label`) })).filter((s) => s.value);
  return (
    <SectionShell props={props} ctx={ctx} own="surface" label={str(props, "title")}>
      <SectionHeading props={props} title={str(props, "title")} subtitle={str(props, "subtitle")} />
      <dl className={cn("grid grid-cols-2 gap-x-6 gap-y-10", stats.length >= 4 ? "lg:grid-cols-4" : stats.length === 3 ? "lg:grid-cols-3" : "")}>
        {stats.map((stat) => (
          <div key={stat.label + stat.value} className="flex flex-col-reverse">
            <dt className="mt-2 text-sm leading-snug text-inksoft">{stat.label}</dt>
            <dd className="font-heading text-[clamp(2.6rem,6vw,4.6rem)] leading-none font-semibold tracking-tight text-foreground tabular-nums">
              {stat.value}
            </dd>
          </div>
        ))}
      </dl>
    </SectionShell>
  );
}

export function Faq({ props, ctx }: SectionProps) {
  const items = [1, 2, 3, 4, 5, 6].map((n) => ({ q: str(props, `q${n}`), a: str(props, `a${n}`) })).filter((i) => i.q && i.a);
  return (
    <SectionShell props={props} ctx={ctx} label={str(props, "title")}>
      <SectionHeading props={props} title={str(props, "title")} subtitle={str(props, "subtitle")} />
      <div className="divide-y divide-border border-y border-border text-left">
        {items.map((item, i) => (
          <details key={i} className="group py-1" open={ctx.preview && i === 0}>
            <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-4 text-base font-semibold text-foreground marker:hidden focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
              {item.q}
              <span aria-hidden className="sf-motion relative size-4 shrink-0 transition-transform group-open:rotate-45">
                <span className="absolute top-1/2 left-0 h-px w-4 -translate-y-1/2 bg-current" />
                <span className="absolute top-0 left-1/2 h-4 w-px -translate-x-1/2 bg-current" />
              </span>
            </summary>
            <p className="pb-5 text-sm leading-relaxed whitespace-pre-line text-inksoft">{item.a}</p>
          </details>
        ))}
      </div>
    </SectionShell>
  );
}

export function RichText({ props, ctx }: SectionProps) {
  return (
    <SectionShell props={{ ...props, width: props.width === "normal" ? "narrow" : props.width }} ctx={ctx} label={str(props, "heading")}>
      {str(props, "eyebrow") ? <p className={EYEBROW}>{str(props, "eyebrow")}</p> : null}
      <h2 className="font-heading mt-2 text-[clamp(1.5rem,2.8vw,2.1rem)] leading-tight font-semibold tracking-tight text-balance text-foreground">
        {str(props, "heading")}
      </h2>
      <div className="mt-4 space-y-4 text-base leading-relaxed text-inksoft">
        {paragraphs(str(props, "body")).map((p, i) => (
          <p key={i} className="whitespace-pre-line">
            {p}
          </p>
        ))}
      </div>
    </SectionShell>
  );
}

export function Contact({ props, ctx }: SectionProps) {
  const rows = [
    { icon: MapPin, label: ctx.t.contactAddress, value: str(props, "address"), href: "" },
    { icon: Clock, label: ctx.t.contactHours, value: str(props, "hours"), href: "" },
    { icon: Mail, label: ctx.t.contactEmail, value: str(props, "email"), href: str(props, "email") ? `mailto:${str(props, "email")}` : "" },
    { icon: Phone, label: ctx.t.contactPhone, value: str(props, "phone"), href: str(props, "phone") ? `tel:${str(props, "phone").replace(/[^\d+]/g, "")}` : "" },
  ].filter((row) => row.value);
  const hasImage = Boolean(str(props, "imageUrl"));
  return (
    <SectionShell props={{ ...props, align: "left" }} ctx={ctx} label={str(props, "title")}>
      <div className={cn("grid gap-10", hasImage ? "lg:grid-cols-2 lg:items-center lg:gap-16" : "")}>
        <div>
          <h2 className="font-heading text-[clamp(1.7rem,3.2vw,2.5rem)] leading-tight font-semibold tracking-tight text-foreground">{str(props, "title")}</h2>
          {str(props, "body") ? <p className="mt-3 max-w-xl text-base text-inksoft">{str(props, "body")}</p> : null}
          <dl className={cn("mt-8 grid gap-6", hasImage ? "" : "sm:grid-cols-2")}>
            {rows.map(({ icon: Icon, label, value, href }) => (
              <div key={label} className="flex gap-4">
                <Icon aria-hidden className="mt-0.5 size-5 shrink-0 text-[var(--sf-primary-text)]" strokeWidth={1.6} />
                <div>
                  <dt className="text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase">{label}</dt>
                  <dd className="mt-1 text-sm leading-relaxed whitespace-pre-line text-foreground">
                    {href && !ctx.preview ? (
                      <a href={href} className="underline-offset-4 hover:underline">
                        {value}
                      </a>
                    ) : (
                      value
                    )}
                  </dd>
                </div>
              </div>
            ))}
          </dl>
          {str(props, "mapUrl") ? (
            <a href={ctx.preview ? "#" : str(props, "mapUrl")} className="sf-btn sf-btn-secondary mt-8" target="_blank" rel="noreferrer">
              {ctx.t.directions}
            </a>
          ) : null}
        </div>
        {hasImage ? (
          <div className="aspect-[4/3] overflow-hidden rounded-[calc(var(--radius)*1.6)] bg-muted">
            <SfImage props={props} field="imageUrl" sizes="(min-width: 1024px) 560px, 100vw" />
          </div>
        ) : null}
      </div>
    </SectionShell>
  );
}

/* ------------------------------------------------------------------ media */

export function Gallery({ props, ctx }: SectionProps) {
  const layout = str(props, "layout", "mosaic");
  const photos = [1, 2, 3, 4, 5, 6].filter((n) => str(props, `image${n}`));
  const title = str(props, "title");
  if (photos.length === 0) {
    return (
      <SectionShell props={props} ctx={ctx}>
        <SectionHeading props={props} title={title} />
        <EditorHint ctx={ctx}>{ctx.t.imagePlaceholder}</EditorHint>
      </SectionShell>
    );
  }
  const photo = (n: number, i: number, className?: string) => {
    const caption = str(props, `caption${n}`);
    const href = resolveHref(ctx, str(props, `link${n}`));
    const frame = (
      <figure className="group relative h-full overflow-hidden rounded-[calc(var(--radius)*1.2)] bg-muted">
        <SfImage
          props={props}
          field={`image${n}`}
          alt={caption}
          sizes={layout === "mosaic" && i === 0 ? "(min-width: 1024px) 50vw, 100vw" : "(min-width: 1024px) 25vw, 50vw"}
          className="sf-motion transition-transform duration-700 ease-out group-hover:scale-[1.03]"
        />
        {caption ? (
          <figcaption className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-4 pt-10 text-left text-sm font-medium text-white">
            {caption}
          </figcaption>
        ) : null}
      </figure>
    );
    return (
      <li key={n} className={className}>
        {href ? (
          <SmartLink href={href} className="block h-full focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring">
            {frame}
          </SmartLink>
        ) : (
          frame
        )}
      </li>
    );
  };
  return (
    <SectionShell props={props} ctx={ctx} label={title}>
      <SectionHeading props={props} title={title} subtitle={str(props, "subtitle")} />
      {layout === "carousel" ? (
        <Carousel label={title || ctx.storeName} previous={ctx.t.previous} next={ctx.t.next}>
          {photos.map((n, i) => photo(n, i, "aspect-[4/5] w-[75%] shrink-0 snap-start sm:w-[40%] lg:w-[28%]"))}
        </Carousel>
      ) : layout === "grid" ? (
        <ul className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">{photos.map((n, i) => photo(n, i, "aspect-square"))}</ul>
      ) : (
        <ul className="grid auto-rows-[44vw] grid-cols-2 gap-3 sm:auto-rows-[30vw] sm:gap-4 lg:auto-rows-[17rem] lg:grid-cols-4">
          {photos.map((n, i) => photo(n, i, i === 0 ? "col-span-2 row-span-2" : i === 3 && photos.length === 4 ? "lg:col-span-2" : ""))}
        </ul>
      )}
    </SectionShell>
  );
}

const VIDEO_RATIOS: Record<string, string> = { "16:9": "16 / 9", "4:3": "4 / 3", "1:1": "1 / 1", "9:16": "9 / 16" };

export function VideoSection({ props, ctx }: SectionProps) {
  const url = str(props, "videoUrl");
  const title = str(props, "title");
  const ratio = VIDEO_RATIOS[str(props, "ratio", "16:9")] ?? VIDEO_RATIOS["16:9"];
  const { primary } = ctx.design.colors;
  return (
    <SectionShell props={props} ctx={ctx} label={title}>
      <SectionHeading props={props} title={title} subtitle={str(props, "body")} />
      {url ? (
        <div
          className={cn("relative mx-auto overflow-hidden rounded-[calc(var(--radius)*1.6)] bg-black", ratio === "9 / 16" ? "max-w-sm" : "")}
          style={{ aspectRatio: ratio }}
        >
          <VideoPlayer
            url={url}
            title={title || ctx.storeName}
            loop={props.autoplay === true}
            inert={ctx.preview}
            labels={{ play: ctx.t.play, pause: ctx.t.pause }}
            poster={
              str(props, "posterUrl") ? (
                <SfImage props={props} field="posterUrl" sizes="(min-width: 1024px) 1100px, 100vw" />
              ) : (
                <span className="block h-full w-full" style={{ background: `linear-gradient(135deg, ${primary}, ${mix(primary, "#000000", 0.6)})` }} />
              )
            }
          />
        </div>
      ) : (
        <EditorHint ctx={ctx}>{ctx.t.videoPlaceholder}</EditorHint>
      )}
    </SectionShell>
  );
}

export function LogoStrip({ props, ctx }: SectionProps) {
  const logos = [1, 2, 3, 4, 5, 6].filter((n) => str(props, `logo${n}`));
  const mono = props.monochrome !== false;
  return (
    <SectionShell props={props} ctx={ctx} label={str(props, "title")}>
      {str(props, "title") ? (
        <p className="mb-8 text-xs font-semibold tracking-[0.18em] text-muted-foreground uppercase">{str(props, "title")}</p>
      ) : null}
      {logos.length === 0 ? (
        <EditorHint ctx={ctx}>{ctx.t.imagePlaceholder}</EditorHint>
      ) : (
        <ul className={cn("flex flex-wrap items-center gap-x-10 gap-y-8 sm:gap-x-14", str(props, "align") === "center" ? "justify-center" : "")}>
          {logos.map((n) => (
            <li key={n} className="h-8 sm:h-10">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={str(props, `logo${n}`)}
                alt={str(props, `logo${n}Name`)}
                loading="lazy"
                className={cn("h-full w-auto max-w-[9rem] object-contain", mono ? "opacity-70 grayscale transition hover:opacity-100 hover:grayscale-0" : "")}
              />
            </li>
          ))}
        </ul>
      )}
    </SectionShell>
  );
}

/* ----------------------------------------------------------------- proof */

export function Testimonial({ props, ctx }: SectionProps) {
  const rating = Math.round(num(props, "rating", 5));
  return (
    <SectionShell props={{ ...props, width: props.width === "normal" ? "narrow" : props.width }} ctx={ctx} label={str(props, "author")}>
      <figure>
        <Stars rating={rating} label={ctx.t.ratingLabel.replace("{rating}", String(rating))} />
        <blockquote className="font-heading mt-6 text-[clamp(1.4rem,3vw,2.2rem)] leading-snug font-medium tracking-tight text-balance text-foreground">
          “{str(props, "quote")}”
        </blockquote>
        <figcaption className="mt-6 text-sm text-muted-foreground">
          <span className="font-semibold text-foreground">{str(props, "author")}</span>
          {str(props, "role") ? ` · ${str(props, "role")}` : ""}
        </figcaption>
      </figure>
    </SectionShell>
  );
}

export function TestimonialCarousel({ props, ctx }: SectionProps) {
  const rating = Math.round(num(props, "rating", 5));
  const quotes = [1, 2, 3, 4].map((n) => ({ n, quote: str(props, `quote${n}`), author: str(props, `author${n}`), role: str(props, `role${n}`) })).filter((q) => q.quote);
  const title = str(props, "title");
  return (
    <SectionShell props={props} ctx={ctx} own="surface" label={title}>
      <SectionHeading props={props} title={title} />
      <Carousel label={title || ctx.storeName} previous={ctx.t.previous} next={ctx.t.next}>
        {quotes.map((q) => (
          <li key={q.n} className="w-[86%] shrink-0 snap-start sm:w-[48%] lg:w-[32%]">
            <figure className="flex h-full flex-col rounded-[calc(var(--radius)*1.4)] border border-border bg-background p-6 text-left sm:p-7">
              <Stars rating={rating} label={ctx.t.ratingLabel.replace("{rating}", String(rating))} />
              <blockquote className="mt-4 flex-1 text-base leading-relaxed text-foreground">“{q.quote}”</blockquote>
              <figcaption className="mt-6 text-sm">
                <span className="font-semibold text-foreground">{q.author}</span>
                {q.role ? <span className="block text-muted-foreground">{q.role}</span> : null}
              </figcaption>
            </figure>
          </li>
        ))}
      </Carousel>
    </SectionShell>
  );
}

/* --------------------------------------------------------------- registry */

export const SECTION_COMPONENTS: Record<SectionType, (args: SectionProps) => React.ReactElement | null> = {
  HeroSection,
  ImageHero,
  Slideshow,
  PromoBanner,
  Countdown,
  ProductGrid,
  ProductCarousel,
  FeaturedProduct,
  CollectionTiles,
  ValueProps,
  MultiColumn,
  ImageWithText,
  Story,
  Stats,
  Gallery,
  VideoSection,
  LogoStrip,
  Testimonial,
  TestimonialCarousel,
  Faq,
  RichText,
  NewsletterSignup,
  Contact,
};

export function RenderSection({
  type,
  props,
  ctx,
  index,
}: {
  type: SectionType;
  props: Record<string, unknown>;
  ctx: StorefrontContext;
  /** The section's place on the page: the first one's photo loads eagerly and may sit under the header. */
  index?: number;
}) {
  const Component = SECTION_COMPONENTS[type];
  if (!Component) return null;
  return <Component props={props} ctx={ctx} index={index} />;
}
