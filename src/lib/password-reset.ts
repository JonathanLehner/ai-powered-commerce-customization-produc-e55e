import "server-only";
import { MongoDBAdapter } from "@auth/mongodb-adapter";
import { COLLECTIONS } from "./data";
import { db, mongoClient, mongoDatabaseName } from "./mongo";

/**
 * Password reset links for staff accounts.
 *
 * The tokens are kept through Auth.js's MongoDB adapter, the same verification
 * token store its Email provider uses for shopper sign-in links: the adapter
 * writes them and consumes them with one atomic find-and-delete, so a link
 * works once. As Auth.js does, only a hash of the token (with AUTH_SECRET) is
 * stored, so the collection alone opens nothing. Issuing a link removes every
 * earlier one for that person.
 */

export const RESET_LINK_MINUTES = 60;

/** Requests allowed per hour, per email address and per IP address. */
export const RESET_LIMITS = { email: 3, ip: 10 } as const;

const WINDOW_MS = 60 * 60 * 1000;

function adapter() {
  return MongoDBAdapter(() => mongoClient(), {
    databaseName: mongoDatabaseName(),
    collections: { VerificationTokens: COLLECTIONS.passwordResetTokens },
  });
}

async function hashToken(token: string): Promise<string> {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not set.");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${token}${secret}`));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** `usr_….<64 hex>` as it appears in the link, or null when it is not that shape. */
export function parseResetToken(value: string): { userId: string; token: string } | null {
  const match = /^(usr_[A-Za-z0-9]+)\.([0-9a-f]{64})$/.exec(value);
  return match ? { userId: match[1], token: match[2] } : null;
}

/**
 * Issues a new link token for the user and invalidates every earlier one.
 * Platform administrator invitations pass a longer lifetime.
 */
export async function issueResetToken(userId: string, now = Date.now(), minutes = RESET_LINK_MINUTES): Promise<string> {
  const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, "0")).join("");
  await db.deleteMany(COLLECTIONS.passwordResetTokens, { identifier: userId });
  await adapter().createVerificationToken!({
    identifier: userId,
    token: await hashToken(token),
    expires: new Date(now + minutes * 60 * 1000),
  });
  return `${userId}.${token}`;
}

/** Withdraws every link the user holds. */
export async function revokeResetTokens(userId: string): Promise<void> {
  await db.deleteMany(COLLECTIONS.passwordResetTokens, { identifier: userId });
}

/** The user id a link opens, without using it up; null when it is unknown, used or expired. */
export async function peekResetToken(value: string, now = Date.now()): Promise<string | null> {
  const parsed = parseResetToken(value);
  if (!parsed) return null;
  const found = await db.findOne<{ expires: Date }>(COLLECTIONS.passwordResetTokens, {
    identifier: parsed.userId,
    token: await hashToken(parsed.token),
  });
  return found && new Date(found.expires).getTime() > now ? parsed.userId : null;
}

/**
 * Uses the link up and returns the user id it was issued for, or null when it
 * is unknown, already used or expired. Every other link for the user goes too.
 */
export async function consumeResetToken(value: string, now = Date.now()): Promise<string | null> {
  const parsed = parseResetToken(value);
  if (!parsed) return null;
  const used = await adapter().useVerificationToken!({ identifier: parsed.userId, token: await hashToken(parsed.token) });
  if (!used || new Date(used.expires).getTime() <= now) return null;
  await db.deleteMany(COLLECTIONS.passwordResetTokens, { identifier: parsed.userId });
  return parsed.userId;
}

/**
 * Counts one request against `key` ("email:…" or "ip:…") in the current hour
 * and says whether it is within `limit`.
 */
export async function allowResetRequest(key: string, limit: number, now = Date.now()): Promise<boolean> {
  const window = Math.floor(now / WINDOW_MS);
  const update = {
    $inc: { count: 1 },
    $setOnInsert: { expiresAt: new Date((window + 2) * WINDOW_MS) },
  };
  const id = `${key}:${window}`;
  let counter: { count: number } | null;
  try {
    counter = await db.findOneAndUpdate<{ count: number }>(COLLECTIONS.passwordResetLimits, { id }, update, { upsert: true });
  } catch (error) {
    // Two first requests of a window at once: one insert wins, the other counts on it.
    if ((error as { code?: number }).code !== 11000) throw error;
    counter = await db.findOneAndUpdate<{ count: number }>(COLLECTIONS.passwordResetLimits, { id }, update, { upsert: true });
  }
  return (counter?.count ?? 1) <= limit;
}
