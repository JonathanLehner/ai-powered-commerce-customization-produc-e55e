"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  COLLECTIONS,
  getGiftCampaign,
  getGiftCampaignByCode,
  getGiftCatalogue,
  getGiftCatalogueBySlug,
  getOrderByIdempotencyKey,
  getStore,
  listPublishedProducts,
  recordAudit,
  updateGiftCampaign,
  updateGiftCatalogue,
} from "@/lib/data";
import { routeOrder } from "@/lib/fulfillment";
import {
  campaignPath,
  campaignToken,
  grantGiftAccess,
  isInvited,
  readGiftAccess,
  verifyCampaignToken,
} from "@/lib/gift-access";
import {
  approvalResendCheck,
  approverChangeCheck,
  approverLabel,
  approvalRemindersSent,
  daysAwaitingApproval,
} from "@/lib/gift-approval";
import { parseRecipients, type ParsedRecipient } from "@/lib/gift-recipients";
import {
  MAX_PER_RECIPIENT,
  MAX_RECIPIENTS,
  campaignCode,
  giftProductOptions,
  quoteCampaign,
} from "@/lib/gifting";
import { db } from "@/lib/platform";
import { assertStoreAccess } from "@/lib/session";
import { chargeCard } from "@/lib/stripe";
import type {
  CampaignRecipient,
  GiftCampaign,
  GiftCatalogue,
  Order,
  Store,
} from "@/lib/types";
import { formatMoney, newId, orderCode, parseMoney, slugify } from "@/lib/util";
import type { ActionState } from "./stores";

/* --------------------------------------------------------------- workspace */

function ok(message: string): ActionState {
  return { status: "success", message };
}
function fail(message: string, field?: string): ActionState {
  return { status: "error", message, field };
}

async function catalogueForStore(catalogueId: string, storeId: string): Promise<GiftCatalogue> {
  const catalogue = await getGiftCatalogue(catalogueId);
  if (!catalogue || catalogue.storeId !== storeId) throw new Error("That gift catalogue no longer exists.");
  return catalogue;
}

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

export async function createGiftCatalogue(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const storeId = String(formData.get("storeId") ?? "");
  const { user, store } = await assertStoreAccess(storeId, "store.gifting");

  const name = String(formData.get("name") ?? "").trim();
  const companyName = String(formData.get("companyName") ?? "").trim();
  const approverName = String(formData.get("approverName") ?? "").trim();
  const approverEmail = String(formData.get("approverEmail") ?? "").trim().toLowerCase();
  const access = String(formData.get("access") ?? "link") === "invite" ? "invite" : "link";
  const spendLimit = parseMoney(String(formData.get("spendLimit") ?? ""), store.defaultCurrency);

  if (name.length < 3) return fail("Give the catalogue a name of at least 3 characters.", "name");
  if (companyName.length < 2) return fail("Name the company this catalogue is for.", "companyName");
  if (spendLimit === null) return fail("Enter the spend limit per recipient, or 0 for no limit.", "spendLimit");
  if (approverEmail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(approverEmail)) {
    return fail("Enter a valid email address for the approver.", "approverEmail");
  }

  const now = new Date().toISOString();
  const catalogue: GiftCatalogue = {
    id: newId("gft"),
    storeId,
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
    createdBy: user.name,
    createdAt: now,
    updatedAt: now,
  };
  await db.insertOne(COLLECTIONS.giftCatalogues, catalogue as unknown as Record<string, unknown>);
  recordAudit({
    category: "gifting",
    action: "gifting.catalogue_created",
    summary: `Created gift catalogue “${name}” for ${companyName}`,
    storeId,
    agencyId: store.agencyId,
    actorId: user.id,
    actorName: user.name,
    entity: "gift_catalogue",
    entityId: catalogue.id,
    meta: { access, spendLimit },
  });
  refreshCatalogue(storeId, catalogue.id);
  redirect(`/app/stores/${storeId}/gifting/${catalogue.id}`);
}

