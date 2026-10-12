import "server-only";
import { campaignPath, campaignToken, portalUrl } from "../gift-access";
import type { GiftCampaign, GiftCatalogue } from "../types";

/**
 * Gift catalogues and campaigns as the API returns them, matching what the
 * workspace shows the store team: the catalogue's private link (the address
 * handed to the company) and, while a campaign waits, the approver's own link.
 * The secret the links are derived from, the open Stripe session and the
 * payment's idempotency key stay inside.
 */

export async function presentGiftCatalogue(catalogue: GiftCatalogue, origin: string) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { accessSecret: _accessSecret, ...rest } = catalogue;
  return {
    ...rest,
    translations: catalogue.translations ?? {},
    portalUrl: await portalUrl(origin, catalogue),
  };
}

export async function presentGiftCampaign(campaign: GiftCampaign, catalogue: GiftCatalogue | null, origin: string) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { idempotencyKey: _idempotencyKey, payment, ...rest } = campaign;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { checkoutSessionId: _session, stripeAccountId: _account, ...paymentState } = payment;
  const awaiting = campaign.approval.required && campaign.status === "awaiting_approval";
  return {
    ...rest,
    payment: paymentState,
    approvalUrl:
      awaiting && catalogue
        ? `${origin}${campaignPath(catalogue.slug, campaign.code, await campaignToken(campaign.id, "approver"), "approver")}`
        : null,
    orderIds: campaign.recipients.flatMap((recipient) => (recipient.orderId ? [recipient.orderId] : [])),
  };
}

/** The buyer's own campaign page: where they follow, pay for or withdraw it. Given out once, on creation. */
export async function buyerUrl(campaign: GiftCampaign, catalogue: GiftCatalogue, origin: string): Promise<string> {
  return `${origin}${campaignPath(catalogue.slug, campaign.code, await campaignToken(campaign.id, "buyer"), "buyer")}`;
}
