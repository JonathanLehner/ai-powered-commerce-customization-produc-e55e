import "server-only";
import { revalidatePath } from "next/cache";
import { refreshCustomers } from "./customer-data";
import { COLLECTIONS, recordAudit, releaseDiscountUse, updateOrder } from "./data";
import { brandFor, orderConfirmationEmail } from "./email-templates";
import { sendEmail, siteOrigin } from "./email";
import { localCountryName } from "./countries";
import { routeOrder } from "./fulfillment";
import { commitOrderStock, releaseOrderStock } from "./inventory";
import { db } from "./mongo";
import { orderStatusUrl, signOrderToken } from "./order-access";
import { emailCopy, shopperLocale } from "@/i18n/storefront";
import { localeBase, storeLanguages } from "@/i18n/storefront-routing";
import type { Order, Store } from "./types";
import { formatMoney } from "./util";

/**
 * What happens to a storefront order once its payment is settled, either way.
 *
 * Orders are written as `awaiting_payment` before the shopper pays. A demo
 * store settles its simulated payment straight away; a live store waits for
 * Stripe's webhook. Both land here, and every write is guarded on the order
 * still awaiting payment, so a webhook delivered twice, or the completed and
 * async-succeeded events for one session, settle it once.
 */

/**
 * Clears the cached pages an order shows on. Best effort: the payment is
 * already recorded by then, and a cache that fails to clear must not fail the
 * webhook and have Stripe deliver the event again.
 */
export function refreshPages(...paths: [string, ("layout" | "page")?][]): void {
  for (const [path, type] of paths) {
    try {
      revalidatePath(path, type);
    } catch (error) {
      console.error(`Could not revalidate ${path}`, error);
    }
  }
}

export interface SettledPayment {
  paymentIntentId: string | null;
  last4: string | null;
  /** The timeline note, for the store team. */
  note: string;
}

/** The storefront's address in the language the shopper checked out in. */
function shopperBase(store: Store, order: Order): string {
  const locale = shopperLocale(store, order.locale ?? store.defaultLanguage);
  return localeBase(`/s/${store.slug}`, locale, storeLanguages(store).defaultLocale);
}

/**
 * Marks the order paid, takes its stock off hand, routes it to production and
 * tells the shopper. False
 * when it was not awaiting payment, which means this already ran.
 */