export async function saveGiftCatalogue(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const storeId = String(formData.get("storeId") ?? "");
  const catalogueId = String(formData.get("catalogueId") ?? "");
  const { user, store } = await assertStoreAccess(storeId, "store.gifting");
  const catalogue = await catalogueForStore(catalogueId, storeId);

  const name = String(formData.get("name") ?? "").trim();
  const companyName = String(formData.get("companyName") ?? "").trim();
  const intro = String(formData.get("intro") ?? "").trim().slice(0, 600);
  const approverName = String(formData.get("approverName") ?? "").trim();
  const approverEmail = String(formData.get("approverEmail") ?? "").trim().toLowerCase();
  const approvalRequired = formData.get("approvalRequired") === "on";
  const spendLimit = parseMoney(String(formData.get("spendLimit") ?? ""), catalogue.currency);

  if (name.length < 3) return fail("Give the catalogue a name of at least 3 characters.", "name");
  if (companyName.length < 2) return fail("Name the company this catalogue is for.", "companyName");
  if (spendLimit === null) return fail("Enter the spend limit per recipient, or 0 for no limit.", "spendLimit");
  if (approvalRequired && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(approverEmail)) {
    return fail("An approval step needs the approver's email address.", "approverEmail");
  }

  await updateGiftCatalogue(catalogueId, {
    name,
    companyName,
    intro,
    spendLimitPerRecipient: spendLimit,
    approvalRequired,
    approverName,
    approverEmail,
  });
  recordAudit({
    category: "gifting",
    action: "gifting.catalogue_updated",
    summary: `Updated gift catalogue “${name}”`,
    storeId,
    agencyId: store.agencyId,
    actorId: user.id,
    actorName: user.name,
    entity: "gift_catalogue",
    entityId: catalogueId,
    meta: { spendLimit, approvalRequired },
  });
  refreshCatalogue(storeId, catalogueId);
  return ok("Gift catalogue saved.");
}

export async function saveGiftAccess(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const storeId = String(formData.get("storeId") ?? "");
  const catalogueId = String(formData.get("catalogueId") ?? "");
  const { user, store } = await assertStoreAccess(storeId, "store.gifting");
  const catalogue = await catalogueForStore(catalogueId, storeId);

  const access = String(formData.get("access") ?? "link") === "invite" ? "invite" : "link";
  const raw = String(formData.get("invitedEmails") ?? "");
  const invitedEmails = [
    ...new Set(
      raw
        .split(/[\s,;]+/)
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean),
    ),
  ];
  const invalid = invitedEmails.find((email) => !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email));
  if (invalid) return fail(`“${invalid}” is not a valid email address.`, "invitedEmails");
  if (access === "invite" && invitedEmails.length === 0) {
    return fail("Add at least one address, or switch the catalogue back to link access.", "invitedEmails");
  }

  await updateGiftCatalogue(catalogueId, { access, invitedEmails });
  recordAudit({
    category: "gifting",
    action: "gifting.access_changed",
    summary:
      access === "invite"
        ? `Restricted “${catalogue.name}” to ${invitedEmails.length} invited ${invitedEmails.length === 1 ? "address" : "addresses"}`
        : `Opened “${catalogue.name}” to anyone holding its private link`,
    storeId,
    agencyId: store.agencyId,
    actorId: user.id,
    actorName: user.name,
    entity: "gift_catalogue",
    entityId: catalogueId,
    meta: { access, invited: invitedEmails.length },
  });
  refreshCatalogue(storeId, catalogueId);
  return ok(access === "invite" ? "Only the listed addresses can open this catalogue." : "Private link access saved.");
}

