import "server-only";
import { z } from "zod";
import { COLLECTIONS, listGiftCatalogues, pageRecords } from "../../data";
import { siteOrigin } from "../../email";
import { MAX_PER_RECIPIENT, MAX_RECIPIENTS } from "../../gifting";
import type { OperationContext } from "../../operations/context";
import {
  buildCampaign,
  cancelCampaign,
  changeCampaignApprover,
  createGiftCatalogue,
  decideCampaign,
  findGiftCampaign,
  findGiftCatalogue,
  payCampaign,
  regenerateGiftLink,
  resendApprovalRequest,
  saveGiftAccess,
  saveGiftCatalogueDetails,
  saveGiftCatalogueTranslation,
  saveGiftProducts,
  setGiftCatalogueStatus,
} from "../../operations/gifting";
import { OperationError } from "../../operations/context";
import type { GiftCampaign, GiftCatalogue } from "../../types";
import { decodeCursor, define, id, locale, money, notFound, page, paging, type ApiOperation } from "../define";
import { buyerUrl, presentGiftCampaign, presentGiftCatalogue } from "../present-gifting";

async function catalogue(ctx: OperationContext, catalogueId: string): Promise<GiftCatalogue> {
  return (await findGiftCatalogue(ctx.store.id, catalogueId)) ?? notFound("Gift catalogue");
}

async function campaign(ctx: OperationContext, campaignId: string): Promise<GiftCampaign> {
  return (await findGiftCampaign(ctx.store.id, campaignId)) ?? notFound("Gift campaign");
}

/** A campaign with the catalogue it was placed through. */
async function placed(ctx: OperationContext, campaignId: string) {
  const record = await campaign(ctx, campaignId);
  return { campaign: record, catalogue: await catalogue(ctx, record.catalogueId) };
}

async function showCatalogue(record: GiftCatalogue) {
  return presentGiftCatalogue(record, await siteOrigin());
}

async function showCampaign(ctx: OperationContext, campaignId: string) {
  const record = await campaign(ctx, campaignId);
  return presentGiftCampaign(record, await findGiftCatalogue(ctx.store.id, record.catalogueId), await siteOrigin());
}

const email = z.string().describe("An email address.");

const RECIPIENT_LIST = `The recipient list as a spreadsheet export: comma- or tab-separated rows, one per recipient, up to ${MAX_RECIPIENTS}. With a header row the columns may come in any order; without one they are name, email, address, city, postcode, country, size, quantity (1 to ${MAX_PER_RECIPIENT}), product (name, SKU or id; empty for defaultProductId), note. Quote values that contain the delimiter.`;

const campaignFields = {
  catalogueId: id("gift catalogue"),
  campaignName: z.string().describe("Such as Q4 client gifts. At least 3 characters."),
  buyerName: z.string().describe("The person at the company placing the campaign."),
  buyerEmail: email.describe("The buyer's work email address."),
  recipients: z.string().describe(RECIPIENT_LIST),
  defaultProductId: z
    .string()
    .default("")
    .describe("The catalogue product a row without a product gets; the catalogue's first product when empty."),
};

