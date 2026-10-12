import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { after } from "next/server";
import {
  ADMIN_SCOPE,
  API_KEY_PREFIX,
  API_RATE_LIMIT,
  API_RATE_WINDOW_SECONDS,
  isApiScope,
  type AdminScope,
  type ApiScope,
} from "./api-scopes";
import { COLLECTIONS, recordAudit } from "./data";
import { db } from "./mongo";
import type { Store, User } from "./types";
import { newId } from "./util";

/**
 * Admin API keys. A store administrator creates one under Settings → API keys
 * and copies the secret once; only its SHA-256 hash and last four characters
 * are kept, so a lost key is revoked and replaced, never shown again. A key
 * belongs to one store and carries the scopes it was given.
 *
 * A platform key is made by a platform administrator under Admin → API keys.
 * It belongs to no store and holds the admin scope alone, which no store key
 * can hold.
 */

export interface ApiKey {
  id: string;
  /** Null for a platform key. */
  storeId: string | null;
  agencyId: string | null;
  /** True for a platform key, which holds the admin scope and no store. */
  platform?: boolean;
  name: string;
  scopes: (ApiScope | AdminScope)[];
  /** SHA-256 of the whole secret, hex. */
  hash: string;
  /** The secret's last four characters, so a key can be told apart in the list. */
  last4: string;
  createdAt: string;
  createdById: string;
  createdByName: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  revokedByName: string | null;
  /** The form that created it, so a resubmission does not make a second key. */
  submissionKey: string | null;
}

/** What the key list shows: everything but the hash. */
export type ApiKeySummary = Omit<ApiKey, "hash" | "submissionKey">;

export const API_KEY_NAME_LIMIT = 60;

