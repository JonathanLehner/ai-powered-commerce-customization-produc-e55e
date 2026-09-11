/**
 * Brings the live Northwind Field Tee in line with scripts/seed.mjs without a
 * full re-seed (which clears every collection): shopper artwork upload on, and
 * the catalog's Black variants added next to White, each colour with its own
 * approved mockups so the storefront shows colour swatches.
 *
 * Safe to re-run.
 *
 * Run: node --env-file=.env.local scripts/backfill-colour-and-upload.mjs
 */
import { randomBytes } from "node:crypto";
import sharp from "sharp";

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

async function upload(bytes, mimeType) {
  const res = await fetch(`${BASE}/upload`, {
    method: "POST",
    headers: { Authorization: `Bearer ${KEY}`, "content-type": mimeType },
    body: bytes,
  });
  if (!res.ok) throw new Error(`upload: ${res.status} ${await res.text()}`);
  return (await res.json()).url;
}

async function fetchBuffer(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch ${url}: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

/** Same compositing as composeMockup() in scripts/seed.mjs. */
async function composeMockup(baseUrl, area, art) {
  const baseBuf = await fetchBuffer(baseUrl);
  const { width: W, height: H } = await sharp(baseBuf).metadata();
  const areaW = area.rect.w * W;
  const areaH = area.rect.h * H;
  const targetW = Math.max(8, Math.round(art.scale * areaW));
  const targetH = Math.max(8, Math.round((targetW * art.pixelHeight) / art.pixelWidth));
  let pipeline = sharp(await fetchBuffer(art.url)).resize(targetW, targetH, { fit: "fill" }).png();
  if (art.rotation) pipeline = pipeline.rotate(art.rotation, { background: { r: 0, g: 0, b: 0, alpha: 0 } });
  const out = await pipeline.toBuffer({ resolveWithObject: true });
  const left = Math.round(area.rect.x * W + art.x * areaW - out.info.width / 2);
  const top = Math.round(area.rect.y * H + art.y * areaH - out.info.height / 2);
  const buf = await sharp(baseBuf)
    .composite([{ input: out.data, left: Math.max(0, left), top: Math.max(0, top) }])
    .webp({ quality: 82 })
    .toBuffer();
  return upload(buf, "image/webp");
}

const COLOUR = "Black";
const product = await dbCall({
  collection: "store_products",
  action: "findOne",
  filter: { storeId: "str_northwind", slug: "northwind-field-tee" },
});
if (!product) {
  console.error("Northwind Field Tee not found — run scripts/seed.mjs instead");
  process.exit(1);
}
const catalog = await dbCall({ collection: "catalog_products", action: "findOne", filter: { id: product.catalogProductId } });

const patch = {};
if (!product.shopperCustomization.artworkUpload) {
  patch.shopperCustomization = { ...product.shopperCustomization, artworkUpload: true };
}

if (!product.variants.some((v) => v.colour === COLOUR)) {
  const priceBySize = new Map(product.variants.map((v) => [v.size, v.price]));
  patch.variants = [
    ...product.variants,
    ...catalog.variants
      .filter((v) => v.colour === COLOUR)
      .map((v) => ({
        id: `svar_${randomBytes(5).toString("hex")}`,
        catalogVariantId: v.id,
        name: v.name,
        colour: v.colour,
        colourHex: v.colourHex,
        size: v.size,
        sku: `${catalog.id.slice(4, 8).toUpperCase()}-${v.sku}`,
        baseCost: v.baseCost,
        price: priceBySize.get(v.size) ?? product.price,
        enabled: true,
        availability: v.availability,
      })),
  ];
}

if (!product.mockups.some((m) => m.colour === COLOUR)) {
  const now = new Date().toISOString();
  const added = [];
  for (const art of product.artworks) {
    const area = catalog.printAreas.find((a) => a.id === art.printAreaId);
    const base = catalog.mockups.find((m) => m.view === area.view && m.colour === COLOUR);
    if (!base) throw new Error(`catalog has no ${COLOUR} ${area.view} mockup`);
    added.push({
      id: `mck_${randomBytes(5).toString("hex")}`,
      view: area.view,
      url: await composeMockup(base.url, area, art),
      colour: COLOUR,
      generatedAt: now,
      approved: true,
      approvedBy: product.importedBy,
      approvedAt: now,
    });
    console.log(`  ${COLOUR} ${area.view} mockup rendered`);
  }
  patch.mockups = [...product.mockups, ...added];
}

if (Object.keys(patch).length === 0) {
  console.log("done — Northwind Field Tee already in shape");
} else {
  await dbCall({ collection: "store_products", action: "updateOne", filter: { id: product.id }, update: { $set: patch } });
  console.log(`done — Northwind Field Tee updated: ${Object.keys(patch).join(", ")}`);
}
