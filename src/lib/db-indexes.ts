/**
 * The indexes the data layer's queries rely on, one entry per collection.
 *
 * Shared by the app, which creates them from a Worker isolate's first
 * connection whenever this list has changed (see `INDEX_VERSION`), and by
 * `scripts/create-indexes.mjs`. Creating an index that already
 * exists with the same keys and options is a no-op, so running either as often
 * as it likes is safe.
 *
 * Every collection is looked up by its own string `id`, so that is unique
 * everywhere. Plain imports only: the script loads this file straight from Node.
 */
/** `expireAfterSeconds` makes a TTL index: MongoDB deletes each document that long after the date in the key. */
type IndexSpec = { key: Record<string, 1 | -1>; unique?: boolean; expireAfterSeconds?: number };

const byId: IndexSpec = { key: { id: 1 }, unique: true };

export const INDEXES: Record<string, IndexSpec[]> = {
  agencies: [byId],
  users: [byId, { key: { email: 1 } }],
  stores: [
    byId,
    { key: { slug: 1 }, unique: true },
    { key: { customDomain: 1 } },
    { key: { domainHosts: 1 } },
    { key: { agencyId: 1, createdAt: -1 } },
    { key: { agencyId: 1, status: 1 } },
    { key: { createdAt: -1 } },
  ],
  memberships: [byId, { key: { storeId: 1, invitedAt: 1 } }, { key: { userId: 1 } }, { key: { inviteToken: 1 } }],
  suppliers: [byId],
  catalog_products: [byId],
  store_products: [
    byId,
    { key: { storeId: 1, updatedAt: -1 } },
    { key: { storeId: 1, slug: 1 } },
    { key: { taxBracketId: 1 } },
    { key: { storeId: 1, importedAt: -1, id: -1 } },
  ],
  tax_brackets: [byId],
  orders: [
    byId,
    { key: { storeId: 1, createdAt: -1 } },
    { key: { storeId: 1, code: 1 }, unique: true },
    { key: { idempotencyKey: 1 } },
    { key: { "campaign.campaignId": 1, createdAt: 1 } },
    { key: { storeId: 1, "customer.email": 1 } },
    { key: { storeId: 1, "abandoned.at": -1 } },
    { key: { "abandoned.recoveryEmailAt": 1, "abandoned.at": 1 } },
  ],
  storefronts: [byId, { key: { storeId: 1 }, unique: true }],
  audit_logs: [byId, { key: { at: -1 } }, { key: { storeId: 1, at: -1 } }, { key: { agencyId: 1, at: -1 } }],
  ai_suggestions: [byId, { key: { storeId: 1, status: 1, createdAt: -1 } }],
  assistant_conversations: [byId, { key: { storeId: 1, userId: 1, updatedAt: -1 } }],
  carts: [byId, { key: { storeId: 1, sessionId: 1 } }],
  gift_catalogues: [byId, { key: { slug: 1 }, unique: true }, { key: { storeId: 1, createdAt: -1 } }],
  gift_campaigns: [byId, { key: { code: 1 } }, { key: { storeId: 1, createdAt: -1 } }],
  plan_enquiries: [byId, { key: { submissionKey: 1 } }, { key: { createdAt: -1 } }],
  quote_requests: [byId, { key: { submissionKey: 1 } }, { key: { storeId: 1, createdAt: -1 } }, { key: { createdAt: -1 } }],
  discount_codes: [byId, { key: { storeId: 1, code: 1 } }, { key: { storeId: 1, createdAt: -1 } }],
  customers: [
    byId,
    { key: { storeId: 1, email: 1 }, unique: true },
    { key: { storeId: 1, lastOrderAt: -1 } },
    { key: { storeId: 1, createdAt: -1, id: -1 } },
  ],
  newsletter_subscribers: [byId, { key: { storeId: 1, email: 1 }, unique: true }, { key: { storeId: 1, createdAt: -1 } }],
  product_collections: [
    byId,
    { key: { storeId: 1, handle: 1 }, unique: true },
    { key: { storeId: 1, position: 1 } },
    { key: { storeId: 1, createdAt: -1, id: -1 } },
  ],
  notifications: [byId, { key: { userId: 1, createdAt: -1 } }, { key: { storeId: 1, email: 1 } }, { key: { userId: 1, email: 1 } }],
  notification_digests: [byId],
  stripe_events: [byId],
  api_keys: [byId, { key: { hash: 1 }, unique: true }, { key: { storeId: 1, createdAt: -1 } }],
  api_rate_limits: [byId, { key: { expiresAt: 1 }, expireAfterSeconds: 0 }],
  shipping_zones: [byId, { key: { storeId: 1, createdAt: 1 } }],
  inventory_levels: [byId, { key: { storeId: 1 } }, { key: { productId: 1 } }],
  inventory_adjustments: [byId, { key: { storeId: 1, at: -1, id: -1 } }, { key: { storeId: 1, variantId: 1, at: -1 } }],
  content_entries: [
    byId,
    { key: { storeId: 1, kind: 1, handle: 1 }, unique: true },
    { key: { storeId: 1, kind: 1, status: 1, publishedAt: -1 } },
  ],
  gift_cards: [
    byId,
    { key: { storeId: 1, code: 1 }, unique: true },
    { key: { storeId: 1, createdAt: -1, id: -1 } },
    { key: { orderItemKey: 1 } },
    { key: { "holds.orderId": 1 } },
  ],
  product_reviews: [
    byId,
    { key: { storeId: 1, orderId: 1, productId: 1 }, unique: true },
    { key: { storeId: 1, productId: 1, status: 1, createdAt: -1 } },
    { key: { storeId: 1, createdAt: -1, id: -1 } },
  ],
  // Shopper sign-in, kept by Auth.js's MongoDB adapter under its own ObjectIds.
  shopper_accounts: [{ key: { email: 1 }, unique: true }],
  shopper_verification_tokens: [{ key: { identifier: 1, token: 1 }, unique: true }],
  // Staff password reset links, kept by the same adapter; expired ones are removed.
  password_reset_tokens: [{ key: { identifier: 1, token: 1 }, unique: true }, { key: { expires: 1 }, expireAfterSeconds: 0 }],
  password_reset_limits: [byId, { key: { expiresAt: 1 }, expireAfterSeconds: 0 }],
  // A host name is connected to one store, platform-wide: the unique index is
  // what turns away a second claim made at the same instant.
  store_domains: [byId, { key: { hostname: 1 }, unique: true }, { key: { storeId: 1, createdAt: 1 } }],
  shopify_imports: [byId, { key: { storeId: 1, createdAt: -1 } }, { key: { storeId: 1, submissionKey: 1 } }],
  shopify_import_rows: [byId, { key: { importId: 1, kind: 1, seq: 1 } }],
  url_redirects: [byId, { key: { storeId: 1, path: 1 }, unique: true }],
  webhook_endpoints: [byId, { key: { storeId: 1, enabled: 1, topics: 1 } }, { key: { storeId: 1, createdAt: 1 } }],
  webhook_deliveries: [
    byId,
    { key: { status: 1, nextAttemptAt: 1 } },
    { key: { storeId: 1, endpointId: 1, createdAt: -1 } },
    // The log is kept for 30 days.
    { key: { expiresAt: 1 }, expireAfterSeconds: 0 },
  ],
  job_leases: [byId],
};

