import { MongoDBAdapter } from "@auth/mongodb-adapter";
import NextAuth from "next-auth";
import type { EmailConfig } from "next-auth/providers/email";
import { emailCopy, shopperLocale } from "@/i18n/storefront";
import { COLLECTIONS, getStoreBySlug } from "@/lib/data";
import { brandFor, signInLinkEmail } from "@/lib/email-templates";
import { sendEmail } from "@/lib/email";
import { storeFromCallback } from "@/lib/account-rules";
import { mongoClient, mongoDatabaseName } from "@/lib/mongo";

/**
 * Shopper accounts.
 *
 * A second Auth.js instance, apart from the staff one in `./auth`: its own
 * endpoints under `/api/auth/shopper` and its own cookies, so a member of a
 * store's team who also shops there keeps both sessions, and neither token is
 * ever read as the other. Shoppers sign in with Auth.js's Email provider: it
 * makes the one-time token, stores it hashed through the official MongoDB
 * adapter, and checks it when the link is opened. This file only says how the
 * link is emailed, through the platform's existing sender.
 *
 * One account per email address across the platform; what it opens in a store
 * is that store's customer record and orders for the address.
 */

const LINK_MINUTES = 30;

function authSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not set.");
  return secret;
}

const emailProvider: EmailConfig = {
  id: "email",
  type: "email",
  name: "Email",
  maxAge: LINK_MINUTES * 60,
  async sendVerificationRequest({ identifier, url }) {
    const target = storeFromCallback(url);
    const store = target ? await getStoreBySlug(target.slug) : null;
    if (!target || !store || store.status !== "active") throw new Error("Sign-in link requested for no store");
    const locale = shopperLocale(store, target.locale);
    sendEmail({
      to: identifier,
      message: signInLinkEmail(brandFor(store), await emailCopy(locale), { url, minutes: LINK_MINUTES }),
      kind: "sign-in link",
      storeId: store.id,
      agencyId: store.agencyId,
      entity: "customer",
      entityId: null,
    });
  },
};

const COOKIE = "parcelith-shopper";

export const {
  handlers: shopperHandlers,
  auth: shopperAuth,
  signIn: shopperSignIn,
  signOut: shopperSignOut,
} = NextAuth(() => ({
  secret: authSecret(),
  trustHost: true,
  basePath: "/api/auth/shopper",
  adapter: MongoDBAdapter(() => mongoClient(), {
    databaseName: mongoDatabaseName(),
    collections: {
      Users: COLLECTIONS.shopperAccounts,
      Accounts: COLLECTIONS.shopperAccountLinks,
      Sessions: COLLECTIONS.shopperSessions,
      VerificationTokens: COLLECTIONS.shopperVerificationTokens,
    },
  }),
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 30 },
  cookies: {
    sessionToken: { name: `${COOKIE}.session-token` },
    callbackUrl: { name: `${COOKIE}.callback-url` },
    csrfToken: { name: `${COOKIE}.csrf-token` },
  },
  providers: [emailProvider],
  callbacks: {
    jwt({ token, user }) {
      if (user?.id) token.sub = user.id;
      if (user?.email) token.email = user.email.toLowerCase();
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        if (token.sub) session.user.id = token.sub;
        if (typeof token.email === "string") session.user.email = token.email;
      }
      return session;
    },
  },
}));
