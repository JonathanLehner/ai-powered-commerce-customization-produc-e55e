/**
 * Seeds the demo stores' collections: Apparel, Drinkware and New hires on
 * Northwind, and a matching set on Lumen, Ferro and Rivet, with their
 * translations, header images and a link to each in the storefront header.
 *
 * It reads the stores and products back out of the database by slug rather than
 * hard-coding ids, so it can run after `scripts/seed.mjs` or against a database
 * that is already live. It is additive and idempotent: a collection whose
 * handle the store already has is left alone, a product the store does not
 * hold is skipped, and the header links are only set on a storefront that has
 * never had any.
 *
 * Run: node --env-file=.env.local scripts/seed-collections.mjs
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { openDatabase } from "./mongo.mjs";
import { storedTranslations } from "./store-content.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const IMAGES = JSON.parse(await readFile(path.join(HERE, "image-manifest.json"), "utf8"));

/**
 * Per store, in display order. `name` and `description` are in the store's
 * default language; `i18n` holds the other enabled languages. `nav` puts the
 * collection in the storefront header.
 */
export const COLLECTION_CONTENT = [
  {
    storeId: "str_northwind",
    collections: [
      {
        handle: "apparel",
        name: "Apparel",
        description: "Tees and hoodies in Northwind colours, printed to order in sizes S to 2XL.",
        image: "collection-northwind-apparel",
        products: ["northwind-field-tee", "northwind-organic-tee", "northwind-ridge-hoodie"],
        nav: true,
        i18n: {
          de: {
            name: "Bekleidung",
            description: "T-Shirts und Hoodies in den Northwind-Farben, auf Bestellung bedruckt, in den Größen S bis 2XL.",
          },
        },
      },
      {
        handle: "drinkware",
        name: "Drinkware",
        description: "Ceramic mugs for the desk and the kitchen. Dishwasher and microwave safe.",
        image: "collection-northwind-drinkware",
        products: ["northwind-desk-mug"],
        nav: true,
        i18n: {
          de: {
            name: "Tassen",
            description: "Keramiktassen für Schreibtisch und Teeküche. Spülmaschinen- und mikrowellengeeignet.",
          },
        },
      },
      {
        handle: "new-hires",
        name: "New hires",
        description: "Everything for a first week at Northwind: a tee, a hoodie and a desk mug.",
        image: "collection-northwind-new-hires",
        products: ["northwind-ridge-hoodie", "northwind-field-tee", "northwind-desk-mug"],
        nav: true,
        i18n: {
          de: {
            name: "Neu im Team",
            description: "Alles für die erste Woche bei Northwind: ein T-Shirt, ein Hoodie und eine Tasse.",
          },
        },
      },
    ],
  },
  {
    storeId: "str_lumen",
    collections: [
      {
        handle: "studio-essentials",
        name: "Studio essentials",
        description: "The pieces we reach for every day in the studio.",
        image: "collection-lumen-essentials",
        products: ["lumen-studio-tee", "lumen-matte-mug"],
        nav: true,
        i18n: {
          fr: { name: "Les essentiels du studio", description: "Les pièces que nous utilisons chaque jour au studio." },
        },
      },
      {
        handle: "apparel",
        name: "Apparel",
        description: "Soft cotton tees and hoodies, printed to order.",
        image: "collection-lumen-apparel",
        products: ["lumen-studio-tee", "lumen-eco-hoodie"],
        nav: false,
        i18n: {
          fr: { name: "Vêtements", description: "Tee-shirts et sweats en coton doux, imprimés à la commande." },
        },
      },
    ],
  },
  {
    storeId: "str_ferro",
    collections: [
      {
        handle: "tassen-und-becher",
        name: "Tassen und Becher",
        description: "Keramik für den Espresso am Morgen und den Filterkaffee am Nachmittag.",
        image: "collection-ferro-mugs",
        products: ["ferro-roesterei-tasse", "ferro-filterbecher-matt"],
        nav: true,
        i18n: {
          en: { name: "Mugs and cups", description: "Ceramics for the morning espresso and the afternoon filter coffee." },
        },
      },
      {
        handle: "bekleidung",
        name: "Bekleidung",
        description: "Shirts und Hoodies aus der Rösterei, auf Bestellung bedruckt.",
        image: "collection-ferro-apparel",
        products: ["ferro-clubshirt", "ferro-roestwerk-hoodie"],
        nav: true,
        i18n: {
          en: { name: "Apparel", description: "Shirts and hoodies from the roastery, printed to order." },
        },
      },
      {
        handle: "club-starterset",
        name: "Club-Starterset",
        description: "Für neue Mitglieder im Ferro Coffee Club: das Clubshirt und die Rösterei-Tasse.",
        image: "collection-ferro-starter",
        products: ["ferro-clubshirt", "ferro-roesterei-tasse"],
        nav: false,
        i18n: {
          en: {
            name: "Club starter set",
            description: "For new Ferro Coffee Club members: the club shirt and the roastery mug.",
          },
        },
      },
    ],
  },
  {
    storeId: "str_rivet",
    collections: [
      {
        handle: "team-apparel",
        name: "Team apparel",
        description: "Crew tees for the shop floor and the front desk.",
        image: "collection-rivet-apparel",
        products: ["rivet-crew-tee"],
        nav: true,
        i18n: {},
      },
    ],
  },
];

