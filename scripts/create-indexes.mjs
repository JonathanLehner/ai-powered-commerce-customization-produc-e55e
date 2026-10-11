/**
 * Creates the indexes the data layer relies on (`src/lib/db-indexes.ts`). The
 * app also does this on the first connection of each Worker isolate; creating
 * an index that already exists is a no-op, so this is safe to re-run.
 *
 * Run: npm run create-indexes                      # MONGODB_DB from .env.local
 *      MONGODB_DB=parcelith npm run create-indexes # production
 */
import { ensureIndexes } from "../src/lib/db-indexes.ts";
import { openDatabase } from "./mongo.mjs";

const { client, db } = await openDatabase();
const { created, failed } = await ensureIndexes(db);
console.log(`${created.length} indexes in place`);
for (const failure of failed) console.error(`failed: ${failure}`);
await client.close();
process.exit(failed.length > 0 ? 1 : 0);
