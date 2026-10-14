/**
 * Checks every store template, and renders every one.
 *
 * Without a server it checks the data: section and block types and settings,
 * that every image a template uses was generated, contrast of the design
 * tokens, and that the copy is translated into all nine languages.
 *
 * With --base it also renders each template's demo store from a running
 * server (`npm run build && npm start`): the home page in all nine languages,
 * the shop, a collection, a product page, and the home page with one product
 * and with twelve. It fails on a page that does not answer 200, an error
 * screen, a section that rendered nothing, and an image that does not load.
 * With --browser it opens them in Chrome at 1440px and 390px as well, and
 * fails on images that do not decode, a page wider than the phone, and text
 * below WCAG AA contrast on its background.
 *
 *   npm run template-check
 *   npm run template-check -- --base http://localhost:3000 [--browser] [--only id,id]
 */
import { LOCALES } from "../src/i18n/locales.ts";
import { PRODUCT_BLOCK_DEFS } from "../src/lib/product-template.ts";
import { contrastRatio, contrastReport, designVariables, readableOn, resolveDesign } from "../src/lib/store-design.ts";
import { LAYOUT_FIELDS } from "../src/lib/storefront-layout.ts";
import { SECTION_DEFS } from "../src/lib/storefront-schema.ts";
import { SITE_FIELDS } from "../src/lib/translations.ts";
import { TEMPLATE_CATEGORIES, TEMPLATE_STYLES, TEMPLATES, templateSourceCopy, templateTranslated } from "../src/lib/templates/index.ts";
import { demoCollections, demoProducts } from "../src/lib/templates/demo.ts";
import { draftDesign, templateImage, templateTree, treeTemplateId } from "../src/lib/templates/tree.ts";
import { sectionsFromTree } from "../src/lib/storefront-schema.ts";
import { productBlocks } from "../src/lib/product-template.ts";

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const value = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : null);
const base = value("--base")?.replace(/\/$/, "") ?? null;
const only = value("--only")?.split(",") ?? null;
const templates = TEMPLATES.filter((t) => !only || only.includes(t.id));

const failures = [];
const fail = (id, message) => failures.push(`${id}: ${message}`);

/* ------------------------------------------------------------------ data */

