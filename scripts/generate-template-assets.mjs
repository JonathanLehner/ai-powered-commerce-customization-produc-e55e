/**
 * Builds every store template's original assets, once, at build time:
 *
 * - hero, lifestyle, banner and extra photographs from the image model, prompted for
 *   the template's fictional brand with no text or logos in frame;
 * - product shots: the template's artwork, drawn in Chrome in the template's
 *   own typeface, composited onto the shared catalog's mockup photographs;
 * - print files: the same artwork as a transparent PNG at print resolution, one
 *   per ink the template's products use, placed on the starter products;
 * - responsive WebP widths of all of them, merged into image-variants.json.
 *
 * Everything is uploaded to the platform asset store and the URLs written to
 * src/lib/templates/assets.json, which is committed. Existing entries are
 * kept, so a rerun only fills what is missing.
 *
 *   node --env-file=.env.local --experimental-strip-types --import ./scripts/ts-resolve.mjs \
 *     scripts/generate-template-assets.mjs [--only id,id] [--redo-products]
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { chromium } from "playwright-core";
import { TEMPLATE_DEFS, STARTER_CATALOG } from "../src/lib/templates/index.ts";

const KEY = process.env.CLAWCORP_API_KEY;
if (!KEY) {
  console.error("CLAWCORP_API_KEY missing");
  process.exit(1);
}
const BASE = "https://www.clawcorp.ai/api/platform";
const ASSETS = path.join(process.cwd(), "src/lib/templates/assets.json");
const VARIANTS = path.join(process.cwd(), "scripts/image-variants.json");
const WIDTHS = [256, 384, 640, 1024];
const CHROME = process.env.CHROME_PATH || "/usr/bin/google-chrome";

const args = process.argv.slice(2);
const only = args.includes("--only") ? args[args.indexOf("--only") + 1].split(",") : null;
const redoProducts = args.includes("--redo-products");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function upload(bytes, mimeType) {
  for (let attempt = 1; attempt <= 4; attempt++) {
    const res = await fetch(`${BASE}/upload`, {
      method: "POST",
      headers: { Authorization: `Bearer ${KEY}`, "content-type": mimeType },
      body: bytes,
    });
    if (res.ok) return (await res.json()).url;
    if (attempt === 4) throw new Error(`upload: ${res.status} ${await res.text()}`);
    await sleep(1000 * attempt);
  }
}

const RULES =
  "Original photograph for a fictional brand. There must be no text, letters, numbers, logos, brand marks, signage or watermarks anywhere in the image; all clothing is completely plain. Photorealistic, natural colour, high detail.";

async function generateImage(prompt) {
  let last = "";
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const res = await fetch(`${BASE}/gemini`, {
        method: "POST",
        headers: { Authorization: `Bearer ${KEY}`, "content-type": "application/json" },
        body: JSON.stringify({ prompt: `${prompt}. ${RULES}`, model: "gemini-3.1-flash-image" }),
      });
      if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 200)}`);
      const json = await res.json();
      const url = json.images?.[0]?.url;
      if (!url) throw new Error("no image returned");
      return url;
    } catch (err) {
      last = String(err);
      console.log(`  retry ${attempt}: ${last}`);
      await sleep(2500 * attempt);
    }
  }
  throw new Error(last);
}

async function fetchBuffer(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch ${url}: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

/* ------------------------------------------------------------ the blanks */

/** The catalog's mockup photographs (front and back view) and print rectangles, per blank and colour. */
const PHOTOS = {
  tee: {
    White: ["0616d9895c58060ecc82bf1fcf4119cf", "e03cb432ec71e49cdb40c6d4295ff79a"],
    Black: ["fc3e8c00a3f95ceff43c57c582dfdd25", "983926775285d9e8921585a333634818"],
  },
  hoodie: {
    Navy: ["aebf26fbeb9c26e836aed08b1acbde31", "e52c132408bf28ce79aefcdea5a297e4"],
    "Heather grey": ["cb4be78f6ec7aa1c2b4483907211ae8c", "2b7c50735ace5049b67c055616db8862"],
  },
  mug: { White: ["28a72e3e605df4cabf2562bbda584d7e", "4d258b890df1a135e39a5e40571fb33a"] },
  blackMug: { Black: ["5b86fc6ea5adc2ae208f2a2dd5f282d7", "872d43ad992490916a371f1b332b960a"] },
};
const photoUrl = (hash) => `https://assets.clawcorp.ai/6a6d61c4c5a5e409b7afe7ad/gen/${hash}-0.jpg`;
const RECTS = {
  tee: [{ x: 0.33, y: 0.29, w: 0.34, h: 0.34 }, { x: 0.33, y: 0.27, w: 0.34, h: 0.38 }],
  hoodie: [{ x: 0.34, y: 0.36, w: 0.32, h: 0.24 }, { x: 0.33, y: 0.3, w: 0.34, h: 0.34 }],
  mug: [{ x: 0.3, y: 0.36, w: 0.33, h: 0.3 }, { x: 0.37, y: 0.36, w: 0.33, h: 0.3 }],
};
const FAMILY = { tee: "tee", organicTee: "tee", hoodie: "hoodie", ecoHoodie: "hoodie", mug: "mug", blackMug: "blackMug" };
const DARK = new Set(["Black", "Navy"]);

