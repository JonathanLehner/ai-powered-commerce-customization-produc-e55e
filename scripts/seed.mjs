/**
 * Seeds the ClawCorp project database with the Parcelith demo tenancy:
 * agencies, users, suppliers, the shared supplier catalog, four client stores,
 * their imported/customised products (with real composited mockups), published
 * storefront layouts, orders across every fulfilment state, and audit history.
 *
 * Run: node --env-file=.env.local scripts/seed.mjs
 */
import { randomInt } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { seedGifting } from "./seed-gifting.mjs";

const KEY = process.env.CLAWCORP_API_KEY;
if (!KEY) {
  console.error("CLAWCORP_API_KEY missing");
  process.exit(1);
}
const BASE = "https://www.clawcorp.ai/api/platform";

/* ------------------------------------------------------------------ helpers */

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

const insertMany = (collection, documents) =>
  documents.length ? dbCall({ collection, action: "insertMany", documents }) : Promise.resolve();
const clear = (collection) => dbCall({ collection, action: "deleteMany", filter: {} });

async function upload(bytes, mimeType) {
  for (let attempt = 1; attempt <= 4; attempt++) {
    const res = await fetch(`${BASE}/upload`, {
      method: "POST",
      headers: { Authorization: `Bearer ${KEY}`, "content-type": mimeType },
      body: bytes,
    });
    if (res.ok) return (await res.json()).url;
    if (attempt === 4) throw new Error(`upload: ${res.status} ${await res.text()}`);
    await new Promise((r) => setTimeout(r, 800 * attempt));
  }
}

let seedCounter = 0;
function id(prefix) {
  seedCounter += 1;
  return `${prefix}_${seedCounter.toString(36).padStart(3, "0")}${Math.random().toString(36).slice(2, 8)}`;
}

const DAY = 86400000;
const NOW = Date.now();
const iso = (daysAgo, hours = 10) =>
  new Date(NOW - daysAgo * DAY + hours * 3600000 - 10 * 3600000).toISOString();

/* --------------------------------------------------- artwork + mockup tools */