function newId(prefix) {
  return `${prefix}_${Math.random().toString(36).slice(2, 14).padEnd(12, "0")}`;
}

export async function seedCollections(call) {
  let created = 0;
  for (const entry of COLLECTION_CONTENT) {
    const store = await call({ collection: "stores", action: "findOne", filter: { id: entry.storeId } });
    if (!store) continue;
    const [products, existing] = await Promise.all([
      call({ collection: "store_products", action: "find", filter: { storeId: store.id } }),
      call({ collection: "product_collections", action: "find", filter: { storeId: store.id } }),
    ]);
    const bySlug = new Map(products.map((p) => [p.slug, p.id]));
    const handles = new Map(existing.map((c) => [c.handle, c.id]));
    const enabled = new Set([...(store.languages ?? []), store.defaultLanguage]);
    let position = existing.reduce((max, c) => Math.max(max, c.position ?? 0), -1) + 1;
    const now = new Date().toISOString();

    const fresh = [];
    for (const item of entry.collections) {
      if (handles.has(item.handle)) continue;
      const doc = {
        id: newId("col"),
        storeId: store.id,
        name: item.name,
        handle: item.handle,
        description: item.description,
        imageUrl: IMAGES[item.image] ?? null,
        productIds: item.products.flatMap((slug) => (bySlug.has(slug) ? [bySlug.get(slug)] : [])),
        position: position++,
        // Only the languages the store has switched on.
        translations: storedTranslations(Object.fromEntries(Object.entries(item.i18n).filter(([code]) => enabled.has(code)))),
        submissionKey: null,
        createdAt: now,
        updatedAt: now,
      };
      fresh.push(doc);
      handles.set(item.handle, doc.id);
    }
    if (fresh.length > 0) {
      await call({ collection: "product_collections", action: "insertMany", documents: fresh });
      created += fresh.length;
    }

    // The header links, on a storefront that has never had any.
    const nav = entry.collections.filter((c) => c.nav).map((c) => handles.get(c.handle)).filter(Boolean);
    const storefront = await call({ collection: "storefronts", action: "findOne", filter: { storeId: store.id } });
    if (storefront && nav.length > 0) {
      const set = {};
      for (const key of ["draft", "published"]) {
        const root = storefront[key]?.ROOT;
        if (root && !("navCollections" in (root.props ?? {}))) set[`${key}.ROOT.props.navCollections`] = nav;
      }
      if (Object.keys(set).length > 0) {
        await call({ collection: "storefronts", action: "updateOne", filter: { storeId: store.id }, update: { $set: set } });
      }
    }
  }
  console.log(`collections seed done — ${created} collections created`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  // Additive only, so unlike the full seed it may run against a live database.
  const { client, dbCall } = await openDatabase();
  await seedCollections(dbCall);
  await client.close();
}