/* --------------------------------------------------------------- artwork */

const MARKS = {
  none: () => "",
  dot: (c) => `<svg width="60" height="60" viewBox="0 0 60 60"><circle cx="30" cy="30" r="22" fill="${c}"/></svg>`,
  circle: (c) => `<svg width="90" height="90" viewBox="0 0 90 90"><circle cx="45" cy="45" r="36" fill="none" stroke="${c}" stroke-width="9"/><circle cx="45" cy="45" r="12" fill="${c}"/></svg>`,
  bracket: (c) => `<svg width="120" height="70" viewBox="0 0 120 70"><path d="M30 8 L8 35 L30 62 M90 8 L112 35 L90 62" fill="none" stroke="${c}" stroke-width="10" stroke-linecap="square"/><rect x="52" y="52" width="18" height="10" fill="${c}"/></svg>`,
  star: (c) => `<svg width="90" height="90" viewBox="0 0 100 100"><path d="M50 4 L61 38 L97 38 L68 59 L79 94 L50 72 L21 94 L32 59 L3 38 L39 38 Z" fill="${c}"/></svg>`,
  bolt: (c) => `<svg width="70" height="100" viewBox="0 0 70 100"><path d="M42 2 L6 58 L32 58 L24 98 L64 38 L38 38 Z" fill="${c}"/></svg>`,
  crest: (c) => `<svg width="90" height="104" viewBox="0 0 90 104"><path d="M45 4 L84 16 L84 52 C84 76 66 92 45 100 C24 92 6 76 6 52 L6 16 Z" fill="none" stroke="${c}" stroke-width="7"/><path d="M45 28 L54 46 L74 48 L58 60 L63 80 L45 69 L27 80 L32 60 L16 48 L36 46 Z" fill="${c}"/></svg>`,
  wave: (c) => `<svg width="140" height="60" viewBox="0 0 140 60"><path d="M4 50 L40 12 L62 34 L82 18 L136 50" fill="none" stroke="${c}" stroke-width="9" stroke-linejoin="round"/></svg>`,
  slash: (c) => `<svg width="80" height="80" viewBox="0 0 80 80"><path d="M10 74 L70 6" stroke="${c}" stroke-width="14"/></svg>`,
  sun: (c) => `<svg width="130" height="70" viewBox="0 0 130 70"><path d="M20 66 A45 45 0 0 1 110 66 Z" fill="${c}"/>${[0, 1, 2, 3, 4, 5, 6].map((i) => { const a = Math.PI * (i / 6); return `<line x1="${65 - Math.cos(a) * 52}" y1="${66 - Math.sin(a) * 52}" x2="${65 - Math.cos(a) * 62}" y2="${66 - Math.sin(a) * 62}" stroke="${c}" stroke-width="5"/>`; }).join("")}</svg>`,
  cup: (c) => `<svg width="90" height="90" viewBox="0 0 90 90"><path d="M14 30 H66 V54 C66 70 54 80 40 80 C26 80 14 70 14 54 Z" fill="${c}"/><path d="M66 38 C80 38 80 60 64 60" fill="none" stroke="${c}" stroke-width="7"/><path d="M30 6 C24 14 36 16 30 24 M46 6 C40 14 52 16 46 24" fill="none" stroke="${c}" stroke-width="5" stroke-linecap="round"/></svg>`,
  leaf: (c) => `<svg width="80" height="90" viewBox="0 0 80 90"><path d="M40 86 C40 60 40 40 40 30 M40 50 C14 46 6 24 10 6 C34 8 46 26 40 50 Z M40 50 C66 46 74 24 70 6 C46 8 34 26 40 50 Z" fill="${c}" stroke="${c}" stroke-width="5"/></svg>`,
  heart: (c) => `<svg width="90" height="82" viewBox="0 0 90 82"><path d="M45 78 C18 58 4 44 4 26 C4 13 14 4 26 4 C35 4 41 9 45 16 C49 9 55 4 64 4 C76 4 86 13 86 26 C86 44 72 58 45 78 Z" fill="${c}"/></svg>`,
  laurel: (c) => `<svg width="130" height="80" viewBox="0 0 130 80">${[0, 1, 2, 3, 4].map((i) => `<ellipse cx="${30 - i * 3}" cy="${12 + i * 13}" rx="11" ry="5" transform="rotate(${-40 + i * 12} ${30 - i * 3} ${12 + i * 13})" fill="${c}"/><ellipse cx="${100 + i * 3}" cy="${12 + i * 13}" rx="11" ry="5" transform="rotate(${40 - i * 12} ${100 + i * 3} ${12 + i * 13})" fill="${c}"/>`).join("")}<circle cx="65" cy="40" r="10" fill="${c}"/></svg>`,
  ticket: (c) => `<svg width="130" height="66" viewBox="0 0 130 66"><path d="M4 4 H126 V22 A11 11 0 0 0 126 44 V62 H4 V44 A11 11 0 0 0 4 22 Z" fill="none" stroke="${c}" stroke-width="6"/><path d="M90 10 V56" stroke="${c}" stroke-width="4" stroke-dasharray="6 5"/><path d="M48 18 L52 28 L63 29 L55 36 L57 47 L48 41 L39 47 L41 36 L33 29 L44 28 Z" fill="${c}"/></svg>`,
  brush: (c) => `<svg width="130" height="60" viewBox="0 0 130 60"><path d="M6 44 C30 10 54 50 78 22 C92 6 110 14 124 8" fill="none" stroke="${c}" stroke-width="12" stroke-linecap="round"/></svg>`,
  grid: (c) => `<svg width="80" height="80" viewBox="0 0 80 80"><rect x="4" y="4" width="72" height="72" fill="none" stroke="${c}" stroke-width="5"/><path d="M4 28 H76 M4 52 H76 M28 4 V76 M52 4 V76" stroke="${c}" stroke-width="3"/><rect x="28" y="28" width="24" height="24" fill="${c}"/></svg>`,
};

