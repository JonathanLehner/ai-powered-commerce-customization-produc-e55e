import "server-only";
import { getLocale, getTranslations } from "next-intl/server";
import { artworkIssueText } from "@/i18n/artwork-copy";
import type { Locale } from "@/i18n/locales";
import { blockingIssues, validateArtwork } from "./artwork";
import { getCatalogProduct, listShippingZones } from "./data";
import type { CatalogProduct, StoreProduct } from "./types";
import { formatMoney } from "./util";

export interface PublishBlocker {
  reason: string;
  fix: string;
  /** Set on a supplier pre-flight issue in the placed artwork. */
  preflight?: true;
}

/**
 * Everything that must be true before each product can go live, keyed by
 * product id. Products sharing a supplier listing read it once. Written in
 * `language`, or the workspace's language when none is given.
 */
export async function publishBlockersFor(
  products: StoreProduct[],
  language?: Locale,
): Promise<Map<string, PublishBlocker[]>> {
  const locale = language ?? (await getLocale());
  const [t, issuesT] = await Promise.all([
    getTranslations({ locale, namespace: "actions.products.blockers" }),
    getTranslations({ locale, namespace: "artworkIssues" }),
  ]);
  const catalogIds = [...new Set(products.map((p) => p.catalogProductId))];
  const storeIds = [...new Set(products.map((p) => p.storeId))];
  const [catalogs, shipsAnywhere] = await Promise.all([
    Promise.all(catalogIds.map(async (id) => [id, await getCatalogProduct(id)] as const)).then(
      (rows) => new Map<string, CatalogProduct | null>(rows),
    ),
    // A store cannot sell what it has nowhere to ship.
    Promise.all(storeIds.map(async (id) => [id, (await listShippingZones(id)).length > 0] as const)).then(
      (rows) => new Map<string, boolean>(rows),
    ),
  ]);

  const out = new Map<string, PublishBlocker[]>();
  for (const product of products) {
    const catalog = catalogs.get(product.catalogProductId) ?? null;
    const blockers: PublishBlocker[] = [];
    out.set(product.id, blockers);

    if (!shipsAnywhere.get(product.storeId)) {
      blockers.push({ reason: t("noShippingZone"), fix: t("noShippingZoneFix") });
    }
    // An imported product has no supplier listing or print artwork; its own
    // photos are what shoppers see.
    if (!catalog && !product.imported) {
      blockers.push({ reason: t("retired"), fix: t("retiredFix") });
      continue;
    }
    if (catalog && product.artworks.length === 0) {
      blockers.push({ reason: t("noArtwork"), fix: t("noArtworkFix") });
    }
    for (const artwork of product.artworks) {
      const area = catalog?.printAreas.find((a) => a.id === artwork.printAreaId);
      if (!area || !catalog) continue;
      for (const issue of blockingIssues(validateArtwork(artwork, area, catalog.fileRequirements))) {
        const text = artworkIssueText(issuesT, issue, locale);
        blockers.push({ reason: t("area", { area: area.name, message: text.message }), fix: text.fix, preflight: true });
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
