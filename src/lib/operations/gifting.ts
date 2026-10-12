import "server-only";
import { getTranslations } from "next-intl/server";
import { revalidatePath } from "next/cache";
import { languageName } from "@/i18n/display";
import { isLocale, type Locale } from "@/i18n/locales";
import { emailCopy, shopperLocale, shopperTranslator } from "@/i18n/storefront";
import { localeBase, storeLanguages } from "@/i18n/storefront-routing";
import {
  COLLECTIONS,
  getGiftCatalogue,
  getGiftCatalogueBySlug,
  getGiftCampaign,
  getOrderByIdempotencyKey,
  getUserByEmail,
  listPublishedProducts,
  recordAudit,
  updateGiftCampaign,
  updateGiftCatalogue,
} from "../data";
import { chargeCard } from "../demo-payment";
import { sendEmail, siteOrigin } from "../email";
import { brandFor, giftApprovalEmail } from "../email-templates";
import { campaignPath, campaignToken } from "../gift-access";
import {
  approvalRemindersSent,
  approvalResendCheck,
  approverChangeCheck,
  approverLabel,
  daysAwaitingApproval,
  type ApprovalCheck,
} from "../gift-approval";
import { raiseCampaignOrders } from "../gift-payment";
import { parseRecipients, type ParsedRecipient } from "../gift-recipients";
import { MAX_PER_RECIPIENT, MAX_RECIPIENTS, campaignCode, giftProductOptions, quoteCampaign } from "../gifting";
import { db } from "../mongo";
import { paymentMode } from "../payment-mode";
import { createConnectedCheckout, expireConnectedCheckout } from "../stripe";
import { translationLocale } from "./storefront";
import { withTranslation, type FieldTranslations } from "../translations";
import type { CampaignRecipient, GiftCampaign, GiftCatalogue, Store } from "../types";
import { formatMoney, newId, slugify } from "../util";
import { OperationError, type Actor, type OperationContext } from "./context";

/**
 * Corporate gifting: a store's gift catalogues, and the campaigns a company's
 * buyer submits through one. The workspace's gifting forms, the gift portal's
 * forms and the Admin API all run these, so a catalogue or a campaign is
 * checked, recorded and revalidated the same way wherever it is written.
 *
 * The portal runs them as the buyer or approver (`portalActor`, named as the
 * person acting); the API runs them as its key, and the campaign's history then
 * says the key acted on the buyer's or approver's behalf.
 */

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** The actor id the gift portal acts under: a buyer or approver holding a link, not an account. */
const PORTAL_ACTOR_ID = "gifting";

export function portalActor(name: string): Actor {
  return { id: PORTAL_ACTOR_ID, name };
}

/** `person` when they act through the portal, else who acted for them. */
function onBehalfOf(ctx: OperationContext, person: string): string {
  return ctx.actor.id === PORTAL_ACTOR_ID ? person : `${ctx.actor.name} for ${person}`;
}

/* ---------------------------------------------------------------- lookups */

export async function findGiftCatalogue(storeId: string, catalogueId: string): Promise<GiftCatalogue | null> {
  const catalogue = await getGiftCatalogue(catalogueId);
  return catalogue && catalogue.storeId === storeId ? catalogue : null;
}

export async function findGiftCampaign(storeId: string, campaignId: string): Promise<GiftCampaign | null> {
  const campaign = await getGiftCampaign(campaignId);
  return campaign && campaign.storeId === storeId ? campaign : null;
}

/**
 * A portal address in a shopper language: `/g/<slug>/…` becomes
 * `/g/<slug>/de/…` for a buyer reading the portal in German.
 */
export function inPortalLanguage(store: Store, slug: string, path: string, locale: string): string {
  const root = `/g/${slug}`;
  const base = localeBase(root, shopperLocale(store, locale), storeLanguages(store).defaultLocale);
  return base + path.slice(root.length);
}

/* ------------------------------------------------------------- catalogues */

function refreshCatalogue(storeId: string, catalogueId?: string) {
  revalidatePath(`/app/stores/${storeId}/gifting`);
  if (catalogueId) revalidatePath(`/app/stores/${storeId}/gifting/${catalogueId}`);
}

/** A portal address is public, so it has to be unique across every store. */
async function freeCatalogueSlug(preferred: string): Promise<string> {
  let slug = slugify(preferred) || "gifting";
  if (await getGiftCatalogueBySlug(slug)) slug = `${slug}-${newId("x").slice(2, 6)}`;
  return slug;
}

function catalogueAudit(
  ctx: OperationContext,
  action: string,
  summary: string,
  catalogueId: string,
  meta: Record<string, string | number | boolean | null>,
) {
  recordAudit({
    category: "gifting",
    action,
    summary,
    storeId: ctx.store.id,
    agencyId: ctx.store.agencyId,
    actorId: ctx.actor.id,
    actorName: ctx.actor.name,
    entity: "gift_catalogue",
    entityId: catalogueId,
    meta,
  });
}