const catalogues = [
  define({
    id: "listGiftCatalogues",
    method: "GET",
    path: "/gifting/catalogues",
    scope: "gifting:read",
    tag: "Gifting",
    summary: "List gift catalogues",
    description:
      "The store's private gift catalogues, newest first, with their access settings, products, spend limit, approver and private link (portalUrl).",
    input: z.object({}),
    run: async (ctx) => {
      const origin = await siteOrigin();
      return { data: await Promise.all((await listGiftCatalogues(ctx.store.id)).map((row) => presentGiftCatalogue(row, origin))) };
    },
  }),
  define({
    id: "getGiftCatalogue",
    method: "GET",
    path: "/gifting/catalogues/{catalogueId}",
    scope: "gifting:read",
    tag: "Gifting",
    summary: "Get a gift catalogue",
    description:
      "One gift catalogue with its access settings, invited addresses, product ids, spend limit, approver, intro translations and private link (portalUrl). An invite-only catalogue's link carries no key: the invitation list decides who gets in.",
    input: z.object({ catalogueId: id("gift catalogue") }),
    run: async (ctx, input) => showCatalogue(await catalogue(ctx, input.catalogueId)),
  }),
  define({
    id: "createGiftCatalogue",
    method: "POST",
    path: "/gifting/catalogues",
    scope: "gifting:write",
    tag: "Gifting",
    summary: "Create a gift catalogue",
    description:
      "Opens a private gift catalogue for a company, in the store's default currency. Naming an approver email adds an approval step to every campaign. Add products with setGiftCatalogueProducts before sharing portalUrl.",
    status: 201,
    actions: ["gifting#createGiftCatalogue"],
    input: z.object({
      name: z.string().describe("Such as Northwind employee gifting. At least 3 characters."),
      companyName: z.string().describe("The company the catalogue is for."),
      access: z
        .enum(["link", "invite"])
        .default("link")
        .describe("link: anyone holding the private link; invite: only addresses on the invitation list."),
      spendLimitPerRecipient: money("The most one recipient's gift may cost, 0 for no limit,").min(0),
      approverName: z.string().default(""),
      approverEmail: z.string().default("").describe("Who signs campaigns off. Empty for no approval step."),
    }),
    run: async (ctx, input) =>
      showCatalogue(
        await createGiftCatalogue(ctx, {
          name: input.name,
          companyName: input.companyName,
          access: input.access,
          spendLimit: input.spendLimitPerRecipient,
          approverName: input.approverName,
          approverEmail: input.approverEmail,
        }),
      ),
  }),
  define({
    id: "updateGiftCatalogue",
    method: "PATCH",
    path: "/gifting/catalogues/{catalogueId}",
    scope: "gifting:write",
    tag: "Gifting",
    summary: "Update a gift catalogue",
    description:
      "Changes a catalogue's name, company, intro, spend limit or approval step. Fields left out keep their value. Turning approvalRequired on needs approverEmail. Campaigns already placed keep the terms they were placed under.",
    actions: ["gifting#saveGiftCatalogue"],
    input: z.object({
      catalogueId: id("gift catalogue"),
      name: z.string().optional(),
      companyName: z.string().optional(),
      intro: z.string().optional().describe("Shown at the top of the portal, up to 600 characters."),
      spendLimitPerRecipient: money("The most one recipient's gift may cost, 0 for no limit,").min(0).optional(),
      approvalRequired: z.boolean().optional(),
      approverName: z.string().optional(),
      approverEmail: z.string().optional(),
    }),
    run: async (ctx, { catalogueId, ...input }) => {
      const existing = await catalogue(ctx, catalogueId);
      return showCatalogue(
        await saveGiftCatalogueDetails(ctx, existing, {
          name: input.name ?? existing.name,
          companyName: input.companyName ?? existing.companyName,
          intro: input.intro ?? existing.intro,
          spendLimit: input.spendLimitPerRecipient ?? existing.spendLimitPerRecipient,
          approvalRequired: input.approvalRequired ?? existing.approvalRequired,
          approverName: input.approverName ?? existing.approverName,
          approverEmail: input.approverEmail ?? existing.approverEmail,
        }),
      );
    },
  }),
  define({
    id: "updateGiftCatalogueAccess",
    method: "PUT",
    path: "/gifting/catalogues/{catalogueId}/access",
    scope: "gifting:write",
    tag: "Gifting",
    summary: "Set who can open a gift catalogue",
    description:
      "link opens the catalogue to anyone holding its private link; invite only to the listed addresses, who confirm their email first. The list replaces the one saved. An address dropped from the list loses access on its next visit.",
    actions: ["gifting#saveGiftAccess"],
    input: z.object({
      catalogueId: id("gift catalogue"),
      access: z.enum(["link", "invite"]),
      invitedEmails: z.array(email).max(5000).default([]).describe("Required, at least one, for invite."),
    }),
    run: async (ctx, { catalogueId, ...input }) =>
      showCatalogue(await saveGiftAccess(ctx, await catalogue(ctx, catalogueId), input)),
  }),
  define({
    id: "setGiftCatalogueProducts",
    method: "PUT",
    path: "/gifting/catalogues/{catalogueId}/products",
    scope: "gifting:write",
    tag: "Gifting",
    summary: "Set a gift catalogue's products",
    description:
      "Replaces the products offered in the catalogue, in order. Only published products of the store are kept; ids that are not are dropped, and at least one must remain.",
    actions: ["gifting#saveGiftProducts"],
    input: z.object({
      catalogueId: id("gift catalogue"),
      productIds: z.array(z.string()).min(1).max(200).describe("Published product ids."),
    }),
    run: async (ctx, input) =>
      showCatalogue(await saveGiftProducts(ctx, await catalogue(ctx, input.catalogueId), input.productIds)),
  }),
  define({
    id: "regenerateGiftCatalogueLink",
    method: "POST",
    path: "/gifting/catalogues/{catalogueId}/link",
    scope: "gifting:write",
    tag: "Gifting",
    summary: "Regenerate a gift catalogue's private link",
    description:
      "Issues a new private link (portalUrl). The old link and every portal session opened with it stop working at once, so the new one has to be shared again.",
    destructive: true,
    actions: ["gifting#regenerateGiftLink"],
    input: z.object({ catalogueId: id("gift catalogue") }),
    run: async (ctx, input) => showCatalogue(await regenerateGiftLink(ctx, await catalogue(ctx, input.catalogueId))),
  }),
  define({
    id: "setGiftCatalogueStatus",
    method: "PUT",
    path: "/gifting/catalogues/{catalogueId}/status",
    scope: "gifting:write",
    tag: "Gifting",
    summary: "Pause or reopen a gift catalogue",
    description: "A paused catalogue takes no new campaigns; campaigns already placed carry on.",
    actions: ["gifting#setGiftCatalogueStatus"],
    input: z.object({
      catalogueId: id("gift catalogue"),
      status: z.enum(["active", "paused"]),
    }),
    run: async (ctx, input) =>
      showCatalogue(await setGiftCatalogueStatus(ctx, await catalogue(ctx, input.catalogueId), input.status)),
  }),
  define({
    id: "updateGiftCatalogueTranslation",
    method: "PUT",
    path: "/gifting/catalogues/{catalogueId}/translations/{language}",
    scope: "storefront:write",
    tag: "Gifting",
    summary: "Translate a gift catalogue's intro",
    description:
      "Saves the portal intro in one of the store's other languages. An empty intro removes that translation and the default language shows. Needs storefront:write, like every other translation.",
    actions: ["translations#saveCatalogueTranslation"],
    input: z.object({
      catalogueId: id("gift catalogue"),
      language: locale,
      intro: z.string(),
    }),
    run: async (ctx, input) => ({
      translations: await saveGiftCatalogueTranslation(
        ctx,
        await catalogue(ctx, input.catalogueId),
        input.language,
        input.intro,
      ),
    }),
  }),
];