const ids = new Set();
for (const t of templates) {
  if (ids.has(t.id)) fail(t.id, "duplicate id");
  ids.add(t.id);
  if (!TEMPLATE_CATEGORIES.includes(t.category)) fail(t.id, `unknown category ${t.category}`);
  for (const s of t.styles) if (!TEMPLATE_STYLES.includes(s)) fail(t.id, `unknown style ${s}`);
  if (t.sections.length < 4) fail(t.id, "a home page needs at least four sections");

  for (const [i, section] of t.sections.entries()) {
    const def = SECTION_DEFS[section.type];
    if (!def) {
      fail(t.id, `section ${i}: unknown type ${section.type}`);
      continue;
    }
    const fields = new Map(def.fields.map((f) => [f.key, f]));
    for (const [key, raw] of Object.entries(section.props)) {
      const field = fields.get(key);
      if (!field) {
        fail(t.id, `section ${i} (${section.type}): no field "${key}"`);
        continue;
      }
      if (field.type === "select" && !field.options.some((o) => o.value === String(raw))) {
        fail(t.id, `section ${i} (${section.type}): "${raw}" is not an option of ${key}`);
      }
      if (field.type === "image" && raw && !templateImage(t, String(raw))) fail(t.id, `section ${i} (${section.type}): image ${raw} was not generated`);
      if (field.type === "video" && section.type === "VideoSection" && !raw) fail(t.id, `section ${i}: a video section without a video`);
    }
  }
  for (const [i, block] of t.productPage.entries()) {
    const def = PRODUCT_BLOCK_DEFS[block.type];
    if (!def) {
      fail(t.id, `product page block ${i}: unknown type ${block.type}`);
      continue;
    }
    for (const key of Object.keys(block.props ?? {})) {
      if (!def.fields.some((f) => f.key === key)) fail(t.id, `product page block ${i} (${block.type}): no field "${key}"`);
    }
  }
  if (!t.productPage.some((b) => b.type === "ProductMain")) fail(t.id, "the product page has no gallery and buy box");
  for (const key of Object.keys(t.layout)) if (!LAYOUT_FIELDS.some((f) => f.key === key)) fail(t.id, `no layout setting "${key}"`);
  for (const key of Object.keys(t.site)) if (!SITE_FIELDS.some((f) => f.key === key)) fail(t.id, `no site field "${key}"`);

  // Imagery.
  for (const kind of ["hero", "lifestyle", "banner"]) if (!t.assets[kind]) fail(t.id, `no ${kind} image`);
  (t.imagery.extra ?? []).forEach((_, i) => !t.assets.extra?.[i] && fail(t.id, `no extra image ${i + 1}`));
  if (t.assets.products.length !== t.products.length || t.assets.products.some((u) => !u)) fail(t.id, "product shots missing");
  if (t.products.length < 4) fail(t.id, "fewer than four starter products");

  // Contrast of the tokens as the designer picked them, before the storefront's automatic nudging.
  const design = resolveDesign({ theme: t.theme, design: t.design });
  const report = contrastReport(design);
  const vars = designVariables(design);
  const { background, surface, text, primary, secondary } = design.colors;
  const pairs = [
    ["text on background", text, background, 4.5],
    ["text on surface", text, surface, 4.5],
    ["button text on primary", readableOn(primary), primary, 4.5],
    ["text on secondary", readableOn(secondary), secondary, 4.5],
    ["muted text on background", vars["--muted-foreground"], background, 4.5],
    ["links on background", vars["--sf-primary-text"], background, 4.5],
    ["primary against background", primary, background, 3],
  ];
  for (const [label, fg, bg, min] of pairs) {
    const ratio = contrastRatio(fg, bg);
    if (ratio < min) fail(t.id, `contrast: ${label} is ${ratio.toFixed(2)}:1, needs ${min}:1`);
  }
  if (report.text.adjusted) fail(t.id, "contrast: the text colour had to be adjusted to be readable");

  // The tree a store gets: written in a German store's language, translated
  // into its other languages, named after the store, carrying its design.
  const tree = templateTree(t, { sourceLocale: "de", locales: ["de", "en", "ja"], brandName: "Testladen" });
  const built = sectionsFromTree(tree);
  if (built.length !== t.sections.length) fail(t.id, `tree has ${built.length} of ${t.sections.length} sections`);
  if (treeTemplateId(tree) !== t.id) fail(t.id, "tree does not name its template");
  const drafted = draftDesign(tree);
  if (!drafted || drafted.theme !== t.theme) fail(t.id, "tree does not carry the template's design");
  if (productBlocks(tree).length !== t.productPage.length) fail(t.id, "tree lost product page blocks");
  if (JSON.stringify(tree).includes(t.brand.name)) fail(t.id, "the fictional brand name survived in a store's copy");
  const first = built.find((s) => Object.values(s.props).some((v) => typeof v === "string" && v.length > 12));
  if (first && !first.props.i18n?.en) fail(t.id, "a German store's tree has no English translation");

  // Copy in every language.
  for (const locale of LOCALES) if (!templateTranslated(t, locale)) fail(t.id, `copy not translated into ${locale}`);
  const copy = templateSourceCopy(t);
  for (const [key, text] of Object.entries(copy)) {
    if (/—/.test(text)) fail(t.id, `copy ${key} uses an em dash`);
  }
}
console.log(`data: ${templates.length} templates checked`);

/* --------------------------------------------------------------- library */

// The whole library, whatever --only says: five templates in every category,
// each led by a different style, and no two templates that look alike.
for (const category of TEMPLATE_CATEGORIES) {
  const inCategory = TEMPLATES.filter((t) => t.category === category);
  if (inCategory.length !== 5) fail(category, `has ${inCategory.length} templates, needs 5`);
  const leads = inCategory.map((t) => t.styles[0]);
  for (const style of new Set(leads)) {
    if (leads.filter((s) => s === style).length > 1) fail(category, `more than one template leads with the ${style} style`);
  }
}

const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const distance = (a, b) => Math.hypot(...rgb(a).map((v, i) => v - rgb(b)[i]));
/** Longest common subsequence of two section lists, as a share of the longer one. */
const sequenceLikeness = (a, b) => {
  const dp = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
  }
  return dp[a.length][b.length] / Math.max(a.length, b.length);
};
/**
 * How alike two templates look, from what a shopper sees first: palette,
 * type, shape, header and footer, and the order of the home page. Each trait
 * adds to the score; 7 or more reads as the same template in another colour.
 */
