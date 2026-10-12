import "server-only";
import { z } from "zod";
import {
  connectStripe,
  disconnectStripe,
  saveCarriers,
  saveDefaultTax,
  saveDomain,
  setStoreStatus,
} from "../../operations/store-settings";
import { STRIPE_COUNTRIES } from "../../util";
import { ApiError } from "../auth";
import { define, type ApiOperation } from "../define";
import { presentStore } from "../present";
import { presentCarriers, presentDefaultTax, presentDomain, presentPayments } from "../present-settings";

/**
 * Store settings beyond the first API: archiving, the custom domain, Stripe
 * payments, shipping carriers and the default tax bracket.
 */

const carrier = z.enum(["dhl", "fedex", "ups"]);

export const settingsOperations: ApiOperation[] = [
  /* ------------------------------------------------------------- store */
  define({
    id: "updateStoreStatus",
    method: "POST",
    path: "/status",
    scope: "store:write",
    tag: "Store",
    summary: "Archive or restore the store",
    description:
      "archived takes the storefront offline; active brings it back. Restoring counts against the agency's plan like creating a store, and is refused with 409 at the plan's live-store limit.",
    input: z.object({ status: z.enum(["active", "archived"]) }),
    actions: ["stores#setStoreStatus"],
    run: async (ctx, input) => presentStore(await setStoreStatus(ctx, input.status)),
  }),
  define({
    id: "updateCustomDomain",
    method: "PUT",
    path: "/domain",
    scope: "store:write",
    tag: "Store",
    summary: "Set the custom domain",
    description:
      "Sets the domain the storefront is served on, such as shop.example.com, pending DNS verification (verify it with verifyCustomDomain). An empty domain removes it. The current domain is on getStore.",
    input: z.object({
      domain: z.string().describe("A host name, such as shop.example.com, or empty to remove the custom domain."),
    }),
    actions: ["stores#saveDomain"],
    run: async (ctx, input) => presentDomain(await saveDomain(ctx, { domain: input.domain, verify: false })),
  }),
  define({
    id: "verifyCustomDomain",
    method: "POST",
    path: "/domain/verify",
    scope: "store:write",
    tag: "Store",
    summary: "Verify the custom domain",
    description: "Marks the custom domain verified once its DNS points at the storefront. Without `domain`, the domain already set is verified.",
    input: z.object({
      domain: z.string().optional().describe("The domain to set and verify. Defaults to the store's current one."),
    }),
    actions: ["stores#verifyDomain", "stores#saveDomain"],
    run: async (ctx, input) => {
      const domain = input.domain?.trim() || ctx.store.customDomain;
      if (!domain) throw new ApiError(409, "conflict", "The store has no custom domain to verify. Set one first.", "domain");
      return presentDomain(await saveDomain(ctx, { domain, verify: true }));
    },
  }),

  /* ---------------------------------------------------------- payments */
  define({
    id: "getPayments",
    method: "GET",
    path: "/payments",
    scope: "store:read",
    tag: "Store",
    summary: "Get the Stripe payments status",
    description:
      "Whether the store takes card payments through Stripe: connected, the account's country, and whether Stripe has enabled charges and payouts. The account id is not shown.",
    input: z.object({}),
    run: async (ctx) => presentPayments(ctx.store),
  }),
  define({
    id: "startStripeOnboarding",
    method: "POST",
    path: "/payments/stripe/onboarding",
    scope: "store:write",
    tag: "Store",
    summary: "Start or continue Stripe onboarding",
    description:
      "Creates the store's Stripe Express account on the first call, or reuses it, and returns `onboardingUrl`: a short-lived Stripe-hosted page where a store administrator enters the business and bank details. Open it in a browser; it is not for display to shoppers.",
    input: z.object({
      country: z
        .enum(STRIPE_COUNTRIES.map((c) => c.code) as [string, ...string[]])
        .optional()
        .describe("The business's country, ISO alpha-2. Used only when the account is created; defaults to the store's."),
    }),
    actions: ["stores#connectStripe"],
    run: async (ctx, input) => {
      const { store, onboardingUrl } = await connectStripe(ctx, { country: input.country ?? null });
      return { onboardingUrl, payments: presentPayments(store) };
    },
  }),
  define({
    id: "disconnectStripe",
    method: "DELETE",
    path: "/payments/stripe",
    scope: "store:write",
    tag: "Store",
    summary: "Disconnect Stripe payments",
    description:
      "Disconnects the store's Stripe account, so checkout stops taking card payments. Connecting again creates a new account and onboarding starts over.",
    destructive: true,
    input: z.object({}),
    actions: ["stores#disconnectStripe"],
    run: async (ctx) => presentPayments(await disconnectStripe(ctx)),
  }),

  /* ---------------------------------------------------------- carriers */
  define({
    id: "getCarriers",
    method: "GET",
    path: "/carriers",
    scope: "store:read",
    tag: "Shipping",
    summary: "List the shipping carriers",
    description:
      "DHL, FedEx and UPS with whether each is enabled, the last four characters of its account number, and its services. Orders can only be shipped with an enabled carrier.",
    input: z.object({}),
    run: async (ctx) => ({ data: presentCarriers(ctx.store) }),
  }),
  define({
    id: "updateCarriers",
    method: "PUT",
    path: "/carriers",
    scope: "store:write",
    tag: "Shipping",
    summary: "Enable carriers and set their accounts",
    description:
      "Switches carriers on or off. A carrier left out keeps its settings; an enabled carrier needs an account number, and one left out keeps the number it has. At least one carrier must stay enabled.",
    input: z.object({
      carriers: z
        .array(
          z.object({
            carrier,
            enabled: z.boolean(),
            accountNumber: z.string().optional().describe("The store's account number with the carrier."),
          }),
        )
        .min(1)
        .max(3),
    }),
    actions: ["stores#saveCarriers"],
    run: async (ctx, input) => ({ data: presentCarriers(await saveCarriers(ctx, input.carriers)) }),
  }),

  /* ------------------------------------------------------------- taxes */
  define({
    id: "getDefaultTaxBracket",
    method: "GET",
    path: "/taxes/default-bracket",
    scope: "store:read",
    tag: "Taxes",
    summary: "Get the default tax bracket",
    description:
      "The tax bracket products are filed under until given their own (ids from listTaxBrackets), and whether displayed prices include tax.",
    input: z.object({}),
    run: async (ctx) => presentDefaultTax(ctx.store),
  }),
  define({
    id: "updateDefaultTaxBracket",
    method: "PUT",
    path: "/taxes/default-bracket",
    scope: "store:write",
    tag: "Taxes",
    summary: "Set the default tax bracket",
    description: "Sets the default tax bracket, an id from listTaxBrackets, and whether displayed prices include tax.",
    input: z.object({
      defaultTaxBracketId: z.string().describe("A tax bracket id from listTaxBrackets."),
      pricesIncludeTax: z.boolean().describe("Whether product prices already include tax."),
    }),
    actions: ["stores#saveTaxSettings"],
    run: async (ctx, input) => presentDefaultTax(await saveDefaultTax(ctx, input)),
  }),
];
