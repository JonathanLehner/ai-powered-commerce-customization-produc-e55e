/**
 * The demo stores' own content: storefront sections, the announcement bar and
 * footer note, product names, descriptions, tags and personalisation labels,
 * and gift portal intros, with their translations.
 *
 * `seed.mjs` and `seed-gifting.mjs` build from it, and
 * `rewrite-store-content.mjs` writes it over the live records, so a fresh seed
 * and production read the same.
 *
 * Sections are listed in page order. Translations are plain strings here and
 * stored as `{ value }`, the shape `src/lib/translations.ts` reads.
 */

/** `{ de: { headline: "…" } }` to the stored `{ de: { headline: { value: "…" } } }`. */
export function storedTranslations(byLocale = {}) {
  return Object.fromEntries(
    Object.entries(byLocale).map(([locale, fields]) => [
      locale,
      Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, { value }])),
    ]),
  );
}

const NORTHWIND = {
  storeId: "str_northwind",
  slug: "northwind-supply",
  site: {
    announcement: "Orders ship within 5 business days",
    footerNote: "Official merchandise of Northwind Technologies.",
    i18n: {
      de: {
        announcement: "Versand innerhalb von 5 Werktagen",
        footerNote: "Offizielle Artikel von Northwind Technologies.",
      },
    },
  },
  sections: [
    {
      type: "PromoBanner",
      props: { text: "Free US shipping on orders over $75", ctaLabel: "Shop now" },
      i18n: { de: { text: "Kostenloser Versand innerhalb der USA ab 75 $", ctaLabel: "Jetzt einkaufen" } },
    },
    {
      // A seasonal hero above the main one. A page with a single hero gets the main copy.
      type: "HeroSection",
      optional: true,
      props: {
        eyebrow: "Winter 2026",
        headline: "The Ridge Hoodie is back",
        body: "Brushed fleece in navy, sizes S to 2XL.",
        ctaLabel: "Shop now",
      },
      i18n: {
        de: {
          eyebrow: "Winter 2026",
          headline: "Der Ridge Hoodie ist zurück",
          body: "Angerauter Fleece in Navy, Größen S bis 2XL.",
          ctaLabel: "Jetzt einkaufen",
        },
      },
    },
    {
      type: "HeroSection",
      props: {
        eyebrow: "Northwind Supply Co",
        headline: "Official Northwind apparel and mugs",
        body: "Tees, hoodies and mugs with the Northwind logo. Add a name to any piece.",
        ctaLabel: "Shop all",
      },
      i18n: {
        de: {
          eyebrow: "Northwind Supply Co",
          headline: "Offizielle Northwind-Kleidung und Tassen",
          body: "T-Shirts, Hoodies und Tassen mit dem Northwind-Logo. Jedes Stück auf Wunsch mit Namen.",
          ctaLabel: "Alle Produkte",
        },
      },
    },
    {
      type: "ValueProps",
      props: {
        title: "Good to know",
        itemOneTitle: "Ships in 5 business days",
        itemOneBody: "You get a tracking link by email when your order ships.",
        itemTwoTitle: "Unisex sizing",
        itemTwoBody: "S to 2XL, true to size. Size up for a looser fit.",
        itemThreeTitle: "Add a name",
        itemThreeBody: "Up to 18 characters on any tee, hoodie or mug.",
      },
      i18n: {
        de: {
          title: "Gut zu wissen",
          itemOneTitle: "Versand in 5 Werktagen",
          itemOneBody: "Den Link zur Sendungsverfolgung erhalten Sie per E-Mail, sobald Ihre Bestellung versendet wird.",
          itemTwoTitle: "Unisex-Größen",
          itemTwoBody: "S bis 2XL, normale Passform. Für einen lockeren Sitz eine Größe größer wählen.",
          itemThreeTitle: "Mit Namen",
          itemThreeBody: "Bis zu 18 Zeichen auf jedem T-Shirt, Hoodie und jeder Tasse.",
        },
      },
    },
    {
      type: "ProductGrid",
      props: { title: "Shop the range", subtitle: "" },
      i18n: { de: { title: "Sortiment" } },
    },
    {
      type: "ImageWithText",
      props: {
        heading: "Your name on it",
        body: "Enter a name or initials on the product page and check the preview before you buy. Up to 18 characters.",
      },
      i18n: {
        de: {
          heading: "Mit Ihrem Namen",
          body: "Geben Sie auf der Produktseite einen Namen oder Initialen ein und prüfen Sie die Vorschau vor dem Kauf. Bis zu 18 Zeichen.",
        },
      },
    },
    {
      type: "Testimonial",
      props: {
        quote: "We ordered 240 hoodies for onboarding week. Every one arrived before the first session.",
        author: "Dana Whitfield",
        role: "People Operations, Northwind Technologies",
      },
      i18n: {
        de: {
          quote: "Wir haben 240 Hoodies für die Onboarding-Woche bestellt. Alle waren vor dem ersten Termin da.",
          author: "Dana Whitfield",
          role: "People Operations, Northwind Technologies",
        },
      },
    },
    {
      type: "RichText",
      props: {
        heading: "Sizing and care",
        body: "Tees and hoodies are unisex and true to size. Machine wash cold, inside out, and hang dry. Mugs are dishwasher and microwave safe.",
      },
      i18n: {
        de: {
          heading: "Größen und Pflege",
          body: "T-Shirts und Hoodies sind unisex geschnitten und fallen normal aus. Auf links bei 30 °C waschen und an der Luft trocknen. Tassen sind spülmaschinen- und mikrowellengeeignet.",
        },
      },
    },
  ],
  products: {
    "northwind-field-tee": {
      name: "Northwind Field Tee",
      description:
        "Our everyday crew neck tee in soft ring-spun cotton, with the Northwind logo on the chest and a large print on the back. Unisex fit, true to size from S to 2XL.\n\nMaterial: 100% ring-spun cotton\nWeight: 180 gsm\nCare: Machine wash cold, inside out",
      tags: ["t-shirts"],
      textLabel: "Name on the sleeve",
      i18n: {
        de: {
          name: "Northwind Field T-Shirt",
          description:
            "Unser T-Shirt für jeden Tag aus weicher, ringgesponnener Baumwolle, mit Northwind-Logo auf der Brust und großem Druck auf dem Rücken. Unisex, normale Passform von S bis 2XL.\n\nMaterial: 100 % ringgesponnene Baumwolle\nGewicht: 180 g/m²\nPflege: Auf links bei 30 °C waschen",
          textLabel: "Name auf dem Ärmel",
          "colour:White": "Weiß",
          "colour:Black": "Schwarz",
          "tag:t-shirts": "T-Shirts",
        },
      },
    },
    "northwind-ridge-hoodie": {
      name: "Northwind Ridge Hoodie",
      description:
        "A heavyweight pullover hoodie in brushed fleece, with the Northwind logo on the chest. Double-layer hood, kangaroo pocket and ribbed cuffs. Unisex fit from S to 2XL.\n\nMaterial: 80% cotton, 20% polyester\nWeight: 320 gsm\nCare: Machine wash cold, inside out",
      tags: ["hoodies"],
      textLabel: "Name on the sleeve",
      i18n: {
        de: {
          name: "Northwind Ridge Hoodie",
          description:
            "Schwerer Hoodie aus angerautem Fleece, mit Northwind-Logo auf der Brust. Doppellagige Kapuze, Kängurutasche und gerippte Bündchen. Unisex von S bis 2XL.\n\nMaterial: 80 % Baumwolle, 20 % Polyester\nGewicht: 320 g/m²\nPflege: Auf links bei 30 °C waschen",
          textLabel: "Name auf dem Ärmel",
          "colour:Navy": "Navy",
          "tag:hoodies": "Hoodies",
        },
      },
    },
    "northwind-desk-mug": {
      name: "Northwind Desk Mug",
      description:
        "A glossy white ceramic mug with the Northwind logo printed on both sides. Holds a full 11 oz of coffee or tea.\n\nCapacity: 11 oz (325 ml)\nMaterial: Ceramic\nCare: Dishwasher and microwave safe",
      tags: ["mugs"],
      textLabel: "Name on the mug",
      i18n: {
        de: {
          name: "Northwind Tasse",
          description:
            "Glänzende weiße Keramiktasse mit dem Northwind-Logo auf beiden Seiten. Fasst 325 ml Kaffee oder Tee.\n\nInhalt: 325 ml\nMaterial: Keramik\nPflege: Spülmaschinen- und mikrowellengeeignet",
          textLabel: "Name auf der Tasse",
          "colour:White": "Weiß",
          "tag:mugs": "Tassen",
        },
      },
    },
    "northwind-organic-tee": {
      name: "Northwind Organic Tee",
      description:
        "A soft crew neck tee in certified organic cotton, with the Northwind logo on the chest. Unisex fit, true to size from S to 2XL.\n\nMaterial: 100% organic cotton, GOTS certified\nWeight: 180 gsm\nCare: Machine wash cold, inside out",
      tags: ["t-shirts", "organic"],
      textLabel: "Name on the sleeve",
      i18n: {
        de: {
          name: "Northwind Bio-T-Shirt",
          description:
            "Weiches T-Shirt aus zertifizierter Bio-Baumwolle, mit Northwind-Logo auf der Brust. Unisex, normale Passform von S bis 2XL.\n\nMaterial: 100 % Bio-Baumwolle, GOTS-zertifiziert\nGewicht: 180 g/m²\nPflege: Auf links bei 30 °C waschen",
          textLabel: "Name auf dem Ärmel",
          "colour:White": "Weiß",
          "colour:Black": "Schwarz",
          "tag:t-shirts": "T-Shirts",
          "tag:organic": "Bio",
        },
      },
    },
  },
  gifts: {
    "northwind-technologies-employee-gifting": {
      intro:
        "Choose a gift for each person on your list. Orders placed by the 20th ship the same month. For questions, contact Dana Whitfield in People Operations.",
      i18n: {
        de: {
          intro:
            "Wählen Sie für jede Person auf Ihrer Liste ein Geschenk aus. Bestellungen bis zum 20. werden im selben Monat versendet. Bei Fragen hilft Dana Whitfield aus dem Team People Operations.",
        },
      },
    },
  },
};