export interface NewGiftCatalogue {
  name: string;
  companyName: string;
  approverName: string;
  approverEmail: string;
  access: "link" | "invite";
  /** Minor units per recipient; 0 for no limit, null when it could not be read. */
  spendLimit: number | null;
}

export async function createGiftCatalogue(ctx: OperationContext, input: NewGiftCatalogue): Promise<GiftCatalogue> {
  const { store, actor } = ctx;
  const t = await getTranslations({ locale: ctx.locale, namespace: "actions.gifting" });
  const name = input.name.trim();
  const companyName = input.companyName.trim();
  const approverName = input.approverName.trim();
  const approverEmail = input.approverEmail.trim().toLowerCase();
  const access = input.access === "invite" ? "invite" : "link";
  const spendLimit = input.spendLimit;

  if (name.length < 3) throw new OperationError("invalid", t("nameTooShort"), "name");
  if (companyName.length < 2) throw new OperationError("invalid", t("companyRequired"), "companyName");
  if (spendLimit === null) throw new OperationError("invalid", t("spendLimitInvalid"), "spendLimit");
  if (approverEmail && !EMAIL.test(approverEmail)) {
    throw new OperationError("invalid", t("approverEmailInvalid"), "approverEmail");
  }

  const now = new Date().toISOString();
  const catalogue: GiftCatalogue = {
    id: newId("gft"),
    storeId: store.id,
    name,
    slug: await freeCatalogueSlug(`${companyName}-${name}`),
    companyName,
    intro: "",
    status: "active",
    access,
    accessSecret: newId("sec"),
    invitedEmails: [],
    productIds: [],
    spendLimitPerRecipient: spendLimit,
    currency: store.defaultCurrency,
    approvalRequired: Boolean(approverEmail),
    approverName,
    approverEmail,
    createdBy: actor.name,
    createdAt: now,
    updatedAt: now,
  };
  await db.insertOne(COLLECTIONS.giftCatalogues, catalogue as unknown as Record<string, unknown>);
  catalogueAudit(ctx, "gifting.catalogue_created", `Created gift catalogue “${name}” for ${companyName}`, catalogue.id, {
    access,
    spendLimit,
  });
  refreshCatalogue(store.id, catalogue.id);
  return catalogue;
}

export interface GiftCatalogueDetails {
  name: string;
  companyName: string;
  intro: string;
  approverName: string;
  approverEmail: string;
  approvalRequired: boolean;
  /** Minor units per recipient; 0 for no limit, null when it could not be read. */
  spendLimit: number | null;
}

export async function saveGiftCatalogueDetails(
  ctx: OperationContext,
  catalogue: GiftCatalogue,
  input: GiftCatalogueDetails,
): Promise<GiftCatalogue> {
  const t = await getTranslations({ locale: ctx.locale, namespace: "actions.gifting" });
  const name = input.name.trim();
  const companyName = input.companyName.trim();
  const intro = input.intro.trim().slice(0, 600);
  const approverName = input.approverName.trim();
  const approverEmail = input.approverEmail.trim().toLowerCase();
  const { approvalRequired, spendLimit } = input;

  if (name.length < 3) throw new OperationError("invalid", t("nameTooShort"), "name");
  if (companyName.length < 2) throw new OperationError("invalid", t("companyRequired"), "companyName");
  if (spendLimit === null) throw new OperationError("invalid", t("spendLimitInvalid"), "spendLimit");
  if (approvalRequired && !EMAIL.test(approverEmail)) {
    throw new OperationError("invalid", t("approverEmailRequired"), "approverEmail");
  }

  const patch = {
    name,
    companyName,
    intro,
    spendLimitPerRecipient: spendLimit,
    approvalRequired,
    approverName,
    approverEmail,
  };
  await updateGiftCatalogue(catalogue.id, patch);
  catalogueAudit(ctx, "gifting.catalogue_updated", `Updated gift catalogue “${name}”`, catalogue.id, {
    spendLimit,
    approvalRequired,
  });
  refreshCatalogue(ctx.store.id, catalogue.id);
  return { ...catalogue, ...patch, updatedAt: new Date().toISOString() };
}

export async function saveGiftAccess(
  ctx: OperationContext,
  catalogue: GiftCatalogue,
  input: { access: "link" | "invite"; invitedEmails: string[] },
): Promise<GiftCatalogue> {
  const t = await getTranslations({ locale: ctx.locale, namespace: "actions.gifting" });
  const access = input.access === "invite" ? "invite" : "link";
  const invitedEmails = [
    ...new Set(input.invitedEmails.map((value) => value.trim().toLowerCase()).filter(Boolean)),
  ];
  const invalid = invitedEmails.find((email) => !EMAIL.test(email));
  if (invalid) throw new OperationError("invalid", t("invalidEmail", { email: invalid }), "invitedEmails");
  if (access === "invite" && invitedEmails.length === 0) {
    throw new OperationError("invalid", t("addressRequired"), "invitedEmails");
  }

  await updateGiftCatalogue(catalogue.id, { access, invitedEmails });
  catalogueAudit(
    ctx,
    "gifting.access_changed",
    access === "invite"
      ? `Restricted “${catalogue.name}” to ${invitedEmails.length} invited ${invitedEmails.length === 1 ? "address" : "addresses"}`
      : `Opened “${catalogue.name}” to anyone holding its private link`,
    catalogue.id,
    { access, invited: invitedEmails.length },
  );
  refreshCatalogue(ctx.store.id, catalogue.id);
  return { ...catalogue, access, invitedEmails, updatedAt: new Date().toISOString() };
}

