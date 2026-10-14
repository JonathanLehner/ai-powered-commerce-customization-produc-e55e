import { ProductTile } from "@/components/ProductTiles";
import { QuickAdd } from "./client";
import type { ProductBadge, StorefrontContext, StorefrontProductCard } from "./kit";

const BADGE_STYLE: Record<ProductBadge, string> = {
  soldOut: "bg-foreground text-background",
  sale: "bg-[#b42318] text-white",
  new: "bg-background text-foreground ring-1 ring-foreground/15",
  exclusive: "bg-primary text-primary-foreground",
  bestseller: "bg-secondary text-secondary-foreground",
  custom: "bg-background/90 text-foreground ring-1 ring-foreground/15",
};

/** The small labels on a product photo: sold out first, at most two. */
export function ProductBadges({ badges, ctx }: { badges: ProductBadge[]; ctx: StorefrontContext }) {
  const labels: Record<ProductBadge, string> = {
    new: ctx.t.badgeNew,
    soldOut: ctx.t.badgeSoldOut,
    sale: ctx.t.badgeSale,
    exclusive: ctx.t.badgeExclusive,
    custom: ctx.t.badgeCustom,
    bestseller: ctx.t.badgeBestseller,
  };
  return (
    <>
      {badges.slice(0, 2).map((badge) => (
        <span
          key={badge}
          className={`rounded-[calc(var(--radius)*0.6)] px-2 py-1 text-[10px] leading-none font-semibold tracking-[0.08em] uppercase ${BADGE_STYLE[badge]}`}
        >
          {labels[badge]}
        </span>
      ))}
    </>
  );
}

/** A product card in a storefront section: the shared tile with badges, swatches and quick add. */
export function ProductCard({
  product,
  ctx,
  columns = 3,
  showPrice = true,
  showBadges = true,
  showSwatches = true,
  quickAdd = true,
  priority = false,
  as = "li",
  className,
}: {
  product: StorefrontProductCard;
  ctx: StorefrontContext;
  columns?: 2 | 3 | 4;
  showPrice?: boolean;
  showBadges?: boolean;
  showSwatches?: boolean;
  quickAdd?: boolean;
  priority?: boolean;
  as?: "li" | "div";
  className?: string;
}) {
  const badges = showBadges ? (product.badges ?? []) : [];
  return (
    <ProductTile
      as={as}
      className={className}
      columns={columns}
      href={ctx.preview ? undefined : `${ctx.base}/products/${product.slug}`}
      name={product.name}
      price={showPrice ? product.price : null}
      imageUrl={product.imageUrl}
      secondImageUrl={product.secondImageUrl}
      imageAlt={product.name}
      placeholder={ctx.t.previewSoon}
      priority={priority}
      swatches={showSwatches ? product.swatches : undefined}
      badge={badges.length > 0 ? <ProductBadges badges={badges} ctx={ctx} /> : undefined}
      action={
        quickAdd && product.quickAdd && ctx.storeId ? (
          <QuickAdd
            storeId={ctx.storeId}
            productId={product.id}
            variants={product.quickAdd.variants}
            inert={ctx.preview}
            labels={{ add: ctx.t.quickAdd, choose: ctx.t.chooseOption, added: ctx.t.added, soldOut: ctx.t.badgeSoldOut }}
          />
        ) : null
      }
    />
  );
}