const LUMEN = {
  storeId: "str_lumen",
  slug: "lumen-studio",
  site: {
    announcement: "Orders ship within 5 working days",
    footerNote: "The studio shop of Lumen Creative.",
  },
  sections: [
    {
      type: "HeroSection",
      props: {
        eyebrow: "Lumen Creative",
        headline: "The Lumen studio shop",
        body: "Studio tees and mugs in black and magenta.",
        ctaLabel: "Shop now",
      },
    },
    {
      type: "ProductGrid",
      props: { title: "In the shop", subtitle: "" },
    },
    {
      type: "ValueProps",
      props: {
        title: "Good to know",
        itemOneTitle: "VAT included",
        itemOneBody: "Prices include VAT. No customs charges on EU deliveries.",
        itemTwoTitle: "Unisex sizing",
        itemTwoBody: "Tees run true to size, S to 2XL.",
        itemThreeTitle: "Add a name",
        itemThreeBody: "Up to 18 characters on the tee or the mug.",
      },
    },
    {
      type: "NewsletterSignup",
      props: {
        heading: "New in the shop",
        body: "We email when new pieces arrive, a few times a year.",
        buttonLabel: "Sign up",
      },
    },
  ],
  products: {
    "lumen-studio-tee": {
      name: "Lumen Studio Tee",
      description:
        "The Lumen house tee in black, with the studio logo printed in magenta on the chest. Unisex crew neck with a regular fit, sizes S to 2XL.\n\nMaterial: 100% ring-spun cotton\nWeight: 180 g/m²\nCare: Wash at 30°C, inside out",
      tags: ["t-shirts"],
      textLabel: "Name on the sleeve",
    },
    "lumen-matte-mug": {
      name: "Lumen Matte Mug",
      description:
        "A large matte black mug with the Lumen logo printed in white. The same mug goes into our client gift boxes.\n\nCapacity: 440 ml\nMaterial: Ceramic, matte glaze\nCare: Hand wash recommended",
      tags: ["mugs"],
      textLabel: "Name on the mug",
    },
    "lumen-eco-hoodie": {
      name: "Lumen Eco Hoodie",
      description:
        "A pullover hoodie in recycled cotton and polyester, with the Lumen logo on the chest. Unisex fit, sizes S to 2XL.\n\nMaterial: Recycled cotton and polyester\nWeight: 280 g/m²\nCare: Wash at 30°C, inside out",
      tags: ["hoodies"],
      textLabel: "Name on the sleeve",
    },
  },
  gifts: {},
};

