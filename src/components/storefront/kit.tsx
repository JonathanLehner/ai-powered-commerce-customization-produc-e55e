import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import {
  Award,
  Clock,
  Coffee,
  Gift,
  Globe,
  Heart,
  Leaf,
  Lock,
  Package,
  Palette,
  Recycle,
  RotateCcw,
  Ruler,
  ShieldCheck,
  Shirt,
  Smile,
  Sparkles,
  Star,
  Truck,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { ShopperMessages } from "@/i18n/shopper-copy";
import { srcSetFor } from "@/lib/image-variants";
import { ensureContrast, mix, readableOn, type ResolvedDesign } from "@/lib/store-design";
import type { IconKey } from "@/lib/storefront-schema";
import { cn } from "@/lib/utils";

/** A product as a card shows it: already localised and priced. */
export interface StorefrontProductCard {
  id: string;
  name: string;
  slug: string;
  /** Already formatted in the shopper's language and display currency. */
  price: string;
  imageUrl: string | null;
  /** The second photo, shown when the card is hovered. */
  secondImageUrl?: string | null;
  tagline: string;
  badges?: ProductBadge[];
  /** Up to the first few colours the product comes in. */
  swatches?: { name: string; hex: string }[];
  /** What quick add offers, or null when the product page has to be opened to buy it. */
  quickAdd?: { variants: { id: string; label: string; soldOut: boolean }[] } | null;
  tags?: string[];
}

export type ProductBadge = "new" | "soldOut" | "sale" | "exclusive" | "custom" | "bestseller";

/** A collection a section can draw from, with its products in collection order. */
export interface StorefrontCollection {
  id: string;
  handle: string;
  productIds: string[];
  /** In the language being shown. The editor lists collections by it. */
  name?: string;
  imageUrl?: string | null;
}

export interface StorefrontContext {
  storeId?: string;
  storeName: string;
  clientName: string;
  /** The storefront in the shopper's language: `/s/<slug>` or `/s/<slug>/de`. */
  base: string;
  logoUrl: string | null;
  design: ResolvedDesign;
  products: StorefrontProductCard[];
  /** The store's collections, for sections that show one. */
  collections?: StorefrontCollection[];
  /** When true the section renders inside the editor and links and forms are inert. */
  preview: boolean;
  /** The built-in section copy in the shopper's language, from the messages files. */
  t: ShopperMessages["sections"];
  /** The shopper's language, for dates and numbers. */
  locale: string;
  /** In a template's demo store: forms send nothing and say this instead. */
  demoNote?: string;
}

export type SectionProps = { props: Record<string, unknown>; ctx: StorefrontContext; index?: number };

/* ------------------------------------------------------------ reading */

export function str(props: Record<string, unknown>, key: string, fallback = ""): string {
  const value = props[key];
  return value === undefined || value === null ? fallback : String(value);
}

export function num(props: Record<string, unknown>, key: string, fallback: number): number {
  const value = Number(props[key]);
  return Number.isFinite(value) ? value : fallback;
}

export function on(props: Record<string, unknown>, key: string): boolean {
  return props[key] !== false;
}

/** Where a link field points, in the shopper's language. Inert in the editor. */
export function resolveHref(ctx: StorefrontContext, target: string): string | null {
  if (!target) return null;
  if (ctx.preview) return "#";
  if (target === "cart") return `${ctx.base}/cart`;
  if (target === "products") return `${ctx.base}/products`;
  if (target.startsWith("#") || target.startsWith("https://")) return target;
  const [kind, id] = target.split(":");
  if (kind === "collection") {
    const found = ctx.collections?.find((c) => c.id === id);
    return found ? `${ctx.base}/collections/${found.handle}` : `${ctx.base}/products`;
  }
  if (kind === "product") {
    const found = ctx.products.find((p) => p.id === id);
    return found ? `${ctx.base}/products/${found.slug}` : `${ctx.base}/products`;
  }
  return `${ctx.base}/products`;
}

/** A link that leaves the shop opens as a plain anchor; one inside it uses the router. */
export function SmartLink({ href, className, children, ...rest }: { href: string; className?: string; children: ReactNode; "aria-label"?: string }) {
  if (href.startsWith("https://") || href.startsWith("#")) {
    return (
      <a href={href} className={className} {...rest}>
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={className} {...rest}>
      {children}
    </Link>
  );
}

export function Cta({
  ctx,
  label,
  target,
  variant = "primary",
  className,
}: {
  ctx: StorefrontContext;
  label: string;
  target: string;
  variant?: "primary" | "secondary" | "media";
  className?: string;
}) {
  const href = resolveHref(ctx, target);
  if (!label || !href) return null;
  return (
    <SmartLink href={href} className={cn("sf-btn", `sf-btn-${variant}`, className)}>
      {label}
    </SmartLink>
  );
}

/* ------------------------------------------------------------- images */

/** "50 30" as CSS `object-position`. */
export function focalPosition(value: string): string {
  const match = /^(\d{1,3})\s+(\d{1,3})$/.exec(value.trim());
  return match ? `${match[1]}% ${match[2]}%` : "50% 50%";
}

/**
 * A section photo: the phone-sized copy for narrow screens when the editor
 * made one, prebuilt variants for the platform's own images, cropped around
 * its focal point. Only the first section's photo loads eagerly.
 */
export function SfImage({
  props,
  field,
  alt = "",
  sizes,
  priority = false,
  className,
  style,
}: {
  props: Record<string, unknown>;
  field: string;
  alt?: string;
  sizes: string;
  priority?: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  const src = str(props, field);
  if (!src) return null;
  const small = str(props, `${field}Small`);
  const variants = srcSetFor(src);
  // Prebuilt variants stop at 1024px; the original serves wider screens.
  const srcSet = small ? `${small} 960w, ${src} 2000w` : variants ? `${variants}, ${src} 1600w` : undefined;
  return (
    // Images here are arbitrary uploads or links without known dimensions; the
    // frame around them fixes the shape, so there is no layout shift.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      srcSet={srcSet}
      sizes={srcSet ? sizes : undefined}
      alt={alt}
      loading={priority ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : undefined}
      decoding={priority ? "sync" : "async"}
      className={cn("h-full w-full object-cover", className)}
      style={{ objectPosition: focalPosition(str(props, `${field}Focal`, "50 50")), ...style }}
    />
  );
}

/* --------------------------------------------------------------- icons */

const ICON_COMPONENTS: Record<IconKey, LucideIcon> = {
  sparkles: Sparkles,
  truck: Truck,
  shield: ShieldCheck,
  leaf: Leaf,
  heart: Heart,
  star: Star,
  gift: Gift,
  recycle: Recycle,
  globe: Globe,
  palette: Palette,
  shirt: Shirt,
  coffee: Coffee,
  package: Package,
  clock: Clock,
  award: Award,
  smile: Smile,
  lock: Lock,
  return: RotateCcw,
  ruler: Ruler,
  users: Users,
};

export function SfIcon({ name, className }: { name: string; className?: string }) {
  const Icon = ICON_COMPONENTS[name as IconKey] ?? Sparkles;
  return <Icon aria-hidden className={className} strokeWidth={1.6} />;
}

/* ------------------------------------------------------------- shell */

type Surface = "none" | "surface" | "primary" | "secondary" | "inverse" | "custom" | "image";

/**
 * The colours a section painted on another surface uses, worked out against
 * that surface so its copy, hairlines and buttons keep their contrast.
 */
function surfaceVariables(design: ResolvedDesign, bg: string, fg: string, primaryOnIt: boolean): Record<string, string> {
  const ink = ensureContrast(fg, [bg], 4.5);
  const primary = design.colors.primary;
  return {
    "--background": bg,
    "--card": bg,
    "--foreground": ink,
    "--card-foreground": ink,
    "--foreground-soft": ensureContrast(mix(ink, bg, 0.18), [bg], 4.5),
    "--muted-foreground": ensureContrast(mix(ink, bg, 0.32), [bg], 4.5),
    "--muted": mix(bg, ink, 0.07),
    "--border": mix(ink, bg, 0.78),
    "--sf-primary-text": primaryOnIt ? ink : ensureContrast(primary, [bg], 4.5),
    ...(primaryOnIt ? { "--primary": ink, "--primary-foreground": bg, "--ring": ink } : {}),
    background: bg,
    color: ink,
  };
}

function shellStyle(design: ResolvedDesign, surface: Surface, custom: string): CSSProperties | undefined {
  const { colors } = design;
  switch (surface) {
    case "surface":
      return surfaceVariables(design, colors.surface, colors.text, false) as CSSProperties;
    case "primary":
      return surfaceVariables(design, colors.primary, readableOn(colors.primary), true) as CSSProperties;
    case "secondary":
      return surfaceVariables(design, colors.secondary, readableOn(colors.secondary), false) as CSSProperties;
    case "inverse":
      return surfaceVariables(design, colors.text, colors.background, false) as CSSProperties;
    case "custom":
      return /^#[0-9a-f]{6}$/i.test(custom) ? (surfaceVariables(design, custom, readableOn(custom), false) as CSSProperties) : undefined;
    case "image":
      return surfaceVariables(design, "#111111", "#ffffff", false) as CSSProperties;
    default:
      return undefined;
  }
}

const WIDTHS: Record<string, string> = {
  narrow: "max-w-3xl",
  normal: "max-w-6xl",
  wide: "max-w-[88rem]",
  full: "max-w-none",
};

/**
 * Every section's outer frame: its background, its vertical room from the
 * store's density, the width its content runs to and its alignment. `own`
 * is what `auto` means for this section.
 */
export function SectionShell({
  props,
  ctx,
  own = "none",
  className,
  innerClassName,
  bleed = false,
  id,
  label,
  children,
}: {
  props: Record<string, unknown>;
  ctx: StorefrontContext;
  own?: Exclude<Surface, "custom" | "image">;
  className?: string;
  innerClassName?: string;
  /** Content runs edge to edge (a full-bleed hero); no side padding. */
  bleed?: boolean;
  id?: string;
  /** The section's accessible name, usually its heading. */
  label?: string;
  children: ReactNode;
}) {
  const chosen = str(props, "background", "auto");
  const surface = (chosen === "auto" ? own : chosen) as Surface;
  const backgroundImage = surface === "image" ? str(props, "backgroundImage") : "";
  const width = str(props, "width", "normal");
  return (
    <section
      id={id}
      aria-label={label || undefined}
      data-space={str(props, "spacing", "medium")}
      className={cn("sf-section relative isolate", className)}
      style={shellStyle(ctx.design, surface, str(props, "backgroundColor"))}
    >
      {backgroundImage ? (
        <div aria-hidden className="absolute inset-0 -z-10">
          <SfImage props={props} field="backgroundImage" sizes="100vw" />
          <div className="absolute inset-0 bg-black/55" />
        </div>
      ) : null}
      <div
        className={cn(
          "mx-auto w-full",
          bleed ? "" : width === "full" ? "px-4 sm:px-6 lg:px-10" : "px-4 sm:px-6",
          bleed ? "" : WIDTHS[width] ?? WIDTHS.normal,
          str(props, "align") === "center" ? "text-center" : "",
          innerClassName,
        )}
      >
        {children}
      </div>
    </section>
  );
}

/** The small, wide-tracked line above a heading. */
export const EYEBROW = "text-xs font-semibold tracking-[0.16em] uppercase text-[var(--sf-primary-text)]";

/** A section's heading block: eyebrow, title and subtitle, aligned with the section. */
export function SectionHeading({
  props,
  eyebrow,
  title,
  subtitle,
  action,
  as: Tag = "h2",
  id,
}: {
  props: Record<string, unknown>;
  eyebrow?: string;
  title: string;
  subtitle?: string;
  action?: ReactNode;
  as?: "h1" | "h2";
  id?: string;
}) {
  const centred = str(props, "align") === "center";
  if (!title && !subtitle && !eyebrow && !action) return null;
  return (
    <div
      className={cn(
        "mb-8 flex flex-wrap gap-x-6 gap-y-3 sm:mb-10",
        centred ? "flex-col items-center text-center" : "items-end justify-between",
      )}
    >
      <div className={cn("min-w-0", centred ? "mx-auto max-w-2xl" : "max-w-2xl")}>
        {eyebrow ? <p className={cn(EYEBROW, "mb-3")}>{eyebrow}</p> : null}
        {title ? (
          <Tag id={id} className="font-heading text-[clamp(1.6rem,3.2vw,2.4rem)] leading-[1.08] font-semibold tracking-tight text-balance text-foreground">
            {title}
          </Tag>
        ) : null}
        {subtitle ? <p className="mt-3 text-base leading-relaxed text-pretty text-inksoft">{subtitle}</p> : null}
      </div>
      {action}
    </div>
  );
}

/** "View all" beside a heading, underlined like the merch shops do. */
export function ViewAll({ href, label }: { href: string; label: string }) {
  return (
    <SmartLink
      href={href}
      className="inline-flex shrink-0 items-center gap-1.5 border-b border-current pb-0.5 text-sm font-semibold tracking-wide text-foreground hover:text-[var(--sf-primary-text)]"
    >
      {label}
    </SmartLink>
  );
}
