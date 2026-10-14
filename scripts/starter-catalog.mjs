/**
 * The shared-catalog products added for the store templates: totes, caps,
 * beanies, posters, stickers, scarves, kit shirts and enamel mugs, alongside
 * the tees, hoodies and mugs `seed.mjs` has always written.
 *
 * Their mockups are the blank photographs in `blank-photos.json`, the same
 * ones the template product shots are composited on, and each print area's
 * rectangle sits inside the product on every colour's photograph.
 *
 * Both `seed.mjs` (a full rebuild) and `seed-starter-catalog.mjs` (an insert
 * onto a live database) read this list, so the two can never drift apart.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";

const PHOTOS = JSON.parse(await readFile(path.join(process.cwd(), "scripts", "blank-photos.json"), "utf8"));

const DAY = 86400000;
const iso = (daysAgo) => new Date(Date.now() - daysAgo * DAY).toISOString();

const WHITE = { name: "White", code: "WHT", hex: "#ffffff" };
const BLACK = { name: "Black", code: "BLK", hex: "#111111" };
const NAVY = { name: "Navy", code: "NVY", hex: "#1e2a4a" };
const HEATHER = { name: "Heather grey", code: "HGR", hex: "#b8bcc2" };
const NATURAL = { name: "Natural", code: "NAT", hex: "#e8dcc4" };
const RED = { name: "Red", code: "RED", hex: "#c8102e" };
const GREEN = { name: "Forest green", code: "FGR", hex: "#1f4d32" };

const ALL_REGIONS = ["North America", "European Union", "United Kingdom", "LATAM", "APAC", "Middle East", "Africa", "Oceania"];

const ACCESSORY_FILE_REQS = {
  formats: ["PNG", "SVG", "PDF"],
  maxFileMb: 25,
  minDpi: 150,
  transparentBackgroundRequired: true,
  maxPixels: 40_000_000,
};
const PRINT_FILE_REQS = {
  formats: ["PNG", "JPG", "PDF"],
  maxFileMb: 50,
  minDpi: 150,
  transparentBackgroundRequired: false,
  maxPixels: 80_000_000,
};
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

/** One variant per colour and size, `extra` added to the cost of the sizes it names. */
function variants(prefix, colours, sizes, baseCost, extra = {}) {
  return colours.flatMap((colour) =>
    sizes.map((size) => ({
      id: `${prefix}-${colour.code}-${size.replace(/\W+/g, "")}`.toLowerCase(),
      name: sizes.length > 1 ? `${colour.name} / ${size}` : colour.name,
      colour: colour.name,
      colourHex: colour.hex,
      size,
      sku: `${prefix.toUpperCase()}-${colour.code}-${size.replace(/\W+/g, "").toUpperCase()}`,
      baseCost: baseCost + (extra[size] ?? 0),
      availability: "in_stock",
    })),
  );
}

/** The blank photographs of `family` as front mockups, one per colour. */
function mockups(family, colours) {
  return colours.map((colour) => {
    const url = PHOTOS[family]?.[colour.name]?.[0]?.url;
    if (!url) throw new Error(`blank-photos.json has no ${colour.name} ${family}`);
    return { view: "front", colour: colour.name, url };
  });
}

const APPAREL_SIZES = ["S", "M", "L", "XL", "2XL"];

