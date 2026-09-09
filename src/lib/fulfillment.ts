import "server-only";
import { getSupplier, listCatalogProducts, listStoreProducts, listSuppliers } from "./data";
import { countryName, regionForCountry } from "./countries";
import { orderRequirements, routingChoices, unmetBy } from "./supplier-routing";
import type { Order, RoutingOptions, Store, Supplier } from "./types";

// The country → region table lives in ./countries so the checkout form can warn
// a shopper about an out-of-region destination before they pay, using exactly
// the test routing applies afterwards.
export { regionForCountry };

export interface RoutingDecision {
  routing: "submitted" | "manual_required" | "failed";
  supplierId: string | null;
  supplierName: string | null;
  supplierOrderRef: string | null;
  message: string;
  exception: string | null;
}

function supplierRef(supplier: Supplier, order: Order): string {
  const prefix = supplier.name.slice(0, 3).toUpperCase().replace(/[^A-Z]/g, "X");
  return `${prefix}-${order.code.replace("ORD-", "")}`;
}

/**
 * Decides where a paid order goes. Suppliers with a production API receive the
 * job automatically; sourcing marketplaces and out-of-region jobs are flagged
 * for a human because those platforms have no order submission API.
 */
export async function routeOrder(order: Order, store: Store): Promise<RoutingDecision> {
  // A reroute is a human decision about where production goes. Re-running
  // routing re-checks that decision instead of falling back to the item
  // mapping, which would send the job straight back to the supplier the order
  // manager moved it off.
  const overrideId = order.fulfillment.reroute ? order.fulfillment.supplierId : null;
  const supplierIds = Array.from(new Set(order.items.map((i) => i.supplierId).filter(Boolean)));
  if (!overrideId && supplierIds.length === 0) {
    return {
      routing: "manual_required",
      supplierId: null,
      supplierName: null,
      supplierOrderRef: null,
      message: "No supplier is attached to the items on this order.",
      exception: "Order items have no supplier mapping — assign one before production.",
    };
  }

  const supplier = await getSupplier(overrideId ?? supplierIds[0]);
  if (!supplier) {
    return {
      routing: "failed",
      supplierId: overrideId ?? supplierIds[0],
      supplierName: null,
      supplierOrderRef: null,
      message: "The supplier record for these items no longer exists.",
      exception: "Supplier record missing. Re-link the product to an approved supplier.",
    };
  }

  if (!overrideId && supplierIds.length > 1) {
    return {
      routing: "manual_required",
      supplierId: supplier.id,
      supplierName: supplier.name,
      supplierOrderRef: null,
      message: "Items on this order come from more than one supplier and must be split by hand.",
      exception: "Multi-supplier order — split the job across suppliers before submitting.",
    };
  }

  if (supplier.status !== "approved") {
    return {
      routing: "manual_required",
      supplierId: supplier.id,
      supplierName: supplier.name,
      supplierOrderRef: null,
      message: `${supplier.name} is not an approved supplier, so the order was held.`,
      exception: `${supplier.name} is pending platform approval.`,
    };
  }

  const region = regionForCountry(order.customer.country);
  // Coverage is judged on the catalog products this supplier would actually
  // make, not only on the regions its supplier record claims: a partner can
  // trade in a region and still not produce this particular product line
  // there. The supplier picker applies the same test, so an order held here
  // is never offered back to the partner that could not take it.
  const [catalog, storeProducts] = await Promise.all([
    listCatalogProducts(),
    listStoreProducts(order.storeId),
  ]);
  const requirements = orderRequirements(order, storeProducts, catalog);
  const theirs = catalog.filter((product) => product.supplierId === supplier.id);
  const unmetHere = unmetBy(theirs, requirements, region);
  if (unmetHere.length > 0) {
    const madeSomewhere = unmetBy(theirs, requirements).length === 0;
    const needs = unmetHere.map((r) => r.label).join(", ");
    return {
      routing: "manual_required",
      supplierId: supplier.id,
      supplierName: supplier.name,
      supplierOrderRef: null,
      message: madeSomewhere
        ? `${supplier.name} does not fulfil to ${countryName(order.customer.country)} (${region}). Route this job to an alternative production partner.`
        : `${supplier.name} no longer lists ${needs} in its catalog. Route this job to an alternative production partner.`,
      exception: madeSomewhere
        ? `Destination ${countryName(order.customer.country)} (${order.customer.country} · ${region}) is outside ${supplier.name}'s fulfilment regions for ${needs}.`
        : `${supplier.name} does not make ${needs}. Re-link the product to an approved supplier.`,
    };
  }
  if (!supplier.regions.includes(region)) {
    return {
      routing: "manual_required",
      supplierId: supplier.id,
      supplierName: supplier.name,
      supplierOrderRef: null,
      message: `${supplier.name} does not fulfil to ${countryName(order.customer.country)} (${region}). Route this job to an alternative production partner.`,
      exception: `Destination ${countryName(order.customer.country)} (${order.customer.country} · ${region}) is outside ${supplier.name}'s fulfilment regions.`,
    };
  }

  if (supplier.integration !== "api" || !supplier.capabilities.orderSubmission) {
    return {
      routing: "manual_required",
      supplierId: supplier.id,
      supplierName: supplier.name,
      supplierOrderRef: null,
      message: `${supplier.name} has no order submission API. Raise the purchase order manually and record the reference here.`,
      exception: null,
    };
  }

  const enabledCarriers = store.carriers.filter((c) => c.enabled);
  if (enabledCarriers.length === 0) {
    return {
      routing: "manual_required",
      supplierId: supplier.id,
      supplierName: supplier.name,
      supplierOrderRef: null,
      message: "No shipping carrier is enabled for this store, so the job cannot be dispatched.",
      exception: "Enable DHL, FedEx or UPS in store settings before routing production.",
    };
  }

  return {
    routing: "submitted",
    supplierId: supplier.id,
    supplierName: supplier.name,
    supplierOrderRef: supplierRef(supplier, order),
    message: `Production job accepted by ${supplier.name} (${supplier.leadTimeDays[0]}–${supplier.leadTimeDays[1]} day lead time).`,
    exception: null,
  };
}