export async function saveGiftProducts(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const storeId = String(formData.get("storeId") ?? "");
  const catalogueId = String(formData.get("catalogueId") ?? "");
  const { user, store } = await assertStoreAccess(storeId, "store.gifting");
  const catalogue = await catalogueForStore(catalogueId, storeId);

  const published = await listPublishedProducts(storeId);
  const live = new Set(published.map((p) => p.id));
  const productIds = formData
    .getAll("productIds")
    .map((value) => String(value))
    .filter((id) => live.has(id));
  if (productIds.length === 0) {
    return fail("Choose at least one product for the gift catalogue.", "productIds");
  }

  await updateGiftCatalogue(catalogueId, { productIds });
  recordAudit({
    category: "gifting",
    action: "gifting.products_changed",
    summary: `Set ${productIds.length} ${productIds.length === 1 ? "product" : "products"} in gift catalogue “${catalogue.name}”`,
    storeId,
    agencyId: store.agencyId,
    actorId: user.id,
    actorName: user.name,
    entity: "gift_catalogue",
    entityId: catalogueId,
    meta: { products: productIds.length },
  });
  refreshCatalogue(storeId, catalogueId);
  return ok(`${productIds.length} ${productIds.length === 1 ? "product is" : "products are"} in the catalogue.`);
}

export async function regenerateGiftLink(formData: FormData): Promise<void> {
  const storeId = String(formData.get("storeId") ?? "");
  const catalogueId = String(formData.get("catalogueId") ?? "");
  const { user, store } = await assertStoreAccess(storeId, "store.gifting");
  const catalogue = await catalogueForStore(catalogueId, storeId);

  await updateGiftCatalogue(catalogueId, { accessSecret: newId("sec") });
  recordAudit({
    category: "gifting",
    action: "gifting.link_regenerated",
    summary: `Regenerated the private link for “${catalogue.name}” — every earlier link stopped working`,
    storeId,
    agencyId: store.agencyId,
    actorId: user.id,
    actorName: user.name,
    entity: "gift_catalogue",
    entityId: catalogueId,
    meta: {},
  });
  refreshCatalogue(storeId, catalogueId);
}

export async function setGiftCatalogueStatus(formData: FormData): Promise<void> {
  const storeId = String(formData.get("storeId") ?? "");
  const catalogueId = String(formData.get("catalogueId") ?? "");
  const status = String(formData.get("status") ?? "") === "paused" ? "paused" : "active";
  const { user, store } = await assertStoreAccess(storeId, "store.gifting");
  const catalogue = await catalogueForStore(catalogueId, storeId);

  await updateGiftCatalogue(catalogueId, { status });
  recordAudit({
    category: "gifting",
    action: status === "paused" ? "gifting.catalogue_paused" : "gifting.catalogue_activated",
    summary: `${status === "paused" ? "Paused" : "Reopened"} gift catalogue “${catalogue.name}”`,
    storeId,
    agencyId: store.agencyId,
    actorId: user.id,
    actorName: user.name,
    entity: "gift_catalogue",
    entityId: catalogueId,
    meta: { status },
  });
  refreshCatalogue(storeId, catalogueId);
}

/* ------------------------------------------------- a campaign stuck at approval */

async function campaignForStore(campaignId: string, storeId: string): Promise<GiftCampaign> {
  const campaign = await getGiftCampaign(campaignId);
  if (!campaign || campaign.storeId !== storeId) throw new Error("That gift campaign no longer exists.");
  return campaign;
}

function refreshCampaign(storeId: string, campaign: GiftCampaign) {
  revalidatePath(`/app/stores/${storeId}/orders/campaigns/${campaign.id}`);
  refreshCatalogue(storeId, campaign.catalogueId);
}

/**
 * Chases the approver on a campaign that is still waiting.
 *
 * Nothing is emailed from here — the approval link is personal and the store
 * team sends it themselves from the panel — so what this records is the chase:
 * a line in the campaign's own history and one in the store's audit log, plus
 * the moment it happened, which is what the panel counts the wait from.
 */
