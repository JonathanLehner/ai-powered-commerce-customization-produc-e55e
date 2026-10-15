/**
 * Builds every store template's original assets, once, at build time:
 *
 * - hero, lifestyle, banner and extra photographs from the image model, prompted for
 *   the template's fictional brand with no text or logos in frame;
 * - product shots: the template's artwork, drawn in Chrome in the template's
 *   own typeface, composited onto the lifestyle photographs of the blanks in
 *   scripts/blank-photos.json, placed as the product calls for (a full chest
 *   print, a left-chest crest, a cap patch, a poster sheet, a die-cut sticker).
 *   A dark template's shots are taken on the same photographs re-lit by the
 *   image model on a backdrop in the theme's colours;
 * - print files: the same artwork as a transparent PNG at print resolution, one
 *   per ink the template's products use, and the poster sheet design when the
 *   template sells a poster, placed on the starter products;
 * - responsive WebP widths of all of them, merged into image-variants.json.
 *
 * Everything is uploaded through the app's upload API (scripts/app-upload.mjs)
 * and the URLs written to src/lib/templates/assets.json, which is committed. Existing entries are
 * kept, so a rerun only fills what is missing.
 *
 *   node --env-file=.env.local --experimental-strip-types --import ./scripts/ts-resolve.mjs \
 *     scripts/generate-template-assets.mjs [--only id,id] [--redo-products] [--redo-art]
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { chromium } from "playwright-core";
import { artworkPlacement, blankFamily, STARTER_CATALOG, TEMPLATE_DEFS } from "../src/lib/templates/index.ts";
import { isDarkBlank } from "../src/lib/templates/demo.ts";
import { uploadViaApp } from "./app-upload.mjs";

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
// Print files are kept unless asked for again, since stores may already use them.
const redoArt = args.includes("--redo-art");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));


const RULES =
  "Original photograph for a fictional brand. There must be no text, letters, numbers, logos, brand marks, signage or watermarks anywhere in the image; all clothing is completely plain. Photorealistic, natural colour, high detail.";

async function generateImage(prompt, source = null) {
  const body = source
    ? {
        model: "gemini-3.1-flash-image",
        contents: [
          {
            role: "user",
            parts: [{ inlineData: { mimeType: "image/jpeg", data: source.toString("base64") } }, { text: prompt }],
          },
        ],
      }
    : { prompt: `${prompt}. ${RULES}`, model: "gemini-3.1-flash-image" };
  let last = "";
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const res = await fetch(`${BASE}/gemini`, {
        method: "POST",
        headers: { Authorization: `Bearer ${KEY}`, "content-type": "application/json" },
        body: JSON.stringify(body),
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

/** Lifestyle photographs of each blank per colour and view, with the print rectangle on each. */
const PHOTOS = JSON.parse(await readFile(path.join(process.cwd(), "scripts/blank-photos.json"), "utf8"));

