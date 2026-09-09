/**
 * The bulk-sourcing listings in the shared catalog.
 *
 * These belong to Alibaba.com, which quotes per enquiry rather than publishing
 * a unit price: `baseCost`, the per-variant costs, the customisation cost and
 * the shipping estimate are all zero, and `bulkSourcing` carries the minimum
 * order quantity and the indicative band instead. A store asks for a quote, and
 * the quoted cost is what the listing is copied in at.
 *
 * Both `seed.mjs` (a full rebuild) and `seed-bulk-sourcing.mjs` (an upsert onto
 * a live database) read this list, so the two can never drift apart.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";

const IMAGES = JSON.parse(
  await readFile(path.join(process.cwd(), "scripts", "image-manifest.json"), "utf8"),
);

const DAY = 86400000;
const iso = (daysAgo) => new Date(Date.now() - daysAgo * DAY).toISOString();

const REGIONS = [
  "North America",
  "European Union",
  "United Kingdom",
  "LATAM",
  "APAC",
  "Middle East",
  "Africa",
  "Oceania",
];

const APPAREL_FILE_REQS = {
  formats: ["PNG", "SVG", "PDF", "AI"],
  maxFileMb: 40,
  minDpi: 300,
  transparentBackgroundRequired: true,
  maxPixels: 60_000_000,
};
const MUG_FILE_REQS = {
  formats: ["PNG", "PDF", "AI"],
  maxFileMb: 25,
  minDpi: 300,
  transparentBackgroundRequired: false,
  maxPixels: 40_000_000,
};

const TEE_AREAS = [
  { id: "pa_bulktee_front", name: "Front chest", view: "front", widthMm: 300, heightMm: 400, minDpi: 300, rect: { x: 0.33, y: 0.29, w: 0.34, h: 0.34 } },
  { id: "pa_bulktee_back", name: "Back", view: "back", widthMm: 300, heightMm: 420, minDpi: 300, rect: { x: 0.33, y: 0.27, w: 0.34, h: 0.38 } },
];
const HOODIE_AREAS = [
  { id: "pa_bulkhood_front", name: "Left chest embroidery", view: "front", widthMm: 120, heightMm: 120, minDpi: 300, rect: { x: 0.38, y: 0.34, w: 0.16, h: 0.14 } },
  { id: "pa_bulkhood_back", name: "Back", view: "back", widthMm: 320, heightMm: 380, minDpi: 300, rect: { x: 0.33, y: 0.3, w: 0.34, h: 0.34 } },
];
const MUG_AREAS = [
  { id: "pa_bulkmug_left", name: "Left wrap", view: "left", widthMm: 210, heightMm: 90, minDpi: 300, rect: { x: 0.3, y: 0.36, w: 0.33, h: 0.3 } },
  { id: "pa_bulkmug_right", name: "Right wrap", view: "right", widthMm: 210, heightMm: 90, minDpi: 300, rect: { x: 0.37, y: 0.36, w: 0.33, h: 0.3 } },
];

const SIZES = ["S", "M", "L", "XL", "2XL"];

/** Colour and size options with no cost of their own — the run is quoted whole. */
function quotedVariants(prefix, colours) {
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
        baseCost: 0,
        availability: "in_stock",
      });
    }
  }
  return out;
}

const WHITE = { name: "White", code: "WHT", hex: "#ffffff" };
const BLACK = { name: "Black", code: "BLK", hex: "#111111" };
const NAVY = { name: "Navy", code: "NVY", hex: "#1e2a4a" };
const HEATHER = { name: "Heather grey", code: "HGR", hex: "#b8bcc2" };