/** Sets the catalogue's products. Ids that are not published products of the store are dropped. */
export async function saveGiftProducts(
  ctx: OperationContext,
  catalogue: GiftCatalogue,
  requested: string[],
): Promise<GiftCatalogue> {
  const t = await getTranslations({ locale: ctx.locale, namespace: "actions.gifting" });
  const published = await listPublishedProducts(ctx.store.id);
  const live = new Set(published.map((p) => p.id));
  const productIds = requested.filter((id) => live.has(id));
  if (productIds.length === 0) throw new OperationError("invalid", t("productRequired"), "productIds");

  await updateGiftCatalogue(catalogue.id, { productIds });
  catalogueAudit(
    ctx,
    "gifting.products_changed",
    `Set ${productIds.length} ${productIds.length === 1 ? "product" : "products"} in gift catalogue “${catalogue.name}”`,
    catalogue.id,
    { products: productIds.length },
  );
  refreshCatalogue(ctx.store.id, catalogue.id);
  return { ...catalogue, productIds, updatedAt: new Date().toISOString() };
}

/** Rotates the private link: every link and portal session handed out so far stops working. */
export async function regenerateGiftLink(ctx: OperationContext, catalogue: GiftCatalogue): Promise<GiftCatalogue> {
  const accessSecret = newId("sec");
  await updateGiftCatalogue(catalogue.id, { accessSecret });
  catalogueAudit(ctx, "gifting.link_regenerated", `Regenerated the private link for “${catalogue.name}”`, catalogue.id, {});
  refreshCatalogue(ctx.store.id, catalogue.id);
  return { ...catalogue, accessSecret, updatedAt: new Date().toISOString() };
}

export async function setGiftCatalogueStatus(
  ctx: OperationContext,
  catalogue: GiftCatalogue,
  status: "active" | "paused",
): Promise<GiftCatalogue> {
  await updateGiftCatalogue(catalogue.id, { status });
  catalogueAudit(
    ctx,
    status === "paused" ? "gifting.catalogue_paused" : "gifting.catalogue_activated",
    `${status === "paused" ? "Paused" : "Reopened"} gift catalogue “${catalogue.name}”`,
    catalogue.id,
    { status },
  );
  refreshCatalogue(ctx.store.id, catalogue.id);
  return { ...catalogue, status, updatedAt: new Date().toISOString() };
}

/** Saves the portal intro in one of the store's other languages. Empty removes it. */
export async function saveGiftCatalogueTranslation(
  ctx: OperationContext,
  catalogue: GiftCatalogue,
  rawLocale: string,
  intro: string,
): Promise<FieldTranslations> {
  const locale = translationLocale(ctx.store, rawLocale);
  if (!locale) {
    const t = await getTranslations({ locale: ctx.locale, namespace: "actions.storefront" });
    throw new OperationError("invalid", t("languageUnavailable"), "locale");
  }
  const translations = withTranslation(catalogue.translations, locale, "intro", intro.trim());
  await updateGiftCatalogue(catalogue.id, { translations });
  recordAudit({
    category: "publishing",
    action: "storefront.portal_translated",
    summary: `Saved the ${languageName("en", locale)} intro of the “${catalogue.name}” gift portal`,
    storeId: ctx.store.id,
    agencyId: ctx.store.agencyId,
    actorId: ctx.actor.id,
    actorName: ctx.actor.name,
    entity: "gift_catalogue",
    entityId: catalogue.id,
    meta: { locale },
  });
  revalidatePath(`/app/stores/${ctx.store.id}/storefront`);
  revalidatePath(`/g/${catalogue.slug}`, "layout");
  return translations;
}

/* -------------------------------------------------------- approval emails */

/**
 * Puts a campaign in front of its approver by email.
 *
 * The approval link is the approver's own, derived from the campaign and the
 * role, so what is emailed is exactly what the store team sees in the approval
 * panel. Nothing here can stop a campaign being created or chased.
 */
