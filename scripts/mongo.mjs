/**
 * The app's MongoDB for scripts, over MONGODB_URI and MONGODB_DB — the same
 * database `src/lib/mongo.ts` resolves. `.env.local` sets MONGODB_DB to
 * `parcelith_dev`, so a script run with `--env-file=.env.local` works on the
 * development database; production is `parcelith`, used when MONGODB_DB is unset.
 *
 * `dbCall` takes the `{ collection, action, filter, … }` bodies the scripts were
 * written against and answers the way they expect, so each script only swaps
 * its helper.
 */
import { MongoClient } from "mongodb";

export const PRODUCTION_DB = "parcelith";

/**
 * Opens the database. `devOnly` refuses production: a seed clears collections,
 * and it must never be one missing variable away from wiping live data.
 */
export async function openDatabase({ devOnly = false } = {}) {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("MONGODB_URI missing");
    process.exit(1);
  }
  const name = process.env.MONGODB_DB || PRODUCTION_DB;
  if (devOnly && name === PRODUCTION_DB) {
    console.error(`Refusing to run against the production database "${PRODUCTION_DB}". Set MONGODB_DB (see .env.local).`);
    process.exit(1);
  }
  const client = new MongoClient(uri, { maxPoolSize: 5 });
  await client.connect();
  const db = client.db(name);
  console.log(`database: ${name}`);
  return { client, db, dbCall: (body) => dbCall(db, body) };
}

const WITHOUT_ID = { projection: { _id: 0 } };

export async function dbCall(db, { collection, action, filter = {}, document, documents, update, options = {} }) {
  const c = db.collection(collection);
  switch (action) {
    case "find": {
      let cursor = c.find(filter, WITHOUT_ID);
      if (options.sort) cursor = cursor.sort(options.sort);
      if (options.skip) cursor = cursor.skip(options.skip);
      if (options.limit) cursor = cursor.limit(options.limit);
      return cursor.toArray();
    }
    case "findOne":
      return c.findOne(filter, WITHOUT_ID);
    case "insertOne":
      return c.insertOne({ ...document });
    case "insertMany":
      return c.insertMany(documents.map((doc) => ({ ...doc })));
    case "updateOne":
      return c.updateOne(filter, update);
    case "updateMany":
      return c.updateMany(filter, update);
    case "deleteOne":
      return c.deleteOne(filter);
    case "deleteMany":
      return c.deleteMany(filter);
    case "countDocuments":
      return c.countDocuments(filter);
    default:
      throw new Error(`Unknown action ${action}`);
  }
}
