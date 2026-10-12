/**
 * Server actions with no Admin API operation or MCP tool, each with the reason.
 *
 * Every other exported server action under `src/app/actions` is named by an
 * operation's `actions` list, and `npm run api-coverage-check` fails when one
 * is neither. Add an action here only when it belongs to a person's own
 * browser session, a shopper, or a public form, never because an endpoint has
 * not been written yet.
 */
export const UI_ONLY_ACTIONS: Record<string, string> = {
  // The workspace session of a signed-in person.
  "auth#signOut": "Ends the signed-in person's workspace session. An API key has no session to end.",
  "auth#signInUser": "Starts a workspace session for a person. Keys authenticate on every request instead.",
  "auth#signInAs": "One-click demo sign-in for a person in the browser.",
  "auth#signInWithPassword": "Email and password sign-in for a person in the browser.",
  "preferences#setUiLanguage": "Language switching: changes the language the signed-in person sees the workspace in.",
  "notifications#loadNotifications": "The signed-in person's own notification bell. An API key is not a person and receives no notifications.",
  "notifications#markNotificationRead": "Marks one of the signed-in person's own notifications read.",
  "notifications#markAllNotificationsRead": "Marks the signed-in person's own notifications read.",
  "notifications#saveNotificationPrefs": "The signed-in person's own email and bell preferences.",

  // Credentials stay with signed-in administrators.
  "api-keys#createKey": "Keys are made by a signed-in store administrator, so a leaked key cannot mint further keys.",
  "api-keys#revokeKey": "Keys are revoked by a signed-in store administrator, so a leaked key cannot keep itself or others alive.",
  "platform-keys#createPlatformKey": "Platform keys are made by a signed-in platform administrator, so a leaked key cannot mint further keys.",
  "platform-keys#revokePlatformKey": "Platform keys are revoked by a signed-in platform administrator.",

  // Sign-up and billing pages that hand the browser to Stripe.
  "signup#createAccount": "Creates a new agency and its first person. There is no account yet for a key to belong to.",
  "signup#continueToPayment": "Redirects the new account's browser to plan checkout.",
  "billing#openBillingPortal": "Redirects the agency administrator's browser to the Stripe billing portal. Plan status is read with getBillingStatus.",
  "team#acceptInvitation": "The invited person accepting their own invitation while signed in.",

  // The storefront and the gift portal, run by shoppers and visitors.
  "gifting#unlockGiftCatalogue": "An invited buyer confirming their work email in the gift portal, which sets their portal cookie. Merchants manage the invitation list with updateGiftCatalogueAccess.",
  "shop#readShopperSession": "Reads the shopper's own storefront session.",
  "shop#readCurrency": "Reads the shopper's chosen display currency from their browser.",
  "shop#setCurrency": "Sets the shopper's display currency in their browser.",
  "shop#addToCart": "Shopper basket on the storefront.",
  "shop#updateCartItem": "Shopper basket on the storefront.",
  "shop#removeCartItem": "Shopper basket on the storefront.",
  "shop#applyDiscount": "Shopper applying a discount code at checkout. Merchants manage codes with the Discounts operations.",
  "shop#removeDiscount": "Shopper removing a discount code at checkout.",
  "shop#applyGiftCard": "Shopper applying a gift card at checkout. Merchants manage cards with the Gift cards operations.",
  "shop#removeGiftCard": "Shopper removing a gift card at checkout.",
  "shop#placeOrder": "Shopper checkout and payment. Merchants read and fulfil the order with the Orders operations.",
  "shop#lookupOrder": "Shopper order lookup by order code and email.",
  "search#instantSearch": "The storefront search box for shoppers.",
  "product-reviews#submitReview": "A verified buyer writing a review from their order. Merchants moderate with the Reviews operations.",
  "account#requestSignInLink": "A shopper asking for a sign-in link to their storefront account.",
  "account#signOutShopper": "A shopper signing out of their storefront account.",
  "account#saveAddress": "A shopper's own saved address in their storefront account.",
  "account#deleteAddress": "A shopper's own saved address in their storefront account.",
  "account#setMarketing": "A shopper's own marketing consent in their storefront account.",
  "contact#submitPlanEnquiry": "The public pricing-page form for visitors. Platform administrators read enquiries with listPlanEnquiries.",
};
