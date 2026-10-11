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
  const footer = t("footer", { client: brand.clientName, store: brand.storeName });
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
${support ? `<p style="margin:16px 0 0;font-size:13px;line-height:1.6;color:#64748b">${escape(support)}</p>` : ""}
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
    ...(support ? ["", support] : []),
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
      { label: t("orderTotalLabel"), value: formatMinorUnits(copy.format, order.total, order.currency) },
      { label: t("orderDeliveryLabel"), value: order.deliveryAddress },
    ],
    action: { label: t("orderCta"), url: order.statusUrl },
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
}

export function shippingNotificationEmail(
  brand: EmailBrand,
  copy: EmailCopy,
  shipment: ShippingNotificationInput,
): BuiltEmail {
  const { t } = copy;
  return render(brand, copy, t("shippedSubject", { code: shipment.code, store: brand.storeName }), {
    heading: t("shippedHeading"),
    greetingName: shipment.customerName,
    paragraphs: [t("shippedBody", { code: shipment.code, carrier: shipment.carrierName })],
    rows: [{ label: t("shippedTrackingLabel"), value: shipment.trackingNumber }],
    action: shipment.trackingUrl
      ? { label: t("shippedCta"), url: shipment.trackingUrl }
      : { label: t("orderCta"), url: shipment.statusUrl },
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