const FERRO = {
  storeId: "str_ferro",
  slug: "ferro-coffee",
  // German is the store's language; English is offered beside it.
  languages: ["de", "en"],
  site: {
    announcement: "Versand innerhalb von 5 Werktagen",
    footerNote: "Ferro Kaffeerösterei, Berlin",
    i18n: {
      en: {
        announcement: "Orders ship within 5 working days",
        footerNote: "Ferro Kaffeerösterei, Berlin",
      },
    },
  },
  sections: [
    {
      type: "PromoBanner",
      props: { text: "Versandkostenfrei innerhalb Deutschlands ab 60 €", ctaLabel: "Zum Shop" },
      i18n: { en: { text: "Free shipping within Germany on orders over €60", ctaLabel: "Shop now" } },
    },
    {
      type: "HeroSection",
      props: {
        eyebrow: "Ferro Kaffeerösterei",
        headline: "Tassen und Shirts aus der Rösterei",
        body: "Alle Stücke mit dem Ferro-Logo, auf Wunsch mit Ihrem Namen.",
        ctaLabel: "Zum Sortiment",
      },
      i18n: {
        en: {
          eyebrow: "Ferro Kaffeerösterei",
          headline: "Mugs and shirts from the roastery",
          body: "Every piece carries the Ferro logo. Add your name if you like.",
          ctaLabel: "Shop now",
        },
      },
    },
    {
      type: "ValueProps",
      props: {
        title: "Gut zu wissen",
        itemOneTitle: "Versand mit DHL",
        itemOneBody: "Innerhalb Deutschlands meist in 2 Werktagen bei Ihnen.",
        itemTwoTitle: "Inklusive MwSt.",
        itemTwoBody: "Alle Preise enthalten 19 % Mehrwertsteuer.",
        itemThreeTitle: "Größen S bis 2XL",
        itemThreeBody: "Shirts und Hoodies sind unisex geschnitten und fallen normal aus.",
      },
      i18n: {
        en: {
          title: "Good to know",
          itemOneTitle: "Shipped with DHL",
          itemOneBody: "Usually 2 working days within Germany.",
          itemTwoTitle: "VAT included",
          itemTwoBody: "All prices include 19% VAT.",
          itemThreeTitle: "Sizes S to 2XL",
          itemThreeBody: "Shirts and hoodies are unisex and true to size.",
        },
      },
    },
    {
      type: "ProductGrid",
      props: { title: "Sortiment", subtitle: "Tassen ab 19 €, Kleidung ab 32 €." },
      i18n: { en: { title: "The range", subtitle: "Mugs from €19, clothing from €32." } },
    },
    {
      type: "ImageWithText",
      props: {
        heading: "Ihr Name auf der Tasse",
        body: "Geben Sie auf der Produktseite einen Namen mit bis zu 18 Zeichen ein. Die Vorschau zeigt Ihre Tasse vor dem Kauf.",
      },
      i18n: {
        en: {
          heading: "Your name on the mug",
          body: "Enter a name of up to 18 characters on the product page. The preview shows your mug before you buy.",
        },
      },
    },
    {
      type: "Testimonial",
      props: {
        quote: "Ich trinke jeden Morgen aus der Ferro-Tasse. Der Druck sieht nach vielen Spülgängen noch aus wie neu.",
        author: "Katharina Brandt",
        role: "Club-Mitglied, Hamburg",
      },
      i18n: {
        en: {
          quote: "I drink from my Ferro mug every morning. The print still looks new after countless dishwasher runs.",
          author: "Katharina Brandt",
          role: "Club member, Hamburg",
        },
      },
    },
    {
      type: "RichText",
      props: {
        heading: "Größen und Pflege",
        body: "Shirts und Hoodies sind unisex geschnitten und fallen normal aus. Auf links bei 30 °C waschen und nicht in den Trockner geben. Tassen sind spülmaschinen- und mikrowellengeeignet.",
      },
      i18n: {
        en: {
          heading: "Sizing and care",
          body: "Shirts and hoodies are unisex and true to size. Wash inside out at 30°C and do not tumble dry. Mugs are dishwasher and microwave safe.",
        },
      },
    },
  ],
  products: {
    "ferro-roesterei-tasse": {
      name: "Ferro Rösterei-Tasse",
      description:
        "Unsere Tasse aus dem Röstraum in weißer Keramik, mit dem Ferro-Logo auf beiden Seiten. Passt für einen großen Filterkaffee oder einen Cappuccino.\n\nInhalt: 330 ml\nMaterial: Keramik, glänzend\nPflege: Spülmaschinen- und mikrowellengeeignet",
      tags: ["Tassen"],
      textLabel: "Name auf der Tasse",
      i18n: {
        en: {
          name: "Ferro Roastery Mug",
          description:
            "Our roastery mug in white ceramic, with the Ferro logo on both sides. Sized for a large filter coffee or a cappuccino.\n\nCapacity: 330 ml\nMaterial: Glossy ceramic\nCare: Dishwasher and microwave safe",
          textLabel: "Name on the mug",
          "tag:Tassen": "mugs",
        },
      },
    },
    "ferro-clubshirt": {
      name: "Ferro Clubshirt",
      description:
        "Das Shirt des Ferro Coffee Club aus Baumwolle, vorn mit dem Ferro-Schriftzug. Unisex geschnitten und größengetreu von S bis 2XL.\n\nMaterial: 100 % ringgesponnene Baumwolle\nGewicht: 180 g/m²\nPflege: Auf links bei 30 °C waschen",
      tags: ["Shirts"],
      textLabel: "Name auf dem Ärmel",
      i18n: {
        en: {
          name: "Ferro Club Shirt",
          description:
            "The Ferro Coffee Club shirt in cotton, with the Ferro wordmark on the front. Unisex fit, true to size from S to 2XL.\n\nMaterial: 100% ring-spun cotton\nWeight: 180 g/m²\nCare: Wash inside out at 30°C",
          textLabel: "Name on the sleeve",
          "tag:Shirts": "shirts",
        },
      },
    },
    "ferro-roestwerk-hoodie": {
      name: "Ferro Röstwerk-Hoodie",
      description:
        "Warmer Hoodie aus angerautem Fleece, mit dem Ferro-Logo auf der Brust. Doppellagige Kapuze, Kängurutasche und gerippte Bündchen. Unisex von S bis 2XL.\n\nMaterial: 80 % Baumwolle, 20 % Polyester\nGewicht: 320 g/m²\nPflege: Auf links bei 30 °C waschen",
      tags: ["Hoodies"],
      textLabel: "Name auf dem Ärmel",
      i18n: {
        en: {
          name: "Ferro Roastery Hoodie",
          description:
            "A warm hoodie in brushed fleece, with the Ferro logo on the chest. Double-layer hood, kangaroo pocket and ribbed cuffs. Unisex from S to 2XL.\n\nMaterial: 80% cotton, 20% polyester\nWeight: 320 g/m²\nCare: Wash inside out at 30°C",
          textLabel: "Name on the sleeve",
          "tag:Hoodies": "hoodies",
        },
      },
    },
    "ferro-filterbecher-matt": {
      name: "Ferro Filterbecher matt",
      description:
        "Großer Becher in Mattschwarz mit dem Ferro-Logo in Weiß. Gemacht für die Filterkaffees aus unserer Rösterei.\n\nInhalt: 440 ml\nMaterial: Keramik, matt glasiert\nPflege: Handwäsche empfohlen",
      tags: ["Tassen"],
      textLabel: "Name auf dem Becher",
      i18n: {
        en: {
          name: "Ferro Matte Filter Mug",
          description:
            "A large matte black mug with the Ferro logo in white. Made for the filter coffees from our roastery.\n\nCapacity: 440 ml\nMaterial: Ceramic, matte glaze\nCare: Hand wash recommended",
          textLabel: "Name on the mug",
          "tag:Tassen": "mugs",
        },
      },
    },
  },
  gifts: {},
};

