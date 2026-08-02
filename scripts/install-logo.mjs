/**
 * Installs the brand mark from the canonical asset URL.
 *
 * The source is a square PNG with transparent margins baked in. Those margins
 * would shrink the mark inside every header slot and, worse, inside a 16px
 * favicon, so the artwork is trimmed to its bounding box once here:
 *
 *   public/logo.png    full-resolution mark, trimmed — used by <Logo>
 *   src/app/icon.png   128px favicon, mark scaled to fill the square
 *
 *   node scripts/install-logo.mjs
 *
 * It prints the trimmed dimensions; keep LOGO_ASPECT in src/components/ui.tsx
 * in step with them so the header reserves the right width.
 */
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const SOURCE =
  "https://assets.clawcorp.ai/logos/6a5826b5ba63ea291c570422/6a6d61c4c5a5e409b7afe7ad/0fc7aa8ada292f97fd85ff5e.png";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const ICON_SIZE = 128;

const res = await fetch(SOURCE);
if (!res.ok) throw new Error(`Could not download the brand logo: ${res.status}`);
const source = Buffer.from(await res.arrayBuffer());

// `trim` drops the transparent border. The mark is two flat gradients, so a
// palette costs nothing visible and roughly quarters the bytes every page load.
const PNG = { compressionLevel: 9, palette: true, quality: 100 };

const mark = await sharp(source).trim({ threshold: 1 }).png(PNG).toBuffer();
const { width, height } = await sharp(mark).metadata();
await writeFile(path.join(ROOT, "public/logo.png"), mark);

const icon = await sharp(mark)
  .resize({ width: ICON_SIZE, height: ICON_SIZE, fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png(PNG)
  .toBuffer();
await writeFile(path.join(ROOT, "src/app/icon.png"), icon);

console.log(`public/logo.png   ${width}x${height}`);
console.log(`src/app/icon.png  ${ICON_SIZE}x${ICON_SIZE}`);