async function emailApprovalRequest(store: Store, catalogue: GiftCatalogue, campaign: GiftCampaign): Promise<void> {
  const to = campaign.approval.approverEmail.trim();
  if (!to) return;
  try {
    // Written in the approver's own language when they have a Parcelith
    // account, otherwise in the store's.
    const [origin, approver] = await Promise.all([siteOrigin(), getUserByEmail(to)]);
    const language = isLocale(approver?.uiLanguage) ? approver.uiLanguage : store.defaultLanguage;
    const link = campaignPath(catalogue.slug, campaign.code, await campaignToken(campaign.id, "approver"), "approver");
    sendEmail({
      to,
      message: giftApprovalEmail(brandFor(store), await emailCopy(language), {
        approverName: campaign.approval.approverName,
        buyerName: campaign.buyer.name,
        campaignName: campaign.name,
        campaignCode: campaign.code,
        companyName: catalogue.companyName,
        recipients: campaign.recipients.length,
        total: campaign.totals.total,
        currency: campaign.currency,
        approvalUrl: `${origin}${link}`,
      }),
      kind: "gift approval request",
      storeId: store.id,
      agencyId: store.agencyId,
      entity: "gift_campaign",
      entityId: campaign.code,
    });
  } catch (error) {
    console.error("Gift approval email could not be queued", error);
  }
}

/* ----------------------------------------- a campaign stuck at approval */

function refreshCampaign(storeId: string, campaign: GiftCampaign) {
  revalidatePath(`/app/stores/${storeId}/orders/campaigns/${campaign.id}`);
  refreshCatalogue(storeId, campaign.catalogueId);
}

/** Why the approval could not be chased or handed over, in the caller's language. */
async function approvalRefusal(
  ctx: OperationContext,
  check: Extract<ApprovalCheck, { ok: false }>,
  campaign: GiftCampaign,
  name = "",
): Promise<string> {
  const [t, labels] = await Promise.all([
    getTranslations({ locale: ctx.locale, namespace: "actions.gifting" }),
    getTranslations({ locale: ctx.locale, namespace: "labels" }),
  ]);
  switch (check.reason) {
    case "settled": {
      const status = labels(`campaignStatus.${campaign.status}`);
      return t("refusal.settled", { code: campaign.code, status: ctx.locale === "en" ? status.toLowerCase() : status });
    }
    case "justSent": {
      const { approverName, approverEmail } = campaign.approval;
      const approver =
        approverName && approverEmail
          ? `${approverName} (${approverEmail})`
          : approverName || approverEmail || t("theApprover");
      return t("refusal.justSent", { approver });
    }
    case "alreadyApprover":
      return t("refusal.alreadyApprover", { name, code: campaign.code });
    default:
      return t(`refusal.${check.reason}`);
  }
}

/**
 * The outcome of a chase or a hand-over. A repeat of one that has only just
 * happened is not refused: it reports `done: false` with the reason, and
 * nothing is sent twice.
 */
export type ApprovalOutcome = { done: true; approver: string } | { done: false; message: string };

/**
 * Chases the approver on a campaign that is still waiting.
 *
 * The request goes out again by email, and the chase is recorded either way: a
 * line in the campaign's own history and one in the store's audit log, plus the
 * moment it happened, which is what the panel counts the wait from.
 */
export async function resendApprovalRequest(ctx: OperationContext, campaign: GiftCampaign): Promise<ApprovalOutcome> {
  const { store, actor } = ctx;
  const now = new Date();
  const check = approvalResendCheck(campaign, now);
  if (!check.ok) {
    const message = await approvalRefusal(ctx, check, campaign);
    // A retried submission finds the chase it already recorded rather than
    // writing a second one, so a double click reads as the one request it was.
    if (check.duplicate) return { done: false, message };
    throw new OperationError("conflict", message);
  }

  const at = now.toISOString();
  const waited = daysAwaitingApproval(campaign, now);
  const reminders = approvalRemindersSent(campaign) + 1;
  const approver = approverLabel(campaign);
  await updateGiftCampaign(campaign.id, {
    approval: { ...campaign.approval, lastRequestedAt: at, remindersSent: reminders },
    events: [
      ...campaign.events,
      {
        at,
        status: "Approval request sent again",
        note: `${actor.name} asked ${approver} to review the list again after ${waited} ${waited === 1 ? "day" : "days"}.`,
        actor: actor.name,
      },
    ],
  });
  recordAudit({
    category: "gifting",
    action: "gifting.approval_resent",
    summary: `Sent the approval request for gift campaign ${campaign.code} to ${approver} again`,
    storeId: store.id,
    agencyId: store.agencyId,
    actorId: actor.id,
    actorName: actor.name,
    entity: "gift_campaign",
    entityId: campaign.code,
    meta: { approver, waitingDays: waited, reminders },
  });
  const catalogue = await getGiftCatalogue(campaign.catalogueId);
  if (catalogue) await emailApprovalRequest(store, catalogue, campaign);

  refreshCampaign(store.id, campaign);
  return { done: true, approver };
}

/**
 * Hands the campaign to a different approver.
 *
 * The named person has left, is on leave or never answers, and the buyer cannot
 * pay until somebody signs the list off. The approval link itself is derived
 * from the campaign and its role, so it keeps working — what changes is who the
 * store, the portal and the decision are recorded against.
 */