async function fetchBuffer(url) {
  const res = await fetch(url, { headers: { "user-agent": "parcelith-seed" } });
  if (!res.ok) throw new Error(`fetch ${url}: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

const imageCache = new Map();
async function cachedBuffer(url) {
  if (!imageCache.has(url)) imageCache.set(url, await fetchBuffer(url));
  return imageCache.get(url);
}

/** Renders a client wordmark logo to a transparent PNG and uploads it. */
async function makeLogoArtwork({ mark, word, tagline, colour, accent }) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1800" height="900" viewBox="0 0 1800 900">
    <g transform="translate(900 330)">
      <circle cx="0" cy="0" r="150" fill="none" stroke="${colour}" stroke-width="26"/>
      <text x="0" y="52" text-anchor="middle" font-family="DejaVu Sans, sans-serif" font-size="150" font-weight="700" fill="${accent}">${mark}</text>
    </g>
    <text x="900" y="640" text-anchor="middle" font-family="DejaVu Sans, sans-serif" font-size="130" font-weight="700" letter-spacing="14" fill="${colour}">${word}</text>
    <text x="900" y="740" text-anchor="middle" font-family="DejaVu Sans, sans-serif" font-size="52" font-weight="400" letter-spacing="10" fill="${accent}">${tagline}</text>
  </svg>`;
  const buf = await sharp(Buffer.from(svg)).png().toBuffer();
  const meta = await sharp(buf).metadata();
  const url = await upload(buf, "image/png");
  return { url, pixelWidth: meta.width, pixelHeight: meta.height, sizeBytes: buf.length, hasAlpha: true };
}

/** Same compositing rules as src/lib/mockup.ts, kept minimal for the seed. */
async function composeMockup(baseUrl, area, layer) {
  const baseBuf = await cachedBuffer(baseUrl);
  const meta = await sharp(baseBuf).metadata();
  const W = meta.width;
  const H = meta.height;
  const areaX = area.rect.x * W;
  const areaY = area.rect.y * H;
  const areaW = area.rect.w * W;
  const areaH = area.rect.h * H;

  const artBuf = await cachedBuffer(layer.artworkUrl);
  const aspect = layer.pixelHeight / layer.pixelWidth;
  const targetW = Math.max(8, Math.round(layer.scale * areaW));
  const targetH = Math.max(8, Math.round(targetW * aspect));
  let pipeline = sharp(artBuf).resize(targetW, targetH, { fit: "fill" }).png();
  if (layer.rotation) pipeline = pipeline.rotate(layer.rotation, { background: { r: 0, g: 0, b: 0, alpha: 0 } });
  const out = await pipeline.toBuffer({ resolveWithObject: true });

  const left = Math.round(areaX + layer.x * areaW - out.info.width / 2);
  const top = Math.round(areaY + layer.y * areaH - out.info.height / 2);
  const buf = await sharp(baseBuf)
    .composite([{ input: out.data, left: Math.max(0, left), top: Math.max(0, top) }])
    .webp({ quality: 82 })
    .toBuffer();
  return upload(buf, "image/webp");
}

/* ------------------------------------------------------------ static content */

const IMAGES = JSON.parse(await readFile(path.join(process.cwd(), "scripts", "image-manifest.json"), "utf8"));

const APPAREL_FILE_REQS = {
  formats: ["PNG", "SVG", "PDF"],
  maxFileMb: 25,
  minDpi: 150,
  transparentBackgroundRequired: true,
  maxPixels: 40_000_000,
};
const MUG_FILE_REQS = {
  formats: ["PNG", "JPG", "PDF"],
  maxFileMb: 15,
  minDpi: 300,
  transparentBackgroundRequired: false,
  maxPixels: 25_000_000,
};

const TEE_AREAS = [
  { id: "pa_tee_front", name: "Front chest", view: "front", widthMm: 280, heightMm: 360, minDpi: 150, rect: { x: 0.33, y: 0.29, w: 0.34, h: 0.34 } },
  { id: "pa_tee_back", name: "Back", view: "back", widthMm: 280, heightMm: 400, minDpi: 150, rect: { x: 0.33, y: 0.27, w: 0.34, h: 0.38 } },
];
const HOODIE_AREAS = [
  { id: "pa_hood_front", name: "Front chest", view: "front", widthMm: 300, heightMm: 240, minDpi: 150, rect: { x: 0.34, y: 0.36, w: 0.32, h: 0.24 } },
  { id: "pa_hood_back", name: "Back", view: "back", widthMm: 300, heightMm: 360, minDpi: 150, rect: { x: 0.33, y: 0.3, w: 0.34, h: 0.34 } },
];
const MUG_AREAS = [
  { id: "pa_mug_left", name: "Left wrap", view: "left", widthMm: 200, heightMm: 85, minDpi: 300, rect: { x: 0.3, y: 0.36, w: 0.33, h: 0.3 } },
  { id: "pa_mug_right", name: "Right wrap", view: "right", widthMm: 200, heightMm: 85, minDpi: 300, rect: { x: 0.37, y: 0.36, w: 0.33, h: 0.3 } },
];

const SIZES = ["S", "M", "L", "XL", "2XL"];

function apparelVariants(prefix, colours, baseCost, plusSizeSurcharge = 200) {
  const out = [];
  for (const colour of colours) {
    for (const size of SIZES) {
      out.push({
        id: `${prefix}-${colour.code}-${size}`.toLowerCase(),
        name: `${colour.name} / ${size}`,
        colour: colour.name,
        colourHex: colour.hex,
        size,
        sku: `${prefix.toUpperCase()}-${colour.code}-${size}`,
        baseCost: baseCost + (size === "2XL" ? plusSizeSurcharge : 0),
        availability: size === "2XL" && colour.code === "BLK" ? "low_stock" : "in_stock",
      });
    }
  }
  return out;
}

/* ------------------------------------------------------------------- suppliers */

const suppliers = [
  {
    id: "sup_printful",
    name: "Printful",
    kind: "print_on_demand",
    website: "https://www.printful.com",
    summary:
      "Global print-on-demand partner with in-house fulfilment centres in the US, Canada, Mexico, Spain, Latvia, the UK and Japan. Direct-to-garment and embroidery, with a documented order and tracking API.",
    status: "approved",
    regions: ["North America", "European Union", "United Kingdom", "LATAM", "APAC", "Oceania"],
    integration: "api",
    capabilities: { catalog: true, quotes: true, inventory: true, mockups: true, orderSubmission: true, tracking: true, cancellation: true },
    leadTimeDays: [2, 5],
    notes: "Preferred partner for apparel in North America and the EU. Cancellations accepted until the job enters production.",
    createdAt: iso(210),
  },
  {
    id: "sup_gelato",
    name: "Gelato",
    kind: "print_on_demand",
    website: "https://www.gelato.com",
    summary:
      "Distributed production network spanning 32 countries, which keeps parcels inside the destination market. Strong drinkware and EU apparel coverage.",
    status: "approved",
    regions: ["North America", "European Union", "United Kingdom", "LATAM", "APAC", "Middle East", "Africa", "Oceania"],
    integration: "api",
    capabilities: { catalog: true, quotes: true, inventory: true, mockups: true, orderSubmission: true, tracking: true, cancellation: true },
    leadTimeDays: [2, 6],
    notes: "Best choice when a store sells worldwide — local production avoids cross-border duties.",
    createdAt: iso(205),
  },
  {
    id: "sup_printify",
    name: "Printify",
    kind: "print_on_demand",
    website: "https://printify.com",
    summary:
      "Marketplace of vetted print providers. Widest catalogue and lowest unit costs, but production quality varies by the print provider chosen for each job.",
    status: "approved",
    regions: ["North America", "European Union", "United Kingdom", "APAC", "Oceania"],
    integration: "api",
    capabilities: { catalog: true, quotes: true, inventory: true, mockups: true, orderSubmission: true, tracking: true, cancellation: false },
    leadTimeDays: [3, 8],
    notes: "No cancellation API — cancellations must be raised with the assigned print provider by email.",
    createdAt: iso(190),
  },
  {
    id: "sup_alibaba",
    name: "Alibaba.com",
    kind: "sourcing_marketplace",
    website: "https://www.alibaba.com",
    summary:
      "Sourcing and RFQ marketplace for bulk manufacturing. Used for discovery, supplier comparison and quote requests only — transaction APIs differ per supplier, so orders are raised manually under Trade Assurance.",
    status: "approved",
    regions: ["North America", "European Union", "United Kingdom", "LATAM", "APAC", "Middle East", "Africa", "Oceania"],
    integration: "manual",
    capabilities: { catalog: true, quotes: true, inventory: false, mockups: false, orderSubmission: false, tracking: false, cancellation: false },
    leadTimeDays: [15, 45],
    notes:
      "Discovery and quotes only in this release. Every Alibaba-sourced order is flagged for manual handling so a buyer confirms specification, MOQ and Trade Assurance terms before production.",
    createdAt: iso(160),
  },
  {
    id: "sup_gooten",
    name: "Gooten",
    kind: "print_on_demand",
    website: "https://www.gooten.com",
    summary:
      "Manufacturing network aimed at higher-volume merch programmes. Under commercial review before it is released to stores.",
    status: "pending_review",
    regions: ["North America", "European Union"],
    integration: "api",
    capabilities: { catalog: true, quotes: true, inventory: true, mockups: false, orderSubmission: true, tracking: true, cancellation: true },
    leadTimeDays: [4, 9],
    notes: "Pending platform approval — sample quality assessment in progress. Not selectable by stores until approved.",
    createdAt: iso(35),
  },
];

/* ---------------------------------------------------------------- tax brackets */

const taxBrackets = [
  { id: "tax_std20", name: "Standard rate (UK/EU)", code: "STD-20", rate: 20, description: "Default VAT rate for apparel and homeware sold into the UK and most EU member states.", regions: ["United Kingdom", "European Union"], createdAt: iso(200) },
  { id: "tax_red07", name: "Reduced rate", code: "RED-07", rate: 7, description: "Reduced VAT band used by member states that treat printed goods as reduced-rate supplies.", regions: ["European Union"], createdAt: iso(200) },
  { id: "tax_de19", name: "German VAT", code: "DE-VAT-19", rate: 19, description: "Standard German VAT rate for merchandise delivered inside Germany.", regions: ["European Union"], createdAt: iso(200) },
  { id: "tax_us825", name: "US destination sales tax", code: "US-8.25", rate: 8.25, description: "Blended destination sales tax applied to US shoppers where the seller has nexus.", regions: ["North America"], createdAt: iso(200) },
  { id: "tax_ca05", name: "Canada GST", code: "CA-GST-5", rate: 5, description: "Federal goods and services tax for Canadian destinations. Provincial tax is handled separately.", regions: ["North America"], createdAt: iso(200) },
  { id: "tax_au10", name: "Australia GST", code: "AU-GST-10", rate: 10, description: "Goods and services tax on merchandise delivered inside Australia.", regions: ["Oceania"], createdAt: iso(198) },
  { id: "tax_zero", name: "Zero rated", code: "ZERO-0", rate: 0, description: "Zero-rated supplies, including exports and children's apparel in the UK.", regions: ["United Kingdom", "European Union", "North America"], createdAt: iso(198) },
];

/* -------------------------------------------------------------- shared catalog */

const WHITE = { name: "White", code: "WHT", hex: "#ffffff" };
const BLACK = { name: "Black", code: "BLK", hex: "#111111" };
const NAVY = { name: "Navy", code: "NVY", hex: "#1e2a4a" };
const HEATHER = { name: "Heather grey", code: "HGR", hex: "#b8bcc2" };

const catalog = [
  {
    id: "cat_tee_heavy",
    supplierId: "sup_printful",
    name: "Unisex Heavy Cotton Tee",
    category: "apparel",
    productType: "T-shirt, 180 gsm",
    description:
      "A 100% ring-spun cotton crew neck with taped shoulders and a tubular body, printed direct-to-garment. The workhorse of most merch programmes: it holds colour after repeated washing and sizes true from S to 2XL.",
    currency: "USD",
    baseCost: 1090,
    customizationCostPerArea: 320,
    shippingEstimate: 495,
    variants: apparelVariants("tee", [WHITE, BLACK], 1090),
    printAreas: TEE_AREAS,
    mockups: [
      { view: "front", colour: "White", url: IMAGES["tshirt-white-front"] },
      { view: "back", colour: "White", url: IMAGES["tshirt-white-back"] },
      { view: "front", colour: "Black", url: IMAGES["tshirt-black-front"] },
      { view: "back", colour: "Black", url: IMAGES["tshirt-black-back"] },
    ],
    fileRequirements: APPAREL_FILE_REQS,
    fulfillmentRegions: ["North America", "European Union", "United Kingdom", "LATAM", "APAC", "Oceania"],
    leadTimeDays: [2, 5],
    availability: "available",
    status: "active",
    createdAt: iso(180),
  },
  {
    id: "cat_tee_organic",
    supplierId: "sup_gelato",
    name: "Organic Cotton Tee",
    category: "apparel",
    productType: "T-shirt, GOTS certified 180 gsm",
    description:
      "GOTS-certified organic cotton produced inside the destination market, which keeps delivery under a week almost everywhere and avoids cross-border duty. A softer hand feel than the heavy cotton tee, at a higher unit cost.",
    currency: "USD",
    baseCost: 1340,
    customizationCostPerArea: 290,
    shippingEstimate: 450,
    variants: apparelVariants("orgtee", [WHITE, BLACK], 1340),
    printAreas: TEE_AREAS,
    mockups: [
      { view: "front", colour: "White", url: IMAGES["tshirt-white-front"] },
      { view: "back", colour: "White", url: IMAGES["tshirt-white-back"] },
      { view: "front", colour: "Black", url: IMAGES["tshirt-black-front"] },
      { view: "back", colour: "Black", url: IMAGES["tshirt-black-back"] },
    ],
    fileRequirements: APPAREL_FILE_REQS,
    fulfillmentRegions: ["North America", "European Union", "United Kingdom", "LATAM", "APAC", "Middle East", "Africa", "Oceania"],
    leadTimeDays: [2, 6],
    availability: "available",
    status: "active",
    createdAt: iso(175),
  },
  {
    id: "cat_hoodie_premium",
    supplierId: "sup_printful",
    name: "Premium Pullover Hoodie",
    category: "apparel",
    productType: "Hoodie, 320 gsm brushed fleece",
    description:
      "Heavyweight brushed-back fleece with a double-layer hood, kangaroo pocket and ribbed cuffs. The default choice for onboarding kits and winter campaigns; print sits above the pocket seam.",
    currency: "USD",
    baseCost: 2450,
    customizationCostPerArea: 380,
    shippingEstimate: 690,
    variants: apparelVariants("hood", [NAVY, HEATHER], 2450, 300),
    printAreas: HOODIE_AREAS,
    mockups: [
      { view: "front", colour: "Navy", url: IMAGES["hoodie-navy-front"] },
      { view: "back", colour: "Navy", url: IMAGES["hoodie-navy-back"] },
      { view: "front", colour: "Heather grey", url: IMAGES["hoodie-heather-front"] },
      { view: "back", colour: "Heather grey", url: IMAGES["hoodie-heather-back"] },
    ],
    fileRequirements: APPAREL_FILE_REQS,
    fulfillmentRegions: ["North America", "European Union", "United Kingdom", "LATAM", "APAC", "Oceania"],
    leadTimeDays: [3, 6],
    availability: "available",
    status: "active",
    createdAt: iso(172),
  },
  {
    id: "cat_hoodie_eco",
    supplierId: "sup_printify",
    name: "Eco Pullover Hoodie",
    category: "apparel",
    productType: "Hoodie, 280 gsm recycled blend",
    description:
      "Recycled cotton and polyester blend at a lower unit cost than the premium hoodie. Print providers vary by region, so run a sample before a large campaign.",
    currency: "USD",
    baseCost: 1980,
    customizationCostPerArea: 300,
    shippingEstimate: 640,
    variants: apparelVariants("ecohood", [NAVY, HEATHER], 1980, 250),
    printAreas: HOODIE_AREAS,
    mockups: [
      { view: "front", colour: "Navy", url: IMAGES["hoodie-navy-front"] },
      { view: "back", colour: "Navy", url: IMAGES["hoodie-navy-back"] },
      { view: "front", colour: "Heather grey", url: IMAGES["hoodie-heather-front"] },
      { view: "back", colour: "Heather grey", url: IMAGES["hoodie-heather-back"] },
    ],
    fileRequirements: APPAREL_FILE_REQS,
    fulfillmentRegions: ["North America", "European Union", "United Kingdom", "APAC", "Oceania"],
    leadTimeDays: [3, 8],
    availability: "limited",
    status: "active",
    createdAt: iso(150),
  },
  {
    id: "cat_mug_classic",
    supplierId: "sup_gelato",
    name: "Classic 11oz Ceramic Mug",
    category: "drinkware",
    productType: "Mug, 11oz white ceramic",
    description:
      "Dishwasher and microwave safe white ceramic with a full wrap print on both sides of the handle. Sublimation printing means the artwork sits in the glaze rather than on top of it.",
    currency: "USD",
    baseCost: 620,
    customizationCostPerArea: 210,
    shippingEstimate: 580,
    variants: [
      { id: "mug11-wht", name: "White / 11oz", colour: "White", colourHex: "#ffffff", size: "11oz", sku: "MUG11-WHT", baseCost: 620, availability: "in_stock" },
    ],
    printAreas: MUG_AREAS,
    mockups: [
      { view: "left", colour: "White", url: IMAGES["mug-white-left"] },
      { view: "right", colour: "White", url: IMAGES["mug-white-right"] },
    ],
    fileRequirements: MUG_FILE_REQS,
    fulfillmentRegions: ["North America", "European Union", "United Kingdom", "APAC", "Middle East", "Oceania"],
    leadTimeDays: [2, 5],
    availability: "available",
    status: "active",
    createdAt: iso(168),
  },
  {
    id: "cat_mug_matte",
    supplierId: "sup_printify",
    name: "Matte Black 15oz Mug",
    category: "drinkware",
    productType: "Mug, 15oz matte black ceramic",
    description:
      "A larger matte-finish mug for premium gifting sets. Light artwork reads best; fine dark detail disappears against the body colour, so pre-flight rejects designs below 300 DPI.",
    currency: "USD",
    baseCost: 890,
    customizationCostPerArea: 260,
    shippingEstimate: 640,
    variants: [
      { id: "mug15-blk", name: "Matte black / 15oz", colour: "Black", colourHex: "#111111", size: "15oz", sku: "MUG15-BLK", baseCost: 890, availability: "in_stock" },
    ],
    printAreas: MUG_AREAS,
    mockups: [
      { view: "left", colour: "Black", url: IMAGES["mug-black-left"] },
      { view: "right", colour: "Black", url: IMAGES["mug-black-right"] },
    ],
    fileRequirements: MUG_FILE_REQS,
    fulfillmentRegions: ["North America", "European Union", "United Kingdom", "APAC"],
    leadTimeDays: [3, 8],
    availability: "available",
    status: "active",
    createdAt: iso(120),
  },
];

/* ------------------------------------------------------------------- tenancy */

const agencies = [
  { id: "agc_northlight", name: "Northlight Studio", slug: "northlight", plan: "studio", contactEmail: "hello@northlight.studio", status: "active", createdAt: iso(220) },
  { id: "agc_cobalt", name: "Cobalt & Co", slug: "cobalt", plan: "starter", contactEmail: "studio@cobaltco.agency", status: "active", createdAt: iso(90) },
];

const users = [
  { id: "usr_priya", email: "ops@parcelith.com", name: "Priya Raman", password: "parcelith", platformRole: "platform_admin", agencyId: null, title: "Platform operations", createdAt: iso(230) },
  { id: "usr_alex", email: "alex@northlight.studio", name: "Alex Moreau", password: "parcelith", platformRole: "agency_admin", agencyId: "agc_northlight", title: "Agency director", createdAt: iso(220) },
  { id: "usr_sam", email: "sam@northlight.studio", name: "Sam Okafor", password: "parcelith", platformRole: "agency_member", agencyId: "agc_northlight", title: "Catalog producer", createdAt: iso(150) },
  { id: "usr_ines", email: "ines@northlight.studio", name: "Inés Duarte", password: "parcelith", platformRole: "agency_member", agencyId: "agc_northlight", title: "Fulfilment lead", createdAt: iso(140) },
  { id: "usr_dana", email: "dana@northwind.example", name: "Dana Whitfield", password: "parcelith", platformRole: "agency_member", agencyId: "agc_northlight", title: "Client stakeholder, Northwind", createdAt: iso(120) },
  { id: "usr_mira", email: "mira@cobaltco.agency", name: "Mira Sokolov", password: "parcelith", platformRole: "agency_admin", agencyId: "agc_cobalt", title: "Founder", createdAt: iso(90) },
];

/**
 * Ferro Coffee Club runs the storefront in German. It is declared once here so
 * the store record, its product copy, its layout and its order history cannot
 * drift apart.
 */
const FERRO_LANGUAGE = "de";

const carriers = (dhl, fedex, ups) => [
  { carrier: "dhl", enabled: dhl, accountNumber: dhl ? "DHL-4471902" : "", services: ["Express Worldwide", "Economy Select"] },
  { carrier: "fedex", enabled: fedex, accountNumber: fedex ? "FDX-88213004" : "", services: ["International Priority", "International Economy"] },
  { carrier: "ups", enabled: ups, accountNumber: ups ? "UPS-9W41F7" : "", services: ["Worldwide Expedited", "Standard"] },
];

const stores = [
  {
    id: "str_northwind",
    agencyId: "agc_northlight",
    name: "Northwind Supply Co",
    slug: "northwind-supply",
    channelCode: "northwind-supply",
    clientName: "Northwind Technologies",
    status: "active",
    logoUrl: null,
    theme: "meridian",
    defaultLanguage: "en",
    currencies: ["USD", "EUR", "GBP"],
    defaultCurrency: "USD",
    customDomain: "shop.northwind.example",
    domainStatus: "verified",
    supportEmail: "support@northwind.example",
    supportPhone: "+1 503 555 0142",
    stripe: { connected: true, accountId: "acct_1NwSupplyCo", country: "US", chargesEnabled: true, connectedAt: iso(96) },
    carriers: carriers(true, false, true),
    defaultTaxBracketId: "tax_us825",
    pricesIncludeTax: false,
    setup: { branding: true, localisation: true, support: true, domain: true, payments: true, shipping: true, tax: true },
    createdAt: iso(100),
    archivedAt: null,
  },
  {
    id: "str_lumen",
    agencyId: "agc_northlight",
    name: "Lumen Studio Shop",
    slug: "lumen-studio",
    channelCode: "lumen-studio",
    clientName: "Lumen Creative",
    status: "active",
    logoUrl: null,
    theme: "bloom",
    defaultLanguage: "en",
    currencies: ["EUR", "GBP"],
    defaultCurrency: "EUR",
    customDomain: "store.lumen.example",
    domainStatus: "pending",
    supportEmail: "hello@lumen.example",
    supportPhone: null,
    stripe: { connected: true, accountId: "acct_1LumenCreative", country: "DE", chargesEnabled: true, connectedAt: iso(52) },
    carriers: carriers(true, true, false),
    defaultTaxBracketId: "tax_std20",
    pricesIncludeTax: true,
    setup: { branding: true, localisation: true, support: true, domain: false, payments: true, shipping: true, tax: true },
    createdAt: iso(60),
    archivedAt: null,
  },
  {
    id: "str_ferro",
    agencyId: "agc_northlight",
    name: "Ferro Coffee Club",
    slug: "ferro-coffee",
    channelCode: "ferro-coffee",
    clientName: "Ferro Kaffeerösterei",
    status: "active",
    logoUrl: null,
    theme: "atelier",
    // The German demo store. Everything a shopper sees here — the storefront
    // copy, the product descriptions, the basket, the checkout and the order
    // status page — is rendered from the `de` dictionary and formatted for
    // de-DE, so the contrast with the English stores under the same agency is
    // visible without changing a single setting.
    defaultLanguage: FERRO_LANGUAGE,
    currencies: ["EUR"],
    defaultCurrency: "EUR",
    customDomain: null,
    domainStatus: "unset",
    supportEmail: "hallo@ferro-kaffee.example",
    supportPhone: "+49 30 5550 1834",
    stripe: { connected: true, accountId: "acct_1FerroKaffee", country: "DE", chargesEnabled: true, connectedAt: iso(8) },
    carriers: carriers(true, false, false),
    defaultTaxBracketId: "tax_de19",
    pricesIncludeTax: true,
    setup: { branding: true, localisation: true, support: true, domain: false, payments: true, shipping: true, tax: true },
    createdAt: iso(9),
    archivedAt: null,
  },
  {
    id: "str_halcyon",
    agencyId: "agc_northlight",
    name: "Halcyon Events Store",
    slug: "halcyon-events",
    channelCode: "halcyon-events",
    clientName: "Halcyon Events Group",
    status: "archived",
    logoUrl: null,
    theme: "graphite",
    defaultLanguage: "en",
    currencies: ["GBP"],
    defaultCurrency: "GBP",
    customDomain: null,
    domainStatus: "unset",
    supportEmail: "events@halcyon.example",
    supportPhone: "+44 20 7946 0918",
    stripe: { connected: false, accountId: null, country: "GB", chargesEnabled: false, connectedAt: null },
    carriers: carriers(false, false, true),
    defaultTaxBracketId: "tax_std20",
    pricesIncludeTax: true,
    setup: { branding: true, localisation: true, support: true, domain: false, payments: false, shipping: true, tax: true },
    createdAt: iso(150),
    archivedAt: iso(21),
  },
  {
    id: "str_rivet",
    agencyId: "agc_cobalt",
    name: "Rivet Hardware Merch",
    slug: "rivet-hardware",
    channelCode: "rivet-hardware",
    clientName: "Rivet Hardware",
    status: "active",
    logoUrl: null,
    theme: "graphite",
    defaultLanguage: "en",
    currencies: ["USD"],
    defaultCurrency: "USD",
    customDomain: null,
    domainStatus: "unset",
    supportEmail: "orders@rivet.example",
    supportPhone: "+1 216 555 0113",
    stripe: { connected: true, accountId: "acct_1RivetHardware", country: "US", chargesEnabled: true, connectedAt: iso(40) },
    carriers: carriers(false, true, false),
    defaultTaxBracketId: "tax_us825",
    pricesIncludeTax: false,
    setup: { branding: true, localisation: true, support: true, domain: false, payments: true, shipping: true, tax: true },
    createdAt: iso(45),
    archivedAt: null,
  },
];

const memberships = [
  { id: id("mem"), storeId: "str_northwind", agencyId: "agc_northlight", userId: "usr_sam", email: "sam@northlight.studio", name: "Sam Okafor", role: "catalog_manager", status: "active", invitedBy: "Alex Moreau", invitedAt: iso(99), acceptedAt: iso(98) },
  { id: id("mem"), storeId: "str_northwind", agencyId: "agc_northlight", userId: "usr_ines", email: "ines@northlight.studio", name: "Inés Duarte", role: "order_manager", status: "active", invitedBy: "Alex Moreau", invitedAt: iso(97), acceptedAt: iso(97) },
  { id: id("mem"), storeId: "str_northwind", agencyId: "agc_northlight", userId: "usr_dana", email: "dana@northwind.example", name: "Dana Whitfield", role: "viewer", status: "active", invitedBy: "Alex Moreau", invitedAt: iso(90), acceptedAt: iso(89) },
  { id: id("mem"), storeId: "str_lumen", agencyId: "agc_northlight", userId: "usr_sam", email: "sam@northlight.studio", name: "Sam Okafor", role: "catalog_manager", status: "active", invitedBy: "Alex Moreau", invitedAt: iso(58), acceptedAt: iso(58) },
  { id: id("mem"), storeId: "str_lumen", agencyId: "agc_northlight", userId: null, email: "theo@lumen.example", name: "Theo Vance", role: "viewer", status: "invited", invitedBy: "Alex Moreau", invitedAt: iso(4), acceptedAt: null, inviteToken: id("inv") },
  { id: id("mem"), storeId: "str_ferro", agencyId: "agc_northlight", userId: "usr_sam", email: "sam@northlight.studio", name: "Sam Okafor", role: "store_admin", status: "active", invitedBy: "Alex Moreau", invitedAt: iso(9), acceptedAt: iso(9) },
  { id: id("mem"), storeId: "str_ferro", agencyId: "agc_northlight", userId: "usr_ines", email: "ines@northlight.studio", name: "Inés Duarte", role: "order_manager", status: "active", invitedBy: "Alex Moreau", invitedAt: iso(8), acceptedAt: iso(8) },
];

/* ------------------------------------------------------------ store products */

const CLIENT_ARTWORK = {
  northwind: { mark: "N", word: "NORTHWIND", tagline: "SUPPLY CO", colour: "#0b807c", accent: "#123f3f" },
  lumen: { mark: "L", word: "LUMEN", tagline: "CREATIVE STUDIO", colour: "#be185d", accent: "#4c0519" },
  ferro: { mark: "F", word: "FERRO", tagline: "KAFFEEROESTEREI", colour: "#7c2d12", accent: "#2a1206" },
};

/** Mirrors src/lib/sku.ts — "Organic Cotton Tee" in channel "lumen-studio" -> "LUMENS-ORG-COT-TEE". */
function storeSku(store, name, taken) {
  const prefix = store.channelCode.replace(/[^a-z0-9]/gi, "").toUpperCase().slice(0, 6) || "STORE";
  const stem =
    name
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim()
      .split(" ")
      .slice(0, 3)
      .map((word) => word.slice(0, 3).toUpperCase())
      .join("-") || "ITEM";
  const base = `${prefix}-${stem}`;
  let sku = base;
  for (let n = 2; taken.has(sku); n++) sku = `${base}-${n}`;
  taken.add(sku);
  return sku;
}

const takenSkus = new Map();

function storeVariants(catalogProduct, price, filterFn = () => true) {
  return catalogProduct.variants.filter(filterFn).map((v) => ({
    id: id("svar"),
    catalogVariantId: v.id,
    name: v.name,
    colour: v.colour,
    colourHex: v.colourHex,
    size: v.size,
    sku: `${catalogProduct.id.slice(4, 8).toUpperCase()}-${v.sku}`,
    baseCost: v.baseCost,
    price: price + (v.size === "2XL" ? 200 : 0),
    enabled: true,
    availability: v.availability,
  }));
}

function breakdown({ supplierCost, customizationCost, shippingEstimate, sellingPrice, taxRate, pricesIncludeTax, currency, taxBracketId }) {
  const rate = taxRate / 100;
  const taxAmount = pricesIncludeTax
    ? Math.round(sellingPrice - sellingPrice / (1 + rate))
    : Math.round(sellingPrice * rate);
  const net = pricesIncludeTax ? sellingPrice - taxAmount : sellingPrice;
  const landed = supplierCost + customizationCost + shippingEstimate;
  const marginAmount = net - landed;
  return {
    supplierCost, customizationCost, shippingEstimate, taxBracketId, taxRate, taxAmount,
    sellingPrice, marginAmount,
    marginPct: Number((net > 0 ? (marginAmount / net) * 100 : 0).toFixed(2)),
    currency,
  };
}

const PRODUCT_PLAN = [
  {
    storeId: "str_northwind", catalogId: "cat_tee_heavy", artwork: "northwind",
    name: "Northwind Field Tee", slug: "northwind-field-tee", price: 3200, currency: "USD", taxBracketId: "tax_us825", status: "published",
    tags: ["tee", "cotton", "onboarding", "unisex", "everyday"],
    description:
      "The tee we hand to every new starter on day one. Heavyweight ring-spun cotton, printed on the chest and shoulder blade so it reads from both sides of the room.\n\nRuns true to size from S to 2XL and keeps its shape after repeated washing. Printed to order — nothing sits in a warehouse waiting to be thrown away.",
    areas: [
      { areaId: "pa_tee_front", scale: 0.55, x: 0.5, y: 0.34, rotation: 0 },
      { areaId: "pa_tee_back", scale: 0.82, x: 0.5, y: 0.42, rotation: 0 },
    ],
    colourForMockup: "White", importedBy: "Sam Okafor", importedDaysAgo: 88, publishedDaysAgo: 86,
  },
  {
    storeId: "str_northwind", catalogId: "cat_hoodie_premium", artwork: "northwind",
    name: "Northwind Ridge Hoodie", slug: "northwind-ridge-hoodie", price: 6400, currency: "USD", taxBracketId: "tax_us825", status: "published",
    tags: ["hoodie", "fleece", "winter", "premium"],
    description:
      "A 320 gsm brushed fleece hoodie for the winter kit drop. The chest print sits above the pocket seam so it stays flat when the pocket is in use.\n\nDouble-layer hood, ribbed cuffs and a straight body cut. Ordered by the field team three seasons running.",
    areas: [{ areaId: "pa_hood_front", scale: 0.62, x: 0.5, y: 0.45, rotation: 0 }],
    colourForMockup: "Navy", importedBy: "Sam Okafor", importedDaysAgo: 74, publishedDaysAgo: 72,
  },
  {
    storeId: "str_northwind", catalogId: "cat_mug_classic", artwork: "northwind",
    name: "Northwind Desk Mug", slug: "northwind-desk-mug", price: 1800, currency: "USD", taxBracketId: "tax_us825", status: "published",
    tags: ["mug", "ceramic", "desk", "gifting"],
    description:
      "An 11oz white ceramic mug with a full wrap print on both sides, so it reads the same whether it is held in the left or right hand.\n\nDishwasher and microwave safe. The default thank-you gift for customer workshops.",
    areas: [
      { areaId: "pa_mug_left", scale: 0.78, x: 0.5, y: 0.5, rotation: 0 },
      { areaId: "pa_mug_right", scale: 0.78, x: 0.5, y: 0.5, rotation: 0 },
    ],
    colourForMockup: "White", importedBy: "Sam Okafor", importedDaysAgo: 70, publishedDaysAgo: 69,
  },
  {
    storeId: "str_northwind", catalogId: "cat_tee_organic", artwork: "northwind",
    name: "Northwind Organic Tee", slug: "northwind-organic-tee", price: 3600, currency: "USD", taxBracketId: "tax_us825", status: "draft",
    tags: ["tee", "organic", "gots"],
    description:
      "GOTS-certified organic cotton, produced inside the destination market. Under review as the replacement for the heavy cotton tee in EU orders.",
    areas: [{ areaId: "pa_tee_front", scale: 0.5, x: 0.5, y: 0.34, rotation: 0 }],
    colourForMockup: "White", importedBy: "Sam Okafor", importedDaysAgo: 5, publishedDaysAgo: null,
  },
  {
    storeId: "str_lumen", catalogId: "cat_tee_heavy", artwork: "lumen",
    name: "Lumen Studio Tee", slug: "lumen-studio-tee", price: 2900, currency: "EUR", taxBracketId: "tax_std20", status: "published",
    tags: ["tee", "studio", "cotton", "unisex"],
    description:
      "The house tee, printed on the chest in the studio's signature magenta. Cut for everyday wear rather than event swag.\n\nPrices include VAT at the standard rate. Shipped from inside the EU, so there is nothing to pay on delivery.",
    areas: [{ areaId: "pa_tee_front", scale: 0.52, x: 0.5, y: 0.35, rotation: 0 }],
    colourForMockup: "Black", importedBy: "Sam Okafor", importedDaysAgo: 55, publishedDaysAgo: 54,
  },
  {
    storeId: "str_lumen", catalogId: "cat_mug_matte", artwork: "lumen",
    name: "Lumen Matte Mug", slug: "lumen-matte-mug", price: 2400, currency: "EUR", taxBracketId: "tax_std20", status: "published",
    tags: ["mug", "matte", "15oz", "gifting"],
    description:
      "A 15oz matte black mug for the studio's client gift boxes. Light artwork prints cleanly against the dark body; anything below 300 DPI is rejected before it reaches production.\n\nHand wash recommended to protect the matte finish.",
    areas: [{ areaId: "pa_mug_left", scale: 0.72, x: 0.5, y: 0.5, rotation: 0 }],
    colourForMockup: "Black", importedBy: "Sam Okafor", importedDaysAgo: 40, publishedDaysAgo: 38,
  },
  {
    storeId: "str_lumen", catalogId: "cat_hoodie_eco", artwork: "lumen",
    name: "Lumen Eco Hoodie", slug: "lumen-eco-hoodie", price: 5400, currency: "EUR", taxBracketId: "tax_std20", status: "in_review",
    tags: ["hoodie", "recycled", "winter"],
    description:
      "Recycled cotton and polyester blend at a lower unit cost than the premium hoodie. Waiting on a sample from the assigned print provider before it goes live.",
    areas: [{ areaId: "pa_hood_front", scale: 0.58, x: 0.5, y: 0.45, rotation: 0 }],
    colourForMockup: "Heather grey", importedBy: "Sam Okafor", importedDaysAgo: 6, publishedDaysAgo: null,
  },
  // Ferro sells in German: the names, descriptions, tags and the personalisation
  // label a shopper types into are all written in the store's own language, so
  // nothing on the storefront falls back to English.
  {
    storeId: "str_ferro", catalogId: "cat_mug_classic", artwork: "ferro",
    name: "Ferro Rösterei-Tasse", slug: "ferro-roesterei-tasse", price: 1900, currency: "EUR", taxBracketId: "tax_de19", status: "published",
    tags: ["tasse", "keramik", "frühstück", "geschenk"],
    description:
      "Die Tasse aus unserem Röstraum: 330 ml weiße Keramik, rundum bedruckt, damit das Logo von beiden Seiten zu sehen ist.\n\nSpülmaschinen- und mikrowellengeeignet. Alle Preise verstehen sich inklusive 19 % Mehrwertsteuer.",
    areas: [
      { areaId: "pa_mug_left", scale: 0.76, x: 0.5, y: 0.5, rotation: 0 },
      { areaId: "pa_mug_right", scale: 0.76, x: 0.5, y: 0.5, rotation: 0 },
    ],
    textLabel: "Name auf der Tasse",
    colourForMockup: "White", importedBy: "Sam Okafor", importedDaysAgo: 8, publishedDaysAgo: 7,
  },
  {
    storeId: "str_ferro", catalogId: "cat_tee_heavy", artwork: "ferro",
    name: "Ferro Clubshirt", slug: "ferro-clubshirt", price: 3200, currency: "EUR", taxBracketId: "tax_de19", status: "published",
    tags: ["shirt", "baumwolle", "unisex", "alltag"],
    description:
      "Schweres Ringgarn aus Baumwolle, vorn mit dem Ferro-Schriftzug bedruckt. Unisex geschnitten und von S bis 2XL größengetreu.\n\nWird erst nach der Bestellung innerhalb der EU produziert — kein Lager, keine Zollgebühren bei der Lieferung.",
    areas: [{ areaId: "pa_tee_front", scale: 0.5, x: 0.5, y: 0.34, rotation: 0 }],
    textLabel: "Name auf dem Ärmel",
    colourForMockup: "Black", importedBy: "Sam Okafor", importedDaysAgo: 8, publishedDaysAgo: 7,
  },
  {
    storeId: "str_ferro", catalogId: "cat_hoodie_premium", artwork: "ferro",
    name: "Ferro Röstwerk-Hoodie", slug: "ferro-roestwerk-hoodie", price: 6400, currency: "EUR", taxBracketId: "tax_de19", status: "published",
    tags: ["hoodie", "fleece", "winter", "röstwerk"],
    description:
      "Angerauter Fleece-Hoodie mit 320 g/m² für die kalten Schichten in der Rösterei. Der Brustdruck sitzt über der Tasche und bleibt auch dann flach, wenn die Tasche benutzt wird.\n\nDoppellagige Kapuze, gerippte Bündchen, gerader Schnitt.",
    areas: [{ areaId: "pa_hood_front", scale: 0.6, x: 0.5, y: 0.45, rotation: 0 }],
    textLabel: "Name auf dem Ärmel",
    colourForMockup: "Navy", importedBy: "Sam Okafor", importedDaysAgo: 8, publishedDaysAgo: 6,
  },
  {
    storeId: "str_ferro", catalogId: "cat_mug_matte", artwork: "ferro",
    name: "Ferro Filterbecher matt", slug: "ferro-filterbecher-matt", price: 2400, currency: "EUR", taxBracketId: "tax_de19", status: "in_review",
    tags: ["becher", "matt", "filterkaffee"],
    description:
      "Mattschwarzer Becher mit 440 ml für die Filterkaffee-Reihe. Wartet noch auf das Andruckmuster der Druckerei, bevor er in den Shop geht.",
    areas: [{ areaId: "pa_mug_left", scale: 0.7, x: 0.5, y: 0.5, rotation: 0 }],
    textLabel: "Name auf dem Becher",
    colourForMockup: "Black", importedBy: "Sam Okafor", importedDaysAgo: 3, publishedDaysAgo: null,
  },
  {
    storeId: "str_rivet", catalogId: "cat_tee_heavy", artwork: "northwind",
    name: "Rivet Crew Tee", slug: "rivet-crew-tee", price: 3000, currency: "USD", taxBracketId: "tax_us825", status: "published",
    tags: ["tee", "crew", "workwear"],
    description:
      "Heavy cotton crew tee for the Rivet trade counter team. Printed front only.\n\nOrdered in bulk twice a year and topped up on demand.",
    areas: [{ areaId: "pa_tee_front", scale: 0.48, x: 0.5, y: 0.34, rotation: 0 }],
    colourForMockup: "Black", importedBy: "Mira Sokolov", importedDaysAgo: 30, publishedDaysAgo: 29,
  },
];

/* --------------------------------------------------------------------- main */

async function main() {
  console.log("clearing collections…");
  for (const c of [
    "agencies", "users", "stores", "memberships", "suppliers", "catalog_products",
    "store_products", "tax_brackets", "orders", "storefronts", "audit_logs",
    "ai_suggestions", "carts", "gift_catalogues", "gift_campaigns",
  ]) {
    await clear(c);
  }

  console.log("rendering client artwork…");
  const artworkAssets = {};
  for (const [key, spec] of Object.entries(CLIENT_ARTWORK)) {
    artworkAssets[key] = await makeLogoArtwork(spec);
    console.log(`  ${key} -> ${artworkAssets[key].url}`);
  }

  const storeLogos = {
    str_northwind: artworkAssets.northwind.url,
    str_lumen: artworkAssets.lumen.url,
    str_ferro: artworkAssets.ferro.url,
  };
  for (const store of stores) {
    if (storeLogos[store.id]) store.logoUrl = storeLogos[store.id];
  }

  console.log("building store products + mockups…");
  const storeProducts = [];
  const auditLogs = [];

  for (const plan of PRODUCT_PLAN) {
    const cat = catalog.find((c) => c.id === plan.catalogId);
    const store = stores.find((s) => s.id === plan.storeId);
    const bracket = taxBrackets.find((t) => t.id === plan.taxBracketId);
    const art = artworkAssets[plan.artwork];

    const variants = storeVariants(cat, plan.price, (v) =>
      cat.category === "drinkware" ? true : v.colour === plan.colourForMockup,
    );

    const artworks = [];
    const mockups = [];
    for (const spec of plan.areas) {
      const area = cat.printAreas.find((a) => a.id === spec.areaId);
      artworks.push({
        id: id("art"),
        printAreaId: area.id,
        view: area.view,
        fileName: `${plan.artwork}-lockup.png`,
        url: art.url,
        mimeType: "image/png",
        sizeBytes: art.sizeBytes,
        pixelWidth: art.pixelWidth,
        pixelHeight: art.pixelHeight,
        hasAlpha: true,
        x: spec.x,
        y: spec.y,
        scale: spec.scale,
        rotation: spec.rotation,
      });
      const base = cat.mockups.find((m) => m.view === area.view && m.colour === plan.colourForMockup)
        ?? cat.mockups.find((m) => m.view === area.view);
      const url = await composeMockup(base.url, area, {
        artworkUrl: art.url,
        pixelWidth: art.pixelWidth,
        pixelHeight: art.pixelHeight,
        x: spec.x,
        y: spec.y,
        scale: spec.scale,
        rotation: spec.rotation,
      });
      mockups.push({
        id: id("mck"),
        view: area.view,
        url,
        colour: plan.colourForMockup,
        generatedAt: iso(plan.importedDaysAgo),
        approved: plan.status !== "draft",
        approvedBy: plan.status !== "draft" ? plan.importedBy : null,
        approvedAt: plan.status !== "draft" ? iso(plan.importedDaysAgo) : null,
      });
      console.log(`  ${plan.name} · ${area.name}`);
    }

    const decorated = new Set(artworks.map((a) => a.printAreaId)).size;
    const costs = breakdown({
      supplierCost: Math.min(...variants.map((v) => v.baseCost)),
      customizationCost: cat.customizationCostPerArea * decorated,
      shippingEstimate: cat.shippingEstimate,
      sellingPrice: plan.price,
      taxRate: bracket?.rate ?? 0,
      pricesIncludeTax: store.pricesIncludeTax,
      currency: plan.currency,
      taxBracketId: plan.taxBracketId,
    });

    storeProducts.push({
      id: id("prd"),
      storeId: plan.storeId,
      catalogProductId: cat.id,
      supplierId: cat.supplierId,
      name: plan.name,
      slug: plan.slug,
      sku: storeSku(
        store,
        plan.name,
        takenSkus.get(store.id) ?? takenSkus.set(store.id, new Set()).get(store.id),
      ),
      description: plan.description,
      tags: plan.tags,
      category: cat.category,
      status: plan.status,
      visibility: "public",
      price: plan.price,
      currency: plan.currency,
      taxBracketId: plan.taxBracketId,
      variants,
      artworks,
      mockups,
      shopperCustomization: {
        artworkUpload: cat.category === "drinkware",
        textLine: true,
        // The shopper types into this field, so it is written in the store's
        // language rather than derived from the English category name.
        textLabel:
          plan.textLabel ?? (cat.category === "drinkware" ? "Name on the mug" : "Name on the sleeve"),
        maxTextLength: 18,
      },
      costs,
      importedBy: plan.importedBy,
      importedAt: iso(plan.importedDaysAgo),
      updatedAt: iso(plan.publishedDaysAgo ?? plan.importedDaysAgo),
      publishedAt: plan.publishedDaysAgo != null ? iso(plan.publishedDaysAgo) : null,
    });

    auditLogs.push({
      id: id("aud"), category: "product_import", action: "product.imported",
      summary: `Imported “${cat.name}” from the shared catalog as “${plan.name}”`,
      storeId: plan.storeId, agencyId: store.agencyId, actorId: "usr_sam", actorName: plan.importedBy,
      entity: "store_product", entityId: plan.slug, meta: { supplier: cat.supplierId }, at: iso(plan.importedDaysAgo),
    });
    if (plan.publishedDaysAgo != null) {
      auditLogs.push({
        id: id("aud"), category: "publishing", action: "product.published",
        summary: `Published “${plan.name}” to the storefront`,
        storeId: plan.storeId, agencyId: store.agencyId, actorId: "usr_sam", actorName: plan.importedBy,
        entity: "store_product", entityId: plan.slug, meta: { price: plan.price, currency: plan.currency }, at: iso(plan.publishedDaysAgo),
      });
    }
  }

  /* ------------------------------------------------------------ storefronts */

  let nodeSeq = 0;
  const node = () => `n${(nodeSeq += 1)}${Math.random().toString(36).slice(2, 7)}`;
  function tree(sections) {
    const out = {
      ROOT: { type: { resolvedName: "PageCanvas" }, isCanvas: true, props: {}, displayName: "Page", custom: {}, hidden: false, nodes: [], linkedNodes: {} },
    };
    const ids = [];
    for (const s of sections) {
      const nid = node();
      ids.push(nid);
      out[nid] = {
        type: { resolvedName: s.type }, isCanvas: false, props: s.props, displayName: s.type,
        custom: {}, parent: "ROOT", hidden: false, nodes: [], linkedNodes: {},
      };
    }
    out.ROOT.nodes = ids;
    return out;
  }

  const northwindTree = tree([
    { type: "PromoBanner", props: { text: "Free US shipping on orders over $75", ctaLabel: "Shop the range", ctaHref: "products", tone: "accent" } },
    { type: "HeroSection", props: { eyebrow: "Northwind Supply Co", headline: "Kit that survives the field", body: "Printed to order for Northwind teams and partners. Heavy cotton, brushed fleece and ceramics — no minimums, no warehouse, tracked worldwide.", ctaLabel: "Shop the collection", ctaHref: "products", imageUrl: IMAGES["storefront-northwind"], align: "left", tone: "light" } },
    { type: "ValueProps", props: { title: "Why the field team orders here", itemOneTitle: "Made after you order", itemOneBody: "Every item is produced on demand, so nothing sits in a stockroom going out of date.", itemTwoTitle: "Tracked to the door", itemTwoBody: "DHL and UPS tracking on every parcel, in more than 190 countries.", itemThreeTitle: "Sized for everyone", itemThreeBody: "Unisex cuts from S to 2XL, with the same print position on every size." } },
    { type: "ProductGrid", props: { title: "Current range", subtitle: "Four staples, restocked automatically because they are printed on demand.", columns: "3", limit: 6, showPrice: true } },
    { type: "ImageWithText", props: { heading: "Your logo, printed properly", body: "Artwork is checked against the supplier's print area, resolution and file rules before anything reaches production. If a design will not print cleanly, it never leaves the studio.", imageUrl: IMAGES["marketing-mockup"], imageSide: "right" } },
    { type: "Testimonial", props: { quote: "We ordered 240 hoodies for onboarding week and every single one arrived before the first session.", author: "Dana Whitfield", role: "People Operations, Northwind Technologies" } },
    { type: "RichText", props: { heading: "Sizing and care", body: "All apparel is unisex and true to size. Wash inside out at 30°C and hang dry to keep prints sharp. Mugs are dishwasher and microwave safe.", align: "left" } },
  ]);

  const lumenTree = tree([
    { type: "HeroSection", props: { eyebrow: "Lumen Creative", headline: "Studio goods, made to order", body: "A small range of everyday pieces in the studio's colours. Printed inside the EU and shipped with VAT included.", ctaLabel: "Browse the shop", ctaHref: "products", imageUrl: IMAGES["storefront-lumen"], align: "center", tone: "light" } },
    { type: "ProductGrid", props: { title: "In the shop", subtitle: "Everything is printed after you order it.", columns: "2", limit: 4, showPrice: true } },
    { type: "ValueProps", props: { title: "How it works", itemOneTitle: "Printed in the EU", itemOneBody: "Production happens inside the destination market, so there is no customs charge on delivery.", itemTwoTitle: "VAT included", itemTwoBody: "Prices shown include VAT at the standard rate — the price you see is the price you pay.", itemThreeTitle: "Personalise it", itemThreeBody: "Add a name to selected pieces before checkout and see the preview before you buy." } },
    { type: "NewsletterSignup", props: { heading: "Hear about new drops first", body: "One email per launch. No spam, unsubscribe any time.", buttonLabel: "Notify me" } },
  ]);

  const rivetTree = tree([
    { type: "HeroSection", props: { eyebrow: "Rivet Hardware", headline: "Trade counter merch", body: "Workwear-weight cotton for the counter team and the customers who ask where we got it.", ctaLabel: "Shop", ctaHref: "products", imageUrl: "", align: "left", tone: "dark" } },
    { type: "ProductGrid", props: { title: "Available now", subtitle: "Printed on demand and shipped with FedEx.", columns: "3", limit: 6, showPrice: true } },
  ]);

  // Ferro's layout is authored in German, like the rest of its shopper-facing
  // content. The built-in chrome around it (basket, checkout, order status)
  // comes from the `de` dictionary because the store's language says so.
  const ferroTree = tree([
    { type: "PromoBanner", props: { text: "Versandkostenfrei innerhalb Deutschlands ab 60 €", ctaLabel: "Zum Shop", ctaHref: "products", tone: "accent" } },
    { type: "HeroSection", props: { eyebrow: "Ferro Kaffeerösterei", headline: "Ausstattung aus dem Röstraum", body: "Tassen, Shirts und Hoodies für den Ferro Coffee Club. Auf Bestellung in der EU produziert — alle Preise inklusive Mehrwertsteuer.", ctaLabel: "Kollektion ansehen", ctaHref: "products", imageUrl: IMAGES["storefront-ferro"], align: "left", tone: "light" } },
    { type: "ValueProps", props: { title: "Warum bei uns bestellen", itemOneTitle: "Erst bestellt, dann gedruckt", itemOneBody: "Jedes Stück entsteht nach Ihrer Bestellung. Nichts liegt im Lager und nichts wird weggeworfen.", itemTwoTitle: "Versand mit DHL", itemTwoBody: "Sendungsverfolgung für jedes Paket, innerhalb Deutschlands meist in zwei Werktagen.", itemThreeTitle: "Preise inklusive MwSt.", itemThreeBody: "Der angezeigte Preis ist der Preis an der Kasse — 19 % Mehrwertsteuer sind bereits enthalten." } },
    { type: "ProductGrid", props: { title: "Aktuelle Kollektion", subtitle: "Drei Stücke aus der Rösterei, jedes auf Bestellung gefertigt.", columns: "3", limit: 6, showPrice: true } },
    { type: "ImageWithText", props: { heading: "Ihr Name auf der Tasse", body: "Tassen und Shirts lassen sich vor dem Kauf mit einem Namen versehen. Die Vorschau zeigt genau das, was gedruckt wird.", imageUrl: IMAGES["marketing-mockup"], imageSide: "right" } },
    { type: "Testimonial", props: { quote: "Die Tassen lagen pünktlich zur Eröffnung unserer zweiten Filiale auf dem Tresen.", author: "Marit Ferro", role: "Inhaberin, Ferro Kaffeerösterei" } },
    { type: "RichText", props: { heading: "Größen und Pflege", body: "Alle Textilien sind unisex geschnitten und fallen größengetreu aus. Bei 30 °C auf links waschen und an der Luft trocknen, damit der Druck scharf bleibt. Tassen sind spülmaschinenfest.", align: "left" } },
  ]);

  const storefronts = [
    { id: id("sfr"), storeId: "str_northwind", draft: northwindTree, published: northwindTree, publishedAt: iso(12), publishedBy: "Alex Moreau", draftUpdatedAt: iso(12), history: [{ id: id("ver"), label: "Autumn range", data: northwindTree, savedAt: iso(12), savedBy: "Alex Moreau" }] },
    { id: id("sfr"), storeId: "str_lumen", draft: lumenTree, published: lumenTree, publishedAt: iso(20), publishedBy: "Sam Okafor", draftUpdatedAt: iso(3), history: [{ id: id("ver"), label: "Launch layout", data: lumenTree, savedAt: iso(20), savedBy: "Sam Okafor" }] },
    { id: id("sfr"), storeId: "str_ferro", draft: ferroTree, published: ferroTree, publishedAt: iso(7), publishedBy: "Sam Okafor", draftUpdatedAt: iso(7), history: [{ id: id("ver"), label: "Eröffnung", data: ferroTree, savedAt: iso(7), savedBy: "Sam Okafor" }] },
    { id: id("sfr"), storeId: "str_halcyon", draft: tree([]), published: null, publishedAt: null, publishedBy: null, draftUpdatedAt: iso(150), history: [] },
    { id: id("sfr"), storeId: "str_rivet", draft: rivetTree, published: rivetTree, publishedAt: iso(28), publishedBy: "Mira Sokolov", draftUpdatedAt: iso(28), history: [] },
  ];

  /* ---------------------------------------------------------------- orders */

  const productsByStore = (storeId) => storeProducts.filter((p) => p.storeId === storeId && p.status === "published");

  const ORDER_PLAN = [
    { store: "str_northwind", daysAgo: 34, status: "delivered", carrier: "ups", country: "US", name: "Marcus Iyer", email: "marcus.iyer@example.com", city: "Denver", line1: "418 Larimer Street", postal: "80202", qty: 2, text: "M. IYER" },
    { store: "str_northwind", daysAgo: 27, status: "delivered", carrier: "dhl", country: "DE", name: "Katrin Vogel", email: "katrin.vogel@example.com", city: "Munich", line1: "Sendlinger Straße 12", postal: "80331", qty: 1, text: null },
    { store: "str_northwind", daysAgo: 19, status: "shipped", carrier: "ups", country: "US", name: "Tomas Beck", email: "tomas.beck@example.com", city: "Austin", line1: "902 East 6th Street", postal: "78702", qty: 3, text: null },
    { store: "str_northwind", daysAgo: 12, status: "in_production", carrier: null, country: "US", name: "Aleah Sanders", email: "aleah.sanders@example.com", city: "Portland", line1: "77 NW Glisan Street", postal: "97209", qty: 1, text: "ALEAH" },
    { store: "str_northwind", daysAgo: 6, status: "paid", carrier: null, country: "GB", name: "Rowan Clarke", email: "rowan.clarke@example.com", city: "Bristol", line1: "14 Park Row", postal: "BS1 5LJ", qty: 2, text: null },
    { store: "str_northwind", daysAgo: 3, status: "exception", carrier: null, country: "ZA", name: "Nomsa Dlamini", email: "nomsa.dlamini@example.com", city: "Cape Town", line1: "31 Bree Street", postal: "8001", qty: 1, text: null },
    { store: "str_northwind", daysAgo: 2, status: "cancelled", carrier: null, country: "US", name: "Peter Nowak", email: "peter.nowak@example.com", city: "Chicago", line1: "220 North Green Street", postal: "60607", qty: 1, text: null },
    { store: "str_northwind", daysAgo: 1, status: "paid", carrier: null, country: "US", name: "Grace Amoah", email: "grace.amoah@example.com", city: "Seattle", line1: "1201 Pine Street", postal: "98101", qty: 4, text: null },
    { store: "str_lumen", daysAgo: 30, status: "delivered", carrier: "dhl", country: "NL", name: "Sanne de Vries", email: "sanne.devries@example.com", city: "Utrecht", line1: "Oudegracht 205", postal: "3511 NK", qty: 1, text: "SANNE" },
    { store: "str_lumen", daysAgo: 21, status: "delivered", carrier: "fedex", country: "FR", name: "Camille Roux", email: "camille.roux@example.com", city: "Lyon", line1: "8 Rue de la République", postal: "69002", qty: 2, text: null },
    { store: "str_lumen", daysAgo: 11, status: "shipped", carrier: "dhl", country: "ES", name: "Diego Alonso", email: "diego.alonso@example.com", city: "Valencia", line1: "Carrer de Colón 42", postal: "46004", qty: 1, text: null },
    { store: "str_lumen", daysAgo: 5, status: "in_production", carrier: null, country: "IT", name: "Giulia Ferri", email: "giulia.ferri@example.com", city: "Bologna", line1: "Via Zamboni 16", postal: "40126", qty: 2, text: "GIULIA" },
    { store: "str_lumen", daysAgo: 2, status: "paid", carrier: null, country: "GB", name: "Owen Pritchard", email: "owen.pritchard@example.com", city: "Cardiff", line1: "5 Womanby Street", postal: "CF10 1BR", qty: 1, text: null },
    { store: "str_rivet", daysAgo: 14, status: "delivered", carrier: "fedex", country: "US", name: "Hank Lowell", email: "hank.lowell@example.com", city: "Cleveland", line1: "1240 Superior Avenue", postal: "44114", qty: 5, text: null },
    { store: "str_ferro", daysAgo: 6, status: "delivered", carrier: "dhl", country: "DE", name: "Katharina Brandt", email: "katharina.brandt@example.com", city: "Hamburg", line1: "Susannenstraße 14", postal: "20357", qty: 2, text: "KATHARINA" },
    { store: "str_ferro", daysAgo: 4, status: "shipped", carrier: "dhl", country: "AT", name: "Lukas Gruber", email: "lukas.gruber@example.com", city: "Wien", line1: "Neubaugasse 27", postal: "1070", qty: 1, text: null },
    { store: "str_ferro", daysAgo: 2, status: "in_production", carrier: null, country: "DE", name: "Jonas Ritter", email: "jonas.ritter@example.com", city: "Leipzig", line1: "Karl-Liebknecht-Straße 62", postal: "04275", qty: 3, text: null },
    { store: "str_ferro", daysAgo: 1, status: "paid", carrier: null, country: "DE", name: "Sophie Neumann", email: "sophie.neumann@example.com", city: "Köln", line1: "Ehrenstraße 91", postal: "50672", qty: 1, text: "SOPHIE" },
  ];

  const REGION_OF = { US: "North America", CA: "North America", AT: "European Union", DE: "European Union", NL: "European Union", FR: "European Union", ES: "European Union", IT: "European Union", GB: "United Kingdom", ZA: "Africa" };

  /**
   * The progress timeline is stored prose, and the shopper reads it on the order
   * status page — so it is written in the store's own language rather than
   * always in English. Amounts in it are formatted for that language too.
   */
  const EVENT_COPY = {
    en: {
      paid: "Payment captured",
      paidNote: (amount, account) => `Charged ${amount} via Stripe (${account}).`,
      routed: "Sent to supplier",
      routedNote: (supplier) => `Production job accepted by ${supplier}.`,
      manual: "Manual handling required",
      manualNote: (supplier, region) =>
        `${supplier} does not fulfil to ${region}. Route this job to an alternative production partner.`,
      shipped: "Shipped",
      shippedNote: (carrier) => `Handed to ${carrier} for delivery.`,
      delivered: "Delivered",
      deliveredNote: "Signed for at the delivery address.",
      cancelled: "Cancelled",
      cancelledNote: "Shopper cancelled before production started. Full refund issued.",
      exception: "Exception raised",
      exceptionNote: "Awaiting an alternative production partner for this destination.",
    },
    de: {
      paid: "Zahlung eingegangen",
      paidNote: (amount, account) => `${amount} über Stripe abgebucht (${account}).`,
      routed: "An die Produktion übergeben",
      routedNote: (supplier) => `Produktionsauftrag von ${supplier} angenommen.`,
      manual: "Manuelle Bearbeitung nötig",
      manualNote: (supplier, region) =>
        `${supplier} liefert nicht nach ${region}. Dieser Auftrag braucht einen anderen Produktionspartner.`,
      shipped: "Versandt",
      shippedNote: (carrier) => `An ${carrier} für die Zustellung übergeben.`,
      delivered: "Zugestellt",
      deliveredNote: "An der Lieferadresse entgegengenommen.",
      cancelled: "Storniert",
      cancelledNote: "Vor Produktionsbeginn storniert. Der Betrag wurde vollständig erstattet.",
      exception: "Ausnahme gemeldet",
      exceptionNote: "Wir suchen einen alternativen Produktionspartner für dieses Zielland.",
    },
  };

  const LOCALE_TAG = { en: "en-GB", de: "de-DE" };
  const localeAmount = (minor, currency, language) =>
    new Intl.NumberFormat(LOCALE_TAG[language] ?? "en-GB", { style: "currency", currency }).format(minor / 100);

  function trackingNumber(carrier, code) {
    const digits = code.replace(/\D/g, "").padEnd(9, "0").slice(0, 9);
    if (carrier === "dhl") return `JD${digits}0${digits.slice(0, 4)}`;
    if (carrier === "fedex") return `7${digits}${digits.slice(0, 3)}`;
    return `1Z${digits.slice(0, 6)}W${digits.slice(0, 8)}`;
  }
  const TRACK_URL = {
    dhl: (n) => `https://www.dhl.com/global-en/home/tracking/tracking-express.html?submit=1&tracking-id=${n}`,
    fedex: (n) => `https://www.fedex.com/fedextrack/?trknbr=${n}`,
    ups: (n) => `https://www.ups.com/track?loc=en_US&tracknum=${n}`,
  };

  const orders = [];
  for (const plan of ORDER_PLAN) {
    const store = stores.find((s) => s.id === plan.store);
    const pool = productsByStore(plan.store);
    const product = pool[orders.length % pool.length];
    const supplier = suppliers.find((s) => s.id === product.supplierId);
    const bracket = taxBrackets.find((t) => t.id === product.taxBracketId);
    const variant = product.variants[Math.min(1, product.variants.length - 1)];
    // Random, not sequential: neighbouring order codes must not be guessable.
    const code = `ORD-${randomInt(10_000_000, 99_999_999)}`;
    const unitPrice = variant.price;
    const subtotal = unitPrice * plan.qty;
    const shipping = product.category === "drinkware" ? 690 : 590;
    const rate = bracket?.rate ?? 0;
    const taxAmount = store.pricesIncludeTax
      ? Math.round(subtotal - subtotal / (1 + rate / 100))
      : Math.round((subtotal + shipping) * (rate / 100));
    const total = store.pricesIncludeTax ? subtotal + shipping : subtotal + shipping + taxAmount;

    const region = REGION_OF[plan.country] ?? "Rest of world";
    // Coverage follows the catalog product the line was imported from, not the
    // supplier record: a partner can trade in a region without producing this
    // product line there, and the product record is what routing trusts.
    const sourceProduct = catalog.find((c) => c.id === product.catalogProductId);
    const outOfRegion =
      !supplier.regions.includes(region) || !(sourceProduct?.fulfillmentRegions ?? []).includes(region);
    const routing = plan.status === "exception" || outOfRegion ? "manual_required" : plan.status === "awaiting_payment" ? "pending" : "submitted";

    const e = EVENT_COPY[store.defaultLanguage] ?? EVENT_COPY.en;
    const events = [
      { at: iso(plan.daysAgo, 9), status: e.paid, note: e.paidNote(localeAmount(total, product.currency, store.defaultLanguage), store.stripe.accountId), actor: "Stripe" },
    ];
    if (routing === "submitted") {
      events.push({ at: iso(plan.daysAgo, 10), status: e.routed, note: e.routedNote(supplier.name), actor: "Parcelith routing" });
    } else if (routing === "manual_required") {
      events.push({ at: iso(plan.daysAgo, 10), status: e.manual, note: e.manualNote(supplier.name, region), actor: "Parcelith routing" });
    }
    if (["shipped", "delivered"].includes(plan.status)) {
      events.push({ at: iso(plan.daysAgo - 2, 14), status: e.shipped, note: e.shippedNote(plan.carrier?.toUpperCase()), actor: supplier.name });
    }
    if (plan.status === "delivered") {
      events.push({ at: iso(plan.daysAgo - 5, 11), status: e.delivered, note: e.deliveredNote, actor: plan.carrier?.toUpperCase() ?? "Carrier" });
    }
    if (plan.status === "cancelled") {
      events.push({ at: iso(plan.daysAgo, 15), status: e.cancelled, note: e.cancelledNote, actor: "Inés Duarte" });
    }
    if (plan.status === "exception") {
      events.push({ at: iso(plan.daysAgo, 12), status: e.exception, note: e.exceptionNote, actor: "Inés Duarte" });
    }

    const carrier = plan.carrier;
    const tracking = carrier ? trackingNumber(carrier, code) : null;

    orders.push({
      id: id("ord"),
      storeId: plan.store,
      code,
      status: plan.status,
      currency: product.currency,
      customer: { name: plan.name, email: plan.email, line1: plan.line1, city: plan.city, postalCode: plan.postal, country: plan.country },
      items: [
        {
          id: id("oit"),
          storeProductId: product.id,
          variantId: variant.id,
          productName: product.name,
          variantName: variant.name,
          quantity: plan.qty,
          unitPrice,
          supplierCost: variant.baseCost,
          customization: {
            artworkUrl: product.artworks[0]?.url ?? null,
            artworkFileName: product.artworks[0]?.fileName ?? null,
            text: plan.text,
            previewUrl: product.mockups[0]?.url ?? null,
          },
          supplierId: product.supplierId,
        },
      ],
      subtotal,
      shipping,
      taxAmount,
      taxRate: rate,
      taxLines: [{ rate, amount: taxAmount }],
      total,
      payment: {
        provider: "stripe",
        status: plan.status === "cancelled" ? "refunded" : "succeeded",
        paymentIntentId: `pi_3${code.replace(/\D/g, "")}${product.currency}`,
        stripeAccountId: store.stripe.accountId,
        last4: "4242",
        failureMessage: null,
        paidAt: iso(plan.daysAgo, 9),
      },
      fulfillment: {
        supplierId: supplier.id,
        supplierName: supplier.name,
        routing,
        supplierOrderRef: routing === "submitted" ? `${supplier.name.slice(0, 3).toUpperCase()}-${code.replace("ORD-", "")}` : null,
        submittedAt: routing === "submitted" ? iso(plan.daysAgo, 10) : null,
        submissionMessage:
          routing === "submitted"
            ? `Production job accepted by ${supplier.name} (${supplier.leadTimeDays[0]}–${supplier.leadTimeDays[1]} day lead time).`
            : `${supplier.name} does not fulfil to ${region}. Route this job to an alternative production partner.`,
        carrier: carrier ?? null,
        trackingNumber: tracking,
        trackingUrl: carrier && tracking ? TRACK_URL[carrier](tracking) : null,
        exception:
          plan.status === "exception"
            ? `Destination ${plan.country} (${region}) is outside ${supplier.name}'s fulfilment regions for ${sourceProduct ? sourceProduct.productType.split(",")[0].trim() : product.name}.`
            : null,
      },
      refunds:
        plan.status === "cancelled"
          ? [{ id: id("ref"), amount: total, reason: "Shopper cancelled before production", at: iso(plan.daysAgo, 15), actor: "Inés Duarte" }]
          : [],
      events,
      idempotencyKey: null,
      createdAt: iso(plan.daysAgo, 9),
      updatedAt: iso(Math.max(0, plan.daysAgo - 5), 11),
    });

    auditLogs.push({
      id: id("aud"), category: "order_routing", action: routing === "submitted" ? "order.routed" : "order.manual_required",
      summary:
        routing === "submitted"
          ? `Routed ${code} to ${supplier.name}`
          : `${code} flagged for manual supplier handling`,
      storeId: plan.store, agencyId: store.agencyId, actorId: "system", actorName: "Parcelith routing",
      entity: "order", entityId: code, meta: { supplier: supplier.name, region }, at: iso(plan.daysAgo, 10),
    });
  }

  /* ----------------------------------------------------------- suggestions */

  const suggestions = [
    {
      id: id("sug"), storeId: "str_northwind", productId: null, kind: "product_idea",
      title: "Northwind Organic Tee", rationale: "EU orders are 31% of volume and Gelato produces inside the destination market, which removes the duty complaints logged in March.",
      payload: { catalogId: "cat_tee_organic", name: "Northwind Organic Tee", description: "GOTS-certified organic cotton, produced inside the destination market.", tags: ["tee", "organic", "gots"], suggestedPriceMajor: 36 },
      status: "applied", createdBy: "Sam Okafor", createdAt: iso(6), decidedBy: "Sam Okafor", decidedAt: iso(5),
    },
    {
      id: id("sug"), storeId: "str_lumen", productId: null, kind: "product_idea",
      title: "Lumen Enamel Tumbler", rationale: "Drinkware is the studio's best-selling category and a second format would lift average order value without new artwork.",
      payload: { catalogId: "cat_mug_classic", name: "Lumen Enamel Tumbler", description: "A second drinkware format using the existing wrap artwork.", tags: ["drinkware", "tumbler"], suggestedPriceMajor: 27 },
      status: "pending", createdBy: "Sam Okafor", createdAt: iso(2), decidedBy: null, decidedAt: null,
    },
  ];

  auditLogs.push(
    { id: id("aud"), category: "ai", action: "ai.suggestion_applied", summary: "Applied AI product suggestion “Northwind Organic Tee” after review", storeId: "str_northwind", agencyId: "agc_northlight", actorId: "usr_sam", actorName: "Sam Okafor", entity: "ai_suggestion", entityId: "product_idea", meta: { kind: "product_idea" }, at: iso(5) },
    { id: id("aud"), category: "store_setup", action: "store.created", summary: "Created store “Northwind Supply Co” for Northwind Technologies", storeId: "str_northwind", agencyId: "agc_northlight", actorId: "usr_alex", actorName: "Alex Moreau", entity: "store", entityId: "str_northwind", meta: {}, at: iso(100) },
    { id: id("aud"), category: "store_setup", action: "store.stripe_connected", summary: "Connected Stripe account acct_1NwSupplyCo (US)", storeId: "str_northwind", agencyId: "agc_northlight", actorId: "usr_alex", actorName: "Alex Moreau", entity: "store", entityId: "str_northwind", meta: { country: "US" }, at: iso(96) },
    { id: id("aud"), category: "store_setup", action: "store.domain_verified", summary: "Verified custom domain shop.northwind.example", storeId: "str_northwind", agencyId: "agc_northlight", actorId: "usr_alex", actorName: "Alex Moreau", entity: "store", entityId: "str_northwind", meta: {}, at: iso(94) },
    { id: id("aud"), category: "team", action: "team.invited", summary: "Invited sam@northlight.studio as catalog manager", storeId: "str_northwind", agencyId: "agc_northlight", actorId: "usr_alex", actorName: "Alex Moreau", entity: "membership", entityId: "sam@northlight.studio", meta: { role: "catalog_manager" }, at: iso(99) },
    { id: id("aud"), category: "pricing", action: "product.price_changed", summary: "Raised “Northwind Ridge Hoodie” from $59.00 to $64.00", storeId: "str_northwind", agencyId: "agc_northlight", actorId: "usr_sam", actorName: "Sam Okafor", entity: "store_product", entityId: "northwind-ridge-hoodie", meta: { from: 5900, to: 6400 }, at: iso(30) },
    { id: id("aud"), category: "publishing", action: "storefront.published", summary: "Published storefront layout “Autumn range”", storeId: "str_northwind", agencyId: "agc_northlight", actorId: "usr_alex", actorName: "Alex Moreau", entity: "storefront", entityId: "str_northwind", meta: { sections: 7 }, at: iso(12) },
    { id: id("aud"), category: "store_setup", action: "store.created", summary: "Created store “Lumen Studio Shop” for Lumen Creative", storeId: "str_lumen", agencyId: "agc_northlight", actorId: "usr_alex", actorName: "Alex Moreau", entity: "store", entityId: "str_lumen", meta: {}, at: iso(60) },
    { id: id("aud"), category: "store_setup", action: "store.created", summary: "Created store “Ferro Coffee Club” for Ferro Kaffeerösterei", storeId: "str_ferro", agencyId: "agc_northlight", actorId: "usr_alex", actorName: "Alex Moreau", entity: "store", entityId: "str_ferro", meta: {}, at: iso(9) },
    { id: id("aud"), category: "store_setup", action: "store.language_changed", summary: "Set the storefront language of “Ferro Coffee Club” to German", storeId: "str_ferro", agencyId: "agc_northlight", actorId: "usr_alex", actorName: "Alex Moreau", entity: "store", entityId: "str_ferro", meta: { language: "de" }, at: iso(9) },
    { id: id("aud"), category: "store_setup", action: "store.stripe_connected", summary: "Connected Stripe account acct_1FerroKaffee (DE)", storeId: "str_ferro", agencyId: "agc_northlight", actorId: "usr_alex", actorName: "Alex Moreau", entity: "store", entityId: "str_ferro", meta: { country: "DE" }, at: iso(8) },
    { id: id("aud"), category: "publishing", action: "storefront.published", summary: "Published storefront layout “Eröffnung”", storeId: "str_ferro", agencyId: "agc_northlight", actorId: "usr_sam", actorName: "Sam Okafor", entity: "storefront", entityId: "str_ferro", meta: { sections: 7 }, at: iso(7) },
    { id: id("aud"), category: "administration", action: "store.archived", summary: "Archived store “Halcyon Events Store” after the event series closed", storeId: "str_halcyon", agencyId: "agc_northlight", actorId: "usr_alex", actorName: "Alex Moreau", entity: "store", entityId: "str_halcyon", meta: {}, at: iso(21) },
    { id: id("aud"), category: "administration", action: "tax.bracket_created", summary: "Created global tax bracket “Australia GST” at 10%", storeId: null, agencyId: null, actorId: "usr_priya", actorName: "Priya Raman", entity: "tax_bracket", entityId: "tax_au10", meta: { rate: 10 }, at: iso(198) },
    { id: id("aud"), category: "administration", action: "supplier.pending", summary: "Added Gooten for commercial review before release to stores", storeId: null, agencyId: null, actorId: "usr_priya", actorName: "Priya Raman", entity: "supplier", entityId: "sup_gooten", meta: {}, at: iso(35) },
    { id: id("aud"), category: "administration", action: "catalog.product_added", summary: "Added “Matte Black 15oz Mug” to the shared supplier catalog", storeId: null, agencyId: null, actorId: "usr_priya", actorName: "Priya Raman", entity: "catalog_product", entityId: "cat_mug_matte", meta: { supplier: "Printify" }, at: iso(120) },
  );

  console.log("writing documents…");
  await insertMany("agencies", agencies);
  await insertMany("users", users);
  await insertMany("suppliers", suppliers);
  await insertMany("tax_brackets", taxBrackets);
  await insertMany("catalog_products", catalog);
  await insertMany("stores", stores);
  await insertMany("memberships", memberships);
  await insertMany("store_products", storeProducts);
  await insertMany("storefronts", storefronts);
  await insertMany("orders", orders);
  await insertMany("ai_suggestions", suggestions);
  await insertMany("audit_logs", auditLogs);

  // The gifting demo reads the store and its published products back out of the
  // database, so it runs once everything above has been written.
  await seedGifting(KEY);

  console.log(
    `done — ${stores.length} stores, ${storeProducts.length} store products, ${orders.length} orders, ${auditLogs.length} audit entries`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
