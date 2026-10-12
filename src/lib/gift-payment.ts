import "server-only";
import { refreshCustomers } from "./customer-data";
import { COLLECTIONS, getOrderByIdempotencyKey, recordAudit, updateGiftCampaign } from "./data";
import { routeOrder } from "./fulfillment";
import { quoteCampaign } from "./gifting";
import { deductStock, trackedLines } from "./inventory";
import { db } from "./mongo";
import { refreshPages } from "./order-payment";
import type { GiftCampaign, Order, Store } from "./types";
import { newId, orderCode } from "./util";

export interface CampaignPayment {
  paymentIntentId: string | null;
  last4: string | null;
  /** The Stripe account and session, on a live store. Null on a demo store. */
  stripeAccountId: string | null;
  checkoutSessionId: string | null;
  /** The campaign timeline note, for the store team. */
  note: string;
}

/**
 * Turns a paid campaign into one order per recipient.
 *
 * The buyer pays once for the whole programme; every order it creates carries
 * the campaign, the shared payment intent and its own idempotency key, so the
 * store's queue can be worked per campaign. A demo store calls this straight
 * after its simulated payment, a live store from the verified webhook. A second
 * call finds the orders the first one made and changes nothing.
 */
export async function raiseCampaignOrders(
  campaign: GiftCampaign,
  store: Store,
  payment: CampaignPayment,
): Promise<"raised" | "already_ordered" | "not_payable"> {
  const key = `gift_${campaign.id}`;
  if (campaign.status === "ordered" || (await getOrderByIdempotencyKey(store.id, `${key}:0`))) {
    return "already_ordered";
  }
  if (campaign.status !== "approved") return "not_payable";
  const quote = await quoteCampaign(store, campaign.recipients, campaign.currency, campaign.spendLimitPerRecipient);
  if (quote.problems.length > 0) return "not_payable";

  const now = new Date().toISOString();
  const orders: Order[] = quote.lines.map((line, index) => {
    const recipient = line.recipient;
    return {
      id: newId("ord"),
      storeId: store.id,
      code: orderCode(),
      status: "paid",
      currency: campaign.currency,
      customer: {
        name: recipient.name,
        email: recipient.email,
        line1: recipient.line1,
        city: recipient.city,
        postalCode: recipient.postalCode,
        country: recipient.country,
      },
      items: [
        {
          id: newId("oit"),
          storeProductId: recipient.storeProductId,
          variantId: recipient.variantId,
          productName: recipient.productName,
          variantName: recipient.variantName,
          quantity: recipient.quantity,
          unitPrice: line.unit,
          supplierCost:
            line.product?.variants.find((v) => v.id === recipient.variantId)?.baseCost ?? 0,
          customization: {
            artworkUrl: null,
            artworkFileName: null,
            text: null,
            previewUrl: line.product?.mockups[0]?.url ?? null,
          },
          supplierId: line.product?.supplierId ?? "",
        },
      ],
      subtotal: line.goods,
      shipping: line.shipping,
      taxAmount: line.taxAmount,
      taxRate: line.taxRows.length === 1 ? line.taxRows[0].rate : 0,
      taxLines: line.taxRows,
      total: line.total,
      payment: {
        provider: "stripe",
        status: "succeeded",
        paymentIntentId: payment.paymentIntentId,
        stripeAccountId: payment.stripeAccountId,
        last4: payment.last4,
        failureMessage: null,
        paidAt: now,
        ...(payment.checkoutSessionId ? { checkoutSessionId: payment.checkoutSessionId } : {}),
      },
      fulfillment: {
        supplierId: null,
        supplierName: null,
        routing: "pending",
        supplierOrderRef: null,
        submittedAt: null,
        submissionMessage: null,
        carrier: null,
        trackingNumber: null,
        trackingUrl: null,
        exception: null,
      },
      refunds: [],
      events: [
        {
          at: now,
          status: "Payment captured",
          note: `Part of gift campaign ${campaign.code}.`,
          actor: "Stripe",
        },
        ...(recipient.note
          ? [{ at: now, status: "Gift message", note: recipient.note, actor: campaign.buyer.name }]
          : []),
      ],
      campaign: {
        campaignId: campaign.id,
        campaignCode: campaign.code,
        campaignName: campaign.name,
        catalogueId: campaign.catalogueId,
        recipientId: recipient.id,
      },
      idempotencyKey: `${key}:${index}`,
      createdAt: now,
      updatedAt: now,
    };
  });

  // Routing is per order, because recipients sit in different regions and a
  // supplier that covers one may not cover the next.
  const decisions = await Promise.all(orders.map((order) => routeOrder(order, store)));
  decisions.forEach((decision, index) => {
    const order = orders[index];
    order.fulfillment = {
      ...order.fulfillment,
      supplierId: decision.supplierId,
      supplierName: decision.supplierName,
      routing: decision.routing,
      supplierOrderRef: decision.supplierOrderRef,
      submittedAt: decision.routing === "submitted" ? now : null,
      submissionMessage: decision.message,
      exception: decision.exception,
    };
    order.events.push({
      at: now,
      status: decision.routing === "submitted" ? "Sent to supplier" : "Manual handling required",
      note: decision.message,
      actor: "Parcelith routing",
    });
    if (decision.routing === "submitted") order.status = "in_production";
    if (decision.exception) order.status = "exception";
  });

  // Gift orders are paid before they exist, so their tracked units come off
  // hand straight away rather than being held first.
  for (const order of orders) {
    const lines = await trackedLines(order.items);
    if (lines.length > 0) order.inventory = { state: "committed", lines };
  }
  await db.insertMany(COLLECTIONS.orders, orders as unknown as Record<string, unknown>[]);
  for (const order of orders) await deductStock(order, store);
  refreshCustomers(store, orders.map((order) => order.customer.email));

  const held = orders.filter((order) => order.fulfillment.routing !== "submitted").length;
  await updateGiftCampaign(campaign.id, {
    status: "ordered",
    recipients: campaign.recipients.map((recipient, index) => ({
      ...recipient,
      unitPrice: quote.lines[index].unit,
      orderId: orders[index].id,
      orderCode: orders[index].code,
    })),
    totals: {
      subtotal: quote.subtotal,
      shipping: quote.shipping,
      taxAmount: quote.taxAmount,
      taxLines: quote.taxRows,
      total: quote.total,
    },
    payment: {
      status: "succeeded",
      paymentIntentId: payment.paymentIntentId,
      last4: payment.last4,
      paidAt: now,
      checkoutSessionId: payment.checkoutSessionId,
      stripeAccountId: payment.stripeAccountId,
    },
    idempotencyKey: key,
    events: [
      ...campaign.events,
      {
        at: now,
        status: "Paid",
        note: payment.note,
        actor: campaign.buyer.name,
      },
      {
        at: now,
        status: "Orders created",
        note: `${orders.length} orders raised${held > 0 ? `, ${held} held for manual routing` : " and sent to production"}.`,
        actor: "Parcelith routing",
      },
    ],
  });

  recordAudit({
    category: "gifting",
    action: "gifting.campaign_ordered",
    summary: `Gift campaign ${campaign.code} paid: ${orders.length} orders raised${held > 0 ? `, ${held} awaiting manual routing` : ""}`,
    storeId: store.id,
    agencyId: store.agencyId,
    actorId: "gifting",
    actorName: campaign.buyer.name,
    entity: "gift_campaign",
    entityId: campaign.code,
    meta: { orders: orders.length, total: quote.total, currency: campaign.currency, held },
    notify: {
      type: "order_paid",
      href: `/app/stores/${store.id}/orders/campaigns/${campaign.id}`,
      params: { code: campaign.code, count: orders.length, amount: quote.total, currency: campaign.currency },
    },
  });

  refreshPages([`/app/stores/${store.id}/orders`], [`/app/stores/${store.id}/gifting`]);
  return "raised";
}
