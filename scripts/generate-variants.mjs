/**
 * Builds responsive WebP variants of every image in `image-manifest.json`.
 *
 * The deployment target has no runtime image processing, so `next/image` would
 * otherwise hand every visitor the full-size original. Each source image is
 * resized once here, uploaded through the app's upload API, and the permanent
 * URLs are written to `image-variants.json`, which the custom image loader in
 * `src/lib/image-loader.ts` reads at request time.
 *
 *   node --env-file=.env.local scripts/generate-variants.mjs   # requires UPLOAD_API_KEY and UPLOAD_STORE_ID
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { uploadViaApp } from "./app-upload.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MANIFEST = path.join(HERE, "image-manifest.json");
const VARIANTS = path.join(HERE, "image-variants.json");

/** Must match `images.deviceSizes` and `images.imageSizes` in next.config.ts. */
const WIDTHS = [256, 384, 640, 1024];

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
    sizes[width] = await uploadViaApp(webp, "image/webp");
    console.log(`  ${key} @${width} → ${Math.round(webp.length / 1024)} KB`);
  }
  out[url] = sizes;
}

await writeFile(VARIANTS, `${JSON.stringify(out, null, 2)}\n`);
console.log(`\nWrote ${Object.keys(out).length} entries to image-variants.json`);