export async function changeCampaignApprover(
  ctx: OperationContext,
  campaign: GiftCampaign,
  input: { name: string; email: string; reason: string },
): Promise<ApprovalOutcome> {
  const { store, actor } = ctx;
  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  const reason = input.reason.trim().slice(0, 200);

  const check = approverChangeCheck(campaign, { name, email });
  if (!check.ok) {
    const message = await approvalRefusal(ctx, check, campaign, name);
    if (check.duplicate) return { done: false, message };
    const invalid = check.reason === "nameRequired" || check.reason === "emailInvalid";
    throw new OperationError(
      invalid ? "invalid" : "conflict",
      message,
      check.reason === "emailInvalid" ? "approverEmail" : "approverName",
    );
  }

  const previous = approverLabel(campaign);
  const now = new Date().toISOString();
  await updateGiftCampaign(campaign.id, {
    approval: {
      ...campaign.approval,
      approverName: name,
      approverEmail: email,
      // The clock restarts with the new person: the wait shown from here is
      // theirs, not the wait the campaign spent with somebody unreachable.
      requestedAt: now,
      lastRequestedAt: now,
      remindersSent: 0,
    },
    events: [
      ...campaign.events,
      {
        at: now,
        status: "Approver changed",
        note: `${actor.name} moved the approval from ${previous} to ${name} (${email})${reason ? `: ${reason}` : "."}`,
        actor: actor.name,
      },
    ],
  });
  recordAudit({
    category: "gifting",
    action: "gifting.approver_changed",
    summary: `Moved approval of gift campaign ${campaign.code} from ${previous} to ${name}`,
    storeId: store.id,
    agencyId: store.agencyId,
    actorId: actor.id,
    actorName: actor.name,
    entity: "gift_campaign",
    entityId: campaign.code,
    meta: { from: previous, to: `${name} (${email})`, reason: reason || null },
  });
  const catalogue = await getGiftCatalogue(campaign.catalogueId);
  if (catalogue) {
    await emailApprovalRequest(store, catalogue, {
      ...campaign,
      approval: { ...campaign.approval, approverName: name, approverEmail: email },
    });
  }

  refreshCampaign(store.id, campaign);
  return { done: true, approver: name };
}

/* ------------------------------------------------------ campaigns placed */

/** Rows and money the bulk order screen shows back before anything is created. */
export interface CampaignPreviewRow {
  line: number;
  name: string;
  email: string;
  destination: string;
  productName: string;
  variantName: string;
  quantity: number;
  lineTotal: number;
  total: number;
  issues: string[];
}

export interface CampaignPreview {
  rows: CampaignPreviewRow[];
  currency: string;
  recipients: number;
  withIssues: number;
  overflow: number;
  subtotal: number;
  shipping: number;
  taxAmount: number;
  total: number;
}

/** Refuses when the catalogue or its store is not taking campaigns. */
export function assertCatalogueOpen(catalogue: GiftCatalogue, store: Store): void {
  if (catalogue.status !== "active" || store.status !== "active") {
    throw new OperationError("conflict", "This gift catalogue is paused.");
  }
}

function toRecipient(row: ParsedRecipient): CampaignRecipient {
  return {
    id: newId("rcp"),
    name: row.name,
    email: row.email,
    line1: row.line1,
    city: row.city,
    postalCode: row.postalCode,
    country: row.country,
    size: row.size,
    note: row.note,
    storeProductId: row.storeProductId,
    productName: row.productName,
    variantId: row.variantId,
    variantName: row.variantName,
    quantity: row.quantity,
    unitPrice: row.unitPrice,
    orderId: null,
    orderCode: null,
  };
}

export interface CampaignInput {
  campaignName: string;
  buyerName: string;
  buyerEmail: string;
  /** The recipient list as pasted: comma- or tab-separated rows, with or without a header. */
  recipients: string;
  /** The product a row without one gets; the catalogue's first when not offered. */
  defaultProductId: string;
  /** Create the campaign when every row is clean; otherwise only price the list. */
  submit: boolean;
}

/**
 * Prices a recipient list against the catalogue and, with `submit` and no row
 * needing a fix, creates the campaign: awaiting approval when the catalogue has
 * an approval step (the approver is emailed), approved for payment otherwise.
 * `campaign` is null when nothing was created.
 */