function likeness(a, b) {
  const da = resolveDesign({ theme: a.theme, design: a.design });
  const db = resolveDesign({ theme: b.theme, design: b.design });
  const traits = [];
  const add = (points, label) => traits.push([points, label]);
  if (da.mode === db.mode && distance(da.colors.background, db.colors.background) < 30) add(1.5, "background");
  if (distance(da.colors.primary, db.colors.primary) < 70) add(1.5, "primary colour");
  if (distance(da.colors.secondary, db.colors.secondary) < 70) add(0.5, "secondary colour");
  if (da.headingFont === db.headingFont) add(2, "heading font");
  if (da.bodyFont === db.bodyFont) add(1, "body font");
  for (const key of ["radius", "buttonStyle", "density", "productImage"]) if (da[key] === db[key]) add(0.25, key);
  for (const key of ["headerLayout", "footerLayout"]) if ((a.layout[key] ?? "") === (b.layout[key] ?? "")) add(0.25, key);
  if (a.sections[0].type === b.sections[0].type) add(0.5, "hero");
  const order = sequenceLikeness(
    a.sections.map((s) => s.type),
    b.sections.map((s) => s.type),
  );
  if (order >= 0.6) add(2 * order, "section order");
  if (a.artwork.mark === b.artwork.mark && a.artwork.font === b.artwork.font) add(1, "artwork");
  return { score: traits.reduce((sum, [p]) => sum + p, 0), traits: traits.map(([, label]) => label) };
}
const pairs = [];
for (const [i, a] of TEMPLATES.entries()) {
  for (const b of TEMPLATES.slice(i + 1)) pairs.push({ a, b, ...likeness(a, b) });
}
pairs.sort((x, y) => y.score - x.score);
for (const { a, b, score, traits } of pairs) {
  if (score >= 7) fail(`${a.id}/${b.id}`, `look alike (${score.toFixed(1)}): same ${traits.join(", ")}`);
}
if (flag("--likeness")) {
  for (const { a, b, score, traits } of pairs.slice(0, 15)) console.log(`  ${score.toFixed(2)}  ${a.id} / ${b.id}: ${traits.join(", ")}`);
}
console.log(`library: ${TEMPLATES.length} templates in ${TEMPLATE_CATEGORIES.length} categories, ${pairs.length} pairs compared`);

/* ---------------------------------------------------------------- render */

const imageStatus = new Map();
async function imageLoads(url) {
  if (!imageStatus.has(url)) {
    imageStatus.set(
      url,
      fetch(url, { method: "HEAD" })
        .then((r) => r.ok)
        .catch(() => false),
    );
  }
  return imageStatus.get(url);
}

function pagesFor(t) {
  const products = demoProducts(t, "en");
  const collection = demoCollections(t, products)[0];
  return [
    ...LOCALES.map((locale) => ({ path: `/demo/${t.id}/${locale}`, sections: t.sections.length, locale })),
    { path: `/demo/${t.id}/en/products` },
    ...(collection ? [{ path: `/demo/${t.id}/en/collections/${collection.handle}` }] : []),
    { path: `/demo/${t.id}/en/products/${products[0].card.slug}` },
    { path: `/demo/${t.id}/en/count/1`, sections: t.sections.length },
    { path: `/demo/${t.id}/en/count/12`, sections: t.sections.length },
  ];
}

async function renderCheck(t, page) {
  const res = await fetch(`${base}${page.path}`);
  if (res.status !== 200) return fail(t.id, `${page.path} answered ${res.status}`);
  const html = await res.text();
  // Next marks the document of an error screen; a section that threw shows it.
  if (html.includes('id="__next_error__"')) fail(t.id, `${page.path} shows an error screen`);
  if (page.sections) {
    const markers = html.match(/<div data-template-section="(\w+)" class="contents">/g) ?? [];
    if (markers.length !== page.sections) fail(t.id, `${page.path} rendered ${markers.length} of ${page.sections} sections`);
    // A section that rendered nothing leaves its marker empty.
    const empty = html.match(/<div data-template-section="(\w+)" class="contents"><\/div>/g) ?? [];
    for (const marker of empty) fail(t.id, `${page.path}: ${marker.match(/"(\w+)"/)[1]} rendered nothing`);
  }
  const sources = [...html.matchAll(/<img[^>]*?\ssrc="([^"]*)"/g)].map((m) => m[1].replace(/&amp;/g, "&"));
  if (sources.length === 0) fail(t.id, `${page.path} has no images`);
  for (const src of sources) {
    if (!src) fail(t.id, `${page.path} has an image without a source`);
    else if (/^https?:/.test(src) && !(await imageLoads(src))) fail(t.id, `${page.path}: image ${src} does not load`);
  }
}