/** The minimal slice of a driver `Db` this needs, so the script can pass its own. */
interface IndexTarget {
  collection(name: string): {
    createIndex(key: Record<string, 1 | -1>, options: { unique?: boolean; expireAfterSeconds?: number }): Promise<string>;
  };
}

/**
 * Changes whenever an index is added, removed or altered above. The app
 * records it once the indexes are in place and checks it before creating them.
 */
export const INDEX_VERSION = (() => {
  let hash = 0x811c9dc5;
  for (const char of JSON.stringify(INDEXES)) hash = Math.imul(hash ^ char.charCodeAt(0), 0x01000193) >>> 0;
  return hash.toString(16);
})();

/**
 * Creates every index, one at a time per collection and all collections at once.
 * Each index is its own call, so one that cannot be built — a unique index over
 * data that already holds a duplicate — is reported without holding back the rest.
 */
export async function ensureIndexes(db: IndexTarget): Promise<{ created: string[]; failed: string[] }> {
  const created: string[] = [];
  const failed: string[] = [];
  await Promise.all(
    Object.entries(INDEXES).map(async ([collection, specs]) => {
      for (const spec of specs) {
        try {
          const name = await db.collection(collection).createIndex(spec.key, {
            ...(spec.unique ? { unique: true } : {}),
            ...(spec.expireAfterSeconds !== undefined ? { expireAfterSeconds: spec.expireAfterSeconds } : {}),
          });
          created.push(`${collection}.${name}`);
        } catch (error) {
          failed.push(`${collection} ${JSON.stringify(spec.key)}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    }),
  );
  return { created, failed };
}