export async function buildCampaign(
  ctx: OperationContext,
  catalogue: GiftCatalogue,
  input: CampaignInput,
): Promise<{ preview: CampaignPreview; campaign: GiftCampaign | null }> {
  const { store } = ctx;
  assertCatalogueOpen(catalogue, store);

  const campaignName = input.campaignName.trim();
  const buyerName = input.buyerName.trim();
  const buyerEmail = input.buyerEmail.trim().toLowerCase();
  const list = input.recipients;

  if (campaignName.length < 3) {
    throw new OperationError("invalid", "Name the campaign, e.g. “Q4 client gifts”.", "campaignName");
  }
  if (buyerName.length < 2) throw new OperationError("invalid", "Enter your name.", "buyerName");
  if (!EMAIL.test(buyerEmail)) throw new OperationError("invalid", "Enter your work email address.", "buyerEmail");
  if (!list.trim()) throw new OperationError("invalid", "Paste or upload your recipient list.", "recipients");

  const published = await listPublishedProducts(store.id);
  const products = giftProductOptions(catalogue, published, store.channelCode);
  if (products.length === 0) {
    throw new OperationError("conflict", "This catalogue has no products available.");
  }

  const parsed = parseRecipients(list, {
    products,
    defaultProductId: products.some((p) => p.id === input.defaultProductId) ? input.defaultProductId : products[0].id,
    currency: catalogue.currency,
    spendLimit: catalogue.spendLimitPerRecipient,
    maxRecipients: MAX_RECIPIENTS,
    maxQuantity: MAX_PER_RECIPIENT,
  });
  if (parsed.rows.length === 0) {
    throw new OperationError(
      "invalid",
      "No recipients could be read from that list. Check the columns and try again.",
      "recipients",
    );
  }

  const recipients = parsed.rows.map(toRecipient);
  const quote = await quoteCampaign(store, recipients, catalogue.currency, catalogue.spendLimitPerRecipient);
  const withIssues = parsed.rows.filter((row) => row.issues.length > 0).length;

  const preview: CampaignPreview = {
    rows: parsed.rows.map((row, index) => ({
      line: row.line,
      name: row.name,
      email: row.email,
      destination: [row.city, row.country].filter(Boolean).join(", "),
      productName: row.productName,
      variantName: row.variantName,
      quantity: row.quantity,
      lineTotal: row.lineTotal,
      total: quote.lines[index]?.total ?? row.lineTotal,
      issues: row.issues,
    })),
    currency: catalogue.currency,
    recipients: parsed.rows.length,
    withIssues,
    overflow: parsed.overflow,
    subtotal: quote.subtotal,
    shipping: quote.shipping,
    taxAmount: quote.taxAmount,
    total: quote.total,
  };

  if (!input.submit || withIssues > 0) return { preview, campaign: null };

  const now = new Date().toISOString();
  const submittedBy = onBehalfOf(ctx, buyerName);
  const campaign: GiftCampaign = {
    id: newId("cmp"),
    storeId: store.id,
    catalogueId: catalogue.id,
    code: campaignCode(),
    name: campaignName,
    status: catalogue.approvalRequired ? "awaiting_approval" : "approved",
    currency: catalogue.currency,
    buyer: { name: buyerName, email: buyerEmail },
    recipients,
    spendLimitPerRecipient: catalogue.spendLimitPerRecipient,
    totals: {
      subtotal: quote.subtotal,
      shipping: quote.shipping,
      taxAmount: quote.taxAmount,
      taxLines: quote.taxRows,
      total: quote.total,
    },
    approval: {
      required: catalogue.approvalRequired,
      approverName: catalogue.approverName,
      approverEmail: catalogue.approverEmail,
      requestedAt: catalogue.approvalRequired ? now : null,
      lastRequestedAt: catalogue.approvalRequired ? now : null,
      remindersSent: 0,
      decidedBy: null,
      decidedAt: null,
      note: null,
    },
    payment: { status: "unpaid", paymentIntentId: null, last4: null, paidAt: null },
    events: [
      {
        at: now,
        status: "Campaign created",
        note: `${recipients.length} recipients, ${formatMoney(quote.total, catalogue.currency)} including delivery and tax.`,
        actor: submittedBy,
      },
      ...(catalogue.approvalRequired
        ? [
            {
              at: now,
              status: "Sent for approval",
              note: `Waiting on ${catalogue.approverName || catalogue.approverEmail}.`,
              actor: submittedBy,
            },
          ]
        : []),
    ],
    idempotencyKey: null,
    createdAt: now,
    updatedAt: now,
  };

  await db.insertOne(COLLECTIONS.giftCampaigns, campaign as unknown as Record<string, unknown>);
  recordAudit({
    category: "gifting",
    action: "gifting.campaign_created",
    summary: `${submittedBy} submitted gift campaign ${campaign.code} “${campaignName}” with ${recipients.length} recipients`,
    storeId: store.id,
    agencyId: store.agencyId,
    actorId: ctx.actor.id,
    actorName: ctx.actor.name,
    entity: "gift_campaign",
    entityId: campaign.code,
    meta: { recipients: recipients.length, total: quote.total, currency: catalogue.currency },
    notify:
      campaign.status === "awaiting_approval"
        ? {
            type: "gift_approval",
            href: `/app/stores/${store.id}/orders/campaigns/${campaign.id}`,
            params: { code: campaign.code, name: campaignName },
          }
        : undefined,
  });
  if (campaign.status === "awaiting_approval") {
    await emailApprovalRequest(store, catalogue, campaign);
  }
  revalidatePath(`/app/stores/${store.id}/gifting`);
  return { preview, campaign };
}

