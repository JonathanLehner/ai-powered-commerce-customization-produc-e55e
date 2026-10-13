/**
 * What the platform's transactional emails say and look like.
 *
 * An email is the one surface the shopper reads outside the storefront, so it
 * carries the same two things the storefront does: the reader's language (the
 * `storefront.email` messages) and the store's branding (logo, name, the
 * merchant of record). Nothing here touches the network or the request — the
 * builders are pure and take their translator and formatter from the caller,
 * so `npm run email-check` renders every template in every language.
 */
import type { createFormatter } from "next-intl";
import { formatMinorUnits } from "@/i18n/format";
import type { ShopperTranslator } from "@/i18n/shopper-copy";
import type { Store } from "./types";

export interface BuiltEmail {
  subject: string;
  html: string;
  text: string;
}

/** The store as an email sees it: a name and a logo. */
export interface EmailBrand {
  storeName: string;
  clientName: string;
  logoUrl: string | null;
  supportEmail: string | null;
}

/** The language an email is written in: next-intl's translator and formatter for it. */
export interface EmailCopy {
  locale: string;
  t: ShopperTranslator<"email">;
  format: ReturnType<typeof createFormatter>;
}

export function brandFor(store: Pick<Store, "name" | "clientName" | "logoUrl" | "supportEmail">): EmailBrand {
  const support = (store.supportEmail ?? "").trim().toLowerCase();
  return {
    storeName: store.name,
    clientName: store.clientName,
    logoUrl: store.logoUrl,
    supportEmail: support || null,
  };
}

interface EmailBody {
  heading: string;
  greetingName?: string;
  paragraphs: string[];
  rows?: { label: string; value: string }[];
  action?: { label: string; url: string };
  /** A second, quieter link under the button. */
  link?: { label: string; url: string };
  /** Small print above the footer. */
  footnote?: string;
}

function escape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * One layout for all four emails: the store's logo or name at the top, the
 * message, a single action button, and the merchant-of-record line every
 * storefront footer carries. Styles are inline because email clients drop
 * stylesheets.
 */