const campaigns = [
  define({
    id: "listGiftCampaigns",
    method: "GET",
    path: "/gifting/campaigns",
    scope: "gifting:read",
    tag: "Campaigns",
    summary: "List gift campaigns",
    description:
      "Campaigns placed through the store's gift catalogues, newest first, with recipients, totals, approval state, the approver's link while it waits, and the ids of the orders a paid campaign raised.",
    input: z.object({
      catalogueId: z.string().optional().describe("Only this catalogue's campaigns."),
      status: z.enum(["awaiting_approval", "approved", "declined", "ordered", "cancelled"]).optional(),
      ...paging,
    }),
    run: async (ctx, input) => {
      const filter: Record<string, unknown> = { storeId: ctx.store.id };
      if (input.catalogueId) filter.catalogueId = input.catalogueId;
      if (input.status) filter.status = input.status;
      const [rows, owned, origin] = await Promise.all([
        pageRecords<GiftCampaign>(COLLECTIONS.giftCampaigns, filter, "createdAt", input.limit, decodeCursor(input.cursor)),
        listGiftCatalogues(ctx.store.id),
        siteOrigin(),
      ]);
      const byId = new Map(owned.map((row) => [row.id, row]));
      const presented = page(rows, (row) => presentGiftCampaign(row, byId.get(row.catalogueId) ?? null, origin));
      return { ...presented, data: await Promise.all(presented.data) };
    },
  }),
  define({
    id: "getGiftCampaign",
    method: "GET",
    path: "/gifting/campaigns/{campaignId}",
    scope: "gifting:read",
    tag: "Campaigns",
    summary: "Get a gift campaign",
    description:
      "One campaign with its buyer, recipients (each with the order it became once paid), totals, approval state and history, payment state, and the approver's link (approvalUrl) while it waits for approval.",
    input: z.object({ campaignId: id("gift campaign") }),
    run: async (ctx, input) => showCampaign(ctx, input.campaignId),
  }),
  define({
    id: "previewGiftCampaign",
    method: "POST",
    path: "/gifting/campaigns/preview",
    scope: "gifting:read",
    tag: "Campaigns",
    summary: "Price a recipient list",
    description:
      "Reads and prices a recipient list against a catalogue exactly as createGiftCampaign would, against the catalogue's spend limit per recipient, and creates nothing. Each row lists the issues that would stop it being ordered.",
    actions: ["gifting#buildCampaign"],
    input: z.object(campaignFields),
    run: async (ctx, { catalogueId, ...input }) => {
      const { preview } = await buildCampaign(ctx, await catalogue(ctx, catalogueId), { ...input, submit: false });
      return { ...preview, ready: preview.withIssues === 0 };
    },
  }),
  define({
    id: "createGiftCampaign",
    method: "POST",
    path: "/gifting/campaigns",
    scope: "gifting:write",
    tag: "Campaigns",
    summary: "Place a gift campaign",
    description:
      "Places a campaign through a catalogue on the buyer's behalf, as the buyer would in the gift portal. Every row has to be clean (check with previewGiftCampaign) and within the catalogue's spend limit. A catalogue with an approval step emails its approver and the campaign waits for approval; otherwise it is ready to pay for. buyerUrl, the buyer's own campaign page, is in this answer only.",
    status: 201,
    actions: ["gifting#buildCampaign"],
    input: z.object(campaignFields),
    run: async (ctx, { catalogueId, ...input }) => {
      const owner = await catalogue(ctx, catalogueId);
      const { preview, campaign: created } = await buildCampaign(ctx, owner, { ...input, submit: true });
      if (!created) {
        const first = preview.rows.find((row) => row.issues.length > 0);
        throw new OperationError(
          "invalid",
          `${preview.withIssues} of ${preview.recipients} rows need fixing before this list can be sent.${
            first ? ` Line ${first.line}: ${first.issues.join(" ")}` : ""
          }`,
          "recipients",
        );
      }
      const origin = await siteOrigin();
      return {
        ...(await presentGiftCampaign(created, owner, origin)),
        buyerUrl: await buyerUrl(created, owner, origin),
      };
    },
  }),
  define({
    id: "resendGiftCampaignApproval",
    method: "POST",
    path: "/gifting/campaigns/{campaignId}/approval-request",
    scope: "gifting:write",
    tag: "Campaigns",
    summary: "Send the approval request again",
    description:
      "Emails the approver of a campaign waiting for approval again and records the chase. A repeat within a minute of the last request sends nothing and answers resent: false with the reason.",
    actions: ["gifting#resendApprovalRequest"],
    input: z.object({ campaignId: id("gift campaign") }),
    run: async (ctx, input) => {
      const outcome = await resendApprovalRequest(ctx, await campaign(ctx, input.campaignId));
      return {
        resent: outcome.done,
        message: outcome.done ? null : outcome.message,
        campaign: await showCampaign(ctx, input.campaignId),
      };
    },
  }),
  define({
    id: "changeGiftCampaignApprover",
    method: "PUT",
    path: "/gifting/campaigns/{campaignId}/approver",
    scope: "gifting:write",
    tag: "Campaigns",
    summary: "Change a campaign's approver",
    description:
      "Hands a campaign waiting for approval to a different approver and emails them the request. The wait restarts from now. The catalogue's default approver is unchanged.",
    actions: ["gifting#changeCampaignApprover"],
    input: z.object({
      campaignId: id("gift campaign"),
      approverName: z.string(),
      approverEmail: email,
      reason: z.string().default("").describe("Why, up to 200 characters; kept in the campaign's history."),
    }),
    run: async (ctx, input) => {
      const outcome = await changeCampaignApprover(ctx, await campaign(ctx, input.campaignId), {
        name: input.approverName,
        email: input.approverEmail,
        reason: input.reason,
      });
      return {
        changed: outcome.done,
        message: outcome.done ? null : outcome.message,
        campaign: await showCampaign(ctx, input.campaignId),
      };
    },
  }),
  define({
    id: "decideGiftCampaign",
    method: "POST",
    path: "/gifting/campaigns/{campaignId}/decision",
    scope: "gifting:write",
    tag: "Campaigns",
    summary: "Record the approver's decision",
    description:
      "Approves or declines a campaign waiting for approval, on the approver's behalf: the decision is the approver's, and the history records that this key entered it. Approving lets the campaign be paid for; declining needs a reason, which the buyer sees.",
    actions: ["gifting#decideCampaign"],
    input: z.object({
      campaignId: id("gift campaign"),
      decision: z.enum(["approve", "decline"]),
      note: z.string().default("").describe("Required to decline, at least 4 characters; up to 400."),
    }),
    run: async (ctx, { campaignId, ...input }) => {
      const found = await placed(ctx, campaignId);
      await decideCampaign(ctx, found.catalogue, found.campaign, input);
      return showCampaign(ctx, campaignId);
    },
  }),
  define({
    id: "cancelGiftCampaign",
    method: "POST",
    path: "/gifting/campaigns/{campaignId}/cancel",
    scope: "gifting:write",
    tag: "Campaigns",
    summary: "Withdraw a gift campaign",
    description: "Withdraws a campaign before it is paid for. It cannot be reopened; the buyer places the list again.",
    destructive: true,
    actions: ["gifting#cancelCampaign"],
    input: z.object({ campaignId: id("gift campaign") }),
    run: async (ctx, input) => {
      const found = await placed(ctx, input.campaignId);
      await cancelCampaign(ctx, found.catalogue, found.campaign);
      return showCampaign(ctx, input.campaignId);
    },
  }),
  define({
    id: "payGiftCampaign",
    method: "POST",
    path: "/gifting/campaigns/{campaignId}/payment",
    scope: "gifting:write",
    tag: "Campaigns",
    summary: "Pay for a gift campaign",
    description:
      "Pays for an approved campaign; one order per recipient follows. On a live store this opens a Stripe Checkout session and answers status checkout with checkoutUrl, where the buyer pays; the orders are raised once Stripe confirms the payment. A demo store charges the test card given and raises the orders at once (status paid). A campaign already paid for is not charged again (status already_paid).",
    actions: ["gifting#payCampaign"],
    input: z.object({
      campaignId: id("gift campaign"),
      cardNumber: z.string().default("").describe("Demo stores only: a test card number such as 4242 4242 4242 4242."),
      expiry: z.string().default("").describe("Demo stores only: MM/YY."),
      cvc: z.string().default("").describe("Demo stores only."),
    }),
    run: async (ctx, { campaignId, ...card }) => {
      const found = await placed(ctx, campaignId);
      const result = await payCampaign(ctx, found.catalogue, found.campaign, card);
      return {
        status: result.status,
        checkoutUrl: result.status === "checkout" ? result.checkoutUrl : null,
        campaign: await showCampaign(ctx, campaignId),
      };
    },
  }),
];

export const giftingOperations: ApiOperation[] = [...catalogues, ...campaigns];
