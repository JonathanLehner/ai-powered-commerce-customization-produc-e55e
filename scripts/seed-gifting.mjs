/**
 * Seeds the corporate gifting demo: a private gift catalogue for Northwind, a
 * campaign already paid for (with one order per recipient, including an
 * exception to work) and a second campaign sitting with its approver.
 *
 * It reads the store and its published products back out of the database rather
 * than hard-coding ids, so it can be run after `scripts/seed.mjs` or against a
 * database that is already live. It is additive and idempotent: a catalogue with
 * the same slug means there is nothing to do.
 *
 * Run: node --env-file=.env.local scripts/seed-gifting.mjs
 */

const BASE = "https://www.clawcorp.ai/api/platform";

async function call(body, key) {
  for (let attempt = 1; attempt <= 4; attempt++) {
    const res = await fetch(`${BASE}/db`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) return (await res.json()).result;
    if (attempt === 4) throw new Error(`${body.action} ${body.collection}: ${res.status} ${await res.text()}`);
    await new Promise((r) => setTimeout(r, 800 * attempt));
  }
}

let counter = 0;
function id(prefix) {
  counter += 1;
  return `${prefix}_${counter.toString(36).padStart(3, "0")}${Math.random().toString(36).slice(2, 8)}`;
}

const DAY = 86400000;
const iso = (daysAgo, hours = 11) =>
  new Date(Date.now() - daysAgo * DAY + hours * 3600000 - 11 * 3600000).toISOString();

const CATALOGUE_SLUG = "northwind-technologies-employee-gifting";
const TAX_RATE = 8.25;

/** One recipient of a gift, before it is priced. */
const ORDERED_LIST = [
  { name: "Priya Raman", email: "priya@northwind.example", line1: "900 Market Street", city: "San Francisco", postalCode: "94103", country: "US", size: "M", note: "Welcome to the team!", product: "tee", state: "delivered" },
  { name: "Tom Beckett", email: "tom@northwind.example", line1: "14 Bridge Street", city: "Leeds", postalCode: "LS1 4AP", country: "GB", size: "L", note: "", product: "tee", state: "delivered" },
  { name: "Ana Ferreira", email: "ana@northwind.example", line1: "Rua Augusta 44", city: "Lisbon", postalCode: "1100-053", country: "PT", size: "S", note: "Great first quarter.", product: "hoodie", state: "shipped" },
  { name: "Jonas Weber", email: "jonas@northwind.example", line1: "Torstraße 71", city: "Berlin", postalCode: "10119", country: "DE", size: "XL", note: "", product: "hoodie", state: "shipped" },
  { name: "Ruth Adeyemi", email: "ruth@northwind.example", line1: "8 Long Street", city: "Cape Town", postalCode: "8001", country: "ZA", size: "M", note: "Thank you for the Lagos launch.", product: "tee", state: "exception" },
  { name: "Kenji Sato", email: "kenji@northwind.example", line1: "2-11-3 Meguro", city: "Tokyo", postalCode: "153-0063", country: "JP", size: "", note: "", product: "mug", state: "in_production" },
];

const PENDING_LIST = [
  { name: "Dana Whitfield", email: "dana@northwind.example", line1: "1 Sovereign Square", city: "Leeds", postalCode: "LS1 4DA", country: "GB", size: "M", note: "Season's greetings from all of us.", product: "mug" },
  { name: "Marcus Hale", email: "marcus@harlow.example", line1: "52 Charlotte Road", city: "London", postalCode: "EC2A 3PE", country: "GB", size: "L", note: "", product: "tee" },
  { name: "Sofia Marchetti", email: "sofia@harlow.example", line1: "Via Tortona 27", city: "Milan", postalCode: "20144", country: "IT", size: "S", note: "", product: "tee" },
  { name: "Owen Blake", email: "owen@harlow.example", line1: "77 Water Street", city: "New York", postalCode: "10004", country: "US", size: "", note: "", product: "mug" },
];

function pickVariant(product, size) {
  const enabled = product.variants.filter((v) => v.enabled && v.availability !== "out_of_stock");
  if (!size) return enabled[0];
  return enabled.find((v) => v.size.toLowerCase() === size.toLowerCase()) ?? enabled[0];
}