/**
 * Who decides a campaign. The store team may have handed it to somebody else
 * since it was submitted, so the campaign's own approver wins over the
 * catalogue default.
 */
export function campaignApprover(catalogue: GiftCatalogue, campaign: GiftCampaign): string {
  return (
    campaign.approval.approverName ||
    campaign.approval.approverEmail ||
    catalogue.approverName ||
    catalogue.approverEmail ||
    "The approver"
  );
}

/**
 * The approver's decision. The portal takes it only from the approver's own
 * link; the API records it on the approver's behalf under the key's name.
 */
export async function decideCampaign(
  ctx: OperationContext,
  catalogue: GiftCatalogue,
  campaign: GiftCampaign,
  input: { decision: string; note: string },
): Promise<GiftCampaign> {
  const { store } = ctx;
  const decision = input.decision;
  const note = input.note.trim().slice(0, 400);
  if (campaign.status !== "awaiting_approval") {
    throw new OperationError("conflict", `${campaign.code} is already ${campaign.status.replace(/_/g, " ")}.`);
  }
  if (decision !== "approve" && decision !== "decline") {
    throw new OperationError("invalid", "Choose approve or decline.", "decision");
  }
  if (decision === "decline" && note.length < 4) {
    throw new OperationError("invalid", "Add a reason for declining.", "note");
  }

  const now = new Date().toISOString();
  const approver = campaignApprover(catalogue, campaign);
  const decidedBy = onBehalfOf(ctx, approver);
  const status = decision === "approve" ? "approved" : "declined";
  const approval = { ...campaign.approval, decidedBy: approver, decidedAt: now, note: note || null };
  const events = [
    ...campaign.events,
    {
      at: now,
      status: decision === "approve" ? "Approved" : "Declined",
      note: note || (decision === "approve" ? "Approved for payment." : "Declined."),
      actor: decidedBy,
    },
  ];
  await updateGiftCampaign(campaign.id, { status, approval, events });
  recordAudit({
    category: "gifting",
    action: decision === "approve" ? "gifting.campaign_approved" : "gifting.campaign_declined",
    summary: `${decidedBy} ${decision === "approve" ? "approved" : "declined"} gift campaign ${campaign.code}`,
    storeId: store.id,
    agencyId: store.agencyId,
    actorId: ctx.actor.id,
    actorName: ctx.actor.name,
    entity: "gift_campaign",
    entityId: campaign.code,
    meta: { decision },
  });
  revalidatePath(`/app/stores/${store.id}/gifting`);
  return { ...campaign, status, approval, events, updatedAt: now };
}

/** Withdraws a campaign before payment. */
export async function cancelCampaign(
  ctx: OperationContext,
  catalogue: GiftCatalogue,
  campaign: GiftCampaign,
): Promise<GiftCampaign> {
  const { store } = ctx;
  if (campaign.status === "ordered" || campaign.status === "cancelled") {
    throw new OperationError("conflict", `${campaign.code} is already ${campaign.status.replace(/_/g, " ")}.`);
  }

  const now = new Date().toISOString();
  const portal = ctx.actor.id === PORTAL_ACTOR_ID;
  const withdrawnBy = onBehalfOf(ctx, campaign.buyer.name);
  const events = [
    ...campaign.events,
    {
      at: now,
      status: "Cancelled",
      note: portal ? "Withdrawn by the buyer before payment." : `Withdrawn by ${ctx.actor.name} before payment.`,
      actor: withdrawnBy,
    },
  ];
  await updateGiftCampaign(campaign.id, { status: "cancelled", events });
  recordAudit({
    category: "gifting",
    action: "gifting.campaign_cancelled",
    summary: `${withdrawnBy} withdrew gift campaign ${campaign.code} before payment`,
    storeId: store.id,
    agencyId: store.agencyId,
    actorId: ctx.actor.id,
    actorName: ctx.actor.name,
    entity: "gift_campaign",
    entityId: campaign.code,
    meta: {},
  });
  revalidatePath(`/app/stores/${store.id}/gifting`);
  revalidatePath(`/g/${catalogue.slug}`, "layout");
  return { ...campaign, status: "cancelled", events, updatedAt: now };
}

/** The demo store's test card, as the payment form posts it. */
export interface DemoCard {
  cardNumber: string;
  expiry: string;
  cvc: string;
}

/**
 * - `paid`: a demo store charged the card and raised the orders.
 * - `already_paid`: the campaign was paid for before; nothing was charged.
 * - `checkout`: a live store; the buyer pays at `checkoutUrl` and the verified
 *   webhook raises the orders.
 * `returnPath` is the buyer's campaign page in the portal.
 */
export type CampaignPaymentResult =
  | { status: "paid" | "already_paid"; returnPath: string }
  | { status: "checkout"; returnPath: string; checkoutUrl: string };

/**
 * Pays for an approved campaign. A demo store simulates the card payment and
 * raises the orders at once; a live store opens a Stripe Checkout session, and
 * the verified webhook raises them (`lib/gift-payment.ts`).
 */