export function hashApiKey(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

function summary(key: ApiKey): ApiKeySummary {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { hash: _hash, submissionKey: _submissionKey, ...rest } = key;
  return rest;
}

/** A store's keys, newest first, revoked ones included so the history reads whole. */
export async function listApiKeys(storeId: string): Promise<ApiKeySummary[]> {
  const keys = await db.find<ApiKey>(COLLECTIONS.apiKeys, { storeId }, { sort: { createdAt: -1 } });
  return keys.map(summary);
}

export type CreateApiKeyResult =
  | { status: "created"; key: ApiKeySummary; secret: string }
  /** The same form was submitted again; the secret went out with the first answer. */
  | { status: "duplicate"; key: ApiKeySummary };

function newSecret(): string {
  return `${API_KEY_PREFIX}${randomBytes(32).toString("base64url")}`;
}

/** Creates a key and returns its secret. The secret is never stored or returned again. */
export async function createApiKey(
  store: Store,
  user: Pick<User, "id" | "name">,
  input: { name: string; scopes: ApiScope[]; submissionKey: string | null },
): Promise<CreateApiKeyResult> {
  if (input.submissionKey) {
    const existing = await db.findOne<ApiKey>(COLLECTIONS.apiKeys, {
      storeId: store.id,
      submissionKey: input.submissionKey,
    });
    if (existing) return { status: "duplicate", key: summary(existing) };
  }

  const secret = newSecret();
  const key: ApiKey = {
    id: newId("key"),
    storeId: store.id,
    agencyId: store.agencyId,
    name: input.name,
    // A store key never carries the admin scope, whatever it was asked for.
    scopes: input.scopes.filter(isApiScope),
    hash: hashApiKey(secret),
    last4: secret.slice(-4),
    createdAt: new Date().toISOString(),
    createdById: user.id,
    createdByName: user.name,
    lastUsedAt: null,
    revokedAt: null,
    revokedByName: null,
    submissionKey: input.submissionKey,
  };
  await db.insertOne(COLLECTIONS.apiKeys, key as unknown as Record<string, unknown>);
  recordAudit({
    category: "administration",
    action: "api_key.created",
    summary: `Created the API key “${key.name}” (…${key.last4}) with ${key.scopes.join(", ")}`,
    storeId: store.id,
    agencyId: store.agencyId,
    actorId: user.id,
    actorName: user.name,
    entity: "api_key",
    entityId: key.id,
    meta: { scopes: key.scopes.join(",") },
  });
  return { status: "created", key: summary(key), secret };
}

/** Revokes a key of this store. Revoking it again changes nothing. */
export async function revokeApiKey(store: Store, user: Pick<User, "id" | "name">, keyId: string): Promise<boolean> {
  const key = await db.findOne<ApiKey>(COLLECTIONS.apiKeys, { storeId: store.id, id: keyId });
  if (!key) return false;
  if (key.revokedAt) return true;
  const result = await db.updateOne(
    COLLECTIONS.apiKeys,
    { storeId: store.id, id: keyId, revokedAt: null },
    { $set: { revokedAt: new Date().toISOString(), revokedByName: user.name } },
  );
  if (result.modifiedCount > 0) {
    recordAudit({
      category: "administration",
      action: "api_key.revoked",
      summary: `Revoked the API key “${key.name}” (…${key.last4})`,
      storeId: store.id,
      agencyId: store.agencyId,
      actorId: user.id,
      actorName: user.name,
      entity: "api_key",
      entityId: key.id,
      meta: {},
    });
  }
  return true;
}

/** The platform keys, newest first, revoked ones included. */
export async function listPlatformApiKeys(): Promise<ApiKeySummary[]> {
  const keys = await db.find<ApiKey>(COLLECTIONS.apiKeys, { platform: true }, { sort: { createdAt: -1 } });
  return keys.map(summary);
}

/**
 * Creates a platform key. The caller has checked that `user` is a platform
 * administrator; the key is refused at every request once they no longer are.
 */
export async function createPlatformApiKey(
  user: Pick<User, "id" | "name">,
  input: { name: string; submissionKey: string | null },
): Promise<CreateApiKeyResult> {
  if (input.submissionKey) {
    const existing = await db.findOne<ApiKey>(COLLECTIONS.apiKeys, { platform: true, submissionKey: input.submissionKey });
    if (existing) return { status: "duplicate", key: summary(existing) };
  }
  const secret = newSecret();
  const key: ApiKey = {
    id: newId("key"),
    storeId: null,
    agencyId: null,
    platform: true,
    name: input.name,
    scopes: [ADMIN_SCOPE],
    hash: hashApiKey(secret),
    last4: secret.slice(-4),
    createdAt: new Date().toISOString(),
    createdById: user.id,
    createdByName: user.name,
    lastUsedAt: null,
    revokedAt: null,
    revokedByName: null,
    submissionKey: input.submissionKey,
  };
  await db.insertOne(COLLECTIONS.apiKeys, key as unknown as Record<string, unknown>);
  recordAudit({
    category: "administration",
    action: "api_key.created",
    summary: `Created the platform API key “${key.name}” (…${key.last4})`,
    actorId: user.id,
    actorName: user.name,
    entity: "api_key",
    entityId: key.id,
    meta: { scopes: ADMIN_SCOPE },
  });
  return { status: "created", key: summary(key), secret };
}

/** Revokes a platform key. Revoking it again changes nothing. */
export async function revokePlatformApiKey(user: Pick<User, "id" | "name">, keyId: string): Promise<boolean> {
  const key = await db.findOne<ApiKey>(COLLECTIONS.apiKeys, { platform: true, id: keyId });
  if (!key) return false;
  if (key.revokedAt) return true;
  const result = await db.updateOne(
    COLLECTIONS.apiKeys,
    { platform: true, id: keyId, revokedAt: null },
    { $set: { revokedAt: new Date().toISOString(), revokedByName: user.name } },
  );
  if (result.modifiedCount > 0) {
    recordAudit({
      category: "administration",
      action: "api_key.revoked",
      summary: `Revoked the platform API key “${key.name}” (…${key.last4})`,
      actorId: user.id,
      actorName: user.name,
      entity: "api_key",
      entityId: key.id,
      meta: {},
    });
  }
  return true;
}

/** The live key a secret belongs to, or null for an unknown or revoked one. */
export async function findApiKey(secret: string): Promise<ApiKey | null> {
  if (!secret.startsWith(API_KEY_PREFIX)) return null;
  const key = await db.findOne<ApiKey>(COLLECTIONS.apiKeys, { hash: hashApiKey(secret) });
  return key && !key.revokedAt ? key : null;
}

/**
 * Records that the key was used. Once a minute is enough for "last used", so
 * a busy key does not cost a write per request; the write happens after the
 * response has gone out.
 */
export function touchApiKey(key: ApiKey): void {
  const now = new Date();
  if (key.lastUsedAt && now.getTime() - Date.parse(key.lastUsedAt) < 60_000) return;
  const run = () =>
    db
      .updateOne(COLLECTIONS.apiKeys, { id: key.id }, { $set: { lastUsedAt: now.toISOString() } })
      .catch((error: unknown) => console.error("API key use could not be recorded", error));
  try {
    after(run);
  } catch {
    void run();
  }
}

export interface RateLimitState {
  allowed: boolean;
  limit: number;
  remaining: number;
  /** Seconds until the window resets. */
  resetSeconds: number;
}

/**
 * Counts one request against the key's fixed one-minute window. The counter
 * lives in the database, so every server instance shares it, and expires on
 * its own once the window has passed.
 */
export async function consumeRateLimit(keyId: string, now = Date.now()): Promise<RateLimitState> {
  const windowMs = API_RATE_WINDOW_SECONDS * 1000;
  const window = Math.floor(now / windowMs);
  const resetAt = (window + 1) * windowMs;
  const id = `${keyId}:${window}`;
  const update = {
    $inc: { count: 1 },
    $setOnInsert: { keyId, expiresAt: new Date(resetAt + windowMs) },
  };
  let counter: { count: number } | null;
  try {
    counter = await db.findOneAndUpdate<{ count: number }>(COLLECTIONS.apiRateLimits, { id }, update, { upsert: true });
  } catch (error) {
    // Two first requests of a window at once: one insert wins, the other counts on it.
    if ((error as { code?: number }).code !== 11000) throw error;
    counter = await db.findOneAndUpdate<{ count: number }>(COLLECTIONS.apiRateLimits, { id }, update, { upsert: true });
  }
  const count = counter?.count ?? 1;
  return {
    allowed: count <= API_RATE_LIMIT,
    limit: API_RATE_LIMIT,
    remaining: Math.max(0, API_RATE_LIMIT - count),
    resetSeconds: Math.max(1, Math.ceil((resetAt - now) / 1000)),
  };
}
