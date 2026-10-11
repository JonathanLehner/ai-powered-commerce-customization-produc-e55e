import "server-only";
import { getLocale, getTranslations } from "next-intl/server";
import { artworkIssueText } from "@/i18n/artwork-copy";
import { blockingIssues, validateArtwork } from "./artwork";
import { getCatalogProduct } from "./data";
import type { CatalogProduct, StoreProduct } from "./types";
import { formatMoney } from "./util";

export interface PublishBlocker {
  reason: string;
  fix: string;
}

/**
 * Everything that must be true before each product can go live, keyed by
 * product id. Products sharing a supplier listing read it once.
 */
export async function publishBlockersFor(products: StoreProduct[]): Promise<Map<string, PublishBlocker[]>> {
  const [t, issuesT, locale] = await Promise.all([
    getTranslations("actions.products.blockers"),
    getTranslations("artworkIssues"),
    getLocale(),
  ]);
  const catalogIds = [...new Set(products.map((p) => p.catalogProductId))];
  const catalogs = new Map<string, CatalogProduct | null>(
    await Promise.all(catalogIds.map(async (id) => [id, await getCatalogProduct(id)] as const)),
  );

  const out = new Map<string, PublishBlocker[]>();
  for (const product of products) {
    const catalog = catalogs.get(product.catalogProductId) ?? null;
    const blockers: PublishBlocker[] = [];
    out.set(product.id, blockers);

    if (!catalog) {
      blockers.push({ reason: t("retired"), fix: t("retiredFix") });
      continue;
    }
    if (product.artworks.length === 0) {
      blockers.push({ reason: t("noArtwork"), fix: t("noArtworkFix") });
    }
    for (const artwork of product.artworks) {
      const area = catalog.printAreas.find((a) => a.id === artwork.printAreaId);
      if (!area) continue;
      for (const issue of blockingIssues(validateArtwork(artwork, area, catalog.fileRequirements))) {
        const text = artworkIssueText(issuesT, issue, locale);
        blockers.push({ reason: t("area", { area: area.name, message: text.message }), fix: text.fix });
      }
    }
    if (product.mockups.length === 0) {
      blockers.push({ reason: t("noMockups"), fix: t("noMockupsFix") });
    } else if (product.mockups.some((m) => !m.approved)) {
      blockers.push({ reason: t("unapproved"), fix: t("unapprovedFix") });
    }
    if (!product.taxBracketId) {
      blockers.push({ reason: t("noBracket"), fix: t("noBracketFix") });
    }
    if (product.costs.marginAmount <= 0) {
      blockers.push({
        reason: t("belowCost", { margin: formatMoney(product.costs.marginAmount, product.currency, locale) }),
        fix: t("belowCostFix"),
      });
    }
    if (!product.variants.some((v) => v.enabled)) {
      blockers.push({ reason: t("noVariants"), fix: t("noVariantsFix") });
    }
  }
  return out;
}
