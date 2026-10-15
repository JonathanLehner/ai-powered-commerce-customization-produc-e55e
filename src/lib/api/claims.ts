import "server-only";
import type { OperationContext } from "../operations/context";
import { publishReview } from "../operations/storefront";
import { suggestedFreeRate, type ClaimProblem } from "../shipping-claims";
import { listShippingZones } from "../data";
import { storeFxTable } from "../currency";

/**
 * Shipping claims on a draft that the store's rates do not back, and the
 * template sample copy left on it, as API results carry them. Each free
 * shipping claim comes with the "Free over an amount" rate per zone that
 * would make it true, ready for createShippingRate. Empty when there is
 * nothing to review.
 */

function money(minor: number, currency: string): string {
  const digits = new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions().maximumFractionDigits ?? 2;
  const major = minor / 10 ** digits;
  return new Intl.NumberFormat("en", {
    style: "currency",
    currency,
    minimumFractionDigits: Number.isInteger(major) ? 0 : digits,
  }).format(major);
}

function explain(problem: ClaimProblem, currency: string): string {
  switch (problem.kind) {
    case "free":
      return problem.zones.length
        ? `Promises free shipping, but the rates in ${problem.zones.join(", ")} charge for it.`
        : "Promises free shipping, but the store has no shipping zones and charges standard shipping.";
    case "freeOver":
      return problem.zones.length
        ? `Promises free shipping over ${money(problem.threshold, currency)}, but no rate in ${problem.zones.join(", ")} is free from that amount.`
        : `Promises free shipping over ${money(problem.threshold, currency)}, but the store has no shipping zones.`;
    case "days":
      return `Promises delivery within ${problem.days} days, but the fastest shipping rate takes up to ${problem.fastest}.`;
    case "sample":
      return "A delivery promise from the template's sample copy. Rewrite it for this store or remove it.";
  }
}

export async function shippingClaimNotes(ctx: OperationContext, tree: unknown) {
  const [review, zones] = await Promise.all([publishReview(ctx, tree), listShippingZones(ctx.store.id)]);
  if (review.claims.length === 0 && review.sample.length === 0) return {};
  const currency = ctx.store.defaultCurrency;
  const fx = storeFxTable(ctx.store);
  const claims = review.claims.map((claim) => {
    const { problem } = claim;
    const rates =
      problem.kind === "freeOver"
        ? zones
            .filter((zone) => problem.zones.includes(zone.name))
            .map((zone) => ({
              zoneId: zone.id,
              zoneName: zone.name,
              name: `Free shipping over ${money(problem.threshold, currency)}`,
              ...suggestedFreeRate(zone, problem.threshold, currency, fx),
            }))
        : [];
    return { field: claim.key, text: claim.text, problem: explain(problem, ctx.store.defaultCurrency), ...(rates.length ? { matchingRates: rates } : {}) };
  });
  return {
    ...(claims.length
      ? {
          shippingClaims: claims,
          shippingClaimsNote:
            "This copy promises shipping the store's rates do not give. Tell the person. Where matchingRates is listed, offer to create that rate with createShippingRate (kind free_over) in each zone, or to change the copy.",
        }
      : {}),
    // Fields still holding a template's sample shipping claims, deadlines, countdowns and testimonials.
    ...(review.sample.length ? { sampleCopyLeft: review.sample.length } : {}),
  };
}