export async function resendApprovalRequest(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const storeId = String(formData.get("storeId") ?? "");
  const campaignId = String(formData.get("campaignId") ?? "");
  const { user, store } = await assertStoreAccess(storeId, "store.gifting");
  const campaign = await campaignForStore(campaignId, storeId);

  const now = new Date();
  const check = approvalResendCheck(campaign, now);
  // A retried submission finds the chase it already recorded rather than
  // writing a second one, so a double click reads as the one request it was.
  if (!check.ok) return check.duplicate ? ok(check.message) : fail(check.message);

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
        note: `${user.name} asked ${approver} to review the list again after ${waited} ${waited === 1 ? "day" : "days"}.`,
        actor: user.name,
      },
    ],
  });
  recordAudit({
    category: "gifting",
    action: "gifting.approval_resent",
    summary: `Sent the approval request for gift campaign ${campaign.code} to ${approver} again`,
    storeId,
    agencyId: store.agencyId,
    actorId: user.id,
    actorName: user.name,
    entity: "gift_campaign",
    entityId: campaign.code,
    meta: { approver, waitingDays: waited, reminders },
  });
  refreshCampaign(storeId, campaign);
  return ok(`Recorded. Send ${approver} the approval link below.`);
}

/**
 * Hands the campaign to a different approver.
 *
 * The named person has left, is on leave or never answers, and the buyer cannot
 * pay until somebody signs the list off. The approval link itself is derived
 * from the campaign and its role, so it keeps working — what changes is who the
 * store, the portal and the decision are recorded against.
 */
export async function changeCampaignApprover(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const storeId = String(formData.get("storeId") ?? "");
  const campaignId = String(formData.get("campaignId") ?? "");
  const { user, store } = await assertStoreAccess(storeId, "store.gifting");
  const campaign = await campaignForStore(campaignId, storeId);

  const name = String(formData.get("approverName") ?? "").trim();
  const email = String(formData.get("approverEmail") ?? "").trim().toLowerCase();
  const reason = String(formData.get("reason") ?? "").trim().slice(0, 200);

  const check = approverChangeCheck(campaign, { name, email });
  if (!check.ok) {
    return check.duplicate
      ? ok(check.message)
      : fail(check.message, check.message.includes("email") ? "approverEmail" : "approverName");
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
        note: `${user.name} moved the approval from ${previous} to ${name} (${email})${reason ? `: ${reason}` : "."}`,
        actor: user.name,
      },
    ],
  });
  recordAudit({
    category: "gifting",
    action: "gifting.approver_changed",
    summary: `Moved approval of gift campaign ${campaign.code} from ${previous} to ${name}`,
    storeId,
    agencyId: store.agencyId,
    actorId: user.id,
    actorName: user.name,
    entity: "gift_campaign",
    entityId: campaign.code,
    meta: { from: previous, to: `${name} (${email})`, reason: reason || null },
  });
  refreshCampaign(storeId, campaign);
  return ok(`${name} is now the approver. Send them the approval link below.`);
}

/* -------------------------------------------------------------- gift portal */

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

export interface GiftActionState extends ActionState {
  preview?: CampaignPreview;
}

async function portalCatalogue(slug: string): Promise<{ catalogue: GiftCatalogue; store: Store } | null> {
  const catalogue = await getGiftCatalogueBySlug(slug);
  if (!catalogue) return null;
  const store = await getStore(catalogue.storeId);
  if (!store) return null;
  return { catalogue, store };
}

