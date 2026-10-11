import "server-only";
import { MongoClient, type Db, type Document, type Filter, type Sort } from "mongodb";
import { ensureIndexes } from "./db-indexes";

/**
 * The app's own MongoDB, reached with the official driver over MONGODB_URI.
 *
 * The database name is MONGODB_DB, so local development and the checks can use
 * a database of their own. It is never set on the deployment, which therefore
 * uses `parcelith`. The name in MONGODB_URI's path is not used: it is longer
 * than the 38 bytes Atlas allows for a database name.
 */
const PRODUCTION_DB = "parcelith";

type FindOptions = { sort?: Sort; limit?: number; skip?: number };

/**
 * On Cloudflare Workers a socket belongs to the request that opened it, and
 * another request that touches it hangs. So there a client lives for one
 * request: it is keyed on OpenNext's per-request context object, which every
 * page, server action, route handler and `after()` callback of that request
 * shares. In Node (`next dev`, `next start`, the scripts) there is no such
 * object, and one client serves the whole process.
 */
const CONTEXT = Symbol.for("__cloudflare-context__");

type RequestContext = {
  env?: Record<string, unknown>;
  ctx?: { waitUntil(promise: Promise<unknown>): void };
};

const perRequest = new WeakMap<object, Promise<Db>>();
let perProcess: Promise<Db> | null = null;
/** Set once this isolate has created the indexes, so later requests skip it. */
let indexesEnsured = false;

function requestContext(): RequestContext | undefined {
  return (globalThis as Record<symbol, RequestContext | undefined>)[CONTEXT];
}

/**
 * On Workers the name comes from the Worker's own bindings, not `process.env`:
 * OpenNext copies the build machine's `.env*` files into the bundle and fills
 * `process.env` from them, so a deploy built next to `.env.local` would
 * otherwise carry its development database into production.
 */
function databaseName(context: RequestContext | undefined): string {
  const name = context ? context.env?.MONGODB_DB : process.env.MONGODB_DB;
  return typeof name === "string" && name ? name : PRODUCTION_DB;
}

async function connect(context: RequestContext | undefined): Promise<Db> {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not configured");
  // One connection: the client lives for a single request, and a second
  // connection costs a TLS handshake and authentication — several times what a
  // query waiting its turn on the first one costs.
  const client = new MongoClient(uri, { maxPoolSize: 1 });
  await client.connect();
  const db = client.db(databaseName(context));
  if (!indexesEnsured) {
    indexesEnsured = true;
    // Off the request's critical path: kept alive by waitUntil on Workers.
    const pending = ensureIndexes(db).then(({ failed }) => {
      if (failed.length > 0) console.error("Some indexes could not be created", failed);
    });
    context?.ctx?.waitUntil(pending);
  }
  return db;
}

function database(): Promise<Db> {
  const context = requestContext();
  if (!context) {
    perProcess ??= connect(undefined).catch((error: unknown) => {
      perProcess = null;
      throw error;
    });
    return perProcess;
  }
  let pending = perRequest.get(context);
  if (!pending) {
    pending = connect(context);
    perRequest.set(context, pending);
    pending.catch(() => perRequest.delete(context));
  }
  return pending;
}

async function collection(name: string) {
  return (await database()).collection(name);
}

/**
 * Documents carry their own string `id`, which is what every lookup goes
 * through. Mongo's `_id` is left out of every read: it is an ObjectId, which
 * cannot be handed to a client component.
 */
const WITHOUT_ID = { projection: { _id: 0 } };

/** The driver adds `_id` to the object it inserts; callers keep their own copy clean. */
function copy(document: Record<string, unknown>): Document {
  return { ...document };
}

export const db = {
  async find<T>(name: string, filter: Record<string, unknown> = {}, options: FindOptions = {}): Promise<T[]> {
    let cursor = (await collection(name)).find(filter as Filter<Document>, WITHOUT_ID);
    if (options.sort) cursor = cursor.sort(options.sort);
    if (options.skip) cursor = cursor.skip(options.skip);
    if (options.limit) cursor = cursor.limit(options.limit);
    return (await cursor.toArray()) as T[];
  },
  /** Every document whose `field` is one of `values`, in one `$in` read. */
  findIn<T>(name: string, field: string, values: string[], options: FindOptions = {}): Promise<T[]> {
    const unique = [...new Set(values)].filter((value) => value);
    if (unique.length === 0) return Promise.resolve([]);
    return db.find<T>(name, { [field]: { $in: unique } }, options);
  },
  async findOne<T>(name: string, filter: Record<string, unknown>): Promise<T | null> {
    return (await (await collection(name)).findOne(filter as Filter<Document>, WITHOUT_ID)) as T | null;
  },
  async insertOne(name: string, document: Record<string, unknown>) {
    return (await collection(name)).insertOne(copy(document));
  },
  async insertMany(name: string, documents: Record<string, unknown>[]) {
    return (await collection(name)).insertMany(documents.map(copy));
  },
  async updateOne(name: string, filter: Record<string, unknown>, update: Record<string, unknown>) {
    return (await collection(name)).updateOne(filter as Filter<Document>, update);
  },
  async updateMany(name: string, filter: Record<string, unknown>, update: Record<string, unknown>) {
    return (await collection(name)).updateMany(filter as Filter<Document>, update);
  },
  async deleteOne(name: string, filter: Record<string, unknown>) {
    return (await collection(name)).deleteOne(filter as Filter<Document>);
  },
  async deleteMany(name: string, filter: Record<string, unknown>) {
    return (await collection(name)).deleteMany(filter as Filter<Document>);
  },
  async count(name: string, filter: Record<string, unknown> = {}) {
    return (await collection(name)).countDocuments(filter as Filter<Document>);
  },
};
