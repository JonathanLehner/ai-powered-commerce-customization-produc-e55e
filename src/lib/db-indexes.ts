/**
 * The indexes the data layer's queries rely on, one entry per collection.
 *
 * Shared by the app, which creates them on the first connection of each Worker
 * isolate, and by `scripts/create-indexes.mjs`. Creating an index that already
 * exists with the same keys and options is a no-op, so running either as often
 * as it likes is safe.
 *
 * Every collection is looked up by its own string `id`, so that is unique
 * everywhere. Plain imports only: the script loads this file straight from Node.
 */
type IndexSpec = { key: Record<string, 1 | -1>; unique?: boolean };

const byId: IndexSpec = { key: { id: 1 }, unique: true };

export const INDEXES: Record<string, IndexSpec[]> = {
  agencies: [byId],
  users: [byId, { key: { email: 1 } }],
  stores: [
    byId,
    { key: { slug: 1 }, unique: true },
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
  ],
  tax_brackets: [byId],
  orders: [
    byId,
    { key: { storeId: 1, createdAt: -1 } },
    { key: { storeId: 1, code: 1 }, unique: true },
    { key: { idempotencyKey: 1 } },
    { key: { "campaign.campaignId": 1, createdAt: 1 } },
  ],
  storefronts: [byId, { key: { storeId: 1 }, unique: true }],
  audit_logs: [byId, { key: { at: -1 } }, { key: { storeId: 1, at: -1 } }, { key: { agencyId: 1, at: -1 } }],
  ai_suggestions: [byId, { key: { storeId: 1, status: 1, createdAt: -1 } }],
  carts: [byId, { key: { storeId: 1, sessionId: 1 } }],
  gift_catalogues: [byId, { key: { slug: 1 }, unique: true }, { key: { storeId: 1, createdAt: -1 } }],
  gift_campaigns: [byId, { key: { code: 1 } }, { key: { storeId: 1, createdAt: -1 } }],
  plan_enquiries: [byId, { key: { submissionKey: 1 } }, { key: { createdAt: -1 } }],
  quote_requests: [byId, { key: { submissionKey: 1 } }, { key: { storeId: 1, createdAt: -1 } }, { key: { createdAt: -1 } }],
  discount_codes: [byId, { key: { storeId: 1, code: 1 } }, { key: { storeId: 1, createdAt: -1 } }],
};

/** The minimal slice of a driver `Db` this needs, so the script can pass its own. */
interface IndexTarget {
  collection(name: string): {
    createIndex(key: Record<string, 1 | -1>, options: { unique?: boolean }): Promise<string>;
  };
}

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
          const name = await db.collection(collection).createIndex(spec.key, spec.unique ? { unique: true } : {});
          created.push(`${collection}.${name}`);
        } catch (error) {
          failed.push(`${collection} ${JSON.stringify(spec.key)}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    }),
  );
  return { created, failed };
}