/** Invite-gated access: the address has to be on the catalogue's list. */
export async function unlockGiftCatalogue(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const slug = String(formData.get("slug") ?? "");
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const found = await portalCatalogue(slug);
  if (!found || found.catalogue.status !== "active") {
    return fail("This gift catalogue is not open at the moment.");
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return fail("Enter your work email address.", "email");
  }
  if (found.catalogue.access !== "invite" || !isInvited(found.catalogue, email)) {
    return fail(
      "That address is not on this catalogue's invitation list. Ask your programme owner to add it.",
      "email",
    );
  }
  await grantGiftAccess(found.catalogue, email);
  redirect(`/g/${slug}`);
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

/**
 * Reads the pasted recipient list.
 *
 * `intent=check` prices the list and hands it straight back so the buyer can fix
 * rows before anybody is asked to approve anything; `intent=submit` creates the
 * campaign, but only once every row is clean.
 */
export async function buildCampaign(_prev: GiftActionState, formData: FormData): Promise<GiftActionState> {
  const slug = String(formData.get("slug") ?? "");
  const intent = String(formData.get("intent") ?? "check");
  const found = await portalCatalogue(slug);
  if (!found) return fail("This gift catalogue is not open at the moment.");
  const { catalogue, store } = found;

  if (catalogue.status !== "active" || store.status !== "active") {
    return fail("This gift catalogue is paused. Your programme owner can reopen it.");
  }
  const access = await readGiftAccess(catalogue);
  if (!access) return fail("Your access to this catalogue has expired. Open the private link again.");

  const campaignName = String(formData.get("campaignName") ?? "").trim();
  const buyerName = String(formData.get("buyerName") ?? "").trim();
  const buyerEmail =
    access.email === "*" ? String(formData.get("buyerEmail") ?? "").trim().toLowerCase() : access.email;
  const list = String(formData.get("recipients") ?? "");
  const defaultProductId = String(formData.get("defaultProductId") ?? "");

  if (campaignName.length < 3) return fail("Name the campaign, e.g. “Q4 client gifts”.", "campaignName");
  if (buyerName.length < 2) return fail("Enter your name.", "buyerName");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(buyerEmail)) return fail("Enter your work email address.", "buyerEmail");
  if (!list.trim()) return fail("Paste or upload your recipient list.", "recipients");

  const published = await listPublishedProducts(store.id);
  const products = giftProductOptions(catalogue, published, store.channelCode);
  if (products.length === 0) {
    return fail("This catalogue has no products available right now. Ask your programme owner to add some.");
  }

  const parsed = parseRecipients(list, {
    products,
    defaultProductId: products.some((p) => p.id === defaultProductId) ? defaultProductId : products[0].id,
    currency: catalogue.currency,
    spendLimit: catalogue.spendLimitPerRecipient,
    maxRecipients: MAX_RECIPIENTS,
    maxQuantity: MAX_PER_RECIPIENT,
  });
  if (parsed.rows.length === 0) {
    return fail("No recipients could be read from that list. Check the columns and try again.", "recipients");
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

  if (intent === "check" || withIssues > 0) {
    return {
      status: withIssues > 0 ? "error" : "success",
      message:
        withIssues > 0
          ? `${withIssues} of ${parsed.rows.length} rows need fixing before this list can be sent.`
          : `${parsed.rows.length} recipients, ${formatMoney(quote.total, catalogue.currency)} in total. Ready to send.`,
      field: withIssues > 0 ? "recipients" : undefined,
      preview,
    };
  }

  const now = new Date().toISOString();
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
        actor: buyerName,
      },
      ...(catalogue.approvalRequired
        ? [
            {
              at: now,
              status: "Sent for approval",
              note: `Waiting on ${catalogue.approverName || catalogue.approverEmail}.`,
              actor: buyerName,
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
    summary: `${buyerName} submitted gift campaign ${campaign.code} “${campaignName}” — ${recipients.length} recipients`,
    storeId: store.id,
    agencyId: store.agencyId,
    actorId: "gifting",
    actorName: buyerName,
    entity: "gift_campaign",
    entityId: campaign.code,
    meta: { recipients: recipients.length, total: quote.total, currency: catalogue.currency },
  });
  revalidatePath(`/app/stores/${store.id}/gifting`);
  redirect(campaignPath(slug, campaign.code, await campaignToken(campaign.id, "buyer"), "buyer"));
}

async function loadCampaign(slug: string, code: string) {
  const found = await portalCatalogue(slug);
  if (!found) return null;
  const campaign = await getGiftCampaignByCode(code.toUpperCase());
  if (!campaign || campaign.catalogueId !== found.catalogue.id) return null;
  return { ...found, campaign };
}

/** The approval step. Only the link sent to the approver can take this decision. */
export async function decideCampaign(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const slug = String(formData.get("slug") ?? "");
  const code = String(formData.get("code") ?? "");
  const token = String(formData.get("token") ?? "");
  const decision = String(formData.get("decision") ?? "");
  const note = String(formData.get("note") ?? "").trim().slice(0, 400);

  const loaded = await loadCampaign(slug, code);
  if (!loaded) return fail("That campaign could not be found.");
  const { campaign, catalogue, store } = loaded;

  if (!(await verifyCampaignToken(campaign.id, "approver", token))) {
    return fail("This approval link is not valid. Ask for it to be sent again.");
  }
  if (campaign.status !== "awaiting_approval") {
    return fail(`${campaign.code} is already ${campaign.status.replace(/_/g, " ")}.`);
  }
  if (decision !== "approve" && decision !== "decline") return fail("Choose approve or decline.");
  if (decision === "decline" && note.length < 4) {
    return fail("Tell the buyer why it was declined so they can correct it.", "note");
  }

  const now = new Date().toISOString();
  // The store team may have handed the campaign to somebody else since it was
  // submitted, so the campaign's own approver wins over the catalogue default.
  const approver =
    campaign.approval.approverName ||
    campaign.approval.approverEmail ||
    catalogue.approverName ||
    catalogue.approverEmail ||
    "The approver";
  await updateGiftCampaign(campaign.id, {
    status: decision === "approve" ? "approved" : "declined",
    approval: { ...campaign.approval, decidedBy: approver, decidedAt: now, note: note || null },
    events: [
      ...campaign.events,
      {
        at: now,
        status: decision === "approve" ? "Approved" : "Declined",
        note: note || (decision === "approve" ? "Approved for payment." : "Declined."),
        actor: approver,
      },
    ],
  });
  recordAudit({
    category: "gifting",
    action: decision === "approve" ? "gifting.campaign_approved" : "gifting.campaign_declined",
    summary: `${approver} ${decision === "approve" ? "approved" : "declined"} gift campaign ${campaign.code}`,
    storeId: store.id,
    agencyId: store.agencyId,
    actorId: "gifting",
    actorName: approver,
    entity: "gift_campaign",
    entityId: campaign.code,
    meta: { decision },
  });
  revalidatePath(`/app/stores/${store.id}/gifting`);
  return ok(
    decision === "approve"
      ? `${campaign.code} is approved. ${campaign.buyer.name} can now pay for it.`
      : `${campaign.code} was declined and the buyer has been told why.`,
  );
}

export async function cancelCampaign(formData: FormData): Promise<void> {
  const slug = String(formData.get("slug") ?? "");
  const code = String(formData.get("code") ?? "");
  const token = String(formData.get("token") ?? "");
  const loaded = await loadCampaign(slug, code);
  if (!loaded) return;
  const { campaign, store } = loaded;
  if (!(await verifyCampaignToken(campaign.id, "buyer", token))) return;
  if (campaign.status === "ordered" || campaign.status === "cancelled") return;

  const now = new Date().toISOString();
  await updateGiftCampaign(campaign.id, {
    status: "cancelled",
    events: [
      ...campaign.events,
      { at: now, status: "Cancelled", note: "Withdrawn by the buyer before payment.", actor: campaign.buyer.name },
    ],
  });
  recordAudit({
    category: "gifting",
    action: "gifting.campaign_cancelled",
    summary: `${campaign.buyer.name} withdrew gift campaign ${campaign.code} before payment`,
    storeId: store.id,
    agencyId: store.agencyId,
    actorId: "gifting",
    actorName: campaign.buyer.name,
    entity: "gift_campaign",
    entityId: campaign.code,
    meta: {},
  });
  revalidatePath(`/app/stores/${store.id}/gifting`);
  revalidatePath(`/g/${slug}/c/${campaign.code}`);
}

/**
 * Pays for an approved campaign and turns it into one order per recipient.
 *
 * The card is charged once for the whole programme; every order it creates
 * carries the campaign, the shared payment intent and its own idempotency key,
 * so the store's queue can be worked per campaign and a retried submission
 * finds the orders it already made instead of charging again.
 */
export async function payCampaign(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const slug = String(formData.get("slug") ?? "");
  const code = String(formData.get("code") ?? "");
  const token = String(formData.get("token") ?? "");
  const loaded = await loadCampaign(slug, code);
  if (!loaded) return fail("That campaign could not be found.");
  const { campaign, catalogue, store } = loaded;

  if (!(await verifyCampaignToken(campaign.id, "buyer", token))) {
    return fail("This campaign link is not valid. Ask your programme owner to send it again.");
  }
  const key = `gift_${campaign.id}`;
  if (campaign.status === "ordered" || (await getOrderByIdempotencyKey(`${key}:0`))) {
    // A retried submission must not charge twice or duplicate the orders.
    redirect(campaignPath(slug, campaign.code, token, "buyer"));
  }
  if (campaign.status !== "approved") {
    return fail(
      campaign.status === "awaiting_approval"
        ? `${campaign.code} still needs ${campaign.approval.approverName || catalogue.approverName || "an approver"} to sign it off.`
        : `${campaign.code} is ${campaign.status.replace(/_/g, " ")} and cannot be paid for.`,
    );
  }
  if (store.status !== "active" || !store.stripe.connected || !store.stripe.chargesEnabled) {
    return fail("This store cannot take payments at the moment. Your campaign is saved.");
  }

  const quote = await quoteCampaign(store, campaign.recipients, campaign.currency, campaign.spendLimitPerRecipient);
  if (quote.problems.length > 0) {
    return fail(
      `${quote.problems[0].problem} Remove or correct that recipient, then submit the list again.`,
    );
  }

  const charge = await chargeCard({
    store,
    amount: quote.total,
    currency: campaign.currency,
    cardNumber: String(formData.get("cardNumber") ?? ""),
    expiry: String(formData.get("expiry") ?? ""),
    cvc: String(formData.get("cvc") ?? ""),
    name: campaign.buyer.name,
    idempotencyKey: key,
  });
  if (!charge.ok) {
    return {
      status: "error",
      message: charge.message,
      field:
        charge.code === "invalid_expiry" ? "expiry" : charge.code === "invalid_cvc" ? "cvc" : "cardNumber",
    };
  }

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
        paymentIntentId: charge.paymentIntentId,
        stripeAccountId: store.stripe.accountId,
        last4: charge.last4,
        failureMessage: null,
        paidAt: now,
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
          note: `Part of gift campaign ${campaign.code} — ${formatMoney(quote.total, campaign.currency)} charged in one payment.`,
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
        catalogueId: catalogue.id,
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

  await db.insertMany(COLLECTIONS.orders, orders as unknown as Record<string, unknown>[]);

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
      paymentIntentId: charge.paymentIntentId,
      last4: charge.last4,
      paidAt: now,
    },
    idempotencyKey: key,
    events: [
      ...campaign.events,
      {
        at: now,
        status: "Paid",
        note: `${formatMoney(quote.total, campaign.currency)} charged via Stripe (${store.stripe.accountId}).`,
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
    summary: `Gift campaign ${campaign.code} paid — ${orders.length} orders raised${held > 0 ? `, ${held} awaiting manual routing` : ""}`,
    storeId: store.id,
    agencyId: store.agencyId,
    actorId: "gifting",
    actorName: campaign.buyer.name,
    entity: "gift_campaign",
    entityId: campaign.code,
    meta: { orders: orders.length, total: quote.total, currency: campaign.currency, held },
  });

  revalidatePath(`/app/stores/${store.id}/orders`);
  revalidatePath(`/app/stores/${store.id}/gifting`);
  redirect(campaignPath(slug, campaign.code, token, "buyer"));
}