/**
 * Where else this order could be produced, resolved against the live supplier
 * and catalog records: the partners that could take the job now, and the ones
 * that cover the destination but have to be ordered from by hand.
 */
export async function routingOptionsFor(order: Order, store: Store): Promise<RoutingOptions> {
  const [suppliers, catalog, storeProducts] = await Promise.all([
    listSuppliers(),
    listCatalogProducts(),
    listStoreProducts(order.storeId),
  ]);
  const region = regionForCountry(order.customer.country);
  const requirements = orderRequirements(order, storeProducts, catalog);

  return {
    region,
    destination: countryName(order.customer.country),
    requirements,
    ...routingChoices({
      suppliers,
      catalog,
      requirements,
      region,
      excludeSupplierId: order.fulfillment.supplierId,
    }),
    carriersEnabled: store.carriers.some((c) => c.enabled),
  };
}

/**
 * Hands the job to a supplier an order manager picked. The eligibility rules
 * are the automatic ones, re-checked here because the choice arrives from a
 * browser and the supplier list may have moved on since the page was drawn.
 */
export async function submitToSupplier(
  order: Order,
  store: Store,
  supplier: Supplier,
): Promise<RoutingDecision> {
  const options = await routingOptionsFor(order, store);
  const eligible = options.available.some((choice) => choice.id === supplier.id);

  if (!eligible) {
    const manual = options.manualOnly.some((choice) => choice.id === supplier.id);
    const same = supplier.id === order.fulfillment.supplierId;
    return {
      routing: "manual_required",
      supplierId: supplier.id,
      supplierName: supplier.name,
      supplierOrderRef: null,
      message: manual
        ? `${supplier.name} has no order submission API. Raise the purchase order manually and record the reference here.`
        : same
          ? `${supplier.name} already holds this job and could not produce it. Pick a different production partner.`
          : `${supplier.name} cannot take this job — check it is approved, produces ${options.requirements.map((r) => r.label).join(", ")} for ${options.region}, and is not the partner this job already failed on.`,
      exception: null,
    };
  }

  if (!options.carriersEnabled) {
    return {
      routing: "manual_required",
      supplierId: supplier.id,
      supplierName: supplier.name,
      supplierOrderRef: null,
      message: "No shipping carrier is enabled for this store, so the job cannot be dispatched.",
      exception: "Enable DHL, FedEx or UPS in store settings before routing production.",
    };
  }

  return {
    routing: "submitted",
    supplierId: supplier.id,
    supplierName: supplier.name,
    supplierOrderRef: supplierRef(supplier, order),
    message: `Production job accepted by ${supplier.name} (${supplier.leadTimeDays[0]}–${supplier.leadTimeDays[1]} day lead time).`,
    exception: null,
  };
}

export function trackingNumberFor(carrier: "dhl" | "fedex" | "ups", code: string): string {
  const digits = code.replace(/\D/g, "").padEnd(9, "0").slice(0, 9);
  if (carrier === "dhl") return `JD${digits}0${digits.slice(0, 4)}`;
  if (carrier === "fedex") return `7${digits}${digits.slice(0, 3)}`;
  return `1Z${digits.slice(0, 6)}W${digits.slice(0, 8)}`;
}