const RIVET = {
  storeId: "str_rivet",
  slug: "rivet-hardware",
  site: {
    announcement: "",
    footerNote: "Official Rivet Hardware merchandise.",
  },
  sections: [
    {
      type: "HeroSection",
      props: {
        eyebrow: "Rivet Hardware",
        headline: "The Rivet crew tee",
        body: "The black tee our trade counter team wears, with the Rivet logo on the front. Sizes S to 2XL.",
        ctaLabel: "Shop now",
      },
    },
    {
      type: "ProductGrid",
      props: { title: "Shop", subtitle: "Ships within 5 business days with FedEx tracking." },
    },
  ],
  products: {
    "rivet-crew-tee": {
      name: "Rivet Crew Tee",
      description:
        "The black crew neck tee worn at the Rivet trade counter, with the Rivet logo printed on the front. Unisex fit, true to size from S to 2XL.\n\nMaterial: 100% ring-spun cotton\nWeight: 180 gsm\nCare: Machine wash cold, inside out",
      tags: ["t-shirts"],
      textLabel: "Name on the sleeve",
    },
  },
  gifts: {},
};

export const STORE_CONTENT = [NORTHWIND, LUMEN, FERRO, RIVET];

/** The content of one store, by id. */
export function storeContent(storeId) {
  return STORE_CONTENT.find((s) => s.storeId === storeId) ?? null;
}

