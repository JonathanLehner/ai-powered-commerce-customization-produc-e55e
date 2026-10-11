/**
 * Gives every store product mockup a JPEG copy for link previews. The share
 * image renderer (`ImageResponse`) cannot draw WebP, which is what mockups are
 * stored as, and the deployment has no image toolchain to convert one at
 * request time. New mockups get their copy when they are rendered; this fills
 * in the ones made before.
 *
 * Only adds `shareUrl` to mockups that lack one, so it is safe to re-run.
 *
 * Run: npm run backfill-share-images
 */
import sharp from "sharp";
import { openDatabase } from "./mongo.mjs";

const KEY = process.env.CLAWCORP_API_KEY;
if (!KEY) {
  console.error("CLAWCORP_API_KEY missing");
  process.exit(1);
}

async function upload(bytes) {
  const res = await fetch("https://www.clawcorp.ai/api/platform/upload", {
    method: "POST",
    headers: { Authorization: `Bearer ${KEY}`, "content-type": "image/jpeg" },
    body: bytes,
  });
  if (!res.ok) throw new Error(`upload: ${res.status} ${await res.text()}`);
  return (await res.json()).url;
}

async function shareCopy(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch ${url}: ${res.status}`);
  const source = Buffer.from(await res.arrayBuffer());
  return sharp(source).flatten({ background: "#ffffff" }).jpeg({ quality: 85 }).toBuffer();
}

const { client, db } = await openDatabase();
const products = db.collection("store_products");
let made = 0;

for (const product of await products.find({ "mockups.0": { $exists: true } }).toArray()) {
  for (const mockup of product.mockups) {
    if (mockup.shareUrl) continue;
    try {
      const shareUrl = await upload(await shareCopy(mockup.url));
      // Targets the one mockup by id, so a mockup regenerated meanwhile is left alone.
      await products.updateOne(
        { id: product.id, "mockups.id": mockup.id, "mockups.url": mockup.url },
        { $set: { "mockups.$.shareUrl": shareUrl } },
      );
      made += 1;
      console.log(`  ${product.name} · ${mockup.view} · ${mockup.colour}`);
    } catch (error) {
      console.error(`  skipped ${product.name} ${mockup.id}: ${error.message}`);
    }
  }
}

console.log(`share images added: ${made}`);
await client.close();