export async function payCampaign(
  ctx: OperationContext,
  catalogue: GiftCatalogue,
  campaign: GiftCampaign,
  card: DemoCard,
): Promise<CampaignPaymentResult> {
  const { store } = ctx;
  const slug = catalogue.slug;
  const token = await campaignToken(campaign.id, "buyer");
  const returnPath = inPortalLanguage(store, slug, campaignPath(slug, campaign.code, token, "buyer"), ctx.locale);
  if (campaign.status === "ordered" || (await getOrderByIdempotencyKey(store.id, `gift_${campaign.id}:0`))) {
    // A retried submission must not charge twice or duplicate the orders.
    return { status: "already_paid", returnPath };
  }
  if (campaign.status !== "approved") {
    throw new OperationError(
      "conflict",
      campaign.status === "awaiting_approval"
        ? `${campaign.code} still needs ${campaign.approval.approverName || catalogue.approverName || "an approver"} to sign it off.`
        : `${campaign.code} is ${campaign.status.replace(/_/g, " ")} and cannot be paid for.`,
    );
  }
  const mode = paymentMode(store);
  if (mode === "unavailable") {
    throw new OperationError("conflict", "This store cannot take payments at the moment. Your campaign is saved.");
  }

  const quote = await quoteCampaign(store, campaign.recipients, campaign.currency, campaign.spendLimitPerRecipient);
  if (quote.problems.length > 0) {
    throw new OperationError(
      "conflict",
      `${quote.problems[0].problem} Remove or correct that recipient, then submit the list again.`,
    );
  }

  const locale: Locale = shopperLocale(store, ctx.locale);
  const shopper = await shopperTranslator(store, locale);
  if (mode === "demo") {
    const charge = await chargeCard({
      store,
      amount: quote.total,
      currency: campaign.currency,
      cardNumber: card.cardNumber,
      expiry: card.expiry,
      cvc: card.cvc,
      name: campaign.buyer.name,
      idempotencyKey: `gift_${campaign.id}`,
      t: (name, values) => shopper(`payment.${name}`, values),
    });
    if (!charge.ok) {
      throw new OperationError(
        "payment_failed",
        charge.message,
        charge.code === "invalid_expiry" ? "expiry" : charge.code === "invalid_cvc" ? "cvc" : "cardNumber",
      );
    }
    await raiseCampaignOrders(campaign, store, {
      paymentIntentId: charge.paymentIntentId,
      last4: charge.last4,
      stripeAccountId: null,
      checkoutSessionId: null,
      note: `${formatMoney(quote.total, campaign.currency)} paid on a demo store. No money moved.`,
    });
    return { status: "paid", returnPath };
  }

  // A live store. An earlier session the buyer left is closed first, so the
  // programme cannot be paid for twice.
  const accountId = store.stripe.accountId as string;
  const previous = campaign.payment.checkoutSessionId;
  if (previous && campaign.payment.stripeAccountId) {
    await expireConnectedCheckout(campaign.payment.stripeAccountId, previous);
  }
  const origin = await siteOrigin();
  const checkout = await createConnectedCheckout({
    accountId,
    metadata: { kind: "gift_campaign", campaignId: campaign.id, storeId: store.id, code: campaign.code },
    idempotencyKey: `gift-checkout-${campaign.id}-${previous ?? "first"}`,
    currency: campaign.currency,
    locale,
    email: campaign.buyer.email,
    lines: [
      ...quote.lines.map((line) => ({
        name: line.recipient.productName,
        description: [line.recipient.variantName, line.recipient.name].filter(Boolean).join(" · "),
        unitAmount: line.unit,
        quantity: line.recipient.quantity,
      })),
      ...(store.pricesIncludeTax
        ? []
        : quote.taxRows.map((row) => ({
            name: shopper("checkout.taxRow", { rate: row.rate }),
            unitAmount: row.amount,
            quantity: 1,
          }))),
    ],
    shipping: { label: shopper("checkout.shipping"), amount: quote.shipping },
    discount: null,
    successUrl: `${origin}${returnPath}&paid=1`,
    cancelUrl: `${origin}${returnPath}`,
  });
  if (!checkout) throw new OperationError("payment_failed", shopper("payment.startFailed"));
  await updateGiftCampaign(campaign.id, {
    payment: { ...campaign.payment, checkoutSessionId: checkout.id, stripeAccountId: accountId },
  });
  recordAudit({
    category: "gifting",
    action: "gifting.checkout_started",
    summary: `${onBehalfOf(ctx, campaign.buyer.name)} opened Stripe Checkout for gift campaign ${campaign.code}`,
    storeId: store.id,
    agencyId: store.agencyId,
    actorId: ctx.actor.id,
    actorName: ctx.actor.name,
    entity: "gift_campaign",
    entityId: campaign.code,
    meta: { total: quote.total, currency: campaign.currency },
  });
  return { status: "checkout", returnPath, checkoutUrl: checkout.url };
}
