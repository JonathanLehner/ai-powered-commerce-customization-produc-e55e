/**
 * Server actions with no API operation or MCP tool, each with the reason.
 *
 * Every other exported server action under `src/app/actions` is named by an
 * operation's `actions` list, and `npm run api-coverage-check` fails when one
 * is neither. Only two kinds of action may be here: signing a person in or out
 * of a browser session, and accepting an invitation. The check holds this list
 * to exactly those (`UI_ONLY_KINDS`); everything else gets an operation.
 */
export const UI_ONLY_KINDS = {
  session: "Signs a person in or out of a browser session.",
  invitation: "Accepts an invitation as the invited person.",
} as const;

export const UI_ONLY_ACTIONS: Record<string, { kind: keyof typeof UI_ONLY_KINDS; reason: string }> = {
  "auth#signOut": { kind: "session", reason: "Ends the signed-in person's workspace session. An API key has no session to end." },
  "auth#signInUser": { kind: "session", reason: "Starts a workspace session for a person. Keys authenticate on every request instead." },
  "auth#signInAs": { kind: "session", reason: "One-click demo sign-in for a person in the browser." },
  "auth#signInWithPassword": { kind: "session", reason: "Email and password sign-in for a person in the browser." },
  "auth#requestPasswordReset": { kind: "session", reason: "Emails a person the link that signs them back in with a new password." },
  "auth#resetPassword": { kind: "session", reason: "Sets a new password from a reset link and signs the person in." },
  "signup#createAccount": { kind: "session", reason: "Creates a person's sign-in and starts their first session. There is no account yet for a key to act for." },
  "account#signOutShopper": { kind: "session", reason: "Ends a shopper's storefront session in their browser." },
  "team#acceptInvitation": { kind: "invitation", reason: "The invited person accepting their own invitation while signed in." },
  "gifting#unlockGiftCatalogue": {
    kind: "invitation",
    reason: "An invited buyer accepting a gift portal invitation by confirming their work email, which opens the portal in their browser. Merchants manage the invitation list with updateGiftCatalogueAccess.",
  },
};
