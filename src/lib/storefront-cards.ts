/**
 * A product as a storefront card shows it: its two photos, its badges, the
 * colours it comes in and what quick add can offer. Shared by the home page,
 * the draft preview and the editor canvas, so all three draw the same card.
 */
import type { ProductBadge, StorefrontProductCard } from "@/components/storefront/kit";
import type { StoreProduct } from "./types";

const NEW_FOR_DAYS = 30;
/** More options than this and quick add sends the shopper to the product page instead. */
const QUICK_ADD_LIMIT = 12;

const has = (tags: string[], ...names: string[]) => tags.some((tag) => names.includes(tag.trim().toLowerCase()));

/**
 * What a card says about a product, from its stored record: sold out when no
 * enabled option can be bought, new for a month after publishing, and sale,
 * exclusive and best seller from the tags the store gave it.
 */
export function productBadges(product: Pick<StoreProduct, "variants" | "tags" | "publishedAt" | "shopperCustomization" | "giftCard">, now = Date.now()): ProductBadge[] {
  const enabled = product.variants.filter((v) => v.enabled);
  const badges: ProductBadge[] = [];
  if (enabled.length > 0 && enabled.every((v) => v.availability === "out_of_stock")) badges.push("soldOut");
  if (has(product.tags, "sale", "on sale")) badges.push("sale");
  if (has(product.tags, "exclusive", "limited")) badges.push("exclusive");
  const published = product.publishedAt ? Date.parse(product.publishedAt) : NaN;
  if (has(product.tags, "new") || (Number.isFinite(published) && now - published < NEW_FOR_DAYS * 86_400_000)) badges.push("new");
  if (has(product.tags, "bestseller", "best seller", "most wanted")) badges.push("bestseller");
  if (!product.giftCard && (product.shopperCustomization.textLine || product.shopperCustomization.artworkUpload)) badges.push("custom");
  return badges;
}

/**
 * The card for a product. `stored` is the record as saved (its tags decide the
 * badges, whatever language they are shown in); `shown` is the same product in
 * the shopper's language.
 */
export function productCard(stored: StoreProduct, shown: StoreProduct, price: string): StorefrontProductCard {
  const [first, ...rest] = shown.mockups;
  // The second photo is another view of the same colour where there is one.
  const second = rest.find((m) => m.colour === first?.colour && m.view !== first?.view) ?? rest[0];
  const enabled = shown.variants.filter((v) => v.enabled);
  const colours = new Map<string, string>();
  for (const v of enabled) if (v.colour && v.colourHex && !colours.has(v.colour)) colours.set(v.colour, v.colourHex);
  const manyColours = colours.size > 1;
  const manySizes = new Set(enabled.map((v) => v.size)).size > 1;
  const label = (v: (typeof enabled)[number]) =>
    manyColours && manySizes ? `${v.colour} / ${v.size}` : manySizes ? v.size : manyColours ? v.colour : v.name;

  return {
    id: shown.id,
    name: shown.name,
    slug: shown.slug,
    price,
    imageUrl: first?.url ?? null,
    secondImageUrl: second?.url ?? null,
    tagline: shown.description.split("\n")[0].slice(0, 140),
    badges: productBadges(stored),
    swatches: [...colours].map(([name, hex]) => ({ name, hex })),
    quickAdd:
      shown.giftCard || enabled.length === 0 || enabled.length > QUICK_ADD_LIMIT
        ? null
        : { variants: enabled.map((v) => ({ id: v.id, label: label(v), soldOut: v.availability === "out_of_stock" })) },
    tags: shown.tags,
  };
}
