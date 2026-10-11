/**
 * Replaces plain-text passwords on existing user records with bcrypt hashes.
 *
 * The hand-written sign-in never looked at the password field, so the seeded
 * accounts stored "parcelith" verbatim. Auth.js's credentials provider checks it
 * with bcrypt, so the collection has to hold hashes instead — and a password
 * sitting in the database in the clear is worth removing on its own.
 *
 * Accounts created by accepting an invitation hold a random placeholder that was
 * never a usable password; those are hashed too, so no row is left readable.
 * Rows that already hold a bcrypt hash are left alone, so this is safe to re-run.
 *
 * Run: node --env-file=.env.local scripts/backfill-password-hashes.mjs
 */
import { hashSync } from "bcryptjs";
import { openDatabase } from "./mongo.mjs";

const { client, dbCall } = await openDatabase();

const users = await dbCall({ collection: "users", action: "find", filter: {} });

let hashed = 0;
let skipped = 0;
for (const user of users) {
  const current = typeof user.password === "string" ? user.password : "";
  if (current.startsWith("$2")) {
    skipped += 1;
    continue;
  }
  await dbCall({
    collection: "users",
    action: "updateOne",
    filter: { id: user.id },
    update: { $set: { password: hashSync(current || "parcelith", 10) } },
  });
  hashed += 1;
  console.log(`${user.email}: password hashed`);
}

console.log(`done — ${hashed} hashed, ${skipped} already hashed`);
await client.close();