/** Runs in the page: images that did not decode, overflow, and text contrast against its painted background. */
function inspectPage() {
  const parse = (c) => {
    const m = c.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const [r, g, b, a = 1] = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
    return { r, g, b, a };
  };
  const lum = ({ r, g, b }) => {
    const f = (v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const ratio = (a, b) => {
    const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
    return (x + 0.05) / (y + 0.05);
  };
  const blend = (top, under) => ({
    r: top.r * top.a + under.r * (1 - top.a),
    g: top.g * top.a + under.g * (1 - top.a),
    b: top.b * top.a + under.b * (1 - top.a),
    a: 1,
  });
  /** The colour behind an element, or null when it sits on a photo or a gradient. */
  const overlaps = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
  const backdrop = (el) => {
    const box = el.getBoundingClientRect();
    const layers = [];
    for (let node = el; node; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (style.backgroundImage !== "none") return null;
      // Text laid over a photo or video is read against the section's overlay, not a flat colour.
      const media = [...node.querySelectorAll("img, video")].some((m) => !el.contains(m) && overlaps(m.getBoundingClientRect(), box));
      if (media && !layers.some((l) => l.a >= 1)) return null;
      const bg = parse(style.backgroundColor);
      if (bg && bg.a > 0) {
        layers.push(bg);
        if (bg.a >= 1) break;
      }
    }
    let colour = { r: 255, g: 255, b: 255, a: 1 };
    for (const layer of layers.reverse()) colour = blend(layer, colour);
    return colour;
  };
  const problems = [];
  for (const img of document.querySelectorAll("img")) {
    if (img.complete && img.naturalWidth === 0 && img.getAttribute("src")) problems.push(`image did not load: ${img.getAttribute("src").slice(0, 90)}`);
  }
  if (document.documentElement.scrollWidth > window.innerWidth + 1) {
    problems.push(`page is ${document.documentElement.scrollWidth}px wide in a ${window.innerWidth}px window`);
  }
  const seen = new Set();
  for (const el of document.querySelectorAll("main *, header *, footer *")) {
    const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    if (!own) continue;
    const rect = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    if (rect.width === 0 || rect.height === 0 || style.visibility === "hidden" || Number(style.opacity) < 0.1) continue;
    if (el.closest("[aria-hidden='true'], [inert], .sr-only, button[disabled]")) continue;
    const fg = parse(style.color);
    const bg = backdrop(el);
    if (!fg || !bg) continue;
    const size = parseFloat(style.fontSize);
    const bold = Number(style.fontWeight) >= 700;
    const min = size >= 24 || (bold && size >= 18.66) ? 3 : 4.5;
    const r = ratio(blend(fg, bg), bg);
    if (r < min) {
      const text = el.textContent.trim().slice(0, 40);
      if (!seen.has(text)) problems.push(`contrast ${r.toFixed(2)}:1 (needs ${min}:1) on "${text}"`);
      seen.add(text);
    }
  }
  return problems;
}

async function browserCheck(list) {
  const { chromium } = await import("playwright-core");
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || "/usr/bin/google-chrome" });
  const queue = [...list];
  await Promise.all(
    Array.from({ length: 4 }, async () => {
      const context = await browser.newContext();
      const page = await context.newPage();
      while (queue.length) {
        const { t, path, width } = queue.shift();
        await page.setViewportSize({ width, height: 900 });
        await page.goto(`${base}${path}`, { waitUntil: "load", timeout: 90_000 });
        // Lazy images load as the page is scrolled through.
        await page.evaluate(async () => {
          for (let y = 0; y < document.body.scrollHeight; y += 700) {
            window.scrollTo(0, y);
            await new Promise((r) => setTimeout(r, 60));
          }
          window.scrollTo(0, 0);
        });
        await page.waitForLoadState("networkidle").catch(() => {});
        for (const problem of await page.evaluate(inspectPage)) fail(t.id, `${path} at ${width}px: ${problem}`);
      }
      await context.close();
    }),
  );
  await browser.close();
}

if (base) {
  for (const t of templates) {
    for (const page of pagesFor(t)) await renderCheck(t, page);
  }
  console.log(`render: ${templates.length} templates, ${imageStatus.size} images`);
  if (flag("--browser")) {
    const list = templates.flatMap((t) => {
      const product = demoProducts(t, "en")[0].card.slug;
      return [
        { t, path: `/demo/${t.id}/en`, width: 1440 },
        { t, path: `/demo/${t.id}/en/products/${product}`, width: 1440 },
        ...LOCALES.map((locale) => ({ t, path: `/demo/${t.id}/${locale}`, width: 390 })),
        { t, path: `/demo/${t.id}/en/count/1`, width: 1440 },
        { t, path: `/demo/${t.id}/en/count/12`, width: 390 },
      ];
    });
    await browserCheck(list);
    console.log(`browser: ${list.length} page views`);
  }
}

if (failures.length > 0) {
  console.error(`\n${failures.length} problems:\n${failures.map((f) => `  ${f}`).join("\n")}`);
  process.exit(1);
}
console.log("template-check passed");