function artworkHtml(art, ink, accent) {
  const family = encodeURIComponent(art.font).replace(/%20/g, "+");
  const word = art.uppercase ? art.word.toUpperCase() : art.word;
  const sub = art.uppercase ? art.sub.toUpperCase() : art.sub;
  return `<!doctype html><html><head>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=${family}:wght@${art.weight}&display=block">
<style>
  html,body{margin:0;background:transparent}
  #art{display:inline-flex;flex-direction:column;align-items:center;gap:18px;padding:24px 32px;font-family:'${art.font}',sans-serif;color:${ink}}
  .word{font-size:150px;font-weight:${art.weight};letter-spacing:${art.tracking}px;line-height:1;white-space:nowrap}
  .sub{font-size:46px;font-weight:${art.weight};letter-spacing:${Math.max(4, art.tracking + 4)}px;color:${accent};white-space:nowrap}
</style></head><body><div id="art">${MARKS[art.mark](accent)}<div class="word">${word}</div>${sub ? `<div class="sub">${sub}</div>` : ""}</div></body></html>`;
}

async function renderArtwork(page, art, dark) {
  const ink = dark ? art.inkDark : art.inkLight;
  // The accent must read on the blank too: on a light blank a pale accent becomes the ink.
  const accent = dark ? art.accent : art.accent.toLowerCase() === art.inkDark.toLowerCase() ? art.inkLight : art.accent;
  await page.setContent(artworkHtml(art, ink, accent), { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  return page.locator("#art").screenshot({ omitBackground: true });
}

const photoCache = new Map();
async function photo(url) {
  if (!photoCache.has(url)) photoCache.set(url, await fetchBuffer(url));
  return photoCache.get(url);
}

async function compose(baseUrl, rect, artPng, family) {
  const base = await photo(baseUrl);
  const { width: W, height: H } = await sharp(base).metadata();
  const area = { x: rect.x * W, y: rect.y * H, w: rect.w * W, h: rect.h * H };
  const meta = await sharp(artPng).metadata();
  const scale = Math.min((area.w * (family === "mug" || family === "blackMug" ? 0.9 : 0.86)) / meta.width, (area.h * 0.8) / meta.height);
  const w = Math.max(8, Math.round(meta.width * scale));
  const h = Math.max(8, Math.round(meta.height * scale));
  const art = await sharp(artPng).resize(w, h).png().toBuffer();
  const left = Math.round(area.x + (area.w - w) / 2);
  const top = Math.round(area.y + (family === "tee" ? area.h * 0.08 : (area.h - h) / 2));
  // Multiply-like look: a touch of transparency lets the fabric texture through.
  const layer = await sharp(art).ensureAlpha(0.92).toBuffer();
  return sharp(base).composite([{ input: layer, left, top, blend: "over" }]).webp({ quality: 84 }).toBuffer();
}

/* ------------------------------------------------------------- variants */

async function buildVariants(url, variants) {
  if (variants[url]) return;
  const source = await fetchBuffer(url);
  const { width } = await sharp(source).metadata();
  const sizes = {};
  // A source narrower than the widest width gets a WebP copy at its own width,
  // so a browser never falls back to the original photograph.
  for (const w of [...WIDTHS.filter((w) => w < width), Math.min(width, WIDTHS.at(-1))]) {
    const webp = await sharp(source).resize({ width: w }).webp({ quality: 74 }).toBuffer();
    sizes[w] = await upload(webp, "image/webp");
  }
  variants[url] = sizes;
}

/* ------------------------------------------------------------------ main */

const assets = JSON.parse(await readFile(ASSETS, "utf8"));
const variants = JSON.parse(await readFile(VARIANTS, "utf8"));
const save = () =>
  Promise.all([writeFile(ASSETS, `${JSON.stringify(assets, null, 2)}\n`), writeFile(VARIANTS, `${JSON.stringify(variants, null, 2)}\n`)]);

const templates = TEMPLATE_DEFS.filter((t) => !only || only.includes(t.id));

// 1. Photographs, three at a time.
const jobs = templates.flatMap((t) => [
  ...["hero", "lifestyle", "banner"].map((kind) => ({ t, kind, prompt: t.imagery[kind] })),
  ...(t.imagery.extra ?? []).map((prompt, i) => ({ t, kind: "extra", i, prompt })),
]);
const queue = jobs.filter(({ t, kind, i }) => (kind === "extra" ? !assets[t.id]?.extra?.[i] : !assets[t.id]?.[kind]));
console.log(`${queue.length} photographs to generate`);
await Promise.all(
  Array.from({ length: 3 }, async () => {
    while (queue.length) {
      const { t, kind, i, prompt } = queue.shift();
      const url = await generateImage(prompt);
      assets[t.id] = { hero: "", lifestyle: "", banner: "", products: [], ...(assets[t.id] ?? {}) };
      if (kind === "extra") (assets[t.id].extra ??= [])[i] = url;
      else assets[t.id][kind] = url;
      console.log(`ok  ${t.id} ${kind}${kind === "extra" ? i + 1 : ""} ${url}`);
      await save();
    }
  }),
);

// 2. Product shots.
const browser = await chromium.launch({ executablePath: CHROME });
const page = await browser.newPage({ deviceScaleFactor: 2 });
for (const t of templates) {
  const entry = (assets[t.id] ??= { hero: "", lifestyle: "", banner: "", products: [] });
  if (!redoProducts && entry.products?.length === t.products.length && entry.products.every(Boolean)) continue;
  const artCache = new Map();
  const used = new Map();
  const products = [];
  for (const product of t.products) {
    if (!(product.starter in STARTER_CATALOG)) throw new Error(`${t.id}: unknown starter ${product.starter}`);
    const family = FAMILY[product.starter];
    const photos = PHOTOS[family][product.colour];
    if (!photos) throw new Error(`${t.id}: no ${product.colour} photo for ${product.starter}`);
    // The second product on the same blank shows the back print, so no two cards look alike.
    const key = `${family}:${product.colour}`;
    const view = Math.min(used.get(key) ?? 0, 1);
    used.set(key, (used.get(key) ?? 0) + 1);
    const dark = DARK.has(product.colour);
    if (!artCache.has(dark)) artCache.set(dark, await renderArtwork(page, t.artwork, dark));
    const rects = RECTS[family === "blackMug" ? "mug" : family];
    const webp = await compose(photoUrl(photos[view]), rects[view], artCache.get(dark), family);
    products.push(await upload(webp, "image/webp"));
  }
  entry.products = products;
  console.log(`ok  ${t.id} ${products.length} product shots`);
  await save();
}

// 3. Print files, at four times the CSS size so they print sharp on a full chest or mug wrap.
const printPage = await browser.newPage({ deviceScaleFactor: 4 });
for (const t of templates) {
  const entry = assets[t.id];
  const inks = [...new Set(t.products.map((p) => (DARK.has(p.colour) ? "dark" : "light")))];
  if (inks.every((ink) => entry.artwork?.[ink])) continue;
  entry.artwork ??= {};
  for (const ink of inks.filter((ink) => !entry.artwork[ink])) {
    const png = await renderArtwork(printPage, t.artwork, ink === "dark");
    const { width, height } = await sharp(png).metadata();
    entry.artwork[ink] = { url: await upload(png, "image/png"), width, height, bytes: png.length };
  }
  console.log(`ok  ${t.id} print files ${inks.join(", ")}`);
  await save();
}
await browser.close();

// 4. Responsive widths.
for (const t of templates) {
  const entry = assets[t.id];
  for (const url of [entry.hero, entry.lifestyle, entry.banner, ...(entry.extra ?? []), ...entry.products].filter(Boolean)) {
    await buildVariants(url, variants);
  }
  console.log(`ok  ${t.id} variants`);
  await save();
}
console.log("done");