/** A product's content by slug, or null. */
export function productContent(slug) {
  for (const store of STORE_CONTENT) if (store.products[slug]) return store.products[slug];
  return null;
}

/** A gift portal's content by slug, or null. */
export function giftContent(slug) {
  for (const store of STORE_CONTENT) if (store.gifts[slug]) return store.gifts[slug];
  return null;
}

/**
 * A page tree with the store's copy written in: the site fields on the root,
 * and each section's copy matched by type and position (the second hero takes
 * the second hero's copy). When a page has fewer sections of a type than there
 * is copy for, `optional` copy is left out first. Layout props such as images,
 * links and tones are kept. Returns a new tree and the section ids no copy was found for.
 */
export function withStoreContent(tree, content) {
  const next = structuredClone(tree);
  const root = next.ROOT;
  const { i18n: siteI18n, ...site } = content.site;
  root.props = { ...root.props, ...site, i18n: storedTranslations(siteI18n) };

  const count = {};
  for (const nodeId of root.nodes ?? []) {
    const type = next[nodeId]?.type?.resolvedName;
    count[type] = (count[type] ?? 0) + 1;
  }
  const copyFor = (type) => {
    const all = content.sections.filter((s) => s.type === type);
    let spare = all.length - (count[type] ?? 0);
    return all.filter((s) => !(s.optional && spare-- > 0));
  };

  const seen = {};
  const unmatched = [];
  for (const nodeId of root.nodes ?? []) {
    const node = next[nodeId];
    const type = node?.type?.resolvedName;
    const index = (seen[type] = (seen[type] ?? -1) + 1);
    const section = copyFor(type)[index];
    if (!section) {
      unmatched.push(nodeId);
      continue;
    }
    node.props = { ...node.props, ...section.props, i18n: storedTranslations(section.i18n) };
  }
  return { tree: next, unmatched };
}

/** The product fields this file owns, in the shape stored on `store_products`. */
export function productFieldsFor(product) {
  return {
    name: product.name,
    description: product.description,
    tags: product.tags,
    textLabel: product.textLabel,
    translations: storedTranslations(product.i18n),
  };
}