function priceRecipient(entry, product) {
  const variant = pickVariant(product, entry.size);
  const quantity = 1;
  const goods = variant.price * quantity;
  const shipping = product.name.toLowerCase().includes("mug") ? 690 : 590;
  const taxAmount = Math.round(((goods + shipping) * TAX_RATE) / 100);
  return {
    // Where the resulting order got to, for the campaign that is already paid.
    state: entry.state,
    recipient: {
      id: id("rcp"),
      name: entry.name,
      email: entry.email,
      line1: entry.line1,
      city: entry.city,
      postalCode: entry.postalCode,
      country: entry.country,
      size: variant.size,
      note: entry.note,
      storeProductId: product.id,
      productName: product.name,
      variantId: variant.id,
      variantName: variant.name,
      quantity,
      unitPrice: variant.price,
      orderId: null,
      orderCode: null,
    },
    variant,
    product,
    goods,
    shipping,
    taxAmount,
    total: goods + shipping + taxAmount,
  };
}

function totalsOf(lines) {
  const taxAmount = lines.reduce((sum, line) => sum + line.taxAmount, 0);
  return {
    subtotal: lines.reduce((sum, line) => sum + line.goods, 0),
    shipping: lines.reduce((sum, line) => sum + line.shipping, 0),
    taxAmount,
    taxLines: [{ rate: TAX_RATE, amount: taxAmount }],
    total: lines.reduce((sum, line) => sum + line.total, 0),
  };
}

function orderCode() {
  return `ORD-${Math.floor(10000000 + Math.random() * 89999999)}`;
}