function luminance(hex) {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [n >> 16, (n >> 8) & 255, n & 255].map((c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contrast = (a, b) => {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

/** A template whose pages are dark gets its product shots on a backdrop in its own colours. */
const isDarkTheme = (t) => luminance(t.design.colors?.background ?? "#ffffff") < 0.1;

/** The theme's background in words the image model can light a scene with. */
function backdropWords(hex) {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [n >> 16, (n >> 8) & 255, n & 255].map((c) => c / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max - min < 0.04) return "near-black charcoal";
  const hue = max === r ? (60 * ((g - b) / (max - min)) + 360) % 360 : max === g ? 60 * ((b - r) / (max - min)) + 120 : 60 * ((r - g) / (max - min)) + 240;
  if (hue < 40 || hue >= 330) return "very dark warm brown-black";
  if (hue < 170) return "very dark green-black";
  if (hue < 235) return "deep midnight navy";
  return "very dark indigo-violet black";
}

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

/* ------------------------------------------------------- backdrop alignment */

/** Gradient magnitude of a photograph at `size` pixels square: outlines survive a change of backdrop, flat colour does not. */
async function edges(buffer, size) {
  const { data } = await sharp(buffer).resize(size, size, { fit: "fill" }).greyscale().raw().toBuffer({ resolveWithObject: true });
  const out = new Float32Array(size * size);
  for (let y = 1; y < size - 1; y++) {
    for (let x = 1; x < size - 1; x++) {
      const i = y * size + x;
      const gx = data[i + 1] - data[i - 1];
      const gy = data[i + size] - data[i - size];
      out[i] = Math.hypot(gx, gy);
    }
  }
  return out;
}

/**
 * Where the product in `edited` sits relative to `original`: the scale about
 * the print rectangle's centre and the shift that best line up their outlines
 * around it, with how well they match (normalised cross-correlation, 1 is
 * identical). The image model is asked to keep the product where it is, and
 * mostly does, but a few percent of drift would put the print off the blank.
 */
async function alignment(original, edited, rect) {
  const N = 128;
  const [a, b] = await Promise.all([edges(original, N), edges(edited, N)]);
  const cx = (rect.x + rect.w / 2) * N;
  const cy = (rect.y + rect.h / 2) * N;
  const x0 = Math.max(1, Math.floor((rect.x - rect.w * 0.6) * N));
  const x1 = Math.min(N - 2, Math.ceil((rect.x + rect.w * 1.6) * N));
  const y0 = Math.max(1, Math.floor((rect.y - rect.h * 0.6) * N));
  const y1 = Math.min(N - 2, Math.ceil((rect.y + rect.h * 1.6) * N));
  const points = [];
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) points.push([x, y, a[y * N + x]]);
  const meanA = points.reduce((t, p) => t + p[2], 0) / points.length;
  const varA = points.reduce((t, p) => t + (p[2] - meanA) ** 2, 0);
  const score = (s, dx, dy) => {
    let sum = 0;
    let sumB = 0;
    let sumBB = 0;
    for (const [x, y, va] of points) {
      const bx = Math.round(cx + (x - cx) * s + dx);
      const by = Math.round(cy + (y - cy) * s + dy);
      const vb = bx >= 0 && bx < N && by >= 0 && by < N ? b[by * N + bx] : 0;
      sum += (va - meanA) * vb;
      sumB += vb;
      sumBB += vb * vb;
    }
    const varB = sumBB - (sumB * sumB) / points.length;
    return varA > 0 && varB > 0 ? sum / Math.sqrt(varA * varB) : 0;
  };
  let best = { s: 1, dx: 0, dy: 0, ncc: score(1, 0, 0) };
  for (let s = 0.82; s <= 1.18; s += 0.03) {
    for (let dx = -16; dx <= 16; dx += 2) {
      for (let dy = -16; dy <= 16; dy += 2) {
        const ncc = score(s, dx, dy);
        if (ncc > best.ncc) best = { s, dx, dy, ncc };
      }
    }
  }
  const coarse = best;
  for (let s = coarse.s - 0.03; s <= coarse.s + 0.03; s += 0.01) {
    for (let dx = coarse.dx - 2; dx <= coarse.dx + 2; dx++) {
      for (let dy = coarse.dy - 2; dy <= coarse.dy + 2; dy++) {
        const ncc = score(s, dx, dy);
        if (ncc > best.ncc) best = { s, dx, dy, ncc };
      }
    }
  }
  const w = rect.w * best.s;
  const h = rect.h * best.s;
  return {
    ncc: best.ncc,
    rect: { x: cx / N + best.dx / N - w / 2, y: cy / N + best.dy / N - h / 2, w, h },
  };
}

/** The poster sheet: the artwork large on the theme's main colour, inside a white paper margin, at the poster photograph's proportions. */
function posterHtml(t, art, aspect) {
  const family = encodeURIComponent(art.font).replace(/%20/g, "+");
  const bg = t.design.colors?.primary ?? art.accent;
  const ink = contrast(art.inkDark, bg) >= contrast(art.inkLight, bg) ? art.inkDark : art.inkLight;
  const accent = contrast(art.accent, bg) >= 2.2 ? art.accent : ink;
  const word = art.uppercase ? art.word.toUpperCase() : art.word;
  const sub = art.uppercase ? art.sub.toUpperCase() : art.sub;
  const mark = MARKS[art.mark](accent).replace(/<svg width="(\d+)" height="(\d+)"/, (_, w, h) => `<svg width="${w * 2.2}" height="${h * 2.2}"`);
  return `<!doctype html><html><head>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=${family}:wght@${art.weight}&display=block">
<style>
  html,body{margin:0;background:transparent}
  #art{width:600px;height:${Math.round(600 / aspect)}px;box-sizing:border-box;padding:26px;background:#fbfaf7}
  .sheet{height:100%;box-sizing:border-box;background:${bg};color:${ink};display:flex;flex-direction:column;align-items:center;justify-content:center;gap:26px;padding:40px 30px;font-family:'${art.font}',sans-serif;text-align:center}
  .word{font-size:120px;font-weight:${art.weight};letter-spacing:${art.tracking}px;line-height:1;white-space:nowrap}
  .sub{font-size:30px;font-weight:${art.weight};letter-spacing:${Math.max(4, art.tracking + 4)}px;color:${accent};white-space:nowrap}
  .rule{width:64px;height:4px;background:${accent}}
</style></head><body><div id="art"><div class="sheet">${mark}<div class="word">${word}</div><div class="rule"></div>${sub ? `<div class="sub">${sub}</div>` : ""}</div></div>
<script>
  document.fonts.ready.then(() => {
    for (const el of document.querySelectorAll(".word,.sub")) {
      let size = parseFloat(getComputedStyle(el).fontSize);
      while (el.scrollWidth > 500 && size > 12) el.style.fontSize = (size -= 2) + "px";
    }
  });
</script></body></html>`;
}

async function renderPoster(page, t, aspect) {
  await page.setContent(posterHtml(t, t.artwork, aspect), { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(100);
  return page.locator("#art").screenshot({ omitBackground: true });
}

/** The light-ink artwork as a die-cut sticker: a white border following a rounded outline, with a soft shadow. */
async function renderSticker(page, art) {
  const flat = await renderArtwork(page, art, false);
  await page.setContent(
    `<!doctype html><html><body style="margin:0;background:transparent"><div id="art" style="display:inline-block;padding:18px"><div style="background:#fff;border-radius:46px;padding:10px;box-shadow:0 5px 12px rgba(0,0,0,.35)"><img src="data:image/png;base64,${flat.toString("base64")}" style="display:block;width:${(await sharp(flat).metadata()).width / 2}px"></div></div></body></html>`,
    { waitUntil: "load" },
  );
  return page.locator("#art").screenshot({ omitBackground: true });
}

const photoCache = new Map();
async function photo(url) {
  if (!photoCache.has(url)) photoCache.set(url, await fetchBuffer(url));
  return photoCache.get(url);
}

async function compose(base, rect, artPng, place, fill = false) {
  const { width: W, height: H } = await sharp(base).metadata();
  const area = { x: rect.x * W, y: rect.y * H, w: rect.w * W, h: rect.h * H };
  const meta = await sharp(artPng).metadata();
  let w;
  let h;
  if (fill) {
    w = Math.round(area.w);
    h = Math.round(area.h);
  } else {
    const scale = Math.min((area.w * place.width) / meta.width, (area.h * place.height) / meta.height);
    w = Math.max(8, Math.round(meta.width * scale));
    h = Math.max(8, Math.round(meta.height * scale));
  }
  const art = await sharp(artPng).resize(w, h, { fit: "fill" }).png().toBuffer();
  const left = Math.round(area.x + area.w * place.x - w / 2);
  const top = Math.round(area.y + (place.top === null ? (area.h - h) / 2 : area.h * place.top));
  return sharp(base).composite([{ input: art, left, top, blend: "over" }]).webp({ quality: 84 }).toBuffer();
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
    sizes[w] = await uploadViaApp(webp, "image/webp");
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
const POSTER = PHOTOS.poster.White[0].rect;
const POSTER_ASPECT = POSTER.w / POSTER.h;
for (const t of templates) {
  const entry = (assets[t.id] ??= { hero: "", lifestyle: "", banner: "", products: [] });
  if (!redoProducts && entry.products?.length === t.products.length && entry.products.every(Boolean)) continue;
  const dark = isDarkTheme(t);
  const artCache = new Map();
  const art = async (kind) => {
    if (!artCache.has(kind)) {
      artCache.set(
        kind,
        kind === "poster"
          ? await renderPoster(page, t, POSTER_ASPECT)
          : kind === "sticker"
            ? await renderSticker(page, t.artwork)
            : await renderArtwork(page, t.artwork, kind === "dark"),
      );
    }
    return artCache.get(kind);
  };
  const used = new Map();
  const products = [];
  for (const product of t.products) {
    if (!(product.starter in STARTER_CATALOG)) throw new Error(`${t.id}: unknown starter ${product.starter}`);
    const family = blankFamily(product.starter);
    const photos = PHOTOS[family]?.[product.colour];
    if (!photos) throw new Error(`${t.id}: no ${product.colour} photo for ${product.starter}`);
    // The second product on the same blank shows the other photograph, so no two cards look alike.
    const key = `${family}:${product.colour}`;
    const view = Math.min(used.get(key) ?? 0, photos.length - 1);
    used.set(key, (used.get(key) ?? 0) + 1);
    const { url, rect } = photos[view];
    let base = await photo(url);
    let place = rect;
    if (dark) {
      const backdropKey = `${key}:${view}`;
      entry.backdrops ??= {};
      if (!entry.backdrops[backdropKey]) {
        // The edit is retried until the product has stayed where it was, keeping the closest attempt.
        let best = null;
        for (let attempt = 1; attempt <= 4 && !(best && best.ncc >= 0.35); attempt++) {
          const edited = await generateImage(
            `Edit this photograph. Keep the ${family === "sticker" ? "laptop" : "product"} exactly as it is: the same shape, size, position in the frame, colour, folds and lighting on it, and keep the same camera framing. Replace only the wall, floor, table or surface around it with a ${backdropWords(t.design.colors.background)} setting in the colour ${t.design.colors.background}, softly lit and moody, so the product stands out against it. Do not add text, logos or any print.`,
            base,
          );
          const fit = await alignment(base, await photo(edited), rect);
          console.log(`    ${t.id} ${backdropKey} attempt ${attempt}: match ${fit.ncc.toFixed(2)}`);
          if (!best || fit.ncc > best.ncc) best = { url: edited, ...fit };
        }
        entry.backdrops[backdropKey] = best.url;
        console.log(`ok  ${t.id} backdrop ${backdropKey}`);
        await save();
      }
      const edited = await photo(entry.backdrops[backdropKey]);
      place = (await alignment(base, edited, rect)).rect;
      base = edited;
    }
    const kind = family === "poster" ? "poster" : family === "sticker" ? "sticker" : isDarkBlank(product.colour) ? "dark" : "light";
    const webp = await compose(base, place, await art(kind), artworkPlacement(family, product.placement), family === "poster");
    products.push(await uploadViaApp(webp, "image/webp"));
  }
  entry.products = products;
  console.log(`ok  ${t.id} ${products.length} product shots`);
  await save();
}

// 3. Print files, at four times the CSS size so they print sharp on a full chest, a mug wrap or an A3 sheet.
const printPage = await browser.newPage({ deviceScaleFactor: 4 });
for (const t of templates) {
  const entry = assets[t.id];
  const inks = [
    ...new Set(
      t.products.map((p) => (blankFamily(p.starter) === "poster" ? "poster" : isDarkBlank(p.colour) ? "dark" : "light")),
    ),
  ];
  entry.artwork ??= {};
  const todo = inks.filter((ink) => redoArt || !entry.artwork[ink]);
  if (todo.length === 0) continue;
  for (const ink of todo) {
    const png = ink === "poster" ? await renderPoster(printPage, t, POSTER_ASPECT) : await renderArtwork(printPage, t.artwork, ink === "dark");
    const { width, height } = await sharp(png).metadata();
    entry.artwork[ink] = { url: await uploadViaApp(png, "image/png"), width, height, bytes: png.length };
  }
  console.log(`ok  ${t.id} print files ${todo.join(", ")}`);
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