export const STARTER_CATALOG_PRODUCTS = [
  {
    id: "cat_tote_canvas",
    supplierId: "sup_printful",
    name: "Organic Canvas Tote",
    category: "accessories",
    productType: "Tote bag, 340 gsm organic canvas",
    description:
      "A heavy organic cotton canvas tote with 70 cm handles, long enough to carry on the shoulder. Printed direct-to-garment across the front panel.",
    currency: "USD",
    baseCost: 890,
    customizationCostPerArea: 280,
    shippingEstimate: 450,
    variants: variants("tote", [NATURAL, BLACK], ["One size"], 890),
    printAreas: [
      { id: "pa_tote_front", name: "Front", view: "front", widthMm: 300, heightMm: 275, minDpi: 150, rect: { x: 0.32, y: 0.5, w: 0.36, h: 0.33 } },
    ],
    mockups: mockups("tote", [NATURAL, BLACK]),
    fileRequirements: ACCESSORY_FILE_REQS,
    fulfillmentRegions: ["North America", "European Union", "United Kingdom", "LATAM", "APAC", "Oceania"],
    leadTimeDays: [2, 5],
    availability: "available",
    status: "active",
    createdAt: iso(40),
  },
  {
    id: "cat_cap_twill",
    supplierId: "sup_printful",
    name: "Embroidered Twill Cap",
    category: "accessories",
    productType: "Cap, six-panel cotton twill",
    description:
      "An unstructured six-panel cap in washed cotton twill with a curved brim and an adjustable strap. The front panel is embroidered, so artwork is converted to thread colours.",
    currency: "USD",
    baseCost: 1150,
    customizationCostPerArea: 450,
    shippingEstimate: 450,
    variants: variants("cap", [BLACK, NAVY, NATURAL], ["One size"], 1150),
    printAreas: [
      { id: "pa_cap_front", name: "Front panel", view: "front", widthMm: 100, heightMm: 70, minDpi: 150, rect: { x: 0.38, y: 0.36, w: 0.24, h: 0.17 } },
    ],
    mockups: mockups("cap", [BLACK, NAVY, NATURAL]),
    fileRequirements: ACCESSORY_FILE_REQS,
    fulfillmentRegions: ["North America", "European Union", "United Kingdom", "APAC", "Oceania"],
    leadTimeDays: [3, 7],
    availability: "available",
    status: "active",
    createdAt: iso(40),
  },
  {
    id: "cat_beanie_cuffed",
    supplierId: "sup_printful",
    name: "Cuffed Rib Beanie",
    category: "accessories",
    productType: "Beanie, cuffed rib knit",
    description:
      "A soft rib-knit beanie with a deep turn-up cuff. The design is embroidered on the cuff, centred at the front.",
    currency: "USD",
    baseCost: 980,
    customizationCostPerArea: 420,
    shippingEstimate: 450,
    variants: variants("beanie", [BLACK, NAVY, HEATHER], ["One size"], 980),
    printAreas: [
      { id: "pa_beanie_cuff", name: "Cuff", view: "front", widthMm: 100, heightMm: 75, minDpi: 150, rect: { x: 0.38, y: 0.59, w: 0.24, h: 0.18 } },
    ],
    mockups: mockups("beanie", [BLACK, NAVY, HEATHER]),
    fileRequirements: ACCESSORY_FILE_REQS,
    fulfillmentRegions: ["North America", "European Union", "United Kingdom", "APAC", "Oceania"],
    leadTimeDays: [3, 7],
    availability: "available",
    status: "active",
    createdAt: iso(40),
  },
  {
    id: "cat_poster_matte",
    supplierId: "sup_gelato",
    name: "Matte Art Print",
    category: "prints",
    productType: "Poster, 200 gsm matte paper",
    description:
      "Museum-grade 200 gsm matte paper printed edge to edge and shipped rolled in a tube. Produced in the destination market, so posters arrive flat and fast.",
    currency: "USD",
    baseCost: 790,
    customizationCostPerArea: 0,
    shippingEstimate: 520,
    variants: variants("poster", [WHITE], ["A3", "A2"], 790, { A2: 500 }),
    printAreas: [
      { id: "pa_poster_sheet", name: "Full sheet", view: "front", widthMm: 297, heightMm: 420, minDpi: 150, rect: { x: 0.302, y: 0.165, w: 0.405, h: 0.557 } },
    ],
    mockups: mockups("poster", [WHITE]),
    fileRequirements: PRINT_FILE_REQS,
    fulfillmentRegions: ALL_REGIONS,
    leadTimeDays: [2, 4],
    availability: "available",
    status: "active",
    createdAt: iso(40),
  },
  {
    id: "cat_sticker_diecut",
    supplierId: "sup_printify",
    name: "Die-cut Vinyl Sticker",
    category: "prints",
    productType: "Sticker, die-cut matte vinyl",
    description:
      "Waterproof matte vinyl cut to the outline of the design with a narrow white border. Survives a dishwasher, a laptop bag and a water bottle.",
    currency: "USD",
    baseCost: 190,
    customizationCostPerArea: 60,
    shippingEstimate: 150,
    variants: variants("sticker", [WHITE], ["100 mm"], 190),
    printAreas: [
      { id: "pa_sticker", name: "Sticker", view: "front", widthMm: 100, heightMm: 93, minDpi: 150, rect: { x: 0.36, y: 0.36, w: 0.3, h: 0.28 } },
    ],
    mockups: mockups("sticker", [WHITE]),
    fileRequirements: PRINT_FILE_REQS,
    fulfillmentRegions: ["North America", "European Union", "United Kingdom", "APAC", "Oceania"],
    leadTimeDays: [2, 5],
    availability: "available",
    status: "active",
    createdAt: iso(40),
  },
  {
    id: "cat_scarf_knit",
    supplierId: "sup_printify",
    name: "Jacquard Knit Scarf",
    category: "accessories",
    productType: "Scarf, double-knit jacquard",
    description:
      "A supporters' scarf knitted double-sided, so the design reads from both faces, with tasselled ends. 140 by 18 cm.",
    currency: "USD",
    baseCost: 1450,
    customizationCostPerArea: 400,
    shippingEstimate: 520,
    variants: variants("scarf", [NAVY, RED, GREEN], ["One size"], 1450),
    printAreas: [
      { id: "pa_scarf_panel", name: "Panel", view: "front", widthMm: 600, heightMm: 170, minDpi: 150, rect: { x: 0.2, y: 0.42, w: 0.6, h: 0.17 } },
    ],
    mockups: mockups("scarf", [NAVY, RED, GREEN]),
    fileRequirements: ACCESSORY_FILE_REQS,
    fulfillmentRegions: ["North America", "European Union", "United Kingdom", "APAC"],
    leadTimeDays: [4, 9],
    availability: "available",
    status: "active",
    createdAt: iso(40),
  },
  {
    id: "cat_jersey_sport",
    supplierId: "sup_gelato",
    name: "Sublimated Football Shirt",
    category: "apparel",
    productType: "Football shirt, 140 gsm recycled polyester",
    description:
      "A breathable kit shirt in recycled polyester with contrast trim. The crest is sublimated into the fabric, so it never cracks or peels.",
    currency: "USD",
    baseCost: 1890,
    customizationCostPerArea: 350,
    shippingEstimate: 520,
    variants: variants("jersey", [NAVY, RED, GREEN, WHITE], APPAREL_SIZES, 1890, { "2XL": 200 }),
    printAreas: [
      { id: "pa_jersey_front", name: "Front", view: "front", widthMm: 300, heightMm: 300, minDpi: 150, rect: { x: 0.33, y: 0.33, w: 0.34, h: 0.34 } },
    ],
    mockups: mockups("jersey", [NAVY, RED, GREEN, WHITE]),
    fileRequirements: APPAREL_FILE_REQS,
    fulfillmentRegions: ["North America", "European Union", "United Kingdom", "APAC", "Oceania"],
    leadTimeDays: [3, 7],
    availability: "available",
    status: "active",
    createdAt: iso(40),
  },
  {
    id: "cat_mug_enamel",
    supplierId: "sup_gelato",
    name: "Enamel Camp Mug",
    category: "drinkware",
    productType: "Mug, 12oz enamel steel",
    description:
      "A white enamel-coated steel mug with a navy rolled rim. Light enough for a pack, and it will not shatter if dropped.",
    currency: "USD",
    baseCost: 790,
    customizationCostPerArea: 210,
    shippingEstimate: 520,
    variants: variants("enamel", [WHITE], ["12oz"], 790),
    printAreas: [
      { id: "pa_enamel_side", name: "Side", view: "front", widthMm: 120, heightMm: 120, minDpi: 300, rect: { x: 0.35, y: 0.42, w: 0.3, h: 0.3 } },
    ],
    mockups: mockups("enamelMug", [WHITE]),
    fileRequirements: MUG_FILE_REQS,
    fulfillmentRegions: ["North America", "European Union", "United Kingdom", "APAC", "Oceania"],
    leadTimeDays: [2, 5],
    availability: "available",
    status: "active",
    createdAt: iso(40),
  },
];