export async function confirmOrderPayment(order: Order, store: Store, payment: SettledPayment): Promise<boolean> {
  const now = new Date().toISOString();
  const paid: Order = {
    ...order,
    status: "paid",
    payment: {
      ...order.payment,
      status: "succeeded",
      paymentIntentId: payment.paymentIntentId ?? order.payment.paymentIntentId,
      last4: payment.last4,
      failureMessage: null,
      paidAt: now,
    },
    events: [...order.events, { at: now, status: "Payment captured", note: payment.note, actor: "Stripe" }],
  };

  // Route the paid order to production and record the result on the order.
  const decision = await routeOrder(paid, store);
  paid.fulfillment = {
    ...paid.fulfillment,
    supplierId: decision.supplierId,
    supplierName: decision.supplierName,
    routing: decision.routing,
    supplierOrderRef: decision.supplierOrderRef,
    submittedAt: decision.routing === "submitted" ? now : null,
    submissionMessage: decision.message,
    exception: decision.exception,
  };
  paid.events.push({
    at: now,
    status: decision.routing === "submitted" ? "Sent to supplier" : "Manual handling required",
    note: decision.message,
    actor: "Parcelith routing",
  });
  if (decision.routing === "submitted") paid.status = "in_production";
  if (decision.exception) paid.status = "exception";

  const written = await updateOrder(
    order.id,
    { status: paid.status, payment: paid.payment, fulfillment: paid.fulfillment, events: paid.events },
    { status: "awaiting_payment" },
  );
  if (!written) return false;
  await commitOrderStock(order, store);

  const { code, storeId, currency, total, discount } = order;
  if (order.cartId) {
    await db.updateOne(
      COLLECTIONS.carts,
      { id: order.cartId },
      { $set: { items: [], discountCode: null, updatedAt: now } },
    );
  }
  refreshCustomers(store, [order.customer.email]);
  if (discount) {
    recordAudit({
      category: "discounts",
      action: "discount.redeemed",
      summary: `${discount.code} redeemed on ${code}: ${formatMoney(discount.amount, currency)} off`,
      storeId,
      agencyId: store.agencyId,
      actorId: "system",
      actorName: "Shopper",
      entity: "discount_code",
      entityId: discount.codeId,
      meta: { order: code, amount: discount.amount, currency },
    });
  }
  recordAudit({
    category: "order_routing",
    action: decision.routing === "submitted" ? "order.routed" : "order.manual_required",
    summary:
      decision.routing === "submitted"
        ? `Routed ${code} to ${decision.supplierName} automatically after payment`
        : `${code} flagged for manual supplier handling after payment`,
    storeId,
    agencyId: store.agencyId,
    actorId: "system",
    actorName: "Parcelith routing",
    entity: "order",
    entityId: code,
    meta: { total, currency, routing: decision.routing },
    notify: {
      type: "order_paid",
      href: `/app/stores/${storeId}/orders/${order.id}`,
      params: { code, amount: total, currency },
    },
  });

  refreshPages([`/s/${store.slug}`, "layout"], [`/app/stores/${storeId}/orders`]);

  // The confirmation is queued, never awaited, and every failure inside it is
  // swallowed into the activity log: a shopper who has paid must not see an
  // error because the mail provider was down.
  try {
    const origin = await siteOrigin();
    const token = await signOrderToken(storeId, code);
    const { customer } = order;
    const locale = shopperLocale(store, order.locale ?? store.defaultLanguage);
    sendEmail({
      to: customer.email,
      message: orderConfirmationEmail(brandFor(store), await emailCopy(locale), {
        customerName: customer.name,
        code,
        total,
        currency,
        deliveryAddress: [
          customer.line1,
          customer.line2,
          customer.city,
          customer.region,
          customer.postalCode,
          localCountryName(customer.country, locale),
        ]
          .filter(Boolean)
          .join(", "),
        statusUrl: `${origin}${orderStatusUrl(shopperBase(store, order), code, token)}`,
      }),
      kind: "order confirmation",
      storeId,
      agencyId: store.agencyId,
      entity: "order",
      entityId: code,
    });
  } catch (error) {
    console.error("Order confirmation email could not be queued", error);
  }
  return true;
}

/**
 * Closes an order whose payment failed or whose Checkout session expired, and
 * gives its discount use and the stock it held back. False when it was not awaiting payment.
 */
export async function abandonOrderPayment(
  order: Order,
  store: Store,
  reason: "failed" | "expired",
): Promise<boolean> {
  const now = new Date().toISOString();
  const note = reason === "failed" ? "The payment did not go through." : "Checkout was not completed in time.";
  const written = await updateOrder(
    order.id,
    {
      status: "cancelled",
      payment: { ...order.payment, status: "failed", failureMessage: note },
      events: [
        ...order.events,
        { at: now, status: reason === "failed" ? "Payment failed" : "Checkout expired", note, actor: "Stripe" },
      ],
    },
    { status: "awaiting_payment" },
  );
  if (!written) return false;
  if (order.discount) await releaseDiscountUse(order.discount.codeId);
  await releaseOrderStock(order);
  recordAudit({
    category: "order_routing",
    action: reason === "failed" ? "order.payment_failed" : "order.checkout_expired",
    summary: `${order.code} closed unpaid: ${note.toLowerCase()}`,
    storeId: store.id,
    agencyId: store.agencyId,
    actorId: "system",
    actorName: "Stripe",
    entity: "order",
    entityId: order.code,
    meta: { total: order.total, currency: order.currency },
  });
  refreshPages([`/app/stores/${store.id}/orders`]);
  return true;
}