export const BULK_SOURCING_PRODUCTS = [
  {
    id: "cat_bulk_tee",
    supplierId: "sup_alibaba",
    name: "Bulk Cut & Sew Tee",
    category: "apparel",
    productType: "T-shirt, 200 gsm combed cotton, made to order",
    description:
      "A made-to-order tee cut to your own spec: fabric weight, collar rib, side seams, woven neck label and polybagging are all chosen per run. Screen printing is costed per colour rather than per print area, which is why a factory prices the run rather than the unit.",
    currency: "USD",
    baseCost: 0,
    customizationCostPerArea: 0,
    shippingEstimate: 0,
    variants: quotedVariants("bulktee", [WHITE, BLACK]),
    printAreas: TEE_AREAS,
    mockups: [
      { view: "front", colour: "White", url: IMAGES["tshirt-white-front"] },
      { view: "back", colour: "White", url: IMAGES["tshirt-white-back"] },
      { view: "front", colour: "Black", url: IMAGES["tshirt-black-front"] },
      { view: "back", colour: "Black", url: IMAGES["tshirt-black-back"] },
    ],
    fileRequirements: APPAREL_FILE_REQS,
    fulfillmentRegions: REGIONS,
    leadTimeDays: [25, 45],
    availability: "available",
    status: "active",
    bulkSourcing: {
      minimumOrderQuantity: 500,
      indicativeUnitCost: [310, 520],
      responseDays: [2, 5],
      quoteNotes:
        "Sampling is quoted separately and usually takes two weeks. Prices are ex-works unless you ask for delivered duty paid, and the run is paid through Trade Assurance against a purchase order you raise.",
    },
    createdAt: iso(96),
  },
  {
    id: "cat_bulk_hoodie",
    supplierId: "sup_alibaba",
    name: "Bulk Embroidered Hoodie",
    category: "apparel",
    productType: "Hoodie, 400 gsm brushed fleece, made to order",
    description:
      "Heavyweight fleece with your own drawcord, tipping and metal eyelets, decorated with flat or 3D puff embroidery. Digitising the logo is a one-off charge, so the cost per unit falls sharply as the run grows.",
    currency: "USD",
    baseCost: 0,
    customizationCostPerArea: 0,
    shippingEstimate: 0,
    variants: quotedVariants("bulkhood", [NAVY, HEATHER]),
    printAreas: HOODIE_AREAS,
    mockups: [
      { view: "front", colour: "Navy", url: IMAGES["hoodie-navy-front"] },
      { view: "back", colour: "Navy", url: IMAGES["hoodie-navy-back"] },
      { view: "front", colour: "Heather grey", url: IMAGES["hoodie-heather-front"] },
      { view: "back", colour: "Heather grey", url: IMAGES["hoodie-heather-back"] },
    ],
    fileRequirements: APPAREL_FILE_REQS,
    fulfillmentRegions: REGIONS,
    leadTimeDays: [30, 55],
    availability: "available",
    status: "active",
    bulkSourcing: {
      minimumOrderQuantity: 300,
      indicativeUnitCost: [780, 1290],
      responseDays: [3, 7],
      quoteNotes:
        "Embroidery digitising is charged once per logo. Ask for a pre-production sample before the run is released — colour matching on dyed fleece varies between dye lots.",
    },
    createdAt: iso(92),
  },
  {
    id: "cat_bulk_mug",
    supplierId: "sup_alibaba",
    name: "Bulk Ceramic Mug, Gift Boxed",
    category: "drinkware",
    productType: "Mug, 12oz ceramic with printed gift box",
    description:
      "A stoneware mug with your own glaze colour, shape and printed gift box, decal-printed rather than sublimated so the artwork survives commercial dishwashers. Freight is the deciding cost on drinkware, so the quote covers the carton plan as well as the goods.",
    currency: "USD",
    baseCost: 0,
    customizationCostPerArea: 0,
    shippingEstimate: 0,
    variants: [
      { id: "bulkmug-wht", name: "White / 12oz", colour: "White", colourHex: "#ffffff", size: "12oz", sku: "BULKMUG-WHT", baseCost: 0, availability: "in_stock" },
      { id: "bulkmug-blk", name: "Black / 12oz", colour: "Black", colourHex: "#111111", size: "12oz", sku: "BULKMUG-BLK", baseCost: 0, availability: "in_stock" },
    ],
    printAreas: MUG_AREAS,
    mockups: [
      { view: "left", colour: "White", url: IMAGES["mug-white-left"] },
      { view: "right", colour: "White", url: IMAGES["mug-white-right"] },
      { view: "left", colour: "Black", url: IMAGES["mug-black-left"] },
      { view: "right", colour: "Black", url: IMAGES["mug-black-right"] },
    ],
    fileRequirements: MUG_FILE_REQS,
    fulfillmentRegions: REGIONS,
    leadTimeDays: [28, 50],
    availability: "available",
    status: "active",
    bulkSourcing: {
      minimumOrderQuantity: 1000,
      indicativeUnitCost: [120, 260],
      responseDays: [2, 6],
      quoteNotes:
        "Quote the gift box with the mug: printed cartons carry their own tooling cost and drive the freight volume. Sea freight adds four to six weeks on top of production.",
    },
    createdAt: iso(88),
  },
];
