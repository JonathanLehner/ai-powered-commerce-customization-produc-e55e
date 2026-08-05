/**
 * Gives the seeded demo stores the support contacts guided setup now asks for.
 *
 * Only the stores seed.mjs creates are touched, and only where the field is
 * still missing: an address cannot be derived from a client's name without
 * inventing one that bounces, which is the bug this feature exists to fix. A
 * store the platform does not have contacts for keeps `setup.support` false and
 * shows as an unfinished setup step, which is the truth.
 *
 * Safe to re-run.
 *
 * Run: node --env-file=.env.local scripts/backfill-support-contacts.mjs
 */
const KEY = process.env.CLAWCORP_API_KEY;
if (!KEY) {
  console.error("CLAWCORP_API_KEY missing");
  process.exit(1);
}
const BASE = "https://www.clawcorp.ai/api/platform";

async function dbCall(body) {
  for (let attempt = 1; attempt <= 4; attempt++) {
    const res = await fetch(`${BASE}/db`, {
      method: "POST",
      headers: { Authorization: `Bearer ${KEY}`, "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) return (await res.json()).result;
    if (attempt === 4) throw new Error(`${body.action} ${body.collection}: ${res.status} ${await res.text()}`);
    await new Promise((r) => setTimeout(r, 800 * attempt));
  }
}

/** Mirrors the store records in scripts/seed.mjs. */
const CONTACTS = {
  str_northwind: { supportEmail: "support@northwind.example", supportPhone: "+1 503 555 0142" },
  str_lumen: { supportEmail: "hello@lumen.example", supportPhone: null },
  str_halcyon: { supportEmail: "events@halcyon.example", supportPhone: "+44 20 7946 0918" },
  str_rivet: { supportEmail: "orders@rivet.example", supportPhone: "+1 216 555 0113" },
  // str_ferro is mid-setup in the demo data and deliberately has none.
};

const stores = await dbCall({ collection: "stores", action: "find", filter: {} });

let updated = 0;
let skipped = 0;
for (const store of stores) {
  const contacts = CONTACTS[store.id];
  const setup = { ...store.setup };
  const hasSupport = typeof store.supportEmail === "string" && store.supportEmail.includes("@");

  const patch = {};
  if (!hasSupport && contacts) {
    patch.supportEmail = contacts.supportEmail;
    patch.supportPhone = contacts.supportPhone;
  } else if (!hasSupport && store.supportEmail === undefined) {
    // A store the platform has no address for: record the absence explicitly so
    // the storefront reads it as "not published yet" rather than as missing.
    patch.supportEmail = null;
    patch.supportPhone = null;
  }

  const support = Boolean(patch.supportEmail ?? (hasSupport ? store.supportEmail : null));
  if (setup.support !== support) {
    patch.setup = { ...setup, support };
  }

  if (Object.keys(patch).length === 0) {
    skipped += 1;
    continue;
  }
  await dbCall({
    collection: "stores",
    action: "updateOne",
    filter: { id: store.id },
    update: { $set: patch },
  });
  updated += 1;
  console.log(`${store.name}: ${JSON.stringify(patch)}`);
}

console.log(`done — ${updated} store${updated === 1 ? "" : "s"} updated, ${skipped} already in shape`);
