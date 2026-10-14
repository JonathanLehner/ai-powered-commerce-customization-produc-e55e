/**
 * The home page a store gets before anyone has designed one: built from its
 * own products, collections and name, in the shopper's language, so a new
 * store opens on a finished-looking page rather than an empty one. The editor
 * starts from the same page, so what a team sees first is what they edit.
 */
import MANIFEST from "../../scripts/image-manifest.json";
import type { ShopperMessages } from "@/i18n/shopper-copy";
import type { SectionType } from "./storefront-schema";

type Generated = ShopperMessages["sections"]["generated"];

const IMAGES = MANIFEST as Record<string, string>;

/** Neutral photography for a store with no photos of its own yet. */
export const DEFAULT_IMAGES = {
  hero: IMAGES["storefront-default-hero"] ?? "",
  story: IMAGES["storefront-default-story"] ?? "",
  flatlay: IMAGES["storefront-default-flatlay"] ?? "",
};

export interface GeneratedHomeInput {
  storeName: string;
  products: { id: string; imageUrl: string | null }[];
  collections: { id: string; productIds: string[] }[];
  copy: Generated;
}

const fill = (text: string, store: string) => text.replace("{store}", store);

export function generatedHomeSections({ storeName, products, collections, copy }: GeneratedHomeInput): { type: SectionType; props: Record<string, unknown> }[] {
  const withProducts = collections.filter((c) => c.productIds.length > 0);
  const sections: { type: SectionType; props: Record<string, unknown> }[] = [];

  if (products.length === 0) {
    sections.push({
      type: "ImageHero",
      props: {
        eyebrow: storeName,
        headline: copy.soonHeadline,
        body: copy.soonBody,
        ctaLabel: "",
        imageUrl: DEFAULT_IMAGES.hero,
        imageUrlFocal: "72 45",
        height: "large",
        position: "bottom-left",
        overlay: 40,
      },
    });
    sections.push({ type: "NewsletterSignup", props: { heading: copy.newsletterHeading, body: copy.newsletterBody, buttonLabel: copy.newsletterButton } });
    return sections;
  }

  sections.push({
    type: "ImageHero",
    props: {
      eyebrow: storeName,
      headline: copy.heroHeadline,
      body: fill(copy.heroBody, storeName),
      ctaLabel: copy.heroCta,
      ctaHref: "products",
      secondaryLabel: "",
      imageUrl: DEFAULT_IMAGES.hero,
      imageUrlFocal: "72 45",
      height: "large",
      position: "bottom-left",
      overlay: 35,
    },
  });
  sections.push({
    type: "ProductCarousel",
    props: { title: copy.newArrivals, subtitle: "", ctaLabel: copy.shopAll, source: "all", limit: 10, layout: "top" },
  });
  if (withProducts.length >= 2) {
    sections.push({ type: "CollectionTiles", props: { title: copy.collections, subtitle: "", ratio: "portrait", layout: "grid" } });
  }
  sections.push({
    type: "MultiColumn",
    props: {
      title: "",
      subtitle: "",
      columns: "3",
      media: "icon",
      background: "surface",
      column1Icon: "sparkles",
      column1Title: copy.value1Title,
      column1Body: copy.value1Body,
      column2Icon: "truck",
      column2Title: copy.value2Title,
      column2Body: copy.value2Body,
      column3Icon: "lock",
      column3Title: copy.value3Title,
      column3Body: copy.value3Body,
      column4Title: "",
      column4Body: "",
    },
  });
  if (products.length > 4) {
    sections.push({ type: "ProductGrid", props: { title: copy.allProducts, subtitle: "", source: "all", columns: "4", limit: 8 } });
  }
  sections.push({
    type: "ImageWithText",
    props: {
      eyebrow: copy.storyEyebrow,
      heading: copy.storyHeading,
      body: copy.storyBody,
      ctaLabel: copy.shopAll,
      ctaHref: "products",
      imageUrl: DEFAULT_IMAGES.story,
      imageSide: "right",
      background: "none",
    },
  });
  sections.push({
    type: "NewsletterSignup",
    props: { heading: copy.newsletterHeading, body: copy.newsletterBody, buttonLabel: copy.newsletterButton },
  });
  return sections;
}
