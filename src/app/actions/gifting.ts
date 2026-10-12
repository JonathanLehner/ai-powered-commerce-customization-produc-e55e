"use server";

import { getLocale, getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { getGiftCampaignByCode, getGiftCatalogueBySlug, getStore } from "@/lib/data";
import { shopperLocale } from "@/i18n/storefront";
import {
  campaignPath,
  campaignToken,
  grantGiftAccess,
  isInvited,
  readGiftAccess,
  verifyCampaignToken,
} from "@/lib/gift-access";
import { refusal } from "@/lib/operations/action-state";
import { isOperationError, type OperationContext } from "@/lib/operations/context";
import {
  assertCatalogueOpen,
  buildCampaign as placeCampaign,
  campaignApprover,
  cancelCampaign as withdrawCampaign,
  changeCampaignApprover as handOverApproval,
  createGiftCatalogue as addGiftCatalogue,
  decideCampaign as recordDecision,
  findGiftCampaign,
  findGiftCatalogue,
  inPortalLanguage,
  payCampaign as chargeCampaign,
  portalActor,
  regenerateGiftLink as rotateGiftLink,
  resendApprovalRequest as chaseApproval,
  saveGiftAccess as setGiftAccess,
  saveGiftCatalogueDetails,
  saveGiftProducts as setGiftProducts,
  setGiftCatalogueStatus as setCatalogueStatus,
  type CampaignPreview,
} from "@/lib/operations/gifting";
import { assertStoreAccess, operationContext } from "@/lib/session";
import type { GiftCampaign, GiftCatalogue, Store } from "@/lib/types";
import { formatMoney, parseMoney } from "@/lib/util";
import type { ActionState } from "./stores";

/* --------------------------------------------------------------- workspace */

function ok(message: string): ActionState {
  return { status: "success", message };
}
function fail(message: string, field?: string): ActionState {
  return { status: "error", message, field };
}

async function catalogueForStore(catalogueId: string, storeId: string): Promise<GiftCatalogue> {
  const catalogue = await findGiftCatalogue(storeId, catalogueId);
  if (!catalogue) throw new Error("That gift catalogue no longer exists.");
  return catalogue;
}

export async function createGiftCatalogue(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const storeId = String(formData.get("storeId") ?? "");
  const access = await assertStoreAccess(storeId, "store.gifting");

  let catalogue: GiftCatalogue;
  try {
    catalogue = await addGiftCatalogue(await operationContext(access), {
      name: String(formData.get("name") ?? ""),
      companyName: String(formData.get("companyName") ?? ""),
      approverName: String(formData.get("approverName") ?? ""),
      approverEmail: String(formData.get("approverEmail") ?? ""),
      access: String(formData.get("access") ?? "link") === "invite" ? "invite" : "link",
      spendLimit: parseMoney(String(formData.get("spendLimit") ?? ""), access.store.defaultCurrency),
    });
  } catch (error) {
    return refusal(error);
  }
  redirect(`/app/stores/${storeId}/gifting/${catalogue.id}`);
}

export async function saveGiftCatalogue(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const storeId = String(formData.get("storeId") ?? "");
  const catalogueId = String(formData.get("catalogueId") ?? "");
  const access = await assertStoreAccess(storeId, "store.gifting");
  const catalogue = await catalogueForStore(catalogueId, storeId);
  const t = await getTranslations("actions.gifting");

  try {
    await saveGiftCatalogueDetails(await operationContext(access), catalogue, {
      name: String(formData.get("name") ?? ""),
      companyName: String(formData.get("companyName") ?? ""),
      intro: String(formData.get("intro") ?? ""),
      approverName: String(formData.get("approverName") ?? ""),
      approverEmail: String(formData.get("approverEmail") ?? ""),
      approvalRequired: formData.get("approvalRequired") === "on",
      spendLimit: parseMoney(String(formData.get("spendLimit") ?? ""), catalogue.currency),
    });
    return ok(t("saved"));
  } catch (error) {
    return refusal(error);
  }
}

export async function saveGiftAccess(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const storeId = String(formData.get("storeId") ?? "");
  const catalogueId = String(formData.get("catalogueId") ?? "");
  const access = await assertStoreAccess(storeId, "store.gifting");
  const catalogue = await catalogueForStore(catalogueId, storeId);
  const t = await getTranslations("actions.gifting");

  try {
    const saved = await setGiftAccess(await operationContext(access), catalogue, {
      access: String(formData.get("access") ?? "link") === "invite" ? "invite" : "link",
      invitedEmails: String(formData.get("invitedEmails") ?? "").split(/[\s,;]+/),
    });
    return ok(saved.access === "invite" ? t("inviteSaved") : t("linkSaved"));
  } catch (error) {
    return refusal(error);
  }
}

export async function saveGiftProducts(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const storeId = String(formData.get("storeId") ?? "");
  const catalogueId = String(formData.get("catalogueId") ?? "");
  const access = await assertStoreAccess(storeId, "store.gifting");
  const catalogue = await catalogueForStore(catalogueId, storeId);
  const t = await getTranslations("actions.gifting");

  try {
    const saved = await setGiftProducts(
      await operationContext(access),
      catalogue,
      formData.getAll("productIds").map((value) => String(value)),
    );
    return ok(t("productsSaved", { count: saved.productIds.length }));
  } catch (error) {
    return refusal(error);
  }
}

export async function regenerateGiftLink(formData: FormData): Promise<void> {
  const storeId = String(formData.get("storeId") ?? "");
  const catalogueId = String(formData.get("catalogueId") ?? "");
  const access = await assertStoreAccess(storeId, "store.gifting");
  const catalogue = await catalogueForStore(catalogueId, storeId);
  await rotateGiftLink(await operationContext(access), catalogue);
}

export async function setGiftCatalogueStatus(formData: FormData): Promise<void> {
  const storeId = String(formData.get("storeId") ?? "");
  const catalogueId = String(formData.get("catalogueId") ?? "");
  const status = String(formData.get("status") ?? "") === "paused" ? "paused" : "active";
  const access = await assertStoreAccess(storeId, "store.gifting");
  const catalogue = await catalogueForStore(catalogueId, storeId);
  await setCatalogueStatus(await operationContext(access), catalogue, status);
}

/* ------------------------------------------------- a campaign stuck at approval */

async function campaignForStore(campaignId: string, storeId: string): Promise<GiftCampaign> {
  const campaign = await findGiftCampaign(storeId, campaignId);
  if (!campaign) throw new Error("That gift campaign no longer exists.");
  return campaign;
}

/**
 * Chases the approver on a campaign that is still waiting.
 *
 * A retried submission finds the chase it already recorded rather than writing
 * a second one, so a double click reads as the one request it was.
 */
export async function resendApprovalRequest(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const storeId = String(formData.get("storeId") ?? "");
  const campaignId = String(formData.get("campaignId") ?? "");
  const access = await assertStoreAccess(storeId, "store.gifting");
  const campaign = await campaignForStore(campaignId, storeId);
  const t = await getTranslations("actions.gifting");

  try {
    const outcome = await chaseApproval(await operationContext(access), campaign);
    return outcome.done ? ok(t("resent", { approver: outcome.approver })) : ok(outcome.message);
  } catch (error) {
    return refusal(error);
  }
}

/** Hands the campaign to a different approver. */
export async function changeCampaignApprover(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const storeId = String(formData.get("storeId") ?? "");
  const campaignId = String(formData.get("campaignId") ?? "");
  const access = await assertStoreAccess(storeId, "store.gifting");
  const campaign = await campaignForStore(campaignId, storeId);
  const t = await getTranslations("actions.gifting");

  try {
    const outcome = await handOverApproval(await operationContext(access), campaign, {
      name: String(formData.get("approverName") ?? ""),
      email: String(formData.get("approverEmail") ?? ""),
      reason: String(formData.get("reason") ?? ""),
    });
    return outcome.done ? ok(t("approverChanged", { name: outcome.approver })) : ok(outcome.message);
  } catch (error) {
    return refusal(error);
  }
}

/* -------------------------------------------------------------- gift portal */

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

/** What a portal action runs as: the buyer or approver, in the language the page was posted from. */
async function portalContext(store: Store, name: string): Promise<OperationContext> {
  return { store, actor: portalActor(name), locale: shopperLocale(store, await getLocale()) };
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
  redirect(inPortalLanguage(found.store, slug, `/g/${slug}`, await getLocale()));
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

  try {
    assertCatalogueOpen(catalogue, store);
  } catch (error) {
    return refusal(error);
  }
  const access = await readGiftAccess(catalogue);
  if (!access) return fail("Your access to this catalogue has expired. Open the private link again.");

  const buyerName = String(formData.get("buyerName") ?? "").trim();
  let result: Awaited<ReturnType<typeof placeCampaign>>;
  try {
    result = await placeCampaign(await portalContext(store, buyerName), catalogue, {
      campaignName: String(formData.get("campaignName") ?? ""),
      buyerName,
      buyerEmail: access.email === "*" ? String(formData.get("buyerEmail") ?? "") : access.email,
      recipients: String(formData.get("recipients") ?? ""),
      defaultProductId: String(formData.get("defaultProductId") ?? ""),
      submit: intent !== "check",
    });
  } catch (error) {
    return refusal(error);
  }

  const { preview, campaign } = result;
  if (!campaign) {
    const { withIssues, recipients } = preview;
    return {
      status: withIssues > 0 ? "error" : "success",
      message:
        withIssues > 0
          ? `${withIssues} of ${recipients} rows need fixing before this list can be sent.`
          : `${recipients} recipients, ${formatMoney(preview.total, catalogue.currency)} in total. Ready to send.`,
      field: withIssues > 0 ? "recipients" : undefined,
      preview,
    };
  }
  redirect(
    inPortalLanguage(
      store,
      slug,
      campaignPath(slug, campaign.code, await campaignToken(campaign.id, "buyer"), "buyer"),
      await getLocale(),
    ),
  );
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

  const loaded = await loadCampaign(slug, code);
  if (!loaded) return fail("That campaign could not be found.");
  const { campaign, catalogue, store } = loaded;

  if (!(await verifyCampaignToken(campaign.id, "approver", token))) {
    return fail("This approval link is not valid. Ask for it to be sent again.");
  }
  try {
    await recordDecision(await portalContext(store, campaignApprover(catalogue, campaign)), catalogue, campaign, {
      decision,
      note: String(formData.get("note") ?? ""),
    });
  } catch (error) {
    return refusal(error);
  }
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
  const { campaign, catalogue, store } = loaded;
  if (!(await verifyCampaignToken(campaign.id, "buyer", token))) return;

  try {
    await withdrawCampaign(await portalContext(store, campaign.buyer.name), catalogue, campaign);
  } catch (error) {
    // Already ordered or cancelled: nothing to withdraw.
    if (isOperationError(error)) return;
    throw error;
  }
}

/**
 * Pays for an approved campaign. A demo store simulates the card payment and
 * raises the orders at once; a live store sends the buyer to Stripe Checkout,
 * and the verified webhook raises them (`lib/gift-payment.ts`).
 */
export async function payCampaign(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const slug = String(formData.get("slug") ?? "");
  const code = String(formData.get("code") ?? "");
  const token = String(formData.get("token") ?? "");
  const loaded = await loadCampaign(slug, code);
  if (!loaded) return fail("That campaign could not be found.");
  const { campaign, catalogue, store } = loaded;

  if (!(await verifyCampaignToken(campaign.id, "buyer", token))) {
    return fail("This campaign link is not valid.");
  }

  let result: Awaited<ReturnType<typeof chargeCampaign>>;
  try {
    result = await chargeCampaign(await portalContext(store, campaign.buyer.name), catalogue, campaign, {
      cardNumber: String(formData.get("cardNumber") ?? ""),
      expiry: String(formData.get("expiry") ?? ""),
      cvc: String(formData.get("cvc") ?? ""),
    });
  } catch (error) {
    return refusal(error);
  }
  redirect(result.status === "checkout" ? result.checkoutUrl : result.returnPath);
}
