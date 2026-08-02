/**
 * Builds responsive WebP variants of every image in `image-manifest.json`.
 *
 * The deployment target has no runtime image processing, so `next/image` would
 * otherwise hand every visitor the full-size original. Each source image is
 * resized once here, uploaded to the platform asset store, and the permanent
 * URLs are written to `image-variants.json`, which the custom image loader in
 * `src/lib/image-loader.ts` reads at request time.
 *
 *   node scripts/generate-variants.mjs     # requires CLAWCORP_API_KEY
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MANIFEST = path.join(HERE, "image-manifest.json");
const VARIANTS = path.join(HERE, "image-variants.json");

/** Must match `images.deviceSizes` and `images.imageSizes` in next.config.ts. */
const WIDTHS = [256, 384, 640, 1024];

const KEY = process.env.CLAWCORP_API_KEY;
if (!KEY) {
  console.error("CLAWCORP_API_KEY is not set.");
  process.exit(1);
}

async function upload(bytes, mimeType) {
  const res = await fetch("https://www.clawcorp.ai/api/platform/upload", {
    method: "POST",
    headers: { Authorization: `Bearer ${KEY}`, "content-type": mimeType },
    body: bytes,
  });
  if (!res.ok) throw new Error(`Upload failed: ${res.status} ${await res.text()}`);
  return (await res.json()).url;
}

const manifest = JSON.parse(await readFile(MANIFEST, "utf8"));
let existing = {};
try {
  existing = JSON.parse(await readFile(VARIANTS, "utf8"));
} catch {
  // First run.
}

const out = { ...existing };

for (const [key, url] of Object.entries(manifest)) {
  if (out[url]) {
    console.log(`skip  ${key} (already built)`);
    continue;
  }
  const source = Buffer.from(await (await fetch(url)).arrayBuffer());
  const { width: sourceWidth } = await sharp(source).metadata();
  const sizes = {};
  for (const width of WIDTHS) {
    if (width > sourceWidth) continue;
    const webp = await sharp(source).resize({ width }).webp({ quality: 74 }).toBuffer();
    sizes[width] = await upload(webp, "image/webp");
    console.log(`  ${key} @${width} → ${Math.round(webp.length / 1024)} KB`);
  }
  out[url] = sizes;
}

await writeFile(VARIANTS, `${JSON.stringify(out, null, 2)}\n`);
console.log(`\nWrote ${Object.keys(out).length} entries to image-variants.json`);
