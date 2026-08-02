import Image from "next/image";
import Link from "next/link";
import type { SectionType } from "@/lib/storefront-schema";
import type { ThemeKey } from "@/lib/types";
import { THEMES } from "@/lib/types";
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
}

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

export function HeroSection({ props, ctx }: { props: Record<string, unknown>; ctx: StorefrontContext }) {
  const accent = THEMES[ctx.theme].accent;
  const centred = str(props, "align", "left") === "center";
  const tone = str(props, "tone", "light");
  const image = str(props, "imageUrl");

  return (
    <section
      className={
        tone === "dark"
          ? "bg-ink text-white"
          : tone === "accent"
            ? "text-white"
            : "bg-canvas text-ink"
      }
      style={tone === "accent" ? { background: accent } : undefined}
    >
      <div
        className={`mx-auto grid w-full max-w-6xl gap-8 px-4 py-12 sm:px-6 sm:py-16 ${
          image ? "lg:grid-cols-2 lg:items-center" : ""
        }`}
      >
        <div className={centred && !image ? "mx-auto max-w-2xl text-center" : ""}>
          {str(props, "eyebrow") ? (
            <p
              className="text-xs font-semibold uppercase tracking-[0.14em]"
              style={{ color: tone === "light" ? accent : undefined }}
            >
              {str(props, "eyebrow")}
            </p>
          ) : null}
          <h1 className="mt-3 text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
            {str(props, "headline", "Welcome")}
          </h1>
          <p className={`mt-4 text-base leading-relaxed ${tone === "light" ? "text-inksoft" : "text-white/85"}`}>
            {str(props, "body")}
          </p>
          {str(props, "ctaLabel") ? (
            <div className={`mt-7 ${centred && !image ? "flex justify-center" : ""}`}>
              <Link
                href={href(ctx, str(props, "ctaHref", "products"))}
                className="inline-flex items-center rounded-lg px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
                style={{ background: tone === "light" ? accent : "#0d1524" }}
              >
                {str(props, "ctaLabel")}
              </Link>
            </div>
          ) : null}
        </div>
        {image ? (
          <div className="overflow-hidden rounded-2xl border border-black/5 bg-white/40">
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
  const accent = THEMES[ctx.theme].accent;
  const tone = str(props, "tone", "accent");
  return (
    <div
      className={tone === "light" ? "bg-canvas text-ink" : "text-white"}
      style={tone === "accent" ? { background: accent } : tone === "dark" ? { background: "#0d1524" } : undefined}
    >
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-center gap-3 px-4 py-2.5 text-sm sm:px-6">
        <span className="font-medium">{str(props, "text")}</span>
        {str(props, "ctaLabel") ? (
          <Link href={href(ctx, str(props, "ctaHref", "products"))} className="underline underline-offset-4">
            {str(props, "ctaLabel")}
          </Link>
        ) : null}
      </div>
    </div>
  );
}

export function ValueProps({ props, ctx }: { props: Record<string, unknown>; ctx: StorefrontContext }) {
  const accent = THEMES[ctx.theme].accent;
  const items = [
    { title: str(props, "itemOneTitle"), body: str(props, "itemOneBody") },
    { title: str(props, "itemTwoTitle"), body: str(props, "itemTwoBody") },
    { title: str(props, "itemThreeTitle"), body: str(props, "itemThreeBody") },
  ].filter((i) => i.title);

  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6">
      {str(props, "title") ? (
        <h2 className="text-2xl font-semibold tracking-tight text-ink">{str(props, "title")}</h2>
      ) : null}
      <div className="mt-6 grid gap-5 md:grid-cols-3">
        {items.map((item) => (
          <div key={item.title} className="rounded-xl border border-line bg-white p-5">
            <span aria-hidden className="block h-1 w-8 rounded-full" style={{ background: accent }} />
            <h3 className="mt-3 text-base font-semibold text-ink">{item.title}</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-inksoft">{item.body}</p>
          </div>
        ))}
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
    columns === "2" ? "sm:grid-cols-2" : columns === "4" ? "sm:grid-cols-2 lg:grid-cols-4" : "sm:grid-cols-2 lg:grid-cols-3";

  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          {str(props, "title") ? (
            <h2 className="text-2xl font-semibold tracking-tight text-ink">{str(props, "title")}</h2>
          ) : null}
          {str(props, "subtitle") ? (
            <p className="mt-1.5 max-w-xl text-sm text-inksoft">{str(props, "subtitle")}</p>
          ) : null}
        </div>
        <Link href={href(ctx, "products")} className="text-sm font-medium text-brand-700 hover:underline">
          View all
        </Link>
      </div>

      {products.length === 0 ? (
        <p className="mt-6 rounded-xl border border-dashed border-line bg-canvas px-5 py-10 text-center text-sm text-muted">
          No products are published in this store yet. Published products appear here automatically.
        </p>
      ) : (
        <ul className={`mt-6 grid gap-5 ${colClass}`}>
          {products.map((product) => (
            <li key={product.id} className="group overflow-hidden rounded-xl border border-line bg-white">
              <Link href={ctx.preview ? "#" : `/s/${ctx.slug}/products/${product.slug}`}>
                <div className="bg-canvas">
                  {product.imageUrl ? (
                    <Image
                      src={product.imageUrl}
                      alt={product.name}
                      width={640}
                      height={640}
                      loading="lazy"
                      sizes="(min-width: 1024px) 380px, (min-width: 640px) 45vw, 90vw"
                      className="h-auto w-full object-cover transition group-hover:scale-[1.02]"
                      style={{ aspectRatio: "1 / 1" }}
                    />
                  ) : (
                    <div className="flex items-center justify-center text-sm text-muted" style={{ aspectRatio: "1 / 1" }}>
                      Preview coming soon
                    </div>
                  )}
                </div>
                <div className="p-4">
                  <h3 className="text-sm font-semibold text-ink">{product.name}</h3>
                  <p className="mt-1 line-clamp-2 text-xs text-muted">{product.tagline}</p>
                  {showPrice ? (
                    <p className="mt-2 text-sm font-semibold tabular-nums text-ink">
                      {formatMoney(product.price, product.currency)}
                    </p>
                  ) : null}
                </div>
              </Link>
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
    <section className="border-y border-line bg-canvas">
      <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-12 sm:px-6 lg:grid-cols-2 lg:items-center">
        <div className={right ? "lg:order-2" : ""}>
          {image ? (
            <div className="overflow-hidden rounded-2xl border border-line bg-white">
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
              className="flex items-center justify-center rounded-2xl border border-dashed border-line bg-white text-sm text-muted"
              style={{ aspectRatio: "4 / 3" }}
            >
              Add an image URL in the section settings
            </div>
          )}
        </div>
        <div className={right ? "lg:order-1" : ""}>
          <h2 className="text-2xl font-semibold tracking-tight text-ink">{str(props, "heading")}</h2>
          <p className="mt-3 text-sm leading-relaxed text-inksoft sm:text-base">{str(props, "body")}</p>
          <p className="mt-4 text-xs text-muted">{ctx.clientName}</p>
        </div>
      </div>
    </section>
  );
}

export function RichText({ props }: { props: Record<string, unknown>; ctx: StorefrontContext }) {
  const centred = str(props, "align", "left") === "center";
  return (
    <section className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6">
      <div className={centred ? "text-center" : ""}>
        <h2 className="text-xl font-semibold tracking-tight text-ink">{str(props, "heading")}</h2>
        <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-inksoft">{str(props, "body")}</p>
      </div>
    </section>
  );
}

export function Testimonial({ props, ctx }: { props: Record<string, unknown>; ctx: StorefrontContext }) {
  const accent = THEMES[ctx.theme].accent;
  return (
    <section className="mx-auto w-full max-w-4xl px-4 py-12 sm:px-6">
      <figure className="rounded-2xl border border-line bg-white p-8 text-center">
        <span aria-hidden className="mx-auto block h-1 w-10 rounded-full" style={{ background: accent }} />
        <blockquote className="mt-5 text-lg leading-relaxed text-ink">“{str(props, "quote")}”</blockquote>
        <figcaption className="mt-4 text-sm text-muted">
          <span className="font-medium text-ink">{str(props, "author")}</span>
          {str(props, "role") ? ` · ${str(props, "role")}` : ""}
        </figcaption>
      </figure>
    </section>
  );
}

export function NewsletterSignup({ props, ctx }: { props: Record<string, unknown>; ctx: StorefrontContext }) {
  const accent = THEMES[ctx.theme].accent;
  return (
    <section className="border-t border-line bg-canvas">
      <div className="mx-auto w-full max-w-3xl px-4 py-12 text-center sm:px-6">
        <h2 className="text-xl font-semibold tracking-tight text-ink">{str(props, "heading")}</h2>
        <p className="mt-2 text-sm text-inksoft">{str(props, "body")}</p>
        <form
          className="mx-auto mt-5 flex max-w-md flex-col gap-2 sm:flex-row"
          action={ctx.preview ? undefined : `/s/${ctx.slug}/products`}
        >
          <label htmlFor="newsletter-email" className="sr-only">
            Email address
          </label>
          <input
            id="newsletter-email"
            type="email"
            name="email"
            placeholder="you@example.com"
            className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-brand-500 focus:outline-2 focus:outline-brand-500/40"
          />
          <button
            type="submit"
            className="rounded-lg px-4 py-2 text-sm font-semibold text-white"
            style={{ background: accent }}
          >
            {str(props, "buttonLabel", "Notify me")}
          </button>
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
