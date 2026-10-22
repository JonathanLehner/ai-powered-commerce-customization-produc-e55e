/**
 * Captures the landing page's product screenshots from a running dev server
 * and writes WebP variants to public/screens, registered in image-variants.json.
 *
 * Signs in as the Alex demo persona and swaps visible person names for clearly
 * example ones before each capture; nothing is written to the database.
 *
 *   node scripts/capture-screens.mjs http://localhost:3000 [sourcing|orders|artwork|gifting]
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import sharp from "sharp";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, "..", "public", "screens");
const VARIANTS = path.join(HERE, "image-variants.json");
const WIDTHS = [384, 640, 1024];
const [BASE = "http://localhost:3000", only] = process.argv.slice(2);
const W = 1040;
const H = 720;

const NAMES = { "Alex Moreau": "Example User", "Sam Okafor": "Example Teammate", "Dana Whitfield": "Example Approver" };

let replaced = NAMES;

async function scrub(page, extra = {}) {
  replaced = { ...NAMES, ...extra };
  await page.addStyleTag({ content: "nextjs-portal{display:none!important} header,.sticky,[class*=sticky]{position:static!important}" });
  await page.evaluate((map) => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    for (const n of nodes) if (n.nodeValue.trim() === "AM") n.nodeValue = "EU";
    for (const n of nodes) for (const [a, b] of Object.entries(map)) n.nodeValue = n.nodeValue.split(a).join(b);
    for (const el of document.querySelectorAll("input,textarea")) for (const [a, b] of Object.entries(map)) el.value = el.value.split(a).join(b);
  }, { ...NAMES, ...extra });
}

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? "/usr/bin/google-chrome" });
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
await page.goto(`${BASE}/login`);
await page.getByRole("button", { name: /Continue as Alex/ }).click();
await page.waitForURL(/\/app/, { timeout: 60000 });

const variants = JSON.parse(await readFile(VARIANTS, "utf8"));
const go = async (p) => {
  await page.goto(BASE + p, { waitUntil: "networkidle", timeout: 120000 });
  await page.waitForTimeout(2500);
};
const yOf = (sel) => page.locator(sel).first().evaluate((el) => el.getBoundingClientRect().top + window.scrollY);
async function shot(name, top) {
  await page.evaluate((y) => window.scrollTo(0, y), top);
  await page.waitForTimeout(600);
  // A late client render can restore the original text, so swap again and check.
  await scrub(page, replaced);
  const text = await page.evaluate(() => document.body.innerText);
  const left = Object.keys(replaced).filter((name) => text.includes(name));
  if (left.length) throw new Error(`${name}: still shows ${left.join(", ")}`);
  const png = await page.screenshot({ clip: { x: 0, y: 0, width: W, height: H } });
  const sizes = {};
  for (const width of WIDTHS) {
    await sharp(png).resize({ width }).webp({ quality: 80 }).toFile(path.join(OUT, `${name}-${width}.webp`));
    sizes[width] = `/screens/${name}-${width}.webp`;
  }
  variants[`/screens/${name}-1024.webp`] = sizes;
  console.log("captured", name);
}

if (!only || only === "sourcing") {
  await go("/app/stores/str_northwind/sourcing?q=tee&compare=cat_tee_organic,cat_tee_heavy,cat_jersey_sport");
  await scrub(page);
  await shot("sourcing", (await yOf("text=Supplier catalog")) - 24);
}
if (!only || only === "orders") {
  await go("/app/stores/str_northwind/orders?view=attention");
  const map = {};
  let i = 0;
  for (const row of await page.locator("tbody tr").all()) {
    const name = (await row.locator("td").nth(2).innerText().catch(() => "")).split("\n")[0].trim();
    if (name && !map[name]) map[name] = `Example Customer ${String.fromCharCode(65 + i++)}`;
  }
  await scrub(page, map);
  await shot("orders", (await yOf("table")) - 88);
}
if (!only || only === "artwork") {
  await go("/app/stores/str_northwind/catalog/prd_010d0pki8");
  await page.waitForTimeout(6000);
  await scrub(page);
  await shot("artwork", (await yOf("text=Artwork and print areas")) - 40);
}
if (!only || only === "gifting") {
  await go("/g/northwind-technologies-employee-gifting");
  await page.fill("input[name=email]", "dana@northwind.example");
  await page.getByRole("button", { name: /Open the catalogue/ }).click();
  await page.getByText("Gifts in this catalogue").waitFor({ timeout: 60000 });
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(3000);
  await scrub(page);
  await shot("gifting", 0);
}

await browser.close();
await writeFile(VARIANTS, `${JSON.stringify(variants, null, 2)}\n`);