export async function seedGifting(key) {
  const stores = await call({ collection: "stores", action: "find", filter: { slug: "northwind-supply" } }, key);
  const store = stores?.[0];
  if (!store) {
    console.log("gifting seed skipped — the Northwind demo store is not in this database");
    return;
  }

  const existing = await call(
    { collection: "gift_catalogues", action: "findOne", filter: { slug: CATALOGUE_SLUG } },
    key,
  );
  if (existing) {
    console.log("gifting seed skipped — the demo catalogue already exists");
    return;
  }

  const products = await call(
    { collection: "store_products", action: "find", filter: { storeId: store.id, status: "published" } },
    key,
  );
  const byKind = {
    tee: products.find((p) => /tee/i.test(p.name)),
    hoodie: products.find((p) => /hoodie/i.test(p.name)),
    mug: products.find((p) => /mug/i.test(p.name)),
  };
  const offered = Object.values(byKind).filter(Boolean);
  if (offered.length === 0) {
    console.log("gifting seed skipped — the Northwind store has no published products");
    return;
  }
  const suppliers = await call({ collection: "suppliers", action: "find", filter: {} }, key);
  const supplierName = (supplierId) => suppliers.find((s) => s.id === supplierId)?.name ?? "the supplier";

  const catalogue = {
    id: id("gft"),
    storeId: store.id,
    name: "Northwind employee gifting",
    slug: CATALOGUE_SLUG,
    companyName: "Northwind Technologies",
    intro:
      "Gifts for new starters, long-service milestones and client thank-yous. Orders close on the 20th of each month; anything over the limit needs Dana's sign-off in writing first.",
    status: "active",
    access: "invite",
    accessSecret: id("sec"),
    invitedEmails: ["dana@northwind.example", "people@northwind.example"],
    productIds: offered.map((p) => p.id),
    spendLimitPerRecipient: 7500,
    currency: store.defaultCurrency,
    approvalRequired: true,
    approverName: "Dana Whitfield",
    approverEmail: "dana@northwind.example",
    createdBy: "Alex Moreau",
    createdAt: iso(34),
    updatedAt: iso(9),
  };

  /* ------------------------------------------------- the campaign already paid */

  const orderedLines = ORDERED_LIST.map((entry) =>
    priceRecipient(entry, byKind[entry.product] ?? offered[0]),
  );
  const orderedTotals = totalsOf(orderedLines);
  const paidAt = iso(12);
  const campaignId = id("cmp");
  const orders = orderedLines.map((line) => {
    const product = line.product;
    const supplier = supplierName(product.supplierId);
    const heldForRegion = line.recipient.country === "ZA";
    const code = orderCode();
    const events = [
      {
        at: paidAt,
        status: "Payment captured",
        note: `Part of gift campaign CMP-40118 — one payment covered all ${orderedLines.length} recipients.`,
        actor: "Stripe",
      },
    ];
    if (line.recipient.note) {
      events.push({ at: paidAt, status: "Gift message", note: line.recipient.note, actor: "Rowan Ellis" });
    }
    events.push(
      heldForRegion
        ? {
            at: paidAt,
            status: "Manual handling required",
            note: `${supplier} does not fulfil to South Africa (Africa). Route this job to an alternative production partner.`,
            actor: "Parcelith routing",
          }
        : {
            at: paidAt,
            status: "Sent to supplier",
            note: `Production job accepted by ${supplier}.`,
            actor: "Parcelith routing",
          },
    );
    if (line.state === "shipped" || line.state === "delivered") {
      events.push({
        at: iso(6),
        status: "Shipped",
        note: "Handed to DHL Express.",
        actor: "Inés Duarte",
      });
    }
    if (line.state === "delivered") {
      events.push({ at: iso(3), status: "delivered", note: "Delivered to the recipient.", actor: "Inés Duarte" });
    }

    const tracking =
      line.state === "shipped" || line.state === "delivered"
        ? `JD${Math.floor(100000000 + Math.random() * 899999999)}`
        : null;

    return {
      id: id("ord"),
      storeId: store.id,
      code,
      status: heldForRegion ? "exception" : line.state,
      currency: store.defaultCurrency,
      customer: {
        name: line.recipient.name,
        email: line.recipient.email,
        line1: line.recipient.line1,
        city: line.recipient.city,
        postalCode: line.recipient.postalCode,
        country: line.recipient.country,
      },
      items: [
        {
          id: id("oit"),
          storeProductId: product.id,
          variantId: line.variant.id,
          productName: product.name,
          variantName: line.variant.name,
          quantity: line.recipient.quantity,
          unitPrice: line.recipient.unitPrice,
          supplierCost: line.variant.baseCost ?? 0,
          customization: {
            artworkUrl: null,
            artworkFileName: null,
            text: null,
            previewUrl: product.mockups?.[0]?.url ?? null,
          },
          supplierId: product.supplierId,
        },
      ],
      subtotal: line.goods,
      shipping: line.shipping,
      taxAmount: line.taxAmount,
      taxRate: TAX_RATE,
      taxLines: [{ rate: TAX_RATE, amount: line.taxAmount }],
      total: line.total,
      payment: {
        provider: "stripe",
        status: "succeeded",
        paymentIntentId: "pi_3giftcmp40118",
        stripeAccountId: store.stripe.accountId,
        last4: "4242",
        failureMessage: null,
        paidAt,
      },
      fulfillment: {
        supplierId: product.supplierId,
        supplierName: supplier,
        routing: heldForRegion ? "manual_required" : "submitted",
        supplierOrderRef: heldForRegion ? null : `${supplier.slice(0, 3).toUpperCase()}-${code.replace("ORD-", "")}`,
        submittedAt: heldForRegion ? null : paidAt,
        submissionMessage: heldForRegion
          ? `${supplier} does not fulfil to South Africa (Africa).`
          : `Production job accepted by ${supplier}.`,
        carrier: tracking ? "dhl" : null,
        trackingNumber: tracking,
        trackingUrl: tracking
          ? `https://www.dhl.com/global-en/home/tracking/tracking-express.html?submit=1&tracking-id=${tracking}`
          : null,
        exception: heldForRegion
          ? `Destination Cape Town (ZA · Africa) is outside ${supplier}'s fulfilment regions.`
          : null,
      },
      refunds: [],
      events,
      campaign: {
        campaignId,
        campaignCode: "CMP-40118",
        campaignName: "Q3 new starter kits",
        catalogueId: catalogue.id,
        recipientId: line.recipient.id,
      },
      idempotencyKey: `gift_${campaignId}:${orderedLines.indexOf(line)}`,
      createdAt: paidAt,
      updatedAt: iso(3),
    };
  });

  const orderedCampaign = {
    id: campaignId,
    storeId: store.id,
    catalogueId: catalogue.id,
    code: "CMP-40118",
    name: "Q3 new starter kits",
    status: "ordered",
    currency: store.defaultCurrency,
    buyer: { name: "Rowan Ellis", email: "people@northwind.example" },
    recipients: orderedLines.map((line, index) => ({
      ...line.recipient,
      orderId: orders[index].id,
      orderCode: orders[index].code,
    })),
    spendLimitPerRecipient: catalogue.spendLimitPerRecipient,
    totals: orderedTotals,
    approval: {
      required: true,
      approverName: "Dana Whitfield",
      approverEmail: "dana@northwind.example",
      decidedBy: "Dana Whitfield",
      decidedAt: iso(13),
      note: "Approved against the people budget.",
    },
    payment: { status: "succeeded", paymentIntentId: "pi_3giftcmp40118", last4: "4242", paidAt },
    events: [
      {
        at: iso(14),
        status: "Campaign created",
        note: `${ORDERED_LIST.length} recipients across five countries.`,
        actor: "Rowan Ellis",
      },
      { at: iso(14), status: "Sent for approval", note: "Waiting on Dana Whitfield.", actor: "Rowan Ellis" },
      { at: iso(13), status: "Approved", note: "Approved against the people budget.", actor: "Dana Whitfield" },
      { at: paidAt, status: "Paid", note: "Charged via Stripe in one payment.", actor: "Rowan Ellis" },
      {
        at: paidAt,
        status: "Orders created",
        note: `${orders.length} orders raised, 1 held for manual routing.`,
        actor: "Parcelith routing",
      },
    ],
    idempotencyKey: `gift_${campaignId}`,
    createdAt: iso(14),
    updatedAt: iso(3),
  };

  /* ---------------------------------------------- the campaign being approved */

  const pendingLines = PENDING_LIST.map((entry) =>
    priceRecipient(entry, byKind[entry.product] ?? offered[0]),
  );
  const pendingCampaign = {
    id: id("cmp"),
    storeId: store.id,
    catalogueId: catalogue.id,
    code: "CMP-51740",
    name: "December client thank-yous",
    status: "awaiting_approval",
    currency: store.defaultCurrency,
    buyer: { name: "Rowan Ellis", email: "people@northwind.example" },
    recipients: pendingLines.map((line) => line.recipient),
    spendLimitPerRecipient: catalogue.spendLimitPerRecipient,
    totals: totalsOf(pendingLines),
    approval: {
      required: true,
      approverName: "Dana Whitfield",
      approverEmail: "dana@northwind.example",
      decidedBy: null,
      decidedAt: null,
      note: null,
    },
    payment: { status: "unpaid", paymentIntentId: null, last4: null, paidAt: null },
    events: [
      {
        at: iso(2),
        status: "Campaign created",
        note: `${PENDING_LIST.length} recipients, gifts for the accounts team's key contacts.`,
        actor: "Rowan Ellis",
      },
      { at: iso(2), status: "Sent for approval", note: "Waiting on Dana Whitfield.", actor: "Rowan Ellis" },
    ],
    idempotencyKey: null,
    createdAt: iso(2),
    updatedAt: iso(2),
  };

  const audit = [
    {
      id: id("aud"),
      category: "gifting",
      action: "gifting.catalogue_created",
      summary: "Created gift catalogue “Northwind employee gifting” for Northwind Technologies",
      storeId: store.id,
      agencyId: store.agencyId,
      actorId: "usr_alex",
      actorName: "Alex Moreau",
      entity: "gift_catalogue",
      entityId: catalogue.id,
      meta: { access: "invite", spendLimit: catalogue.spendLimitPerRecipient },
      at: iso(34),
    },
    {
      id: id("aud"),
      category: "gifting",
      action: "gifting.campaign_ordered",
      summary: `Gift campaign CMP-40118 paid — ${orders.length} orders raised, 1 awaiting manual routing`,
      storeId: store.id,
      agencyId: store.agencyId,
      actorId: "gifting",
      actorName: "Rowan Ellis",
      entity: "gift_campaign",
      entityId: "CMP-40118",
      meta: { orders: orders.length, total: orderedTotals.total, currency: store.defaultCurrency, held: 1 },
      at: paidAt,
    },
    {
      id: id("aud"),
      category: "gifting",
      action: "gifting.campaign_created",
      summary: "Rowan Ellis submitted gift campaign CMP-51740 “December client thank-yous” — 4 recipients",
      storeId: store.id,
      agencyId: store.agencyId,
      actorId: "gifting",
      actorName: "Rowan Ellis",
      entity: "gift_campaign",
      entityId: "CMP-51740",
      meta: { recipients: PENDING_LIST.length, total: pendingCampaign.totals.total, currency: store.defaultCurrency },
      at: iso(2),
    },
  ];

  await call({ collection: "gift_catalogues", action: "insertOne", document: catalogue }, key);
  await call(
    { collection: "gift_campaigns", action: "insertMany", documents: [orderedCampaign, pendingCampaign] },
    key,
  );
  await call({ collection: "orders", action: "insertMany", documents: orders }, key);
  await call({ collection: "audit_logs", action: "insertMany", documents: audit }, key);

  console.log(
    `gifting seed done — 1 catalogue, 2 campaigns, ${orders.length} gift orders on ${store.name}`,
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const key = process.env.CLAWCORP_API_KEY;
  if (!key) {
    console.error("CLAWCORP_API_KEY missing");
    process.exit(1);
  }
  await seedGifting(key);
}
