/**
 * Screenshots every template's demo store for the gallery: a thumbnail (the
 * top of the home page at 1440px), and the whole home page at 1440px and at
 * 390px. Uploaded to the platform asset store with responsive widths, and
 * written to src/lib/templates/assets.json as each template's `previews`.
 * Run against a production build of the app:
 *
 *   npm run build && npm start &
 *   npm run template-previews -- --base http://localhost:3000 [--only id,id]
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { chromium } from "playwright-core";
import { TEMPLATE_DEFS } from "../src/lib/templates/index.ts";

const KEY = process.env.CLAWCORP_API_KEY;
if (!KEY) {
  console.error("CLAWCORP_API_KEY missing");
  process.exit(1);
}
const args = process.argv.slice(2);
const value = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : null);
const base = (value("--base") ?? "http://localhost:3000").replace(/\/$/, "");
const only = value("--only")?.split(",") ?? null;
const ASSETS = path.join(process.cwd(), "src/lib/templates/assets.json");
const VARIANTS = path.join(process.cwd(), "scripts/image-variants.json");
const WIDTHS = [256, 384, 640, 1024];

async function upload(bytes, mimeType) {
  for (let attempt = 1; attempt <= 4; attempt++) {
    const res = await fetch("https://www.clawcorp.ai/api/platform/upload", {
      method: "POST",
      headers: { Authorization: `Bearer ${KEY}`, "content-type": mimeType },
      body: bytes,
    });
    if (res.ok) return (await res.json()).url;
    if (attempt === 4) throw new Error(`upload: ${res.status} ${await res.text()}`);
    await new Promise((r) => setTimeout(r, 1000 * attempt));
  }
}

async function variantsOf(buffer) {
  const { width } = await sharp(buffer).metadata();
  const sizes = {};
  for (const w of WIDTHS) {
    if (w > width) continue;
    sizes[w] = await upload(await sharp(buffer).resize({ width: w }).webp({ quality: 74 }).toBuffer(), "image/webp");
  }
  return sizes;
}

async function capture(page, url, width, height, full) {
  await page.setViewportSize({ width, height });
  await page.goto(url, { waitUntil: "load", timeout: 120_000 });
  await page.addStyleTag({ content: "[data-demo-notice]{display:none!important}" });
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 500) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 80));
    }
    window.scrollTo(0, 0);
  });
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(600);
  return page.screenshot({ fullPage: full, type: "png" });
}

const assets = JSON.parse(await readFile(ASSETS, "utf8"));
const variants = JSON.parse(await readFile(VARIANTS, "utf8"));
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || "/usr/bin/google-chrome" });
const desktop = await browser.newPage({ deviceScaleFactor: 1 });
const mobile = await browser.newPage({ deviceScaleFactor: 2, isMobile: true, hasTouch: true });

for (const t of TEMPLATE_DEFS.filter((d) => !only || only.includes(d.id))) {
  const url = `${base}/demo/${t.id}/en`;
  const top = await capture(desktop, url, 1440, 1080, false);
  const full = await capture(desktop, url, 1440, 900, true);
  const phone = await capture(mobile, url, 390, 844, true);

  const thumbnail = await sharp(top).resize(1024, 768).webp({ quality: 80 }).toBuffer();
  const desktopShot = await sharp(full).resize({ width: 1200 }).webp({ quality: 72 }).toBuffer();
  const mobileShot = await sharp(phone).resize({ width: 600 }).webp({ quality: 72 }).toBuffer();
  const previews = {
    thumbnail: await upload(thumbnail, "image/webp"),
    desktop: await upload(desktopShot, "image/webp"),
    mobile: await upload(mobileShot, "image/webp"),
  };
  variants[previews.thumbnail] = await variantsOf(thumbnail);
  variants[previews.desktop] = await variantsOf(desktopShot);
  variants[previews.mobile] = await variantsOf(mobileShot);
  assets[t.id] = { ...assets[t.id], previews };
  await writeFile(ASSETS, `${JSON.stringify(assets, null, 2)}\n`);
  await writeFile(VARIANTS, `${JSON.stringify(variants, null, 2)}\n`);
  console.log(`ok  ${t.id}`);
}
await browser.close();