function render(brand: EmailBrand, copy: EmailCopy, subject: string, body: EmailBody): BuiltEmail {
  const { t, locale: lang } = copy;
  const greeting = body.greetingName ? t("greeting", { name: body.greetingName }) : null;
  const footer =
    brand.clientName && brand.clientName !== brand.storeName
      ? t("footer", { client: brand.clientName, store: brand.storeName })
      : brand.storeName;
  const support = brand.supportEmail ? t("support", { email: brand.supportEmail }) : null;

  const header = brand.logoUrl
    ? `<img src="${escape(brand.logoUrl)}" alt="${escape(t("logoAlt", { store: brand.storeName }))}" height="40" style="max-height:40px;border:0;display:block" />`
    : `<strong style="font-size:18px;color:#0f172a">${escape(brand.storeName)}</strong>`;

  const rows = (body.rows ?? [])
    .map(
      (row) =>
        `<tr><td style="padding:4px 16px 4px 0;color:#64748b;font-size:14px">${escape(row.label)}</td>` +
        `<td style="padding:4px 0;color:#0f172a;font-size:14px">${escape(row.value)}</td></tr>`,
    )
    .join("");

  const html = `<!doctype html>
<html lang="${escape(lang)}"><head><meta charset="utf-8" /><title>${escape(subject)}</title></head>
<body style="margin:0;padding:24px;background:#f8fafc;font-family:ui-sans-serif,system-ui,'Segoe UI',Arial,sans-serif">
<div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;padding:28px">
<div style="margin-bottom:20px">${header}</div>
<h1 style="margin:0 0 16px;font-size:20px;line-height:1.3;color:#0f172a">${escape(body.heading)}</h1>
${greeting ? `<p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:#334155">${escape(greeting)}</p>` : ""}
${body.paragraphs.map((p) => `<p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:#334155">${escape(p)}</p>`).join("\n")}
${rows ? `<table role="presentation" style="margin:16px 0;border-collapse:collapse">${rows}</table>` : ""}
${
  body.action
    ? `<p style="margin:24px 0"><a href="${escape(body.action.url)}" style="display:inline-block;padding:12px 20px;border-radius:10px;background:#0f172a;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none">${escape(body.action.label)}</a></p>
<p style="margin:0 0 12px;font-size:12px;line-height:1.6;color:#64748b;word-break:break-all">${escape(body.action.url)}</p>`
    : ""
}
${
  body.link
    ? `<p style="margin:0 0 12px;font-size:14px;line-height:1.6"><a href="${escape(body.link.url)}" style="color:#0f172a">${escape(body.link.label)}</a></p>`
    : ""
}
${support ? `<p style="margin:16px 0 0;font-size:13px;line-height:1.6;color:#64748b">${escape(support)}</p>` : ""}
${body.footnote ? `<p style="margin:12px 0 0;font-size:12px;line-height:1.6;color:#94a3b8">${escape(body.footnote)}</p>` : ""}
<p style="margin:20px 0 0;padding-top:16px;border-top:1px solid #e2e8f0;font-size:12px;line-height:1.6;color:#94a3b8">${escape(footer)}</p>
</div></body></html>`;

  const text = [
    brand.storeName,
    "",
    body.heading,
    ...(greeting ? ["", greeting] : []),
    "",
    ...body.paragraphs,
    ...(body.rows ?? []).map((row) => `${row.label}: ${row.value}`),
    ...(body.action ? ["", `${body.action.label}: ${body.action.url}`] : []),
    ...(body.link ? [`${body.link.label}: ${body.link.url}`] : []),
    ...(support ? ["", support] : []),
    ...(body.footnote ? ["", body.footnote] : []),
    "",
    footer,
  ].join("\n");

  return { subject, html, text };
}

/* ----------------------------------------------------------------- shopper */

export interface OrderConfirmationInput {
  customerName: string;
  code: string;
  total: number;
  currency: string;
  deliveryAddress: string;
  statusUrl: string;
  /** The rate the order ships with and what it cost. */
  shipping?: { name: string; amount: number };
  /** One row per rate; a null rate is a single amount from Stripe Tax. */
  taxRows?: { rate: number | null; amount: number }[];
  /** The tax is already in the prices rather than added to them. */
  taxInclusive?: boolean;
  invoiceUrl?: string;
}

export function orderConfirmationEmail(
  brand: EmailBrand,
  copy: EmailCopy,
  order: OrderConfirmationInput,
): BuiltEmail {
  const { t } = copy;
  return render(brand, copy, t("orderSubject", { code: order.code, store: brand.storeName }), {
    heading: t("orderHeading"),
    greetingName: order.customerName,
    paragraphs: [t("orderBody", { code: order.code })],
    rows: [
      ...(order.shipping
        ? [
            {
              label: t("orderShippingLabel", { rate: order.shipping.name }),
              value: formatMinorUnits(copy.format, order.shipping.amount, order.currency),
            },
          ]
        : []),
      ...(order.taxRows ?? []).map((row) => {
        const amount = formatMinorUnits(copy.format, row.amount, order.currency);
        return {
          label: row.rate === null ? t("orderTaxLabel") : t("orderTaxRateLabel", { rate: row.rate }),
          value: order.taxInclusive ? t("orderTaxIncluded", { amount }) : amount,
        };
      }),
      { label: t("orderTotalLabel"), value: formatMinorUnits(copy.format, order.total, order.currency) },
      { label: t("orderDeliveryLabel"), value: order.deliveryAddress },
    ],
    action: { label: t("orderCta"), url: order.statusUrl },
    ...(order.invoiceUrl ? { link: { label: t("orderInvoice"), url: order.invoiceUrl } } : {}),
  });
}

export interface ShippingNotificationInput {
  customerName: string;
  code: string;
  carrierName: string;
  trackingNumber: string;
  /** The carrier's own page, or null when only the order page can be linked. */
  trackingUrl: string | null;
  statusUrl: string;
  /** What is in this parcel, when it holds only part of the order. */
  partialItems?: { name: string; quantity: number }[] | null;
}

export function shippingNotificationEmail(
  brand: EmailBrand,
  copy: EmailCopy,
  shipment: ShippingNotificationInput,
): BuiltEmail {
  const { t } = copy;
  const partial = shipment.partialItems?.length ? shipment.partialItems : null;
  return render(brand, copy, t(partial ? "shippedPartialSubject" : "shippedSubject", { code: shipment.code, store: brand.storeName }), {
    heading: t(partial ? "shippedPartialHeading" : "shippedHeading"),
    greetingName: shipment.customerName,
    paragraphs: [
      t(partial ? "shippedPartialBody" : "shippedBody", { code: shipment.code, carrier: shipment.carrierName }),
    ],
    rows: [
      { label: t("shippedTrackingLabel"), value: shipment.trackingNumber },
      ...(partial ?? []).map((item) => ({ label: item.name, value: t("shippedQuantity", { count: item.quantity }) })),
    ],
    action: shipment.trackingUrl
      ? { label: t("shippedCta"), url: shipment.trackingUrl }
      : { label: t("orderCta"), url: shipment.statusUrl },
  });
}

export interface OrderRefund {
  amount: number;
  currency: string;
  reason: string;
}

function refundRows(copy: EmailCopy, refund: OrderRefund): { label: string; value: string }[] {
  return [
    { label: copy.t("refundAmountLabel"), value: formatMinorUnits(copy.format, refund.amount, refund.currency) },
    ...(refund.reason ? [{ label: copy.t("refundReasonLabel"), value: refund.reason }] : []),
  ];
}

export interface RefundIssuedInput {
  customerName: string;
  code: string;
  refund: OrderRefund;
  statusUrl: string;
}

/** Money given back on an order, how much, why, and when it reaches the card. */
export function refundIssuedEmail(brand: EmailBrand, copy: EmailCopy, input: RefundIssuedInput): BuiltEmail {
  const { t } = copy;
  const amount = formatMinorUnits(copy.format, input.refund.amount, input.refund.currency);
  return render(brand, copy, t("refundSubject", { code: input.code, store: brand.storeName }), {
    heading: t("refundHeading"),
    greetingName: input.customerName,
    paragraphs: [t("refundBody", { amount, code: input.code }), t("refundTiming")],
    rows: refundRows(copy, input.refund),
    action: { label: t("orderCta"), url: input.statusUrl },
  });
}

export interface OrderCancelledInput {
  customerName: string;
  code: string;
  /** The refund issued with the cancellation, if there was one. */
  refund?: OrderRefund | null;
  statusUrl: string;
}

export function orderCancelledEmail(brand: EmailBrand, copy: EmailCopy, input: OrderCancelledInput): BuiltEmail {
  const { t } = copy;
  return render(brand, copy, t("cancelledSubject", { code: input.code, store: brand.storeName }), {
    heading: t("cancelledHeading"),
    greetingName: input.customerName,
    paragraphs: [
      t("cancelledBody", { code: input.code }),
      ...(input.refund
        ? [t("cancelledRefund", { amount: formatMinorUnits(copy.format, input.refund.amount, input.refund.currency) }), t("refundTiming")]
        : []),
    ],
    rows: input.refund ? refundRows(copy, input.refund) : [],
    action: { label: t("orderCta"), url: input.statusUrl },
  });
}

export interface OrderDeliveredInput {
  customerName: string;
  code: string;
  statusUrl: string;
}

export function orderDeliveredEmail(brand: EmailBrand, copy: EmailCopy, input: OrderDeliveredInput): BuiltEmail {
  const { t } = copy;
  return render(brand, copy, t("deliveredSubject", { code: input.code, store: brand.storeName }), {
    heading: t("deliveredHeading"),
    greetingName: input.customerName,
    paragraphs: [t("deliveredBody", { code: input.code })],
    action: { label: t("orderCta"), url: input.statusUrl },
  });
}

export interface CheckoutRecoveryInput {
  customerName: string;
  items: { name: string; variant: string; quantity: number }[];
  restoreUrl: string;
}

/** The one email sent after a checkout expired unpaid, linking back to the basket. */
export function checkoutRecoveryEmail(brand: EmailBrand, copy: EmailCopy, input: CheckoutRecoveryInput): BuiltEmail {
  const { t } = copy;
  return render(brand, copy, t("recoverySubject", { store: brand.storeName }), {
    heading: t("recoveryHeading"),
    greetingName: input.customerName,
    paragraphs: [t("recoveryBody", { store: brand.storeName })],
    rows: input.items.map((item) => ({
      label: item.variant ? `${item.name} · ${item.variant}` : item.name,
      value: t("shippedQuantity", { count: item.quantity }),
    })),
    action: { label: t("recoveryCta"), url: input.restoreUrl },
    footnote: t("recoveryConsent", { store: brand.storeName }),
  });
}

export interface SignInLinkInput {
  url: string;
  /** Minutes the link stays valid. */
  minutes: number;
}

/** The magic link a shopper signs in to their account with. */
export function signInLinkEmail(brand: EmailBrand, copy: EmailCopy, link: SignInLinkInput): BuiltEmail {
  const { t } = copy;
  return render(brand, copy, t("signInSubject", { store: brand.storeName }), {
    heading: t("signInHeading", { store: brand.storeName }),
    paragraphs: [t("signInBody", { minutes: link.minutes }), t("signInIgnore")],
    action: { label: t("signInCta"), url: link.url },
  });
}

export interface GiftCardEmailInput {
  recipientName: string;
  code: string;
  amount: number;
  currency: string;
  /** Formatted already, in the reader's language; null when the card does not expire. */
  expires: string | null;
  note: string;
  shopUrl: string;
}

/** A gift card someone bought or the store issued, with its code. */
export function giftCardEmail(brand: EmailBrand, copy: EmailCopy, card: GiftCardEmailInput): BuiltEmail {
  const { t } = copy;
  const amount = formatMinorUnits(copy.format, card.amount, card.currency);
  return render(brand, copy, t("giftCardSubject", { amount, store: brand.storeName }), {
    heading: t("giftCardHeading", { amount }),
    greetingName: card.recipientName || undefined,
    paragraphs: [t("giftCardBody", { store: brand.storeName }), ...(card.note ? [card.note] : [])],
    rows: [
      { label: t("giftCardCodeLabel"), value: card.code },
      { label: t("giftCardValueLabel"), value: amount },
      ...(card.expires ? [{ label: t("giftCardExpiresLabel"), value: card.expires }] : []),
    ],
    action: { label: t("giftCardCta"), url: card.shopUrl },
  });
}

/* -------------------------------------------------------------------- team */

export interface TeamInviteInput {
  name: string;
  inviterName: string;
  roleLabel: string;
  acceptUrl: string;
}

export function teamInviteEmail(brand: EmailBrand, copy: EmailCopy, invite: TeamInviteInput): BuiltEmail {
  const { t } = copy;
  return render(brand, copy, t("inviteSubject", { inviter: invite.inviterName, store: brand.storeName }), {
    heading: t("inviteHeading", { store: brand.storeName }),
    greetingName: invite.name,
    paragraphs: [
      t("inviteBody", {
        inviter: invite.inviterName,
        store: brand.storeName,
        role: invite.roleLabel.toLowerCase(),
      }),
    ],
    action: { label: t("inviteCta"), url: invite.acceptUrl },
  });
}

/* ----------------------------------------------------------------- gifting */

export interface GiftApprovalInput {
  approverName: string;
  buyerName: string;
  campaignName: string;
  campaignCode: string;
  companyName: string;
  recipients: number;
  total: number;
  currency: string;
  approvalUrl: string;
}

export function giftApprovalEmail(brand: EmailBrand, copy: EmailCopy, campaign: GiftApprovalInput): BuiltEmail {
  const { t } = copy;
  return render(brand, copy, t("approvalSubject", { code: campaign.campaignCode, store: brand.storeName }), {
    heading: t("approvalHeading"),
    greetingName: campaign.approverName || undefined,
    paragraphs: [
      t("approvalBody", {
        buyer: campaign.buyerName,
        campaign: campaign.campaignName,
        company: campaign.companyName,
      }),
    ],
    rows: [
      { label: t("approvalRecipientsLabel"), value: String(campaign.recipients) },
      { label: t("approvalTotalLabel"), value: formatMinorUnits(copy.format, campaign.total, campaign.currency) },
    ],
    action: { label: t("approvalCta"), url: campaign.approvalUrl },
  });
}

/* -------------------------------------------------------------- store team */

export interface NotificationEmailInput {
  subject: string;
  heading: string;
  name: string;
  paragraphs: string[];
  rows?: { label: string; value: string }[];
  action?: { label: string; url: string };
}

/** A notification to someone on the store's team, already written in their language. */
export function notificationEmail(brand: EmailBrand, copy: EmailCopy, input: NotificationEmailInput): BuiltEmail {
  return render(brand, copy, input.subject, {
    heading: input.heading,
    greetingName: input.name,
    paragraphs: input.paragraphs,
    rows: input.rows,
    action: input.action,
  });
}

/* ---------------------------------------------------------------- platform */

/** Parcelith's own emails, such as the reply to a sales enquiry, carry its name and logo. */
export function platformBrand(logoUrl: string | null): EmailBrand {
  return { storeName: "Parcelith", clientName: "Parcelith", logoUrl, supportEmail: null };
}
